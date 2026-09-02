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

import { store, S, save } from '../store.js'
import { BEZ_NAZVU, seznamVyprav } from './vypravy.js'
import { pozice } from '../pozice.js'

/** Klíč aktivní výpravy v `store.bloky`. */
const klic = () => store.vypravaNazev || BEZ_NAZVU

/**
 * Bloky výpravy, vždycky pole. Bez parametru ty aktivní.
 *
 * `nazev` potřebuje karta Na cestě: bloky se klíčují názvem výpravy, takže
 * po přepnutí výpravy za jízdy by cesta ukazovala cizí body. Ta jede pod
 * `store.cesta.nazev` a čte si je pod ním.
 * @param {string|null} [nazev]
 */
export function bloky(nazev = null) {
  if (!store.bloky || typeof store.bloky !== 'object') store.bloky = {}
  return store.bloky[nazev || klic()] || []
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

/**
 * Body trasy (bloky typu misto), které jsou opravdu V TRASE.
 *
 * Bod odložený do košíku má `vKosiku: 1` a v trase být nemá – je to nápad,
 * ne zastávka. Staré bloky pole nemají, takže se chovají přesně jako dřív.
 */
export const vsechnyBody = (nazev = null) => bloky(nazev).filter((b) => b.typ === 'misto' && !b.vKosiku)

/**
 * Kolik bodů trasy má která výprava. ČISTÉ ČTENÍ – nikam se nic nezapisuje.
 *
 * PROČ TADY A NE V NASTAVENÍ: filtr musí být přesně týž jako u `vsechnyBody()`
 * (typ `misto`, bez odložených v košíku). Kdyby si ho Nastavení spočítalo samo,
 * do měsíce by se obě čísla rozešla – stejný důvod, proč je registr sekcí Domů
 * jeden a čtou ho dva.
 *
 * MEDIÁN JEN Z VÝPRAV, KTERÉ ASPOŇ JEDEN BOD MAJÍ, a vedle něj jejich počet.
 * Ze všech výprav by ho pár prázdných stáhlo na nulu i ve chvíli, kdy se body
 * zakládají – tedy přesně tam, kde se ptáme, jestli jich není moc. Prázdná
 * výprava je v seznamu dál vidět jako nula; jen do mediánu nemluví.
 * @returns {{polozky: Array<{nazev: string, pocet: number}>, median: number, sBodem: number}}
 */
export function bodyNaVypravu() {
  const polozky = seznamVyprav().map((v) => ({ nazev: v.nazev, pocet: vsechnyBody(v.nazev).length }))
  const s = polozky.filter((p) => p.pocet > 0).map((p) => p.pocet).sort((a, b) => a - b)
  // U SUDÉHO POČTU SE NEZAOKROUHLUJE. Do srpna 2026 tu bylo `Math.round()`,
  // takže z hodnot 1 a 2 vycházely 2 – medián se posouval nahoru a tvrdil,
  // že se bodů zakládá víc, než se zakládá. Půlka je platná odpověď a jiná
  // než celé číslo z toho vyjít nemůže (vždycky .0 nebo .5).
  const median = !s.length
    ? 0
    : s.length % 2
      ? s[(s.length - 1) / 2]
      : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
  return { polozky, median, sBodem: s.length }
}

/**
 * Vlastní body odložené v košíku aktivní výpravy.
 *
 * PROČ VŮBEC: košík do srpna 2026 uměl jen `id` míst z `places.json`, takže
 * vlastní místo (kemp u známých, parkoviště pod ferratou) se muselo rovnou
 * zařadit do dne – tedy plánovat dřív, než bylo co plánovat. Přitom je to
 * přesně ten druh bodu, u kterého člověk nejdřív neví kdy.
 */
export const bodyVKosiku = () => bloky().filter((b) => b.typ === 'misto' && b.vKosiku)

/**
 * Přesune bod z košíku do trasy, nebo naopak zpátky do košíku.
 *
 * Do trasy: zmizí `vKosiku` a nastaví se `den`/`po`. Do košíku: naopak.
 * Kotvení se přitom zahazuje – bod v košíku pořadí nemá, to je celý smysl.
 *
 * @param {string} id  id bloku
 * @param {{doKosiku?: boolean, den?: number|null, po?: string|null}} kam
 * @returns {boolean} výsledek uložení
 */
export function prehodBod(id, { doKosiku = false, den = null, po = null } = {}) {
  const b = bloky().find((x) => x.id === id)
  if (!b || b.typ !== 'misto') return false
  if (doKosiku) {
    b.vKosiku = 1
    b.den = null
    b.po = null
  } else {
    delete b.vKosiku
    b.den = po ? null : den
    b.po = po
  }
  return save()
}

/**
 * Založí bod trasy. Vrací jeho id.
 *
 * `zdroj` říká, odkud se bere poloha, když nejde o ruční/pevný zápis do
 * `lat`/`lon`: `{typ:'pozice', id}` odkazuje na core/pozice.js (úprava
 * pozice v profilu se pak promítne všude, kde je použitá – odkazem, ne
 * kopií), `{typ:'gps'}` znamená "aktuální poloha v okamžiku PŘEPOČTU trasy"
 * (views/plan/routing.js), ne trvale uložený bod. Čti přes souradniceBodu().
 * `vKosiku` zakládá bod rovnou v košíku – bez dne a bez pořadí. Pole se
 * u běžných bodů vůbec nezapisuje, ať se staré a nové bloky nerozejdou.
 *
 * @param {{druh?: string, nazev?: string, lat?: number|null, lon?: number|null, den?: number|null, po?: string|null, zdroj?: {typ: 'pozice', id: string}|{typ: 'gps'}|null, vKosiku?: boolean}} p
 */
export function pridejBod({ druh = 'vlastni', nazev = '', lat = null, lon = null, den = null, po = null, zdroj = null, vKosiku = false }) {
  const id = noveId()
  const bod = { id, typ: 'misto', den, po, druh, nazev, lat, lon, poznamka: '', hotovo: 0, zdroj }
  if (vKosiku) {
    bod.vKosiku = 1
    bod.den = null
    bod.po = null
  }
  zapis([...bloky(), bod])
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
 * upravovat) a její bloky se čtou pod `store.cesta.nazev`.
 *
 * TŘETÍ PARAMETR JE SEZNAM BODŮ, ne přepínač. Do srpna 2026 to byl boolean
 * a otisk cesty se počítal BEZ vlastních bodů, protože je `map/planLine.js`
 * u otisku vůbec nekreslil. Trasa cesty tak vedla jen mezi zastávkami
 * z databáze a nocleh ani start na ní nebyly – přitom právě přes ně se
 * jede. Teď je kreslí obojí a otisk se počítá ze stejné množiny.
 *
 * @param {string[]} [zastavkyId]  výchozí `store.plan`
 * @param {number[]} [dny]  výchozí `store.planDny`
 * @param {Array<object>} [body]  bloky typu misto; `[]` = jen zastávky
 * @returns {Array<{lat: number, lon: number, id: string, zdroj: {typ:'pozice'|'gps', id?:string}|null}>}
 */
export function serazenaTrasa(zastavkyId = store.plan, dny = store.planDny, body = vsechnyBody()) {
  return serazenePolozky(zastavkyId, dny, body)
    .map((x) => {
      if (x.typ === 'zastavka') return { lat: x.p.lat, lon: x.p.lon, id: x.p.id, zdroj: null }
      const s = souradniceBodu(x.b)
      return s ? { lat: s.lat, lon: s.lon, id: x.b.id, zdroj: x.b.zdroj || null } : null
    })
    .filter(Boolean)
}

/**
 * Zastávky a body v pořadí trasy, ale S TYPEM a s dnem – pro vykreslení.
 *
 * PROČ VEDLE `serazenaTrasa()`: ta vrací holé souřadnice pro routing a body
 * bez polohy zahazuje. Vykreslení potřebuje opak – vědět, co je zastávka
 * a co bod, a bod bez polohy ukázat taky („polohu doplním, až budu vědět"
 * je platný stav). `serazenaTrasa()` je od srpna 2026 jen mapování téhle
 * funkce, takže se pořadí počítá na JEDNOM místě místo tří.
 *
 * Karta Na cestě si sem posílá vlastní `body` (bloky pod `store.cesta.nazev`)
 * a otisk cesty místo živého plánu.
 *
 * @param {string[]} [zastavkyId]  výchozí `store.plan`
 * @param {number[]} [dny]  výchozí `store.planDny`
 * @param {Array<object>} [body]  bloky typu misto; výchozí ty aktivní výpravy
 * @returns {Array<{typ:'zastavka'|'bod', p?:object, b?:object, den:number}>}
 */
export function serazenePolozky(zastavkyId = store.plan, dny = store.planDny, body = vsechnyBody()) {
  const zastavky = zastavkyId.map((id) => S.byId[id]).filter(Boolean)
  const poZastavce = (id) => body.filter((b) => b.po === id)
  const delky = (dny || []).length ? dny : [zastavky.length]

  const out = []
  let od = 0
  delky.forEach((delka, i) => {
    const den = i + 1
    for (const b of body) if (!b.po && b.den === den) out.push({ typ: 'bod', b, den })
    for (const z of zastavky.slice(od, od + delka)) {
      out.push({ typ: 'zastavka', p: z, den })
      for (const b of poZastavce(z.id)) out.push({ typ: 'bod', b, den })
    }
    od += delka
  })

  // Co se nevešlo do rozdělení, padá do posledního dne – stejné pravidlo
  // jako v `dnyPlanu()`, takže se zastávka nemůže ztratit.
  const posledni = delky.length
  for (const z of zastavky.slice(od)) {
    out.push({ typ: 'zastavka', p: z, den: posledni })
    for (const b of poZastavce(z.id)) out.push({ typ: 'bod', b, den: posledni })
  }
  // Historické body bez kotvy (po i den prázdné) patří na konec plánu.
  for (const b of body) if (!b.po && b.den == null) out.push({ typ: 'bod', b, den: posledni })

  return out
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
