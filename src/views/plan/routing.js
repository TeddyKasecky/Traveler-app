/**
 * Přepočet trasy přes Mapy.com Routing API – otisk bodů a pomocné dotazy.
 *
 * proč: appka dnes počítá vzdálenost/čas jen jako vzdušnou čáru × KLIKATOST.
 * Skutečná trasa z Routing API se volá JEN na výslovnou akci (tlačítko
 * Přepočítat), nikdy automaticky – appka nemá backend a klíč je proto
 * veřejná konstanta přímo v kódu. `otiskBodu()` a `pocetOdkazuNaPozici()`
 * jsou beze vzhledu, sdílené mezi Profilem (varování při mazání pozice)
 * a Plánem (invalidace uloženého přepočtu).
 */

import { store, save, prefs } from '../../core/store.js'
import { zjistiPolohuJednorazove } from '../../core/geo.js'
import { ulozTrasu } from '../../core/trasyDb.js'
import { zahodNeplatny, zapamatujTrasu } from '../../core/trasy.js'
import { serazenaTrasa, vsechnyBody } from './body.js'

/**
 * Otisk aktuálního pořadí a polohy bodů trasy – levný „hash“ k poznání, že
 * se od posledního přepočtu něco změnilo (pořadí, přidání/odebrání bodu,
 * posun start/cíl). Netřeba kryptografický hash, stačí deterministický
 * řetězec porovnatelný na === – seznam bodů má jednotky až desítky prvků.
 * @param {Array<{lat:number, lon:number, id?:string}>} body
 * @returns {string}
 */
export function otiskBodu(body) {
  const popis = body.map((b) => `${b.id || ''}:${b.lat.toFixed(5)},${b.lon.toFixed(5)}`).join('|')
  // Do srpna 2026 se ukládal ten popis celý – ~48 znaků na bod, tedy ~1,4 kB
  // na trasu, a sedí ve `store` na čtyřech místech (aktivní přepočet, cesta,
  // každá výprava, každá archivovaná cesta). Přitom se nikdy nezobrazuje,
  // jen porovnává na `===`. Osm znaků hashe dělá totéž za setinu místa.
  return hash(popis)
}

/**
 * FNV-1a, osm hexa znaků. Není to kryptografie a nemá být – jde jen o to,
 * poznat na `===`, že se seznam bodů změnil. Kolize by znamenala, že se
 * nakreslí trasa pro jinou sadu bodů; při jednotkách tras na telefon je to
 * mimo rozsah reality.
 * @param {string} s
 */
function hash(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * Kolik bodů (napříč VŠEMI výpravami, tzn. store.bloky) odkazuje na danou
 * uloženou pozici. Pro varování při mazání pozice v profilu – bod
 * odkazuje, nekopíruje, takže smazání pozice zasáhne všechny výpravy
 * najednou.
 * @param {string} pozId
 * @returns {number}
 */
export function pocetOdkazuNaPozici(pozId) {
  if (!store.bloky || typeof store.bloky !== 'object') return 0
  return Object.values(store.bloky)
    .flat()
    .filter((b) => b && b.typ === 'misto' && b.zdroj && b.zdroj.typ === 'pozice' && b.zdroj.id === pozId).length
}

/**
 * Doplní do bodů AKTUÁLNÍ GPS polohu tam, kde je potřeba. Pro body se
 * `zdroj.typ==='gps'` zjistí polohu ZNOVU (jednorázově) – to je „aktuální
 * poloha uživatele v okamžiku přepočtu“, ne uložená hodnota z chvíle, kdy se
 * bod zakládal. Když se GPS nepodaří zjistit, bod se v tichosti přeskočí
 * (stejné pravidlo jako u bodu bez rozpoznatelné polohy) – appka kvůli tomu
 * nezastaví celý přepočet. Sdílené mezi `sberBoduProRouting()` (živý plán)
 * a `prepocitejOtiskCesty()` (otisk rozjeté cesty) – obojí potřebuje totéž.
 * @param {Array<{lat: number, lon: number, id: string, zdroj?: {typ:string}|null}>} body
 * @returns {Promise<Array<{lat: number, lon: number, id: string}>>}
 */
async function sesbirejGpsBody(body) {
  const vysledek = []
  for (const b of body) {
    if (b.zdroj && b.zdroj.typ === 'gps') {
      try {
        const poz = await zjistiPolohuJednorazove()
        vysledek.push({ lat: poz.lat, lon: poz.lon, id: b.id })
      } catch {
        // bez GPS teď – bod se do přepočtu nepočítá, appka nespadne
      }
      continue
    }
    vysledek.push({ lat: b.lat, lon: b.lon, id: b.id })
  }
  return vysledek
}

/**
 * Sesbírá body ŽIVÉHO plánu aktivní výpravy pro Routing API.
 * @returns {Promise<Array<{lat: number, lon: number, id: string}>>}
 */
export async function sberBoduProRouting() {
  return sesbirejGpsBody(serazenaTrasa())
}

/**
 * proč: appka nemá backend, klíč Mapy.com je proto veřejná konstanta přímo
 * v kódu – stejně jako appka dnes volá Nominatim bez klíče (body.js
 * hledejAdresu()). Klíč má v administraci Mapy.com (developer.mapy.com)
 * omezení na Referery (jen povolené domény), takže jeho zveřejnění v kódu
 * neznamená, že by ho šlo použít odjinud.
 *
 * Volá se JEN na výslovnou akci (tlačítko Přepočítat), nikdy automaticky.
 */

const MAPY_API_KLIC = 'BgblIMF4M6fhAqmBAEMFcKSZy6xw2O7PlZ9l4DPoXpE'
const TIMEOUT_MS = 10000

/**
 * Zavolá Routing API Mapy.com pro seznam bodů (v pořadí start...cíl).
 * @param {Array<{lat: number, lon: number}>} body  aspoň 2 body
 * @returns {Promise<{polyline: Array<[number, number]>, vzdalenostKm: number, casMin: number}>}
 * @throws {Error}  s českou hláškou vhodnou přímo do toast()
 */
export async function zavolejRouting(body) {
  if (!MAPY_API_KLIC) throw new Error('Přepočet trasy potřebuje API klíč Mapy.com – zatím není nastavený')
  if (body.length < 2) throw new Error('Trasa potřebuje aspoň dva body s polohou')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    // Routing API chce start/end/waypoints zvlášť, ne opakované points, a
    // souřadnice jako "lon,lat" (ověřeno ručně – opačné pořadí než appka
    // jinde používá pro Leaflet).
    const [prvni, ...zbytek] = body
    const posledni = zbytek.pop()
    const params = new URLSearchParams({
      apikey: MAPY_API_KLIC,
      lang: 'cs',
      routeType: prefs.routeType || 'car_fast',
      start: `${prvni.lon},${prvni.lat}`,
      end: `${posledni.lon},${posledni.lat}`,
    })
    if (zbytek.length) params.set('waypoints', zbytek.map((b) => `${b.lon},${b.lat}`).join(';'))
    const url = `https://api.mapy.com/v1/routing/route?${params}`
    const odpoved = await fetch(url, { signal: ctrl.signal })
    if (!odpoved.ok) {
      // 404 s errorCode 7/9 znamená "mezi těmihle body nevede trasa daného
      // typu dopravy" (nejčastěji přes moře/ostrovy) – zdokumentované
      // chování API, ne chyba appky. Tělo nemusí být JSON (např. u jiných
      // stavových kódů), proto se čte v try.
      let detail = null
      try {
        detail = await odpoved.json()
      } catch {
        /* tělo není JSON, zůstane obecná hláška níž */
      }
      const errorCode = detail?.detail?.[0]?.errorCode
      if (odpoved.status === 404 && (errorCode === 7 || errorCode === 9)) {
        throw new Error('Mezi některými body nevede trasa (např. přes moře) – zkus jiný typ dopravy v Nastavení, nebo body uprav.')
      }
      throw new Error(`Mapy.com odpověděly chybou ${odpoved.status}`)
    }
    const data = await odpoved.json()
    return zpracujOdpoved(data)
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Přepočet trasy vypršel – zkus to znovu')
    throw new Error(e.message || 'Přepočet trasy se nepovedl')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Namapuje odpověď Routing API na tvar, který appka ukládá do
 * `store.aktivniPrepocet`. `coordinates` je GeoJSON `[lon, lat]`, appka
 * (Leaflet) chce `[lat, lon]` – proto se pořadí otáčí. `length` je v metrech,
 * `duration` v sekundách.
 * @param {any} data
 */
function zpracujOdpoved(data) {
  const polyline = data.geometry.geometry.coordinates.map(([lon, lat]) => [lat, lon])
  return {
    polyline,
    vzdalenostKm: data.length / 1000,
    casMin: Math.round(data.duration / 60),
  }
}

/**
 * Přepočte trasu aktivní výpravy a uloží výsledek do `store.aktivniPrepocet`.
 * Chyba (chybějící klíč, offline, timeout) appku nesmí shodit – ukáže se
 * jako vrácená chyba, poslední známý přepočet (pokud existuje) zůstává
 * beze změny jako fallback.
 * @returns {Promise<{ok: true}|{ok: false, chyba: string}>}
 */
export async function prepocitejTrasu() {
  const body = await sberBoduProRouting()
  if (body.length < 2) return { ok: false, chyba: 'Trasa nemá aspoň dva body s polohou' }
  try {
    const vysledek = await zavolejRouting(body)
    const ulozeno = await ulozGeometrii(otiskBodu(body), vysledek)
    if (!ulozeno.ok) return ulozeno
    // Předchozí geometrie už nemá k čemu patřit – slot je jen jeden.
    zahodNeplatny(store.aktivniPrepocet, ulozeno.prepocet.otisk)
    store.aktivniPrepocet = ulozeno.prepocet
    save()
    return { ok: true }
  } catch (e) {
    return { ok: false, chyba: e.message || 'Přepočet trasy se nepovedl' }
  }
}

/**
 * Uloží geometrii do IndexedDB a vrátí metadata, která patří do `store`.
 *
 * PROČ NE DO STORE CELÁ: jedna trasa je 273 kB a localStorage má strop ~5 MB
 * na všechna uživatelská data dohromady. Geometrie je navíc odvozená –
 * dopočítá se z bodů jedním voláním API – takže do vedle poznámek, které
 * nahradit nejdou, nepatří. Viz `core/trasyDb.js`.
 *
 * Neúspěšný zápis se NESMÍ ohlásit jako povedený přepočet: ve storu by pak
 * zůstalo metadata ukazující na geometrii, která nikde není, a mapa by tiše
 * kreslila vzdušnou čáru s tvrzením „přepočítáno".
 *
 * @param {string} otisk
 * @param {{polyline: Array<[number, number]>, vzdalenostKm: number, casMin: number}} vysledek
 */
async function ulozGeometrii(otisk, vysledek) {
  const { polyline, ...metadata } = vysledek
  const v = await ulozTrasu(otisk, polyline)
  if (!v.ok) {
    return {
      ok: false,
      chyba: v.plno
        ? 'V telefonu došlo místo, trasa se neuložila. Uvolni místo v Nastavení a zkus to znovu.'
        : 'Trasu se nepodařilo uložit do telefonu.',
    }
  }
  zapamatujTrasu(otisk, polyline)
  return { ok: true, prepocet: { ...metadata, otisk, spocitanoV: Date.now() } }
}

/**
 * Přepočte trasu OTISKU aktivní cesty (`store.cesta.zastavky`/`dny`) a uloží
 * výsledek do `store.cesta.prepocet` – NE do `store.aktivniPrepocet`, ten
 * patří aktivní VÝPRAVĚ (živému plánu), který appka za jízdy dál upravuje.
 * Cesta jede podle otisku z okamžiku Vyjet, takže i její přepočítaná trasa
 * musí zůstat u otisku, ne u živého plánu. Volá tlačítko Přepočítat na
 * kartě Na cestě (views/plan/cesta.js).
 * @returns {Promise<{ok: true}|{ok: false, chyba: string}>}
 */
export async function prepocitejOtiskCesty() {
  const c = store.cesta
  if (!c) return { ok: false, chyba: 'Appka zrovna nejede' }
  // VLASTNÍ BODY SE POČÍTAJÍ (srpen 2026). Do teď se sem posílaly jen
  // zastávky z databáze, protože `map/planLine.js` u otisku cesty vlastní
  // body vůbec nekreslil – trasa tak vedla mimo nocleh i start, přestože
  // se jede přes ně. Mapa je teď kreslí a otisk se musí počítat ze stejné
  // množiny, jinak by se nikdy neshodly a appka by spadla na vzdušný
  // fallback (BUGS.md B3).
  //
  // Bloky pod `c.nazev`, ne pod aktivní výpravou: za jízdy se dá výprava
  // přepnout a do trasy cesty by se připletly cizí body.
  const body = await sesbirejGpsBody(serazenaTrasa(c.zastavky, c.dny, vsechnyBody(c.nazev)))
  if (body.length < 2) return { ok: false, chyba: 'Trasa nemá aspoň dva body s polohou' }
  try {
    const vysledek = await zavolejRouting(body)
    const ulozeno = await ulozGeometrii(otiskBodu(body), vysledek)
    if (!ulozeno.ok) return ulozeno
    zahodNeplatny(c.prepocet, ulozeno.prepocet.otisk)
    c.prepocet = ulozeno.prepocet
    save()
    return { ok: true }
  } catch (e) {
    return { ok: false, chyba: e.message || 'Přepočet trasy se nepovedl' }
  }
}
