/**
 * Přepočet trasy přes Mapy.com Routing API – otisk bodů a pomocné dotazy.
 *
 * proč: appka dnes počítá vzdálenost/čas jen jako vzdušnou čáru × KLIKATOST.
 * Skutečná trasa z Routing API se volá JEN na výslovnou akci (tlačítko
 * Přepočítat), nikdy automaticky – appka nemá backend a klíč je proto
 * veřejná konstanta přímo v kódu. `otiskBodu()` a `pocetOdkazuNaPozici()`
 * jsou beze vzhledu, sdílené mezi Profilem (varování při mazání pozice)
 * a Plánem (invalidace uloženého přepočtu).
 */

import { store } from '../../core/store.js'

/**
 * Otisk aktuálního pořadí a polohy bodů trasy – levný „hash“ k poznání, že
 * se od posledního přepočtu něco změnilo (pořadí, přidání/odebrání bodu,
 * posun start/cíl). Netřeba kryptografický hash, stačí deterministický
 * řetězec porovnatelný na === – seznam bodů má jednotky až desítky prvků.
 * @param {Array<{lat:number, lon:number, id?:string}>} body
 * @returns {string}
 */
export function otiskBodu(body) {
  return body.map((b) => `${b.id || ''}:${b.lat.toFixed(5)},${b.lon.toFixed(5)}`).join('|')
}

/**
 * Kolik bodů (napříč VŠEMI výpravami, tzn. store.bloky) odkazuje na danou
 * uloženou pozici. Pro varování při mazání pozice v profilu – bod
 * odkazuje, nekopíruje, takže smazání pozice zasáhne všechny výpravy
 * najednou.
 * @param {string} pozId
 * @returns {number}
 */
export function pocetOdkazuNaPozici(pozId) {
  if (!store.bloky || typeof store.bloky !== 'object') return 0
  return Object.values(store.bloky)
    .flat()
    .filter((b) => b && b.typ === 'misto' && b.zdroj && b.zdroj.typ === 'pozice' && b.zdroj.id === pozId).length
}
