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
import { bezLemu, zmekcit, najdiMrizku, najdiKresbu } from './rezani.mjs'

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

/**
 * Vytratí spodek kresby do ztracena.
 *
 * TOHLE JE TA VĚC, KVŮLI KTERÉ KRESBY VYPADALY JAKO NÁLEPKY. Každá má na
 * listu vlastní ostrůvek trávy s kamenem — světlý podstavec s ostrým okrajem.
 * Na mapě jich pak bylo vidět sto a každý křičel „jsem výstřižek nalepený
 * na mapu". Když se spodek plynule vytratí, koruny sousedních kreseb se slijí
 * do jedné lesní masy a podstavce zmizí.
 *
 * Sídla dostávají mírnější náběh: ves potřebuje stát na zemi, kdežto strom
 * má splynout s lesem vedle sebe.
 *
 * @param {Buffer} png
 * @param {number} podil  jakou část výšky zabere náběh
 */
async function doZtracena(png, podil) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const pasmo = Math.max(1, h * podil)
  for (let y = h - Math.ceil(pasmo); y < h; y++) {
    // Druhá mocnina, ne přímka: náběh pak začne nenápadně a zrychlí se ke
    // spodnímu okraji, takže není vidět, kde začíná.
    const k = Math.pow(Math.max(0, (h - y) / pasmo), 2)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4 + 3
      data[i] = Math.round(data[i] * k)
    }
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
}

/** Kolik spodku se vytratí. Sídla míň – potřebují stát na zemi. */
const NABEH = { sidlo: 0.18, ostatni: 0.3 }
const JE_SIDLO = new Set(['osada', 'ves', 'hrad', 'stavba', 'sidlo'])

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

    let vList = 0
    for (const bunka of najdiMrizku(px, w, h, RADKU, SLOUPCU)) {
      {
        const { r, c } = bunka
        const obdelnik = najdiKresbu(px, w, h, bunka)
        if (!obdelnik) {
          console.log(`  ! prázdná buňka ${r + 1}/${c + 1} v ${list.soubor}`)
          continue
        }
        vList++
        const zaklad = list.rady[r]
        const poradi = list.rady.filter((x, i) => x === zaklad && i <= r).length
        const cislo = (poradi - 1) * SLOUPCU + c + 1
        // Předpona `kresba-` není ozdoba: podle ní pozná `vite.config.js`,
        // že tenhle obrázek nepatří do předukládané cache. Kresby jsou jen
        // pro staženou mapu a bez toho by je při instalaci stahoval každý.
        const jmeno = `kresba-${list.predpona ? `${list.predpona}-` : ''}${zaklad}-${cislo}`

        const orezany = await sharp(px, { raw: { width: w, height: h, channels: 4 } })
          .extract(obdelnik)
          .resize({ height: VYSKA, withoutEnlargement: true })
          .png()
          .toBuffer()
        const orez = await doZtracena(orezany, JE_SIDLO.has(zaklad) ? NABEH.sidlo : NABEH.ostatni)

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
