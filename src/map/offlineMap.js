/**
 * Zjednodušená mapa pro chvíle bez signálu.
 *
 * Dlaždice z OpenStreetMap se offline neukládají a hromadně stahovat se nesmějí
 * (podmínky OSM), takže bez signálu zůstávala mapa šedá. Tahle vrstva ji nahradí:
 * pobřeží, hranice států, jezera, řeky a města. Není to mapa na navigaci – je na
 * to, aby bylo poznat, kde zhruba jsme.
 *
 * KLÍČOVÉ ROZHODNUTÍ: vrstva leží **pod** dlaždicemi a jakmile se jednou zapne,
 * už se nevypíná. Původně se přepínala podle toho, jestli dlaždice jdou – jenže
 * prohlížeč si nedávno prohlédnuté dlaždice drží v cache, takže offline část
 * dlaždic dorazí a část ne. Přepínání by pod rukama blikalo. Takhle se nic
 * nepřepíná: kde dlaždice jsou, překryjí podklad; kde chybí, podklad prosvítá.
 * Díra v mapě se tím vyplní i uprostřed jinak funkční mapy.
 *
 * Podklad se načítá až při prvním selhání dlaždice (dynamický import), takže
 * start aplikace nezdržuje. Service worker si ten kus předukládá, jinak by celá
 * věc byla offline k ničemu.
 *
 * Data jsou z Natural Earth (public domain), připravuje je
 * `scripts/make-basemap.mjs`. Souřadnice jsou rovnou [lat, lon].
 */

import L from 'leaflet'
import { esc } from '../core/html.js'

/** Vlastní pane pod dlaždicemi. Leaflet dává `tilePane` z-index 200. */
const PANE = 'podklad'
const Z_INDEX = 150

/** Od kolika přiblížení se vypisují názvy měst. Níž by se slily do kaše. */
const ZOOM_POPISKY = 5

/** Jak dlouho po návratu dlaždic ještě svítí štítek „offline". */
const STITEK_DOBEH = 2500

/** @type {Promise<L.LayerGroup>|null} zajišťuje, že se podklad staví jen jednou */
let priprava = null
/** @type {L.LayerGroup|null} */
let popisky = null
/** @type {L.Map|null} */
let mapaRef = null

/** Nakreslený podklad. Drží se kvůli přebarvení při změně vzhledu. */
/** @type {L.LayerGroup|null} */
let podklad = null

/** Barvy se čtou z CSS, ať zůstávají na jednom místě jako všechny ostatní. */
function barvy(el) {
  const s = getComputedStyle(el)
  const b = (n, zaloha) => s.getPropertyValue(n).trim() || zaloha
  return {
    sous: b('--sous', '#F2ECDD'),
    hranice: b('--hranice', 'rgba(41,32,25,.38)'),
    voda: b('--voda', '#7FA9BA'),
  }
}

/** Postaví kreslenou část podkladu. */
function postav(mapa, data) {
  const c = barvy(mapa.getContainer())
  const kreslic = L.canvas({ pane: PANE, padding: 0.3 })
  const spolecne = { renderer: kreslic, pane: PANE, interactive: false }
  const kusy = []

  for (const obrys of data.zeme) {
    kusy.push(L.polygon(obrys, { ...spolecne, color: c.hranice, weight: 1, fillColor: c.sous, fillOpacity: 1 }))
  }
  for (const obrys of data.jezera) {
    kusy.push(L.polygon(obrys, { ...spolecne, color: c.voda, weight: 0.6, fillColor: c.voda, fillOpacity: 0.65 }))
  }
  for (const cara of data.reky) {
    kusy.push(L.polyline(cara, { ...spolecne, color: c.voda, weight: 0.8, opacity: 0.75 }))
  }
  for (const [lat, lon] of data.mesta) {
    kusy.push(
      L.circleMarker([lat, lon], { ...spolecne, radius: 1.8, color: c.hranice, fillColor: c.hranice, fillOpacity: 1 })
    )
  }
  return L.layerGroup(kusy)
}

/** Názvy měst jsou prvky stránky, ne kresba – proto zvlášť a až od `ZOOM_POPISKY`. */
function postavPopisky(data) {
  return L.layerGroup(
    data.mesta.map(([lat, lon, nazev]) =>
      L.marker([lat, lon], {
        pane: PANE,
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: 'mesto-popisek', html: esc(nazev), iconSize: null }),
      })
    )
  )
}

/** Přidá nebo odebere názvy měst podle přiblížení. */
function srovnejPopisky() {
  if (!mapaRef || !popisky) return
  const maByt = mapaRef.getZoom() >= ZOOM_POPISKY
  const je = mapaRef.hasLayer(popisky)
  if (maByt && !je) popisky.addTo(mapaRef)
  else if (!maByt && je) mapaRef.removeLayer(popisky)
}

/** Je podklad už na mapě? */
export const jeZapnuta = () => !!popisky

/**
 * Zajistí, že je podklad na mapě. Opakované volání nic nedělá.
 *
 * @param {L.Map} mapa
 * @returns {Promise<void>}
 */
export function zajistiPodklad(mapa) {
  if (priprava) return priprava.then(() => undefined)

  priprava = (async () => {
    mapaRef = mapa

    if (!mapa.getPane(PANE)) {
      const p = mapa.createPane(PANE)
      p.style.zIndex = String(Z_INDEX)
      // Ať vrstva nepřebírá kliknutí určená špendlíkům a mapě.
      p.style.pointerEvents = 'none'
    }

    const data = (await import('../data/basemap.json')).default

    mapa.getContainer().classList.add('offline')
    podklad = postav(mapa, data).addTo(mapa)
    const vrstva = podklad
    popisky = postavPopisky(data)
    srovnejPopisky()
    mapa.on('zoomend', srovnejPopisky)
    return vrstva
  })()

  // Kdyby se podklad nepodařilo načíst, ať to jde zkusit znovu při další dlaždici.
  priprava.catch(() => {
    priprava = null
  })

  return priprava.then(() => undefined)
}

/**
 * Přebarví podklad podle aktuálního vzhledu.
 *
 * Barvy se čtou z CSS, ale Leaflet si je při stavbě zapekl do plátna, takže
 * se změnou proměnné nepřepočítají. Bez tohohle by pod tmavou aplikací
 * zůstala svítit béžová pevnina – a všimla by si toho až ta nejhorší možná
 * chvíle, tedy v noci bez signálu.
 */
export function prebarviPodklad() {
  if (!podklad || !mapaRef) return
  const c = barvy(mapaRef.getContainer())
  for (const kus of podklad.getLayers()) {
    const o = kus.options
    // Voda se pozná podle toho, že měla obrys i výplň ve stejné barvě.
    const jeVoda = o.fillOpacity === 0.65 || o.opacity === 0.75
    if (jeVoda) kus.setStyle({ color: c.voda, fillColor: c.voda })
    else if (o.radius) kus.setStyle({ color: c.hranice, fillColor: c.hranice })
    else kus.setStyle({ color: c.hranice, fillColor: c.sous })
  }
}

/* ================= štítek ================= */

let dobeh = null

/**
 * Přepne štítek „Offline · zjednodušená mapa".
 *
 * Selhaná dlaždice ho rozsvítí okamžitě, úspěšná zhasne až po `STITEK_DOBEH`.
 * To zpoždění tu je proto, že prohlížeč offline servíruje nedávno prohlédnuté
 * dlaždice ze své cache – část jich tedy dorazí a část ne, obojí během jedné
 * vteřiny. Bez zpoždění by štítek blikal.
 *
 * Když se uživatel nehýbe, nechodí ani jedna událost a štítek zůstane svítit –
 * to je správně, mapa pod ním je pořád ta zjednodušená.
 *
 * @param {boolean} chybi  selhala dlaždice (true), nebo se načetla (false)
 */
export function hlasStavDlazdic(chybi) {
  const el = document.getElementById('offlineStitek')
  if (!el) return

  if (chybi) {
    clearTimeout(dobeh)
    dobeh = null
    if (el.hidden) {
      el.textContent = 'Offline · zjednodušená mapa'
      el.hidden = false
    }
    return
  }

  if (el.hidden || dobeh) return
  dobeh = setTimeout(() => {
    dobeh = null
    el.hidden = true
  }, STITEK_DOBEH)
}
