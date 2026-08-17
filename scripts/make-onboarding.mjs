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
 * Hero pásy obrazovek. Jsou širší a nižší než obrázky uvítání, protože
 * pod nimi začíná „list" s obsahem, který na ně přesahuje.
 *
 * Který motiv kam: Seznam dostane údolí s cestou (hledání = cesta někam),
 * Objevuj mlžné panorama (neznámo), Domů východ slunce (začátek dne),
 * Plán mapu-krajinu s vrstevnicemi.
 */
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
  // Bere se horní polovina ilustrace, kde je obloha a mlha. Nadpis leží
  // v hero pásu nahoře a na korunách stromů by nebyl čitelný.
  const { width, height } = await sharp(vstup).metadata()
  const buf = await sharp(vstup)
    .extract({ left: 0, top: 0, width, height: Math.round(height * 0.62) })
    .resize(900, 460, { fit: 'cover', position: 'bottom' })
    .webp({ quality: 66 })
    .toBuffer()
  fs.writeFileSync(path.join(CIL_HERO, `${nas}.webp`), buf)
  celkemHero += buf.length
  console.log(`  hero ${nas.padEnd(8)} ${String(Math.round(buf.length / 1024)).padStart(3)} kB`)
}
console.log(`Hero pásy: ${Math.round(celkemHero / 1024)} kB do ${path.relative(ROOT, CIL_HERO)}`)
