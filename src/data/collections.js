/**
 * Kolekce – dlaždice „Podle nálady“ na záložce Objevuj.
 *
 * Pořadí je závazné, v tomhle pořadí se dlaždice vykreslují.
 * Dlaždice, ke které nesedí ani jedno místo, se přeskakuje.
 *
 * @typedef {Object} Kolekce
 * @property {string} k  klíč, který se hledá v poli `col` u místa
 * @property {string} n  název na dlaždici
 * @property {string} d  podtitulek
 * @property {string} i  id symbolu ve sprite
 * @property {string} c  barva – `var(--…)` z tokens.css
 */

/** @type {Kolekce[]} */
export const COLL = [
  { k: 'rychlovka',   n: 'Rychlovka',        d: 'do 2 hodin',           i: 'i-bolt',    c: 'var(--sun)' },
  { k: 'dest',        n: 'Když prší',        d: 'pod střechou',         i: 'i-rain',    c: 'var(--plum)' },
  { k: 'koupacka',    n: 'Na koupačku',      d: 'když je vedro',        i: 'i-swim',    c: 'var(--lake)' },
  { k: 'zdarma',      n: 'Zdarma',           d: 'bez vstupného',        i: 'i-euro',    c: 'var(--moss)' },
  { k: 'ferrata',     n: 'Ferraty',          d: 'vytáhnout set',        i: 'i-ferrata', c: 'var(--rust)' },
  { k: 'bike',        n: 'Na kolo',          d: 'parky a stezky',       i: 'i-bike',    c: 'var(--moss)' },
  { k: 'spani',       n: 'Kde přespat',      d: 'parkály a bivaky',     i: 'i-van',     c: 'var(--night)' },
  { k: 'deti',        n: 'S dětmi',          d: 'zvládnou to všichni',  i: 'i-kid',     c: 'var(--sky)' },
  { k: 'zima',        n: 'I v zimě',         d: 'mimo sezónu',          i: 'i-snow',    c: 'var(--sky)' },
  { k: 'sunset',      n: 'Na západ slunce',  d: 'večerní výlety',       i: 'i-sun',     c: 'var(--sun)' },
  { k: 'paddleboard', n: 'Paddleboard',      d: 'jezera od parkoviště', i: 'i-paddle',  c: 'var(--lake)' },
  { k: 'psi',         n: 'Se psem',          d: 'psi vítáni',           i: 'i-paw',     c: 'var(--rust)' },
]

/** Hodnoty, které smí být v poli `col` u místa. */
export const COLL_KEYS = COLL.map((c) => c.k)
