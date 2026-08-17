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
import { token } from '../core/barvy.js'
import { drawPlanLine } from './planLine.js'
import { zajistiPodklad, hlasStavDlazdic } from './offlineMap.js'

/** @type {L.Map} */
export let mapa
/** @type {L.LayerGroup} */
let vrstva
/** @type {L.CircleMarker|null} */
let markerPolohy = null

/**
 * Do stránky se vkládají jen špendlíky, které jsou vidět.
 *
 * Měření na 4× zpomaleném procesoru: posun mapy stál 849 ms přepočtu stylů,
 * přiblížení 270 ms. Nešlo o skript ani o rozvržení – Leaflet při tažení
 * a přibližování přepíná třídy na kontejneru a prohlížeč musí přepočítat styly
 * všech špendlíků pod ním. Každý má `::after`, stín a proměnnou `--pc`, takže
 * 580 kusů je znát.
 *
 * Vzhled se tím nemění: co je za okrajem, stejně nikdo nevidí. Rezerva kolem
 * výřezu je tu proto, aby špendlíky nedobíhaly až po zastavení posunu.
 */
const REZERVA_VYREZU = 0.4

/** Místa, která prošla filtry. Drží se mezi překresleními kvůli posunu mapy. */
let vFiltru = []

/** @type {Map<string, L.Marker>} id místa → špendlík, který je právě na mapě */
const naMape = new Map()

/** Vytvoří mapu. Volá se jednou při startu. */
export function initMapa() {
  mapa = L.map('map', { zoomControl: false }).setView([47.2, 10.5], 5)
  const dlazdice = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap',
  }).addTo(mapa)
  // Knoflíky +/− tu bývaly vlevo dole. Tam je od přestavby rozvržení karta
  // výpravy a předloha je nikde nemá; přibližuje se prsty, kolečkem myši nebo
  // klávesami, což Leaflet umí sám.
  vrstva = L.layerGroup().addTo(mapa)

  // Zjednodušený podklad se dotáhne, jakmile poprvé selže dlaždice, a pak už
  // zůstane – leží pod dlaždicemi, takže tam, kde dlaždice jsou, není vidět.
  // Nekouká se na `navigator.onLine`: ten hlásí jen zapojenou wifi, ne to,
  // jestli se dá někam dovolat.
  dlazdice.on('tileerror', () => {
    zajistiPodklad(mapa)
    hlasStavDlazdic(true)
  })
  dlazdice.on('tileload', () => hlasStavDlazdic(false))

  // Po každém posunu i přiblížení srovnat, které špendlíky jsou vidět.
  // `moveend` přijde i po zoomu, takže stačí jedna událost.
  mapa.on('moveend', () => srovnejVyrez(true))
}

/**
 * Překreslí špendlíky, čáru plánu a všechna počítadla,
 * a nakonec oznámí, ať se obnoví otevřený panel.
 */
export function draw() {
  // Stavy špendlíků (navštíveno, v plánu, zvýrazněno) se mohly změnit, takže se
  // zahodí všechny a postaví znovu – stejně jako dřív. Posun mapy naopak jen
  // doplňuje a odebírá, viz `srovnejVyrez()`.
  vrstva.clearLayers()
  naMape.clear()
  vFiltru = visible()
  srovnejVyrez(false)
  drawPlanLine(mapa)

  const c = document.getElementById('count')
  document.getElementById('countN').textContent = `${vFiltru.length} míst`
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
 * Doplní špendlíky, které se dostaly do výřezu, a odebere ty, co z něj vypadly.
 *
 * Počítadlo míst se nemění – ukazuje pořád všechna místa, která prošla filtry,
 * ne jen ta právě vykreslená.
 *
 * @param {boolean} tise  true = špendlíky přibyly posunem, ať nenabíhají animací
 */
function srovnejVyrez(tise = true) {
  const meze = mapa.getBounds().pad(REZERVA_VYREZU)
  const majiByt = new Set()

  let i = 0
  for (const p of vFiltru) {
    if (!meze.contains([p.lat, p.lon])) continue
    majiByt.add(p.id)
    if (!naMape.has(p.id)) {
      const m = L.marker([p.lat, p.lon], { icon: pinIcon(p, i, tise) })
        .on('click', () => emit('otevriDetail', { p }))
        .addTo(vrstva)
      naMape.set(p.id, m)
    }
    i++
  }

  for (const [id, m] of naMape) {
    if (majiByt.has(id)) continue
    vrstva.removeLayer(m)
    naMape.delete(id)
  }
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
    color: token('--text', '#2F3D2C'),
    weight: 3,
    fillColor: token('--akcent', '#5E6E4D'),
    fillOpacity: 1,
  }).addTo(mapa)
}

/** Po přepnutí na mapu si Leaflet musí přeměřit velikost. */
export function prepocitejVelikost() {
  setTimeout(() => mapa.invalidateSize(), 60)
}
