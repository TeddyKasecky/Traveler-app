/**
 * Vysouvací panel s detailem místa – jen mechanika otevírání a zavírání.
 * Obsah do něj plní views/detail.
 *
 * Zavírá se třemi způsoby: klikem mimo, tlačítkem zpět (overlay) a od srpna
 * 2026 i stažením dolů za úchyt – panel jde za prstem a přes práh nebo
 * švihnutím se zavře, jinak se vrátí. Táhne se za `.grip` a hlavičku, ne za
 * celé tělo: to se svisle roluje a tažení by se s rolováním pralo.
 */

import { registrujOverlay } from '../core/router.js'
import { zavriMiniMapu } from '../map/detailMap.js'
import { napojTah, svih } from './tah.js'

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
  // Stažení dolů zavírá. Táhne se za úchyt, ne za celý panel – tělo se svisle
  // roluje a tažení by se s rolováním pralo. Úchyt je proto v CSS zvětšený na
  // celý horní pruh, aby se dal trefit prstem.
  const panel = el()
  const grip = panel.querySelector('.grip')
  napojTah(
    grip,
    (dy, rychlost) => {
      panel.classList.remove('tahne')
      panel.style.transform = ''
      if (svih(dy, rychlost, 1)) zavriSheet()
    },
    (dy) => {
      panel.classList.toggle('tahne', dy > 0)
      // Jen dolů; nahoru není kam. Bez tohohle by panel ujel pod prstem vzhůru.
      panel.style.transform = dy > 0 ? `translateY(${dy}px)` : ''
    }
  )

  document.addEventListener('click', (e) => {
    if (!jeOtevreny()) return

    // KLIK V DIALOGU NEBO NA ZÁVĚSU NENÍ „mimo detail“. Dialog je modální a leží
    // výš, takže mu ten klik patří – jenže technicky je mimo `#sheet`, takže ho
    // tahle obsluha zavírala: „Do plánu“ nebo „Do košíku“ v detailu otevřelo
    // výběr výpravy, Zrušit dialog zavřel a člověk místo návratu do detailu
    // skončil na mapě, která se pod ním odkryla (hlášení tadeas-003).
    //
    // PTÁ SE TO NA CÍL KLIKU, NE NA STAV `jeOtevrenyDialog()`. Ten už je totiž
    // v tuhle chvíli `false`: obsluha tlačítka v dialogu doběhne první a stav
    // vynuluje, kdežto tenhle odběr na `document` se vyhodnocuje až po ní.
    // Přesně na stejné pořadí doplatila kontrola odpojeného cíle níž.
    //
    // `#backdrop` je tu proto, že dialog se zavírá i klikem vedle karty a ten
    // do `#dialog` nepatří. Obsah dialogu v DOM po zavření zůstává (maže ho až
    // otevření dalšího), takže `closest()` cíl najde i po zavření.
    if (e.target.closest('#dialog') || e.target.id === 'backdrop') return

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
