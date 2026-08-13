/**
 * Cenovka bikeparku na Domů.
 *
 * Zelená = ověřená cena z oficiálního webu, béžová = orientační,
 * fialová = ceník je jen na webu parku.
 */

import { esc } from '../core/html.js'
import { IC } from '../icons/sprite.js'

/**
 * @param {Record<string, any>} p
 * @returns {string}
 */
export function priceChip(p) {
  if (!p.price) return `<span class="pricechip link">${IC('i-nav', 'font-size:12px')}ceník na webu</span>`
  if (p.price === 'zdarma') return `<span class="pricechip">${IC('i-check', 'font-size:12px;color:var(--moss)')}zdarma</span>`
  if (p.price === 'ceník online') return `<span class="pricechip link">${IC('i-nav', 'font-size:12px')}ceník na webu</span>`
  // Cena začínající vlnovkou je odhad, i kdyby byla označená jako ověřená.
  const est = p.price.startsWith('~')
  return `<span class="pricechip ${p.pv && !est ? '' : 'est'}">${p.pv ? IC('i-check', 'font-size:12px;color:var(--moss)') : ''}${esc(p.price)}</span>`
}

/** První odkaz z pole `w`, pokud vypadá jako adresa. */
export function bpWeb(p) {
  return (p.w || '').split(' | ').find((x) => x.startsWith('http')) || ''
}
