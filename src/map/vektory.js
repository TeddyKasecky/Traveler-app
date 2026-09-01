/**
 * Malovaná mapa z vektorových dlaždic (MapLibre uvnitř Leafletu).
 *
 * PROČ: podklad z Natural Earth neměl žádný pokryv krajiny – prošel jsem
 * všech 206 jeho vrstev a lesy, louky ani pole tam nejsou. Dlaždice Protomaps
 * je mají (vrstva `landcover`, postavená z OpenStreetMap), a k tomu vodu,
 * silnice a hranice.
 *
 * MAPLIBRE NENAHRAZUJE LEAFLET, JE V NĚM. Přes `maplibre-gl-leaflet` je to
 * obyčejná Leafletová vrstva, takže špendlíky, čára plánu, mini-mapa v detailu
 * i přepínač podkladu zůstávají přesně jak byly.
 *
 * CO MAPLIBRE SCHVÁLNĚ NEKRESLÍ: popisky. Na text by potřeboval vygenerované
 * SDF fonty Playfair Display i s českou diakritikou – stovky kB navíc a jiná
 * sazba než ve zbytku aplikace. Názvy zemí a měst proto zůstávají Leafletové
 * značky z `map/podklad.js`. Kresby jsou naopak obrázky, ne text, takže se
 * žádné písmo nepotřebuje ani na ně.
 *
 * KRESBY KRAJINY (srpen 2026) přestaly být Leafletové značky. Bylo jich sto
 * deset, každá až sto dvacet pixelů vysoká, každá s CSS filtrem – a prohlížeč
 * je při každém posunu mapy překresloval. Teď je kreslí MapLibre jako `symbol`
 * vrstvu na GPU, je jich několik tisíc, jsou malé a hustotu si mapa řídí sama
 * srážkami: v lese je stromů plno, u okraje řídnou, při oddálení se proředí.
 * Kde stojí, počítá `make-mapa.mjs` ze skutečných lesů a `make-relief.mjs`
 * ze skutečného výškopisu.
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
import { prefs } from '../core/store.js'
import { nactiMasky, poskladej, ROZTEC } from './kresby.js'

/*
 * Sto dvacet kreseb se tu bere globem, ne jmenovitě.
 *
 * U deseti kreseb dávalo smysl vypsat je ručně (viz `podklad.js`, kde je tak
 * bral starý podklad), u sto dvaceti ne. Glob je `eager`, takže se přeloží
 * při buildu a jména se srovnají podle abecedy – pořadí je tedy dané, ne
 * náhodné. Do jednosouborové varianty se tenhle soubor nedostane vůbec
 * jen se staženým balíkem dlaždic.
 */
const OBRAZKY = import.meta.glob('../assets/kresba/*.webp', { eager: true, query: '?url', import: 'default' })

/** Jméno zdroje ve stylu. Na hodnotě nezáleží, jen se na něj odkazují vrstvy. */
const ZDROJ = 'vandrbuch'
/** Zdroj s kresbami krajiny. */
const ZDROJ_KRESBY = 'kresby'

/**
 * Od jakého přiblížení se kreslí podrobné kresby.
 *
 * Níž jde na řadu přehledový list – jeho kresby jsou jednodušší, a když má
 * strom na obrazovce patnáct pixelů, drží tvar líp než podrobná kresba,
 * ze které je stejně jen skvrna.
 */
const ZOOM_PODROBNE = 7

/** Je protokol `vbm://` už zaregistrovaný? Podruhé by MapLibre zaprotestoval. */
let protokolHotov = false

/** @type {any} vrstva Leafletu, ve které bydlí MapLibre */
let vrstva = null

/** Kresby načtené jako obrázky. Klíč je jméno bez přípony. */
let obrazky = null
/** Značky sídel. Staví se jednou, přežijí výměnu stylu. */
let sidla = null
/** Kresby krajiny pro právě připravený výřez. Přežijí výměnu stylu. */
let krajina = null
/**
 * Pro jaký výřez a přiblížení je `krajina` postavená.
 *
 * Podle toho se pozná, kdy se má přepočítat. Kdyby se počítalo při každém
 * posunu, mapa by při tažení přeblikávala — a přitom se skoro nic nemění,
 * protože výřez se připravuje o polovinu větší, než je vidět.
 */
let pripraveno = null

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

/* ================= kresby ================= */

/**
 * Načte všech sto dvacet kreseb a nechá si je jako body obrázku.
 *
 * Drží se rozebrané na body, ne jako `<img>`: tmavá varianta se z nich počítá
 * v prohlížeči (viz `ztlum()`), takže by se stejně musely na plátno překreslit.
 * Kreslí se přes `createImageBitmap`, protože ten dekóduje mimo hlavní vlákno.
 */
async function nactiObrazky() {
  if (obrazky) return obrazky
  const jmena = Object.keys(OBRAZKY).sort()
  const platno = document.createElement('canvas')
  const ctx = platno.getContext('2d', { willReadFrequently: true })
  const out = new Map()

  await Promise.all(
    jmena.map(async (cesta) => {
      // Předpona `kresba-` je v souborech kvůli filtru předukládané cache
      // (viz `vite.config.js`); ve stylu by jen zaplevelila výrazy.
      const jmeno = cesta.slice(cesta.lastIndexOf('/') + 1).replace('.webp', '').replace(/^kresba-/, '')
      try {
        const odpoved = await fetch(OBRAZKY[cesta])
        const bitmapa = await createImageBitmap(await odpoved.blob())
        platno.width = bitmapa.width
        platno.height = bitmapa.height
        ctx.clearRect(0, 0, bitmapa.width, bitmapa.height)
        ctx.drawImage(bitmapa, 0, 0)
        out.set(jmeno, ctx.getImageData(0, 0, bitmapa.width, bitmapa.height))
        bitmapa.close()
      } catch (e) {
        console.warn(`kresba ${jmeno} se nenačetla:`, e)
      }
    })
  )
  obrazky = out
  return out
}

/**
 * Kolik barvy podkladu se přimíchá do kresby.
 *
 * Kresby jsou proti tlumené mapě o kus živější a bez tohohle leží **na** mapě,
 * ne **v** ní — vypadají jako nalepené výstřižky. Deset procent barvy lesní
 * plochy stačí, aby sedly do papíru, a přitom jim zůstane inkoust i tvar.
 * Víc už z hor dělá mlhu; vyzkoušeno na náhledech.
 */
const SLADENI = 0.1

/**
 * Sladí kresbu s podkladem a v tmavém režimu ji ztlumí.
 *
 * Akvarely jsou malované na světlý papír, takže na tmavé mapě svítí. Dřív to
 * řešil CSS filtr `saturate(.7) brightness(.62)`, jenže filtr na stovce prvků
 * znamenal překreslení při každém posunu. Tady se to spočítá jednou, po bodech,
 * a do mapy jde hotový obrázek.
 *
 * Míchá se k barvě, kterou má **zrovna teď** lesní plocha — ve světlém režimu
 * ke světlé, v tmavém k tmavé. Kdyby se to zapeklo do souborů při výrobě,
 * musely by být dvě sady.
 */
function uprav(zdroj, tmavy, cil) {
  const out = new ImageData(zdroj.width, zdroj.height)
  const a = zdroj.data
  const b = out.data
  for (let i = 0; i < a.length; i += 4) {
    let r = a[i]
    let g = a[i + 1]
    let m = a[i + 2]
    if (tmavy) {
      // Šeď podle vnímaného jasu, pak zpátky k barvě na 70 % a ztmavit na 62 %.
      const sed = 0.299 * r + 0.587 * g + 0.114 * m
      r = (sed + (r - sed) * 0.7) * 0.62
      g = (sed + (g - sed) * 0.7) * 0.62
      m = (sed + (m - sed) * 0.7) * 0.62
    }
    b[i] = r * (1 - SLADENI) + cil[0] * SLADENI
    b[i + 1] = g * (1 - SLADENI) + cil[1] * SLADENI
    b[i + 2] = m * (1 - SLADENI) + cil[2] * SLADENI
    b[i + 3] = a[i + 3]
  }
  return out
}

/** Rozebere CSS barvu na tři složky. Zvládne `#rrggbb` i `rgb(...)`. */
function slozky(barva) {
  const hex = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(barva.trim())
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)]
  const rgb = barva.match(/\d+/g)
  return rgb && rgb.length >= 3 ? rgb.slice(0, 3).map(Number) : [183, 198, 162]
}

/**
 * Pořadové číslo kresby 1…`kolik` podle čísla 0–1.
 *
 * Strop tam musí být: uložená velikost je zaokrouhlená na dvě desetinná místa,
 * takže z 0,997 se stane rovná jedna a `1 + floor(1 × 4)` je pět. Chybějící
 * kresbu MapLibre jen zahlásí do konzole a nakreslí prázdno.
 */
const která = (kolik, v) => 1 + Math.min(kolik - 1, Math.floor(v * kolik))

/**
 * Postaví značky sídel.
 *
 * Sídla zůstávají seznamem, ne maskou: je jich devět set osmdesát pět, mají
 * jméno a pořadí podle velikosti, a to se do obrázku nevejde. Kresby krajiny
 * naopak seznam nepotřebují — skládají se z masky, viz `map/kresby.js`.
 *
 * Jméno obrázku se počítá **tady, ne výrazem ve stylu**: výraz by ho musel
 * skládat pro každý bod při každém kreslení, kdežto takhle je to jednou
 * a MapLibre jen čte hotovou vlastnost.
 *
 * @param {Array} mesta  [lat, lon, jméno, min_zoom, pořadí podle velikosti]
 */
function sbirkaSidel(mesta) {
  const sidla = []
  for (const [lat, lon, jmeno, mz, rank] of mesta) {
    const v = (Math.abs(Math.round(lat * 1000) * 31 + Math.round(lon * 1000) * 17) % 1000) / 1000
    // Čím větší sídlo, tím honosnější značka – tak to dělaly staré mapy.
    // Nejmenší sídla dostanou jednou za osm mlýn, most nebo zříceninu:
    // jsou to okrasy, které mapě dodají to, čím je mapa v KCD zajímavá.
    const zaklad = rank >= 13 ? 'hrad' : rank >= 11 ? 'ves' : v < 0.12 ? 'stavba' : 'osada'
    sidla.push({
      type: 'Feature',
      properties: {
        ik: `${zaklad}-${která(4, v)}`,
        im: `maly-sidlo-${zaklad === 'hrad' ? 3 : zaklad === 'ves' ? 2 : zaklad === 'stavba' ? 4 : 1}`,
        v: +(0.9 + v * 0.25).toFixed(2),
        // Velká sídla se kreslí přednostně: při srážce vyhraje nižší klíč.
        s: -rank,
        mz,
      },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    })
  }
  return { type: 'FeatureCollection', features: sidla }
}

/** Zrovna se vkládají obrázky? Viz komentář u `vlozObrazky()`. */
let vkladameObrazky = false

/**
 * Vloží kresby do mapy. Po výměně stylu se musí zopakovat – obrázky ji nepřežijí.
 *
 * POJISTKA PROTI ZACYKLENÍ: `addImage()` sám vyvolá událost `styledata`. Když
 * na ní tahle funkce visela, volala se ze sebe pro každý ze sto dvaceti
 * obrázků, dokud nedošel zásobník – a mapa se přitom tvářila, že se jen dlouho
 * načítá. Odběr je proto jednorázový (`once`) a tohle je druhá pojistka.
 */
function vlozObrazky(m, el) {
  if (!obrazky || vkladameObrazky) return
  vkladameObrazky = true
  const tmavy = jeTmavy(el)
  const cil = slozky(barvy(el).les)
  try {
    for (const [jmeno, data] of obrazky) {
      try {
        if (m.hasImage(jmeno)) m.removeImage(jmeno)
        m.addImage(jmeno, uprav(data, tmavy, cil))
      } catch (e) {
        console.warn(`kresbu ${jmeno} se nepodařilo vložit:`, e)
      }
    }
  } finally {
    vkladameObrazky = false
  }
}

/* ================= styl ================= */

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
  const PRAZDNO = { type: 'FeatureCollection', features: [] }

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

  /** Která kresba: pod sedmičkou jednodušší z přehledového listu. */
  const kteryObrazek = ['step', ['zoom'], ['get', 'im'], ZOOM_PODROBNE, ['get', 'ik']]

  /**
   * Velikost kresby podle přiblížení, rozkolísaná vlastností `v`.
   *
   * Násobení musí být **uvnitř** jednotlivých zastávek, ne kolem celého
   * výrazu: MapLibre `['zoom']` připouští jen jako přímý vstup `interpolate`
   * nebo `step`. Napsané naopak (`['*', ['interpolate', …], ['get','v']]`)
   * projde jako JavaScript, ale validátor stylu **celou vrstvu odmítne**
   * a kresby se prostě nekreslí – bez jediného slova, když člověk nekouká
   * do konzole.
   */
  const velikost = (zastavky) => [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...zastavky.flatMap(([z, k]) => [z, ['*', k, ['get', 'v']]]),
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
      // Kresby krajiny se doplní hned po postavení stylu, viz `prepocitej()`.
      [ZDROJ_KRESBY]: { type: 'geojson', data: krajina || PRAZDNO },
      sidla: { type: 'geojson', data: sidla || PRAZDNO },
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
      /*
       * Kresby krajiny. Tady jsou tři věci, na kterých stojí, jestli to
       * vypadá jako mapa, nebo jako nálepky nalepené na mapu:
       *
       * `icon-allow-overlap: true` — kresby se **mají** překrývat. Do srpna
       * 2026 tu bylo `false` a MapLibre zahazoval všechno, co se dotýkalo:
       * z lesa byla řídká síť oddělených stromů. Vypnuté srážky jsou navíc
       * levnější, protože počítání srážek je nejdražší část kreslení symbolů.
       *
       * `icon-ignore-placement: true` — kresba ani nezabírá místo ostatním.
       * Bez toho by sice mohla překrývat, ale sousedku by pořád vytlačila.
       *
       * `symbol-z-order: 'viewport-y'` — kresba níž na obrazovce se kreslí
       * později, takže překryje tu za sebou. Z řad stromů tím vznikne les
       * s hloubkou a z řady štítů pohoří. Pozor: kdyby byl nastavený
       * `symbol-sort-key`, MapLibre by řadil podle něj a tohle ignoroval.
       */
      {
        id: 'kresby',
        type: 'symbol',
        source: ZDROJ_KRESBY,
        minzoom: 4,
        layout: {
          'icon-image': kteryObrazek,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'symbol-z-order': 'viewport-y',
          'icon-size': velikost([
            [4, 0.07],
            [6, 0.14],
            [8, 0.26],
            [10, 0.34],
          ]),
        },
        paint: { 'icon-opacity': 0.9 },
      },
      /*
       * Sídla zvlášť, aby se kreslila nad kresbami krajiny a řídla podle
       * vlastního `min_zoom` z dat – u vsi má smysl jiné přiblížení než
       * u lesa.
       */
      {
        id: 'sidla',
        type: 'symbol',
        source: 'sidla',
        minzoom: 5,
        filter: ['<=', ['get', 'mz'], ['zoom']],
        layout: {
          'icon-image': kteryObrazek,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': false,
          'icon-padding': 2,
          'symbol-sort-key': ['get', 's'],
          'icon-size': velikost([
            [5, 0.1],
            [7, 0.2],
            [10, 0.32],
          ]),
        },
      },
    ],
  }
}

/* ================= vrstva ================= */

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

      /*
       * Strop na hustotu bodů. Tohle je největší jediná úspora v celé mapě.
       *
       * MapLibre kreslí ve výchozím stavu v plné hustotě displeje a
       * `maplibre-gl-leaflet` k tomu dělá plátno o pětinu větší, než je mapa.
       * Na telefonu s trojnásobnou hustotou to znamená třináctkrát víc pixelů,
       * než má mapa v CSS – a překresluje se to při každém posunu. Akvarelová
       * mapa je přitom záměrně měkká, takže na ní rozdíl mezi 1,5 a 3 není
       * poznat; práce na pixelech ale klesne na čtvrtinu.
       */
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),

      // Mapa Evropy nepotřebuje kreslit svět třikrát vedle sebe.
      renderWorldCopies: false,
      // Dlaždice jsou z disku, prolínat je není proč – a každé prolnutí
      // znamená další snímky navíc po dojetí.
      fadeDuration: 0,
      // Z disku nic neexpiruje.
      refreshExpiredTiles: false,
      // Celá Evropa má 229 jedinečných dlaždic, takže se po ní dá courovat
      // tam a zpět, aniž by se cokoli parsovalo znovu.
      maxTileCacheSize: 96,
    })

    // Mapa MapLibre vzniká až při přidání do Leafletu, takže se obrázky
    // doplňují odsud – dřív by nebylo do čeho.
    vrstva.on('add', () => {
      const m = vrstva.getMaplibreMap && vrstva.getMaplibreMap()
      if (!m) return
      // Jednorázově, ne `on`: `addImage()` sám vyvolá `styledata`, takže by
      // se obsluha volala ze sebe, dokud nedojde zásobník.
      if (m.isStyleLoaded()) vlozObrazky(m, el)
      else m.once('styledata', () => vlozObrazky(m, el))
      pripravKresby(m, el)
    })
    return vrstva
  } catch (e) {
    console.warn('Vektorová mapa nenaběhla, nastupuje záložní podklad:', e)
    return null
  }
}

/**
 * Natáhne kresby a jejich rozmístění a vloží je do mapy.
 *
 * Děje se to **až po tom, co mapa vznikne**, a schválně: první obraz mapy tak
 * nečeká na půl megabajtu souřadnic ani na sto dvacet obrázků. Než dorazí,
 * je vidět krajina bez kreseb, což je pořád mapa.
 */
async function pripravKresby(m, el) {
  try {
    const [mesta] = await Promise.all([import('../data/mesta.json'), nactiMasky(), nactiObrazky()])
    vlozObrazky(m, el)

    sidla = sbirkaSidel(mesta.default.mesta)
    const s = m.getSource('sidla')
    if (s) s.setData(sidla)

    prepocitej(m, true)
    // Po dojetí mapy se zkontroluje, jestli výřez nevyjel z připraveného
    // pásma. Vlastní přepočet se skoro nikdy nespustí, viz `prepocitej()`.
    m.on('moveend', () => prepocitej(m))
  } catch (e) {
    console.warn('Kresby krajiny se nenačetly:', e)
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
    // `styl()` si data kreseb vezme z `kresby`, takže se po výměně nemusí
    // nastavovat znovu. Obrázky ale výměnu nepřežijí a musí se vložit znovu –
    // navíc v druhé, ztlumené variantě. Čeká se na nový styl; vkládat je
    // do rozdělaného by MapLibre zahodil spolu se starým.
    m.setStyle(styl(el))
    m.once('styledata', () => vlozObrazky(m, el))
  } catch {
    // Když se styl nepovede vyměnit, mapa zůstane ve staré paletě.
    // Je to ošklivé, ale pořád lepší než prázdná obrazovka.
  }
}

/** Zahodí vrstvu, aby šla postavit znovu (po smazání nebo stažení mapy). */
export function zahodVektory() {
  vrstva = null
  krajina = null
  pripraveno = null
}

/**
 * Přepočítá kresby krajiny pro aktuální výřez.
 *
 * NEPOČÍTÁ SE PŘI KAŽDÉM POSUNU. Výřez se připravuje o polovinu větší, než je
 * vidět, takže se běžným tažením nevyjede — a dokud se nevyjede a nezmění
 * přiblížení, není co dělat. Bez toho by mapa při tažení přeblikávala,
 * protože každá výměna dat znamená, že si MapLibre zdroj znovu rozřeže.
 *
 * @param {any} m  mapa MapLibre
 * @param {boolean} [vzdy]  přepočítat, i když se nic nezměnilo (změna volby)
 */
export function prepocitej(m, vzdy = false) {
  if (!m || !m.getSource) return
  const zdroj = m.getSource(ZDROJ_KRESBY)
  if (!zdroj) return

  const cil = ROZTEC[prefs.kresby === 'stridme' ? 'stridme' : 'huste']
  if (prefs.kresby === 'vypnute') {
    if (krajina && krajina.features.length === 0 && !vzdy) return
    krajina = { type: 'FeatureCollection', features: [] }
    pripraveno = null
    zdroj.setData(krajina)
    return
  }

  // `maplibre-gl-leaflet` drží mapu o stupeň níž (kreslí na dvojnásobné
  // dlaždici), takže přiblížení Leafletu je o jedničku výš.
  const zoom = m.getZoom() + 1
  const b = m.getBounds()
  const vyrez = { jih: b.getSouth(), sever: b.getNorth(), zapad: b.getWest(), vychod: b.getEast() }

  if (!vzdy && pripraveno && Math.abs(pripraveno.zoom - zoom) < 0.01 && vejdeSe(vyrez, pripraveno.pasmo)) return

  // Připravené pásmo: výřez roztažený na obě strany o polovinu.
  const dLat = (vyrez.sever - vyrez.jih) / 2
  const dLon = (vyrez.vychod - vyrez.zapad) / 2
  const pasmo = {
    jih: vyrez.jih - dLat,
    sever: vyrez.sever + dLat,
    zapad: vyrez.zapad - dLon,
    vychod: vyrez.vychod + dLon,
  }

  krajina = poskladej(pasmo, zoom, cil)
  pripraveno = { zoom, pasmo }
  zdroj.setData(krajina)
}

/** Vejde se výřez celý do pásma? */
function vejdeSe(v, p) {
  return v.jih >= p.jih && v.sever <= p.sever && v.zapad >= p.zapad && v.vychod <= p.vychod
}

/**
 * Přepne hustotu kreseb. Volá to Nastavení, aby se nemuselo restartovat.
 */
export function obnovKresby() {
  if (!vrstva) return
  const m = vrstva.getMaplibreMap && vrstva.getMaplibreMap()
  if (m) prepocitej(m, true)
}
