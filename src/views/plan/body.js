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

import { store, save } from '../../core/store.js'
import { BEZ_NAZVU } from './vypravy.js'

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
 * @param {{druh?: string, nazev?: string, lat?: number|null, lon?: number|null, den?: number|null, po?: string|null}} p
 */
export function pridejBod({ druh = 'vlastni', nazev = '', lat = null, lon = null, den = null, po = null }) {
  const id = noveId()
  zapis([...bloky(), { id, typ: 'misto', den, po, druh, nazev, lat, lon, poznamka: '', hotovo: 0 }])
  return id
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
