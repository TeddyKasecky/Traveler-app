/**
 * Import CSV „vse-dohromady-v3“ a záloha/obnova uživatelských dat.
 *
 * Čtení souborů a hlášky řeší panel filtrů, tady je jen logika.
 *
 * POZOR na import CSV – chová se přesně jako dřív, i s tím, co je na tom divné:
 *   - id se skládá jinak než v places.json: slug názvu oříznutý na 40 znaků
 *     plus poslední tři znaky zeměpisné šířky (ne tři číslice pořadí),
 *   - `col` zůstane u všech míst prázdné, takže po importu zmizí kolekce
 *     i dlaždice v Objevuj (NAPADY.md N3),
 *   - sousedi se dopočítají znovu: všechno do 45 km, nejvýš šest,
 *   - výsledek se uloží do localStorage jako dataOverride (~565 kB).
 */

import { dkm } from './geo.js'

/** Kombinující diakritika – viz komentář ve search.js. */
const DIAKRITIKA = new RegExp('[\\u0300-\\u036f]', 'g')

/**
 * Rozebere CSV. Zvládá uvozovky, zdvojené uvozovky uvnitř i konce řádků CRLF.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCSV(text) {
  const rows = []
  let row = []
  let cur = ''
  let inq = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inq) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"'
          i++
        } else inq = false
      } else cur += ch
    } else if (ch === '"') inq = true
    else if (ch === ',') {
      row.push(cur)
      cur = ''
    } else if (ch === '\n' || ch === '\r') {
      if (cur !== '' || row.length) {
        row.push(cur)
        rows.push(row)
        row = []
        cur = ''
      }
      if (ch === '\r' && text[i + 1] === '\n') i++
    } else cur += ch
  }
  if (cur !== '' || row.length) {
    row.push(cur)
    rows.push(row)
  }
  return rows
}

/** Slug pro id. Doslovný přepis původní funkce včetně pořadí kroků. */
const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(DIAKRITIKA, '')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)

/**
 * Převede CSV na pole míst.
 * @param {string} text  obsah souboru, klidně i s BOM
 * @returns {Array<Record<string, any>>}
 * @throws {Error} když chybí povinné sloupce
 */
export function mistaZCsv(text) {
  // Excel ukládá CSV se značkou pořadí bajtů (U+FEFF). Musí pryč, jinak
  // by první sloupec v hlavičce nešel najít. Zapsané kódem, ať je to vidět.
  const cisty = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows = parseCSV(cisty)
  const h = rows[0]
  const ix = (n) => h.indexOf(n)
  if (['Název', 'Kategorie', 'Latitude', 'Longitude'].some((n) => ix(n) < 0)) {
    throw new Error('V CSV chybí některý z povinných sloupců.')
  }
  const g = (r, n) => (ix(n) >= 0 ? r[ix(n)] || '' : '')

  const data = rows
    .slice(1)
    .filter((r) => r.length > 3)
    .map((r) => ({
      id: `${slug(r[ix('Název')])}-${String(r[ix('Latitude')]).slice(-3)}`,
      n: r[ix('Název')],
      k: r[ix('Kategorie')],
      t: g(r, 'Typ'),
      z: g(r, 'Země'),
      r: g(r, 'Oblast') || g(r, 'Země'),
      c: g(r, 'Zdarma/Placené'),
      d: g(r, 'Doba návštěvy'),
      ch: g(r, 'Child friendly'),
      ps: g(r, 'Psi'),
      s: g(r, 'Sezóna'),
      p: g(r, 'Popis'),
      f: g(r, 'Zajímavost'),
      sh: g(r, 'Krátce'),
      g: g(r, 'Výbava') ? g(r, 'Výbava').split(', ') : [],
      col: [],
      w: g(r, 'Web/Info'),
      ig: g(r, 'Instagram'),
      av: g(r, 'Alpský vůdce'),
      bs: g(r, 'Topo bergsteigen'),
      pdf: g(r, 'Topo PDF'),
      price: g(r, 'Cena 2026 (den/dospělý)').replace(' [ověřeno 7/2026]', ''),
      pv: g(r, 'Cena 2026 (den/dospělý)').includes('[ověřeno'),
      pn: '',
      lat: parseFloat(r[ix('Latitude')]),
      lon: parseFloat(r[ix('Longitude')]),
    }))
    .filter((p) => !isNaN(p.lat))

  // dopočítej okolí
  for (const p of data) {
    p.nb = data
      .map((q) => ({ id: q.id, d: +dkm(p, q).toFixed(1) }))
      .filter((x) => x.id !== p.id && x.d <= 45)
      .sort((a, b) => a.d - b.d)
      .slice(0, 6)
  }
  return data
}

/* ================= záloha a obnova ================= */

/**
 * Data pro zálohu.
 *
 * POZOR: priority (`prio`) se schválně neexportují – tak to bylo v původní
 * aplikaci, přestože obnova je načíst umí. Je to nesymetrie, ne záměr;
 * čeká na rozhodnutí jako NAPADY.md N2.
 *
 * @param {{notes:object, stav:object, rating:object, plan:string[]}} store
 */
export function zalohaData(store) {
  return {
    notes: store.notes,
    stav: store.stav,
    rating: store.rating,
    plan: store.plan,
    exported: new Date().toISOString(),
  }
}

/**
 * Nalije zálohu do storu. Poznámky, stavy, hodnocení a priority se slučují,
 * plán se přepíše celý.
 * @param {object} store
 * @param {object} d  rozparsovaný JSON ze souboru
 */
export function obnovZalohu(store, d) {
  store.notes = Object.assign(store.notes, d.notes || {})
  store.stav = Object.assign(store.stav, d.stav || {})
  store.rating = Object.assign(store.rating, d.rating || {})
  store.prio = Object.assign(store.prio, d.prio || {})
  if (Array.isArray(d.plan)) store.plan = d.plan
}

/** Stáhne objekt jako soubor JSON. */
export function stahniJson(data, nazev) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }))
  a.download = nazev
  a.click()
}
