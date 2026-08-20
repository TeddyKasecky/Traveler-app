/**
 * Filtrování míst – jediný zdroj pravdy pro to, co je vidět.
 *
 * Používá to mapa, seznam i počítadla. Podmínky jsou doslovný přepis původní
 * funkce visible() včetně pořadí; jediná změna je hledání bez diakritiky.
 *
 * Zvláštnosti, které tu zůstávají schválně:
 *   free  … porovnává `c.startsWith('Zdarma')`, ne rovnost – projde i
 *           „Zdarma (lanovka placená)“. Vyhoví 402 míst z 580.
 *   kids  … jen přesně „Ano“ (395 míst), ne „Starší děti“.
 *   dogs  … jen přesně „Ano“. Pole `ps` je vyplněné u osmi míst, takže
 *           filtr vrací pět míst. Není to chyba filtru, ale stav dat (N6).
 *   wish  … ve filtru stavu znamená „nenavštívená“ – všechno kromě
 *           navštíveného. NENÍ to totéž co uložená místa (`F.ulozene`).
 */

import { S, F, store } from './store.js'
import { bezDiakritiky, sedi } from './search.js'

/**
 * Místa, která projdou aktuálními filtry.
 * @returns {Array<Record<string, any>>}
 */
export function visible() {
  const q = bezDiakritiky(F.q)
  return S.places.filter((p) => {
    if (F.kat.size && !F.kat.has(p.k)) return false
    if (F.reg && p.r !== F.reg) return false
    if (F.zeme && p.z !== F.zeme) return false
    if (F.typ && p.t !== F.typ) return false
    if (F.coll && !(p.col || []).includes(F.coll)) return false
    if (F.free && !p.c.startsWith('Zdarma')) return false
    if (F.kids && p.ch !== 'Ano') return false
    if (F.dogs && p.ps !== 'Ano') return false
    if (F.wow && !((store.rating[p.id] || 0) >= 4)) return false
    if (F.fire && (store.prio[p.id] || 0) < 3) return false
    if (F.stav === 'visited' && store.stav[p.id] !== 'visited') return false
    if (F.stav === 'wish' && store.stav[p.id] === 'visited') return false
    // `ulozene` NENÍ totéž co `stav: 'wish'`. To druhé je z původní aplikace
    // a znamená „všechno kromě navštíveného“, tedy 575 z 580 míst. Tohle jsou
    // místa, která si člověk opravdu uložil srdcem – bez toho by rychlá
    // pilulka „Uložená“ nad mapou ukazovala skoro celou databázi.
    if (F.ulozene && store.stav[p.id] !== 'wish') return false
    if (q && !sedi(p, q)) return false
    return true
  })
}

/**
 * Počet aktivních filtrů pro odznak na tlačítku filtrů.
 *
 * `fire` (N1) se dřív do součtu nepočítal – tak to bylo v původní aplikaci
 * a vypadalo to jako chyba, kterou appka nechávala 1:1. Teď se počítá
 * spolu s ostatními přepínači.
 *
 * @returns {number}
 */
export function pocetAktivnich() {
  return (
    [F.reg, F.zeme, F.typ, F.coll].filter(Boolean).length +
    ['free', 'kids', 'dogs', 'wow', 'fire'].filter((k) => F[k]).length +
    // `ulozene` je nové, žádné dědictví nedrží – počítá se. `vPlanu` bylo
    // nahrazeno módem mapy „Na cestě“ (S.mapaMod, components/chip.js).
    (F.ulozene ? 1 : 0) +
    (F.stav ? 1 : 0)
  )
}

/** Vynuluje filtry včetně hledání (N4). */
export function resetFiltru() {
  F.reg = F.zeme = F.typ = F.coll = F.q = ''
  F.free = F.kids = F.dogs = F.wow = F.fire = false
  F.ulozene = false
  F.stav = ''
  F.kat.clear()
}
