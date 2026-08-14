/**
 * Přerušovaná čára, která spojuje zastávky plánu.
 */

import L from 'leaflet'
import { S, store } from '../core/store.js'
import { token } from '../core/barvy.js'

/** @type {L.Polyline|null} */
let cara = null

/**
 * Překreslí čáru plánu. Kreslí se až od dvou zastávek.
 * @param {L.Map} mapa
 */
export function drawPlanLine(mapa) {
  if (cara) {
    cara.remove()
    cara = null
  }
  const pts = store.plan
    .map((id) => S.byId[id])
    .filter(Boolean)
    .map((p) => [p.lat, p.lon])
  if (pts.length > 1) {
    cara = L.polyline(pts, { color: token('--akcent', '#5E6E4D'), weight: 3.5, opacity: 0.85, dashArray: '2 9', lineCap: 'round' }).addTo(mapa)
  }
}
