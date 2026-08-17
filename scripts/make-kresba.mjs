/**
 * Vyrobí podklady pro malovanou mapu ze složky `grafika/`.
 *
 *   node scripts/make-kresba.mjs
 *
 * Pouští se ručně, výsledky jsou v repozitáři. Tři fáze:
 *
 *   1. PAPÍR   → `src/assets/papir.webp`
 *      Jemné zrno, které se dlaždicuje pod celou mapou. Schválně se nedělá
 *      výřezem z akvarelu: akvarel se nedá bezešvě dlaždicovat a spoj by byl
 *      na mapě vidět jako mřížka. Zrno je proto procedurální (šum + rozostření),
 *      malované na mapě jsou až vrstvy nad ním.
 *
 *   2. KRESBY  → `src/assets/kresba/*.webp`
 *      Osm stromů z listu `…12_10_22.png` a dvě horské kulisy z `…12_10_28 (5).png`.
 *      Předlohy jsou bez průhlednosti, na krémovém pozadí – to se odklíčuje
 *      podle vzdálenosti od barvy pozadí, ne prahem jasu: světle zelené jehličí
 *      má podobný jas jako pozadí a prahem by se prokousalo skrz.
 *
 *   3. KOTVY   → `src/data/kresba.json`
 *      Kam se kresby na mapě posadí. Body se sypou na pravidelnou síť nad
 *      Evropou a nechají se jen ty, které padnou na souš (`basemap.json`).
 *      Pak se prořídnou hashem souřadnic, takže rozmístění je pokaždé stejné –
 *      mapa nesmí vypadat při každém načtení jinak.
 *
 *      Druh kresby určují naše vlastní data: kde je v okolí hodně míst
 *      z kategorií Hory a túry, Ferraty nebo Soutěsky, stojí hora, jinde les.
 *      Není to výškopis, ale sedí to tam, kde hory opravdu jsou.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GRAFIKA = path.join(ROOT, '..', 'grafika')
const ASSETS = path.join(ROOT, 'src', 'assets')
const KRESBY = path.join(ASSETS, 'kresba')

const LIST_STROMY = path.join(GRAFIKA, 'ChatGPT Image 14. 8. 2026 12_10_22.png')
const LIST_HORY = path.join(GRAFIKA, 'ChatGPT Image 14. 8. 2026 12_10_28 (5).png')

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
 * Odklíčuje krémové pozadí do průhlednosti.
 *
 * Pozadí je jedna plochá barva, takže se počítá vzdálenost od ní v RGB.
 * Do `MEZ_PLNA` je pixel průhledný, nad `MEZ_ZADNA` neprůhledný, mezi tím
 * se plynule přechází – bez toho by měly kresby tvrdý zubatý okraj.
 */
const MEZ_PLNA = 14
const MEZ_ZADNA = 46

async function odkliceni(vstup) {
  const { data, info } = await sharp(vstup).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const k = info.channels
  // Barva pozadí = levý horní roh. Na obou listech je tam čistý papír.
  const [pr, pg, pb] = [data[0], data[1], data[2]]

  for (let i = 0; i < data.length; i += k) {
    const d = Math.hypot(data[i] - pr, data[i + 1] - pg, data[i + 2] - pb)
    const a = d <= MEZ_PLNA ? 0 : d >= MEZ_ZADNA ? 255 : Math.round(((d - MEZ_PLNA) / (MEZ_ZADNA - MEZ_PLNA)) * 255)
    data[i + 3] = a
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: k } })
}

/** Ořízne průhledný okraj. Sharp `trim` bere práh z rohového pixelu. */
async function orez(obr) {
  return sharp(await obr.png().toBuffer()).trim({ threshold: 6 })
}

/** Jeden výřez → hotový soubor. */
async function kresba(zdroj, vyrez, jmeno, vyska) {
  const orezany = await orez(await odkliceni(await sharp(zdroj).extract(vyrez).png().toBuffer()))
  await orezany
    .resize({ height: vyska, withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90 })
    .toFile(path.join(KRESBY, `${jmeno}.webp`))
  const kb = fs.statSync(path.join(KRESBY, `${jmeno}.webp`)).size / 1024
  console.log(`  ${jmeno}.webp`.padEnd(16) + `${kb.toFixed(1)} kB`)
}

async function kresby() {
  fs.mkdirSync(KRESBY, { recursive: true })

  // Osm stromů ve mřížce 4×2 na listu 1122×1402.
  const S = { w: 280, h: 700 }
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      await kresba(
        LIST_STROMY,
        { left: c * S.w, top: r * S.h, width: S.w, height: r === 1 ? 702 : S.h },
        `strom-${r * 4 + c + 1}`,
        190
      )
    }
  }

  // Dvě horské kulisy ze spodní řady druhého listu.
  await kresba(LIST_HORY, { left: 30, top: 1130, width: 440, height: 230 }, 'hora-1', 150)
  await kresba(LIST_HORY, { left: 570, top: 1110, width: 530, height: 250 }, 'hora-2', 165)
}

/* ================= 3. kotvy ================= */

/** Kde se kreslí. Kus okolo Evropy, ať mapa nekončí prázdnem hned za okrajem. */
const OBLAST = { minLat: 35, maxLat: 71, minLon: -11, maxLon: 32 }
/** Rozteč sítě ve stupních. 1,1° ≈ 120 km – hustota malované mapy, ne lesa. */
const KROK = 1.1
/** Kolik procent bodů na souši projde. Zbytek by mapu zavalil. */
const PROPUST = 0.28
/** Do jaké dálky se hledají hory v našich datech. */
const HORY_KM = 110
/** Kolik horských míst v okolí stačí na to, aby se místo lesa nakreslila hora. */
const HORY_MIN = 3

/** Stabilní hash řetězce → 0..1. Stejný vstup, stejné rozmístění. */
function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

/** Leží bod uvnitř mnohoúhelníku? Souřadnice jsou [lat, lon]. */
function uvnitr(lat, lon, obrys) {
  let uvnitrJe = false
  for (let i = 0, j = obrys.length - 1; i < obrys.length; j = i++) {
    const [ai, bi] = obrys[i]
    const [aj, bj] = obrys[j]
    if (ai > lat !== aj > lat && lon < ((bj - bi) * (lat - ai)) / (aj - ai) + bi) uvnitrJe = !uvnitrJe
  }
  return uvnitrJe
}

/** Hrubý obdélníkový obal obrysu – ušetří drtivou většinu testů. */
function obal(obrys) {
  let a = 90
  let b = -90
  let c = 180
  let d = -180
  for (const [lat, lon] of obrys) {
    if (lat < a) a = lat
    if (lat > b) b = lat
    if (lon < c) c = lon
    if (lon > d) d = lon
  }
  return { a, b, c, d }
}

function kotvy() {
  const zeme = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'basemap.json'), 'utf8')).zeme
  const mista = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'places.json'), 'utf8'))
  const horska = mista.filter((p) => ['Hory a túry', 'Ferraty', 'Soutěsky'].includes(p.k))

  const obaly = zeme.map(obal)
  const out = []

  for (let lat = OBLAST.minLat; lat <= OBLAST.maxLat; lat += KROK) {
    for (let lon = OBLAST.minLon; lon <= OBLAST.maxLon; lon += KROK) {
      const klic = `${lat.toFixed(2)},${lon.toFixed(2)}`
      const h = hash(klic)
      if (h > PROPUST) continue

      // Rozházení uvnitř buňky, ať to není mřížka. Zase z hashe, ne z náhody.
      const la = +(lat + (hash(klic + 'a') - 0.5) * KROK * 0.8).toFixed(2)
      const lo = +(lon + (hash(klic + 'b') - 0.5) * KROK * 0.8).toFixed(2)

      let naSousi = false
      for (let i = 0; i < zeme.length; i++) {
        const o = obaly[i]
        if (la < o.a || la > o.b || lo < o.c || lo > o.d) continue
        if (uvnitr(la, lo, zeme[i])) {
          naSousi = true
          break
        }
      }
      if (!naSousi) continue

      // Stupeň zeměpisné délky se k pólu zkracuje – bez přepočtu by na severu
      // vycházelo „v okolí“ podstatně menší území než na jihu.
      const kmLat = 111
      const kmLon = 111 * Math.cos((la * Math.PI) / 180)
      let horskych = 0
      for (const p of horska) {
        const dx = (p.lon - lo) * kmLon
        const dy = (p.lat - la) * kmLat
        if (dx * dx + dy * dy <= HORY_KM * HORY_KM) horskych++
      }

      const druh = horskych >= HORY_MIN ? 'hora' : 'strom'
      const kus = druh === 'hora' ? 1 + Math.floor(hash(klic + 'h') * 2) : 1 + Math.floor(hash(klic + 's') * 8)
      // Velikost 0,8–1,2× – bez ní vypadá les jako vystřižený z jedné šablony.
      const v = +(0.8 + hash(klic + 'v') * 0.4).toFixed(2)
      out.push([la, lo, druh === 'hora' ? `h${kus}` : `s${kus}`, v])
    }
  }

  // Pořadí od severu k jihu: kresby se pak překrývají tak, že bližší je nahoře.
  out.sort((x, y) => y[0] - x[0])

  const cil = path.join(ROOT, 'src', 'data', 'kresba.json')
  fs.writeFileSync(cil, JSON.stringify({ _o: 'generuje scripts/make-kresba.mjs', kotvy: out }) + '\n', 'utf8')
  const hor = out.filter((x) => x[2][0] === 'h').length
  console.log(`  kresba.json  ${out.length} kotev (${hor} hor, ${out.length - hor} lesů)  ${(fs.statSync(cil).size / 1024).toFixed(1)} kB`)
}

/* ================= běh ================= */

console.log('\nMalovaná mapa – podklady\n')
await papir()
await kresby()
kotvy()
console.log('')
