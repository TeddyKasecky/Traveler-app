/**
 * Termín cesty, kalendářní dny kostry a odhad „stíháme?".
 *
 * OBOJE NEPOVINNÉ, a to je celý návrh: „jsme páni svého času" znamená, že
 * termín člověk často nezná a znát nemusí. Prázdné je platný stav a nikde
 * nesmí svítit jako nedodělek. Když ale vyplní, dostane víc – kostru dnů,
 * datum u každého z nich a předpověď počasí navázanou na konkrétní den.
 *
 * BEZE VZHLEDU, aby to šlo testovat v `check-dny.mjs` bez prohlížeče –
 * stejný důvod, proč je `body.js` oddělený od `bloky.js`.
 *
 * DATUM JAKO 'YYYY-MM-DD', ne timestamp: cesta je o kalendářních dnech, ne
 * o okamžicích. Timestamp by se posouval podle časové zóny a 1. den by se
 * po přeletu hranice mohl stát 2. dnem.
 */

import { store, save } from '../../core/store.js'
import { dkm } from '../../core/geo.js'

/** Silnice bývá delší než vzdušná čára – týž koeficient jako v plan.js. */
const KLIKATOST = 1.35

/** Průměrná rychlost na roadtripu včetně zastávek, km/h. */
const RYCHLOST = 60

/** Kolik hodin za volantem denně je ještě pohoda, ne makačka. */
export const POHODOVYCH_HODIN = 4

/** Termín aktivní výpravy. Prázdné hodnoty jsou v pořádku. */
export const termin = () => ({
  od: store.vypravaOd || '',
  dnu: Number(store.vypravaDnu) || 0,
})

/**
 * Nastaví termín. Obojí smí být prázdné – tím se termín zase zruší.
 * @param {string} od  'YYYY-MM-DD' nebo ''
 * @param {number} dnu  počet dní, 0 = neurčeno
 */
export function nastavTermin(od, dnu) {
  store.vypravaOd = /^\d{4}-\d{2}-\d{2}$/.test(od || '') ? od : ''
  store.vypravaDnu = Math.max(0, Math.min(365, Math.round(Number(dnu) || 0)))
  return save()
}

/**
 * Datum n-tého dne cesty (od jedničky) jako 'YYYY-MM-DD', nebo '' bez termínu.
 *
 * Počítá se přes UTC půlnoc, aby letní čas neposunul den o jedna – přičítání
 * 86400000 ms k místnímu času v noci přechodu na letní čas přeskočí den.
 *
 * @param {number} cislo  pořadí dne od 1
 * @returns {string}
 */
export function datumDne(cislo) {
  const { od } = termin()
  if (!od || cislo < 1) return ''
  const [r, m, d] = od.split('-').map(Number)
  const zaklad = Date.UTC(r, m - 1, d)
  const den = new Date(zaklad + (cislo - 1) * 86400000)
  return `${den.getUTCFullYear()}-${String(den.getUTCMonth() + 1).padStart(2, '0')}-${String(den.getUTCDate()).padStart(2, '0')}`
}

/** Krátký český zápis data: „12. 8.". Prázdný vstup dá prázdný výstup. */
export function kratkeDatum(iso) {
  if (!iso) return ''
  const [, m, d] = iso.split('-').map(Number)
  return `${d}. ${m}.`
}

/** Den v týdnu zkratkou: „po", „út"… Prázdný vstup dá prázdný výstup. */
export function denVTydnu(iso) {
  if (!iso) return ''
  const [r, m, d] = iso.split('-').map(Number)
  return ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'][new Date(Date.UTC(r, m - 1, d)).getUTCDay()]
}

/** Kolikátý den cesty je dnes? 0 = cesta neběží nebo není termín. */
export function kolikatyDenDnes() {
  const { od, dnu } = termin()
  if (!od) return 0
  const dnes = new Date()
  const dnesUtc = Date.UTC(dnes.getFullYear(), dnes.getMonth(), dnes.getDate())
  const [r, m, d] = od.split('-').map(Number)
  const rozdil = Math.round((dnesUtc - Date.UTC(r, m - 1, d)) / 86400000) + 1
  return rozdil >= 1 && (!dnu || rozdil <= dnu) ? rozdil : 0
}

/**
 * Odhad, jestli se přejezd mezi dvěma kotvami vejde do dnů, které na něj zbývají.
 *
 * VĚDOMĚ MĚKKÉ: vrací větu, ne verdikt. Cesta není závod a aplikace nemá
 * tlačit – proto žádné „nestíháš", ale „vejde se to pohodlně" nebo „to bude
 * svižnější". Rozhodnutí zůstává na posádce.
 *
 * Vzdálenost je vzdušná čára × KLIKATOST, tedy odhad; v Alpách optimistický.
 * Až bude polyline ze skutečného routingu, dosadí se místo `dkm`.
 *
 * @param {{lat:number, lon:number}} odkud
 * @param {{lat:number, lon:number}} kam
 * @param {number} dnu  kolik dní na přejezd zbývá
 * @returns {{km:number, hodin:number, denne:number, pohoda:boolean, veta:string}|null}
 */
export function stihameTo(odkud, kam, dnu) {
  if (!odkud || !kam || dnu < 1) return null
  const km = dkm(odkud, kam) * KLIKATOST
  const hodin = km / RYCHLOST
  const denne = hodin / dnu

  const pohoda = denne <= POHODOVYCH_HODIN
  const cas = hodin < 1 ? `${Math.round(hodin * 60)} min` : `zhruba ${hodin.toFixed(1).replace('.', ',')} h`
  const veta = pohoda
    ? `${Math.round(km)} km, ${cas} jízdy — do ${dnu} ${dnu === 1 ? 'dne' : 'dnů'} se to vejde v pohodě`
    : `${Math.round(km)} km, ${cas} jízdy — na ${dnu} ${dnu === 1 ? 'den' : 'dnů'} to bude svižnější tempo`

  return { km, hodin, denne, pohoda, veta }
}

/**
 * Předpověď počasí z Open-Meteo pro jeden bod a rozsah dnů.
 *
 * OPEN-METEO ZÁMĚRNĚ: nepotřebuje API klíč ani registraci, takže v kódu
 * statické aplikace bez serveru není co prozradit. Druhé (a poslední) síťové
 * volání za běhu vedle Nominatimu – bez signálu prostě selže a dashboard
 * funguje dál, jen bez počasí.
 *
 * @param {{lat:number, lon:number}} bod
 * @param {string} od  'YYYY-MM-DD'
 * @param {string} do  'YYYY-MM-DD'
 * @returns {Promise<Array<{datum:string, kodPocasi:number, maxC:number, minC:number, srazkyMm:number}>>}
 */
export async function nactiPocasi(bod, od, doDne) {
  const params = new URLSearchParams({
    latitude: String(bod.lat.toFixed(3)),
    longitude: String(bod.lon.toFixed(3)),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
    timezone: 'auto',
    start_date: od,
    end_date: doDne,
  })
  const odpoved = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!odpoved.ok) throw new Error('Počasí se nepodařilo načíst')
  const data = await odpoved.json()
  const d = data && data.daily
  if (!d || !Array.isArray(d.time)) throw new Error('Počasí přišlo v nečekaném tvaru')

  return d.time.map((datum, i) => ({
    datum,
    kodPocasi: d.weather_code[i],
    maxC: d.temperature_2m_max[i],
    minC: d.temperature_2m_min[i],
    srazkyMm: d.precipitation_sum[i],
  }))
}

/**
 * Kód počasí WMO na ikonu a slovo. Skupiny stačí – posádka se rozhoduje
 * „prší / nebude pršet", ne podle desetiny srážek.
 * @param {number} kod
 * @returns {{ikona:string, popis:string}}
 */
export function pocasiPodleKodu(kod) {
  // Sprite nemá mraky ani mlhu – oblačno bere `i-leaf` (neutrální tvar bez
  // významu počasí), zbytek má vlastní ikonu. Novou do spritu nepřidávám,
  // dokud se neukáže, že to na obrazovce vadí.
  if (kod === 0) return { ikona: 'i-sun', popis: 'jasno' }
  if (kod <= 3) return { ikona: 'i-leaf', popis: 'oblačno' }
  if (kod <= 48) return { ikona: 'i-leaf', popis: 'mlha' }
  if (kod <= 67) return { ikona: 'i-rain', popis: 'déšť' }
  if (kod <= 77) return { ikona: 'i-snow', popis: 'sníh' }
  if (kod <= 82) return { ikona: 'i-rain', popis: 'přeháňky' }
  if (kod <= 86) return { ikona: 'i-snow', popis: 'sněhové přeháňky' }
  return { ikona: 'i-bolt', popis: 'bouřky' }
}
