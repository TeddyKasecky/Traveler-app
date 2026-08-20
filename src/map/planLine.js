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
import { esc } from '../core/html.js'
import { dkm } from '../core/geo.js'
import { token } from '../core/barvy.js'
import { pozice } from '../core/pozice.js'
import { projektujNaTrasu } from '../core/projekce.js'
import vanObr from '../assets/van.webp'

/** @type {L.Polyline|null} */
let cara = null
/** @type {L.Polyline|null} čára ujeté části během Aktuální cesty */
let ujeta = null
/** @type {L.Marker|null} */
let dodavka = null
/** @type {L.LayerGroup|null} špendlíky vlastních míst z bloků plánu */
let vlastni = null
/** @type {L.CircleMarker|null} živě sledovaná poloha promítnutá na trasu (views/plan/cesta-zivot.js) */
let zivaZnacka = null

/**
 * Aktuální souřadnice bodu trasy, nebo null.
 *
 * Duplikát views/plan/body.js#souradniceBodu – mapa nesmí importovat views
 * (viz vlastnipin níž, kde je ze stejného důvodu podruhé výčet druhů), ale
 * core/pozice.js smí, takže se dá dotáhnout živá hodnota uložené pozice, ne
 * jen zastaralá kopie v `b.lat`/`b.lon`.
 * @param {object} b  bod trasy (blok typu misto)
 */
function souradniceBodu(b) {
  if (b.zdroj && b.zdroj.typ === 'pozice') {
    const p = pozice(b.zdroj.id)
    return p ? { lat: p.lat, lon: p.lon } : null
  }
  return Number.isFinite(b.lat) && Number.isFinite(b.lon) ? { lat: b.lat, lon: b.lon } : null
}

/**
 * Otisk seznamu bodů – duplikát views/plan/routing.js#otiskBodu ze stejného
 * důvodu jako souradniceBodu výš (mapa nesmí importovat views). Používá se
 * jen na porovnání `===` s `store.aktivniPrepocet.otisk`, ne na zápis.
 * @param {Array<{lat: number, lon: number, id?: string}>} body
 */
function otiskBodu(body) {
  return body.map((b) => `${b.id || ''}:${b.lat.toFixed(5)},${b.lon.toFixed(5)}`).join('|')
}

/**
 * Vlastní místa aktivní výpravy (bloky typu `misto` s rozpoznatelnou polohou).
 *
 * Čtou se přímo ze `store.bloky` – jsou to data, ne view, takže mapa smí.
 * Vrací je v pořadí dnů, aby se daly vplést do trasy za zastávky svého dne;
 * `lat`/`lon` jsou dosazené aktuální (viz souradniceBodu výš), ne nutně to,
 * co má blok zapsané přímo na sobě.
 */
function vlastniMista() {
  const klic = store.vypravaNazev || 'Náš plán'
  return ((store.bloky || {})[klic] || [])
    .filter((b) => b.typ === 'misto')
    .map((b) => {
      const s = souradniceBodu(b)
      return s ? { ...b, lat: s.lat, lon: s.lon } : null
    })
    .filter(Boolean)
}

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
  if (zivaZnacka) {
    zivaZnacka.remove()
    zivaZnacka = null
  }

  // Za jízdy se kreslí otisk ROZJETÉ cesty; při prohlížení ukončené cesty
  // z knihovny (S.otevrenaCesta) otisk TÉ; jinak živý plán – ten se dá
  // upravovat i s rozjetou cestou a trasa na mapě má ukazovat, co se jede.
  const jedeSe = !!store.cesta
  const cestaOtevrena = !jedeSe && S.otevrenaCesta != null ? store.cesty[S.otevrenaCesta] : null
  const otisk = jedeSe ? store.cesta : cestaOtevrena
  const zdrojIds = otisk ? otisk.zastavky : store.plan
  const zastavky = zdrojIds.map((id) => S.byId[id]).filter(Boolean)

  // Body trasy z bloků: bod s `po` hned za svou zastávkou, bod se `den`
  // na začátek dne, historické bez obojího na konec plánu. Cesty (živé
  // i ukončené) jsou otisk – vlastní místa se do nich nepletou.
  const mista = otisk ? [] : vlastniMista()
  const poZastavce = (id) => mista.filter((m) => m.po === id)
  const delky = otisk
    ? otisk.dny && otisk.dny.length
      ? otisk.dny
      : [zastavky.length]
    : (store.planDny || []).length
      ? store.planDny
      : [zastavky.length]
  const body = []
  let od = 0
  delky.forEach((delka, i) => {
    for (const m of mista) if (!m.po && m.den === i + 1) body.push(m)
    for (const z of zastavky.slice(od, od + delka)) {
      body.push(z)
      body.push(...poZastavce(z.id))
    }
    od += delka
  })
  for (const z of zastavky.slice(od)) {
    body.push(z)
    body.push(...poZastavce(z.id))
  }
  for (const m of mista) if (!m.po && m.den == null) body.push(m)

  if (vlastni) {
    vlastni.remove()
    vlastni = null
  }
  if (mista.length) {
    vlastni = L.layerGroup(
      mista.map((m) =>
        L.marker([m.lat, m.lon], {
          interactive: false,
          keyboard: false,
          icon: L.divIcon({
            className: '',
            iconSize: [22, 22],
            iconAnchor: [11, 20],
            // Znak podle druhu bodu. Mapa nesmí importovat views, takže je
            // výčet druhů podruhé tady – start/nocleh/cíl/vlastní.
            html: `<div class="vlastnipin ${esc(m.druh || 'vlastni')}" title="${esc(m.nazev || 'Vlastní místo')}">${
              { start: '▶', nocleh: '⌂', cil: '⚑' }[m.druh] || '★'
            }</div>`,
          }),
        })
      )
    ).addTo(mapa)
  }

  if (body.length < 2) return

  // Skutečná trasa z Mapy.com Routing API (views/plan/routing.js), pokud je
  // pro TENHLE seznam bodů ještě platná – jinak (žádný přepočet, zastaralý,
  // nebo se jede/prohlíží otisk cesty) zůstává fallback: rovná spojnice bodů.
  const prepocet = !otisk && store.aktivniPrepocet
  const platny = prepocet && prepocet.otisk === otiskBodu(body)
  const carovaGeometrie = platny ? prepocet.polyline : body.map((p) => [p.lat, p.lon])

  cara = L.polyline(carovaGeometrie, {
    color: token('--zvyrazneni', '#E1B152'), weight: 4.5, opacity: otisk ? 0.5 : 0.95, lineCap: 'round', lineJoin: 'round',
  }).addTo(mapa)

  // Ujetá část: plnou žlutou mezi odznačenými zastávkami v pořadí odznačení –
  // živé i ukončené cesty mají `odznacene` ve stejném tvaru. Bez GPS je to
  // poctivá aproximace – spojnice míst, kde jsme opravdu byli.
  if (otisk) {
    const poradi = Object.entries(otisk.odznacene || {})
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

  // Dodávka je „kde jsme teď" – u ukončené cesty z knihovny nic takového
  // není, tak se nekreslí, ať nevypadá jako živá poloha.
  if (!cestaOtevrena) {
    dodavka = L.marker(stredTrasy(body), {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: 'dodavka', iconSize: [0, 0], iconAnchor: [0, 0], html: `<img src="${vanObr}" alt="">` }),
    }).addTo(mapa)
  }

  // Živě sledovaná poloha (views/plan/cesta-zivot.js) promítnutá na
  // POSLEDNÍ PLATNÝ přepočet trasy – jen za jízdy (jedeSe), jen když appka
  // sledování skutečně spustila (S.zivaPoloha existuje jen na popředí,
  // na kartě Na cestě) a jen na skutečnou trasu z Routing API, ne vzdušnou
  // spojnici (ta by projekci zkreslila).
  if (jedeSe && S.zivaPoloha && store.aktivniPrepocet && store.aktivniPrepocet.polyline) {
    const proj = projektujNaTrasu(S.zivaPoloha, store.aktivniPrepocet.polyline)
    if (proj) {
      zivaZnacka = L.circleMarker([proj.bod.lat, proj.bod.lon], {
        radius: 8, color: token('--sun', '#A87C24'), weight: 3,
        fillColor: token('--paper', '#FAF5EC'), fillOpacity: 1,
      }).addTo(mapa)
    }
  }
}
