/**
 * Vyrobí ikony aplikace z src/assets/icon.svg.
 *
 *   node scripts/make-icons.mjs
 *
 * Spouští se ručně, jen když se změní kresba. Výsledek je v gitu.
 *
 * Vzniknou tři soubory:
 *   public/icon-192.png      pro manifest a hostovanou verzi
 *   public/icon-512.png      pro splash screen při instalaci
 *   src/assets/icon-192.png  pro logo v hlavičce – schválně v src/, ne v public/:
 *                            jen soubory z src/ umí Vite vložit do single-file
 *                            varianty jako data URI. Z public/ by zůstal odkaz
 *                            na soubor, který u otevření z disku neexistuje.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src', 'assets', 'icon.svg')

const cile = [
  { cesta: path.join(ROOT, 'public', 'icon-192.png'), velikost: 192 },
  { cesta: path.join(ROOT, 'public', 'icon-512.png'), velikost: 512 },
  { cesta: path.join(ROOT, 'src', 'assets', 'icon-192.png'), velikost: 192 },
]

const svg = fs.readFileSync(SRC)
fs.mkdirSync(path.join(ROOT, 'public'), { recursive: true })

for (const { cesta, velikost } of cile) {
  await sharp(svg, { density: 384 })
    .resize(velikost, velikost)
    .png({ compressionLevel: 9, palette: true })
    .toFile(cesta)
  const { size } = fs.statSync(cesta)
  console.log(`  ${path.relative(ROOT, cesta).padEnd(28)} ${velikost}×${velikost}  ${size} B`)
}

console.log('\nHotovo. Ikona se změnila? Nezapomeň na sw.js – prohlížeč si starou drží v cache.')
