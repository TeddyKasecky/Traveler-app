/**
 * Stáhne fonty od Googlu k nám, ať aplikace nezávisí na cizím serveru.
 *
 *   node scripts/fetch-fonts.mjs
 *
 * Spouští se ručně, jen když je potřeba fonty obnovit. Výsledek je v gitu.
 *
 * PROČ TO NENÍ JEN "VEZMI VARIABILNÍ FONT Z NPM":
 * Google posílá variabilní soubory, ale v CSS je přiřazuje jen ke konkrétním
 * vahám – Playfair Display k 600 a 700, Inter k 400, 600 a 800. Prohlížeč pak
 * jinou váhu dopočítá na nejbližší dostupnou. Proto se `font-weight:700`
 * (v CSS je 18x) vykresluje jako 800 a nadpis se 900 jako Playfair 700.
 *
 * Kdybychom si připojili plný variabilní font s rozsahem 100–900, vykreslilo by
 * se 700 jako skutečných 700 a celé písmo by zhublo. Proto se @font-face pravidla
 * kopírují doslova i s `unicode-range` a mění se jen adresa souboru.
 *
 * Kurzíva se vynechává: v celém CSS není ani jedno `font-style:italic`
 * a obě místa s <i>/<em> ji výslovně ruší.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'src', 'styles', 'fonts')
const OUT_CSS = path.join(ROOT, 'src', 'styles', 'fonts.css')

/**
 * Písma podle grafického manuálu: Playfair Display na nadpisy, Inter na text.
 * Do léta 2026 tu byl Fraunces – dotaz opsaný z původního index.html.
 *
 * Playfair jen 600 a 700. V CSS je osmnáct míst s font-weight:700 a několik
 * s 900; při výběru písma prohlížeč pro 900 sestoupí na nejbližší nižší
 * dostupnou váhu, tedy 700. Díky tomu se nemusí přepisovat ani jedna
 * deklarace váhy a přitom nikde nevznikne uměle ztučnělý text.
 */
const GOOGLE_CSS =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;600;800&display=swap'

/** Bez prohlížečového User-Agenta pošle Google starší formát než woff2. */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** Necháváme jen znakové sady, které aplikace potřebuje. Čeština je v latin-ext. */
const SUBSETY = ['latin', 'latin-ext']

fs.mkdirSync(OUT_DIR, { recursive: true })

console.log('Stahuji CSS od Googlu…')
const css = await (await fetch(GOOGLE_CSS, { headers: { 'User-Agent': UA } })).text()

/* ---------- rozebrat na jednotlivá @font-face ---------- */

const bloky = []
const re = /\/\* ([a-z-]+) \*\/\s*@font-face \{([^}]+)\}/g
let m
while ((m = re.exec(css))) {
  const [, subset, telo] = m
  const pole = (k) => (telo.match(new RegExp(`${k}:\\s*([^;]+);`)) || [])[1]?.trim()
  bloky.push({
    subset,
    rodina: pole('font-family')?.replace(/['"]/g, ''),
    styl: pole('font-style'),
    vaha: pole('font-weight'),
    display: pole('font-display'),
    rozsah: pole('unicode-range'),
    url: (telo.match(/url\(([^)]+)\)/) || [])[1],
  })
}

const vybrane = bloky.filter((b) => SUBSETY.includes(b.subset) && b.styl === 'normal')
const vynechane = bloky.filter((b) => !vybrane.includes(b))

console.log(`  nalezeno ${bloky.length} @font-face, beru ${vybrane.length}`)
console.log(`  vynechávám: ${[...new Set(vynechane.map((b) => `${b.rodina} ${b.styl} ${b.subset}`))].join(', ')}`)

if (!vybrane.length) {
  console.error('Z odpovědi Googlu se nedalo nic vytáhnout – změnil formát?')
  process.exit(1)
}

/* ---------- stáhnout soubory (víc pravidel často sdílí jeden soubor) ---------- */

const soubory = new Map() // vzdálená adresa → místní název
for (const b of vybrane) {
  if (soubory.has(b.url)) continue
  // Mezera v názvu rodiny („Playfair Display“) by udělala mezeru v názvu souboru
  // a ta se v url() v CSS musí kódovat. Jednodušší je ji tady rovnou nahradit.
  const nazev = `${b.rodina.toLowerCase().replace(/\s+/g, '-')}-${b.subset}.woff2`
  soubory.set(b.url, nazev)
}

let celkem = 0
for (const [url, nazev] of soubory) {
  const buf = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer())
  fs.writeFileSync(path.join(OUT_DIR, nazev), buf)
  celkem += buf.length
  console.log(`  ${nazev.padEnd(26)} ${String(buf.length).padStart(7)} B`)
}
console.log(`  celkem ${celkem} B (${Math.round(celkem / 1024)} kB)`)

/* ---------- vygenerovat naše fonts.css ---------- */

const hlavicka = `/* Vygenerováno: node scripts/fetch-fonts.mjs – needituj ručně.
 *
 * Pravidla jsou doslovný opis toho, co posílá Google, jen s místními adresami.
 * Váhy jsou schválně jednotlivé hodnoty, ne rozsah: s plným variabilním fontem
 * 100–900 by se font-weight:700 (v CSS osmnáctkrát) vykreslilo jako skutečných
 * 700 a celé písmo by zhublo.
 *
 * Kurzíva vynechána – v CSS není ani jedno font-style:italic.
 */
`

const pravidla = vybrane
  .map((b) => {
    const nazev = soubory.get(b.url)
    return [
      `/* ${b.subset} */`,
      `@font-face {`,
      `  font-family: '${b.rodina}';`,
      `  font-style: ${b.styl};`,
      `  font-weight: ${b.vaha};`,
      b.display ? `  font-display: ${b.display};` : null,
      `  src: url('./fonts/${nazev}') format('woff2');`,
      `  unicode-range: ${b.rozsah};`,
      `}`,
    ]
      .filter(Boolean)
      .join('\n')
  })
  .join('\n\n')

fs.writeFileSync(OUT_CSS, `${hlavicka}\n${pravidla}\n`, 'utf8')
console.log(`\nZapsáno: ${path.relative(ROOT, OUT_CSS)} (${vybrane.length} pravidel)`)
