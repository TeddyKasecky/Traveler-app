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

/** Jméno obrázku se zrnem, na které se odkazuje `fill-pattern`. */
const ZRNO = 'zrno'
/** Strana dlaždice zrna. Mocnina dvou kvůli opakování v textuře. */
const ZRNO_STRANA = 64

/**
 * Vyrobí dlaždici zrna.
 *
 * Šedý šum s průhledností, ne barva – položí se přes barvy krajiny a jen je
 * rozmyje, takže plochy nevypadají jako vyplněné polygony. Dělá se v kódu,
 * aby se nic nestahovalo; v tmavém režimu se zesvětluje místo ztmavování,
 * jinak by tmavá krajina jen zčernala.
 *
 * @param {boolean} tmavy
 * @returns {{width: number, height: number, data: Uint8Array}}
 */
function zrnoObrazek(tmavy) {
  const n = ZRNO_STRANA
  const data = new Uint8Array(n * n * 4)
  // Pevný generátor: zrno musí být pokaždé stejné, jinak by mapa při každém
  // přebarvení vypadala jinak. Math.random() by tohle porušil.
  let seed = 20260818
  const nahoda = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let i = 0; i < n * n; i++) {
    const v = nahoda()
    const svetlo = tmavy ? 255 : 0
    // Většina bodů je průhledná, jen menšina nese skvrnku – jinak by z toho
    // byl rovnoměrný filtr a ne zrno.
    const alfa = v > 0.72 ? Math.round((v - 0.72) * 150) : 0
    data[i * 4] = svetlo
    data[i * 4 + 1] = svetlo
    data[i * 4 + 2] = svetlo
    data[i * 4 + 3] = alfa
  }
  return { width: n, height: n, data }
}

/**
 * Doplní zrno do mapy. Musí se to udělat po každé výměně stylu – obrázky
 * ve stylu nepřežijí `setStyle()`.
 *
 * @param {any} m  mapa MapLibre
 * @param {boolean} tmavy
 */
function pridejZrno(m, tmavy) {
  try {
    if (m.hasImage(ZRNO)) m.removeImage(ZRNO)
    m.addImage(ZRNO, zrnoObrazek(tmavy))
  } catch (e) {
    // Bez zrna mapa vypadá plošeji, ale kreslí – to je pořád lepší než pád.
    console.warn('Zrno se nepodařilo přidat:', e)
  }
}

/** Je protokol `vbm://` už zaregistrovaný? Podruhé by MapLibre zaprotestoval. */
let protokolHotov = false

/**
 * Je zapnutý tmavý režim? Pozná se podle jasu papíru – token `--bg` je
 * v tmavém režimu tmavý. Ptát se na `data-motiv` nestačí: při volbě „podle
 * systému" tam žádná hodnota není.
 */
function jeTmavy(el) {
  const bg = getComputedStyle(el).getPropertyValue('--bg').trim()
  const m = /#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(bg)
  if (!m) return false
  const jas = (parseInt(m[1], 16) + parseInt(m[2], 16) + parseInt(m[3], 16)) / 3
  return jas < 128
}

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
      /*
       * Pozadí se schválně NEKRESLÍ.
       *
       * Kdyby tu byla neprůhledná vrstva moře, zakryla by zrno papíru, které
       * leží pod mapou v CSS (`#map{background-image:papir.webp}`) – a právě
       * tím zrnem celá mapa vypadá malovaně, ne jako vyplněné polygony. Takhle
       * plátno MapLibre zůstane průhledné a moře je papír s barvou z CSS,
       * přesně jako u starého plátna.
       */
      {
        id: 'sous',
        type: 'fill',
        source: ZDROJ,
        'source-layer': 'earth',
        paint: { 'fill-color': c.sous, 'fill-opacity': 0.82 },
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
      /*
       * Zrno přes celou souš. Tohle je to „podvymalování": šedý šum s alfou
       * položený přes barvy krajiny, takže plochy nejsou ploché, ale rozmyté
       * jako akvarel na papíře. Obrázek se vyrábí v kódu (`zrnoObrazek()`),
       * takže se nic nestahuje a v tmavém režimu se přepočítá.
       */
      {
        id: 'zrno',
        type: 'fill',
        source: ZDROJ,
        'source-layer': 'earth',
        paint: { 'fill-pattern': ZRNO, 'fill-opacity': 0.5 },
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
    const el = mapa.getContainer()
    vrstva = L.maplibreGL({
      style: styl(el),
      pane,
      interactive: false,
      attributionControl: false,
    })
    // Mapa MapLibre vzniká až při přidání do Leafletu, takže se zrno doplňuje
    // odsud – dřív by nebylo do čeho.
    vrstva.on('add', () => {
      const m = vrstva.getMaplibreMap && vrstva.getMaplibreMap()
      if (!m) return
      const doplnit = () => pridejZrno(m, jeTmavy(el))
      if (m.isStyleLoaded()) doplnit()
      m.on('styledata', doplnit)
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
    // `setStyle()` zahodí i obrázky, takže se zrno musí přidat znovu.
    pridejZrno(m, jeTmavy(el))
  } catch {
    // Když se styl nepovede vyměnit, mapa zůstane ve staré paletě.
    // Je to ošklivé, ale pořád lepší než prázdná obrazovka.
  }
}

/** Zahodí vrstvu, aby šla postavit znovu (po smazání nebo stažení mapy). */
export function zahodVektory() {
  vrstva = null
}
