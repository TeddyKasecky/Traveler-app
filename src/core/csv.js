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

import { spocitejOkoli } from './geo.js'

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

  // dopočítej okolí – pravidlo je sdílené s formulářem a s `npm run slouc`
  for (const p of data) p.nb = spocitejOkoli(p, data)
  return data
}

/* ================= záloha a obnova ================= */

/**
 * Data pro zálohu.
 *
 * DOPLNĚNO (odsouhlaseno): původní aplikace zálohovala jen poznámky, stavy,
 * hodnocení a plán. Priority (`prio`) chyběly, přestože obnova je načíst uměla
 * (NAPADY.md N2), a vlastní vyfocené fotky s předvolbami taky ne. Dokud appka
 * běžela na jednom místě, nikomu to nevadilo.
 *
 * Jenže přechod na vlastní adresu je pro prohlížeč nový web a localStorage se
 * mezi adresami nesdílí – záloha je jediná cesta, jak si data přenést. S děravou
 * zálohou by se **nenávratně ztratily vlastní fotky**. Proto je tu teď všechno.
 *
 * Starší soubory záloh zůstávají čitelné, obnova si s chybějícími klíči poradí.
 *
 * @param {{notes:object, stav:object, rating:object, plan:string[], planDny:number[], prio:object}} store
 * @param {object} [photos]  obsah `vandrbuch:photos`
 * @param {object} [prefs]   obsah `vandrbuch:prefs`
 */
export function zalohaData(store, photos, prefs) {
  return {
    notes: store.notes,
    stav: store.stav,
    rating: store.rating,
    plan: store.plan,
    // Bez těchhle tří řádků by se rozdělení na dny a odložené výpravy při
    // záloze tiše ztratily a poznalo by se to až po obnově na jiném telefonu.
    planDny: store.planDny || [],
    vypravy: store.vypravy || [],
    vypravaNazev: store.vypravaNazev || '',
    slozky: store.slozky || [],
    vypravaSlozka: store.vypravaSlozka || '',
    vypravaVytvoreno: store.vypravaVytvoreno || 0,
    // Srpen 2026: bez cest, bloků a achievementů by obnova na jiném telefonu
    // tiše zahodila celý archiv a všechny seznamy – stejná past jako kdysi fotky.
    cesta: store.cesta || null,
    cesty: store.cesty || [],
    bloky: store.bloky || {},
    achievementy: store.achievementy || {},
    prio: store.prio,
    photos: photos || {},
    prefs: prefs || {},
    exported: new Date().toISOString(),
  }
}

/**
 * Nalije zálohu do storu. Slučuje se všechno kromě plánu, ten se přepíše celý.
 *
 * Objekty `photos` a `prefs` se mutují na místě – ostatní moduly na ně drží
 * odkaz, takže se nesmí vyměnit za nové.
 *
 * @param {object} store
 * @param {object} d  rozparsovaný JSON ze souboru
 * @param {object} [photos]
 * @param {object} [prefs]
 */
export function obnovZalohu(store, d, photos, prefs) {
  store.notes = Object.assign(store.notes, d.notes || {})
  store.stav = Object.assign(store.stav, d.stav || {})
  store.rating = Object.assign(store.rating, d.rating || {})
  store.prio = Object.assign(store.prio, d.prio || {})
  if (Array.isArray(d.plan)) store.plan = d.plan
  // Ze starší zálohy `planDny` a `vypravy` chybí – pak se plán prostě nedělí
  // na dny a výprava je jedna, jako bylo dřív.
  if (Array.isArray(d.planDny)) store.planDny = d.planDny
  if (Array.isArray(d.vypravy)) store.vypravy = d.vypravy
  if (typeof d.vypravaNazev === 'string') store.vypravaNazev = d.vypravaNazev
  if (Array.isArray(d.slozky)) store.slozky = d.slozky
  if (typeof d.vypravaSlozka === 'string') store.vypravaSlozka = d.vypravaSlozka
  if (typeof d.vypravaVytvoreno === 'number') store.vypravaVytvoreno = d.vypravaVytvoreno
  // Probíhající cesta se bere jen tehdy, když žádná neběží – rozjetou cestu
  // v telefonu nesmí záloha zaklepnout. Archiv se slučuje podle času vyjetí.
  if (d.cesta && typeof d.cesta === 'object' && !store.cesta) store.cesta = d.cesta
  if (Array.isArray(d.cesty)) {
    const mam = new Set((store.cesty || []).map((c) => c.zacatek))
    store.cesty = [...(store.cesty || []), ...d.cesty.filter((c) => c && !mam.has(c.zacatek))].sort(
      (a, b) => b.zacatek - a.zacatek
    )
  }
  if (d.bloky && typeof d.bloky === 'object') store.bloky = Object.assign(store.bloky || {}, d.bloky)
  if (d.achievementy && typeof d.achievementy === 'object')
    store.achievementy = Object.assign(store.achievementy || {}, d.achievementy)
  if (photos && d.photos) Object.assign(photos, d.photos)
  if (prefs && d.prefs) Object.assign(prefs, d.prefs)
}

/** Stáhne objekt jako soubor JSON. */
export function stahniJson(data, nazev) {
  stahniSoubor(JSON.stringify(data, null, 1), nazev, 'application/json')
}

/**
 * Stáhne libovolný text jako soubor. Používá to záloha i export trasy do GPX.
 *
 * @param {string} text
 * @param {string} nazev
 * @param {string} typ  MIME typ
 */
export function stahniSoubor(text, nazev, typ) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: typ }))
  a.download = nazev
  a.click()
}
