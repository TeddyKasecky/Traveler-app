/**
 * Vysouvací panel s detailem místa – jen mechanika otevírání a zavírání.
 * Obsah do něj plní views/detail.
 */

import { registrujOverlay } from '../core/router.js'
import { zavriMiniMapu } from '../map/detailMap.js'

/** @returns {HTMLElement} */
const el = () => document.getElementById('sheet')

export const jeOtevreny = () => el().classList.contains('show')

export function otevriSheet() {
  el().classList.add('show')
}

export function zavriSheet() {
  el().classList.remove('show')
  zavriMiniMapu()
}

/** Prvek, do kterého se vykresluje obsah. */
export const teloSheetu = () => document.getElementById('sheetBody')

/**
 * Naváže zavírání klikem mimo panel.
 *
 * Výjimky jsou stejné jako dřív: klik na špendlík, kartu, dlaždici kolekce
 * nebo štítek oblasti panel nezavírá – tyhle prvky ho totiž samy otevírají
 * a bez výjimky by se hned zase zavřel.
 *
 * Přibylo porovnání: vysouvá se nad detailem, takže každý klik v něm je
 * technicky „mimo“ detail. Bez výjimky by se detail pod ním zavřel a po
 * zavření porovnání by člověk skončil na prázdné obrazovce.
 */
export function initSheet() {
  document.addEventListener('click', (e) => {
    if (!jeOtevreny()) return
    // Odpojený cíl znamená, že klik obsloužil někdo uvnitř aplikace a při tom
    // překreslil – „mimo panel“ to není.
    //
    // Tohle byla ta chyba, kvůli které se detail místa nedal používat: obsluha
    // tlačítek v detailu (srdce, fajfka, plán, hvězdičky, plamínky, fotky) volá
    // na konci openDetail(), a to přepíše sheetBody.innerHTML. Odběr na
    // document se ale vyhodnocuje až po obsluze tlačítka, takže do
    // `el().contains(e.target)` už přišla odpojená hvězdička – kontrola vyšla
    // false, žádná z výjimek níž na ni nepasovala a panel se zavřel. Na Mapě se
    // tím odkryla mapa, takže to vypadalo, že detail „spadne do mapy“
    // a že hodnocení nefunguje (přitom se uložilo, jen nebylo vidět).
    if (!e.target.isConnected) return
    if (el().contains(e.target)) return
    if (
      e.target.closest('.leaflet-marker-icon') ||
      e.target.closest('.card') ||
      e.target.closest('.coll') ||
      e.target.closest('.reg') ||
      e.target.closest('#porovnani')
    )
      return
    zavriSheet()
  })

  registrujOverlay({ jeOtevreny, zavri: zavriSheet })
}
