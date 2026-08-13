/**
 * Kontrola src/data/places.json.
 *
 *   npm run validate
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

const barva = process.stdout.isTTY && !process.env.NO_COLOR
const cerveny = (s) => (barva ? `\x1b[31m${s}\x1b[0m` : s)
const zluty = (s) => (barva ? `\x1b[33m${s}\x1b[0m` : s)
const zeleny = (s) => (barva ? `\x1b[32m${s}\x1b[0m` : s)
const seda = (s) => (barva ? `\x1b[90m${s}\x1b[0m` : s)

let raw
try {
  raw = fs.readFileSync(FILE, 'utf8')
} catch {
  console.error(cerveny(`Soubor ${path.relative(ROOT, FILE)} se nepodařilo přečíst.`))
  process.exit(1)
}

let places
try {
  places = JSON.parse(raw)
} catch (e) {
  console.error(cerveny('places.json není platný JSON:'), e.message)
  process.exit(1)
}

const { nalezy, chyb, varovani } = zkontrolujData(places)

/* ---------- výpis ---------- */

console.log(`Kontroluji ${path.relative(ROOT, FILE)} – ${places.length} míst\n`)

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
