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
import { projektujNaTrasu } from '../core/projekce.js'
import { geometrie, otiskBodu, zajistiTrasu } from '../core/trasy.js'
import { CESTY } from '../core/cesty.js'
// Data plánu bydlí od září 2026 v `core/plan/`, takže si je mapa smí prostě
// naimportovat. Do té doby si tenhle soubor opisoval `otiskBodu`,
// `souradniceBodu`, filtr bloků, skládání pořadí trasy i výčet druhů – a ta
// kopie otisku se rozešla, takže se přepočtená trasa na hlavní mapě nikdy
// nenakreslila.
import { DRUHY, serazenePolozky, souradniceBodu, vsechnyBody } from '../core/plan/body.js'
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

  // Za jízdy kreslí otisk ROZJETÉ cesty jen mód mapy „Na cestě“ (S.mapaMod,
  // components/chip.js) – mód „Itinerář“ (výchozí) kreslí živý plán i za
  // jízdy, ať jde upravovat trasu a rovnou to vidět na mapě. Při prohlížení
  // ukončené cesty z knihovny (S.otevrenaCesta) se kreslí otisk TÉ, nezávisle
  // na S.mapaMod – to je jiný stav (appka nejede).
  const jedeSe = !!store.cesta
  const kresliOtiskCesty = jedeSe && S.mapaMod === 'nacesta'
  const cestaOtevrena = !jedeSe && S.otevrenaCesta != null ? CESTY[S.otevrenaCesta] : null
  const otisk = kresliOtiskCesty ? store.cesta : cestaOtevrena
  const zdrojIds = otisk ? otisk.zastavky : store.plan
  const zastavky = zdrojIds.map((id) => S.byId[id]).filter(Boolean)

  // Body trasy z bloků: bod s `po` hned za svou zastávkou, bod se `den`
  // na začátek dne, historické bez obojího na konec plánu.
  //
  // KRESLÍ SE I U OTISKU CESTY (srpen 2026). Do teď tu stálo `otisk ? []`,
  // takže trasa rozjeté cesty vedla jen mezi zastávkami z databáze –
  // nocleh, start ani cíl na ní nebyly, přitom právě přes ně se jede.
  // Bloky cesty se čtou pod JEJÍM názvem: po přepnutí výpravy za jízdy by
  // se jinak na trasu připletly body cizí výpravy.
  const nazevVypravy = otisk ? otisk.nazev : null
  const delky = otisk ? otisk.dny || [] : store.planDny || []
  // Pořadí trasy se počítá NA JEDNOM MÍSTĚ. Do září 2026 tu stálo totéž
  // opsané řádek po řádku – shodně, ale bez záruky, že to tak zůstane.
  const polozky = serazenePolozky(zdrojIds, delky, vsechnyBody(nazevVypravy))
  const mista = polozky.filter((x) => x.typ === 'bod').map((x) => x.b)
  const body = polozky
    .map((x) => {
      if (x.typ === 'zastavka') return x.p
      const s = souradniceBodu(x.b)
      return s ? { ...x.b, lat: s.lat, lon: s.lon } : null
    })
    .filter(Boolean)

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
            // Znak i popisek z registru `DRUHY` – výčet druhů je jeden.
            html: `<div class="vlastnipin ${esc(m.druh || 'vlastni')}" title="${esc(
              m.nazev || DRUHY.vlastni.popisek
            )}">${(DRUHY[m.druh] || DRUHY.vlastni).znak}</div>`,
          }),
        })
      )
    ).addTo(mapa)
  }

  if (body.length < 2) return

  // Skutečná trasa z Mapy.com Routing API (views/plan/routing.js), pokud je
  // pro TENHLE seznam bodů ještě platná – jinak fallback: rovná spojnice
  // bodů. Zdroj přepočtu se liší podle toho, co se kreslí: otisk (rozjetá
  // nebo prohlížená cesta) má svůj vlastní `otisk.prepocet`
  // (#prepocitejOtiskCesty), živý plán `store.aktivniPrepocet` jako dřív –
  // jsou to nezávislé sloty, appka za jízdy plán dál upravuje.
  const prepocet = otisk ? otisk.prepocet : store.aktivniPrepocet
  const platny = prepocet && prepocet.otisk === otiskBodu(body)
  // Geometrie od srpna 2026 nebydlí ve `store`, ale v IndexedDB (core/trasy.js).
  // Když ještě není v paměti, kreslí se vzdušná spojnice jako vždycky, když
  // přepočet chybí, a `zajistiTrasu()` ji dotáhne – po ní přijde `trasaNactena`
  // a mapa se překreslí. Kreslení tím zůstává synchronní.
  if (platny) zajistiTrasu(prepocet.otisk)
  const skutecna = platny ? geometrie(prepocet.otisk) : null
  const carovaGeometrie = skutecna || body.map((p) => [p.lat, p.lon])

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
  const zivaTrasa = jedeSe && S.zivaPoloha && store.aktivniPrepocet && geometrie(store.aktivniPrepocet.otisk)
  if (zivaTrasa) {
    const proj = projektujNaTrasu(S.zivaPoloha, zivaTrasa)
    if (proj) {
      zivaZnacka = L.circleMarker([proj.bod.lat, proj.bod.lon], {
        radius: 8, color: token('--sun', '#A87C24'), weight: 3,
        fillColor: token('--paper', '#FAF5EC'), fillOpacity: 1,
      }).addTo(mapa)
    }
  }
}
