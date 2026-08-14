/**
 * Ověří, že to, co vyrobí formulář „Přidat místo“, je platné místo.
 *
 *   npm run check-form
 *
 * Formulář a kontrola dat sdílejí kód (src/data/newPlace.js a validate.js).
 * Tenhle skript sahá na ten samý kód z Node, takže hlídá, že se nerozejdou:
 * hotový záznam musí mít přesně 29 polí ve správném pořadí, projít kontrolou
 * a jeho `id` musí odpovídat konvenci a být volné.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { zkontrolujMisto, zkontrolujData, KLICE, ID_REGEX } from '../src/data/validate.js'
import { sestavMisto, vyrobId, slug } from '../src/data/newPlace.js'
import { spocitejOkoli } from '../src/core/geo.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mista = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'places.json'), 'utf8'))
const obsazena = new Set(mista.map((p) => p.id))

let selhalo = 0
const bod = (popis, ok, dukaz) => {
  if (!ok) selhalo++
  console.log(`  ${ok ? 'ok   ' : 'CHYBA'} ${popis.padEnd(50)} ${dukaz}`)
}

/* ---------- typicky vyplněný formulář ---------- */

console.log('Běžně vyplněné místo\n')

const vyplneno = {
  n: 'Vodopád U Tří Smrků',
  sh: 'Krátká zastávka hned u silnice.',
  k: 'Vodopády',
  t: 'Vodopád',
  z: 'Rakousko',
  r: 'Tyrolsko',
  c: 'Zdarma',
  d: '1-2 h',
  s: 'květen-říjen',
  ch: 'Ano',
  ps: 'Ano',
  p: 'Parkování u zatáčky, dál pěšky.',
  f: 'Prý tu kdysi mlynář schoval zvon.',
  g: ['pohorky', 'voda'],
  col: ['rychlovka', 'zdarma'],
  lat: 47.26921,
  lon: 11.40411,
}

const m = sestavMisto(vyplneno, { vsechna: mista, okoli: spocitejOkoli })

bod('má přesně 29 polí', Object.keys(m).length === 29, `${Object.keys(m).length} polí`)
bod('pole jsou ve správném pořadí', Object.keys(m).join('|') === KLICE.join('|'), 'sedí se schématem')

const nalezy = zkontrolujMisto(m, { znamaId: new Set([...obsazena, m.id]) })
const chyby = nalezy.filter((x) => x.uroven === 'chyba')
bod('projde kontrolou bez chyby', chyby.length === 0, chyby.length ? chyby[0].zprava : 'žádná chyba')

bod('id odpovídá konvenci', ID_REGEX.test(m.id), m.id)
bod('id je volné', !obsazena.has(m.id), m.id)
bod(
  'id se skládá jako u importu CSV',
  m.id === `${slug(vyplneno.n)}-921`,
  `slug + poslední tři číslice šířky (${vyplneno.lat})`
)
bod('okolí se dopočítalo', m.nb.length > 0 && m.nb.length <= 6, `${m.nb.length} sousedů, nejbližší ${m.nb[0]?.d} km`)
bod('sousedi existují', m.nb.every((x) => obsazena.has(x.id)), 'všechna id sedí')
bod('sousedi jsou seřazení', m.nb.every((x, i) => i === 0 || x.d >= m.nb[i - 1].d), 'od nejbližšího')

/* ---------- prázdný formulář ---------- */

console.log('\nProzatím prázdný formulář\n')

const prazdne = sestavMisto({}, { vsechna: mista, okoli: spocitejOkoli })
bod('nespadne', !!prazdne, 'objekt vznikl')
bod('má taky 29 polí', Object.keys(prazdne).length === 29, `${Object.keys(prazdne).length} polí`)

const prazdneChyby = zkontrolujMisto(prazdne).filter((x) => x.uroven === 'chyba')
bod('kontrola si stěžuje na nevyplněné', prazdneChyby.length > 0, `${prazdneChyby.length} chyb k doplnění`)
bod(
  'chyby ukazují na konkrétní pole',
  prazdneChyby.every((x) => x.pole !== undefined),
  `třeba [${prazdneChyby[0].pole}] ${prazdneChyby[0].zprava}`
)

/* ---------- zabrané id ---------- */

console.log('\nOšetření kolizí a nástrah\n')

const existujici = mista[0]
const naHrane = vyrobId(existujici.n, existujici.lat, obsazena)
bod('při zabraném id se vylosuje jiné', !obsazena.has(naHrane), naHrane)

// String(47.4).slice(-3) by dalo „7.4" a takové id kontrola odmítne
const kratka = vyrobId('Test', 47.4, new Set())
bod('krátká zeměpisná šířka nerozbije id', ID_REGEX.test(kratka), kratka)
const bezSouradnic = vyrobId('Test', null, new Set())
bod('chybějící šířka nerozbije id', ID_REGEX.test(bezSouradnic), bezSouradnic)
const jenDiakritika = vyrobId('Žluťoučký kůň', 47.12345, new Set())
bod('diakritika v názvu', ID_REGEX.test(jenDiakritika), jenDiakritika)

/* ---------- nové místo vedle stávajících dat ---------- */

console.log('\nSpolu se stávajícími daty\n')

const spolecne = zkontrolujData([...mista, m])
const noveChyby = spolecne.nalezy.filter((x) => x.uroven === 'chyba')
bod('celá sada s novým místem projde', noveChyby.length === 0, noveChyby.length ? noveChyby[0].zprava : 'bez chyby')

console.log()
if (selhalo) {
  console.log(`NEPROŠLO – ${selhalo} kontrol selhalo`)
  process.exit(1)
}
console.log('Formulář vyrábí platná místa.')
