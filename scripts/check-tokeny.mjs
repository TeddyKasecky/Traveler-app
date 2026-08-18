/**
 * Že návrhové tokeny drží pohromadě a aplikace je čitelná v obou režimech.
 *
 *   npm run check-tokeny
 *
 * PROČ TENHLE SKRIPT VZNIKL: nahrazuje `check-css`, který porovnával 338 CSS
 * pravidel proti `reference/index-original.html`. Vizuální redesign ten vztah
 * vědomě zrušil (viz VZHLED.md a PARITA.md §10 Q14), takže tamta kontrola
 * ztratila smysl. Tahle hlídá to, co je na novém uspořádání snadné pokazit:
 *
 *   1. barva zapsaná natvrdo mimo `tokens.css` – rozejde se s paletou
 *      a hlavně se nepřebarví v tmavém režimu,
 *   2. tmavý blok, který zapomněl na proměnnou, kterou světlý má,
 *   3. dva tmavé bloky (`@media` a `[data-motiv]`), které se rozešly,
 *   4. `var(--neco)`, co nikde není definované – projeví se jako neviditelný
 *      prvek a oko to nenajde,
 *   5. kontrast textu proti ploše pod ním, v obou režimech.
 *
 * Čistý Node, žádný prohlížeč – běží za zlomek vteřiny.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STYLY = path.join(ROOT, 'src', 'styles')

const barvy = process.stdout.isTTY && !process.env.NO_COLOR
const zeleny = (s) => (barvy ? `[32m${s}[0m` : s)
const cerveny = (s) => (barvy ? `[31m${s}[0m` : s)

let ok = 0
let chyb = 0

const projde = (popis, dukaz = '') => (ok++, console.log(`  ${zeleny('ok   ')} ${popis.padEnd(48)} ${dukaz}`))
const selze = (popis, dukaz = '') => (chyb++, console.log(`  ${cerveny('CHYBA')} ${popis.padEnd(48)} ${dukaz}`))

const bezKomentaru = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')

/* ---------- načtení ---------- */

// Na Windows vrací readdirSync cesty se zpětným lomítkem – sjednotit,
// jinak by seznam výjimek nikdy nesedl.
const souboryCss = fs
  .readdirSync(STYLY, { recursive: true })
  .map((f) => String(f).replaceAll('\\', '/'))
  .filter((f) => f.endsWith('.css'))

const tokeny = bezKomentaru(fs.readFileSync(path.join(STYLY, 'tokens.css'), 'utf8'))

/**
 * Soubory, kde smí být barva zapsaná natvrdo, a proč.
 *
 * `fonts.css` je generovaný a barvy v něm nejsou. Druhá výjimka bývala
 * `offlinemap.css`, který si držel vlastní lokální proměnné na kreslení
 * podkladu do plátna. S malovanou mapou se barvy přestěhovaly do `tokens.css`
 * (`--mapa-*`) a výjimka odpadla – tenhle soubor je teď pod kontrolou taky.
 */
const VYJIMKY_CSS = ['fonts.css']

console.log('Návrhové tokeny\n')

/* ---------- 1. barvy natvrdo mimo tokens.css ---------- */

const HEX = /#[0-9A-Fa-f]{3,8}\b/g
const nalezene = []
for (const f of souboryCss) {
  if (f === 'tokens.css' || VYJIMKY_CSS.some((v) => f.endsWith(v))) continue
  const telo = bezKomentaru(fs.readFileSync(path.join(STYLY, f), 'utf8'))
  for (const h of telo.match(HEX) || []) nalezene.push(`${f}: ${h}`)
}
if (nalezene.length) selze('žádná barva natvrdo mimo tokens.css', nalezene.join(' · '))
else projde('žádná barva natvrdo mimo tokens.css', `${souboryCss.length} souborů`)

/* ---------- 2. barvy natvrdo v JavaScriptu ---------- */

const SRC = path.join(ROOT, 'src')
const souboryJs = fs
  .readdirSync(SRC, { recursive: true })
  .map((f) => String(f).replaceAll('\\', '/'))
  .filter((f) => f.endsWith('.js'))
const vJs = []
for (const f of souboryJs) {
  const telo = fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  // Záložní hodnota v token('--x', '#hex') a v getComputedStyle je správné
  // použití, ne obcházení tokenů: kdyby proměnná chyběla (starý build
  // v cache), musí se kreslit aspoň něčím. Ostatní hexy jsou chyba.
  const bezZaloh = telo
    .replace(/token\(\s*'--[a-z0-9-]+'\s*,\s*'[^']*'\s*\)/gi, '')
    .replace(/b\('--[a-z0-9-]+',\s*'[^']*'\)/gi, '')
  for (const h of bezZaloh.match(HEX) || []) vJs.push(`${f}: ${h}`)
}
if (vJs.length) selze('žádná barva natvrdo v JavaScriptu', vJs.join(' · '))
else projde('žádná barva natvrdo v JavaScriptu', `${souboryJs.length} souborů`)

/* ---------- 3. světlý a tmavý blok mají stejnou sadu ---------- */

/** Vytáhne `--jmeno: hodnota` z jednoho bloku. */
function promenne(blok) {
  const m = {}
  for (const [, jmeno, hodnota] of blok.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) m[jmeno] = hodnota.trim()
  return m
}

const blokSvetly = tokeny.slice(tokeny.indexOf(':root{'), tokeny.indexOf('@media'))
const blokMedia = tokeny.slice(tokeny.indexOf(':root:not([data-motiv="svetly"])'), tokeny.indexOf(':root[data-motiv="tmavy"]'))
const blokAtribut = tokeny.slice(tokeny.indexOf(':root[data-motiv="tmavy"]'))

const svetle = promenne(blokSvetly)
const media = promenne(blokMedia)
const atribut = promenne(blokAtribut)

/** Proměnné, které tmavý režim schválně dědí ze světlého. */
const DEDI_SE = new Set(['--zn-moss', '--zn-fern', '--zn-ochre', '--zn-orange', '--zn-sienna', '--zn-ivory', '--zn-forest',
  '--line', '--r', '--r-s', '--r-l', '--r-pill', '--stisk', '--pop', '--f-disp', '--f-body',
  '--paper', '--card', '--ink', '--ink2', '--inkfade', '--na-zvyrazneni'])

const chybiVTmavem = Object.keys(svetle).filter(
  (k) => !DEDI_SE.has(k) && !media[k] && /#|rgba?\(/.test(svetle[k])
)
if (chybiVTmavem.length) selze('tmavý režim nezapomněl na barvu', chybiVTmavem.join(' · '))
else projde('tmavý režim nezapomněl na barvu', `${Object.keys(media).length} proměnných`)

/* ---------- 4. oba tmavé bloky se nerozešly ---------- */

const rozdily = []
for (const k of new Set([...Object.keys(media), ...Object.keys(atribut)])) {
  if (media[k] !== atribut[k]) rozdily.push(`${k}: @media „${media[k] ?? '—'}" vs [data-motiv] „${atribut[k] ?? '—'}"`)
}
if (rozdily.length) selze('oba tmavé bloky jsou shodné', rozdily.join(' · '))
else projde('oba tmavé bloky jsou shodné', `${Object.keys(media).length} proměnných`)

/* ---------- 5. každé var(--x) je definované ---------- */

const definovane = new Set([...Object.keys(svetle), ...Object.keys(media), ...Object.keys(atribut)])
/** Proměnné nastavované za běhu z JavaScriptu na konkrétním prvku. */
// Proměnné nastavované za běhu na konkrétním prvku, ne v `:root`.
// `--chipc` odešlo s chipy kategorií, `--sous/--hranice/--voda/--more` s tím,
// že barvy malované mapy se přestěhovaly do `tokens.css` jako `--mapa-*`.
// Přibylo `--ps` (měřítko špendlíku podle zoomu, `map/map.js`). Odešly
// `--kv`/`--ks`: kresby krajiny se přestěhovaly z DOM do MapLibre, kde je
// velikost vlastností symbolu, ne proměnnou v CSS.
const ZA_BEHU = new Set(['--pc', '--cc', '--mc', '--dc', '--ps'])

const nezname = new Set()
for (const f of souboryCss) {
  const telo = bezKomentaru(fs.readFileSync(path.join(STYLY, f), 'utf8'))
  for (const [, jmeno] of telo.matchAll(/var\((--[a-z0-9-]+)/gi)) {
    if (!definovane.has(jmeno) && !ZA_BEHU.has(jmeno)) nezname.add(`${f}: ${jmeno}`)
  }
}
if (nezname.size) selze('každé var(--x) má definici', [...nezname].join(' · '))
else projde('každé var(--x) má definici', `${definovane.size} tokenů`)

/* ---------- 6. kontrast ---------- */

/** Relativní jas podle WCAG. */
function jas(hex) {
  const h = hex.replace('#', '')
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const l = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]
}
const pomer = (a, b) => {
  const [x, y] = [jas(a), jas(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

/**
 * Dvojice popředí/pozadí, které se v aplikaci opravdu potkávají.
 * Práh 4,5 na text, 3,0 na grafiku (ikony, pruhy, špendlíky).
 */
const DVOJICE = [
  ['--text', '--bg', 4.5, 'text na stránce'],
  ['--text', '--plocha', 4.5, 'text na kartě'],
  ['--text2', '--bg', 4.5, 'tlumený text na stránce'],
  ['--text2', '--plocha', 4.5, 'tlumený text na kartě'],
  ['--text3', '--bg', 3.0, 'nejtlumenější text'],
  ['--na-akcentu', '--akcent', 4.5, 'text na primárním tlačítku'],
  ['--na-zvyrazneni', '--zvyrazneni', 4.5, 'text na zvýraznění'],
  ['--na-upozorneni', '--upozorneni', 4.5, 'text na upozornění'],
  ['--na-nav', '--plocha-nav', 4.5, 'popisky ve spodní liště'],
  ...['--rust', '--moss', '--pine', '--sky', '--clay', '--lake', '--plum', '--sun', '--night', '--sand'].map((k) => [
    k,
    '--plocha',
    3.0,
    `kategorie ${k.slice(2)}`,
  ]),
]

for (const [rezim, sada] of [['světlý', svetle], ['tmavý', { ...svetle, ...media }]]) {
  const spatne = []
  for (const [popredi, pozadi, prah, popis] of DVOJICE) {
    const a = sada[popredi]
    const b = sada[pozadi]
    if (!a || !b || !a.startsWith('#') || !b.startsWith('#')) continue
    const p = pomer(a, b)
    if (p < prah) spatne.push(`${popis} ${p.toFixed(2)} < ${prah}`)
  }
  if (spatne.length) selze(`kontrast – ${rezim} režim`, spatne.join(' · '))
  else projde(`kontrast – ${rezim} režim`, `${DVOJICE.length} dvojic`)
}

/* ---------- shrnutí ---------- */

console.log(`\n${ok}/${ok + chyb} kontrol prošlo`)
process.exit(chyb ? 1 : 0)
