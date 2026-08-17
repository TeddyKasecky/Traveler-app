/**
 * Připraví akvarelové pásy z ilustrací ve složce `grafika/`.
 *
 *   node scripts/make-onboarding.mjs
 *
 * Spouští se ručně, výsledek je v gitu. Stejný vzor jako `make-kat-fota.mjs`.
 *
 * Ilustrace jsou na výšku (941×1672) a v uvítání se z nich používá jen pás
 * nahoře, takže se ořezávají na 900×360 od spodního okraje – tam je krajina,
 * nahoře je jen obloha.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ZDROJ = path.join(ROOT, '..', 'grafika')
const CIL = path.join(ROOT, 'src', 'assets', 'onboarding')
const CIL_HERO = path.join(ROOT, 'src', 'assets', 'hero')

/** Zdrojový soubor → náš název. Tři kroky uvítání. */
const OBRAZKY = [
  ['ChatGPT Image 14. 8. 2026 11_17_50 (1).png', 'objevuj'],
  ['ChatGPT Image 14. 8. 2026 11_17_50 (5).png', 'plan'],
  ['ChatGPT Image 14. 8. 2026 11_17_50 (6).png', 'denik'],
]

/**
 * Hero obrázky obrazovek.
 *
 * Do srpna 2026 to byly široké nízké pásy 900×460, protože hero měl pevných
 * 196 px. Od té doby zabírá hero polovinu výšky displeje a list obsahu na něj
 * najíždí, takže se poměr překlopil na skoro čtverec na výšku: v boxu
 * 393 × 52svh (na telefonu ~443 px) je poměr 0,89. Kdyby zůstaly široké,
 * `object-fit:cover` by z nich ukázal jen svislý pruh přes necelou polovinu
 * šířky – z panoramatu by nezbylo nic.
 *
 * Který motiv kam: Seznam dostane údolí s cestou (hledání = cesta někam),
 * Objevuj mlžné panorama (neznámo), Domů východ slunce (začátek dne),
 * Plán mapu-krajinu s vrstevnicemi.
 */
const HERO_SIRKA = 820
const HERO_VYSKA = 920
/**
 * Kam v ilustraci posadit výřez, jako podíl z toho, co se nevejde.
 * 0 = od horního okraje, 1 = od spodního.
 *
 * Od horního okraje to nejde: na těchto akvarelech je horní třetina prázdná
 * obloha, takže hero byl světlý obdélník bez motivu. Od spodního taky ne –
 * nadpis by seděl v korunách stromů. 0,62 dá do záběru horizont se sluncem
 * a kus lesa, a nahoře nechá dost oblohy pod nadpis.
 */
const HERO_POSUN = 0.62
const HERO = [
  ['ChatGPT Image 14. 8. 2026 11_17_50 (4).png', 'seznam'],
  ['ChatGPT Image 14. 8. 2026 11_17_50 (3).png', 'objevuj'],
  ['ChatGPT Image 14. 8. 2026 11_17_50 (6).png', 'domu'],
  ['ChatGPT Image 14. 8. 2026 11_17_51 (8).png', 'plan'],
]

if (!fs.existsSync(ZDROJ)) {
  console.error(`Nenašel jsem podklady: ${ZDROJ}`)
  process.exit(1)
}
fs.mkdirSync(CIL, { recursive: true })

let celkem = 0
for (const [zdroj, nas] of OBRAZKY) {
  const vstup = path.join(ZDROJ, zdroj)
  if (!fs.existsSync(vstup)) {
    console.error(`Chybí podklad: ${vstup}`)
    process.exit(1)
  }
  const buf = await sharp(vstup).resize(900, 360, { fit: 'cover', position: 'bottom' }).webp({ quality: 66 }).toBuffer()
  fs.writeFileSync(path.join(CIL, `${nas}.webp`), buf)
  celkem += buf.length
  console.log(`  ${nas.padEnd(10)} ${String(Math.round(buf.length / 1024)).padStart(3)} kB`)
}
console.log(`
Uvítání: ${Math.round(celkem / 1024)} kB do ${path.relative(ROOT, CIL)}`)

fs.mkdirSync(CIL_HERO, { recursive: true })
let celkemHero = 0
for (const [zdroj, nas] of HERO) {
  const vstup = path.join(ZDROJ, zdroj)
  if (!fs.existsSync(vstup)) {
    console.error(`Chybí podklad: ${vstup}`)
    process.exit(1)
  }
  // Výřez se bere hned ve správném poměru, takže se při zmenšení nic dalšího
  // neodřezává, a posadí se podle HERO_POSUN.
  const { width, height } = await sharp(vstup).metadata()
  const vyrez = Math.min(height, Math.round((width * HERO_VYSKA) / HERO_SIRKA))
  const shora = Math.round((height - vyrez) * HERO_POSUN)
  const buf = await sharp(vstup)
    .extract({ left: 0, top: shora, width, height: vyrez })
    .resize(HERO_SIRKA, HERO_VYSKA, { fit: 'cover' })
    .webp({ quality: 62 })
    .toBuffer()
  fs.writeFileSync(path.join(CIL_HERO, `${nas}.webp`), buf)
  celkemHero += buf.length
  console.log(`  hero ${nas.padEnd(8)} ${String(Math.round(buf.length / 1024)).padStart(3)} kB`)
}
console.log(`Hero pásy: ${Math.round(celkemHero / 1024)} kB do ${path.relative(ROOT, CIL_HERO)}`)
