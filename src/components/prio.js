/**
 * Priorita wishlistu – plamínky 0 až 3.
 */

import { store, save } from '../core/store.js'
import { IC } from '../icons/sprite.js'

export const PRIO_LBL = { 1: 'Někdy', 2: 'Chceme brzy', 3: 'MUSÍME!' }

/**
 * Řádek plamínků. Nesvítící mají natvrdo šedou – je to jediná barva mimo tokeny,
 * protože takhle byla v původní aplikaci zapsaná přímo v atributu style.
 *
 * @param {number} n     kolik plamínků svítí
 * @param {number} [max] kolik se jich vykreslí
 * @param {number} [size] velikost v px
 */
export function flames(n, max = 3, size = 15) {
  const kusy = Array.from(
    { length: max },
    (_, i) => `<svg class="ic" style="font-size:${size}px;${i < n ? '' : 'color:#D9CDBC'}"><use href="#i-fire"/></svg>`
  ).join('')
  return `<span class="flames" aria-label="priorita ${n}/3">${kusy}</span>`
}

/** Nastaví prioritu. Kliknutí na už nastavenou hodnotu ji zruší. */
export function setPrio(id, v) {
  const cur = store.prio[id] || 0
  store.prio[id] = cur === v ? 0 : v
  save()
}
