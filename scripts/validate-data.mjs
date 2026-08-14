/**
 * Kontrola dat míst.
 *
 *   npm run validate
 *
 * Kontroluje `places.json` i přihrádku `places-nova.json`, a to **dohromady** –
 * jinak by neprošla duplicitní id přes hranici souborů ani vazby v `nb`.
 *
 * Samotná pravidla jsou v src/data/validate.js, ať je formulář na přidání místa
 * kontroluje úplně stejně. Tenhle soubor je jen obal: načti, zavolej, vypiš.
 *
 * Návratový kód 1 při chybě, 0 při čistém výsledku (varování kód nemění).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { zkontrolujData, KLICE } from '../src/data/validate.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILE = path.join(ROOT, 'src', 'data', 'places.json')
const FILE_NOVA = path.join(ROOT, 'src', 'data', 'places-nova.json')

const barva = process.stdout.isTTY && !process.env.NO_COLOR
const cerveny = (s) => (barva ? `\x1b[31m${s}\x1b[0m` : s)
const zluty = (s) => (barva ? `\x1b[33m${s}\x1b[0m` : s)
const zeleny = (s) => (barva ? `\x1b[32m${s}\x1b[0m` : s)
const seda = (s) => (barva ? `\x1b[90m${s}\x1b[0m` : s)

/** Načte soubor s místy. Přihrádka smí chybět, hlavní soubor ne. */
function nactiMista(soubor, nepovinny = false) {
  let raw
  try {
    raw = fs.readFileSync(soubor, 'utf8')
  } catch {
    if (nepovinny) return []
    console.error(cerveny(`Soubor ${path.relative(ROOT, soubor)} se nepodařilo přečíst.`))
    process.exit(1)
  }
  try {
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) throw new Error('není to pole')
    return data
  } catch (e) {
    console.error(cerveny(`${path.relative(ROOT, soubor)} není platný JSON:`), e.message)
    process.exit(1)
  }
}

const zaklad = nactiMista(FILE)
const nova = nactiMista(FILE_NOVA, true)
const places = [...zaklad, ...nova]

const { nalezy, chyb, varovani } = zkontrolujData(places)

/* ---------- výpis ---------- */

console.log(
  `Kontroluji ${places.length} míst` +
    ` – ${zaklad.length} v places.json` +
    (nova.length ? ` + ${nova.length} v places-nova.json` : '') +
    '\n'
)

if (nalezy.length) {
  // seskupit podle místa, ať se to dá číst
  const podleMista = new Map()
  for (const n of nalezy) {
    const klic = n.index >= 0 ? `${n.index + 1}. ${n.id || '(bez id)'}` : 'obecné'
    if (!podleMista.has(klic)) podleMista.set(klic, [])
    podleMista.get(klic).push(n)
  }
  for (const [misto, seznam] of podleMista) {
    console.log(seda(misto))
    for (const n of seznam) {
      const znacka = n.uroven === 'chyba' ? cerveny('  chyba   ') : zluty('  varování')
      console.log(`${znacka} ${n.pole ? seda(`[${n.pole}] `) : ''}${n.zprava}`)
    }
  }
  console.log()
}

/* ---------- souhrn ---------- */

const idcka = places.map((p) => p?.id)
const souhrn = [
  ['míst', places.length],
  ['unikátních id', new Set(idcka).size],
  ['sad klíčů', new Set(places.map((p) => Object.keys(p ?? {}).join('|'))).size],
  ['klíčů na místo', KLICE.length],
  ['vazeb na sousedy', places.reduce((n, p) => n + (Array.isArray(p?.nb) ? p.nb.length : 0), 0)],
  ['míst s fotkou', places.filter((p) => p?.img).length],
  ['míst s parkovištěm', places.filter((p) => p?.parking).length],
]
for (const [k, v] of souhrn) console.log(`  ${String(k).padEnd(20)} ${v}`)

console.log()
if (chyb) {
  console.log(cerveny(`NEPROŠLO – ${chyb} chyb, ${varovani} varování`))
  process.exit(1)
}
console.log(zeleny(`V pořádku${varovani ? ` – ${varovani} varování` : ''}`))
