/**
 * Rychlé filtry nad mapou a úplný výběr kategorií v panelu Filtry.
 *
 * PROČ PĚT: předloha `grafika/…11_09_49 (1).png` má nad mapou pět pilulek.
 * Deset chipů se na telefon nevešlo a lišta se musela posouvat, takže poslední
 * čtyři nikdo neviděl.
 *
 * CO V NICH JE: od srpna 2026 „moje věci“ (uložená, Musíme!, v plánu, byli
 * jsme), ne kategorie. Zdůvodnění je u `RYCHLE` níž. Kategorie zůstávají
 * v panelu Filtry (`#katRow`) a `t` (typ) jako pilulka na Seznamu — rychlá
 * pilulka je zkratka, ne zmenšení.
 *
 * Na rozdíl od panelu filtrů se pilulka projeví hned — kliknutí rovnou překreslí
 * mapu. Tak to bylo v původní aplikaci a je to schválně: rychlý filtr je rychlý,
 * panel se potvrzuje tlačítkem.
 */

import { F } from '../core/store.js'
import { KAT } from '../data/categories.js'
import { visible } from '../core/filters.js'
import { IC } from '../icons/sprite.js'
import { pilulky } from './vzory.js'
import { draw } from '../map/map.js'
import { toast } from './toast.js'

/**
 * Pět rychlých filtrů: MOJE VĚCI, ne kategorie.
 *
 * Do srpna 2026 to bylo pět kategorií (Kempy, Výhledy, Turistika, U vody).
 * Na mapě je to ale nejmíň užitečná pětice, jakou jde vybrat: kategorii už
 * rozlišuje barva a ikona špendlíku, takže pilulka jen ubírala z toho, co je
 * vidět. Co na mapě poznat NEJDE, je, co si k místům člověk sám poznamenal —
 * a přesně to teď pilulky filtrují.
 *
 * Kategorie se neztratily: všech deset zůstává v panelu Filtry (`#katRow`)
 * a `t` (typ) je jako pilulka na Seznamu.
 *
 * Každá pilulka je stav čtyř polí filtru. „Vše“ je má všechna prázdná, takže
 * se nemusí řešit zvlášť — je to obyčejný záznam jako ostatní.
 *
 * @typedef {Object} RychlyFiltr
 * @property {string} id
 * @property {string} popisek
 * @property {string} ikona     prázdná u „Vše“ – předloha tam ikonu nemá
 * @property {boolean} ulozene  uložené srdcem
 * @property {boolean} fire     tři plamínky („Musíme!“)
 * @property {boolean} vPlanu   je v aktivní výpravě
 * @property {string} stav      '' nebo 'visited'
 */

/** @type {RychlyFiltr[]} */
export const RYCHLE = [
  { id: 'vse', popisek: 'Vše', ikona: '', ulozene: false, fire: false, vPlanu: false, stav: '' },
  { id: 'ulozene', popisek: 'Uložená', ikona: 'i-zalozka', ulozene: true, fire: false, vPlanu: false, stav: '' },
  { id: 'musime', popisek: 'Musíme!', ikona: 'i-fire', ulozene: false, fire: true, vPlanu: false, stav: '' },
  { id: 'vplanu', popisek: 'V plánu', ikona: 'i-route', ulozene: false, fire: false, vPlanu: true, stav: '' },
  { id: 'byli', popisek: 'Byli jsme', ikona: 'i-check', ulozene: false, fire: false, vPlanu: false, stav: 'visited' },
]

/** Pole filtru, kterými se rychlé pilulky přepínají. */
const POLE = ['ulozene', 'fire', 'vPlanu']

/** Sedí stav filtrů přesně na tenhle rychlý filtr? */
function jeAktivni(r) {
  if ((F.stav || '') !== r.stav) return false
  return POLE.every((k) => !!F[k] === !!r[k])
}

/** Vykreslí pilulky nad mapou a přiřadí kategorie do panelu. Volá se jednou. */
export function initChipy() {
  const el = document.getElementById('chips')
  el.innerHTML = pilulky(
    RYCHLE.map((r) => ({ id: r.id, popisek: r.popisek, ikona: r.ikona, on: jeAktivni(r) })),
    'vodorovne'
  )

  for (const b of el.querySelectorAll('.pilulka')) {
    b.onclick = () => prepniRychly(RYCHLE.find((r) => r.id === b.dataset.id))
  }

  postavKategorie()
}

/**
 * Přepne rychlý filtr.
 *
 * Rychlé filtry se navzájem vylučují — tak je má předloha (jedna pilulka je
 * plná). Druhé ťuknutí na zapnutou pilulku ji vypne, což je totéž jako „Vše“.
 *
 * Počet nalezených hlásí toast: předloha na mapě počítadlo nemá a na mapě je
 * změna filtru jinak vidět jen na špendlících, které se zrovna nevejdou.
 *
 * @param {RychlyFiltr} r
 */
function prepniRychly(r) {
  if (!r) return
  const vypnout = jeAktivni(r)
  for (const k of POLE) F[k] = vypnout ? false : !!r[k]
  F.stav = vypnout ? '' : r.stav

  syncFiltersUI()
  draw()

  const n = visible().length
  const jed = n === 1 ? 'místo' : n < 5 ? 'místa' : 'míst'
  toast(vypnout ? `Vše: ${n} ${jed}` : `${r.popisek}: ${n} ${jed}`)
}

/** Deset kategorií do panelu Filtry. Seznam se bere z KAT, ať se nepíše dvakrát. */
function postavKategorie() {
  const row = document.getElementById('katRow')
  if (!row) return

  row.innerHTML = Object.entries(KAT)
    .map(([k, v]) => `<button class="toggle kat" data-k="${k}">${IC(v.i, `color:${v.c}`)}${k}</button>`)
    .join('')

  // Panel se potvrzuje tlačítkem „Ukázat výsledky“, takže se tady nepřekresluje –
  // stejně jako u ostatních přepínačů v panelu.
  for (const b of row.querySelectorAll('.toggle.kat')) {
    b.onclick = () => {
      const k = b.dataset.k
      if (F.kat.has(k)) F.kat.delete(k)
      else F.kat.add(k)
      b.classList.toggle('on')
      srovnejRychle()
    }
  }
}

/** Srovná zvýraznění rychlých pilulek se stavem filtrů. */
function srovnejRychle() {
  for (const b of document.querySelectorAll('#chips .pilulka')) {
    b.classList.toggle('on', jeAktivni(RYCHLE.find((r) => r.id === b.dataset.id)))
  }
}

/** Srovná vzhled pilulek a přepínačů s aktuálním stavem filtrů. */
export function syncFiltersUI() {
  srovnejRychle()
  for (const t of document.querySelectorAll('.toggle.kat')) {
    t.classList.toggle('on', F.kat.has(t.dataset.k))
  }
  for (const t of document.querySelectorAll('.toggle[data-f]')) {
    t.classList.toggle('on', !!F[t.dataset.f])
  }
  for (const t of document.querySelectorAll('.toggle.stav')) {
    t.classList.toggle('on', t.dataset.s === F.stav)
  }
  // Jen `fStav` – jeho volby mají hodnotu v atributu. Oblast, Země a Typ nesou
  // v textu počet („Vodopády (37)"), takže se `value` netrefí; srovnává je
  // `srovnejPocty()` ve `filterPanel.js` při každém překreslení.
  const stav = document.getElementById('fStav')
  if (stav) stav.value = F.stav || ''
  // Hledání je na dvou obrazovkách (Mapa i Seznam) – po resetFiltru() (N4)
  // musí zmizet text z obou, jinak by input dál ukazoval starou hodnotu,
  // i když F.q je už prázdné.
  for (const id of ['q', 'qMapa']) {
    const el = document.getElementById(id)
    if (el) el.value = F.q
  }
}
