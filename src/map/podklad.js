/**
 * Malovaná mapa – podklad podle grafických předloh.
 *
 * Předloha `grafika/…11_09_49 (1).png` má ručně malovanou krajinu: papír,
 * bledě modré moře, khaki souš, bílé tečkované hranice a názvy zemí patkovým
 * písmem. Tenhle modul ji staví z pěti vrstev:
 *
 *   1. papír        – zrno v pozadí mapy, `podklad.css` (statické, neposouvá se)
 *   2. plochy       – země, jezera a řeky z `data/basemap.json` na plátně
 *   3. reliéf       – stínování skutečného terénu, `assets/relief-evropa.webp`
 *   4. názvy zemí   – `data/staty.js`, Playfair
 *   5. názvy měst   – `data/mesta.json`, každé od svého přiblížení
 *
 * ROLE: výchozí je běžná mapa z OpenStreetMap, tohle je **offline varianta**.
 * Dlaždice se offline neukládají a hromadně stahovat se nesmějí (podmínky OSM),
 * takže bez signálu byla mapa šedá. Přepíná se pilulkou vlevo nahoře
 * (`prefs.podklad`, viz `map/map.js`).
 *
 * Plochy zemí ale leží **pod dlaždicemi a jsou tam i online**: když dlaždice
 * nedorazí, není v mapě díra a nemusí se nic přepínat. Přesně kvůli tomu, že
 * prohlížeč offline část dlaždic vydá z cache a část ne, takže by automatické
 * přepínání pod rukama blikalo. Papír, reliéf a názvy se naopak ukazují jen
 * v offline režimu – přes dlaždice by se s jejich vlastní kresbou tloukly.
 *
 * KRESBY STROMŮ A HOR TU UŽ NEJSOU. Bylo jich sto deset jako Leafletové
 * značky, každá až sto dvacet pixelů vysoká a s CSS filtrem, takže je
 * prohlížeč překresloval při každém posunu mapy – a s krajinou pod sebou
 * neměly nic společného, protože se sypaly na pravidelnou síť. Dnes je kreslí
 * MapLibre na GPU ze skutečných lesů a skutečného výškopisu, viz `vektory.js`.
 * Bez stažené mapy tu proto kresby nejsou vůbec: zůstávají obrysy, reliéf
 * a názvy, tedy přesně to, co Nastavení slibuje jako „zjednodušenou mapu".
 *
 * Data ploch jsou z Natural Earth (public domain), připravuje je
 * `scripts/make-basemap.mjs`. Souřadnice jsou všude [lat, lon].
 */

import L from 'leaflet'
import { esc } from '../core/html.js'
import { prefs } from '../core/store.js'
import { STATY } from '../data/staty.js'
import { nactiMapu } from '../core/mapaDb.js'

/* Vlastní pane. Leaflet dává `tilePane` 200, `overlayPane` 400, `markerPane` 600. */
const PANE_PLOCHY = 'podklad'
const PANE_RELIEF = 'relief'
const PANE_POPISKY = 'popisky'
const Z_PLOCHY = 150
const Z_RELIEF = 250
const Z_POPISKY = 350

/** Do kolika přiblížení mají smysl názvy zemí. Výš je zem beztak jen jedna. */
const ZOOM_STATY = 7

/**
 * Od kterého přiblížení se ukazují všechna města ve výřezu.
 *
 * Každé město má z dat vlastní `min_zoom` od kartografů Protomaps a do sedmičky
 * se drží. Výš by ale mapa osiřela: balík sahá do zoomu 6, takže žádné město
 * nemá `min_zoom` vyšší než sedm, a v přiblíženém výřezu by pak nebyl jediný
 * popisek. Nad sedmičkou se proto ukáže všechno, co je vidět – a protože je
 * výřez malý, není toho moc.
 */
const ZOOM_VSECHNA_MESTA = 7

/** Jak dlouho po návratu dlaždic ještě svítí štítek „offline". */
const STITEK_DOBEH = 2500

/** @type {L.Map|null} */
let mapaRef = null
/** @type {Promise<void>|null} zajišťuje, že se podklad staví jen jednou */
let priprava = null

/** @type {L.LayerGroup|null} */
let plochy = null
/** @type {L.ImageOverlay|null} */
let relief = null
/** @type {L.LayerGroup|null} */
let statyVrstva = null
/** @type {L.LayerGroup|null} */
let mestaVrstva = null
/**
 * Vrstva MapLibre s vektorovými dlaždicemi, nebo null.
 *
 * Null znamená, že mapa není stažená, že si ji uživatel v Nastavení vypnul
 * nebo že prohlížeč neumí WebGL – pak zůstane plátno z `basemap.json`,
 * které funguje vždycky.
 */
let vektory = null

/** Všechna města. `[lat, lon, jméno, od jakého přiblížení, pořadí]` */
let mesta = []
/** @type {Map<number, L.Marker>} pořadí města → značka, která je na mapě */
const mestaNaMape = new Map()

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
 * Stínování terénu jako jediný obrázek přes celou Evropu.
 *
 * PROČ OBRÁZEK A NE VRSTVA V MAPLIBRE: takhle ho má **i zjednodušená mapa**,
 * tedy i ten, kdo si nic nestáhl, i prohlížeč bez WebGL. Jedna cesta místo
 * dvou, a stojí to jeden `L.ImageOverlay`, který prohlížeč složí jako
 * kteroukoli jinou vrstvu.
 *
 * Do jednosouborové varianty se schválně nebalí: `assetsInlineLimit` je tam
 * bez omezení, takže by se megabajt reliéfu vložil do HTML jako base64
 * a soubor by narostl o polovinu. Konstanta je nahrazená při buildu, takže
 * se z něj celá větev i s importem vyhodí.
 */
async function postavRelief() {
  if (import.meta.env.SINGLE_FILE) return null
  try {
    const [obrazek, meta] = await Promise.all([
      import('../assets/relief-evropa.webp?url'),
      import('../data/relief.json'),
    ])
    return L.imageOverlay(obrazek.default, meta.default.meze, {
      pane: PANE_RELIEF,
      interactive: false,
      className: 'relief',
    })
  } catch (e) {
    console.warn('Reliéf se nenačetl:', e)
    return null
  }
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
 * Doplní názvy měst, které patří do výřezu a do přiblížení, a odebere ostatní.
 *
 * Měst je devět set osmdesát pět, takže se nestaví všechna: každé má v datech
 * svoje `min_zoom` od kartografů Protomaps a mimo výřez se neskládá vůbec.
 * Stejný postup jako u špendlíků v `map.js` a ze stejného důvodu – vkládat
 * do stránky, co není vidět, se pozná na každém posunu.
 */
function srovnejMesta() {
  if (!mestaVrstva || !mapaRef) return
  const z = mapaRef.getZoom()
  const meze = mapaRef.getBounds().pad(0.25)
  const majiByt = new Set()

  for (let i = 0; i < mesta.length; i++) {
    const [lat, lon, nazev, odZoomu] = mesta[i]
    if (z < Math.min(odZoomu, ZOOM_VSECHNA_MESTA) || !meze.contains([lat, lon])) continue
    majiByt.add(i)
    if (mestaNaMape.has(i)) continue
    const m = L.marker([lat, lon], {
      pane: PANE_POPISKY,
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: 'mesto-popisek', html: esc(nazev), iconSize: null }),
    }).addTo(mestaVrstva)
    mestaNaMape.set(i, m)
  }

  for (const [i, m] of mestaNaMape) {
    if (majiByt.has(i)) continue
    mestaVrstva.removeLayer(m)
    mestaNaMape.delete(i)
  }
}

/** Srovná, co se při aktuálním přiblížení ukazuje. */
function srovnejPodleZoomu() {
  if (!mapaRef) return
  const z = mapaRef.getZoom()
  const el = mapaRef.getContainer()
  const dlazdice = el.classList.contains('dlazdice')

  // Vektorová mapa jen v malovaném režimu. Pod dlaždicemi zůstává staré
  // plátno – to je levné a je tam kvůli tomu, aby při chybějící dlaždici
  // nevznikla v mapě díra.
  const vektoryMaji = !dlazdice && !!vektory
  prepni(vektory, vektoryMaji)
  // Když kreslí vektory, plátno se schová: leželo by pod neprůhledným
  // podkladem a jen by se zbytečně překreslovalo při každém posunu.
  prepni(plochy, !vektoryMaji)
  prepni(relief, !dlazdice)
  prepni(statyVrstva, !dlazdice && z <= ZOOM_STATY)

  const mestaMaji = !dlazdice && mesta.length > 0
  prepni(mestaVrstva, mestaMaji)
  if (mestaMaji) srovnejMesta()
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

/** Kreslí se právě vektorová mapa? Čte to Nastavení i kontroly. */
export const jsouVektory = () => !!vektory

/**
 * Přepočítá kresby krajiny po změně hustoty v Nastavení.
 *
 * Jde přes tenhle modul, aby Nastavení nemuselo vědět o `vektory.js` — ten se
 * natahuje dynamicky a bez stažené mapy vůbec neexistuje.
 */
export function obnovKresbyVMape() {
  if (!vektory) return
  import('./vektory.js').then(({ obnovKresby }) => obnovKresby())
}

/**
 * Zkusí postavit vektorovou mapu ze staženého balíku.
 *
 * Tiše se vzdá, když mapa není stažená, když si ji uživatel v Nastavení vypnul
 * nebo když prohlížeč neumí WebGL – ve všech případech zůstane plátno
 * z `basemap.json`, které funguje vždycky. Moduly MapLibre se natahují až tady
 * dynamickým importem, aby si je nestahoval každý, kdo mapu staženou nemá.
 *
 * @param {L.Map} mapa
 */
async function zkusVektory(mapa) {
  // V jednosouborové variantě se ani nezkouší. Balík dlaždic má několik
  // megabajtů a do jednoho souboru se zabalit nedá, takže by se MapLibre
  // (další megabajt) natáhl úplně zbytečně. Konstanta je nahrazená při
  // buildu, takže se z něj celá větev i s importem vyhodí.
  if (import.meta.env.SINGLE_FILE) return
  // Volba z Nastavení. Kdo chce mapu co nejrychlejší, nechá zjednodušenou.
  if (prefs.offlineMapa === 'zjednodusena') return
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
 * Postaví nebo zboří vektorovou mapu, když se stáhla, smazala nebo přepnula.
 * Volá to Nastavení, aby se nemuselo restartovat.
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
      [PANE_RELIEF, Z_RELIEF],
      [PANE_POPISKY, Z_POPISKY],
    ]) {
      if (mapa.getPane(jmeno)) continue
      const p = mapa.createPane(jmeno)
      p.style.zIndex = String(z)
      // Ať vrstvy nepřebírají kliknutí určená špendlíkům a mapě.
      p.style.pointerEvents = 'none'
    }

    const [zaklad, mestaData] = await Promise.all([import('../data/basemap.json'), import('../data/mesta.json')])
    const data = zaklad.default
    mesta = mestaData.default.mesta

    plochy = postavPlochy(mapa, data).addTo(mapa)
    relief = await postavRelief()
    await zkusVektory(mapa)
    statyVrstva = postavStaty()
    mestaVrstva = L.layerGroup()

    mapa.on('zoomend', srovnejPodleZoomu)
    mapa.on('moveend', srovnejMesta)
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
 * Malovaná mapa je hezká, ale při větším přiblížení má míň podrobností.
 * Kdo potřebuje vidět, kudy se tam jede, přepne. Volba se pamatuje.
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
 * Přepne štítek „Offline · malovaná mapa".
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
