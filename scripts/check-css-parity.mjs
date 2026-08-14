/**
 * Porovná rozdělené CSS s původním <style> blokem.
 *
 *   node scripts/check-css-parity.mjs
 *
 * Rozdělení stylů do souborů nesmí změnit ani jedno pravidlo. Skript proto slepí
 * naše soubory v pořadí z index.css, obojí očistí od komentářů a bílých znaků
 * a porovná pravidlo po pravidle.
 *
 * Vypíše každý rozdíl. Očekávané a odsouhlasené rozdíly jsou vypsané v seznamu
 * POVOLENE níž – cokoli mimo něj je chyba.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STYLES = path.join(ROOT, 'src', 'styles')

/** Změny, které jsme se rozhodli udělat. Všechno ostatní musí sedět. */
const POVOLENE = [
  {
    proc: 'smazaná funkce vanScene() – šest animací a jejich třídy (NAPADY.md N8)',
    selektory: ['@keyframes vanbob', '@keyframes roadmove', '@keyframes clouddrift',
      '@keyframes flick', '@keyframes smokeup', '@keyframes twk',
      '.vanbody', '.roadanim', '.cloudA', '.cloudB', '.flick', '.smokep',
      '.smokep.s1', '.smokep.s2', '.twinkle', '.twinkle.t1', '.twinkle.t2',
      '@media (prefers-reduced-motion:reduce) > .roadanim,.cloudA,.cloudB,.flick,.smokep,.twinkle'],
  },
  {
    proc: 'oprava wizardu: z-index 60 → 1300 (byl pod backdropem) + visibility, aby zavřený nekreslil stín přes lištu',
    selektory: ['.wizard', '.wizard.show'],
  },
]

/* ---------- originál ---------- */

const html = fs.readFileSync(path.join(ROOT, 'reference', 'index-original.html'), 'utf8')
const puvodni = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'))

/* ---------- naše soubory v pořadí z index.css ---------- */

const indexCss = fs.readFileSync(path.join(STYLES, 'index.css'), 'utf8')
const vsechny = [...indexCss.matchAll(/@import\s+'([^']+)'/g)]
  .map((m) => m[1])
  .filter((p) => p.startsWith('.') && !p.endsWith('fonts.css')) // fonty a Leaflet v originále nebyly v <style>

/**
 * Styly obrazovek, které v originále vůbec nebyly. Nemají s čím se porovnávat,
 * tak se z porovnání vyjmou – jinak by se do seznamu odsouhlasených výjimek
 * musel vypsat každý jejich selektor a kontrola by ztratila smysl.
 *
 * Nejsou ale bez dozoru: níž se ověřuje, že nepřepisují žádný selektor
 * z originálu. To je jediné, čím by mohly ublížit.
 */
const NOVE_OBRAZOVKY = ['./components/addform.css', './components/pruh.css']

const poradi = vsechny.filter((p) => !NOVE_OBRAZOVKY.includes(p))
const nase = poradi.map((p) => fs.readFileSync(path.join(STYLES, p), 'utf8')).join('\n')
console.log(`Skládám ${poradi.length} souborů:\n  ${poradi.join('\n  ')}\n`)

/* ---------- rozebrat na pravidla ---------- */

const bezKomentaru = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const zhustit = (s) => s.replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').trim()

/**
 * Vrátí mapu „selektor → tělo“. Zvládne i @media a @keyframes – jejich vnitřek
 * se rozebere taky, ať se pozná, které konkrétní pravidlo se změnilo.
 */
function pravidla(css) {
  const out = new Map()
  const text = bezKomentaru(css)
  let i = 0
  while (i < text.length) {
    const otevri = text.indexOf('{', i)
    if (otevri < 0) break
    const selektor = text.slice(i, otevri).trim()
    // najdi párovou závorku
    let hloubka = 1
    let j = otevri + 1
    while (j < text.length && hloubka > 0) {
      if (text[j] === '{') hloubka++
      else if (text[j] === '}') hloubka--
      j++
    }
    const telo = text.slice(otevri + 1, j - 1)
    if (/^@(media|supports)/.test(selektor)) {
      for (const [s, t] of pravidla(telo)) out.set(`${zhustit(selektor)} > ${s}`, t)
    } else {
      out.set(zhustit(selektor), zhustit(telo))
    }
    i = j
  }
  return out
}

const a = pravidla(puvodni)
const b = pravidla(nase)

/* ---------- porovnat ---------- */

const jePovolene = (sel) => POVOLENE.find((p) => p.selektory.includes(sel))

const chybi = [...a.keys()].filter((k) => !b.has(k))
const navic = [...b.keys()].filter((k) => !a.has(k))
const zmenene = [...a.keys()].filter((k) => b.has(k) && a.get(k) !== b.get(k))

let problemu = 0
const vypis = (nadpis, seznam, detail) => {
  const necekane = seznam.filter((s) => !jePovolene(s))
  const cekane = seznam.filter((s) => jePovolene(s))
  if (cekane.length) {
    console.log(`${nadpis} – odsouhlasené (${cekane.length}):`)
    for (const s of cekane) console.log(`    ${s}   ${jePovolene(s).proc}`)
  }
  if (necekane.length) {
    problemu += necekane.length
    console.log(`\n${nadpis} – NEČEKANÉ (${necekane.length}):`)
    for (const s of necekane) {
      console.log(`    ${s}`)
      if (detail) detail(s)
    }
  }
  if (cekane.length || necekane.length) console.log()
}

console.log(`Pravidel: originál ${a.size}, naše ${b.size}\n`)
vypis('CHYBÍ proti originálu', chybi)
vypis('NAVÍC proti originálu', navic)
vypis('ZMĚNĚNÉ tělo', zmenene, (s) => {
  console.log(`      originál: ${a.get(s)}`)
  console.log(`      naše:     ${b.get(s)}`)
})

/* ---------- nové obrazovky nesmí přepisovat originál ---------- */

for (const soubor of NOVE_OBRAZOVKY) {
  const cesta = path.join(STYLES, soubor)
  if (!fs.existsSync(cesta)) continue
  const jejich = pravidla(fs.readFileSync(cesta, 'utf8'))
  const koliduje = [...jejich.keys()].filter((s) => a.has(s))
  console.log(`${soubor}: ${jejich.size} nových pravidel, mimo porovnání`)
  if (koliduje.length) {
    problemu += koliduje.length
    console.log(`    PŘEPISUJE ${koliduje.length} pravidel z originálu:`)
    for (const s of koliduje) console.log(`      ${s}`)
  }
  console.log()
}

/* ---------- pořadí ---------- */

const spolecne = [...a.keys()].filter((k) => b.has(k))
const poradiNase = [...b.keys()].filter((k) => a.has(k))
const prohozene = spolecne.filter((k, i) => poradiNase[i] !== k)
if (prohozene.length) {
  problemu += prohozene.length
  console.log(`POŘADÍ se liší u ${prohozene.length} pravidel – u shodné specificity to mění výsledek:`)
  prohozene.slice(0, 10).forEach((s) => console.log(`    ${s}`))
  console.log()
}

if (problemu) {
  console.log(`NEPROŠLO – ${problemu} nečekaných rozdílů`)
  process.exit(1)
}
console.log('CSS sedí. Jediné rozdíly jsou ty odsouhlasené.')
