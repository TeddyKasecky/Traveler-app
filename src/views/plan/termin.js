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
 * Předpověď počasí z Open-Meteo pro jeden bod.
 *
 * OPEN-METEO ZÁMĚRNĚ: nepotřebuje API klíč ani registraci, takže v kódu
 * statické aplikace bez serveru není co prozradit. Vedle Nominatimu
 * a přepočtu trasy je to třetí síťové volání za běhu – bez signálu prostě
 * selže a obrazovka funguje dál, jen bez počasí.
 *
 * VRACÍ HODINY I DNY JEDNÍM DOTAZEM. Rozdělit to na dva by znamenalo dvojí
 * čekání a dvojí možnost, že jedno projde a druhé ne – a půlka předpovědi
 * je horší než žádná, protože není poznat, že chybí.
 *
 * @param {{lat:number, lon:number}} bod
 * @param {{hodin?:number, dnu?:number, fahrenheity?:boolean}} [o]
 * @returns {Promise<{hodiny:Array<{cas:string, kodPocasi:number, teplota:number, srazkyMm:number}>,
 *   dny:Array<{datum:string, kodPocasi:number, maxC:number, minC:number,
 *   destProcent:number, vychod:string, zapad:string}>}>}
 */
export async function nactiPocasi(bod, { hodin = 24, dnu = 7, fahrenheity = false } = {}) {
  const params = new URLSearchParams({
    latitude: String(bod.lat.toFixed(3)),
    longitude: String(bod.lon.toFixed(3)),
    hourly: 'temperature_2m,precipitation,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    timezone: 'auto',
    forecast_days: String(dnu),
    forecast_hours: String(hodin),
  })
  // Jednotky řídí předvolby. Do klíče schránky patří taky – uložená předpověď
  // ve stupních Celsia se nesmí ukázat s popiskem ve Fahrenheitech.
  if (fahrenheity) {
    params.set('temperature_unit', 'fahrenheit')
    params.set('precipitation_unit', 'inch')
  }

  const odpoved = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!odpoved.ok) throw new Error('Počasí se nepodařilo načíst')
  const data = await odpoved.json()
  const h = data && data.hourly
  const d = data && data.daily
  if (!h || !Array.isArray(h.time) || !d || !Array.isArray(d.time)) {
    throw new Error('Počasí přišlo v nečekaném tvaru')
  }

  return {
    hodiny: h.time.map((cas, i) => ({
      cas,
      kodPocasi: h.weather_code[i],
      teplota: h.temperature_2m[i],
      srazkyMm: h.precipitation[i],
    })),
    dny: d.time.map((datum, i) => ({
      datum,
      kodPocasi: d.weather_code[i],
      maxC: d.temperature_2m_max[i],
      minC: d.temperature_2m_min[i],
      destProcent: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null,
      vychod: d.sunrise ? d.sunrise[i] : '',
      zapad: d.sunset ? d.sunset[i] : '',
    })),
  }
}

/**
 * Kód počasí WMO na ikonu a slovo. Skupiny stačí – posádka se rozhoduje
 * „prší / nebude pršet", ne podle desetiny srážek.
 * @param {number} kod
 * @returns {{ikona:string, popis:string}}
 */
export function pocasiPodleKodu(kod) {
  // Do srpna 2026 sprite mrak ani mlhu neměl a oblačno bralo `i-leaf` – LIST.
  // V Evropě je oblačno nejčastější stav, takže na obrazovce byly listy skoro
  // pořád. Čtyři nové symboly jsou odvozené z `i-rain` (mrak už obsahoval)
  // a z `i-sun`, takže sednou do sady tvarem i tloušťkou tahu.
  //
  // Rozlišení podle WMO. Jemnější dělení nemá smysl: posádka se rozhoduje
  // „prší / nebude pršet", ne podle desetiny srážek.
  if (kod === 0) return { ikona: 'i-sun', popis: 'jasno' }
  if (kod <= 2) return { ikona: 'i-polojasno', popis: 'polojasno' }
  if (kod === 3) return { ikona: 'i-mrak', popis: 'zataženo' }
  if (kod <= 48) return { ikona: 'i-mlha', popis: 'mlha' }
  if (kod <= 57) return { ikona: 'i-mrholeni', popis: 'mrholení' }
  if (kod <= 67) return { ikona: 'i-rain', popis: 'déšť' }
  if (kod <= 77) return { ikona: 'i-snow', popis: 'sníh' }
  if (kod <= 82) return { ikona: 'i-rain', popis: 'přeháňky' }
  if (kod <= 86) return { ikona: 'i-snow', popis: 'sněhové přeháňky' }
  return { ikona: 'i-bolt', popis: 'bouřky' }
}
