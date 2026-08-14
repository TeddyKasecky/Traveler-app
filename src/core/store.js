/**
 * Stav aplikace a jednoduché oznamování změn.
 *
 * Jediné místo, kde je stav. Ostatní moduly si sem sahají přes `S`, `F`, `store`,
 * `prefs` a `PHOTOS` – žádné další globální proměnné nejsou.
 *
 * Proč pub/sub a ne přímé volání: bez něj by `draw()` z map/ muselo volat
 * `renderList()` z views/, a views/ zase `draw()`. Přidání záložky by pak
 * znamenalo sáhnout do mapy. Takhle stačí složka ve views/ a záznam v routeru.
 */

import { KEY, PKEY, PREFK, DATAK, nacti, uloz, smaz } from './storage.js'
import { nactiFotky, zapisFotku, zahodFotku as zahodFotkuZDb, zapisFotky } from './fotoDb.js'
// Atribut `with { type: 'json' }` vyžaduje Node, když se modul spouští mimo Vite
// (kontrolní skripty ve scripts/). Vite i prohlížeče mu rozumí taky.
import ZAKLAD from '../data/places.json' with { type: 'json' }
import NOVA from '../data/places-nova.json' with { type: 'json' }
import { postavIndex } from './search.js'

/**
 * @typedef {Object} Misto  jedno místo z places.json – popis polí je v data/schema.md
 * @property {string} id
 * @property {string} n
 * @property {string} k
 * @property {number} lat
 * @property {number} lon
 */

/* ================= oznamování změn =================
 *
 * Schválně úplně nahoře: `emit()` volá i zápis do úložiště, který se spouští už
 * při načtení modulu (stěhování dat na nová místa). Kdyby byl tenhle blok dole,
 * sáhlo by se na `posluchaci` dřív, než vůbec vznikne.
 */

/** @type {Map<string, Function[]>} */
const posluchaci = new Map()

/**
 * Přihlásí se k odběru události. Pořadí přihlášení = pořadí volání.
 * @param {string} udalost
 * @param {Function} fn
 */
export function on(udalost, fn) {
  if (!posluchaci.has(udalost)) posluchaci.set(udalost, [])
  posluchaci.get(udalost).push(fn)
}

/**
 * Oznámí událost všem přihlášeným, v pořadí přihlášení.
 * @param {string} udalost
 * @param {unknown} [data]
 */
export function emit(udalost, data) {
  for (const fn of posluchaci.get(udalost) ?? []) fn(data)
}

/* ================= uložená data uživatele ================= */

/** Poznámky, stavy, hodnocení, plán, priority. Klíč `vandrbuch:v1`. */
export const store = nacti(KEY, {
  notes: {},
  stav: {},
  rating: {},
  plan: [],
  /** Délky dnů v plánu, např. [3,2]. Prázdné = plán se na dny nedělí.
   *  Vedle `plan`, ne místo něj – viz views/plan/dny.js. */
  planDny: [],
  prio: {},
  dataOverride: null,
  seen: false,
})

/**
 * Zapíše a při neúspěchu to oznámí událostí `ulozeniSelhalo`.
 *
 * Dřív se návratová hodnota `uloz()` zahazovala. U fotek se kontrolovala, ale
 * u poznámek, hodnocení, plánu a priorit ne – při plné paměti tedy tiše mizely.
 * Na cestě, kde je záloha jediná pojistka, je to ta nejhorší možná chyba.
 *
 * @param {string} klic
 * @param {unknown} data
 * @returns {boolean}
 */
function zapis(klic, data) {
  const v = uloz(klic, data)
  if (!v.ok) emit('ulozeniSelhalo', { klic, plno: v.plno })
  return v.ok
}

/** Čekající odložený zápis, nebo null. Viz `saveOdlozene()`. */
let odlozene = null

/** Zruší čekající odložený zápis – volá se, když se stejně zapisuje hned. */
function zrusOdlozene() {
  if (odlozene === null) return
  clearTimeout(odlozene)
  odlozene = null
}

/** Uloží hned. Případný odložený zápis tím ztrácí smysl, takže se ruší. */
export function save() {
  zrusOdlozene()
  return zapis(KEY, store)
}

/**
 * Uloží, až se na chvíli přestane psát.
 *
 * Psaní poznámky volalo `save()` při každém stisku klávesy a ten pokaždé převedl
 * na text celý store – všechny poznámky, hodnocení, plán i priority. localStorage
 * je k tomu synchronní, takže to na mobilu blokovalo vykreslování.
 *
 * Nedopsané se dopíše při odchodu ze stránky; odběr je v main.js, protože tenhle
 * modul nemá vědět o oknu.
 *
 * @param {number} [prodleva]  ms od posledního stisku
 */
export function saveOdlozene(prodleva = 400) {
  zrusOdlozene()
  odlozene = setTimeout(() => {
    odlozene = null
    zapis(KEY, store)
  }, prodleva)
}

/**
 * Vlastní vyfocené fotky, `{ [id]: dataURL }`.
 *
 * V paměti je to pořád obyčejný objekt, aby ho detail místa mohl přečíst rovnou
 * při vykreslování. Trvale ale bydlí v IndexedDB (viz `core/fotoDb.js`), ne
 * v localStorage – ten má strop 5 MB a fotky v něm dusily poznámky.
 */
export const PHOTOS = {}

/** Ohlásí neúspěšný zápis fotek stejnou cestou jako localStorage. */
function ohlasFotky(v) {
  if (!v.ok) emit('ulozeniSelhalo', { klic: 'fotky', plno: v.plno })
  return v.ok
}

/** Uloží jednu fotku. @returns {Promise<boolean>} */
export const ulozFotku = (id) => zapisFotku(id, PHOTOS[id]).then(ohlasFotky)

/** Zahodí jednu fotku z úložiště. @returns {Promise<boolean>} */
export const zahodFotku = (id) => zahodFotkuZDb(id).then(ohlasFotky)

/** Přepíše všechny fotky naráz. Používá se při obnově ze zálohy. */
export const savePhotos = () => zapisFotky(PHOTOS).then(ohlasFotky)

/**
 * Načte fotky do paměti a přestěhuje je ze starého úložiště.
 *
 * Volá se ze `main.js` při startu. Než doběhne, je `PHOTOS` prázdný – trvá to
 * jednotky milisekund a detail místa se do té doby otevřít nedá, ale kdyby přece,
 * po dokončení se oznámí `fotkyNacteny`.
 *
 * Starý klíč `vandrbuch:photos` se smaže **až když se zápis do IndexedDB povedl**.
 * Kdyby se smazal dřív a zápis selhal, fotky by zmizely úplně.
 */
export async function pripravFotky() {
  Object.assign(PHOTOS, await nactiFotky())

  const stare = nacti(PKEY, {})
  if (Object.keys(stare).length) {
    Object.assign(PHOTOS, stare)
    const v = await zapisFotky(PHOTOS)
    if (v.ok) smaz(PKEY)
  }

  emit('fotkyNacteny')
}

/**
 * Předvolby dashboardu. Klíč `vandrbuch:prefs`.
 *
 * Anglické názvy jsou dědictví původní aplikace a nesmí se přejmenovat – jsou
 * v uložených datech. Nové předvolby se pojmenovávají česky, jako zbytek kódu.
 */
export const prefs = nacti(PREFK, {
  userName: '',
  lastMood: '',
  lastTip: '',
  bpOpen: false,
  moodUse: {},
  /** Kdy se naposled stáhla záloha (ms). 0 = nikdy. */
  posledniZaloha: 0,
  /** Vzhled: 'system' (podle telefonu), 'svetly', 'tmavy'. Viz core/motiv.js. */
  motiv: 'system',
})
export const savePrefs = () => zapis(PREFK, prefs)

/* ================= stav filtrů ================= */

/** Aktuální nastavení filtrů. Mění se na místě, nikdy se nenahrazuje. */
export const F = {
  kat: new Set(),
  q: '',
  reg: '',
  zeme: '',
  typ: '',
  free: false,
  kids: false,
  dogs: false,
  wow: false,
  fire: false,
  stav: '',
  coll: '',
}

/* ================= běhový stav ================= */

export const S = {
  /** @type {Misto[]} aktuálně platná data – vestavěná, nebo z importu CSV */
  places: [],
  /** @type {Record<string, Misto>} */
  byId: {},
  /** @type {{lat:number, lon:number}|null} */
  userPos: null,
  /** @type {string} */
  activeTab: 'home',
  /** @type {string|null} zvýrazněný špendlík na mapě */
  hiId: null,
  /** @type {string[]} id míst vybraných k porovnání. Jen v paměti – není to
   *  uživatelské datum, je to výběr na pár vteřin. */
  porovnani: [],
}

/**
 * Vestavěná data. Drží se stranou kvůli tlačítku „Vrátit vestavěná data“.
 *
 * Skládají se ze dvou souborů. `places.json` je hlavní, `places-nova.json` je
 * malá přihrádka na čerstvě přidaná místa – hlavní soubor má 26 tisíc řádků
 * a vkládat do něj text na mobilu je utrpení. Kontrola i `npm run slouc`
 * pracují s obojím dohromady, takže zdroj pravdy je pořád jeden.
 */
export const VESTAVENA_DATA = [...ZAKLAD, ...NOVA]

/** Přepočítá rejstřík podle id a index pro hledání. */
export function reindex() {
  for (const k in S.byId) delete S.byId[k]
  for (const p of S.places) S.byId[p.id] = p
  postavIndex(S.places)
}

/** Vymění data míst (import CSV nebo návrat k vestavěným). */
export function nastavData(data) {
  S.places = data
  reindex()
}

/* ================= data míst nahraná z CSV ================= */

/**
 * Vlastní data z importu CSV, nebo `null`.
 *
 * Mají vlastní klíč schválně. Dokud ležela v `vandrbuch:v1` u poznámek, měl ten
 * záznam po importu ~565 kB a **každý zápis poznámky přepisoval půl megabajtu**
 * – zdržovalo to a přibližovalo strop úložiště. Teď se přepisují, jen když se
 * data opravdu mění.
 */
const vlastni = nacti(DATAK, { mista: null })

/**
 * Uloží data z importu, nebo je zruší.
 * @param {Array<Record<string, any>>|null} mista  null = zpět k vestavěným
 */
export function ulozVlastniData(mista) {
  vlastni.mista = mista
  return zapis(DATAK, vlastni)
}

// Stěhování ze starého místa. Starý klíč se vyprázdní až po úspěšném zápisu
// na nové – jinak by import CSV zmizel a uživatel by přišel o nahraná data.
if (store.dataOverride) {
  vlastni.mista = store.dataOverride
  if (zapis(DATAK, vlastni)) {
    store.dataOverride = null
    zapis(KEY, store)
  }
}

nastavData(vlastni.mista || VESTAVENA_DATA)
