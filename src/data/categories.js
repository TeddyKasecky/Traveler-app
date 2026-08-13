/**
 * Kategorie míst – barva a ikona pro každou z nich.
 *
 * Pořadí je závazné: v tomhle pořadí se vykreslují chipy v hlavičce.
 * Barvy jsou odkazy na tokeny z styles/tokens.css, nikdy natvrdo zapsané hodnoty.
 * Ikony jsou id symbolů ze sprite (bez mřížky).
 *
 * Přidání kategorie = jeden záznam sem + použití hodnoty v poli `k` v places.json.
 *
 * @typedef {Object} Kategorie
 * @property {string} c  barva – `var(--…)` z tokens.css
 * @property {string} i  id symbolu ve sprite, např. `i-ferrata`
 */

/** @type {Record<string, Kategorie>} */
export const KAT = {
  'Ferraty':             { c: 'var(--rust)',  i: 'i-ferrata' },
  'Bikeparky':           { c: 'var(--moss)',  i: 'i-bike' },
  'Soutěsky':            { c: 'var(--pine)',  i: 'i-gorge' },
  'Vodopády':            { c: 'var(--sky)',   i: 'i-falls' },
  'Hory a túry':         { c: 'var(--clay)',  i: 'i-mount' },
  'Jezera':              { c: 'var(--lake)',  i: 'i-lake' },
  'Jeskyně a podzemí':   { c: 'var(--plum)',  i: 'i-cave' },
  'Města a památky':     { c: 'var(--sun)',   i: 'i-castle' },
  'Spaní':               { c: 'var(--night)', i: 'i-van' },
  'Ostatní zajímavosti': { c: 'var(--sand)',  i: 'i-spark' },
}

/** Povolené hodnoty pole `k`. Používá validátor i formulář na přidání místa. */
export const KAT_KEYS = Object.keys(KAT)
