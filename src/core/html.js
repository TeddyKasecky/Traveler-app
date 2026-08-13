/**
 * Pomocníci pro skládání HTML řetězců.
 */

/**
 * Ošetří text pro vložení do HTML.
 *
 * POZOR: schválně ošetřuje jen `&` a `<`, nic víc – doslovný přepis původní
 * funkce. Neošetřuje `>` ani uvozovky, přestože se používá i uvnitř atributů
 * (např. `data-reg="${esc(r)}"`). Na současných datech to funguje, protože
 * uvozovky neobsahují. „Vylepšení“ na plné ošetření by změnilo výstup –
 * z `>` by se stalo `&gt;` a text na obrazovce by vypadal jinak.
 *
 * @param {string|undefined|null} s
 * @returns {string}
 */
export function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
}
