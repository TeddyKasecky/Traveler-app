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
    // Profil nemá tlačítko ve spodní liště – otevírá se kolečkem v hlavičce.
    // Jako záložka je zaregistrovaný proto, aby fungovala adresa i tlačítko zpět.
    profil: { panel: 'panelProfil', render: () => renderProfil() },
  })
}
