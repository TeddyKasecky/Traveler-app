/**
 * Vyřízne Evropu z planetárního podkladu Protomaps a uloží ji do vlastního
 * balíku, který si aplikace stáhne do telefonu. Při té příležitosti z dlaždic
 * vytáhne i města a rozmístění kreseb lesů.
 *
 *   node scripts/make-mapa.mjs            # jen změří, nic nezapíše
 *   node scripts/make-mapa.mjs --zapis    # opravdu vyrobí balík a data
 *
 * PROČ TO VŮBEC JE: malovaná offline mapa stála na Natural Earth, kde není
 * žádný pokryv krajiny – žádné lesy, louky ani pole. Protomaps staví podklad
 * z OpenStreetMap a vrstvu `landcover` má. Planeta má ale 137 GB, takže se
 * z ní bere jen Evropa a jen do přiblížení, ve kterém malovaná mapa žije.
 *
 * PROČ VLASTNÍ BALÍK, A NE PMTILES: číst PMTiles umí hotová knihovna, ale
 * zapisovat je ne – musel bych psát Hilbertovo řazení, varinty a adresáře
 * jen proto, abych to na druhé straně zase rozebral. Balík níž je formát,
 * který se dá napsat i přečíst na dvacet řádků a umí totéž, co odsud
 * potřebujeme: najít dlaždici a neuložit dvakrát tu samou.
 *
 *   [0..3]   'VBM2'                    kdo to je
 *   [4..7]   délka rejstříku (uint32)  kolik bajtů má JSON hned za hlavičkou
 *   [8..]    rejstřík (JSON, gzip)     { zoomMax, meze, dlazdice: {"z/x/y":[pozice,delka]} }
 *   pak      těla dlaždic za sebou     každé je MVT zabalený gzipem
 *
 * ZNAČKA JE `VBM2`, NE `VBM1`: obsah dlaždic se od srpna 2026 filtruje (viz
 * níž) a starý balík by kreslil mapu, která se s aplikací rozešla. Aplikace
 * `VBM1` odmítne a Nastavení nabídne stažení znovu – to je lepší než tiše
 * spadnout na obrysy a nechat člověka hádat proč.
 *
 * KAŽDÁ DLAŽDICE SE OŘEŽE O VRSTVY, KTERÉ STYL NEKRESLÍ. Změřeno na hotovém
 * balíku: z 13,7 MB dlaždic připadalo 48,6 % na `landuse`, 16,2 % na `places`
 * a 0,2 % na `pois` – tedy dvě třetiny balíku byly bajty, které se nikdy
 * nedostaly na obrazovku. Vrstvy se vyhazují na úrovni protokolu, aniž by se
 * dekódovaly, takže zbytek dlaždice zůstává bajt po bajtu stejný.
 *
 * Každá dlaždice se balí zvlášť, ne celý soubor naráz. Změřeno: vyjde to
 * nastejno, ale takhle se ušetří i **v telefonu** – kdyby se balil celý
 * soubor, po stažení by se zase rozbalil. Rozbalení jedné dlaždice při
 * kreslení je práce na jednotky milisekund.
 *
 * Stejná dlaždice se ukládá jen jednou – Evropa má spoustu čtverců čistého
 * moře a ty jsou bajt po bajtu totožné.
 *
 * Licence: data jsou z OpenStreetMap přes Protomaps, tedy ODbL. Aplikace
 * OpenStreetMap uvádí už u online dlaždic, u stažené mapy to musí být taky.
 */

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { PMTiles, FetchSource } from 'pmtiles'
import { filtrujVrstvy, vrstva, naGeo, uvnitr } from './mvt.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CIL = path.join(ROOT, 'public', 'mapa-evropa.vbm')
const DATA = path.join(ROOT, 'src', 'data')

/** Kde se berou denní sestavení planety. */
const SEZNAM = 'https://build-metadata.protomaps.dev/builds.json'
const BUILDY = 'https://build.protomaps.com'

/**
 * Evropa i s kusem okolí. Stejný obdélník, jaký používá `make-basemap.mjs`,
 * ať spolu obě mapy sedí.
 */
const MEZE = { minLat: 33, maxLat: 72, minLon: -26, maxLon: 46 }

/**
 * Do kterého přiblížení se bere.
 *
 * Malovaná mapa se kreslí zhruba mezi 4 a 8; vektorové dlaždice se dají
 * roztáhnout i nad svoje maximum, takže šestka obslouží i sedmičku a osmičku.
 * Každý další stupeň velikost zhruba zečtyřnásobí – proto je to konstanta
 * nahoře a ne někde v kódu.
 */
const ZOOM_MAX = Number(process.env.ZOOM_MAX || 6)

/** Kolik dlaždic se tahá naráz. Víc = rychleji, ale server to nemá rád. */
const NARAZ = 24

/** Vrstvy, které styl v `src/map/vektory.js` opravdu kreslí. Zbytek letí ven. */
const NECHAT = new Set(['earth', 'landcover', 'water', 'roads', 'boundaries'])

const zapisovat = process.argv.includes('--zapis')

/* ================= dlaždice a meze ================= */

/** Číslo dlaždice ve směru x pro daný poledník. */
const naX = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z)

/** Číslo dlaždice ve směru y pro danou rovnoběžku (Mercator). */
function naY(lat, z) {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

/** Všechny dlaždice, které Evropa protíná, od nuly do ZOOM_MAX. */
function seznamDlazdic() {
  const out = []
  for (let z = 0; z <= ZOOM_MAX; z++) {
    const x0 = naX(MEZE.minLon, z)
    const x1 = naX(MEZE.maxLon, z)
    // Y roste na jih, takže horní mez patří severní hranici.
    const y0 = naY(MEZE.maxLat, z)
    const y1 = naY(MEZE.minLat, z)
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) out.push([z, x, y])
    }
  }
  return out
}

/** Stabilní hash řetězce → 0..1. Stejný vstup, stejné rozmístění. */
function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

/* ================= města ================= */

/**
 * Sídla z vrstvy `places`.
 *
 * Bere se `name:cs`, když je – Protomaps nese překlady, takže Vídeň je Vídeň
 * a ne Wien. `min_zoom` říká, od jakého přiblížení se má jméno ukázat; je to
 * hotová práce kartografa a nemá cenu ji dělat znovu.
 *
 * Země (`kind: 'country'`) se přeskakují: názvy zemí kreslí `src/data/staty.js`
 * vlastním písmem a na vlastních místech.
 */
function mestaZDlazdice(mvt, z, x, y, sber) {
  const v = vrstva(mvt, 'places')
  if (!v) return
  for (const p of v.prvky) {
    const o = p.vlastnosti
    if (o.kind !== 'locality' || !p.kusy.length) continue
    const jmeno = o['name:cs'] || o.name
    if (!jmeno) continue
    const [lat, lon] = naGeo(p.kusy[0][0][0], p.kusy[0][0][1], z, x, y, v.extent)
    if (lat < MEZE.minLat || lat > MEZE.maxLat || lon < MEZE.minLon || lon > MEZE.maxLon) continue
    // Klíč podle jména a hrubé polohy: totéž město je i v sousední dlaždici.
    const klic = `${jmeno}|${lat.toFixed(1)}|${lon.toFixed(1)}`
    const stary = sber.get(klic)
    const zaznam = {
      lat: +lat.toFixed(4),
      lon: +lon.toFixed(4),
      n: jmeno,
      z: o.min_zoom ?? 7,
      r: o.population_rank ?? 0,
    }
    // Vyhrává záznam z menšího přiblížení – je přesnější a má nižší min_zoom.
    if (!stary || zaznam.z < stary.z) sber.set(klic, zaznam)
  }
}

/* ================= kresby lesů ================= */

/**
 * Rozteč sítě, do které se sypou stromy, v dlaždicových jednotkách.
 *
 * Dlaždice má 4096 jednotek a na zoomu 6 je široká zhruba 600 km, takže
 * 140 jednotek ≈ 20 km. Je to schválně v jednotkách dlaždice, ne v kilometrech:
 * mapa je v Mercatoru, takže konstantní rozteč v jednotkách znamená konstantní
 * hustotu **na obrazovce** – a o vzhled tady jde, ne o hektary.
 */
const ROZTEC = 140

/**
 * Nasype kresby stromů do skutečných lesů z vrstvy `landcover`.
 *
 * Lesů je v dlaždici jeden prvek s desítkami prstenců, takže „jeden strom na
 * polygon“ by nedal nic. Sype se proto síť bodů a nechají se ty, které padnou
 * dovnitř – dírami (mýtinami) se prochází sudým počtem průsečíků, takže se
 * řeší samy.
 *
 * Jehličnany na sever a do výšek, listnáče na jih: podle šířky, protože pokryv
 * krajiny druh stromu nenese. Není to botanika, je to kresba.
 */
function lesyZDlazdice(mvt, z, x, y, out) {
  const v = vrstva(mvt, 'landcover')
  if (!v) return
  const les = v.prvky.find((p) => p.vlastnosti.kind === 'forest')
  if (!les) return

  // Obdélníkové obaly prstenců – bez nich by každý bod zkoušel všech ~2000
  // vrcholů a skript by běžel v minutách místo v sekundách.
  const obaly = les.kusy.map((r) => {
    let a = Infinity
    let b = -Infinity
    let c = Infinity
    let d = -Infinity
    for (const [px, py] of r) {
      if (px < a) a = px
      if (px > b) b = px
      if (py < c) c = py
      if (py > d) d = py
    }
    return { a, b, c, d }
  })

  for (let px = ROZTEC / 2; px < v.extent; px += ROZTEC) {
    for (let py = ROZTEC / 2; py < v.extent; py += ROZTEC) {
      const klic = `${z}/${x}/${y}/${px}/${py}`
      // Rozházení uvnitř oka sítě, ať to není mřížka.
      const jx = px + (hash(klic + 'x') - 0.5) * ROZTEC * 0.8
      const jy = py + (hash(klic + 'y') - 0.5) * ROZTEC * 0.8

      let je = false
      for (let i = 0; i < les.kusy.length; i++) {
        const o = obaly[i]
        if (jx < o.a || jx > o.b || jy < o.c || jy > o.d) continue
        if (uvnitr(jx, jy, les.kusy[i])) je = !je
      }
      if (!je) continue

      const [lat, lon] = naGeo(jx, jy, z, x, y, v.extent)
      if (lat < MEZE.minLat || lat > MEZE.maxLat || lon < MEZE.minLon || lon > MEZE.maxLon) continue

      // Nad 55° severní šířky převládají jehličnany, na jihu listnáče.
      // Mezi tím se to plynule překlápí, ať nevznikne vodorovná hranice.
      const jehlicnaty = hash(klic + 'd') < Math.min(0.92, Math.max(0.12, (lat - 40) / 20))
      // Tři desetinná místa ≈ 110 m. Kresba lesa přesnější polohu nepotřebuje
      // a čtvrté místo by soubor zvětšilo o pětinu pro nic.
      out.push([+lat.toFixed(3), +lon.toFixed(3), jehlicnaty ? 1 : 0, +hash(klic + 'v').toFixed(2)])
    }
  }
}

/* ================= sestavení ================= */

/** Jméno nejnovějšího sestavení planety. */
async function nejnovejsiBuild() {
  const r = await fetch(SEZNAM)
  if (!r.ok) throw new Error(`seznam sestavení: HTTP ${r.status}`)
  const j = await r.json()
  const posledni = j[j.length - 1]
  return posledni.key
}

const kb = (n) => `${(n / 1024).toFixed(0)} kB`
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`

const build = await nejnovejsiBuild()
console.log(`Planeta: ${build}`)
console.log(`Výřez:   ${MEZE.minLat}–${MEZE.maxLat}° s. š., ${MEZE.minLon}–${MEZE.maxLon}° d.`)
console.log(`Zoom:    0–${ZOOM_MAX}`)
console.log(`Vrstvy:  ${[...NECHAT].join(', ')}\n`)

const archiv = new PMTiles(new FetchSource(`${BUILDY}/${build}`))
const hlavicka = await archiv.getHeader()
console.log(`Hlavička planety: zoom ${hlavicka.minZoom}–${hlavicka.maxZoom}, typ dlaždic ${hlavicka.tileType}\n`)

const dlazdice = seznamDlazdic()
console.log(`Dlaždic k projití: ${dlazdice.length.toLocaleString('cs-CZ')}`)

/** otisk těla → pozice v balíku, ať se stejná dlaždice neukládá dvakrát */
const podleOtisku = new Map()
/** "z/x/y" → [pozice, délka] */
const rejstrik = {}
const tela = []
let pozice = 0
let stazeno = 0
let poFiltru = 0
let prazdnych = 0
let usetreno = 0

/** klíč → záznam města */
const mesta = new Map()
/** [lat, lon, druh, velikost] */
const lesy = []

let hotovo = 0
for (let i = 0; i < dlazdice.length; i += NARAZ) {
  const davka = dlazdice.slice(i, i + NARAZ)
  const vysledky = await Promise.all(
    davka.map(async ([z, x, y]) => {
      const t = await archiv.getZxy(z, x, y)
      return [z, x, y, t && t.data ? Buffer.from(t.data) : null]
    })
  )

  for (const [z, x, y, syrove] of vysledky) {
    if (!syrove || !syrove.length) {
      prazdnych++
      continue
    }
    stazeno += syrove.length

    // Města a lesy se berou z nejpodrobnějšího přiblížení, které máme.
    // Nižší zoomy nesou totéž jen zhruba, takže by to jen přidávalo duplicity.
    if (z === ZOOM_MAX) {
      mestaZDlazdice(syrove, z, x, y, mesta)
      lesyZDlazdice(syrove, z, x, y, lesy)
    }

    const orezane = filtrujVrstvy(syrove, NECHAT)
    poFiltru += orezane.length
    // Knihovna `pmtiles` vrací MVT už rozbalený, takže se balí až tady.
    const telo = zlib.gzipSync(orezane, { level: 9 })
    const otisk = crypto.createHash('sha1').update(telo).digest('hex')
    const kde = podleOtisku.get(otisk)
    if (kde) {
      rejstrik[`${z}/${x}/${y}`] = kde
      usetreno += telo.length
      continue
    }
    const zaznam = [pozice, telo.length]
    podleOtisku.set(otisk, zaznam)
    rejstrik[`${z}/${x}/${y}`] = zaznam
    tela.push(telo)
    pozice += telo.length
  }

  hotovo += davka.length
  if (hotovo % 240 === 0 || hotovo === dlazdice.length) {
    process.stdout.write(`\r  ${hotovo}/${dlazdice.length}  staženo ${mb(stazeno)}, v balíku ${mb(pozice)}   `)
  }
}
console.log('\n')

/* ================= zápis ================= */

const hlava = {
  _o: 'Malovaná mapa Evropy pro Vandrbuch. Dlaždice MVT z Protomaps (OpenStreetMap, ODbL).',
  build,
  zoomMax: ZOOM_MAX,
  meze: MEZE,
  vrstvy: [...NECHAT],
  dlazdice: rejstrik,
}
const rejstrikBin = zlib.gzipSync(Buffer.from(JSON.stringify(hlava), 'utf8'), { level: 9 })

const hlavickaBin = Buffer.alloc(8)
hlavickaBin.write('VBM2', 0, 'ascii')
hlavickaBin.writeUInt32LE(rejstrikBin.length, 4)

const balik = Buffer.concat([hlavickaBin, rejstrikBin, ...tela])

// Města od nejdůležitějšího: kdyby se seznam někdy krátil, ať se krátí zezadu.
const mestaVen = [...mesta.values()]
  .sort((a, b) => a.z - b.z || b.r - a.r)
  .map((m) => [m.lat, m.lon, m.n, m.z, m.r])

console.log('Hotovo:')
console.log(`  dlaždic v rejstříku   ${Object.keys(rejstrik).length.toLocaleString('cs-CZ')}`)
console.log(`  z toho prázdných      ${prazdnych.toLocaleString('cs-CZ')} (moře a mimo pevninu)`)
console.log(`  jedinečných těl       ${tela.length.toLocaleString('cs-CZ')}`)
console.log(`  staženo MVT           ${mb(stazeno)}`)
console.log(`  po ořezu vrstev       ${mb(poFiltru)}  (${((poFiltru / stazeno) * 100).toFixed(0)} % původku)`)
console.log(`  ušetřeno opakováním   ${mb(usetreno)}`)
console.log(`  rejstřík              ${kb(rejstrikBin.length)}`)
console.log(`  CELKEM BALÍK          ${mb(balik.length)}`)
console.log(`  měst                  ${mestaVen.length.toLocaleString('cs-CZ')}`)
console.log(`  kreseb lesů           ${lesy.length.toLocaleString('cs-CZ')}`)

if (!zapisovat) {
  console.log('\n  (jen měření – spusť s --zapis, ať se to opravdu uloží)')
  process.exit(0)
}

fs.mkdirSync(path.dirname(CIL), { recursive: true })
fs.writeFileSync(CIL, balik)
console.log(`\n  → ${path.relative(ROOT, CIL)}`)

const mestaSoubor = path.join(DATA, 'mesta.json')
fs.writeFileSync(
  mestaSoubor,
  JSON.stringify({ _o: 'generuje scripts/make-mapa.mjs z vrstvy places (OpenStreetMap, ODbL)', mesta: mestaVen }) + '\n',
  'utf8'
)
console.log(`  → ${path.relative(ROOT, mestaSoubor)}  ${kb(fs.statSync(mestaSoubor).size)}`)

const lesySoubor = path.join(DATA, 'kresby-lesy.json')
fs.writeFileSync(
  lesySoubor,
  JSON.stringify({
    _o: 'generuje scripts/make-mapa.mjs z vrstvy landcover; [lat, lon, jehličnatý 0/1, velikost]',
    body: lesy,
  }) + '\n',
  'utf8'
)
console.log(`  → ${path.relative(ROOT, lesySoubor)}  ${kb(fs.statSync(lesySoubor).size)}`)
