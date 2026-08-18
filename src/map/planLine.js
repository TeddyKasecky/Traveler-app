/**
 * Trasa plánu na mapě a dodávka na ní.
 *
 * Podle předlohy `grafika/…11_09_49 (1).png`: plná okrová čára, ne přerušovaná,
 * a uprostřed trasy ilustrace dodávky. Do teď to byla tenká čárkovaná čára
 * v barvě akcentu a dodávka byla úplně jinde – jako hero obrázek na Domů.
 *
 * Dodávka se sází na **půlku ujeté vzdálenosti**, ne na prostřední zastávku:
 * u dvou blízkých zastávek a jedné vzdálené by prostřední zastávka nechala
 * dodávku stát skoro na začátku a vypadalo by to jako chyba.
 */

import L from 'leaflet'
import { S, store } from '../core/store.js'
import { dkm } from '../core/geo.js'
import { token } from '../core/barvy.js'
import vanObr from '../assets/van.webp'

/** @type {L.Polyline|null} */
let cara = null
/** @type {L.Polyline|null} čára ujeté části během Aktuální cesty */
let ujeta = null
/** @type {L.Marker|null} */
let dodavka = null

/**
 * Bod na lomené čáře v polovině její délky.
 * @param {Array<{lat:number, lon:number}>} body
 * @returns {[number, number]}
 */
function stredTrasy(body) {
  const useky = []
  let celkem = 0
  for (let i = 1; i < body.length; i++) {
    const d = dkm(body[i - 1], body[i])
    useky.push(d)
    celkem += d
  }

  let ujeto = 0
  for (let i = 0; i < useky.length; i++) {
    if (ujeto + useky[i] >= celkem / 2) {
      // Kolik z tohohle úseku ještě zbývá do poloviny.
      const t = useky[i] ? (celkem / 2 - ujeto) / useky[i] : 0
      const a = body[i]
      const b = body[i + 1]
      return [a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t]
    }
    ujeto += useky[i]
  }
  return [body[0].lat, body[0].lon]
}

/**
 * Překreslí trasu plánu. Kreslí se až od dvou zastávek.
 * @param {L.Map} mapa
 */
export function drawPlanLine(mapa) {
  if (cara) {
    cara.remove()
    cara = null
  }
  if (ujeta) {
    ujeta.remove()
    ujeta = null
  }
  if (dodavka) {
    dodavka.remove()
    dodavka = null
  }

  // Za jízdy se kreslí otisk cesty, ne živý plán – plán se dá upravovat
  // i s rozjetou cestou a trasa na mapě má ukazovat to, co se opravdu jede.
  const jedeSe = !!store.cesta
  const zdrojIds = jedeSe ? store.cesta.zastavky : store.plan
  const body = zdrojIds.map((id) => S.byId[id]).filter(Boolean)
  if (body.length < 2) return

  cara = L.polyline(
    body.map((p) => [p.lat, p.lon]),
    { color: token('--zvyrazneni', '#E1B152'), weight: 4.5, opacity: jedeSe ? 0.5 : 0.95, lineCap: 'round', lineJoin: 'round' }
  ).addTo(mapa)

  // Ujetá část: plnou žlutou mezi odznačenými zastávkami v pořadí odznačení.
  // Bez GPS je to poctivá aproximace – spojnice míst, kde jsme opravdu byli.
  if (jedeSe) {
    const poradi = Object.entries(store.cesta.odznacene)
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => S.byId[id])
      .filter(Boolean)
    if (poradi.length >= 2) {
      ujeta = L.polyline(
        poradi.map((p) => [p.lat, p.lon]),
        { color: token('--sun', '#A87C24'), weight: 5.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }
      ).addTo(mapa)
    }
  }

  dodavka = L.marker(stredTrasy(body), {
    interactive: false,
    keyboard: false,
    icon: L.divIcon({ className: 'dodavka', iconSize: [0, 0], iconAnchor: [0, 0], html: `<img src="${vanObr}" alt="">` }),
  }).addTo(mapa)
}
