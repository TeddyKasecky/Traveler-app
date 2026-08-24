/**
 * Ikony aut ze složky `grafika/ikony aut` → `src/assets/auta/`.
 *
 *   node scripts/make-auta.mjs
 *
 * Auto si člověk vybírá v Profilu a na mapě pak jezdí místo zeleného puntíku.
 * Listy jsou stejný formát jako listy kreseb (mřížka 4 × 4, křiklavý lem po
 * klíčování), takže se řežou týmiž primitivy z `rezani.mjs`.
 *
 * Jména jsou `auta-<list>-<pořadí>`: předpona `auta-` drží ikony mimo
 * předukládanou cache (filtr ve `vite.config.js`) – je jich přes megabajt
 * a člověk používá jedno. Stáhne se až při otevření výběru v Profilu
 * a service worker si ho pak uloží.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { bezLemu, zmekcit, najdiMrizku, najdiKresbu, slozkaGrafiky } from './rezani.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ZDROJE = path.join(slozkaGrafiky(ROOT), 'ikony aut')
const CIL = path.join(ROOT, 'src', 'assets', 'auta')

/**
 * Listy v pořadí, ve kterém se číslují. Nová jména se přidávají NA KONEC –
 * `prefs.auto` drží jméno souboru a přeházení by lidem vyměnilo auto.
 */
const LISTY = [
  { soubor: 'ChatGPT Image 18. 8. 2026 16_44_08.png', predpona: 'dodavky' },
  { soubor: 'ChatGPT Image 18. 8. 2026 16_21_55 (2).png', predpona: 'terenni' },
  { soubor: 'ChatGPT Image 18. 8. 2026 16_21_55 (3).png', predpona: 'mala' },
  { soubor: 'ChatGPT Image 18. 8. 2026 16_22_08 (4).png', predpona: 'velka' },
  // Jeden model ve čtyřech barvách, ne čtyři různá auta – proto jméno podle
  // modelu, ne podle velikosti jako u listů výš. Zadání je v `PROMPT.md`.
  { soubor: 'ChatGPT Image 24. 8. 2026 17_03_06.png', predpona: 'vwt4' },
  { soubor: 'ChatGPT Image 24. 8. 2026 17_13_30.png', predpona: 'vwt6' },
]

/**
 * Výška ikony. Na mapě jede auto v ~52 px a v Profilu je náhled ~72 px;
 * 120 px dává rezervu na displeje s hustotou 2 a víc nafukovat nemá smysl.
 */
const VYSKA = 120

const RADKU = 4
const SLOUPCU = 4

fs.mkdirSync(CIL, { recursive: true })
for (const f of fs.readdirSync(CIL)) fs.unlinkSync(path.join(CIL, f))

console.log('\nIkony aut\n')
const hotova = []

for (const list of LISTY) {
  const zdroj = path.join(ZDROJE, list.soubor)
  if (!fs.existsSync(zdroj)) throw new Error(`chybí list ${path.relative(ROOT, zdroj)}`)

  const { data, info } = await sharp(zdroj).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const px = Buffer.from(data)

  bezLemu(px, w, h)
  zmekcit(px, w, h)

  let vList = 0
  for (const bunka of najdiMrizku(px, w, h, RADKU, SLOUPCU)) {
    const obdelnik = najdiKresbu(px, w, h, bunka)
    if (!obdelnik) {
      console.log(`  ! prázdná buňka ${bunka.r + 1}/${bunka.c + 1} v ${list.soubor}`)
      continue
    }
    vList++
    const jmeno = `auta-${list.predpona}-${bunka.r * SLOUPCU + bunka.c + 1}`
    await sharp(px, { raw: { width: w, height: h, channels: 4 } })
      .extract(obdelnik)
      .resize({ height: VYSKA, withoutEnlargement: true })
      .webp({ quality: 84, alphaQuality: 92 })
      .toFile(path.join(CIL, `${jmeno}.webp`))
    hotova.push(jmeno)
  }
  console.log(`  ${list.predpona.padEnd(9)} ${vList} aut`)
}

const bajtu = hotova.reduce((a, j) => a + fs.statSync(path.join(CIL, `${j}.webp`)).size, 0)
console.log(`  celkem ${hotova.length} souborů, ${(bajtu / 1024).toFixed(0)} kB`)

/* Kontrolní list do grafika/, ať je střih vidět dřív, než skončí v aplikaci. */
const KROK = 200
const sloupcu = 8
const radku = Math.ceil(hotova.length / sloupcu)
const vrstvy = []
for (let i = 0; i < hotova.length; i++) {
  vrstvy.push({
    input: await sharp(path.join(CIL, `${hotova[i]}.webp`)).png().toBuffer(),
    left: (i % sloupcu) * KROK + 10,
    top: Math.floor(i / sloupcu) * KROK + 30,
  })
}
const kontrola = path.join(ZDROJE, 'kontrola-auta.png')
await sharp({ create: { width: sloupcu * KROK, height: radku * KROK, channels: 4, background: { r: 231, g: 224, b: 195, alpha: 1 } } })
  .composite(vrstvy)
  .png()
  .toFile(kontrola)
console.log(`  → ${path.relative(ROOT, kontrola)}\n`)
