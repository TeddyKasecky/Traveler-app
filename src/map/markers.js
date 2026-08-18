/**
 * Špendlíky na mapě.
 */

import L from 'leaflet'
import { S, store } from '../core/store.js'
import { KAT } from '../data/categories.js'
import { IC } from '../icons/sprite.js'
import { jeVKosiku } from './map.js'

/**
 * Ikona špendlíku pro místo.
 *
 * TVAR KAPKY, ne kolečko: tak to má předloha `grafika/…11_09_49 (1).png`.
 * Kapku dělá otočený čtverec se třemi zaoblenými rohy uvnitř nerotovaného
 * obalu. Kdyby se otáčel celý špendlík, otočila by se s ním i ikona
 * a fajfka „navštíveno“ by odplula do rohu.
 *
 * Stavy se skládají do tříd: `visited` (vybledlý se zelenou fajfkou),
 * `inplan` (rezavý obrys), `hi` (zvětšený, když se na místo skočilo).
 * Animace nabíhá po řadě, ale nejvýš do 240 ms, ať se vykreslení neprotahuje.
 *
 * Vnější třída zůstává `badge-pin` – visí na ní smoke, perf i porovnání snímků.
 *
 * @param {Record<string, any>} p
 * @param {number} idx  pořadí ve vykreslované sadě
 * @param {boolean} [tise]  bez náběhové animace – špendlík přibyl posunem mapy,
 *                          ne překreslením. Bez tohohle by při každém posunu
 *                          nabíhaly na okrajích špendlíky, což dřív nedělaly.
 */
export function pinIcon(p, idx, tise = false) {
  const k = KAT[p.k] || { c: 'var(--ink2)', i: 'i-spark' }
  const visited = store.stav[p.id] === 'visited'
  const wish = store.stav[p.id] === 'wish'
  const cls =
    'badge-pin' +
    (visited ? ' visited' : '') +
    (store.plan.includes(p.id) ? ' inplan' : '') +
    // V režimu výběru míst se vybrané zvýrazní jako „v košíku".
    (jeVKosiku(p.id) ? ' vkosiku' : '') +
    (S.hiId === p.id ? ' hi' : '')

  return L.divIcon({
    className: '',
    iconSize: [30, 30],
    // Hrot kapky je pod spodní hranou obalu – otočený čtverec má vrchol
    // o polovinu úhlopříčky níž než střed. Kotva proto míří pod obal.
    iconAnchor: [15, 36],
    html:
      `<div class="${cls}" style="--pc:${k.c};${tise ? 'animation:none' : `animation-delay:${Math.min(idx * 5, 240)}ms`}">` +
      `<span class="kapka"></span>${IC(k.i)}` +
      // Uložené místo nese růžek se záložkou, stejně jako navštívené fajfku –
      // do srpna 2026 nebylo na mapě vůbec poznat.
      `${visited ? `<span class="tick">${IC('i-check')}</span>` : ''}` +
      `${wish ? `<span class="tick wish">${IC('i-zalozka')}</span>` : ''}</div>`,
  })
}

/** Malý špendlík souseda na mini-mapě v detailu. */
export function miniPinIcon(q) {
  const kk = KAT[q.k] || { c: 'var(--ink2)', i: 'i-spark' }
  return L.divIcon({
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div class="minipin" style="--pc:${kk.c}">${IC(kk.i)}</div>`,
  })
}

/** Špendlík parkoviště – čtvereček s písmenem P. */
export function parkPinIcon() {
  return L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: '<div class="parkpin">P</div>' })
}
