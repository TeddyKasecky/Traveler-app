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
  /** Odložené výpravy [{nazev, plan, planDny, slozka?}]. Aktivní zůstává v `plan`. */
  vypravy: [],
  /** Název aktivní výpravy. Prázdný = „Náš plán“. Viz views/plan/vypravy.js. */
  vypravaNazev: '',
  /**
   * Názvy složek výprav v pořadí, jak vznikly. Složka je jen štítek:
   * kam výprava patří, si nese každý záznam sám v poli `slozka` – mapa
   * podle názvu výpravy by se rozbila přejmenováním (název je křehká
   * identita, viz `bloky`). Viz views/plan/vypravy.js.
   */
  slozky: [],
  /** Složka aktivní výpravy. Prázdná = nezařazená. */
  vypravaSlozka: '',
  /** Kdy aktivní výprava vznikla (ms). 0 = starý záznam bez data. */
  vypravaVytvoreno: 0,
  /**
   * Termín aktivní výpravy – OBOJE NEPOVINNÉ (srpen 2026).
   *
   *   vypravaOd: 'YYYY-MM-DD' nebo '' … kdy vyrážíme
   *   vypravaDnu: number nebo 0       … na kolik dní
   *
   * Prázdné je platný stav a nesmí nikde svítit jako nedodělek: „jsme páni
   * svého času" znamená, že termín člověk často nezná a znát nemusí. Když
   * ale vyplní, postaví se z toho rovnou kostra dnů, dopočítá se datum
   * každého dne a naváže se na něj předpověď počasí.
   *
   * Datum jako 'YYYY-MM-DD', ne timestamp: cesta je o kalendářních dnech,
   * ne o okamžicích, a timestamp by se posouval podle časové zóny.
   */
  vypravaOd: '',
  vypravaDnu: 0,
  /**
   * Probíhající cesta, nebo null. Viz views/plan/cesta.js.
   *
   * Čas se NIKDE NETIKÁ – počítá se vždy znovu z `zacatek` a součtu pauz,
   * takže přežije zavření aplikace i restart telefonu. `zastavky` je otisk
   * plánu v okamžiku vyjetí: úprava plánu za jízdy cestu nerozbije.
   *
   *   { nazev, zacatek, zastavky: [id], dny: [délky], pauzy: [{od, do}],
   *     pauzaOd: null|ms, odznacene: {id: ms}, poznamky: {id: text},
   *     poznamka: '', ziskane: [id achievementů] }
   */
  cesta: null,
  /** Ukončené cesty, nejnovější první. Souhrny počítá `ukonciCestu()`. */
  cesty: [],
  /**
   * Vlastní bloky v plánech: poznámky, zaškrtávací seznamy, vlastní místa,
   * odkazy a rozpočty. Viz views/plan/bloky.js. Klíčované názvem výpravy,
   * protože výpravy vlastní id nemají a název je jejich klíč i jinde.
   */
  bloky: {},
  /**
   * Wishlist míst na výpravu, která ještě nejsou v trase: { [název]: [id] }.
   * Klíčovaný názvem výpravy jako `bloky`. Viz views/plan/kosik.js.
   */
  kosik: {},
  /**
   * Kotvy výprav: { [název]: [{ id, odeDne, doDne }] }. Jediný závazek
   * v jinak volné cestě – „do bikeparku mezi 3. a 5. dnem". Klíčované
   * názvem výpravy jako `kosik`. Viz views/plan/kosik.js.
   */
  kotvy: {},
  /** Získané profilové achievementy: { [id]: ms }. Viz plan/achievementy.js. */
  achievementy: {},
  /**
   * Vlastní pojmenované pozice z profilu (Domov, Práce...), neomezený počet.
   * Vlastní `id` – odkazují se z bodů trasy (start/cíl), takže přejmenování
   * nebo posun na mapě se promítne všude, kde je pozice použitá. Viz
   * core/pozice.js.
   *   [{ id, nazev, lat, lon, vytvoreno }]
   */
  ulozenePozice: [],
  /**
   * Poslední přepočet trasy AKTIVNÍ výpravy z Mapy.com Routing API, nebo null.
   * Odložené výpravy nesou svůj přepočet přímo na svém záznamu ve `vypravy`
   * (pole `prepocet`) – jsou to samostatné objekty, nepotřebují klíčovanou mapu.
   *
   *   { otisk, polyline: [[lat,lon]...], vzdalenostKm, casMin, spocitanoV }
   *
   * `otisk` je otisk seznamu bodů z okamžiku přepočtu (views/plan/routing.js
   * #otiskBodu) – porovnáním s aktuálním otiskem appka pozná zastaralost.
   * Zastaralý výsledek SE NEMAŽE (fallback na vzdušný odhad), jen se
   * nenabízí jako platný. Viz views/plan/routing.js.
   */
  aktivniPrepocet: null,
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
  /**
   * Podklad mapy: 'dlazdice' (výchozí – běžná mapa z OpenStreetMap) nebo
   * 'malovany' (offline mapa podle grafických předloh, bez sítě).
   */
  podklad: 'dlazdice',
  /**
   * Čím se kreslí offline mapa: 'stazena' (malovaná ze staženého balíku) nebo
   * 'zjednodusena' (obrysy, města a reliéf, které jsou přímo v aplikaci).
   *
   * Výchozí je 'stazena', ale samo o sobě to nic neznamená – dokud balík
   * v telefonu není, `map/podklad.js` stejně nemá co kreslit a nastoupí
   * zjednodušená. Přepíná se v Nastavení.
   */
  offlineMapa: 'stazena',
  /**
   * Typ dopravy pro přepočet trasy přes Mapy.com Routing API
   * (views/plan/routing.js). Mapy.com podporuje: 'car_fast' (výchozí),
   * 'car_fast_traffic', 'car_short', 'foot_fast', 'foot_hiking',
   * 'bike_road', 'bike_mountain' – appka v Nastavení nabízí jen tři
   * nejběžnější (auto/kolo/pěšky), zbytek jde přidat stejným vzorem.
   */
  routeType: 'car_fast',
  /**
   * Hustota kreseb krajiny na malované mapě: 'vypnute', 'stridme', 'huste'.
   *
   * Mění se tím jen cílová rozteč, se kterou se kresby sypou z masky
   * (`map/kresby.js`), takže je to okamžité a nic se nedostahuje.
   */
  kresby: 'huste',
  /**
   * Kterým autem se jezdí po mapě – jméno souboru z `src/assets/auta/`.
   * Vybírá se v Profilu; prázdné znamená výchozí dodávku.
   */
  auto: '',
  /**
   * Viděl už uživatel kartu výpravy na Mapě?
   *
   * Karta se ukáže **jen při úplně prvním otevření Mapy**, aby se vědělo, že
   * existuje. Pak už Mapa startuje vždycky se sbalenou kartou a bublinou –
   * mapa má být co největší. Vytažení během používání se schválně nepamatuje;
   * je to jednorázové nahlédnutí, ne nastavení.
   *
   * Zapisuje se až při otevření Mapy, ne při startu aplikace.
   *
   * (Nahradilo `mapaSbaleno` ze 17. 8. 2026, které sbalovalo kartu i uložená
   * místa naráz. Uložená hodnota nikomu nevadí, jen se přestala číst.)
   */
  vypravaPredstavena: false,
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
  /**
   * Rychlé filtry „moje věci“ nad mapou. Nejsou v původní aplikaci.
   *
   * `ulozene` je opravdu uložené srdcem, na rozdíl od `stav: 'wish'`, které
   * z originálu znamená „všechno kromě navštíveného“. Viz `core/filters.js`.
   */
  ulozene: false,
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
  /**
   * Index do `store.cesty` ukončené cesty otevřené z knihovny Výprav,
   * nebo null. Jen v paměti – po restartu se knihovna otevře znovu na
   * výpravách, ne na archivu (srpen 2026). Aktivace výpravy i vyjetí
   * tenhle ukazatel nulují – trasa na mapě smí kreslit jen jedno z obojího.
   */
  otevrenaCesta: null,
  /**
   * Živě sledovaná poloha na kartě Na cestě, nebo null. Viz
   * views/plan/cesta-zivot.js. NENÍ totéž jako `userPos` výše – ten je
   * jednorázové „kde jsem“ tlačítko na mapě a zůstává po zjištění, tohle
   * se sleduje `watchPosition` jen na popředí a má přestat aktualizovat,
   * jakmile appka zajde na pozadí. Jen v paměti, nic se neukládá.
   * @type {{lat:number, lon:number}|null}
   */
  zivaPoloha: null,
  /**
   * Mód mapy: 'plna' (výchozí – Itinerář, živý `store.plan` i za jízdy) nebo
   * 'nacesta' (otisk aktivní cesty – `store.cesta`). Přepíná levá část
   * tlačítka u #podkladBtn (components/chip.js), dostupná jen když
   * `store.cesta` existuje – bez jízdy nemá co přepínat, appka kreslí vždy
   * živý plán. Řídí JEN zdroj trasy v `drawPlanLine()` (map/planLine.js) –
   * viditelnost běžných špendlíků řídí nezávisle `S.mistaSkryta` níž. Jen
   * v paměti – nepřežívá restart, ukončení/zrušení cesty ho vrací na 'plna'
   * (views/plan/cesta.js).
   */
  mapaMod: 'plna',
  /**
   * Skrytá běžná místa na mapě (580 špendlíků) – nezávislé na `S.mapaMod`.
   * Přepíná pravá (oko) část tlačítka u #podkladBtn (components/chip.js).
   * Funguje vždy, i bez aktivní cesty – na rozdíl od `S.mapaMod`, který má
   * smysl jen za jízdy. Jen v paměti, nepřežívá restart.
   */
  mistaSkryta: false,
  /**
   * Id míst z aktuálních tipů „Co dál?" (views/plan/kosikView.js#tipyOdsud()),
   * zapisuje views/plan/cesta.js#coDal() při každém vykreslení karty Na cestě.
   * map/map.js#draw() ho čte, aby tahle místa zůstala vidět i v módu
   * S.mistaSkryta (oko) – mapa nesmí importovat views/, proto se předává přes
   * store jako čistá data, ne přímým importem tipyOdsud(). Jen v paměti,
   * nepřežívá restart – tipy jsou stejně platné jen pro aktuální polohu/otisk.
   */
  coDalId: [],
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
