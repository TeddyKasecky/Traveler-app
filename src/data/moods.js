/**
 * Nálady na záložce Domů – „Na co máme náladu?“
 *
 * Dvě z nich se chovají jinak než ostatní a nemají proto `kat`:
 *   near … přepne na Objevuj a zeptá se na polohu
 *   tip  … zavolá „Překvap mě“
 * Ostatní nastaví filtr kategorií a přepnou na mapu.
 *
 * @typedef {Object} Nalada
 * @property {string} id  klíč, ukládá se do prefs.lastMood a prefs.moodUse
 * @property {string} l   popisek na dlaždici
 * @property {string} ic  id symbolu ve sprite
 * @property {string} c   barva – `var(--…)` z tokens.css
 * @property {string[]} [kat]  kategorie, na které nálada přepne filtr
 */

/** @type {Nalada[]} */
export const HOME_MOODS = [
  { id: 'near',  l: 'Něco blízko',    ic: 'i-pinme',    c: 'var(--sky)' },
  { id: 'hory',  l: 'Hory a výhledy', ic: 'i-mount',    c: 'var(--clay)', kat: ['Hory a túry'] },
  { id: 'voda',  l: 'Voda',           ic: 'i-swim',     c: 'var(--lake)', kat: ['Jezera', 'Vodopády', 'Soutěsky'] },
  { id: 'kolo',  l: 'Kolo',           ic: 'i-bike',     c: 'var(--moss)', kat: ['Bikeparky'] },
  { id: 'dobro', l: 'Dobrodružství',  ic: 'i-ferrata',  c: 'var(--rust)', kat: ['Ferraty', 'Jeskyně a podzemí'] },
  { id: 'tip',   l: 'Překvap mě',     ic: 'i-sparkles', c: 'var(--sun)' },
]
