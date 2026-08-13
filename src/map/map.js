/**
 * Hlavní mapa a překreslování.
 *
 * Mapa nezná obrazovky. Když se má po překreslení obnovit i panel, oznámí to
 * událostí `prekresleno`; kdo na ni reaguje, je v main.js. Stejně tak klik na
 * špendlík jen oznámí `otevriDetail`.
 */

import L from 'leaflet'
import { S, store, emit } from '../core/store.js'
import { visible, pocetAktivnich } from '../core/filters.js'
import { aktivujZalozku } from '../core/router.js'
import { pinIcon } from './markers.js'
import { drawPlanLine } from './planLine.js'

/** @type {L.Map} */
export let mapa
/** @type {L.LayerGroup} */
let vrstva
/** @type {L.CircleMarker|null} */
let markerPolohy = null

/** Vytvoří mapu. Volá se jednou při startu. */
export function initMapa() {
  mapa = L.map('map', { zoomControl: false }).setView([47.2, 10.5], 5)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap',
  }).addTo(mapa)
  L.control.zoom({ position: 'bottomleft' }).addTo(mapa)
  vrstva = L.layerGroup().addTo(mapa)

  // Při posunu mapy se rozjede tečkovaná „silnice“ v hlavičce.
  const road = document.getElementById('topRoad')
  mapa.on('movestart', () => road.classList.add('go'))
  mapa.on('moveend', () => setTimeout(() => road.classList.remove('go'), 350))
}

/**
 * Překreslí špendlíky, čáru plánu a všechna počítadla,
 * a nakonec oznámí, ať se obnoví otevřený panel.
 */
export function draw() {
  vrstva.clearLayers()
  const vs = visible()
  vs.forEach((p, i) =>
    L.marker([p.lat, p.lon], { icon: pinIcon(p, i) })
      .on('click', () => emit('otevriDetail', { p }))
      .addTo(vrstva)
  )
  drawPlanLine(mapa)

  const c = document.getElementById('count')
  document.getElementById('countN').textContent = `${vs.length} míst`
  c.classList.remove('bump')
  void c.offsetWidth // vynutí restart animace
  c.classList.add('bump')

  document.getElementById('totalN').textContent = S.places.length
  document.getElementById('visitedN').textContent = Object.values(store.stav).filter((x) => x === 'visited').length

  const n = pocetAktivnich()
  const b = document.getElementById('fBadge')
  b.hidden = !n
  b.textContent = n

  emit('prekresleno')
}

/**
 * Skočí na místo: přepne na mapu, zvýrazní špendlík, přiletí k němu
 * a po dokončení letu otevře detail.
 * @param {Record<string, any>} p
 */
export function goTo(p) {
  aktivujZalozku('map')
  S.hiId = p.id
  draw()
  mapa.flyTo([p.lat, p.lon], Math.max(mapa.getZoom(), 11), { duration: 0.8 })
  setTimeout(() => emit('otevriDetail', { p, focus: false }), 450)
}

/** Přiblíží mapu tak, aby byla vidět všechna filtrovaná místa. */
export function priblizNaFiltr(mista) {
  if (!mista.length) return
  mapa.flyToBounds(L.latLngBounds(mista.map((p) => [p.lat, p.lon])).pad(0.2), { duration: 0.9 })
}

/** Puntík s aktuální polohou. */
export function zobrazPolohu() {
  if (!S.userPos) return
  if (markerPolohy) markerPolohy.remove()
  markerPolohy = L.circleMarker([S.userPos.lat, S.userPos.lon], {
    radius: 9,
    color: '#292019',
    weight: 3,
    fillColor: '#D96B3C',
    fillOpacity: 1,
  }).addTo(mapa)
}

/** Po přepnutí na mapu si Leaflet musí přeměřit velikost. */
export function prepocitejVelikost() {
  setTimeout(() => mapa.invalidateSize(), 60)
}
