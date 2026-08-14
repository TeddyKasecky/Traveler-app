/**
 * Varovný pruh přes horní okraj.
 *
 * Na rozdíl od toastu nezmizí sám. Je na to jediný důvod: když se přestanou
 * ukládat data, uživatel to musí zjistit dřív, než zavře aplikaci – ne o dvě
 * vteřiny později, kdy hláška uplave. Proto je nahoře, přes hlavičku, a jde
 * zavřít až ručně.
 *
 * Vlastní obsah se skládá tady, v index.html je jen prázdná schránka – stejně
 * jako u panelů obrazovek.
 */

import { esc } from '../core/html.js'
import { IC } from '../icons/sprite.js'

const el = () => document.getElementById('pruh')

/**
 * Ukáže pruh.
 *
 * Opakované volání se stejným textem nic nepřekresluje – zápis může selhat
 * mnohokrát za sebou a pruh by pod rukama poskakoval.
 *
 * @param {Object} o
 * @param {string} o.text
 * @param {string} [o.tlacitko]  popisek akce, když nějaká je
 * @param {() => void} [o.akce]
 */
export function ukazPruh({ text, tlacitko, akce }) {
  const p = el()
  if (!p) return
  if (p.dataset.text === text && !p.hidden) return

  p.dataset.text = text
  p.innerHTML = `<div class="pruh-in">
      <span class="pruh-txt">${esc(text)}</span>
      ${tlacitko ? `<button class="pruh-btn" id="pruhAkce">${IC('i-save')}${esc(tlacitko)}</button>` : ''}
      <button class="pruh-x" id="pruhZavri" aria-label="Skrýt upozornění">${IC('i-x')}</button>
    </div>`
  p.hidden = false

  const b = document.getElementById('pruhAkce')
  if (b && akce) b.onclick = akce
  document.getElementById('pruhZavri').onclick = skryjPruh
}

/** Schová pruh. Při další chybě se ukáže znovu. */
export function skryjPruh() {
  const p = el()
  if (!p) return
  p.hidden = true
  p.dataset.text = ''
}
