/**
 * Karta místa v posuvných seznamech.
 *
 * Dvě podoby, protože se v původní aplikaci opravdu lišily:
 *   kartaSeznam  … Seznam – stav, hodnocení, štítky
 *   kartaBlizko  … Objevuj „Kolem tebe“ – jen vzdálenost a základ
 *
 * Karta v Plánu tady není schválně: nese ovládání zastávek, takže patří
 * k obrazovce plánu, ne mezi obecné komponenty.
 */

import { store } from '../core/store.js'
import { esc } from '../core/html.js'
import { fmtKm } from '../core/geo.js'
import { KAT } from '../data/categories.js'
import { IC } from '../icons/sprite.js'
import { flames } from './prio.js'

/**
 * Karta pro záložku Seznam.
 * @param {Record<string, any>} p
 * @param {number|null} [vzdalenost]  km od uživatele, když je známá poloha
 */
export function kartaSeznam(p, vzdalenost = null) {
  const k = KAT[p.k] || {}
  const r = store.rating[p.id] || 0
  const navstiveno = store.stav[p.id] === 'visited'
  const prio = store.prio[p.id]

  return `<div class="card" data-id="${p.id}" style="--pc:${k.c}"><span class="spine"></span>
      ${vzdalenost != null ? `<span class="dist">${fmtKm(vzdalenost)}</span>` : ''}
      <h3>${IC(k.i)}${esc(p.n)} ${navstiveno ? IC('i-check', 'color:var(--moss);font-size:15px') : ''}</h3>
      ${p.sh ? `<div class="short">${esc(p.sh)}</div>` : ''}
      <div class="meta">${esc(p.r || p.z)} · ${esc(p.t)} · ${esc(p.d)}${r ? ` · ${'★'.repeat(r)}` : ''}</div>
      <div class="tagrow">
        ${prio ? `<span class="fl-badge">${flames(prio, prio, 11)}</span>` : ''}
        <span class="tag ${p.c.startsWith('Zdarma') ? 'free' : 'paid'}">${esc(p.c.split(' (')[0])}</span>
        ${p.ch === 'Ano' ? '<span class="tag kid">děti OK</span>' : ''}
        ${p.ps === 'Ano' ? `<span class="tag">${IC('i-paw', 'font-size:11px')}</span>` : ''}
        ${p.f ? `<span class="tag">${IC('i-quill', 'font-size:11px')} zajímavost</span>` : ''}
        <span class="tag">${esc((p.s || '').replace(' *', ''))}</span>
      </div></div>`
}

/**
 * Karta pro „Kolem tebe“ v Objevuj.
 * @param {Record<string, any>} p
 * @param {number} d  km od uživatele
 */
export function kartaBlizko(p, d) {
  const k = KAT[p.k] || {}
  return `<div class="card" data-id="${p.id}" style="--pc:${k.c}"><span class="spine"></span>
        <span class="dist">${fmtKm(d)}</span>
        <h3>${IC(k.i)}${esc(p.n)}</h3>
        ${p.sh ? `<div class="short">${esc(p.sh)}</div>` : ''}
        <div class="meta">${esc(p.t)} · ${esc(p.d)} · ${esc(p.c.split(' (')[0])}</div></div>`
}
