/**
 * Záznamy debug poznámkovače – číselníky, číslování a zápis do úložiště.
 *
 * PROČ TO VZNIKLO: nápady a chyby se do teď hlásily ústně nebo se dopisovaly
 * do `BUGS.md` až u počítače, tedy dodatečně a bez technického kontextu, ve
 * kterém problém vznikl. Půlka informace se cestou ztratila. Tenhle modul drží
 * data, `views/debug/` je ukazuje a `core/debugExport.js` z nich skládá `.md`
 * pro složku `debug/` v repozitáři.
 *
 * BEZ DOM A BEZ `store.js`. Autor se předává parametrem, ne čte z `prefs` –
 * díky tomu jde celý modul otestovat v čistém Node (`scripts/check-debug.mjs`)
 * bez natažení 745 kB dat míst.
 *
 * `id` ZÁZNAMU SE NIKDY NEMĚNÍ. Odkazuje se na něj v konverzaci s AI,
 * v commit zprávách (`git log -S tadeas-014`) i v rejstříku, který se skládá
 * ze složky `debug/`. Platí pro něj totéž co pro `id` místa a achievementu.
 * Proto se taky autor ptá při PRVNÍM ZÁPISU, ne až při exportu – id vzniká
 * v okamžiku zápisu a nešlo by ho zpětně přejmenovat.
 */

import { DEBUGK, nacti, smaz } from './storage.js'
import { nactiDebugDb, ulozDebugDb } from './debugDb.js'

/** Typy záznamu. `znak` jde do `.md` exportu, `ikona` do appky. */
export const TYPY = [
  { id: 'napad', popisek: 'Nápad', ikona: 'i-spark', znak: '💡' },
  { id: 'bug', popisek: 'Bug', ikona: 'i-brouk', znak: '🐞' },
  { id: 'poznamka', popisek: 'Poznámka', ikona: 'i-quill', znak: '📝' },
]

export const PRIORITY = [
  { id: 'nizka', popisek: 'nízká' },
  { id: 'stredni', popisek: 'střední' },
  { id: 'vysoka', popisek: 'vysoká' },
]

export const STAVY = [
  { id: 'nove', popisek: 'nové' },
  { id: 'resim', popisek: 'řeším' },
  { id: 'hotovo', popisek: 'hotovo' },
  { id: 'zahozeno', popisek: 'zahozeno' },
]

/** Jak často se bug projeví. Jen u typu `bug`. */
export const JAK_CASTO = [
  { id: 'vzdy', popisek: 'vždy' },
  { id: 'obcas', popisek: 'občas' },
  { id: 'jednou', popisek: 'jednou' },
]

/**
 * Části appky, kterých se záznam týká.
 *
 * Odvozené ze skutečného rozdělení kódu (`src/views/`, `src/map/`, `src/data/`,
 * `src/pwa/`, `src/styles/`), ne z toho, jak appka vypadá – smysl seznamu je,
 * aby se z něj dalo poznat, kam se má sáhnout. `vzhled` je jediná položka, která
 * jde napříč obrazovkami; schovat se pod žádnou z nich nedá.
 *
 * `zTabu` je předvyplnění podle toho, odkud byl záznam otevřený – hodnota
 * `S.activeTab`. Vždycky jde přepsat.
 */
export const MODULY = [
  { id: 'domu', popisek: 'Domů', zTabu: 'home' },
  { id: 'mapa', popisek: 'Mapa', zTabu: 'map' },
  { id: 'objevuj', popisek: 'Objevuj', zTabu: 'disc' },
  { id: 'seznam', popisek: 'Seznam', zTabu: 'list' },
  { id: 'detail', popisek: 'Detail místa' },
  { id: 'plan', popisek: 'Plán a Itinerář', zTabu: 'plan' },
  { id: 'nacesta', popisek: 'Na cestě' },
  { id: 'nastaveni', popisek: 'Profil a Nastavení', zTabu: 'profil' },
  { id: 'data', popisek: 'Data a zálohy' },
  { id: 'offline', popisek: 'Offline a PWA' },
  { id: 'vzhled', popisek: 'Vzhled' },
  { id: 'jine', popisek: 'Jiné' },
]

/** Popisek podle id, pro export i pro appku. Neznámé id se vypíše jak je. */
export const popisekModulu = (id) => (MODULY.find((m) => m.id === id) || { popisek: id }).popisek
export const popisekStavu = (id) => (STAVY.find((s) => s.id === id) || { popisek: id }).popisek
export const popisekPriority = (id) => (PRIORITY.find((p) => p.id === id) || { popisek: id }).popisek
export const typZaznamu = (id) => TYPY.find((t) => t.id === id) || TYPY[2]

/**
 * Uložená data. Mutuje se na místě, nikdy se nenahrazuje – stejně jako `store`
 * a `prefs`, aby na ně mohly ostatní moduly držet stabilní referenci.
 *
 * `dalsiCislo` se NIKDY nesnižuje: smazaný záznam své číslo nevrací, jinak by
 * dvě různé věci mohly nést stejné `id`.
 *
 * @type {{dalsiCislo: number, zaznamy: Array<Record<string, any>>}}
 */
export const debugData = { dalsiCislo: 1, zaznamy: [] }

/**
 * Uloží záznamy.
 *
 * Vrací `false`, když se zápis nepovedl – volající to NESMÍ zahodit. Globální
 * pruh `ulozeniSelhalo` se odsud schválně neposílá: ten nabízí zálohu
 * cestovních dat a u debug poznámky by mátl. Formulář místo toho zůstane
 * otevřený a řekne to sám.
 *
 * ASYNCHRONNÍ od srpna 2026 – záznamy bydlí v IndexedDB (`core/debugDb.js`).
 *
 * @returns {Promise<boolean>}
 */
export async function ulozDebug() {
  const v = await ulozDebugDb(debugData)
  return v.ok
}

/**
 * Start: načte záznamy z IndexedDB a přestěhuje, co ještě leží ve starém
 * klíči `vandrbuch:debug` v localStorage.
 *
 * ZE STARÉHO KLÍČE SE MAŽE AŽ PO POTVRZENÉM ZÁPISU – stejné pravidlo jako
 * u fotek, tras a archivu cest. Když se zápis nepovede, zůstane všechno tam,
 * kde bylo, a zkusí se to při příštím startu znovu.
 *
 * Slučuje se, nepřepisuje: v IndexedDB už můžou být novější záznamy (appka
 * mezitím běžela) a starý klíč je jen zbytek.
 *
 * @returns {Promise<number>} kolik se jich přestěhovalo
 */
export async function pripravDebug() {
  const ulozene = await nactiDebugDb()
  if (ulozene) {
    debugData.dalsiCislo = ulozene.dalsiCislo || 1
    debugData.zaznamy = ulozene.zaznamy
  }

  // `dalsiCislo: 0` jako výchozí je rozlišovač: když klíč neexistuje, zůstane
  // nula a stěhovat není co. Prázdný, ale existující klíč se naopak uklidí.
  const stare = nacti(DEBUGK, { dalsiCislo: 0, zaznamy: [] })
  if (!stare.dalsiCislo && !stare.zaznamy.length) return 0

  const { pridano } = slucZaznamy(stare.zaznamy)
  if (stare.dalsiCislo > debugData.dalsiCislo) debugData.dalsiCislo = stare.dalsiCislo
  const v = await ulozDebugDb(debugData)
  if (!v.ok) return 0
  smaz(DEBUGK)
  return pridano
}

/**
 * Převede jméno na identifikátor do `id` záznamu a do názvu souboru.
 *
 * Bez diakritiky a mezer, protože z toho vzniká jméno souboru v gitu
 * (`2026-08-24-1602-tadeas.md`) a odkaz v konverzaci s AI.
 *
 * @param {string} s
 * @returns {string} prázdný vstup dá 'autor'
 */
export function sanitizujAutora(s) {
  const t = String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20)
    .replace(/-+$/, '')
  return t || 'autor'
}

/**
 * Abeceda podpisu zařízení. Bez `i l o 0 1` – `id` se diktuje nahlas
 * a čte z commit zprávy, takže zaměnitelné tvary tam nemají co dělat.
 */
const ZNAKY = 'abcdefghjkmnpqrstuvwxyz23456789'

/**
 * Vyrobí podpis zařízení – tři znaky, které odliší tenhle telefon od ostatních.
 *
 * Náhodně, ne z něčeho o zařízení: user agent ani rozlišení nejsou jedinečné
 * (dva stejné telefony) a fingerprinting sem nepatří. Tři znaky z jedenatřiceti
 * dávají 29 791 možností – při čtyřech zařízeních je šance na shodu 0,02 %,
 * a i ta se pozná okamžitě, protože kolidovat by musela i čísla záznamů.
 *
 * @returns {string}
 */
export function novyPodpisZarizeni() {
  let s = ''
  for (let i = 0; i < 3; i++) s += ZNAKY[Math.floor(Math.random() * ZNAKY.length)]
  return s
}

/**
 * Prefix `id` – jméno autora a podpis zařízení dohromady.
 * Bez podpisu (staré záznamy, testy v čistém Node) zůstane jen jméno.
 *
 * @param {string} autor
 * @param {string} [podpis]
 */
export const prefixId = (autor, podpis = '') =>
  podpis ? `${sanitizujAutora(autor)}-${podpis}` : sanitizujAutora(autor)

/**
 * Přidá záznam a vrátí ho i s doplněným `id`.
 *
 * Neukládá – volající musí zavolat `ulozDebug()` a výsledek ohlásit.
 *
 * @param {Record<string, any>} z  vyplněná pole formuláře
 * @param {string} autor           sanitizovaný identifikátor, viz `sanitizujAutora`
 * @param {number} [ted]           čas vzniku (ms); parametr kvůli testovatelnosti
 * @param {string} [podpis]        podpis zařízení (`prefs.debugZarizeni`)
 */
export function pridejZaznam(z, autor, ted = Date.now(), podpis = '') {
  const a = prefixId(autor, podpis)

  // ČÍTAČ JE RYCHLÁ CESTA, NE JEDINÁ PRAVDA. Kdyby se `dalsiCislo` jakkoli
  // vrátilo – poškozený zápis, ručně upravená záloha, import bez čísel –
  // vyrobil by tenhle řádek `id`, které v seznamu už je. Dva různé záznamy
  // pod jedním `id` jsou to nejhorší, co se tu může stát: rejstřík je spáruje
  // jako jeden a jeden z nich tiše zmizí. Proto se hledá volné.
  const obsazena = new Set(debugData.zaznamy.map((x) => x.id))
  let cislo = debugData.dalsiCislo
  while (obsazena.has(`${a}-${String(cislo).padStart(3, '0')}`)) cislo++
  debugData.dalsiCislo = cislo + 1

  const zaznam = {
    id: `${a}-${String(cislo).padStart(3, '0')}`,
    cislo,
    autor: a,
    typ: z.typ || 'poznamka',
    nadpis: (z.nadpis || '').trim(),
    text: (z.text || '').trim(),
    moduly: Array.isArray(z.moduly) ? [...z.moduly] : [],
    navrh: (z.navrh || '').trim(),
    // Jen u bugu; u ostatních typů zůstávají prázdné a do exportu nejdou.
    cekal: (z.cekal || '').trim(),
    kroky: (z.kroky || '').trim(),
    jakCasto: z.jakCasto || '',
    // Jen u nápadu.
    motivace: (z.motivace || '').trim(),
    hotovoKdyz: (z.hotovoKdyz || '').trim(),
    stav: z.stav || 'nove',
    priorita: z.priorita || 'stredni',
    vytvoreno: ted,
    upraveno: 0,
    /** Název `.md` souboru, ve kterém záznam odešel. Prázdné = ještě neodešel. */
    exportovanoDo: '',
    /**
     * Otisk podoby, ve které záznam odešel, ve tvaru `1:ab12cd34`. Doplní se
     * až při označení „odesláno"; prázdné = nevíme, s čím porovnávat.
     */
    otiskExportu: '',
    /**
     * Kdy appka poprvé viděla záznam v rejstříku. Rozlišuje „nedorazilo do
     * repozitáře" od „zmizelo z repozitáře" – bez toho se obojí hlásilo
     * stejně a u něčeho, co tam nikdy nebylo, to byla lež.
     */
    videnVRepu: 0,
    /**
     * Co o uzavření záznamu řekl repozitář: `{ stav, dne, poznamka }`.
     *
     * Appka si to pamatuje sama, ne jen skrz rejstřík – jinak by zavřený
     * záznam po vypršení lhůty v rejstříku (`debug-rejstrik.mjs`) přeskočil
     * na „zmizelo", což je přesně ta lež, kterou `videnVRepu` odstraňuje.
     */
    zavreno: null,
    kontext: z.kontext || null,
  }
  debugData.zaznamy.push(zaznam)
  return zaznam
}

/**
 * Přepíše pole existujícího záznamu. `id`, `cislo` a `vytvoreno` se nemění.
 * @returns {Record<string, any>|null} upravený záznam, nebo null když neexistuje
 */
export function upravZaznam(id, zmeny, ted = Date.now()) {
  const z = debugData.zaznamy.find((x) => x.id === id)
  if (!z) return null
  for (const [k, v] of Object.entries(zmeny)) {
    if (k === 'id' || k === 'cislo' || k === 'vytvoreno' || k === 'autor') continue
    z[k] = v
  }
  z.upraveno = ted
  return z
}

/** Smaže záznamy podle id. `dalsiCislo` se nesnižuje. @returns {number} kolik jich zmizelo */
export function smazZaznamy(ids) {
  const pryc = new Set(ids)
  const bylo = debugData.zaznamy.length
  debugData.zaznamy = debugData.zaznamy.filter((z) => !pryc.has(z.id))
  return bylo - debugData.zaznamy.length
}

export const najdiZaznam = (id) => debugData.zaznamy.find((z) => z.id === id) || null

/**
 * Záznamy podle filtru, nejnovější první.
 * Prázdná hodnota = filtr se neuplatní.
 */
export function filtrujZaznamy({ typ = '', modul = '', stav = '', priorita = '' } = {}) {
  return debugData.zaznamy
    .filter((z) => (!typ || z.typ === typ) && (!stav || z.stav === stav) && (!priorita || z.priorita === priorita))
    .filter((z) => !modul || (z.moduly || []).includes(modul))
    .slice()
    .sort((a, b) => b.vytvoreno - a.vytvoreno || b.cislo - a.cislo)
}


/**
 * Přidá záznamy z importované zálohy. Existující `id` se NEPŘEPISUJÍ –
 * import je záchrana po přeinstalaci, ne synchronizace; přepsat cizí novější
 * verzi vlastní starší by byla tichá ztráta.
 *
 * ZÁLOHA MŮŽE BÝT POŠKOZENÁ. Je to obyčejný `.json`, který někdo mohl
 * upravit rukou nebo slepit z půlky. Záznam bez `id` nebo bez `nadpis` se
 * proto nevkládá, ale **spočítá** – spolknutý vadný záznam je horší než
 * hlášená chyba, protože se v seznamu objeví jako „undefined" a v exportu
 * vyrobí polámanou hlavičku.
 *
 * @returns {{pridano: number, preskoceno: number, vadne: number}}
 */
export function slucZaznamy(zaznamy) {
  const znam = new Set(debugData.zaznamy.map((z) => z.id))
  let pridano = 0
  let preskoceno = 0
  let vadne = 0
  for (const z of zaznamy || []) {
    if (!z || typeof z.id !== 'string' || !z.id.trim() || !String(z.nadpis || '').trim()) {
      vadne++
      continue
    }
    if (znam.has(z.id)) {
      preskoceno++
      continue
    }
    znam.add(z.id)
    // Chybějící číselníky se doplní výchozími. Bez toho by se záznam
    // vykreslil jako „undefined" a v `.md` vyrobil hlavičku, kterou parser
    // sice přečte, ale se špatnými hodnotami.
    debugData.zaznamy.push({
      ...z,
      typ: typZaznamu(z.typ).id,
      priorita: PRIORITY.some((p) => p.id === z.priorita) ? z.priorita : 'stredni',
      stav: STAVY.some((s) => s.id === z.stav) ? z.stav : 'nove',
      moduly: Array.isArray(z.moduly) ? z.moduly : [],
    })
    pridano++
    // Číslování musí zůstat nad vším, co v seznamu je – jinak by další zápis
    // vyrobil id, které už jednou existovalo. `cislo` v záloze být nemusí
    // (ručně upravený soubor), takže se v nouzi odvodí z `id`.
    const cislo = typeof z.cislo === 'number' ? z.cislo : Number((/-(\d+)$/.exec(z.id) || [])[1])
    if (Number.isFinite(cislo) && cislo >= debugData.dalsiCislo) debugData.dalsiCislo = cislo + 1
  }
  return { pridano, preskoceno, vadne }
}

/**
 * Rozdělí moje záznamy podle toho, jestli už odešly do repozitáře.
 *
 * Cizí (naimportované ze zálohy toho druhého) se nepočítají – poznají se
 * podle `autor`, který nese prefix jejich zařízení.
 *
 * @param {string} prefix  dnešní prefix `id`, viz `prefixId`
 * @returns {{neodeslane: Array<Record<string, any>>, odeslane: Array<Record<string, any>>}}
 */
export function mojeZaznamy(prefix) {
  const moje = debugData.zaznamy.filter((z) => z.autor === prefix)
  return {
    neodeslane: moje.filter((z) => !z.exportovanoDo),
    odeslane: moje.filter((z) => z.exportovanoDo),
  }
}

/**
 * Přepíše prefix `id` u záznamů, které ještě NIKDY neopustily tohle zařízení.
 *
 * JEDINÁ VÝJIMKA Z PRAVIDLA „`id` se nikdy nemění“, a je bezpečná právě tím
 * omezením: na `id`, které nikdy nebylo v exportu, nemůže odkazovat commit,
 * rejstřík ani konverzace – neexistuje mimo tenhle telefon. Odeslaný záznam
 * se nepřejmenuje ani omylem; volající o tom musí říct.
 *
 * Vzniklo proto, že přejmenování autora šlo do srpna 2026 udělat kdykoli
 * a bez varování, takže v telefonu zůstala směs `tadeas-001` a `pc-tadeas-002`
 * podle toho, kdy který záznam vznikl.
 *
 * `cislo` se zachovává – číslování musí zůstat rostoucí.
 *
 * @param {string} staryPrefix
 * @param {string} novyPrefix
 * @returns {number} kolik jich změnilo `id`
 */
export function prejmenujNeodeslane(staryPrefix, novyPrefix) {
  if (!novyPrefix || staryPrefix === novyPrefix) return 0
  let zmeneno = 0
  for (const z of debugData.zaznamy) {
    if (z.autor !== staryPrefix || z.exportovanoDo) continue
    z.autor = novyPrefix
    z.id = `${novyPrefix}-${String(z.cislo).padStart(3, '0')}`
    zmeneno++
  }
  return zmeneno
}

/* ================= otisk: co z toho je na mainu ================= */

/**
 * FNV-1a, osm hexa znaků.
 *
 * Doslova stejná funkce jako `hash()` ve `views/plan/routing.js` a ze stejného
 * důvodu: není to kryptografie a nemá být, jde jen o to poznat na `===`, že se
 * něco změnilo. Kopie schválně – `routing.js` je o trasách a `core/debug.js`
 * o poznámkách, sdílet kvůli osmi řádkům modul by svázalo dvě věci, které
 * spolu nemají nic společného. **Když se jedna změní, druhá o tom vědět
 * nepotřebuje.**
 *
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
 * Verze otisku. Zvedá se, když se změní, co se do něj počítá.
 *
 * Uložené otisky nesou verzi jako prefix (`1:ab12cd34`), takže se dá poznat,
 * který už neplatí. Bez toho by změna algoritmu obarvila všechny záznamy
 * naráz jako změněné a autor by na to koukal jako na chybu appky.
 * Otisky bez prefixu jsou z doby před zavedením verzí, tedy verze 1.
 */
export const VERZE_OTISKU = 1

/**
 * `1:ab12cd34` → `[1, 'ab12cd34']`. Bez prefixu se bere verze 1.
 * @param {string} ulozeny
 * @returns {[number, string]}
 */
export function rozlozOtisk(ulozeny) {
  const m = /^(\d+):(.*)$/.exec(String(ulozeny || ''))
  return m ? [Number(m[1]), m[2]] : [1, String(ulozeny || '')]
}

/**
 * Otisk toho, co ze záznamu jde do `.md` exportu.
 *
 * PROČ TO EXISTUJE: záznam, který se po odeslání upravil, vypadal v seznamu
 * stejně jako neupravený – v repozitáři přitom ležela stará verze a nikdo se
 * to nedozvěděl. Rejstřík (`debug-stav.json`) na porovnání nestačí: `popis`
 * a `navrh` se v něm krátí na 400 znaků a u záznamů uzavřených přes
 * `VYRESENO.md` nenese text vůbec žádný.
 *
 * POČÍTÁ SE I `stav`. V `.md` v repozitáři stojí `stav: nové`, takže když si
 * ho lokálně přepneš na `hotovo`, repozitář opravdu drží něco jiného – a to
 * je přesně to, co má otisk hlásit. Pořadí polí je stejné jako v
 * `debugExport.js#zaznamNaMd()`, ať se to dá porovnat očima.
 *
 * `kontext` v otisku NENÍ: sbírá se jednou při zápisu a nikdy se nemění,
 * takže by do hashe jen přidal práci.
 *
 * @param {Record<string, any>} z
 * @returns {string} osm hexa znaků
 */
export function otiskZaznamu(z) {
  if (!z) return ''
  const casti = [
    z.typ,
    z.priorita,
    z.stav,
    z.nadpis,
    (z.moduly || []).join(','),
    z.text,
    z.cekal,
    z.kroky,
    z.jakCasto,
    z.motivace,
    z.hotovoKdyz,
    z.navrh,
  ]
  // Oddělovač, který se v textu vyskytnout nemůže – při spojení mezerou by
  // přesun slova mezi poli vyšel jako žádná změna.
  return hash(casti.map((c) => String(c == null ? '' : c)).join('\u0000'))
}

/**
 * Liší se záznam od toho, co v jeho podobě odešlo do repozitáře?
 *
 * CHYBĚJÍCÍ OTISK ZNAMENÁ „NEVÍME", NE „NEZMĚNĚNO". Záznamy odeslané před
 * srpnem 2026 `otiskExportu` nemají a nesmí se tvářit jako změněné – strašit
 * u něčeho, co se ověřit nedá, je horší než mlčet.
 *
 * @param {Record<string, any>} z
 * @returns {boolean}
 */
export function zmenenoOdExportu(z) {
  if (!z || !z.exportovanoDo || !z.otiskExportu) return false
  // JEN OTISKY TÉŽE VERZE. Až se změní, co se do otisku počítá, staré
  // uložené hodnoty přestanou dávat smysl – a bez tohohle řádku by se
  // VŠECHNY záznamy naráz obarvily jako změněné. Cizí verze znamená
  // „nevíme", což je stejná odpověď jako u chybějícího otisku.
  const [verze, otisk] = rozlozOtisk(z.otiskExportu)
  if (verze !== VERZE_OTISKU) return false
  return otisk !== otiskZaznamu(z)
}
