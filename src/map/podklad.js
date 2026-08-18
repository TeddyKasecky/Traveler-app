/**
 * Malovaná mapa – podklad podle grafických předloh.
 *
 * Předloha `grafika/…11_09_49 (1).png` má ručně malovanou krajinu: papír,
 * bledě modré moře, khaki souš, bílé tečkované hranice, malované lesy a hory
 * a názvy zemí patkovým písmem. Tenhle modul ji staví z pěti vrstev:
 *
 *   1. papír        – zrno v pozadí mapy, `podklad.css` (statické, neposouvá se)
 *   2. plochy       – země, jezera a řeky z `data/basemap.json` na plátně
 *   3. kresby       – stromy a hory z `data/kresba.json`, obrázky z `grafika/`
 *   4. názvy zemí   – `data/staty.js`, Playfair
 *   5. názvy měst   – z `basemap.json`, až od většího přiblížení
 *
 * ROLE: výchozí je běžná mapa z OpenStreetMap, tohle je **offline varianta**.
 * Dlaždice se offline neukládají a hromadně stahovat se nesmějí (podmínky OSM),
 * takže bez signálu byla mapa šedá. Přepíná se pilulkou vlevo nahoře
 * (`prefs.podklad`, viz `map/map.js`).
 *
 * Plochy zemí ale leží **pod dlaždicemi a jsou tam i online**: když dlaždice
 * nedorazí, není v mapě díra a nemusí se nic přepínat. Přesně kvůli tomu, že
 * prohlížeč offline část dlaždic vydá z cache a část ne, takže by automatické
 * přepínání pod rukama blikalo. Papír, kresby a názvy zemí se naopak ukazují
 * jen v offline režimu – přes dlaždice by se s jejich vlastní kresbou tloukly.
 *
 * Data ploch jsou z Natural Earth (public domain), připravuje je
 * `scripts/make-basemap.mjs`. Kresby a kotvy dělá `scripts/make-kresba.mjs`.
 * Souřadnice jsou všude [lat, lon].
 */

import L from 'leaflet'
import { esc } from '../core/html.js'
import { STATY } from '../data/staty.js'
import { nactiMapu } from '../core/mapaDb.js'

/* Kresby se importují jmenovitě, ne `import.meta.glob`: obě varianty buildu
 * (hostovaná i jednosouborová) si je pak přeloží stejně jako ostatní obrázky
 * a nezáleží na pořadí, ve kterém by je glob vrátil. */
import strom1 from '../assets/kresba/strom-1.webp'
import strom2 from '../assets/kresba/strom-2.webp'
import strom3 from '../assets/kresba/strom-3.webp'
import strom4 from '../assets/kresba/strom-4.webp'
import strom5 from '../assets/kresba/strom-5.webp'
import strom6 from '../assets/kresba/strom-6.webp'
import strom7 from '../assets/kresba/strom-7.webp'
import strom8 from '../assets/kresba/strom-8.webp'
import hora1 from '../assets/kresba/hora-1.webp'
import hora2 from '../assets/kresba/hora-2.webp'

const STROMY = [strom1, strom2, strom3, strom4, strom5, strom6, strom7, strom8]
const HORY = [hora1, hora2]

/* Vlastní pane. Leaflet dává `tilePane` 200, `overlayPane` 400, `markerPane` 600. */
const PANE_PLOCHY = 'podklad'
const PANE_KRESBY = 'kresby'
const PANE_POPISKY = 'popisky'
const Z_PLOCHY = 150
const Z_KRESBY = 250
const Z_POPISKY = 350

/** Od kolika přiblížení se vypisují názvy měst. Níž by se slily do kaše. */
const ZOOM_MESTA = 6
/** Do kolika přiblížení mají smysl názvy zemí. Výš je zem beztak jen jedna. */
const ZOOM_STATY = 7
/** Meze, ve kterých se kreslí stromy a hory. Blíž dojdou a zbyde plocha. */
const KRESBY_OD = 4
const KRESBY_DO = 8

/**
 * Výška stromu v bodech podle přiblížení.
 *
 * Nesahá se přitom na značky: velikost jde do proměnné `--kv` na kontejneru
 * mapy a obrázky si ji vezmou z CSS. Přestavět 180 značek při každém zoomu
 * by bylo znát, přepsat jednu proměnnou není.
 */
const VELIKOST = { 4: 26, 5: 38, 6: 54, 7: 76, 8: 104 }

/** Jak dlouho po návratu dlaždic ještě svítí štítek „offline". */
const STITEK_DOBEH = 2500

/** @type {L.Map|null} */
let mapaRef = null
/** @type {Promise<void>|null} zajišťuje, že se podklad staví jen jednou */
let priprava = null

/** @type {L.LayerGroup|null} */
let plochy = null
/** @type {L.LayerGroup|null} */
let mestaVrstva = null
/** @type {(() => L.LayerGroup)|null} odložená stavba názvů měst */
let mestaLine = null
/** @type {L.LayerGroup|null} */
let statyVrstva = null
/** @type {L.LayerGroup|null} */
let kresbyVrstva = null
/**
 * Vrstva MapLibre s vektorovými dlaždicemi, nebo null.
 *
 * Null znamená, že mapa není stažená nebo prohlížeč neumí WebGL – pak kreslí
 * staré plátno z `basemap.json`. Obojí schválně: plátno je jediné, co funguje
 * i v jednosouborové variantě, kam se deset megabajtů dlaždic nedá zabalit.
 */
let vektory = null

/** Všechny kotvy kreseb. Do mapy jde jen to, co je ve výřezu. */
let kotvy = []
/** @type {Map<number, L.Marker>} pořadí kotvy → značka, která je na mapě */
const kresbyNaMape = new Map()

/** Barvy se čtou z CSS, ať zůstávají na jednom místě jako všechny ostatní. */
function barvy(el) {
  const s = getComputedStyle(el)
  const b = (n, zaloha) => s.getPropertyValue(n).trim() || zaloha
  return {
    sous: b('--mapa-sous', '#E7E0C3'),
    hranice: b('--mapa-hranice', 'rgba(255,252,246,.78)'),
    voda: b('--mapa-voda', '#9DC2CD'),
  }
}

/**
 * Plochy zemí, jezer a řek na jednom plátně.
 *
 * Hranice jsou bílé a tečkované, jak je má předloha – ne tmavá linka. Souš má
 * `fillOpacity` pod jedničkou schválně: pod ní prosvítá zrno papíru z CSS
 * a teprve tím plocha vypadá malovaně, ne jako vyplněný polygon.
 */
function postavPlochy(mapa, data) {
  const c = barvy(mapa.getContainer())
  const kreslic = L.canvas({ pane: PANE_PLOCHY, padding: 0.3 })
  const spolecne = { renderer: kreslic, pane: PANE_PLOCHY, interactive: false }
  const kusy = []

  for (const obrys of data.zeme) {
    kusy.push(
      L.polygon(obrys, {
        ...spolecne,
        color: c.hranice,
        weight: 1.6,
        dashArray: '1 4',
        lineCap: 'round',
        fillColor: c.sous,
        fillOpacity: 0.82,
      })
    )
  }
  for (const obrys of data.jezera) {
    kusy.push(L.polygon(obrys, { ...spolecne, color: c.voda, weight: 0.6, fillColor: c.voda, fillOpacity: 0.65 }))
  }
  for (const cara of data.reky) {
    kusy.push(L.polyline(cara, { ...spolecne, color: c.voda, weight: 0.8, opacity: 0.75 }))
  }
  return L.layerGroup(kusy)
}

/**
 * Názvy měst. Jsou to prvky stránky, ne kresba – proto zvlášť.
 *
 * Staví se až při prvním přiblížení, kdy jsou potřeba: měst je 192 a při
 * pohledu na celou Evropu se stejně nekreslí ani jedno.
 */
function postavMesta(data) {
  return L.layerGroup(
    data.mesta.map(([lat, lon, nazev]) =>
      L.marker([lat, lon], {
        pane: PANE_POPISKY,
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: 'mesto-popisek', html: esc(nazev), iconSize: null }),
      })
    )
  )
}

/** Názvy zemí v Playfair, jak je má předloha. */
function postavStaty() {
  return L.layerGroup(
    STATY.map(([lat, lon, nazev]) =>
      L.marker([lat, lon], {
        pane: PANE_POPISKY,
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: 'stat-popisek', html: esc(nazev), iconSize: null }),
      })
    )
  )
}

/**
 * Doplní kresby, které se dostaly do výřezu, a odebere ty, co z něj vypadly.
 *
 * Stejný postup jako u špendlíků v `map.js` a ze stejného důvodu: 180 obrázků
 * naráz znamená, že je prohlížeč při každém posunu mapy všechny přepočítá.
 */
function srovnejKresby() {
  if (!kresbyVrstva || !mapaRef) return
  const meze = mapaRef.getBounds().pad(0.35)
  const majiByt = new Set()

  for (let i = 0; i < kotvy.length; i++) {
    const [lat, lon, kus, v] = kotvy[i]
    if (!meze.contains([lat, lon])) continue
    majiByt.add(i)
    if (kresbyNaMape.has(i)) continue

    const hora = kus[0] === 'h'
    const soubor = hora ? HORY[+kus.slice(1) - 1] : STROMY[+kus.slice(1) - 1]
    const m = L.marker([lat, lon], {
      pane: PANE_KRESBY,
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: `kresba${hora ? ' hora' : ''}`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
        html: `<img src="${soubor}" alt="" decoding="async" style="--ks:${v}">`,
      }),
    }).addTo(kresbyVrstva)
    kresbyNaMape.set(i, m)
  }

  for (const [i, m] of kresbyNaMape) {
    if (majiByt.has(i)) continue
    kresbyVrstva.removeLayer(m)
    kresbyNaMape.delete(i)
  }
}

/** Srovná, co se při aktuálním přiblížení ukazuje. */
function srovnejPodleZoomu() {
  if (!mapaRef) return
  const z = mapaRef.getZoom()
  const el = mapaRef.getContainer()
  const dlazdice = el.classList.contains('dlazdice')

  el.style.setProperty('--kv', `${VELIKOST[Math.min(Math.max(z, KRESBY_OD), KRESBY_DO)]}px`)

  // Vektorová mapa jen v malovaném režimu. Pod dlaždicemi zůstává staré
  // plátno – to je levné a je tam kvůli tomu, aby při chybějící dlaždici
  // nevznikla v mapě díra.
  const vektoryMaji = !dlazdice && !!vektory
  prepni(vektory, vektoryMaji)
  // Když kreslí vektory, plátno se schová: leželo by pod neprůhledným
  // podkladem a jen by se zbytečně překreslovalo při každém posunu.
  prepni(plochy, !vektoryMaji)

  prepni(statyVrstva, !dlazdice && z <= ZOOM_STATY)

  const mestaMaji = !dlazdice && z >= ZOOM_MESTA
  if (mestaMaji && !mestaVrstva && mestaLine) mestaVrstva = mestaLine()
  prepni(mestaVrstva, mestaMaji)
  const kresbyMaji = !dlazdice && z >= KRESBY_OD && z <= KRESBY_DO
  prepni(kresbyVrstva, kresbyMaji)
  if (kresbyMaji) srovnejKresby()
}

/** Přidá nebo odebere vrstvu. Opakované volání nic nedělá. */
function prepni(vrstva, maByt) {
  if (!vrstva || !mapaRef) return
  const je = mapaRef.hasLayer(vrstva)
  if (maByt && !je) vrstva.addTo(mapaRef)
  else if (!maByt && je) mapaRef.removeLayer(vrstva)
}

/** Je podklad už postavený? */
export const jeZapnuta = () => !!plochy

/** Kreslí se právě vektorová mapa? Čte to Profil i kontroly. */
export const jsouVektory = () => !!vektory

/**
 * Zkusí postavit vektorovou mapu ze staženého balíku.
 *
 * Tiše se vzdá, když mapa není stažená nebo prohlížeč neumí WebGL – v obou
 * případech zůstane plátno z `basemap.json`, které funguje vždycky. Moduly
 * MapLibre se natahují až tady dynamickým importem, aby si je nestahoval
 * každý, kdo mapu staženou nemá.
 *
 * @param {L.Map} mapa
 */
async function zkusVektory(mapa) {
  // V jednosouborové variantě se ani nezkouší. Balík dlaždic má skoro 10 MB
  // a do jednoho souboru se zabalit nedá, takže by se MapLibre (další megabajt)
  // natáhl úplně zbytečně. Konstanta je nahrazená při buildu, takže se z něj
  // celá větev i s importem vyhodí.
  if (import.meta.env.SINGLE_FILE) return
  try {
    const blob = await nactiMapu()
    if (!blob) return
    const { otevriBalik } = await import('./vbm.js')
    await otevriBalik(blob)
    const { postavVektory } = await import('./vektory.js')
    vektory = postavVektory(mapa, PANE_PLOCHY)
  } catch (e) {
    console.warn('Vektorová mapa nenaběhla, kreslí se záložní podklad:', e)
    vektory = null
  }
}

/**
 * Postaví nebo zboří vektorovou mapu, když se stáhla nebo smazala.
 * Volá to Profil, aby se nemuselo restartovat.
 *
 * @param {L.Map} mapa
 */
export async function obnovVektory(mapa) {
  if (vektory) {
    if (mapaRef && mapaRef.hasLayer(vektory)) mapaRef.removeLayer(vektory)
    const { zahodVektory } = await import('./vektory.js')
    zahodVektory()
    vektory = null
  }
  const { zavriBalik } = await import('./vbm.js')
  zavriBalik()
  await zkusVektory(mapa || mapaRef)
  srovnejPodleZoomu()
}

/**
 * Postaví malovaný podklad. Opakované volání nic nedělá.
 *
 * Data se natahují dynamickým importem, takže první obraz aplikace na ně
 * nečeká. Než dorazí, je vidět papír a barva moře z CSS – ne šeď.
 *
 * @param {L.Map} mapa
 * @returns {Promise<void>}
 */
export function zajistiPodklad(mapa) {
  if (priprava) return priprava

  priprava = (async () => {
    mapaRef = mapa

    for (const [jmeno, z] of [
      [PANE_PLOCHY, Z_PLOCHY],
      [PANE_KRESBY, Z_KRESBY],
      [PANE_POPISKY, Z_POPISKY],
    ]) {
      if (mapa.getPane(jmeno)) continue
      const p = mapa.createPane(jmeno)
      p.style.zIndex = String(z)
      // Ať vrstvy nepřebírají kliknutí určená špendlíkům a mapě.
      p.style.pointerEvents = 'none'
    }

    const [zaklad, kresba] = await Promise.all([import('../data/basemap.json'), import('../data/kresba.json')])
    const data = zaklad.default
    kotvy = kresba.default.kotvy

    plochy = postavPlochy(mapa, data).addTo(mapa)
    await zkusVektory(mapa)
    statyVrstva = postavStaty()
    kresbyVrstva = L.layerGroup()
    // Města se postaví, až se poprvé přiblíží. Sto devadesát dva značek naráz
    // je při startu zbytečná práce – při pohledu na Evropu se nekreslí ani jedna.
    mestaLine = () => postavMesta(data)

    mapa.on('zoomend', srovnejPodleZoomu)
    mapa.on('moveend', srovnejKresby)
    srovnejPodleZoomu()
  })()

  // Kdyby se podklad nepodařilo načíst, ať to jde zkusit znovu.
  priprava.catch(() => {
    priprava = null
  })

  return priprava
}

/**
 * Přepne mezi malovaným podkladem a dlaždicemi z OpenStreetMap.
 *
 * Malovaná mapa je hezká, ale nemá silnice a při větším přiblížení kresby
 * dojdou. Kdo potřebuje vidět, kudy se tam jede, přepne. Volba se pamatuje.
 *
 * @param {boolean} dlazdiceZapnute
 */
export function nastavRezim(dlazdiceZapnute) {
  // Volá se i dřív, než se podklad dotáhne – třída musí sednout hned, aby
  // `srovnejPodleZoomu()` po dotažení dat věděl, co má ukázat.
  const el = mapaRef ? mapaRef.getContainer() : document.getElementById('map')
  if (el) el.classList.toggle('dlazdice', dlazdiceZapnute)
  srovnejPodleZoomu()
}

/**
 * Přebarví podklad podle aktuálního vzhledu.
 *
 * Barvy se čtou z CSS, ale Leaflet si je při stavbě zapekl do plátna, takže
 * se změnou proměnné nepřepočítají. Bez tohohle by pod tmavou aplikací
 * zůstala svítit béžová pevnina – a všimla by si toho ta nejhorší možná
 * chvíle, tedy v noci bez signálu.
 */
export function prebarviPodklad() {
  if (!plochy || !mapaRef) return

  // Vektorová mapa si barvy taky zapekla do stylu a musí se přestavět.
  if (vektory) {
    import('./vektory.js').then(({ prebarviVektory }) => prebarviVektory(mapaRef.getContainer()))
  }

  const c = barvy(mapaRef.getContainer())
  for (const kus of plochy.getLayers()) {
    const o = kus.options
    // Voda se pozná podle toho, že měla obrys i výplň ve stejné barvě.
    const jeVoda = o.fillOpacity === 0.65 || o.opacity === 0.75
    if (jeVoda) kus.setStyle({ color: c.voda, fillColor: c.voda })
    else kus.setStyle({ color: c.hranice, fillColor: c.sous })
  }
}

/* ================= štítek ================= */

let dobeh = null

/**
 * Přepne štítek „Offline · zjednodušená mapa".
 *
 * Hlásí se jen v režimu dlaždic: v malovaném podkladu žádné dlaždice nechodí,
 * takže by štítek svítil pořád a nic by neříkal.
 *
 * Selhaná dlaždice ho rozsvítí okamžitě, úspěšná zhasne až po `STITEK_DOBEH`.
 * To zpoždění tu je proto, že prohlížeč offline servíruje nedávno prohlédnuté
 * dlaždice ze své cache – část jich tedy dorazí a část ne, obojí během jedné
 * vteřiny. Bez zpoždění by štítek blikal.
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
      el.textContent = 'Offline · malovaná mapa'
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
