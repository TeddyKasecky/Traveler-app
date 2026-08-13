/**
 * Jednorázová migrace dat: reference/index-original.html → src/data/places.json
 *
 * Ponecháno v repozitáři schválně. Dá se kdykoli spustit znovu a doložit tím,
 * že places.json je pořád přesná kopie dat z původní aplikace:
 *
 *   node scripts/extract-places.mjs --check
 *
 * Bez přepínače soubor zapíše, s --check jen porovná a nic nemění.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'reference', 'index-original.html')
const OUT = path.join(ROOT, 'src', 'data', 'places.json')
const CHECK_ONLY = process.argv.includes('--check')

/** Vytáhne z originálu textovou podobu literálu `const RAW = [...]`. */
function extractRawLiteral() {
  const html = fs.readFileSync(SRC, 'utf8')
  const line = html.split('\n').find((l) => l.trimStart().startsWith('const RAW'))
  if (!line) throw new Error('Řádek s `const RAW` se v originále nenašel.')
  return line.slice(line.indexOf('['), line.lastIndexOf(']') + 1)
}

const literal = extractRawLiteral()
const places = JSON.parse(literal)

/* ---------- kontrola, že parsování nic neztratilo ---------- */

const restringified = JSON.stringify(places)
const identical = restringified === literal

console.log('Zdroj:', path.relative(ROOT, SRC))
console.log('  literál v originále :', Buffer.byteLength(literal, 'utf8'), 'B')
console.log('  po JSON round-tripu :', Buffer.byteLength(restringified, 'utf8'), 'B')
console.log('  textově shodné      :', identical ? 'ano' : 'NE – rozdíly níže')

if (!identical) {
  // Najdi konkrétní místa, kde se zápis liší. Zajímá nás jen to, jestli se liší
  // zápis (např. čísla), nebo skutečná hodnota. Hodnoty se porovnávají zvlášť níž.
  const diffs = []
  let i = 0
  while (i < literal.length && diffs.length < 12) {
    if (literal[i] !== restringified[i]) {
      const a = literal.slice(Math.max(0, i - 45), i + 25)
      const b = restringified.slice(Math.max(0, i - 45), i + 25)
      diffs.push({ pos: i, orig: a, novy: b })
      // přeskoč zbytek tohoto objektu, ať nevypisuju tisíc navazujících posunů
      const next = literal.indexOf('},{', i)
      if (next < 0) break
      i = next + 3
      // po posunu se indexy rozjedou, dál porovnávat nemá smysl
      break
    }
    i++
  }
  diffs.forEach((d) => {
    console.log('\n  pozice', d.pos)
    console.log('    originál:', JSON.stringify(d.orig))
    console.log('    po parse:', JSON.stringify(d.novy))
  })
}

/* ---------- tvrdé kontroly struktury ---------- */

const EXPECTED_COUNT = 580
const EXPECTED_KEYS = 'id|n|k|t|z|r|c|d|ch|ps|s|p|f|sh|av|bs|pdf|price|pv|pn|parking|g|col|w|ig|lat|lon|nb|img'

const problems = []

if (places.length !== EXPECTED_COUNT) {
  problems.push(`počet míst je ${places.length}, čekáno ${EXPECTED_COUNT}`)
}

const ids = places.map((p) => p.id)
if (new Set(ids).size !== ids.length) {
  problems.push('id nejsou unikátní')
}

const badKeys = places.filter((p) => Object.keys(p).join('|') !== EXPECTED_KEYS)
if (badKeys.length) {
  problems.push(`${badKeys.length} míst má jinou sadu nebo pořadí klíčů (první: ${badKeys[0].id})`)
}

const idSet = new Set(ids)
const dangling = places.flatMap((p) => (p.nb || []).filter((x) => !idSet.has(x.id)).map((x) => `${p.id}→${x.id}`))
if (dangling.length) problems.push(`nb odkazuje na neexistující místa: ${dangling.slice(0, 5).join(', ')}`)

console.log('\nStruktura:')
console.log('  počet míst          :', places.length)
console.log('  unikátních id       :', new Set(ids).size)
console.log('  sad klíčů           :', new Set(places.map((p) => Object.keys(p).join('|'))).size, '(musí být 1)')
console.log('  klíčů na objekt     :', new Set(places.map((p) => Object.keys(p).length)).size === 1 ? Object.keys(places[0]).length : 'NEKONZISTENTNÍ')
console.log('  vazeb nb            :', places.reduce((n, p) => n + (p.nb || []).length, 0), '| nefunkčních:', dangling.length)

if (problems.length) {
  console.error('\nCHYBY:')
  problems.forEach((p) => console.error('  -', p))
  process.exit(1)
}

/* ---------- zápis / porovnání ---------- */

// Odsazení dvěma mezerami: soubor upravuješ ručně, diff má ukázat jedno pole,
// ne celý objekt. Do buildu se stejně dostane bez mezer, Vite JSON přeparsuje.
const json = JSON.stringify(places, null, 2) + '\n'

if (CHECK_ONLY) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null
  if (current === null) {
    console.error('\nplaces.json neexistuje.')
    process.exit(1)
  }
  const same = JSON.stringify(JSON.parse(current)) === restringified
  console.log('\nporovnání s places.json:', same ? 'DATA SEDÍ' : 'DATA SE LIŠÍ')
  process.exit(same ? 0 : 1)
}

fs.writeFileSync(OUT, json, 'utf8')
console.log('\nZapsáno:', path.relative(ROOT, OUT))
console.log('  velikost:', Buffer.byteLength(json, 'utf8'), 'B |', json.split('\n').length, 'řádků')

/* ---------- ověření po zápisu ---------- */

const reread = JSON.parse(fs.readFileSync(OUT, 'utf8'))
const roundTripOk = JSON.stringify(reread) === restringified
console.log('  round-trip po zápisu:', roundTripOk ? 'BAJTOVĚ SHODNÝ' : 'LIŠÍ SE')
if (!roundTripOk) process.exit(1)
