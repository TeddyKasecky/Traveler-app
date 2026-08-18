/**
 * Vyrobí podklady pro malovanou mapu ze složky `grafika/`.
 *
 *   node scripts/make-kresba.mjs
 *
 * Pouští se ručně, výsledky jsou v repozitáři. Dvě fáze:
 *
 *   1. PAPÍR   → `src/assets/papir.webp`
 *      Jemné zrno, které se dlaždicuje pod celou mapou. Schválně se nedělá
 *      výřezem z akvarelu: akvarel se nedá bezešvě dlaždicovat a spoj by byl
 *      na mapě vidět jako mřížka. Zrno je proto procedurální (šum + rozostření),
 *      malované na mapě jsou až vrstvy nad ním.
 *
 *   2. KRESBY  → `src/assets/kresba/*.webp`
 *      Pět listů z `grafika/terén/`, každý 1254 × 1254 v mřížce 4 × 4, tedy
 *      osmdesát kreseb: lesy listnaté i jehličnaté, kopce a hory, sídla.
 *      Stromy se ukládají i zrcadlené – silueta je nesymetrická, takže
 *      převrácená se čte jako další kresba a je to za pár řádků.
 *
 * KOTVY SE TU UŽ NEVYRÁBĚJÍ. Dřív se rozmístění sypalo na pravidelnou síť nad
 * Evropou a druh se hádal z toho, kolik je v okolí našich míst z kategorie
 * „Hory a túry". Bylo to vidět: kresby s krajinou pod sebou neměly nic
 * společného. Dnes je počítají `make-mapa.mjs` ze skutečných lesů
 * (`landcover`) a `make-relief.mjs` ze skutečného výškopisu.
 *
 * LEM PO KLÍČOVÁNÍ. Listy přišly už s průhledností, ale kolem kreseb zůstal
 * křiklavě žlutý a červený okraj a v prázdné ploše se povalují tečky téže
 * barvy. Pozná se to snadno: ilustrace je celá v tlumených olivových
 * a okrových tónech, kdežto lem je skoro čistá žluť a červeň. Kdyby se to
 * nechalo být, měla by každá kresba na mapě svítící obrys, který je při
 * dvaceti pixelech vidět víc než ona sama.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GRAFIKA = path.join(ROOT, '..', 'grafika')
const TEREN = path.join(GRAFIKA, 'terén')
const ASSETS = path.join(ROOT, 'src', 'assets')
const KRESBY = path.join(ASSETS, 'kresba')

/* ================= 1. papír ================= */

/** Strana dlaždice. Malá schválně: hrubší zrno by při dlaždicování dělalo mřížku. */
const PAPIR = 128

/**
 * Zrno se ukládá jako **teplá tmavá barva s proměnnou průhledností**, ne jako
 * šedý obrázek, který by se pod mapu podmíchal přes `background-blend-mode`.
 *
 * Průhledné zrno se skládá obyčejným způsobem, takže funguje nad libovolnou
 * barvou moře i souše a nepotřebuje režim prolnutí, který na ploše přes celou
 * obrazovku mění cestu vykreslování.
 */
async function papir() {
  const { data, info } = await sharp({
    create: { width: PAPIR, height: PAPIR, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 26 } },
  })
    .blur(0.4)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const px = Buffer.alloc(PAPIR * PAPIR * 4)
  for (let i = 0; i < PAPIR * PAPIR; i++) {
    const v = data[i * info.channels]
    px[i * 4] = 74
    px[i * 4 + 1] = 64
    px[i * 4 + 2] = 46
    px[i * 4 + 3] = Math.max(0, Math.min(255, Math.round((150 - v) * 0.55)))
  }

  await sharp(px, { raw: { width: PAPIR, height: PAPIR, channels: 4 } })
    .webp({ quality: 80, alphaQuality: 100 })
    .toFile(path.join(ASSETS, 'papir.webp'))
  const kb = fs.statSync(path.join(ASSETS, 'papir.webp')).size / 1024
  console.log(`  papir.webp  ${PAPIR}×${PAPIR}  ${kb.toFixed(1)} kB`)
}

/* ================= 2. kresby ================= */

/**
 * Listy a jak se z nich jmenují kresby.
 *
 * Pořadí uvnitř listu je po řádcích zleva doprava, takže první čtyři jména
 * patří hornímu řádku. Jména nesou význam, ne pořadové číslo listu – vybírá
 * podle nich styl mapy ve `src/map/vektory.js`.
 *
 * `maly` je přehledový list: kresby jsou na něm jednodušší, takže se líp čtou
 * při dalekém přiblížení, kdy je z podrobné kresby stejně jen skvrna.
 */
const LISTY = [
  { soubor: 'ChatGPT Image 18. 8. 2026 12_24_21.png', predpona: 'maly', rady: ['list', 'jehl', 'teren', 'sidlo'] },
  { soubor: 'ChatGPT Image 18. 8. 2026 12_42_25 (1).png', predpona: '', rady: ['list', 'list', 'list', 'list'] },
  { soubor: 'ChatGPT Image 18. 8. 2026 12_42_25 (2).png', predpona: '', rady: ['jehl', 'jehl', 'jehl', 'jehl'] },
  { soubor: 'ChatGPT Image 18. 8. 2026 12_42_25 (3).png', predpona: '', rady: ['kopec', 'hrbet', 'skala', 'snih'] },
  { soubor: 'ChatGPT Image 18. 8. 2026 12_42_26 (4).png', predpona: '', rady: ['osada', 'ves', 'hrad', 'stavba'] },
]

/** Na jakou výšku se kresby ukládají. Viz JSDoc u `zmensit()`. */
const VYSKA = 160

/** Mřížka na listu. */
const SLOUPCU = 4
const RADKU = 4

/** Od jaké průhlednosti se pixel počítá za kresbu. */
const PRAH = 32
/** Menší ostrůvky než tolik pixelů jsou tečky po klíčování, ne kresba. */
const MIN_PLOCHA = 400

/**
 * Zprůhlední křiklavě žlutý a červený lem.
 *
 * Podmínka je schválně úzká: sytost přes 0,75 **a** jas přes 200 **a** modrá
 * složka pod 120. Nejtmavší barva ilustrace, která se tomu blíží, je střecha
 * (#A6714B) – ta má jas 166, takže se pod hranici nedostane. Zelené listí je
 * ještě dál, jeho sytost je pod 0,2.
 */
function bezLemu(px, w, h) {
  for (let i = 0; i < w * h; i++) {
    const j = i * 4
    if (!px[j + 3]) continue
    const r = px[j]
    const g = px[j + 1]
    const b = px[j + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    if (max >= 200 && b < 120 && (max - min) / max >= 0.75) px[j + 3] = 0
    // Poloprůhledná mlha kolem kresby je zbytek téhož klíčování.
    else if (px[j + 3] < 24) px[j + 3] = 0
  }
}

/**
 * Ubere pixel po obvodu a okraj změkčí.
 *
 * Po odstranění lemu zůstává tvrdá hrana s příměsí lemu v poloprůhledných
 * pixelech. Eroze ji uřízne, rozostření alfy vrátí měkký okraj – bez toho
 * by kresby na mapě vypadaly jako vystřižené nůžkami.
 */
function zmekcit(px, w, h) {
  const a = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) a[i] = px[i * 4 + 3]

  const erodovana = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let min = a[i]
      if (x > 0) min = Math.min(min, a[i - 1])
      if (x < w - 1) min = Math.min(min, a[i + 1])
      if (y > 0) min = Math.min(min, a[i - w])
      if (y < h - 1) min = Math.min(min, a[i + w])
      erodovana[i] = min
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let soucet = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          soucet += erodovana[ny * w + nx]
          n++
        }
      }
      px[i * 4 + 3] = Math.round(soucet / n)
    }
  }
}

/**
 * Rozdělí rozsah na pásy oddělené prázdnem.
 *
 * MŘÍŽKA SE NEPOČÍTÁ, HLEDÁ SE. Přehledový list má obsah posazený o kus níž,
 * než kam by padla pravidelná mřížka 4 × 4, takže dělení napevno uřízlo stromům
 * paty a do dalšího řádku přidalo pruh trávy. Prázdné pruhy pozná i posunutý
 * list, a když jich nevyjde tolik, kolik má, sáhne se po pravidelném dělení.
 *
 * @param {number[]} soucty  součet průhlednosti po řádcích nebo sloupcích
 * @param {number} kolik  kolik pásů se čeká
 * @param {number} celkem  délka rozsahu
 * @returns {Array<[number, number]>}
 */
function pasy(soucty, kolik, celkem) {
  // Za prázdno se bere řádek, ve kterém je míň než promile plné plochy –
  // ne úplná nula: po klíčování zbývají ojedinělé body i v prázdnu.
  const mez = Math.max(1, Math.round(soucty.reduce((a, b) => a + b, 0) / soucty.length / 40))
  const out = []
  let od = -1
  for (let i = 0; i < soucty.length; i++) {
    const plny = soucty[i] > mez
    if (plny && od < 0) od = i
    else if (!plny && od >= 0) {
      out.push([od, i - 1])
      od = -1
    }
  }
  if (od >= 0) out.push([od, soucty.length - 1])

  // Drobné ostrůvky slepit k sousedovi: tráva pod kresbou bývá o pár bodů
  // odsazená a tvořila by vlastní pás.
  const min = celkem / (kolik * 6)
  const slepene = []
  for (const p of out) {
    const posledni = slepene[slepene.length - 1]
    if (posledni && (p[0] - posledni[1] < min || p[1] - p[0] < min)) posledni[1] = p[1]
    else slepene.push([...p])
  }
  return slepene.length === kolik ? slepene : null
}

/** Rovnoměrné dělení, když se pásy najít nedají. */
function naDil(od, do_, kolik) {
  const krok = (do_ - od + 1) / kolik
  return Array.from({ length: kolik }, (_, i) => [Math.round(od + i * krok), Math.round(od + (i + 1) * krok) - 1])
}

/**
 * Najde v buňce kresbu a vrátí její obdélník.
 *
 * Nebere se prostě obal všeho neprůhledného: po klíčování zbývají v prázdné
 * ploše tečky a ty by obdélník nafoukly na celou buňku. Hledají se proto
 * souvislé ostrůvky a nechá se největší i s těmi, které mu velikostí sahají
 * aspoň po kotníky – strom může mít korunu oddělenou od keře pod sebou.
 *
 * @returns {{left: number, top: number, width: number, height: number}|null}
 */
function najdiKresbu(px, w, h, bunka) {
  const { bx, by, bw, bh } = bunka
  const videno = new Uint8Array(bw * bh)
  const ostruvky = []
  const zasobnik = []

  for (let sy = 0; sy < bh; sy++) {
    for (let sx = 0; sx < bw; sx++) {
      const si = sy * bw + sx
      if (videno[si]) continue
      if (px[((by + sy) * w + bx + sx) * 4 + 3] < PRAH) {
        videno[si] = 1
        continue
      }
      // Šířka do stran, ne rekurzí: ostrůvek může mít statisíce pixelů
      // a rekurze by přetekla zásobník.
      let plocha = 0
      let x0 = bw
      let x1 = -1
      let y0 = bh
      let y1 = -1
      zasobnik.push(si)
      videno[si] = 1
      while (zasobnik.length) {
        const i = zasobnik.pop()
        const x = i % bw
        const y = (i / bw) | 0
        plocha++
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue
          const ni = ny * bw + nx
          if (videno[ni]) continue
          videno[ni] = 1
          if (px[((by + ny) * w + bx + nx) * 4 + 3] >= PRAH) zasobnik.push(ni)
        }
      }
      if (plocha >= MIN_PLOCHA) ostruvky.push({ plocha, x0, x1, y0, y1 })
    }
  }

  if (!ostruvky.length) return null
  const nej = ostruvky.reduce((a, b) => (b.plocha > a.plocha ? b : a))
  // Ke kresbě patří ostrůvek, který je dost velký **a leží nad ní nebo pod ní**.
  // Ten, co stojí vedle, je kus sousední kresby, kterou dělení sloupců uříznulo
  // o pár bodů vedle – u hradní věže tak přibýval kousek mostu.
  const patri = ostruvky.filter((o) => o.plocha >= nej.plocha * 0.15 && o.x1 >= nej.x0 && o.x0 <= nej.x1)

  const x0 = Math.min(...patri.map((o) => o.x0))
  const x1 = Math.max(...patri.map((o) => o.x1))
  const y0 = Math.min(...patri.map((o) => o.y0))
  const y1 = Math.max(...patri.map((o) => o.y1))
  return { left: bx + x0, top: by + y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
}

/**
 * Proč zrovna 160 px na výšku: na mapě je kresba nanejvýš ~57 px a plátno
 * MapLibre kreslí nejvýš při 1,5 bodu na pixel, takže víc než 86 px nikdo
 * neuvidí. Rezerva do 160 je tam pro jistotu; každý pixel navíc už jen zabírá
 * místo v atlasu, do kterého se musí vejít všech osmdesát kreseb i s tmavou
 * variantou.
 */
async function kresby() {
  fs.mkdirSync(KRESBY, { recursive: true })
  for (const f of fs.readdirSync(KRESBY)) fs.unlinkSync(path.join(KRESBY, f))

  const hotove = []

  for (const list of LISTY) {
    const zdroj = path.join(TEREN, list.soubor)
    if (!fs.existsSync(zdroj)) throw new Error(`chybí list ${path.relative(ROOT, zdroj)}`)

    const { data, info } = await sharp(zdroj).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const w = info.width
    const h = info.height
    const px = Buffer.from(data)

    bezLemu(px, w, h)
    zmekcit(px, w, h)

    // Řady se hledají v součtu průhlednosti po řádcích, sloupce pak zvlášť
    // uvnitř každé řady – kresby v různých řadách nemají stejnou šířku.
    const poRadcich = new Array(h).fill(0)
    for (let y = 0; y < h; y++) {
      let s = 0
      for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] >= PRAH) s++
      poRadcich[y] = s
    }
    const rady = pasy(poRadcich, RADKU, h) || naDil(0, h - 1, RADKU)
    let vList = 0

    for (let r = 0; r < RADKU; r++) {
      const [ry0, ry1] = rady[r]
      const poSloupcich = new Array(w).fill(0)
      for (let x = 0; x < w; x++) {
        let s = 0
        for (let y = ry0; y <= ry1; y++) if (px[(y * w + x) * 4 + 3] >= PRAH) s++
        poSloupcich[x] = s
      }
      const sloupce = pasy(poSloupcich, SLOUPCU, w) || naDil(0, w - 1, SLOUPCU)

      for (let c = 0; c < SLOUPCU; c++) {
        const [cx0, cx1] = sloupce[c]
        const obdelnik = najdiKresbu(px, w, h, { bx: cx0, by: ry0, bw: cx1 - cx0 + 1, bh: ry1 - ry0 + 1 })
        if (!obdelnik) {
          console.log(`  ! prázdná buňka ${r + 1}/${c + 1} v ${list.soubor}`)
          continue
        }
        vList++
        const zaklad = list.rady[r]
        const poradi = list.rady.filter((x, i) => x === zaklad && i <= r).length
        const cislo = (poradi - 1) * SLOUPCU + c + 1
        const jmeno = `${list.predpona ? `${list.predpona}-` : ''}${zaklad}-${cislo}`

        const orez = await sharp(px, { raw: { width: w, height: h, channels: 4 } })
          .extract(obdelnik)
          .resize({ height: VYSKA, withoutEnlargement: true })
          .png()
          .toBuffer()

        await sharp(orez).webp({ quality: 84, alphaQuality: 92 }).toFile(path.join(KRESBY, `${jmeno}.webp`))
        hotove.push(jmeno)

        // Zrcadlí se jen porosty. U sídel by se převrátila kostelní věž
        // na druhou stranu a u hor by se rozešlo světlo se stínem.
        if (zaklad === 'list' || zaklad === 'jehl') {
          await sharp(orez).flop().webp({ quality: 84, alphaQuality: 92 }).toFile(path.join(KRESBY, `${jmeno}z.webp`))
          hotove.push(`${jmeno}z`)
        }
      }
    }
    console.log(`  ${list.soubor.slice(-14).padEnd(16)} ${vList} kreseb`)
  }

  const bajtu = hotove.reduce((a, j) => a + fs.statSync(path.join(KRESBY, `${j}.webp`)).size, 0)
  console.log(`  celkem ${hotove.length} souborů, ${(bajtu / 1024).toFixed(0)} kB`)
  return hotove
}

/* ================= 3. kontrolní list ================= */

/**
 * Slepí všechny kresby vedle sebe na světlé i tmavé pozadí.
 *
 * Uklízení lemu je jediná část, která může kresbu potichu okousat, a na mapě
 * by se to poznalo pozdě. Kontrolní list se ukládá do `grafika/`, ne do
 * repozitáře – je to pomůcka pro oko, ne data.
 */
async function kontrolniList(jmena) {
  // Krok musí být širší než nejširší kresba (dnes 286 px), jinak se sousedi
  // překrývají a list vypadá jako chyba střihu, i když je střih v pořádku.
  const KROK = 300
  const sloupcu = 8
  const radku = Math.ceil(jmena.length / sloupcu)

  for (const [jmeno, barva] of [
    ['svetle', { r: 231, g: 224, b: 195, alpha: 1 }],
    ['tmave', { r: 33, g: 44, b: 30, alpha: 1 }],
  ]) {
    const vrstvy = []
    for (let i = 0; i < jmena.length; i++) {
      vrstvy.push({
        input: await sharp(path.join(KRESBY, `${jmena[i]}.webp`)).png().toBuffer(),
        left: (i % sloupcu) * KROK + 8,
        top: Math.floor(i / sloupcu) * KROK + 8,
      })
    }
    const cil = path.join(TEREN, `kontrola-${jmeno}.png`)
    await sharp({ create: { width: sloupcu * KROK, height: radku * KROK, channels: 4, background: barva } })
      .composite(vrstvy)
      .png()
      .toFile(cil)
    console.log(`  → ${path.relative(ROOT, cil)}`)
  }
}

/* ================= běh ================= */

console.log('\nMalovaná mapa – podklady\n')
await papir()
const jmena = await kresby()
await kontrolniList(jmena)
console.log('')
