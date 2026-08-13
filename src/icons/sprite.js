/**
 * Sada 45 ikon.
 *
 * Sprite se vkládá přímo do dokumentu, ne přes `<use href="sprite.svg#i-van"/>`.
 * Externí SVG by nefungovalo: symboly používají `currentColor` a `var(--card)`
 * a ty se přes hranici externího dokumentu nepřenesou. U souboru na disku
 * (single-file varianta) by se navíc vůbec nenačetlo.
 *
 * `?raw` znamená, že Vite vloží obsah souboru do balíčku jako řetězec –
 * v obou variantách buildu i v dev serveru.
 */

import spriteSvg from './sprite.svg?raw'

/** Ikona jako `<svg>` s odkazem do sprite. Přesná obdoba původní funkce IC(). */
export const IC = (id, style = '') =>
  `<svg class="ic"${style ? ` style="${style}"` : ''}><use href="#${id}"/></svg>`

/** Vloží sprite na začátek <body>. Volá se jednou při startu. */
export function vlozSprite() {
  document.body.insertAdjacentHTML('afterbegin', spriteSvg)
}
