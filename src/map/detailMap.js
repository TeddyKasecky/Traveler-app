/**
 * Mini-mapa v detailu místa.
 *
 * Pro každé otevření detailu vzniká nová instance Leafletu. Inicializuje se
 * až po vykreslení sheetu (rAF + 180 ms) – dřív má prvek nulovou velikost
 * a Leaflet by spočítal špatné souřadnice. Kdyby se to nepovedlo, na místě
 * mapy se objeví odkaz do Google Maps, aplikace nespadne.
 */

import L from 'leaflet'
import { S, emit } from '../core/store.js'
import { esc } from '../core/html.js'
import { IC } from '../icons/sprite.js'
import { pinIcon, miniPinIcon, parkPinIcon } from './markers.js'

/** @type {L.Map|null} */
let mini = null

/** Zruší mini-mapu, pokud nějaká běží. */
export function zavriMiniMapu() {
  if (mini) {
    try {
      mini.remove()
    } catch {
      /* už byla odstraněná se sheetem */
    }
    mini = null
  }
}

/**
 * Vykreslí mini-mapu do prvku s daným id.
 *
 * @param {Object} opts
 * @param {string} opts.elId  id prvku `.minimap`
 * @param {Record<string, any>} opts.p  místo
 * @param {Record<string, any>|null} opts.pk  parkoviště, nebo null
 * @param {string} opts.gmView  odkaz na místo v Google Maps
 * @param {string} opts.pkNav  odkaz na navigaci k parkovišti
 */
export function vytvorMiniMapu({ elId, p, pk, gmView, pkNav }) {
  const elm = document.getElementById(elId)
  // `_leaflet_id` znamená, že na prvku už jedna mapa je – nezakládat druhou
  if (!elm || elm._leaflet_id) return

  try {
    mini = L.map(elm, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      dragging: true,
      tap: true,
    }).setView([p.lat, p.lon], 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(mini)

    const tm = L.marker([p.lat, p.lon], { icon: pinIcon(p, 0) }).addTo(mini)
    tm.on('click', () => window.open(gmView, '_blank', 'noopener'))

    if (pk) {
      const pmk = L.marker([pk.lat, pk.lon], { icon: parkPinIcon() })
        .addTo(mini)
        .bindTooltip(pk.name, { direction: 'top' })
      pmk.on('click', () => window.open(pkNav, '_blank', 'noopener'))
      L.polyline(
        [
          [pk.lat, pk.lon],
          [p.lat, p.lon],
        ],
        { color: '#292019', weight: 3, dashArray: '4 8', opacity: 0.7 }
      ).addTo(mini)
      mini.fitBounds(
        L.latLngBounds([
          [pk.lat, pk.lon],
          [p.lat, p.lon],
        ]).pad(0.35)
      )
    }

    // jen první čtyři sousedi, v pořadí, v jakém jsou v datech
    for (const x of (p.nb || []).slice(0, 4)) {
      const q = S.byId[x.id]
      if (!q) continue
      L.marker([q.lat, q.lon], { icon: miniPinIcon(q), opacity: 0.9 })
        .on('click', () => emit('skoc', q))
        .bindTooltip(q.n, { direction: 'top' })
        .addTo(mini)
    }

    setTimeout(() => {
      try {
        mini && mini.invalidateSize()
      } catch {
        /* sheet se mezitím zavřel */
      }
    }, 420)
  } catch {
    elm.outerHTML =
      `<div class="mmfail">${IC('i-map', 'font-size:16px')} Mapa se nenačetla · ` +
      `<a href="${gmView}" target="_blank" rel="noopener noreferrer">Otevřít ` +
      `${esc(p.n.split(/\s[–(]/)[0].slice(0, 28))} v Google Maps</a></div>`
    mini = null
  }
}
