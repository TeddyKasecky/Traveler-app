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
import { MEZE, ZOOM, STRANA, MRIZKA, latDlazdice, lonDlazdice, metryNaBod } from './mrizka.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = path.join(ROOT, 'src', 'assets')
const DATA = path.join(ROOT, 'src', 'data')

/** Kde leží veřejný archiv výškopisu. */
const ZDROJ = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'

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

const { x0, x1, y0, y1, sloupcu, radku, W, H } = MRIZKA
/** Skutečné meze složeného obrázku – ne MEZE, ale okraje dlaždic. */
const MEZE_OBRAZKU = MRIZKA.meze

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

/* ================= maska hor ================= */

/**
 * Od jaké výšky se vůbec kreslí. Pod tím je krajina, ne hory.
 * Prahy jsou tak, jak vyšly z pohledu na Alpy a na Vysočinu.
 */
const OD_METRU = 220
/** O kolik musí bod převyšovat okolí, aby se počítal za hřeben. */
const PREVYSENI = 45
/** Poloměr okna, ve kterém se počítá „okolí“. 6 bodů ≈ 9 km. */
const OKOLI = 6

/**
 * Maska hor: pro každou buňku 0 = nic, 1 = kopec, 2 = hřbet, 3 = skalnatý
 * vrchol, 4 = zasněžený.
 *
 * HLEDAJÍ SE HŘEBENY, NE JEDNOTLIVÉ VRCHOLY. Do srpna 2026 se bral nejvyšší
 * bod každého čtverce 20 × 20 km, takže z Alp vyšla řada osamocených štítů
 * rozesetých po mapě. Hřeben je jiná věc: bod, který je **maximem napříč
 * svahem** – tedy vyšší než oba sousedi aspoň v jednom ze čtyř směrů. Body
 * na hřebeni pak jdou souvisle za sebou a s překrýváním z nich vznikne
 * pohoří, ne kopečky.
 *
 * Samotné „je vyšší než sousedi“ by ale označilo i každou vlnku v rovině,
 * proto musí bod zároveň převyšovat průměr svého okolí.
 */
const maskaHor = new Uint8Array(W * H)
let hrebenu = 0

for (let y = OKOLI; y < H - OKOLI; y++) {
  for (let x = OKOLI; x < W - OKOLI; x++) {
    const i = y * W + x
    const v = vysky[i]
    if (v < OD_METRU) continue

    // Maximum napříč svahem aspoň v jednom ze čtyř směrů.
    const hreben =
      (v >= vysky[i - 1] && v > vysky[i + 1]) ||
      (v >= vysky[i - W] && v > vysky[i + W]) ||
      (v >= vysky[i - W - 1] && v > vysky[i + W + 1]) ||
      (v >= vysky[i - W + 1] && v > vysky[i + W - 1])
    if (!hreben) continue

    // Převýšení nad okolím. Vzorkuje se po dvou bodech – na hrubém rastru
    // je to k nerozeznání a je to čtvrtinová práce.
    let soucet = 0
    let n = 0
    for (let dy = -OKOLI; dy <= OKOLI; dy += 2) {
      for (let dx = -OKOLI; dx <= OKOLI; dx += 2) {
        soucet += vysky[(y + dy) * W + x + dx]
        n++
      }
    }
    if (v - soucet / n < PREVYSENI) continue

    maskaHor[i] = v >= 2000 ? 4 : v >= 1100 ? 3 : v >= 550 ? 2 : 1
    hrebenu++
  }
}

/**
 * Zmenší masku na velikost, ve které se ukládá.
 *
 * Bere se **maximum bloku, ne průměr**: maska nese druh, ne intenzitu, a
 * průměrováním by z kopce a skály vznikl hřbet. Maximum zároveň zaručí, že
 * se tenký hřeben zmenšením neztratí.
 */
function zmensiMasku(zdroj, sirka, vyska, krok) {
  const w = Math.floor(sirka / krok)
  const h = Math.floor(vyska / krok)
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let max = 0
      for (let dy = 0; dy < krok; dy++) {
        for (let dx = 0; dx < krok; dx++) {
          const v = zdroj[(y * krok + dy) * sirka + x * krok + dx]
          if (v > max) max = v
        }
      }
      out[y * w + x] = max
    }
  }
  return { data: out, w, h }
}

/** Kolik bodů rastru padne na jednu buňku masky. Dva → buňka ~3 km. */
const KROK_MASKY = Number(process.env.KROK_MASKY || 2)
const maska = zmensiMasku(maskaHor, W, H, KROK_MASKY)

const poDruhu = [0, 0, 0, 0, 0]
for (const v of maska.data) poDruhu[v]++

console.log('Hotovo:')
console.log(`  hřebenových bodů ${hrebenu.toLocaleString('cs-CZ')}`)
console.log(`  maska hor        ${maska.w} × ${maska.h}`)
console.log(
  `    kopce ${poDruhu[1].toLocaleString('cs-CZ')} · hřbety ${poDruhu[2].toLocaleString('cs-CZ')} · ` +
    `skalnaté ${poDruhu[3].toLocaleString('cs-CZ')} · zasněžené ${poDruhu[4].toLocaleString('cs-CZ')}`
)

/**
 * Maska se ukládá jako PNG s paletou.
 *
 * Je v ní pět hodnot, takže se to zabalí skoro na nic – a prohlížeč ji umí
 * přečíst tímtéž způsobem jako kresby, přes `createImageBitmap` a plátno.
 * Jméno musí začínat `kresby-`, podle toho ji `vite.config.js` vyřazuje
 * z předukládané cache.
 */
const maskaObrazek = sharp(Buffer.from(maska.data), { raw: { width: maska.w, height: maska.h, channels: 1 } })
  .png({ compressionLevel: 9, palette: true, colours: 8 })

if (!zapisovat) {
  const zkouska = await obrazek.toBuffer()
  const zkouskaMasky = await maskaObrazek.toBuffer()
  console.log(`  reliéf           ${SIRKA_VEN} × ${vyskaVen}, ${(zkouska.length / 1048576).toFixed(2)} MB`)
  console.log(`  maska hor        ${(zkouskaMasky.length / 1024).toFixed(0)} kB`)
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

const maskaSoubor = path.join(ASSETS, 'kresby-hory.png')
await maskaObrazek.toFile(maskaSoubor)
console.log(`  → ${path.relative(ROOT, maskaSoubor)}  ${(fs.statSync(maskaSoubor).size / 1024).toFixed(0)} kB`)
