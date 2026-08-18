/**
 * Malovaná mapa z vektorových dlaždic (MapLibre uvnitř Leafletu).
 *
 * PROČ: podklad z Natural Earth neměl žádný pokryv krajiny – prošel jsem
 * všech 206 jeho vrstev a lesy, louky ani pole tam nejsou. Dlaždice Protomaps
 * je mají (vrstva `landcover`, postavená z OpenStreetMap), a k tomu vodu,
 * silnice a hranice.
 *
 * MAPLIBRE NENAHRAZUJE LEAFLET, JE V NĚM. Přes `maplibre-gl-leaflet` je to
 * obyčejná Leafletová vrstva, takže špendlíky, čára plánu, mini-mapa v detailu,
 * kresby stromů a hor i přepínač podkladu zůstávají přesně jak byly.
 *
 * CO MAPLIBRE SCHVÁLNĚ NEKRESLÍ: popisky. Na text by potřeboval vygenerované
 * SDF fonty Playfair Display i s českou diakritikou – stovky kB navíc a jiná
 * sazba než ve zbytku aplikace. Názvy zemí a měst proto zůstávají Leafletové
 * značky z `map/podklad.js`. MapLibre má na starost jen plochy a čáry.
 *
 * Barvy se čtou z `tokens.css` přes `getComputedStyle`, stejně jako je čte
 * dnešní plátno – jinak by se paleta rozešla a tmavý režim by na mapu nedosáhl.
 *
 * Data: `public/mapa-evropa.vbm`, stahuje se na vyžádání do IndexedDB
 * (`core/mapaDb.js`), čte `map/vbm.js`. Licence ODbL, OpenStreetMap.
 */

// MapLibre 6 nemá výchozí export, jen pojmenované – proto `* as`.
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
/*
 * Worker se musí Vitemu ukázat výslovně.
 *
 * MapLibre si adresu svého workeru skládá za běhu jako sourozední soubor vedle
 * sebe (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`). To funguje,
 * když se jeho `dist/` nasadí celý, ale ne když ho Vite zabalí do vlastního
 * chunku – ten soubor pak vedle nikdo nepoloží a prohlížeč dostane místo
 * workeru index.html. Mapa se pak tváří, že se načítá, a **mlčí**: styl zůstane
 * nenačtený, žádná dlaždice se nevyžádá a v konzoli není jediná chyba.
 * Stálo mě to půl dne hledání, tak ať to tu je napsané.
 *
 * `?worker&url` řekne Vitemu, ať worker přeloží i s jeho závislostmi
 * (importuje si `maplibre-gl-shared.mjs`) a vrátí adresu hotového souboru.
 */
import adresaWorkeru from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
// Most na Leaflet si `L` i `maplibregl` bere sám; import je tu kvůli tomu,
// že přidává `L.maplibreGL`. Musí přijít až za MapLibre.
import '@maplibre/maplibre-gl-leaflet'
import L from 'leaflet'
import { PROTOKOL, obsluhaProtokolu, zoomMax } from './vbm.js'

/** Jméno zdroje ve stylu. Na hodnotě nezáleží, jen se na něj odkazují vrstvy. */
const ZDROJ = 'vandrbuch'

/** Je protokol `vbm://` už zaregistrovaný? Podruhé by MapLibre zaprotestoval. */
let protokolHotov = false

/** Přečte barvu z CSS. Záloha je tam pro případ, že token zmizí. */
function barvy(el) {
  const s = getComputedStyle(el)
  const b = (n, zaloha) => s.getPropertyValue(n).trim() || zaloha
  return {
    sous: b('--mapa-sous', '#E7E0C3'),
    voda: b('--mapa-voda', '#9DC2CD'),
    more: b('--mapa-more', '#C6DAE1'),
    hranice: b('--mapa-hranice', 'rgba(255,252,246,.78)'),
    les: b('--mapa-les', '#B7C6A2'),
    louka: b('--mapa-louka', '#D2D9B4'),
    pole: b('--mapa-pole', '#DFDDB6'),
    krovi: b('--mapa-krovi', '#CFD2A9'),
    hola: b('--mapa-hola', '#DCD0AE'),
    led: b('--mapa-led', '#F0EDE2'),
    mesto: b('--mapa-mesto', '#DED5C0'),
    silnice: b('--mapa-silnice', '#C9A96B'),
  }
}

/**
 * Styl mapy.
 *
 * Názvy vrstev (`earth`, `landcover`, `water`, `roads`, `boundaries`) jsou
 * dané schématem Protomaps, nevymýšlím je. Průhlednost ploch je pod jedničkou
 * schválně: pod mapou leží zrno papíru z CSS a teprve tím krajina vypadá
 * malovaně, ne jako vyplněný polygon. Stejný trik používá i staré plátno.
 *
 * @param {HTMLElement} el  kontejner mapy, ze kterého se čtou barvy
 */
function styl(el) {
  const c = barvy(el)

  /** Výplň podle druhu pokryvu. `match` je výraz MapLibre, ne náš kód. */
  const pokryv = [
    'match',
    ['get', 'kind'],
    'forest', c.les,
    'grassland', c.louka,
    'farmland', c.pole,
    'scrub', c.krovi,
    'barren', c.hola,
    'glacier', c.led,
    'urban_area', c.mesto,
    c.louka,
  ]

  // `glyphs` se schválně neuvádí vůbec (ani jako undefined – validátor stylu
  // by protestoval). Popisky kreslí Leaflet, takže MapLibre žádné písmo
  // nepotřebuje a nestahuje.
  return {
    version: 8,
    sources: {
      [ZDROJ]: {
        type: 'vector',
        tiles: [`${PROTOKOL}://{z}/{x}/{y}`],
        minzoom: 0,
        maxzoom: zoomMax(),
      },
    },
    layers: [
      // Moře je pozadí celé mapy; souš se na něj položí.
      { id: 'more', type: 'background', paint: { 'background-color': c.more } },
      {
        id: 'sous',
        type: 'fill',
        source: ZDROJ,
        'source-layer': 'earth',
        paint: { 'fill-color': c.sous, 'fill-opacity': 0.9 },
      },
      {
        id: 'pokryv',
        type: 'fill',
        source: ZDROJ,
        'source-layer': 'landcover',
        paint: { 'fill-color': pokryv, 'fill-opacity': 0.62 },
      },
      {
        id: 'voda',
        type: 'fill',
        source: ZDROJ,
        'source-layer': 'water',
        paint: { 'fill-color': c.voda, 'fill-opacity': 0.85 },
      },
      // Řeky jsou v téže vrstvě jako plochy vody, jen jako čáry.
      {
        id: 'reky',
        type: 'line',
        source: ZDROJ,
        'source-layer': 'water',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': c.voda,
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 8, 1.6],
        },
      },
      {
        id: 'silnice',
        type: 'line',
        source: ZDROJ,
        'source-layer': 'roads',
        // Pod pátým přiblížením je z dálnic pavučina přes celý kontinent.
        minzoom: 5,
        paint: {
          'line-color': c.silnice,
          'line-opacity': 0.75,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 8, 1.8],
        },
      },
      // Hranice bílou tečkovanou čárou, jak je má předloha – ne tmavou linkou.
      {
        id: 'hranice',
        type: 'line',
        source: ZDROJ,
        'source-layer': 'boundaries',
        paint: {
          'line-color': c.hranice,
          'line-width': 1.4,
          'line-dasharray': [1, 3],
        },
      },
    ],
  }
}

/** @type {any} vrstva Leafletu, ve které bydlí MapLibre */
let vrstva = null

/**
 * Postaví vrstvu. Vrací `null`, když prohlížeč neumí WebGL – volající pak
 * nechá nastoupit záložní plátno z `basemap.json`.
 *
 * @param {import('leaflet').Map} mapa
 * @param {string} pane  do kterého Leafletového pane vrstva patří
 * @returns {any|null}
 */
export function postavVektory(mapa, pane) {
  // MapLibre kreslí přes WebGL. Verze 6 už `supported()` nemá, takže se ptáme
  // plátna přímo – bez tohohle by se chyba objevila až uvnitř knihovny.
  if (!maWebGL()) return null

  if (!protokolHotov) {
    // Musí být dřív, než vznikne první mapa – jinak si worker vezme svoji
    // vypočítanou adresu, která v našem balíčku neexistuje.
    maplibregl.setWorkerUrl(adresaWorkeru)
    maplibregl.addProtocol(PROTOKOL, obsluhaProtokolu)
    protokolHotov = true
  }

  try {
    vrstva = L.maplibreGL({
      style: styl(mapa.getContainer()),
      pane,
      interactive: false,
      attributionControl: false,
    })
    return vrstva
  } catch (e) {
    console.warn('Vektorová mapa nenaběhla, nastupuje záložní podklad:', e)
    return null
  }
}

/** Umí prohlížeč WebGL? */
export function maWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * Přebarví vrstvu podle aktuálního vzhledu.
 *
 * Styl si barvy zapekl při stavbě, takže se změnou proměnné v CSS
 * nepřepočítá – stejný důvod, proč se přebarvuje i staré plátno.
 *
 * @param {HTMLElement} el
 */
export function prebarviVektory(el) {
  if (!vrstva) return
  const m = vrstva.getMaplibreMap && vrstva.getMaplibreMap()
  if (!m) return
  try {
    m.setStyle(styl(el))
  } catch {
    // Když se styl nepovede vyměnit, mapa zůstane ve staré paletě.
    // Je to ošklivé, ale pořád lepší než prázdná obrazovka.
  }
}

/** Zahodí vrstvu, aby šla postavit znovu (po smazání nebo stažení mapy). */
export function zahodVektory() {
  vrstva = null
}
