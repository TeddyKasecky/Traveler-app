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

import { store, save } from '../../core/store.js'
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
 * Sesbírá body aktivní trasy pro Routing API. Pro body se `zdroj.typ==='gps'`
 * zjistí AKTUÁLNÍ polohu ZNOVU (jednorázově) – to je „aktuální poloha
 * uživatele v okamžiku přepočtu“, ne uložená hodnota z chvíle, kdy se bod
 * zakládal. Když se GPS nepodaří zjistit, bod se v tichosti přeskočí (stejné
 * pravidlo jako u bodu bez rozpoznatelné polohy) – appka kvůli tomu
 * nezastaví celý přepočet.
 * @returns {Promise<Array<{lat: number, lon: number, id: string}>>}
 */
export async function sberBoduProRouting() {
  const body = serazenaTrasa()
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
 * proč: appka nemá backend, klíč Mapy.com je proto veřejná konstanta přímo
 * v kódu – stejně jako appka dnes volá Nominatim bez klíče (body.js
 * hledejAdresu()). MAPY_API_KLIC je záměrně prázdný placeholder: appka MUSÍ
 * fungovat i bez něj (přepočet selže srozumitelnou chybou a UI spadne na
 * vzdušný odhad) – klíč doplní uživatel sám.
 *
 * Volá se JEN na výslovnou akci (tlačítko Přepočítat), nikdy automaticky.
 */

// TODO: doplnit skutečný veřejný klíč z účtu Mapy.com (Seznam.cz).
// Prázdný řetězec je vědomý výchozí stav, ne chyba.
const MAPY_API_KLIC = ''
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
    const params = new URLSearchParams({ apikey: MAPY_API_KLIC, lang: 'cs', routeType: 'car_fast' })
    for (const b of body) params.append('points', `${b.lon},${b.lat}`) // TODO ověřit formát/pořadí lon,lat
    const url = `https://api.mapy.com/v1/routing/route?${params}` // TODO ověřit přesnou cestu API
    const odpoved = await fetch(url, { signal: ctrl.signal })
    if (!odpoved.ok) throw new Error(`Mapy.com odpověděly chybou ${odpoved.status}`)
    const data = await odpoved.json()
    return zpracujOdpoved(data) // TODO namapovat skutečný tvar odpovědi
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Přepočet trasy vypršel – zkus to znovu')
    throw new Error(e.message || 'Přepočet trasy se nepovedl')
  } finally {
    clearTimeout(timer)
  }
}

// TODO – závisí na skutečném tvaru JSON odpovědi Mapy.com Routing API.
function zpracujOdpoved(data) {
  throw new Error('Zpracování odpovědi Mapy.com ještě není dopsané')
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
