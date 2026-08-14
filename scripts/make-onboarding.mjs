/**
 * Připraví obrázky pro uvítací obrazovku z ilustrací ve složce `grafika/`.
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

/** Zdrojový soubor → náš název. Tři kroky uvítání. */
const OBRAZKY = [
  ['ChatGPT Image 14. 8. 2026 11_17_50 (1).png', 'objevuj'],
  ['ChatGPT Image 14. 8. 2026 11_17_50 (5).png', 'plan'],
  ['ChatGPT Image 14. 8. 2026 11_17_50 (6).png', 'denik'],
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
Celkem ${Math.round(celkem / 1024)} kB do ${path.relative(ROOT, CIL)}`)
