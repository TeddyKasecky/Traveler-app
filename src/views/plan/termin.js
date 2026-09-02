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
import { DRUHY, serazenePolozky, vsechnyBody } from './body.js'

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

/**
 * Datum okamžiku v MÍSTNÍM čase jako 'YYYY-MM-DD'.
 *
 * `toISOString().slice(0,10)` sem nepatří, i když je kratší: převádí do UTC,
 * takže odjezd po půlnoci u nás spadne na předchozí den a s ním se posune
 * celá výprava. Den výpravy je kalendářní údaj, ne okamžik.
 *
 * @param {number} ms
 */
export function mistniDatum(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Datum o `dni` dní dál. Přes UTC půlnoc, ať letní čas nepřeskočí den. */
export function posunDatum(iso, dni) {
  const [r, m, d] = iso.split('-').map(Number)
  const p = new Date(Date.UTC(r, m - 1, d) + dni * 86400000)
  return `${p.getUTCFullYear()}-${String(p.getUTCMonth() + 1).padStart(2, '0')}-${String(p.getUTCDate()).padStart(2, '0')}`
}

/**
 * Kolikátý KALENDÁŘNÍ den je `ted` ode dne `od`, počítáno od jedničky.
 *
 * JEDINÉ MÍSTO, KDE SE TO POČÍTÁ. Do září 2026 existovaly tři různé odpovědi
 * na tutéž otázku: `kolikatyDenDnes()` počítal kalendářně, kdežto
 * `kolikatyDenCesty()` v `cestaData.js` a ještě jednou opsaný výpočet
 * v `cesta.js` dělily uplynulý čas 24 hodinami. Na jedné obrazovce se pak
 * potkal štítek „NA CESTĚ · 1. DEN" s počasím, které psalo „dnes" až u druhého
 * dne (hlášení k `tadeas-f32-010`). Kalendář vyhrál, protože den výpravy má
 * mít jedno datum – jinak se nedá navázat předpověď ani kostra dnů.
 *
 * @param {string} od  'YYYY-MM-DD'
 * @param {number} [ted]  okamžik, ke kterému se ptáme
 * @returns {number} může být i 0 a záporné, když se ptáme před začátkem
 */
export function denOdData(od, ted = Date.now()) {
  if (!od) return 0
  const [r, m, d] = od.split('-').map(Number)
  const t = new Date(ted)
  const dnesUtc = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())
  return Math.round((dnesUtc - Date.UTC(r, m - 1, d)) / 86400000) + 1
}

/** Kolikátý den cesty je dnes? 0 = cesta neběží nebo není termín. */
export function kolikatyDenDnes() {
  const { od, dnu } = termin()
  if (!od) return 0
  const rozdil = denOdData(od)
  return rozdil >= 1 && (!dnu || rozdil <= dnu) ? rozdil : 0
}

/** Kolik dní dopředu má smysl se ptát. Open-Meteo umí 16, poslední třetina je věštění. */
export const DNU_CESTY = 14

/**
 * Dny výpravy, na které předpověď dosáhne, i s důvodem, když žádný nezbyde.
 *
 * OKNO JE DNEŠEK AŽ DNEŠEK + 13. Obojí omezení má svůj důvod:
 *
 * - **Dozadu**, protože `forecast_days` u Open-Meteo začíná dneškem. Vyjel-li
 *   někdo včera, na první den výpravy předpověď není a nikdy nebude – řádek
 *   přesto psal „Zatím bez předpovědi", což je lež, a po týdnu na cestě se
 *   jich nad dneškem nakupilo dvacet.
 * - **Dopředu**, protože dál API nedohlédne. Čtrnáct prázdných řádků u výpravy
 *   plánované na příští měsíc neřekne nic; že se ptáš moc brzy, patří do jedné
 *   věty u přepínače.
 *
 * ČÍSLO DNE ZŮSTÁVÁ PŮVODNÍ – po odfiltrování včerejška je dnešek pořád
 * „2. den", ne „1. den", aby to sedělo s itinerářem.
 *
 * DO DNE PATŘÍ I VLASTNÍ BODY (nocleh, start, cíl). Nocleh je místo, kde budeš
 * spát a ráno vstávat, takže je z celého dne nejužitečnější. Pořadí se bere
 * ze `serazenePolozky()`, aby se trasa dál řadila na jednom místě.
 *
 * @param {number} [ted]
 * @returns {{dny:Array<{den:number, datum:string, mista:Array<Record<string,any>>}>,
 *   duvod:string, zaHorizontem:number}}
 */
export function dnyCesty(ted = Date.now()) {
  const prazdno = (duvod) => ({ dny: [], duvod, zaHorizontem: 0 })
  const c = store.cesta
  const zastavky = c ? c.zastavky || [] : store.plan || []
  const delky = ((c ? c.dny : store.planDny) || []).map(Number).filter((x) => Number.isFinite(x) && x >= 0)

  // Datum prvního dne. U cesty z okamžiku vyjetí, u plánu z termínu.
  const prvni = c ? mistniDatum(c.zacatek) : termin().od
  if (!prvni) return prazdno('Nevím, který den výpravy je které datum – chybí termín')
  if (!zastavky.length) return prazdno('Výprava zatím nemá zastávky')

  // Místa a body dne. Bod se srovná na týž tvar jako místo z databáze, aby
  // se dál nikde nemuselo rozlišovat, odkud řádek pochází.
  const naMisto = (x) =>
    x.typ === 'zastavka'
      ? { lat: x.p.lat, lon: x.p.lon, n: x.p.n, ikona: 'i-pinme' }
      : {
          lat: x.b.lat,
          lon: x.b.lon,
          n: x.b.nazev || (DRUHY[x.b.druh] || DRUHY.vlastni).popisek,
          ikona: (DRUHY[x.b.druh] || DRUHY.vlastni).ikona,
        }

  const podleDne = new Map()
  for (const x of serazenePolozky(zastavky, delky, vsechnyBody(c ? c.nazev : null))) {
    const m = naMisto(x)
    if (!Number.isFinite(m.lat) || !Number.isFinite(m.lon)) continue
    if (!podleDne.has(x.den)) podleDne.set(x.den, [])
    podleDne.get(x.den).push(m)
  }

  // Den bez zastávek se řídí tvojí polohou, proto se skupiny berou z počtu
  // dnů, ne z toho, co `serazenePolozky()` vrátilo.
  const dnes = mistniDatum(ted)
  const posledni = posunDatum(dnes, DNU_CESTY - 1)
  const vsechny = []
  for (let k = 0; k < (delky.length || 1); k++) {
    vsechny.push({ den: k + 1, datum: posunDatum(prvni, k), mista: podleDne.get(k + 1) || [] })
  }

  const dny = vsechny.filter((d) => d.datum >= dnes && d.datum <= posledni)
  if (dny.length) return { dny, duvod: '', zaHorizontem: vsechny.filter((d) => d.datum > posledni).length }
  return prazdno(
    vsechny.every((d) => d.datum < dnes)
      ? 'Naplánované dny má výprava za sebou'
      : `Předpověď dohlédne ${DNU_CESTY} dní dopředu, výprava začíná později`
  )
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
export async function nactiPocasi(bod, o = {}) {
  const [jedna] = await nactiPocasiProBody([bod], o)
  return jedna
}

/**
 * Předpověď pro VÍC BODŮ NAJEDNOU. Vrací pole ve stejném pořadí jako vstup.
 *
 * PROČ JEDNÍM DOTAZEM: počasí na cestě (`tadeas-f32-010`) potřebuje předpověď
 * pro každou zastávku každého dne. Čtrnáctidenní výprava se třemi zastávkami
 * denně je čtyřicet bodů, a čtyřicet samostatných volání by bylo čtyřicet
 * kulatých cest po síti na mobilním připojení.
 *
 * Open-Meteo umí `latitude=a,b,c` a vrátí POLE odpovědí. Změřeno proti živému
 * API, ne odhadnuto: 40 bodů na 14 dní = HTTP 200, 29,7 kB, 196 ms.
 *
 * Pozor na tvar odpovědi: u JEDNOHO bodu vrací objekt, u víc bodů pole.
 * Sjednocuje se to hned, aby se s tím rozdílem nemuselo počítat výš.
 *
 * @param {Array<{lat:number, lon:number}>} body
 * @param {{hodin?:number, dnu?:number, fahrenheity?:boolean}} [o]
 */
export async function nactiPocasiProBody(body, { hodin = 24, dnu = 7, fahrenheity = false } = {}) {
  if (!Array.isArray(body) || !body.length) return []
  const params = new URLSearchParams({
    latitude: body.map((b) => b.lat.toFixed(3)).join(','),
    longitude: body.map((b) => b.lon.toFixed(3)).join(','),
    hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code',
    // `precipitation_sum` a `wind_speed_10m_max` přibyly v září 2026 do TÉHOŽ
    // dotazu – žádné volání navíc. U dne stálo do té doby jen procento, tedy
    // „jak pravděpodobně", bez „kolik" – přesně ta asymetrie, kvůli které se
    // do pruhu hodin doplňovaly milimetry.
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,' +
      'precipitation_sum,wind_speed_10m_max,sunrise,sunset',
    timezone: 'auto',
    forecast_days: String(dnu),
    forecast_hours: String(hodin),
  })
  // Jednotky řídí předvolby. Do klíče schránky patří taky – uložená předpověď
  // ve stupních Celsia se nesmí ukázat s popiskem ve Fahrenheitech.
  if (fahrenheity) {
    params.set('temperature_unit', 'fahrenheit')
    params.set('precipitation_unit', 'inch')
    // Kdo měří ve stupních Fahrenheita, čte rychlost v mílích. Bez tohohle
    // by u palců srážek stály kilometry v hodině.
    params.set('wind_speed_unit', 'mph')
  }

  const odpoved = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!odpoved.ok) throw new Error('Počasí se nepodařilo načíst')
  const data = await odpoved.json()
  // Jeden bod = objekt, víc bodů = pole. Sjednotit hned.
  const kusy = Array.isArray(data) ? data : [data]
  if (kusy.length !== body.length) throw new Error('Počasí přišlo pro jiný počet bodů')
  return kusy.map(prelozKus)
}

/**
 * Jedna odpověď Open-Meteo na náš tvar.
 * @param {Record<string, any>} data
 */
function prelozKus(data) {
  const h = data && data.hourly
  const d = data && data.daily
  if (!h || !Array.isArray(h.time) || !d || !Array.isArray(d.time)) {
    throw new Error('Počasí přišlo v nečekaném tvaru')
  }

  // JEDNOTKY Z ODPOVĚDI, ne natvrdo. S předvolbou Fahrenheita se posílá
  // `precipitation_unit: inch` a `wind_speed_unit: mph`, takže napevno psané
  // „mm" by u palců lhalo. Uložené předpovědi jednotku nemají – padá se
  // zpátky na to, co API vrací bez přepínače.
  const j = (data && data.daily_units) || {}
  const jh = (data && data.hourly_units) || {}

  return {
    srazkyJednotka: j.precipitation_sum || jh.precipitation || 'mm',
    vitrJednotka: j.wind_speed_10m_max || 'km/h',
    hodiny: h.time.map((cas, i) => ({
      cas,
      kodPocasi: h.weather_code[i],
      teplota: h.temperature_2m[i],
      srazkyMm: h.precipitation[i],
      // Uložené předpovědi z doby před srpnem 2026 tohle pole nemají.
      // Vykreslení s tím počítá a údaj vynechá – `null` je platný stav.
      destProcent: h.precipitation_probability ? h.precipitation_probability[i] : null,
    })),
    dny: d.time.map((datum, i) => ({
      datum,
      kodPocasi: d.weather_code[i],
      maxC: d.temperature_2m_max[i],
      minC: d.temperature_2m_min[i],
      destProcent: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null,
      // Přibylo v září 2026. Předpovědi uložené dřív pole nemají, takže se
      // u nich údaj prostě nenakreslí – stejné opatrné čtení jako výš.
      srazkyMm: d.precipitation_sum ? d.precipitation_sum[i] : null,
      vitr: d.wind_speed_10m_max ? d.wind_speed_10m_max[i] : null,
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
