/**
 * Vysype přihrádku `places-nova.json` do hlavního `places.json`.
 *
 *   npm run slouc
 *
 * Přihrádka existuje kvůli mobilu: hlavní soubor má 26 tisíc řádků a vkládat do
 * něj text na telefonu je utrpení. Tenhle skript je úklid – přesune nasbíraná
 * místa do hlavního souboru, přepočítá okolí a přihrádku vyprázdní.
 *
 * Není povinný. Aplikace i kontrola pracují s obojím dohromady, takže se nic
 * nerozbije, když se dlouho nepustí.
 *
 * Co dělá navíc: přepočítá `nb` u **všech** míst. Formulář umí spočítat okolí
 * jen novému místu; že nové místo mají ve svém okolí i sousedi, zařídí teprve
 * tohle. Bez přepočtu by nové místo své sousedy vidělo, ale oni jeho ne.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { zkontrolujData, KLICE } from '../src/data/validate.js'
import { spocitejOkoli } from '../src/core/geo.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HLAVNI = path.join(ROOT, 'src', 'data', 'places.json')
const PRIHRADKA = path.join(ROOT, 'src', 'data', 'places-nova.json')

const barva = process.stdout.isTTY && !process.env.NO_COLOR
const cerveny = (s) => (barva ? `\x1b[31m${s}\x1b[0m` : s)
const zeleny = (s) => (barva ? `\x1b[32m${s}\x1b[0m` : s)

const zaklad = JSON.parse(fs.readFileSync(HLAVNI, 'utf8'))
const nova = JSON.parse(fs.readFileSync(PRIHRADKA, 'utf8'))

if (!nova.length) {
  console.log('Přihrádka places-nova.json je prázdná – není co slučovat.')
  process.exit(0)
}

console.log(`Slučuji ${nova.length} nových míst do ${zaklad.length} stávajících.\n`)
for (const p of nova) console.log(`  + ${p.id.padEnd(46)} ${p.n}`)

/* ---------- sloučit ---------- */

const vse = [...zaklad, ...nova]

/** Klíče se seřadí do závazného pořadí, ať je diff čitelný. */
const serad = (p) => Object.fromEntries(KLICE.filter((k) => k in p).map((k) => [k, p[k]]))

console.log('\nPřepočítávám okolí u všech míst…')
let zmeneno = 0
for (const p of vse) {
  const nove = spocitejOkoli(p, vse)
  if (JSON.stringify(nove) !== JSON.stringify(p.nb)) zmeneno++
  p.nb = nove
}
console.log(`  změnilo se u ${zmeneno} míst`)

const serazene = vse.map(serad)

/* ---------- zkontrolovat dřív, než se něco zapíše ---------- */

const { chyb, varovani, nalezy } = zkontrolujData(serazene)
if (chyb) {
  console.log(cerveny(`\nNEPROŠLO – ${chyb} chyb. Nic jsem nezapsal.\n`))
  for (const n of nalezy.filter((x) => x.uroven === 'chyba').slice(0, 20)) {
    console.log(`  ${n.id || '(bez id)'} [${n.pole}] ${n.zprava}`)
  }
  process.exit(1)
}

/* ---------- zapsat ---------- */

fs.writeFileSync(HLAVNI, `${JSON.stringify(serazene, null, 2)}\n`, 'utf8')
fs.writeFileSync(PRIHRADKA, '[]\n', 'utf8')

console.log(zeleny(`\nHotovo – places.json má ${serazene.length} míst, přihrádka je prázdná.`))
if (varovani) console.log(`(${varovani} varování, spusť npm run validate pro výpis)`)
console.log('\nZkontroluj diff a commitni.')
