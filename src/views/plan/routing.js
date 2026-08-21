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
import { serazenaTrasa } from './body.js'

/**
 * Otisk aktuálního pořadí a polohy bodů trasy – levný „hash“ k poznání, že
 * se od posledního přepočtu něco změnilo (pořadí, přidání/odebrání bodu,
 * posun start/cíl). Netřeba kryptografický hash, stačí deterministický
 * řetězec porovnatelný na === – seznam bodů má jednotky až desítky prvků.
 * @param {Array<{lat:number, lon:number, id?:string}>} body
 * @returns {string}
 */
export function otiskBodu(body) {
  return body.map((b) => `${b.id || ''}:${b.lat.toFixed(5)},${b.lon.toFixed(5)}`).join('|')
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
    store.aktivniPrepocet = { ...vysledek, otisk: otiskBodu(body), spocitanoV: Date.now() }
    save()
    return { ok: true }
  } catch (e) {
    return { ok: false, chyba: e.message || 'Přepočet trasy se nepovedl' }
  }
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
  const body = await sesbirejGpsBody(serazenaTrasa(c.zastavky, c.dny))
  if (body.length < 2) return { ok: false, chyba: 'Trasa nemá aspoň dva body s polohou' }
  try {
    const vysledek = await zavolejRouting(body)
    c.prepocet = { ...vysledek, otisk: otiskBodu(body), spocitanoV: Date.now() }
    save()
    return { ok: true }
  } catch (e) {
    return { ok: false, chyba: e.message || 'Přepočet trasy se nepovedl' }
  }
}
