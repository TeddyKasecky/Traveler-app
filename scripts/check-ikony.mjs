/**
 * Jednotnost ikon a názvů: jedna věc = jedno jméno = jedna ikona.
 *
 *   npm run build && node scripts/check-ikony.mjs
 *
 * Vzniklo kvůli tomu, že uložené místo se na Mapě jmenovalo „Uložená"
 * se záložkou a v Seznamu „Chci navštívit" se srdcem – jedna hodnota
 * (`stav: 'wish'`), dvě tváře, a vypadalo to jako dvě různé funkce.
 *
 * Kontroluje se přímo zdrojový kód (řetězce v template literals), ne DOM:
 * stavové ikony se kreslí až po akci uživatele a smoke by je bez klikací
 * choreografie neviděl.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')

const barvy = process.stdout.isTTY && !process.env.NO_COLOR
const ok = (t, d) => console.log(`  ${barvy ? '\x1b[32mok\x1b[0m' : 'ok'}    ${t.padEnd(46)} ${d ?? ''}`)
const chyba = (t, d) => {
  console.log(`  ${barvy ? '\x1b[31mCHYBA\x1b[0m' : 'CHYBA'} ${t.padEnd(46)} ${d ?? ''}`)
  selhalo++
}
let selhalo = 0
let celkem = 0
const test = (nazev, podminka, dukaz) => {
  celkem++
  podminka ? ok(nazev, dukaz) : chyba(nazev, dukaz)
}

/** Všechny zdrojáky + index.html jako jeden text s mapou výskytů. */
function nactiZdroje() {
  const soubory = []
  const projdi = (slozka) => {
    for (const d of fs.readdirSync(slozka, { withFileTypes: true })) {
      const cela = path.join(slozka, d.name)
      if (d.isDirectory()) projdi(cela)
      else if (d.name.endsWith('.js')) soubory.push(cela)
    }
  }
  projdi(SRC)
  soubory.push(path.join(ROOT, 'index.html'))
  return soubory.map((f) => ({ f: path.relative(ROOT, f), text: fs.readFileSync(f, 'utf8') }))
}

const zdroje = nactiZdroje()
const vsude = (vzor) => zdroje.filter(({ text }) => vzor.test(text)).map(({ f }) => f)

console.log('\nJednotnost ikon\n')

/* ---------- 1. sprite: každá ikona existuje a je jen jednou ---------- */

const sprite = fs.readFileSync(path.join(SRC, 'icons', 'sprite.svg'), 'utf8')
const definovane = [...sprite.matchAll(/id="(i-[a-z0-9-]+)"/g)].map((m) => m[1])
const duplicitni = definovane.filter((x, i) => definovane.indexOf(x) !== i)
test('sprite bez duplicitních symbolů', duplicitni.length === 0, duplicitni.join(', ') || `${definovane.length} ikon`)

const pouzite = new Set()
for (const { text } of zdroje) {
  for (const m of text.matchAll(/IC\('(i-[a-z0-9-]+)'/g)) pouzite.add(m[1])
  for (const m of text.matchAll(/#(i-[a-z0-9-]+)"/g)) pouzite.add(m[1])
  for (const m of text.matchAll(/[?&]i: '(i-[a-z0-9-]+)'/g)) pouzite.add(m[1])
  for (const m of text.matchAll(/i: '(i-[a-z0-9-]+)'/g)) pouzite.add(m[1])
  for (const m of text.matchAll(/ikona: '(i-[a-z0-9-]+)'/g)) pouzite.add(m[1])
}
const neexistujici = [...pouzite].filter((i) => !definovane.includes(i))
test('každá použitá ikona ve sprite existuje', neexistujici.length === 0, neexistujici.join(', ') || `${pouzite.size} použitých`)

/* ---------- 2. stav wish = „Uložená“ se záložkou, nikde srdce ---------- */

// Srdce bývalo na uloženém místě v Seznamu a detailu; teď smí zůstat jen
// v datech kolekcí (romantika) – ne u stavu wish.
const srdceUStavu = zdroje.filter(({ text }) => /wish[^\n]{0,120}i-srdce|i-srdce[^\n]{0,120}wish/.test(text))
test('stav wish nikde nekreslí srdce', srdceUStavu.length === 0, srdceUStavu.map((z) => z.f).join(', ') || 'záložka všude')

const chciNavstivit = vsude(/Chci navštívit/)
test('popisek „Chci navštívit" už neexistuje', chciNavstivit.length === 0, chciNavstivit.join(', ') || 'přejmenováno')

// Ve filtru stavu znamená wish „nenavštívená“ – tak se musí i jmenovat.
const filtrStavu = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
test(
  'filtr stavu wish se jmenuje Nenavštívená',
  /value="wish">Nenavštívená|data-s="wish">(?:<svg[^>]*><use href="#i-boot"\/><\/svg>)?Nenavštívená/.test(
    filtrStavu.replace(/\s+/g, ' ')
  ),
  ''
)

/* ---------- 3. kategorie mají právě jednu ikonu, a to z KAT ---------- */

const kategorie = fs.readFileSync(path.join(SRC, 'data', 'categories.js'), 'utf8')
const ikonyKategorii = [...kategorie.matchAll(/i: '(i-[a-z0-9-]+)'/g)].map((m) => m[1])
test('každá kategorie má ikonu', ikonyKategorii.length >= 10, `${ikonyKategorii.length} kategorií`)
const chybejici = ikonyKategorii.filter((i) => !definovane.includes(i))
test('ikony kategorií existují ve sprite', chybejici.length === 0, chybejici.join(', ') || 'všechny')

// Dvě kategorie se stejnou ikonou by na mapě splynuly – špendlík nese jen
// ikonu a barvu. (Kolekce a nálady smějí ikony sdílet, ty se nekreslí vedle
// sebe jako rozlišovací znak.)
const dvojite = ikonyKategorii.filter((x, i) => ikonyKategorii.indexOf(x) !== i)
test('žádné dvě kategorie nesdílí ikonu', dvojite.length === 0, dvojite.join(', ') || 'všech 10 jedinečných')

console.log(`\n${celkem - selhalo}/${celkem} kontrol prošlo`)
if (selhalo) process.exit(1)
