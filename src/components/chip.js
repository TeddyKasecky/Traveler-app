/**
 * Rychlé filtry nad mapou a úplný výběr kategorií v panelu Filtry.
 *
 * PROČ PĚT MÍSTO DESETI: předloha `grafika/…11_09_49 (1).png` má nad mapou pět
 * pilulek — Vše, Kempy, Výhledy, Turistika, U vody. Deset chipů se na telefon
 * nevešlo a lišta se musela posouvat, takže poslední čtyři nikdo neviděl.
 *
 * Kategorie se tím ale neztrácejí: úplný výběr všech deseti je v panelu Filtry
 * (`#katRow`) a `t` (typ) je jako pilulka na Seznamu. Rychlá pilulka je zkratka,
 * ne zmenšení.
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
 * Pět rychlých filtrů podle předlohy.
 *
 * Každý sahá na `F.kat` (kategorie `k`), „Výhledy“ navíc na `F.typ` — vyhlídka
 * je v datech typ (26 míst), ne kategorie. Míchání dvou polí v jednom filtru
 * není hezké, ale je to jediné, co ta data dovolují; vymýšlet novou kategorii
 * a přeznačkovat 580 míst kvůli jedné pilulce by bylo horší.
 *
 * @typedef {Object} RychlyFiltr
 * @property {string} id
 * @property {string} popisek
 * @property {string} ikona   prázdná u „Vše“ – předloha tam ikonu nemá
 * @property {string[]} kat   hodnoty pole `k`
 * @property {string} typ     hodnota pole `t`
 */

/** @type {RychlyFiltr[]} */
export const RYCHLE = [
  { id: 'vse', popisek: 'Vše', ikona: '', kat: [], typ: '' },
  { id: 'kempy', popisek: 'Kempy', ikona: 'i-van', kat: ['Spaní'], typ: '' },
  { id: 'vyhledy', popisek: 'Výhledy', ikona: 'i-mount', kat: [], typ: 'Vyhlídka' },
  { id: 'turistika', popisek: 'Turistika', ikona: 'i-boot', kat: ['Hory a túry', 'Soutěsky', 'Ferraty'], typ: '' },
  { id: 'voda', popisek: 'U vody', ikona: 'i-swim', kat: ['Jezera', 'Vodopády'], typ: '' },
]

/** Sedí stav filtrů přesně na tenhle rychlý filtr? */
function jeAktivni(r) {
  if ((F.typ || '') !== r.typ) return false
  if (F.kat.size !== r.kat.length) return false
  return r.kat.every((k) => F.kat.has(k))
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
  F.kat.clear()
  F.typ = vypnout ? '' : r.typ
  if (!vypnout) for (const k of r.kat) F.kat.add(k)

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
  for (const [id, k] of [
    ['fReg', 'reg'],
    ['fZeme', 'zeme'],
    ['fTyp', 'typ'],
    ['fStav', 'stav'],
  ]) {
    const el = document.getElementById(id)
    if (el) el.value = F[k] || ''
  }
}
