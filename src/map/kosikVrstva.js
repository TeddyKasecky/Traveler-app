/**
 * Košík na mapě: špendlíky wishlistu, kotva a koridor k ní.
 *
 * PROČ TO VZNIKLO: nejezdíme podle pevného itineráře. S dodávkou se
 * rozhodujeme večer a podle počasí, takže seznam zastávek v pořadí je pro nás
 * spíš překážka. Co potřebujeme vidět, je mapa: kde jsou místa, co nás lákají,
 * kde jsme my, kam míříme – a hlavně, co je po cestě a co ne.
 *
 * KORIDOR je pás mezi tebou a kotvou. Místa uvnitř svítí plnou barvou, místa
 * mimo pohasnou. Nemusíš počítat zajížďku, vidíš ji.
 *
 * VRSTVA, NE ŠPENDLÍKY Z `markers.js`: košík se kreslí i pro místa, která
 * zrovna nejsou ve filtru, a nesmí mizet posunem mapy. Proto vlastní
 * `LayerGroup`, který se překresluje jen na vyžádání.
 *
 * KRESLÍ SE JEN NA KARTĚ KOŠÍKU (`prefs`-nezávislé, řídí to volající) –
 * na běžné mapě by wishlist překrýval to, co uživatel zrovna hledá.
 *
 * POZOR, STAV K SRPNU 2026: `drawKosik()`, `priblizNaKosik()` a `maCoKreslit()`
 * momentálně nikdo nevolá. Košík se přestavěl na plát vytažený zdola a jeho
 * vlastní mini-mapa zanikla (290 px mapy v plátu nenechalo místo na seznam).
 * Vrstva se sem vrátí na kartě Na cestě, kde má košík řazený podle skutečné
 * polohy dávat smysl i na mapě. `zahodKosikVrstvu()` se používá dál –
 * uklízí po sobě mini-mapa dashboardu v `views/plan/plan.js`.
 */

import L from 'leaflet'
import { esc } from '../core/html.js'
import { token } from '../core/barvy.js'
import { KORIDOR_KM } from '../views/plan/kosik.js'

/** @type {L.LayerGroup|null} */
let vrstva = null

/** Kolik stupňů zeměpisné šířky je jeden kilometr. Na koridor stačí. */
const KM_NA_STUPEN = 111

/**
 * Body pásu kolem spojnice `a`–`b`, široký `sirka` km na každou stranu.
 *
 * Obyčejný obdélník otočený podle azimutu. Přesnější tvar (skutečná
 * ekvidistanta) by na téhle velikosti nebyl k rozeznání a stál by víc kódu.
 */
function pasKolemSpojnice(a, b, sirka) {
  const dLat = b.lat - a.lat
  const dLon = (b.lon - a.lon) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  const delka = Math.hypot(dLat, dLon) || 1e-9

  // Kolmice na spojnici, znormovaná na šířku pásu ve stupních.
  const kLat = (-dLon / delka) * (sirka / KM_NA_STUPEN)
  const kLon =
    ((dLat / delka) * (sirka / KM_NA_STUPEN)) /
    Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)

  return [
    [a.lat + kLat, a.lon + kLon],
    [b.lat + kLat, b.lon + kLon],
    [b.lat - kLat, b.lon - kLon],
    [a.lat - kLat, a.lon - kLon],
  ]
}

/** Značka místa v košíku. Kotva má vlastní tvar, ostatní kolečko. */
function znacka(polozka) {
  const { p, kotva, vKoridoru, zajizdka } = polozka
  const barva = kotva ? token('--rust') : vKoridoru ? token('--moss') : token('--text3')
  const velikost = kotva ? 34 : 26

  const html = kotva
    ? `<div class="kos-pin kotva" style="--kb:${barva}">★</div>`
    : `<div class="kos-pin${vKoridoru ? ' blizko' : ''}" style="--kb:${barva}"></div>`

  const popis = kotva
    ? `${esc(p.n)}<br><b>Kotva: ${kotva.odeDne}.–${kotva.doDne}. den</b>`
    : zajizdka != null
      ? `${esc(p.n)}<br>zajížďka zhruba ${Math.round(zajizdka)} km`
      : esc(p.n)

  return L.marker([p.lat, p.lon], {
    icon: L.divIcon({
      className: 'kos-pin-obal',
      html,
      iconSize: [velikost, velikost],
      iconAnchor: [velikost / 2, velikost / 2],
    }),
    // Kotva nad ostatními – je to závazek, ne návrh.
    zIndexOffset: kotva ? 1000 : 0,
  }).bindTooltip(popis, { direction: 'top', offset: [0, -velikost / 2] })
}

/**
 * Vykreslí košík na mapu. Voláním s prázdným polem se vrstva jen uklidí.
 *
 * @param {L.Map} mapa
 * @param {Array<{p: object, km: number|null, zajizdka: number|null, vKoridoru: boolean, kotva: object|null}>} polozky
 * @param {{lat:number, lon:number}|null} odkud
 */
export function drawKosik(mapa, polozky, odkud = null) {
  if (vrstva) {
    vrstva.remove()
    vrstva = null
  }
  if (!mapa || !polozky || !polozky.length) return

  const skupina = L.layerGroup()

  // Koridor jako první, ať leží pod špendlíky.
  const kotva = polozky.find((x) => x.kotva)
  if (odkud && kotva) {
    const cil = kotva.p
    L.polygon(pasKolemSpojnice(odkud, cil, KORIDOR_KM), {
      color: token('--moss'),
      weight: 1,
      opacity: 0.5,
      fillColor: token('--moss'),
      fillOpacity: 0.1,
      interactive: false,
    }).addTo(skupina)

    // Přímá spojnice ty → kotva. Ne trasa, jen „tímhle směrem".
    L.polyline(
      [
        [odkud.lat, odkud.lon],
        [cil.lat, cil.lon],
      ],
      { color: token('--moss'), weight: 2, opacity: 0.55, dashArray: '6 7', interactive: false }
    ).addTo(skupina)
  }

  for (const polozka of polozky) {
    if (!Number.isFinite(polozka.p.lat)) continue
    znacka(polozka).addTo(skupina)
  }

  skupina.addTo(mapa)
  vrstva = skupina
}

/** Uklidí vrstvu. Volá se při odchodu z karty Košík. */
export function zahodKosikVrstvu() {
  if (vrstva) {
    vrstva.remove()
    vrstva = null
  }
}

/**
 * Přiblíží mapu tak, aby byl vidět celý košík i tvoje poloha.
 * @param {L.Map} mapa
 * @param {Array<{p: object}>} polozky
 * @param {{lat:number, lon:number}|null} odkud
 */
export function priblizNaKosik(mapa, polozky, odkud = null) {
  const body = polozky.filter((x) => Number.isFinite(x.p.lat)).map((x) => [x.p.lat, x.p.lon])
  if (odkud) body.push([odkud.lat, odkud.lon])
  if (!body.length) return
  // BEZ ANIMACE, A JE TO NUTNÉ: animované přiblížení doběhne i po `mapa.remove()`
  // a `_onZoomTransitionEnd` pak sáhne na zrušené panely – TypeError
  // `_leaflet_pos` v konzoli. Karta Košík se překresluje při každé změně
  // a odejít se z ní dá kdykoli, takže se to trefí snadno. Srovnání výřezu
  // je navíc jednorázové, animaci na něm nikdo nepotřebuje.
  mapa.fitBounds(L.latLngBounds(body), { padding: [40, 40], maxZoom: 10, animate: false })
}

/** Je něco z košíku vůbec umístitelné na mapu? */
export const maCoKreslit = (polozky) => polozky.some((x) => Number.isFinite(x.p.lat))
