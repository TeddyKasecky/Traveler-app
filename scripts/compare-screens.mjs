/**
 * Porovná snímky pixel po pixelu.
 *
 *   node scripts/screenshots.mjs --baseline     (jednou, před zásahem)
 *   node scripts/screenshots.mjs                (po zásahu)
 *   node scripts/compare-screens.mjs            → základna vs. aktuální stav
 *
 *   node scripts/compare-screens.mjs --vs-original   → historický režim
 *
 * Pro každou dvojici vypíše, kolik pixelů se liší a kde. Do .screenshots/diff/
 * uloží masku – červeně to, co nesedí. Tolerance na kanál je kvůli vyhlazování
 * písma, které se mezi během a během může lišit o jednotku.
 *
 * PROČ ZÁKLADNA A NE ORIGINÁL: viz hlavička `screenshots.mjs`. Po vizuálním
 * redesignu se od původní aplikace liší úmyslně všechno, takže to číslo nic
 * neříká. Proti základně naopak řekne přesně to, co potřebujeme slyšet:
 * „změnilo se tohle a nic víc“.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, '.screenshots')
const OUT = path.join(DIR, 'diff')

/** Rozdíl na kanál, který ještě považujeme za shodu. */
const PRAH = 12

const jeOriginal = process.argv.includes('--vs-original')

/** Odkud se berou obě strany porovnání a jak se jmenuje sloupec. */
const A = jeOriginal ? { dir: DIR, pripona: 'stara' } : { dir: path.join(DIR, 'baseline'), pripona: null }
const B = jeOriginal ? { dir: DIR, pripona: 'nova' } : { dir: path.join(DIR, 'aktualni'), pripona: null }

for (const s of [A, B]) {
  if (fs.existsSync(s.dir)) continue
  console.error(`Chybí ${path.relative(ROOT, s.dir)}/ – spusť nejdřív node scripts/screenshots.mjs${s === A && !jeOriginal ? ' --baseline' : ''}`)
  process.exit(1)
}
fs.mkdirSync(OUT, { recursive: true })

/** Jména snímků bez přípony verze. V režimu základny mají obě strany stejný název. */
const pary = [
  ...new Set(
    fs
      .readdirSync(A.dir)
      .filter((f) => f.endsWith('.png'))
      .map((f) => (A.pripona ? f.replace(/-(stara|nova)\.png$/, '') : f.replace(/\.png$/, '')))
  ),
].sort()

console.log(jeOriginal ? 'stará vs. nová\n' : 'základna vs. aktuální stav\n')
console.log('obrazovka             rozdílných px      podíl   svislý rozsah\n')

for (const p of pary) {
  const a = path.join(A.dir, A.pripona ? `${p}-${A.pripona}.png` : `${p}.png`)
  const b = path.join(B.dir, B.pripona ? `${p}-${B.pripona}.png` : `${p}.png`)
  if (!fs.existsSync(a) || !fs.existsSync(b)) continue

  const [ra, rb] = await Promise.all([
    sharp(a).raw().toBuffer({ resolveWithObject: true }),
    sharp(b).raw().toBuffer({ resolveWithObject: true }),
  ])
  if (ra.info.width !== rb.info.width || ra.info.height !== rb.info.height) {
    console.log(`${p}: JINÝ ROZMĚR`)
    continue
  }

  const { width, height, channels } = ra.info
  const maska = Buffer.alloc(width * height * 3, 255)
  let rozdilnych = 0
  let minY = Infinity
  let maxY = -Infinity

  for (let i = 0, px = 0; i < ra.data.length; i += channels, px++) {
    const d = Math.max(
      Math.abs(ra.data[i] - rb.data[i]),
      Math.abs(ra.data[i + 1] - rb.data[i + 1]),
      Math.abs(ra.data[i + 2] - rb.data[i + 2])
    )
    if (d <= PRAH) continue
    rozdilnych++
    maska[px * 3] = 255
    maska[px * 3 + 1] = 0
    maska[px * 3 + 2] = 0
    const y = Math.floor(px / width)
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  const pct = ((rozdilnych / (width * height)) * 100).toFixed(3)
  const rozsah = rozdilnych ? `y ${minY}–${maxY} z ${height}` : 'shodné'
  console.log(`${p.padEnd(20)} ${String(rozdilnych).padStart(10)} px  ${pct.padStart(8)} %   ${rozsah}`)

  if (rozdilnych) {
    await sharp(maska, { raw: { width, height, channels: 3 } })
      .png()
      .toFile(path.join(OUT, `${p}.png`))
  }
}

console.log(`\nMasky rozdílů: ${path.relative(ROOT, OUT)}`)
