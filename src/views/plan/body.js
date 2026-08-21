/**
 * Data bloků a bodů trasy – beze vzhledu.
 *
 * ODDĚLENO OD `bloky.js` (srpen 2026), aby check-dny.mjs mohl testovat
 * `rozpoznejSouradnice()` a `pridejBod()` jako čistý Node bez prohlížeče.
 * `bloky.js` renderuje HTML a importuje `IC` z `icons/sprite.js`, který
 * čte `sprite.svg?raw` – Vite syntaxe, kterou plain Node nezvládne. Kdyby
 * tenhle soubor cokoli z `icons/` importoval, čistý test by spadl na
 * „Unknown file extension .svg“ hned při importu, ne až v testu.
 *
 * Bloky bydlí ve `store.bloky` klíčované názvem výpravy (výpravy vlastní id
 * nemají a název je jejich klíč i jinde). Každý blok má `id`, `typ` a `den`
 * (číslo dne od jedničky, null = k celému plánu / bez kotvy).
 *
 * BOD TRASY (blok typu `misto`) je bod, který není v databázi míst – start,
 * nocleh, cíl nebo vlastní (pole `druh`). Kotví se polem `po` (id zastávky,
 * hned ZA kterou stojí; `po: null` + `den: d` = začátek dne d; obojí null =
 * konec plánu – tak se chovají historické bloky bez těchhle polí).
 */

import { store, S, save } from '../../core/store.js'
import { BEZ_NAZVU } from './vypravy.js'
import { pozice } from '../../core/pozice.js'

/** Klíč aktivní výpravy v `store.bloky`. */
const klic = () => store.vypravaNazev || BEZ_NAZVU

/** Bloky aktivní výpravy, vždycky pole. */
export function bloky() {
  if (!store.bloky || typeof store.bloky !== 'object') store.bloky = {}
  return store.bloky[klic()] || []
}

/** Zapíše bloky aktivní výpravy. */
export function zapis(nove) {
  store.bloky[klic()] = nove
  return save()
}

/** Nové id bloku. Čas + náhoda stačí – bloků jsou jednotky, ne tisíce. */
export const noveId = () => `b${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`

/** Přidá blok daného typu. Vrací jeho id. */
export function pridejBlok(typ, den = null) {
  const zaklad = { id: noveId(), typ, den }
  const podleTypu = {
    poznamka: { nadpis: '', text: '' },
    seznam: { nadpis: 'Seznam', polozky: [] },
    misto: { nazev: '', lat: null, lon: null, poznamka: '', hotovo: 0, druh: 'vlastni', po: null },
    odkaz: { popisek: '', url: '' },
    rozpocet: { nadpis: 'Rozpočet', polozky: [] },
  }
  zapis([...bloky(), { ...zaklad, ...podleTypu[typ] }])
  return zaklad.id
}

/** Smaže blok. */
export function smazBlok(id) {
  zapis(bloky().filter((b) => b.id !== id))
}

/** Najde blok podle id. */
export const blok = (id) => bloky().find((b) => b.id === id)

/** Druhy bodů trasy. Id se NIKDY nemění – jsou v uložených blocích. */
export const DRUHY = {
  start: { ikona: 'i-van', popisek: 'Start' },
  nocleh: { ikona: 'i-stan', popisek: 'Nocleh' },
  cil: { ikona: 'i-flag', popisek: 'Cíl' },
  vlastni: { ikona: 'i-pinme', popisek: 'Vlastní místo' },
}

/** Všechny body trasy (bloky typu misto) aktivní výpravy. */
export const vsechnyBody = () => bloky().filter((b) => b.typ === 'misto')

/**
 * Založí bod trasy. Vrací jeho id.
 *
 * `zdroj` říká, odkud se bere poloha, když nejde o ruční/pevný zápis do
 * `lat`/`lon`: `{typ:'pozice', id}` odkazuje na core/pozice.js (úprava
 * pozice v profilu se pak promítne všude, kde je použitá – odkazem, ne
 * kopií), `{typ:'gps'}` znamená "aktuální poloha v okamžiku PŘEPOČTU trasy"
 * (views/plan/routing.js), ne trvale uložený bod. Čti přes souradniceBodu().
 * @param {{druh?: string, nazev?: string, lat?: number|null, lon?: number|null, den?: number|null, po?: string|null, zdroj?: {typ: 'pozice', id: string}|{typ: 'gps'}|null}} p
 */
export function pridejBod({ druh = 'vlastni', nazev = '', lat = null, lon = null, den = null, po = null, zdroj = null }) {
  const id = noveId()
  zapis([...bloky(), { id, typ: 'misto', den, po, druh, nazev, lat, lon, poznamka: '', hotovo: 0, zdroj }])
  return id
}

/**
 * Aktuální souřadnice bodu trasy. Pro `zdroj.typ === 'pozice'` NEBERE
 * `b.lat`/`b.lon` (mohou být zastaralá kopie), ale dotáhne živou hodnotu
 * z core/pozice.js – tak se projeví úprava pozice v profilu bez přepisování
 * bodu. Vrací null, když uložená pozice, na kterou bod odkazoval, byla
 * smazána, nebo když bod polohu vůbec nemá.
 * @param {object} b  bod trasy (blok typu misto)
 * @returns {{lat: number, lon: number}|null}
 */
export function souradniceBodu(b) {
  if (b.zdroj && b.zdroj.typ === 'pozice') {
    const p = pozice(b.zdroj.id)
    return p ? { lat: p.lat, lon: p.lon } : null
  }
  return Number.isFinite(b.lat) && Number.isFinite(b.lon) ? { lat: b.lat, lon: b.lon } : null
}

/**
 * Existuje v aktivním plánu bod s tímhle druhem? Start a cíl smí být
 * nejvýš jeden na plán – používá se k zašednutí volby v průvodci přidáním
 * bodu. Staré výpravy mohly mít vícenásobný start/cíl už dřív (appka to
 * nezakazovala); tahle kontrola na ně nesahá, jen brání vzniku NOVÝCH.
 * @param {string} druh
 * @returns {boolean}
 */
export const maBod = (druh) => vsechnyBody().some((b) => b.druh === druh)

/**
 * Založí Start nebo Cíl na pevné pozici (začátek/konec celého plánu) –
 * tyhle dva druhy se nedají přetáhnout jinam v itineráři (views/plan/dny.js),
 * takže se vždy zakládají rovnou na kraji, ne tam, kam by mířil výchozí
 * `po`/`den` volajícího místa. `den:1, po:null` řadí na začátek dne 1;
 * `po:null, den:null` řadí na konec plánu – stejný tvar, jaký appka dnes
 * používá pro historické body bez kotvy.
 * @param {'start'|'cil'} druh
 * @param {{nazev?: string, lat?: number|null, lon?: number|null, zdroj?: {typ: 'pozice', id: string}|{typ: 'gps'}|null}} p
 * @returns {string|null} id nového bodu, nebo null když už jeden existuje
 */
export function pridejStartCil(druh, { nazev = '', lat = null, lon = null, zdroj = null } = {}) {
  if (maBod(druh)) return null // volající to má zablokovat dřív (zašedlá volba) – tohle je pojistka
  if (druh === 'start') return pridejBod({ druh, nazev, lat, lon, den: 1, po: null, zdroj })
  return pridejBod({ druh, nazev, lat, lon, den: null, po: null, zdroj })
}

/**
 * Zastávky a body trasy v pořadí, ve kterém appka kreslí trasu na mapě
 * (map/planLine.js#drawPlanLine – stejné proplétání podle `po`/`den`, tady
 * jen pro views, ne pro mapu). Body bez rozpoznatelné polohy (smazaná
 * uložená pozice, „zatím bez polohy“) se PŘESKAKUJÍ – to je zamýšlené
 * chování pro přepočet trasy (views/plan/routing.js), ne chyba: štítek bez
 * lokace appka do routingu prostě nepočítá.
 *
 * Výchozí volání (bez parametrů) je živý plán aktivní výpravy – tak to bylo
 * odjakživa. Parametry existují kvůli otisku ROZJETÉ CESTY
 * (views/plan/routing.js#prepocitejOtiskCesty): `store.cesta.zastavky`/`dny`
 * se od živého `store.plan`/`planDny` za jízdy může lišit (plán se dá dál
 * upravovat). `zahrnoutVlastniBody = false` pro otisk cesty – `map/planLine.js`
 * u otisku vlastní body NEKRESLÍ (`mista = otisk ? [] : vlastniMista()`), takže
 * i tady musí zůstat mimo, jinak by se otisk uloženého přepočtu nikdy neshodl
 * s `otiskBodu(body)` počítaným při kreslení a appka by tiše spadla na
 * vzdušný fallback.
 *
 * @param {string[]} [zastavkyId]  výchozí `store.plan`
 * @param {number[]} [dny]  výchozí `store.planDny`
 * @param {boolean} [zahrnoutVlastniBody]  výchozí `true` (živý plán)
 * @returns {Array<{lat: number, lon: number, id: string, zdroj: {typ:'pozice'|'gps', id?:string}|null}>}
 */
export function serazenaTrasa(zastavkyId = store.plan, dny = store.planDny, zahrnoutVlastniBody = true) {
  const zastavky = zastavkyId.map((id) => S.byId[id]).filter(Boolean)
  const mista = zahrnoutVlastniBody
    ? vsechnyBody()
        .map((b) => {
          const s = souradniceBodu(b)
          return s ? { lat: s.lat, lon: s.lon, id: b.id, po: b.po, den: b.den, zdroj: b.zdroj || null } : null
        })
        .filter(Boolean)
    : []
  const poZastavce = (id) => mista.filter((m) => m.po === id)
  const delky = (dny || []).length ? dny : [zastavky.length]

  const body = []
  let od = 0
  delky.forEach((delka, i) => {
    for (const m of mista) if (!m.po && m.den === i + 1) body.push(m)
    for (const z of zastavky.slice(od, od + delka)) {
      body.push(z)
      body.push(...poZastavce(z.id))
    }
    od += delka
  })
  for (const z of zastavky.slice(od)) {
    body.push(z)
    body.push(...poZastavce(z.id))
  }
  for (const m of mista) if (!m.po && m.den == null) body.push(m)

  return body.map((b) => ({ lat: b.lat, lon: b.lon, id: b.id, zdroj: b.zdroj || null }))
}

/** Součet rozpočtu celého plánu – ukazuje se pod itinerářem. */
export function rozpocetCelkem() {
  let suma = 0
  for (const b of bloky())
    if (b.typ === 'rozpocet') for (const p of b.polozky || []) suma += Number(p.castka) || 0
  return suma
}

/**
 * Najde adresu přes Nominatim (OpenStreetMap). Jediné místo, kde aplikace
 * za běhu volá cizí službu – funguje jen online; bez signálu vyhodí chybu
 * a zbylé tři cesty zadání polohy fungují dál.
 * @param {string} dotaz
 * @returns {Promise<Array<{popisek: string, lat: number, lon: number}>>}
 */
export async function hledejAdresu(dotaz) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=cs&q=${encodeURIComponent(dotaz)}`
  const odpoved = await fetch(url)
  if (!odpoved.ok) throw new Error('Nominatim nedostupný')
  const data = await odpoved.json()
  return data
    .map((x) => ({ popisek: x.display_name, lat: Number(x.lat), lon: Number(x.lon) }))
    .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon))
}

/**
 * Vytáhne souřadnice z vloženého textu.
 *
 * Rozumí odkazům z Google Maps (`@50.08,14.42` i `q=50.08,14.42`), Mapy.cz
 * (`x=14.42&y=50.08` – pozor, x je délka), dvojici desetinných čísel
 * a stupňům-minutám-vteřinám (`50°5'12.3"N 14°25'8"E`).
 *
 * @param {string} text
 * @returns {{lat: number, lon: number}|null}
 */
export function rozpoznejSouradnice(text) {
  const t = (text || '').trim()
  if (!t) return null

  const platne = (lat, lon) =>
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null

  // Google Maps: …/@50.0755,14.4378,12z nebo ?q=50.0755,14.4378
  const google = /[@?&](?:q=)?(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(t)
  if (google) return platne(Number(google[1]), Number(google[2]))

  // Mapy.cz: ?x=14.4378&y=50.0755 – x je DÉLKA, y šířka.
  const mapyX = /[?&]x=(-?\d{1,3}\.\d+)/.exec(t)
  const mapyY = /[?&]y=(-?\d{1,2}\.\d+)/.exec(t)
  if (mapyX && mapyY) return platne(Number(mapyY[1]), Number(mapyX[1]))

  // Stupně-minuty-vteřiny: 50°5'12.3"N 14°25'8"E (vteřiny nepovinné).
  const dms = /(\d{1,2})°(\d{1,2})'(?:([\d.]+)")?\s*([NS])[,\s]+(\d{1,3})°(\d{1,2})'(?:([\d.]+)")?\s*([EW])/i.exec(t)
  if (dms) {
    const lat = (Number(dms[1]) + Number(dms[2]) / 60 + Number(dms[3] || 0) / 3600) * (/s/i.test(dms[4]) ? -1 : 1)
    const lon = (Number(dms[5]) + Number(dms[6]) / 60 + Number(dms[7] || 0) / 3600) * (/w/i.test(dms[8]) ? -1 : 1)
    return platne(lat, lon)
  }

  // Prostá dvojice: 50.0755, 14.4378 (oddělená čárkou, středníkem nebo mezerou).
  const par = /^(-?\d{1,2}[.,]\d+)[\s;,]+(-?\d{1,3}[.,]\d+)$/.exec(t)
  if (par) return platne(Number(par[1].replace(',', '.')), Number(par[2].replace(',', '.')))

  return null
}
