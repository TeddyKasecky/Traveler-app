/**
 * Seznam záložek.
 *
 * PŘIDÁNÍ ZÁLOŽKY:
 *   1. nová složka ve views/ s funkcí, která vykreslí obsah,
 *   2. jeden záznam sem,
 *   3. tlačítko <button data-tab="…"> v index.html a panel, pokud ho záložka má.
 *
 * Mechanika přepínání a historie je v core/router.js. Registr je schválně tady,
 * a ne v routeru: router by jinak musel znát obrazovky, a to je obráceně.
 */

import { ZALOZKY } from '../core/router.js'
import { renderHome } from './home/home.js'
import { renderDisc } from './discover/discover.js'
import { renderList } from './list/list.js'
import { renderPlan } from './plan/plan.js'
import { renderProfil } from './profil/profil.js'
import { renderNastaveni } from './nastaveni/nastaveni.js'
import { renderMapaDole } from './mapa/mapa.js'
import { poPrepnutiNaMapu } from '../map/map.js'

export function registrujZalozky() {
  Object.assign(ZALOZKY, {
    home: { panel: 'panelHome', render: () => renderHome() },
    // Mapa panel nemá – schová se všechno ostatní a je vidět. Spodní část
    // (karta výpravy, uložená místa) je obyčejná obrazovka a kreslí se sem.
    // Leaflet si po přepnutí musí přeměřit velikost, jinak zůstane zmenšený.
    map: { panel: null, render: () => renderMapaDole(), poAktivaci: () => poPrepnutiNaMapu() },
    disc: { panel: 'panelDisc', render: () => renderDisc() },
    list: { panel: 'panelList', render: () => renderList() },
    plan: { panel: 'panelPlan', render: () => renderPlan() },
    // Profil ani Nastavení nemají tlačítko ve spodní liště – otevírají se
    // kolečky v hlavičce. Jako záložky jsou zaregistrované proto, aby fungovala
    // adresa i tlačítko zpět.
    profil: { panel: 'panelProfil', render: () => renderProfil() },
    nastaveni: { panel: 'panelNastaveni', render: () => renderNastaveni() },
    // Poznámkovač otevírá Nastavení. Ze stejného důvodu jako Profil nemá
    // tlačítko v liště, ale adresu `#debug` a tlačítko zpět má.
    //
    // JEDINÁ OBRAZOVKA NAČÍTANÁ AŽ PŘI OTEVŘENÍ. Prohlížeč záznamů (31 kB
    // zdroje) neimportuje nikdo jiný, takže se dá odříznout od startu, aniž by
    // se něco přeskládávalo – na produkci ho navíc nikdo neuvidí, protože
    // `prefs.debugRezim` je tam vypnutý. Plán takhle odříznout NEJDE: `plan.js`
    // si tahá home.js, mapa.js, plusMenu.js, vypravaKarta.js i wizard.js,
    // tedy samé věci z první obrazovky.
    //
    // Router návratovou hodnotu `render()` ignoruje (`router.js:76`), takže
    // slib je v pořádku – panel se přepne hned a obsah doskočí za okamžik.
    debug: { panel: 'panelDebug', render: () => import('./debug/debug.js').then((m) => m.renderDebug()) },
  })
}
