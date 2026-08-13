/**
 * Ověří, že odkazy na fotky v places.json pořád vedou na existující soubor.
 *
 *   npm run check-images
 *
 * Neptá se na každou adresu zvlášť. Používá API Wikimedia Commons, které umí
 * odpovědět na 50 souborů jedním dotazem – 262 fotek se tak zvládne šesti dotazy
 * místo dvou set šedesáti. Je to rychlejší a hlavně to Commons neotravuje;
 * při dotazování po jedné začne Wikimedia po chvíli vracet 429.
 *
 * Potřebuje připojení k internetu. Schválně to NENÍ součást pre-commit hooku.
 * Nic neopravuje ani nedoplňuje, jen hlásí.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILE = path.join(ROOT, 'src', 'data', 'places.json')

const argv = process.argv.slice(2)
const limitIdx = argv.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : Infinity

const DAVKA = 50 // maximum, které API bere na jeden dotaz
const TIMEOUT = 20000

// Wikimedia vyžaduje popisný User-Agent, jinak dotazy omezuje.
// https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy
// Musí být čistě ASCII – hlavičky neunesou háčky ani čárky.
const UA = 'Vandrbuch-linkcheck/1.0 (personal travel app; checking own photo links)'

const barva = process.stdout.isTTY && !process.env.NO_COLOR
const cerveny = (s) => (barva ? `\x1b[31m${s}\x1b[0m` : s)
const zluty = (s) => (barva ? `\x1b[33m${s}\x1b[0m` : s)
const zeleny = (s) => (barva ? `\x1b[32m${s}\x1b[0m` : s)
const seda = (s) => (barva ? `\x1b[90m${s}\x1b[0m` : s)

/**
 * Z adresy `…/Special:FilePath/Nazev%20souboru.jpg?width=800`
 * vytáhne název souboru tak, jak mu rozumí API.
 */
function nazevSouboru(url) {
  const m = url.match(/\/Special:FilePath\/([^?#]+)/)
  if (!m) return null
  try {
    return decodeURIComponent(m[1]).replace(/_/g, ' ')
  } catch {
    return null
  }
}

const places = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const bezFotky = places.filter((p) => !p.img).length
const sFotkou = places.filter((p) => typeof p.img === 'string' && p.img !== '').slice(0, LIMIT)

console.log(`Kontroluji ${sFotkou.length} fotek přes API Commons. ${bezFotky} míst fotku nemá – to je v pořádku.\n`)

/** @type {{id:string, url:string, stav:string}[]} */
const problemy = []

/** Adresy, které nejdou na Special:FilePath, se přes API zkontrolovat nedají. */
const ukoly = []
for (const p of sFotkou) {
  const nazev = nazevSouboru(p.img)
  if (!nazev) problemy.push({ id: p.id, url: p.img, stav: 'není adresa Special:FilePath' })
  else ukoly.push({ id: p.id, url: p.img, nazev })
}

/** Klíč pro porovnání – API vrací názvy s velkým prvním písmenem a mezerami. */
const klic = (s) => {
  const t = s.replace(/^File:/i, '').replace(/_/g, ' ').trim()
  return (t.charAt(0).toUpperCase() + t.slice(1)).toLowerCase()
}

async function davka(polozky) {
  const titles = polozky.map((u) => `File:${u.nazev}`).join('|')
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2' +
    '&prop=imageinfo&iiprop=url|mime&redirects=1&titles=' +
    encodeURIComponent(titles)

  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), TIMEOUT)
  let data
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ac.signal })
    if (!r.ok) throw new Error(`API vrátilo HTTP ${r.status}`)
    data = await r.json()
  } finally {
    clearTimeout(t)
  }

  // API názvy normalizuje a rozplétá přesměrování; ať víme, co komu odpovídá.
  const prevod = new Map()
  for (const n of data.query?.normalized ?? []) prevod.set(klic(n.from), klic(n.to))
  for (const n of data.query?.redirects ?? []) prevod.set(klic(n.from), klic(n.to))

  const stranky = new Map()
  for (const s of data.query?.pages ?? []) stranky.set(klic(s.title), s)

  for (const u of polozky) {
    let k = klic(u.nazev)
    for (let i = 0; i < 3 && prevod.has(k); i++) k = prevod.get(k)
    const s = stranky.get(k)

    if (!s) problemy.push({ ...u, stav: 'API o souboru nic nevrátilo' })
    else if (s.missing) problemy.push({ ...u, stav: 'soubor na Commons neexistuje' })
    else if (!s.imageinfo?.length) problemy.push({ ...u, stav: 'stránka existuje, ale není to soubor' })
    else if (!/^image\//.test(s.imageinfo[0].mime || '')) {
      problemy.push({ ...u, stav: `není obrázek (${s.imageinfo[0].mime || 'bez typu'})` })
    }
  }
}

let hotovo = 0
for (let i = 0; i < ukoly.length; i += DAVKA) {
  const cast = ukoly.slice(i, i + DAVKA)
  try {
    await davka(cast)
  } catch (e) {
    console.error(cerveny(`Dávka ${i / DAVKA + 1} selhala: ${e.message}`))
    process.exit(1)
  }
  hotovo += cast.length
  console.log(seda(`  ${hotovo}/${ukoly.length}`))
}

console.log()
if (problemy.length) {
  console.log(cerveny(`Nefunkční: ${problemy.length} z ${sFotkou.length}\n`))
  for (const p of problemy) {
    console.log(`  ${cerveny(p.stav.padEnd(30))} ${p.id}`)
    console.log(`  ${seda(p.url)}\n`)
  }
  console.log(zluty('Adresy neopravuj odhadem – najdi soubor na commons.wikimedia.org a zkopíruj novou.'))
  process.exit(1)
}
console.log(zeleny(`Všech ${sFotkou.length} fotek na Commons existuje.`))
