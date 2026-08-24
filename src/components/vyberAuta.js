/**
 * Auta: adresy ikon a mřížka výběru v Profilu.
 *
 * Ikon je 96 (`scripts/make-auta.mjs`) a člověk si jedno vybere – tím autem
 * pak jezdí po mapě místo zeleného puntíku. Volba je v Profilu, ne
 * v Nastavení: jaké mám auto je „kdo jsem", ne „jak to má fungovat".
 *
 * Glob je `eager`, ale nese jen adresy (pár bajtů na auto) – soubory samotné
 * jsou mimo předukládanou cache (`vite.config.js`) a stáhnou se, až když se
 * mřížka poprvé ukáže; service worker si je pak uloží.
 */

import { prefs, savePrefs } from '../core/store.js'

const ADRESY = import.meta.glob('../assets/auta/*.webp', { eager: true, query: '?url', import: 'default' })

/** jméno auta → adresa obrázku */
const auta = new Map()
for (const cesta of Object.keys(ADRESY).sort()) {
  auta.set(cesta.slice(cesta.lastIndexOf('/') + 1).replace('.webp', ''), ADRESY[cesta])
}

/** Výchozí auto – první dodávka. Drží mapu funkční i bez volby v Profilu. */
export const VYCHOZI_AUTO = 'auta-dodavky-1'

/**
 * Adresa ikony vybraného auta.
 * @returns {string}
 */
export function vybraneAutoUrl() {
  return auta.get(prefs.auto) || auta.get(VYCHOZI_AUTO) || ''
}

/**
 * Pořadí listů v mřížce – dodávky první, jsou nejblíž duchu aplikace.
 *
 * KAŽDÁ NOVÁ PŘEDPONA MUSÍ BÝT TADY. Řadí se přes `findIndex()`, který na
 * neznámou předponu vrátí −1 – a to je míň než nula, takže by nová auta
 * přeskočila úplně na začátek mřížky, před dodávky.
 */
const PORADI = ['dodavky', 'terenni', 'mala', 'velka', 'vwt4', 'vwt6']

/**
 * HTML mřížky výběru. Obsluhu věší `napojVyberAuta()` po vložení do stránky.
 *
 * Jedna souvislá mřížka bez nadpisů: listy z generátoru jsou obsahově
 * míchané (v „dodávkách" jsou i kombíky), takže by každý nadpis lhal.
 * @returns {string}
 */
export function vyberAutaHtml() {
  const zvolene = prefs.auto || VYCHOZI_AUTO
  const serazena = [...auta.keys()].sort(
    (a, b) => PORADI.findIndex((p) => a.includes(p)) - PORADI.findIndex((p) => b.includes(p))
  )
  return `<div class="automriz">${serazena
    .map(
      (j) =>
        `<button class="autovolba${j === zvolene ? ' on' : ''}" data-auto="${j}" title="Vybrat auto">
          <img src="${auta.get(j)}" alt="" loading="lazy" decoding="async"></button>`
    )
    .join('')}</div>`
}

/**
 * Naváže výběr. Volá se po každém vykreslení Profilu.
 * @param {HTMLElement} koren
 * @param {() => void} poZmene  překreslení značky na mapě
 */
export function napojVyberAuta(koren, poZmene) {
  for (const b of koren.querySelectorAll('.autovolba')) {
    b.onclick = () => {
      prefs.auto = b.dataset.auto
      if (!savePrefs()) return
      for (const x of koren.querySelectorAll('.autovolba')) x.classList.toggle('on', x === b)
      poZmene()
    }
  }
}
