/**
 * Vyřízne Evropu z planetárního podkladu Protomaps a uloží ji do vlastního
 * balíku, který si aplikace stáhne do telefonu.
 *
 *   node scripts/make-mapa.mjs            # jen změří, nic nezapíše
 *   node scripts/make-mapa.mjs --zapis    # opravdu vyrobí balík
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
 *   [0..3]   'VBM1'                    kdo to je
 *   [4..7]   délka rejstříku (uint32)  kolik bajtů má JSON hned za hlavičkou
 *   [8..]    rejstřík (JSON, gzip)     { zoom, meze, dlazdice: {"z/x/y":[pozice,delka]} }
 *   pak      těla dlaždic za sebou     každé je MVT zabalený gzipem
 *
 * Každá dlaždice se balí zvlášť, ne celý soubor naráz. Změřeno: vyjde to
 * nastejno (9,7 proti 9,6 MB), ale takhle se ušetří i **v telefonu** – kdyby
 * se balil celý soubor, po stažení by se zase rozbalil na 13,7 MB. Rozbalení
 * jedné dlaždice při kreslení je práce na jednotky milisekund.
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CIL = path.join(ROOT, 'public', 'mapa-evropa.vbm')

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
 * roztáhnout i nad svoje maximum, takže sedmička obslouží i osmičku.
 * Každý další stupeň velikost zhruba zečtyřnásobí – proto je to konstanta
 * nahoře a ne někde v kódu.
 */
const ZOOM_MAX = Number(process.env.ZOOM_MAX || 7)

/** Kolik dlaždic se tahá naráz. Víc = rychleji, ale server to nemá rád. */
const NARAZ = 24

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

/* ================= stažení ================= */

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

/* ================= sestavení ================= */

const build = await nejnovejsiBuild()
console.log(`Planeta: ${build}`)
console.log(`Výřez:   ${MEZE.minLat}–${MEZE.maxLat}° s. š., ${MEZE.minLon}–${MEZE.maxLon}° d.`)
console.log(`Zoom:    0–${ZOOM_MAX}\n`)

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
let prazdnych = 0
let usetreno = 0

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
    // Knihovna `pmtiles` vrací MVT už rozbalený, takže se balí až tady.
    const telo = zlib.gzipSync(syrove, { level: 9 })
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
  dlazdice: rejstrik,
}
const rejstrikBin = zlib.gzipSync(Buffer.from(JSON.stringify(hlava), 'utf8'), { level: 9 })

const hlavickaBin = Buffer.alloc(8)
hlavickaBin.write('VBM1', 0, 'ascii')
hlavickaBin.writeUInt32LE(rejstrikBin.length, 4)

const balik = Buffer.concat([hlavickaBin, rejstrikBin, ...tela])

console.log('Hotovo:')
console.log(`  dlaždic v rejstříku   ${Object.keys(rejstrik).length.toLocaleString('cs-CZ')}`)
console.log(`  z toho prázdných      ${prazdnych.toLocaleString('cs-CZ')} (moře a mimo pevninu)`)
console.log(`  jedinečných těl       ${tela.length.toLocaleString('cs-CZ')}`)
console.log(`  ušetřeno opakováním   ${mb(usetreno)}`)
console.log(`  rejstřík              ${kb(rejstrikBin.length)}`)
console.log(`  CELKEM                ${mb(balik.length)}`)

if (!zapisovat) {
  console.log('\n  (jen měření – spusť s --zapis, ať se to opravdu uloží)')
  process.exit(0)
}

fs.mkdirSync(path.dirname(CIL), { recursive: true })
fs.writeFileSync(CIL, balik)
console.log(`\n  → ${path.relative(ROOT, CIL)}`)
