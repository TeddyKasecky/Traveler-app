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
  const cislo = debugData.dalsiCislo
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

/** Co ještě není odbyté. Rozsah exportu „nevyřešené". */
export const nevyresene = () => debugData.zaznamy.filter((z) => z.stav !== 'hotovo' && z.stav !== 'zahozeno')

/**
 * Přidá záznamy z importované zálohy. Existující `id` se NEPŘEPISUJÍ –
 * import je záchrana po přeinstalaci, ne synchronizace; přepsat cizí novější
 * verzi vlastní starší by byla tichá ztráta.
 *
 * @returns {{pridano: number, preskoceno: number}}
 */
export function slucZaznamy(zaznamy) {
  const znam = new Set(debugData.zaznamy.map((z) => z.id))
  let pridano = 0
  let preskoceno = 0
  for (const z of zaznamy || []) {
    if (!z || !z.id) continue
    if (znam.has(z.id)) {
      preskoceno++
      continue
    }
    znam.add(z.id)
    debugData.zaznamy.push(z)
    pridano++
    // Číslování musí zůstat nad vším, co v seznamu je – jinak by další zápis
    // vyrobil id, které už jednou existovalo.
    if (typeof z.cislo === 'number' && z.cislo >= debugData.dalsiCislo) debugData.dalsiCislo = z.cislo + 1
  }
  return { pridano, preskoceno }
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
