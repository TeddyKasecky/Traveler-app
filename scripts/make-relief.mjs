/**
 * Stínování terénu Evropy a rozmístění kreseb hor.
 *
 *   node scripts/make-relief.mjs            # jen změří
 *   node scripts/make-relief.mjs --zapis    # uloží obrázek i kotvy
 *
 * PROČ: malovaná mapa měla barvu, ale ne tvar. Alpy vypadaly jako zelená
 * skvrna, protože pokryv krajiny nic o výšce neříká. Tohle je ta jediná věc,
 * kvůli které mapa začne vypadat jako mapa: **krajina dostane světlo a stín.**
 *
 * ODKUD DATA: `elevation-tiles-prod` na AWS (dřív Mapzen, dnes veřejný archiv),
 * kódování „terrarium" – výška je zapsaná do barvy dlaždice jako
 * `v = R*256 + G + B/256 − 32768`. Zdroje jsou SRTM, GMTED a národní modely,
 * všechny volně použitelné; uvádí se v Nastavení.
 *
 * VÝSLEDEK JE PRŮHLEDNÝ OBRÁZEK, ne šedé plátno, které by se muselo podmíchat
 * přes `mix-blend-mode`. Ve stínu je teplá tmavá barva, na osvětlených svazích
 * krémová, a nese to alfa kanál – takže se to skládá úplně obyčejně nad
 * světlou i tmavou krajinou a nemění to cestu vykreslování. Stejný trik jako
 * `papir.webp`.
 *
 * Nad mořem vyjde výška nula a s ní nulový sklon, takže je obrázek průhledný
 * sám od sebe a nemusí se maskovat pobřeží.
 *
 * KOTVY HOR jsou vedlejší produkt, ale je to ten důležitější: kresby kopců
 * a hor konečně sedí tam, kde hory opravdu jsou, a v řetězech, ne po jedné.
 * Dřív se odvozovaly z toho, kolik je v okolí našich míst z kategorie
 * „Hory a túry" – což je zajímavá informace o nás, ale ne o krajině.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = path.join(ROOT, 'src', 'assets')
const DATA = path.join(ROOT, 'src', 'data')

/** Kde leží veřejný archiv výškopisu. */
const ZDROJ = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'

/** Stejný výřez, jaký má balík mapy i `make-basemap.mjs`. */
const MEZE = { minLat: 33, maxLat: 72, minLon: -26, maxLon: 46 }

/**
 * Přiblížení, ze kterého se výškopis bere.
 *
 * Šestka dává dlaždici na ~600 km, tedy bod na ~1,5 km. Na stínování celého
 * kontinentu to bohatě stačí – jde o tvar pohoří, ne o jednotlivé kopce –
 * a je to 182 dlaždic místo sedmi set.
 */
const ZOOM = 6
const STRANA = 256
/** Kolik dlaždic se tahá naráz. */
const NARAZ = 16

/**
 * Na jakou šířku se hotový obrázek zmenší a jak silně se balí.
 *
 * Obrázek jde **do aplikace**, ne do staženého balíku, takže ho stáhne každá
 * instalace – proto se tu smlouvá o stovky kilobajtů. Barvy jsou jen dvě
 * ploché a veškerá informace je v alfě, takže `quality` může být nízká
 * a rozhoduje `alphaQuality`. Obojí je v proměnné prostředí, protože se to
 * ladí pohledem a bez toho by to znamenalo editovat skript mezi pokusy.
 */
const SIRKA_VEN = Number(process.env.SIRKA || 1792)
const KVALITA_ALFY = Number(process.env.ALFA || 64)

/** Směr a výška světla. Od severozápadu, jak je zvykem na malovaných mapách. */
const AZIMUT = (315 * Math.PI) / 180
const VYSKA_SVETLA = (38 * Math.PI) / 180

/**
 * Převýšení svahu.
 *
 * Bod rastru je ~1,5 km, takže i Alpy stoupají numericky mírně – tisíc metrů
 * na patnáct kilometrů je sklon necelé čtyři stupně. Bez převýšení vyšlo
 * stínování tak slabé, že na khaki podkladu skoro nebylo vidět. Deset je
 * hodnota, při které mají pohoří tvar a roviny zůstanou roviny; každý
 * malovaný atlas dělá totéž.
 */
const PREVYSENI_SVAHU = 10

/** Jak silné je stínování. Nad 1 začne krajina vypadat jako reliéfní mapa v atlasu. */
const SILA_STINU = 0.8
/** Světlo je slabší než stín – jinak by mapa svítila jako plech. */
const SILA_SVETLA = 0.42
/**
 * Zesílení slabých hodnot. Bez něj nese obrázek jen ostré hřebeny a mírně
 * zvlněná krajina – tedy většina Evropy – zůstane plochá.
 */
const GAMA = 0.75

/**
 * Pod tuhle mez se stínování nekreslí vůbec.
 *
 * Výškopis má i na rovině šum pár metrů a gama ho zesílí spolu se vším
 * ostatním – Polabí pak vypadalo jako zmačkaný papír. Mrtvá zóna to utne
 * a jako vedlejší efekt zmenší soubor: velké plochy jsou pak úplně průhledné
 * a ty se balí skoro na nic.
 */
const MRTVA_ZONA = 0.07

const zapisovat = process.argv.includes('--zapis')

/* ================= dlaždice ================= */

const naX = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z)
function naY(lat, z) {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}
/** Zeměpisná šířka horního okraje dlaždice. */
function latDlazdice(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z
  return (180 / Math.PI) * Math.atan(Math.sinh(n))
}

const x0 = naX(MEZE.minLon, ZOOM)
const x1 = naX(MEZE.maxLon, ZOOM)
const y0 = naY(MEZE.maxLat, ZOOM)
const y1 = naY(MEZE.minLat, ZOOM)
const sloupcu = x1 - x0 + 1
const radku = y1 - y0 + 1
const W = sloupcu * STRANA
const H = radku * STRANA

/** Skutečné meze složeného obrázku – ne MEZE, ale okraje dlaždic. */
const MEZE_OBRAZKU = {
  sever: latDlazdice(y0, ZOOM),
  jih: latDlazdice(y1 + 1, ZOOM),
  zapad: (x0 / 2 ** ZOOM) * 360 - 180,
  vychod: (((x1 + 1) / 2 ** ZOOM) * 360 - 180),
}

console.log('\nStínování terénu Evropy\n')
console.log(`  dlaždic   ${sloupcu} × ${radku} = ${sloupcu * radku} (zoom ${ZOOM})`)
console.log(`  rastr     ${W} × ${H} bodů`)
console.log(
  `  meze      ${MEZE_OBRAZKU.jih.toFixed(2)}–${MEZE_OBRAZKU.sever.toFixed(2)}° s. š., ` +
    `${MEZE_OBRAZKU.zapad.toFixed(2)}–${MEZE_OBRAZKU.vychod.toFixed(2)}° d.\n`
)

/* ================= stažení a rozbalení výšek ================= */

/**
 * Stažené výšky se nechávají v `node_modules/.cache`.
 *
 * Ladění stínování i kotev hor znamená skript pustit desetkrát a pokaždé
 * stahovat 10 MB z Ameriky je zbytečné. Cache není v gitu a smaže se s
 * `node_modules` – výsledek je v repozitáři, tohle je jen meziprodukt.
 */
const CACHE = path.join(ROOT, 'node_modules', '.cache', 'vandrbuch', `vysky-z${ZOOM}.bin`)

const vysky = new Int16Array(W * H)
let stazeno = 0
let chyb = 0

/** Stáhne a rozbalí jednu dlaždici do pole výšek. */
async function dlazdice(tx, ty) {
  const r = await fetch(`${ZDROJ}/${ZOOM}/${tx}/${ty}.png`)
  if (!r.ok) {
    chyb++
    return
  }
  const buf = Buffer.from(await r.arrayBuffer())
  stazeno += buf.length
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  const k = info.channels

  const odX = (tx - x0) * STRANA
  const odY = (ty - y0) * STRANA
  for (let py = 0; py < STRANA; py++) {
    for (let px = 0; px < STRANA; px++) {
      const i = (py * STRANA + px) * k
      // Terrarium: výška je rozložená do tří složek barvy.
      const v = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768
      vysky[(odY + py) * W + odX + px] = Math.max(-500, Math.min(9000, Math.round(v)))
    }
  }
}

if (fs.existsSync(CACHE) && fs.statSync(CACHE).size === vysky.byteLength) {
  vysky.set(new Int16Array(fs.readFileSync(CACHE).buffer.slice(0)))
  console.log('  výšky z vyrovnávací paměti (smaž node_modules/.cache pro nové stažení)\n')
} else {
  const seznam = []
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) seznam.push([tx, ty])

  for (let i = 0; i < seznam.length; i += NARAZ) {
    await Promise.all(seznam.slice(i, i + NARAZ).map(([tx, ty]) => dlazdice(tx, ty)))
    process.stdout.write(`\r  staženo ${Math.min(i + NARAZ, seznam.length)}/${seznam.length} dlaždic   `)
  }
  console.log(`\n  ${(stazeno / 1048576).toFixed(1)} MB${chyb ? `, ${chyb} dlaždic chybí` : ''}\n`)
  fs.mkdirSync(path.dirname(CACHE), { recursive: true })
  fs.writeFileSync(CACHE, Buffer.from(vysky.buffer))
}

/* ================= stínování ================= */

/**
 * Velikost bodu v metrech pro daný řádek.
 *
 * V Mercatoru se poledník k pólu roztahuje, takže bod na severu pokrývá
 * podstatně menší území. Bez přepočtu by Skandinávie vypadala jako Himálaj.
 */
function metryNaBod(radek) {
  const lat = latDlazdice(y0 + radek / STRANA, ZOOM)
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** ZOOM
}

const px = new Uint8Array(W * H * 4)

for (let y = 1; y < H - 1; y++) {
  const m = metryNaBod(y)
  for (let x = 1; x < W - 1; x++) {
    const i = y * W + x
    // Horn: sklon ze všech osmi sousedů, ne jen ze čtyř. Na hrubém rastru
    // je rozdíl vidět – čtyři sousedi dělají ze svahů schody.
    const a = vysky[i - W - 1]
    const b = vysky[i - W]
    const c = vysky[i - W + 1]
    const d = vysky[i - 1]
    const f = vysky[i + 1]
    const g = vysky[i + W - 1]
    const h = vysky[i + W]
    const k = vysky[i + W + 1]

    const dzdx = ((c + 2 * f + k - (a + 2 * d + g)) / (8 * m)) * PREVYSENI_SVAHU
    const dzdy = ((g + 2 * h + k - (a + 2 * b + c)) / (8 * m)) * PREVYSENI_SVAHU

    const sklon = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy))
    const orientace = Math.atan2(dzdy, -dzdx)

    const osvit =
      Math.sin(VYSKA_SVETLA) * Math.cos(sklon) + Math.cos(VYSKA_SVETLA) * Math.sin(sklon) * Math.cos(AZIMUT - orientace)

    // −1 stín … 0 rovina … +1 přisvícený svah
    const syrove = Math.max(-1, Math.min(1, (osvit - Math.sin(VYSKA_SVETLA)) / (1 - Math.sin(VYSKA_SVETLA))))
    const nadMez = Math.max(0, Math.abs(syrove) - MRTVA_ZONA) / (1 - MRTVA_ZONA)
    const t = Math.sign(syrove) * Math.pow(nadMez, GAMA)
    const j = i * 4
    if (t < 0) {
      px[j] = 62
      px[j + 1] = 52
      px[j + 2] = 38
      px[j + 3] = Math.round(Math.min(1, -t * SILA_STINU) * 255)
    } else {
      px[j] = 255
      px[j + 1] = 250
      px[j + 2] = 232
      px[j + 3] = Math.round(Math.min(1, t * SILA_SVETLA) * 255)
    }
  }
}

const vyskaVen = Math.round((SIRKA_VEN / W) * H)
const obrazek = sharp(Buffer.from(px.buffer), { raw: { width: W, height: H, channels: 4 } })
  .resize(SIRKA_VEN, vyskaVen, { kernel: 'lanczos3' })
  // Lehké rozostření dělá ze stínování malbu. Bez něj je to technický výkres.
  .blur(0.7)
  .webp({ quality: 55, alphaQuality: KVALITA_ALFY, effort: 6 })

/* ================= kotvy hor ================= */

/**
 * Strana čtverce, ve kterém se hledá vrchol, v bodech rastru.
 *
 * Bod je ~1,5 km, takže 14 bodů je zhruba 20 km – hustota malované mapy.
 * Z každého čtverce se bere **jeho nejvyšší bod**, ne bod uprostřed: hřeben
 * pak dostane řetěz kopců jdoucí po hřebeni, a přesně tak se hory na starých
 * mapách kreslí. (Napoprvé jsem hledal maximum přesně v bodě sítě a z celé
 * Evropy vyšlo osmdesát sedm kopců.)
 */
const OKO = 14
/** Od jaké výšky se vůbec kreslí. Pod tím je krajina, ne hory. */
const OD_METRU = 220
/** O kolik musí vrchol převyšovat průměr čtverce, aby stál za kresbu. */
const PREVYSENI = 55

/** Stabilní hash řetězce → 0..1. */
function hash(s) {
  let v = 2166136261
  for (let i = 0; i < s.length; i++) {
    v ^= s.charCodeAt(i)
    v = Math.imul(v, 16777619)
  }
  return ((v >>> 0) % 100000) / 100000
}

const hory = []
for (let by = 0; by + OKO <= H; by += OKO) {
  for (let bx = 0; bx + OKO <= W; bx += OKO) {
    let max = -32768
    let mx = 0
    let my = 0
    let soucet = 0
    for (let y = by; y < by + OKO; y++) {
      for (let x = bx; x < bx + OKO; x++) {
        const v = vysky[y * W + x]
        soucet += v
        if (v > max) {
          max = v
          mx = x
          my = y
        }
      }
    }
    if (max < OD_METRU) continue
    if (max - soucet / (OKO * OKO) < PREVYSENI) continue

    const lat = latDlazdice(y0 + my / STRANA, ZOOM)
    const lon = ((x0 + mx / STRANA) / 2 ** ZOOM) * 360 - 180
    if (lat < MEZE.minLat || lat > MEZE.maxLat || lon < MEZE.minLon || lon > MEZE.maxLon) continue

    // Druh kresby podle nadmořské výšky – od oblého kopce po zasněžený štít.
    const druh = max >= 2000 ? 3 : max >= 1100 ? 2 : max >= 550 ? 1 : 0
    hory.push([+lat.toFixed(3), +lon.toFixed(3), druh, +hash(`${mx},${my}`).toFixed(2)])
  }
}

// Od severu k jihu, ať se kresby překrývají tak, že bližší je nahoře.
hory.sort((a, b) => b[0] - a[0])

const poDruhu = [0, 0, 0, 0]
for (const h of hory) poDruhu[h[2]]++

console.log('Hotovo:')
console.log(`  kotev hor        ${hory.length.toLocaleString('cs-CZ')}`)
console.log(`    kopce ${poDruhu[0]} · hřbety ${poDruhu[1]} · skalnaté ${poDruhu[2]} · zasněžené ${poDruhu[3]}`)

if (!zapisovat) {
  const zkouska = await obrazek.toBuffer()
  console.log(`  reliéf           ${SIRKA_VEN} × ${vyskaVen}, ${(zkouska.length / 1048576).toFixed(2)} MB`)
  console.log('\n  (jen měření – spusť s --zapis, ať se to opravdu uloží)')
  process.exit(0)
}

const cil = path.join(ASSETS, 'relief-evropa.webp')
await obrazek.toFile(cil)
console.log(`  reliéf           ${SIRKA_VEN} × ${vyskaVen}, ${(fs.statSync(cil).size / 1048576).toFixed(2)} MB`)
console.log(`\n  → ${path.relative(ROOT, cil)}`)

const meta = path.join(DATA, 'relief.json')
fs.writeFileSync(
  meta,
  JSON.stringify({
    _o: 'generuje scripts/make-relief.mjs; výškopis elevation-tiles-prod (SRTM, GMTED)',
    meze: [
      [+MEZE_OBRAZKU.jih.toFixed(6), +MEZE_OBRAZKU.zapad.toFixed(6)],
      [+MEZE_OBRAZKU.sever.toFixed(6), +MEZE_OBRAZKU.vychod.toFixed(6)],
    ],
  }) + '\n',
  'utf8'
)
console.log(`  → ${path.relative(ROOT, meta)}`)

const horySoubor = path.join(DATA, 'kresby-hory.json')
fs.writeFileSync(
  horySoubor,
  JSON.stringify({
    _o: 'generuje scripts/make-relief.mjs z výškopisu; [lat, lon, druh 0–3, velikost]',
    body: hory,
  }) + '\n',
  'utf8'
)
console.log(`  → ${path.relative(ROOT, horySoubor)}  ${(fs.statSync(horySoubor).size / 1024).toFixed(0)} kB`)
