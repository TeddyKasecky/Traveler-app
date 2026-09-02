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

/**
 * Časový strop na JEDEN úsek; celý přepočet dostane násobek podle jejich počtu.
 *
 * ZMĚŘENO na skutečné jedenáctidenní trase (19 bodů, 18 166 km): nejdelší
 * úsek odpovídal 12,9 s. Deset vteřin, které tu byly do září 2026, tedy
 * nestačilo ani na jeden úsek – přepočet hlásil „vypršel" dřív, než mohl
 * doběhnout. Dvacet nechává rezervu i na mobilní data.
 */
const TIMEOUT_MS = 20000

/**
 * Kolik bodů se posílá v jednom dotazu.
 *
 * TVRDÝ STROP API JE SEDMNÁCT, změřeno na živém API (září 2026): `waypoints`
 * unese nejvýš patnáct položek, takže s počátkem a cílem je to sedmnáct bodů
 * a osmnáctý vrátí 422 s `ensure this value has at most 15 items`. Vzdálenost
 * strop nemá – Barcelona → Albánie → Praha na tři body projde v pohodě.
 *
 * POSÍLÁ SE PŘESTO JEN DEVĚT, a to kvůli spolehlivosti, ne rychlosti. Změřeno
 * na trase o 18 166 km, kde je celkový čas skoro stejný, ať se dělí jakkoli
 * (délka trasy váží víc než počet dotazů), ale nejdelší jednotlivý dotaz se
 * liší podstatně:
 *
 *   po 17 bodech → 2 dotazy, celkem 25,3 s, nejdelší 21,6 s, a **jeden 503**
 *   po  9 bodech → 3 dotazy, celkem 25,5 s, nejdelší 12,5 s, všechny 200
 *   po  6 bodech → 4 dotazy, celkem 26,3 s, nejdelší 12,9 s, všechny 200
 *   po  4 bodech → 6 dotazů, celkem 28,3 s, nejdelší  7,2 s, všechny 200
 *
 * Na jeden sedmnáctibodový kus přes půl Evropy API nestačí a vrací 503.
 * Devět je půlka stropu: o dotaz víc než šest, a delší dotaz to neudělá.
 */
const BODU_NA_DOTAZ = 9

/**
 * Rozdělí body na úseky, které se do jednoho dotazu vejdou.
 *
 * SOUSEDNÍ ÚSEKY SDÍLEJÍ HRANIČNÍ BOD. Bez toho by mezi nimi zůstala díra –
 * úsek by končil v Chorvatsku a další začínal ve Španělsku, aniž by se ta
 * cesta někde spočítala.
 *
 * @param {Array<{lat:number, lon:number}>} body
 * @param {number} [max]
 * @returns {Array<Array<{lat:number, lon:number}>>}
 */
export function rozdelNaUseky(body, max = BODU_NA_DOTAZ) {
  if (body.length <= max) return [body]
  const useky = []
  for (let i = 0; i < body.length - 1; i += max - 1) useky.push(body.slice(i, i + max))
  return useky
}

/**
 * Jak nahrubo se čára ukládá. Ve stupních, protože Douglas–Peucker níž počítá
 * v nich – na naší šířce je to zhruba dvacet metrů na výšku a čtrnáct na
 * šířku. Do plánu, který se prohlíží přes celou Evropu, je to neviditelné.
 */
const TOLERANCE_CARY = 0.0002

/**
 * Zjednoduší čáru trasy (Douglas–Peucker) a zaokrouhlí na pět desetinných
 * míst, tedy zhruba na metr.
 *
 * PROČ VŮBEC: Routing API vrací čáru v plné podrobnosti a u dlouhé výpravy
 * je to k neunesení. Změřeno na skutečné jedenáctidenní trase (19 bodů,
 * 18 166 km): **304 504 souřadnic a 6 372 kB**. Tolik by šlo do IndexedDB
 * a odtud do `L.polyline`, kterou prohlížeč promítá při každém posunu mapy.
 * Pro srovnání – `CLAUDE.md` popisuje, jak appce shodilo ukládání, když měla
 * ve `store` trasy po 273 kB. Se zjednodušením zbyde **32 751 bodů a 622 kB**,
 * tedy desetina.
 *
 * Vzdálenost ani čas se tím nemění – ty vrací API zvlášť (`length`,
 * `duration`) a nepočítají se z čáry. KRAJNÍ BODY ZŮSTÁVAJÍ, takže trasa
 * pořád začíná a končí, kde má.
 *
 * @param {Array<[number, number]>} body
 * @param {number} [tolerance]
 * @returns {Array<[number, number]>}
 */
export function zjednodusCaru(body, tolerance = TOLERANCE_CARY) {
  if (!Array.isArray(body) || body.length < 3) return body || []

  // Čtverec vzdálenosti bodu od úsečky – bez odmocniny, porovnává se
  // s druhou mocninou tolerance.
  const odUsecky = (p, a, b) => {
    let x = a[0]
    let y = a[1]
    const dx = b[0] - x
    const dy = b[1] - y
    if (dx || dy) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy)
      if (t > 1) {
        x = b[0]
        y = b[1]
      } else if (t > 0) {
        x += dx * t
        y += dy * t
      }
    }
    return (p[0] - x) ** 2 + (p[1] - y) ** 2
  }

  const t2 = tolerance * tolerance
  const drzet = new Uint8Array(body.length)
  drzet[0] = 1
  drzet[body.length - 1] = 1
  // Vlastní zásobník, ne rekurze: čára o třech stech tisících bodech by
  // rekurzí přetekla zásobník volání.
  const fronta = [[0, body.length - 1]]
  while (fronta.length) {
    const [od, doK] = fronta.pop()
    let nej = 0
    let kde = -1
    for (let i = od + 1; i < doK; i++) {
      const d = odUsecky(body[i], body[od], body[doK])
      if (d > nej) {
        nej = d
        kde = i
      }
    }
    if (nej > t2 && kde > 0) {
      drzet[kde] = 1
      fronta.push([od, kde], [kde, doK])
    }
  }

  const out = []
  for (let i = 0; i < body.length; i++) {
    if (drzet[i]) out.push([Math.round(body[i][0] * 1e5) / 1e5, Math.round(body[i][1] * 1e5) / 1e5])
  }
  return out
}

/**
 * Slepí spočítané úseky do jedné trasy.
 *
 * Hraniční bod je v obou úsecích, takže se první souřadnice každého dalšího
 * úseku zahodí – jinak by v čáře byl dvakrát a na dlouhé trase by se z toho
 * nastřádalo pár set zbytečných bodů.
 *
 * @param {Array<{polyline:Array, vzdalenostKm:number, casMin:number}>} casti
 */
export function spojUseky(casti) {
  const polyline = []
  let vzdalenostKm = 0
  let casMin = 0
  for (const c of casti) {
    // Cyklem, ne `push(...pole)`: čára přes patnáct tisíc kilometrů má desítky
    // tisíc bodů a tolik argumentů naráz přeteče zásobník.
    for (let i = polyline.length ? 1 : 0; i < c.polyline.length; i++) polyline.push(c.polyline[i])
    vzdalenostKm += c.vzdalenostKm
    casMin += c.casMin
  }
  return { polyline, vzdalenostKm, casMin }
}

/**
 * Jeden dotaz na Routing API. Nejvýš `BODU_NA_DOTAZ` bodů.
 * @param {Array<{lat:number, lon:number}>} body
 * @param {AbortSignal} signal
 */
async function jedenUsek(body, signal) {
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
  const odpoved = await fetch(`https://api.mapy.com/v1/routing/route?${params}`, { signal })
  if (!odpoved.ok) {
    // Tělo nemusí být JSON (např. u jiných stavových kódů), proto se čte v try.
    let detail = null
    try {
      detail = await odpoved.json()
    } catch {
      /* tělo není JSON, zůstane obecná hláška níž */
    }
    const errorCode = detail?.detail?.[0]?.errorCode
    // 404 s errorCode 7/9 znamená „mezi těmihle body nevede trasa daného typu
    // dopravy" (nejčastěji přes moře/ostrovy) – zdokumentované chování API.
    if (odpoved.status === 404 && (errorCode === 7 || errorCode === 9)) {
      throw new Error('Mezi některými body nevede trasa (např. přes moře) – zkus jiný typ dopravy v Nastavení, nebo body uprav.')
    }
    // 503 dostane i neprojetelná dvojice bodů (změřeno na trase na Maltu),
    // takže se z něj nedá poznat výpadek od „tudy silnice nevede". Hláška
    // proto říká obojí místo toho, aby si jedno vymyslela.
    if (odpoved.status === 503) {
      throw new Error('Mapy.com trasu nevrátily. Zkus to za chvíli znovu – a když to nepomůže, nevede nejspíš mezi některými body silnice (třeba přes moře).')
    }
    throw new Error(`Mapy.com odpověděly chybou ${odpoved.status}`)
  }
  return zpracujOdpoved(await odpoved.json())
}

/**
 * Zavolá Routing API Mapy.com pro seznam bodů (v pořadí start...cíl).
 *
 * DLOUHÁ TRASA SE ROZDĚLÍ NA VÍC DOTAZŮ. API bere nejvýš patnáct waypointů,
 * tedy sedmnáct bodů; jedenáctidenní výprava jich má klidně devatenáct
 * a dostávala 422. Volá se to jen na výslovné ťuknutí na „Přepočítat", takže
 * pár dotazů za sebou nikomu nevadí – zato se plán přestane lámat na počtu
 * zastávek. Časový strop roste s počtem úseků, jinak by delší trasa vypršela
 * dřív, než by se stihla spočítat.
 *
 * @param {Array<{lat: number, lon: number}>} body  aspoň 2 body
 * @param {{prubeh?: ((kolikaty:number, zCelkem:number) => void)|null}} [o]
 * @returns {Promise<{polyline: Array<[number, number]>, vzdalenostKm: number, casMin: number}>}
 * @throws {Error}  s českou hláškou vhodnou přímo do toast()
 */
export async function zavolejRouting(body, { prubeh = null } = {}) {
  if (!MAPY_API_KLIC) throw new Error('Přepočet trasy potřebuje API klíč Mapy.com – zatím není nastavený')
  if (body.length < 2) throw new Error('Trasa potřebuje aspoň dva body s polohou')

  const useky = rozdelNaUseky(body)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS * useky.length)
  try {
    const casti = []
    // Postupně, ne naráz: je to uživatelem vyžádaná akce, ne závod, a sedm
    // souběžných dotazů na cizí API je zbytečná drzost.
    for (const usek of useky) {
      // Průběh, protože u dlouhé výpravy se čeká přes dvacet vteřin a toast
      // zhasne po dvou – bez tohohle by to vypadalo, že se appka zasekla.
      if (prubeh) prubeh(casti.length + 1, useky.length)
      casti.push(await jedenUsek(usek, ctrl.signal))
    }
    const cela = spojUseky(casti)
    return { ...cela, polyline: zjednodusCaru(cela.polyline) }
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
 * @param {{prubeh?: ((kolikaty:number, zCelkem:number) => void)|null}} [o]
 * @returns {Promise<{ok: true}|{ok: false, chyba: string}>}
 */
export async function prepocitejTrasu({ prubeh = null } = {}) {
  const body = await sberBoduProRouting()
  if (body.length < 2) return { ok: false, chyba: 'Trasa nemá aspoň dva body s polohou' }
  try {
    const vysledek = await zavolejRouting(body, { prubeh })
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
export async function prepocitejOtiskCesty({ prubeh = null } = {}) {
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
    const vysledek = await zavolejRouting(body, { prubeh })
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
