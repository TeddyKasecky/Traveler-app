/**
 * Špendlíky na mapě.
 */

import L from 'leaflet'
import { S, store } from '../core/store.js'
import { KAT } from '../data/categories.js'
import { IC } from '../icons/sprite.js'

/**
 * Ikona špendlíku pro místo.
 *
 * Stavy se skládají do tříd: `visited` (vybledlý se zelenou fajfkou),
 * `inplan` (rezavý obrys), `hi` (zvětšený, když se na místo skočilo).
 * Animace nabíhá po řadě, ale nejvýš do 240 ms, ať se vykreslení neprotahuje.
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
  const cls =
    'badge-pin' +
    (visited ? ' visited' : '') +
    (store.plan.includes(p.id) ? ' inplan' : '') +
    (S.hiId === p.id ? ' hi' : '')

  return L.divIcon({
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html:
      `<div class="${cls}" style="--pc:${k.c};${tise ? 'animation:none' : `animation-delay:${Math.min(idx * 5, 240)}ms`}">` +
      `${IC(k.i)}${visited ? `<span class="tick">${IC('i-check')}</span>` : ''}</div>`,
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
