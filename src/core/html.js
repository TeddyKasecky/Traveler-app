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

/**
 * České skloňování podle počtu: 1 → `a`, 2–4 → `b`, jinak `c`.
 *
 * Nula skloňuje jako pět a víc: „0 výprav", ne „0 výpravy".
 *
 * PROČ TADY, A NE VE `views/plan/plan.js`, odkud pochází: `plan.js` veze
 * obrázky kategorií (`.webp`) a kontrolní skripty v čistém Node ho kvůli
 * tomu nenačtou. Skloňování je textová utilita jako `esc()` a potřebuje ho
 * i datová vrstva cesty. `plan.js` ho dál reexportuje, ať se nemusí
 * přepisovat dvacet importů.
 *
 * @param {number} n
 * @param {string} a  tvar pro jednu
 * @param {string} b  tvar pro dvě až čtyři
 * @param {string} c  tvar pro pět a víc (a pro nulu)
 */
export const sklonuj = (n, a, b, c) => (n === 1 ? a : n >= 2 && n < 5 ? b : c)
