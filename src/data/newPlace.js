/**
 * Sestavení nového místa – čistá logika bez DOM.
 *
 * Odděleno od formuláře schválně: takhle jde stejný kód spustit i z Node
 * (`scripts/check-form.mjs`) a ověřit, že to, co formulář vyrobí, projde
 * úplně stejnou kontrolou jako `npm run validate`.
 */

import { KLICE } from './validate.js'

/** Kombinující diakritika – viz komentář ve core/search.js. */
const DIAKRITIKA = new RegExp('[\\u0300-\\u036f]', 'g')

/**
 * Slug pro id. Doslova stejný postup jako u importu CSV (core/csv.js), včetně
 * oříznutí na 40 znaků. Díky němu vzniká občas dvojitá pomlčka – když se slug
 * uřízne zrovna na pomlčce. V datech je takových id osm, kontrola s tím počítá.
 *
 * @param {string} s
 * @returns {string}
 */
export const slug = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIAKRITIKA, '')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)

/**
 * Vyrobí `id` v konvenci, kterou používá aplikace při importu CSV:
 * slug názvu + poslední tři číslice zeměpisné šířky.
 *
 * V datech to tak má 311 z 580 míst; zbytek pochází z ještě starších zdrojů
 * a přepočítat je nejde, protože `id` se nikdy nemění (visí na něm poznámky).
 * Pro nová místa se držíme toho, co dělá kód aplikace.
 *
 * Když už takové `id` existuje, přilepí se náhodné trojčíslí. Unikátní musí
 * být celé `id`, ne to číslo – čísla se v datech běžně opakují.
 *
 * @param {string} nazev
 * @param {number} lat
 * @param {Set<string>|string[]} [obsazena]
 * @returns {string}
 */
export function vyrobId(nazev, lat, obsazena = new Set()) {
  const zabrane = obsazena instanceof Set ? obsazena : new Set(obsazena)
  const zaklad = slug(nazev) || 'misto'
  // Ze zeměpisné šířky jen číslice: `String(47.4).slice(-3)` by dalo „7.4“
  // a takové id by kontrola odmítla.
  const cislice = String(lat ?? '').replace(/\D/g, '')
  const konec = (cislice.slice(-3) || '000').padStart(3, '0')

  let id = `${zaklad}-${konec}`
  let pokus = 0
  while (zabrane.has(id) && pokus < 200) {
    id = `${zaklad}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`
    pokus++
  }
  return id
}

/**
 * Prázdné místo se všemi 29 klíči ve správném pořadí.
 *
 * Klíč se nikdy nevynechává – když se hodnota nehodí, zůstane prázdná.
 * Tak jsou postavená všechna data, viz `data/schema.md`.
 *
 * @returns {Record<string, any>}
 */
export function prazdneMisto() {
  return {
    id: '', n: '', k: '', t: '', z: '', r: '', c: '', d: '', ch: '', ps: '',
    s: '', p: '', f: '', sh: '', av: '', bs: '', pdf: '', price: '', pv: false,
    pn: '', parking: null, g: [], col: [], w: '', ig: '', lat: 0, lon: 0,
    nb: [], img: '',
  }
}

/**
 * Poskládá hotové místo z vyplněných hodnot.
 *
 * @param {Record<string, any>} hodnoty  co uživatel vyplnil
 * @param {Object} [opts]
 * @param {Array<{id:string, lat:number, lon:number}>} [opts.vsechna]  data pro dopočet `nb`
 * @param {(m:{id:string,lat:number,lon:number}, v:Array<any>) => Array<any>} [opts.okoli]
 *        funkce na dopočet sousedů; předává se, aby tenhle modul nemusel znát geo
 * @returns {Record<string, any>}
 */
export function sestavMisto(hodnoty, { vsechna = [], okoli } = {}) {
  const m = { ...prazdneMisto(), ...hodnoty }

  m.lat = Number(m.lat) || 0
  m.lon = Number(m.lon) || 0
  m.pv = !!m.pv
  m.g = Array.isArray(m.g) ? m.g.filter(Boolean) : []
  m.col = Array.isArray(m.col) ? m.col.filter(Boolean) : []

  if (!m.id) m.id = vyrobId(m.n, m.lat, new Set(vsechna.map((p) => p.id)))
  m.nb = okoli ? okoli(m, vsechna) : []

  // Klíče do závazného pořadí, ať se hotový záznam neliší od zbytku souboru.
  return Object.fromEntries(KLICE.map((k) => [k, m[k]]))
}

/**
 * Vypíše místo tak, jak se má vložit do `places-nova.json`.
 * Dvě mezery odsazení, stejně jako zbytek datových souborů.
 *
 * @param {Record<string, any>} misto
 * @returns {string}
 */
export const naText = (misto) => JSON.stringify(misto, null, 2)
