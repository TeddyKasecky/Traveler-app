/**
 * Stav aplikace a jednoduché oznamování změn.
 *
 * Jediné místo, kde je stav. Ostatní moduly si sem sahají přes `S`, `F`, `store`,
 * `prefs` a `PHOTOS` – žádné další globální proměnné nejsou.
 *
 * Proč pub/sub a ne přímé volání: bez něj by `draw()` z map/ muselo volat
 * `renderList()` z views/, a views/ zase `draw()`. Přidání záložky by pak
 * znamenalo sáhnout do mapy. Takhle stačí složka ve views/ a záznam v routeru.
 */

import { KEY, PKEY, PREFK, nacti, uloz } from './storage.js'
// Atribut `with { type: 'json' }` vyžaduje Node, když se modul spouští mimo Vite
// (kontrolní skripty ve scripts/). Vite i prohlížeče mu rozumí taky.
import VESTAVENA_DATA from '../data/places.json' with { type: 'json' }
import { postavIndex } from './search.js'

/**
 * @typedef {Object} Misto  jedno místo z places.json – popis polí je v data/schema.md
 * @property {string} id
 * @property {string} n
 * @property {string} k
 * @property {number} lat
 * @property {number} lon
 */

/* ================= uložená data uživatele ================= */

/** Poznámky, stavy, hodnocení, plán, priority. Klíč `vandrbuch:v1`. */
export const store = nacti(KEY, {
  notes: {},
  stav: {},
  rating: {},
  plan: [],
  prio: {},
  dataOverride: null,
  seen: false,
})
export const save = () => uloz(KEY, store)

/** Vlastní vyfocené fotky, `{ [id]: dataURL }`. Klíč `vandrbuch:photos`. */
export const PHOTOS = nacti(PKEY, {})
export const savePhotos = () => uloz(PKEY, PHOTOS)

/** Předvolby dashboardu. Klíč `vandrbuch:prefs`. */
export const prefs = nacti(PREFK, {
  userName: '',
  lastMood: '',
  lastTip: '',
  bpOpen: false,
  moodUse: {},
})
export const savePrefs = () => uloz(PREFK, prefs)

/* ================= stav filtrů ================= */

/** Aktuální nastavení filtrů. Mění se na místě, nikdy se nenahrazuje. */
export const F = {
  kat: new Set(),
  q: '',
  reg: '',
  zeme: '',
  typ: '',
  free: false,
  kids: false,
  dogs: false,
  wow: false,
  fire: false,
  stav: '',
  coll: '',
}

/* ================= běhový stav ================= */

export const S = {
  /** @type {Misto[]} aktuálně platná data – vestavěná, nebo z importu CSV */
  places: [],
  /** @type {Record<string, Misto>} */
  byId: {},
  /** @type {{lat:number, lon:number}|null} */
  userPos: null,
  /** @type {string} */
  activeTab: 'home',
  /** @type {string|null} zvýrazněný špendlík na mapě */
  hiId: null,
}

/** Vestavěná data. Drží se stranou kvůli tlačítku „Vrátit vestavěná data“. */
export { VESTAVENA_DATA }

/** Přepočítá rejstřík podle id a index pro hledání. */
export function reindex() {
  for (const k in S.byId) delete S.byId[k]
  for (const p of S.places) S.byId[p.id] = p
  postavIndex(S.places)
}

/** Vymění data míst (import CSV nebo návrat k vestavěným). */
export function nastavData(data) {
  S.places = data
  reindex()
}

nastavData(store.dataOverride || VESTAVENA_DATA)

/* ================= oznamování změn ================= */

/** @type {Map<string, Function[]>} */
const posluchaci = new Map()

/**
 * Přihlásí se k odběru události. Pořadí přihlášení = pořadí volání.
 * @param {string} udalost
 * @param {Function} fn
 */
export function on(udalost, fn) {
  if (!posluchaci.has(udalost)) posluchaci.set(udalost, [])
  posluchaci.get(udalost).push(fn)
}

/**
 * Oznámí událost všem přihlášeným, v pořadí přihlášení.
 * @param {string} udalost
 * @param {unknown} [data]
 */
export function emit(udalost, data) {
  for (const fn of posluchaci.get(udalost) ?? []) fn(data)
}
