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
 *   wish  … „chci navštívit“ znamená všechno kromě navštíveného.
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
    if (F.vPlanu && !store.plan.includes(p.id)) return false
    if (q && !sedi(p, q)) return false
    return true
  })
}

/**
 * Počet aktivních filtrů pro odznak na tlačítku filtrů.
 *
 * POZOR: `fire` se schválně nepočítá – tak to bylo v původní aplikaci
 * (INVENTURA.md P10, NAPADY.md N1). Vypadá to jako chyba, ale opravit ji
 * znamená změnit chování, takže na to čekám.
 *
 * @returns {number}
 */
export function pocetAktivnich() {
  return (
    [F.reg, F.zeme, F.typ, F.coll].filter(Boolean).length +
    ['free', 'kids', 'dogs', 'wow'].filter((k) => F[k]).length +
    // `ulozene` a `vPlanu` jsou nové, žádné dědictví nedrží – počítají se.
    ['ulozene', 'vPlanu'].filter((k) => F[k]).length +
    (F.stav ? 1 : 0)
  )
}

/** Vynuluje filtry. Hledání `q` se schválně nemaže – stejně jako dřív (N4). */
export function resetFiltru() {
  F.reg = F.zeme = F.typ = F.coll = ''
  F.free = F.kids = F.dogs = F.wow = F.fire = false
  F.ulozene = F.vPlanu = false
  F.stav = ''
  F.kat.clear()
}
