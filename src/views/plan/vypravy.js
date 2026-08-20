/**
 * Pojmenované výpravy.
 *
 * Do teď měla aplikace jeden plán bez jména. Předloha `grafika/…11_09_50 (4).png`
 * má panel „Moje výlety" se třemi pojmenovanými trasami a jednou aktivní.
 *
 * DRUHÉ NEJCITLIVĚJŠÍ MÍSTO PŘESTAVBY, hned po dnech. `store.plan` je ploché
 * pole `id` v klíči `vandrbuch:v1`, kde jsou všechna uživatelská data a nikde
 * jinde neexistují. Platí stejné pravidlo jako u dnů: **přidat vedle,
 * nikdy nepřepisovat.**
 *
 *   plan: []          beze změny – zastávky AKTIVNÍ výpravy
 *   planDny: []       beze změny – dny aktivní výpravy
 *   vypravy: []       NOVÉ – odložené výpravy [{ nazev, plan, planDny, slozka?, vytvoreno? }]
 *   vypravaNazev: ''  NOVÉ – název aktivní výpravy, '' znamená „Náš plán"
 *   slozky: []        NOVÉ (srpen 2026) – názvy složek v pořadí, jak vznikly
 *   vypravaSlozka: '' NOVÉ (srpen 2026) – složka aktivní výpravy, '' = nezařazená
 *   vypravaVytvoreno: 0  NOVÉ (srpen 2026) – kdy aktivní výprava vznikla (ms);
 *                     staré záznamy pole nemají a při řazení padají dozadu
 *
 * MIGRACE ŽÁDNÁ: kdo `vypravy` nemá, má jednu výpravu bez názvu – přesně
 * dnešní stav. Při startu se nic nezapisuje. Starší build z cache klíč ignoruje
 * a pracuje dál s `plan`; o odložené výpravy nepřijde, jen je nevidí.
 *
 * PŘEPNUTÍ JE VÝMĚNA NA MÍSTĚ: aktivní výprava si sedne přesně do slotu té,
 * která se aktivuje. Žádné mazání, žádné přidávání, jeden zápis – nemá kde
 * vzniknout okamžik, ve kterém by zastávka neexistovala ani v jednom.
 *
 * SLOŽKA JE ŠTÍTEK NA ZÁZNAMU, ne mapa { název výpravy → složka }: název je
 * křehká identita (přejmenování by výpravu vyhodilo ze složky) a stejná past
 * už jednou klapla u bloků. `store.slozky` drží jen pořadí a to, že složka
 * existuje i prázdná.
 */

import { store, save, prefs } from '../../core/store.js'

/** Jak se jmenuje výprava bez jména. */
export const BEZ_NAZVU = 'Náš plán'

/** Odložené výpravy, vždycky jako pole. Staré uložení klíč nemá. */
const odlozene = () => (Array.isArray(store.vypravy) ? store.vypravy : (store.vypravy = []))

/** Názvy složek, vždycky jako pole. Staré uložení klíč nemá. */
const slozky = () => (Array.isArray(store.slozky) ? store.slozky : (store.slozky = []))

/**
 * Aktivní výprava jako záznam, který se dá odložit. Nese i přepočet trasy
 * (views/plan/routing.js) – ten žije při aktivitě jako store.aktivniPrepocet,
 * v odloženém záznamu jako pole `prepocet`, stejně jako se dnes stěhuje
 * `plan`/`planDny` tam a zpět. `prepocet: undefined` se do JSON.stringify
 * neuloží vůbec, takže staré/prázdné záznamy zůstávají beze změny tvaru.
 */
const aktivniZaznam = () => ({
  nazev: store.vypravaNazev || BEZ_NAZVU,
  plan: store.plan,
  planDny: store.planDny || [],
  slozka: store.vypravaSlozka || '',
  vytvoreno: store.vypravaVytvoreno || 0,
  prepocet: store.aktivniPrepocet || undefined,
})

/**
 * Fantom: prázdný bezejmenný aktivní slot, když žádná jiná výprava není.
 * Je nerozlišitelný od „výpravy Náš plán s nula zastávkami", ale čerstvý
 * uživatel žádnou výpravu nezaložil – a seznam mu nemá jednu vnucovat.
 */
const jenFantom = () =>
  !store.vypravaNazev && !store.plan.length && !(store.planDny || []).length && !odlozene().length

/**
 * Všechny výpravy k vypsání. Aktivní je první; fantom se nevypisuje.
 * @returns {Array<{nazev:string, plan:string[], planDny:number[], slozka:string, aktivni:boolean, index:number}>}
 */
export function seznamVyprav() {
  return [
    ...(jenFantom() ? [] : [{ ...aktivniZaznam(), aktivni: true, index: -1 }]),
    ...odlozene().map((v, i) => ({
      nazev: v.nazev || BEZ_NAZVU,
      plan: Array.isArray(v.plan) ? v.plan : [],
      planDny: Array.isArray(v.planDny) ? v.planDny : [],
      slozka: typeof v.slozka === 'string' ? v.slozka : '',
      vytvoreno: v.vytvoreno || 0,
      aktivni: false,
      index: i,
    })),
  ]
}

/**
 * Řazení pro zobrazení. Data v poli se NIKDY nepřeskládávají (výměna na
 * místě při přepnutí je bezpečnostní záruka) – řadí se až tady, takže se
 * pořadí v knihovně nemění tím, kterou výpravu si člověk zrovna otevřel.
 * `zadne` nechává pořadí pole, `nejnovejsi` řadí staré záznamy bez data dozadu.
 */
const RAZENI = {
  abecedne: (a, b) => a.nazev.localeCompare(b.nazev, 'cs'),
  nejnovejsi: (a, b) => (b.vytvoreno || 0) - (a.vytvoreno || 0),
  zastavky: (a, b) => b.plan.length - a.plan.length,
  zadne: null,
}

const serad = (vypravy) => {
  const fn = RAZENI[prefs.razeniVyprav || 'abecedne']
  return fn ? [...vypravy].sort(fn) : vypravy
}

/**
 * Výpravy seskupené do složek k vypsání: složky v pořadí `store.slozky`
 * (i prázdné – čerstvě založená složka musí být vidět), nezařazené nakonec.
 * Záznam se složkou, která už neexistuje, spadne mezi nezařazené.
 * @returns {Array<{slozka:string, vypravy:ReturnType<typeof seznamVyprav>}>}
 */
export function seznamSlozek() {
  const vsechny = serad(seznamVyprav())
  const znam = new Set(slozky())
  const skupiny = slozky().map((n) => ({ slozka: n, vypravy: vsechny.filter((v) => v.slozka === n) }))
  const mimo = vsechny.filter((v) => !v.slozka || !znam.has(v.slozka))
  if (mimo.length) skupiny.push({ slozka: '', vypravy: mimo })
  return skupiny
}

/**
 * Přepne na odloženou výpravu. Aktivní se odloží na její místo.
 * @param {number} i  pořadí v `store.vypravy`
 * @returns {boolean} false, když se nepovedlo uložit
 */
export function prepniVypravu(i) {
  const sez = odlozene()
  const cil = sez[i]
  if (!cil) return true

  const odchazi = aktivniZaznam()
  store.vypravaNazev = cil.nazev || BEZ_NAZVU
  store.plan = Array.isArray(cil.plan) ? cil.plan : []
  store.planDny = Array.isArray(cil.planDny) ? cil.planDny : []
  store.vypravaSlozka = typeof cil.slozka === 'string' ? cil.slozka : ''
  store.vypravaVytvoreno = cil.vytvoreno || 0
  store.aktivniPrepocet = cil.prepocet || null
  sez[i] = odchazi
  return save()
}

/**
 * Založí novou prázdnou výpravu. Aktivní se odloží na konec.
 *
 * Prázdná aktivní výprava se neodkládá – jinak by se seznam plnil prázdnými
 * záznamy pokaždé, když si člověk rozmyslí, jak ji nazve.
 *
 * @param {string} nazev
 * @returns {boolean}
 */
export function novaVyprava(nazev) {
  if (store.plan.length) odlozene().push(aktivniZaznam())
  store.vypravaNazev = (nazev || '').trim() || BEZ_NAZVU
  store.plan = []
  store.planDny = []
  store.vypravaSlozka = ''
  store.vypravaVytvoreno = Date.now()
  store.aktivniPrepocet = null
  return save()
}

/**
 * Zduplikuje výpravu (i = -1 aktivní) do odložených, včetně bloků.
 * Název dostane příponu „(kopie)" tak, aby byl unikátní – bloky jsou
 * klíčované názvem a stejnojmenné výpravy by je sdílely.
 * @param {number} i  pořadí v `store.vypravy`, -1 pro aktivní
 * @returns {string}  název kopie ('' když není co duplikovat)
 */
export function duplikuj(i) {
  const zdroj = i < 0 ? aktivniZaznam() : odlozene()[i]
  if (!zdroj) return ''
  const puvodni = zdroj.nazev || BEZ_NAZVU
  const nazvy = new Set(seznamVyprav().map((v) => v.nazev))
  let novy = `${puvodni} (kopie)`
  for (let n = 2; nazvy.has(novy); n++) novy = `${puvodni} (kopie ${n})`
  odlozene().push({
    nazev: novy,
    plan: [...(zdroj.plan || [])],
    planDny: [...(zdroj.planDny || [])],
    slozka: zdroj.slozka || '',
    vytvoreno: Date.now(),
  })
  const bloky = store.bloky && store.bloky[puvodni]
  if (Array.isArray(bloky)) store.bloky[novy] = JSON.parse(JSON.stringify(bloky))
  save()
  return novy
}

/**
 * Bloky jsou klíčované názvem výpravy, takže se musí stěhovat s ním – jinak
 * by přejmenování osiřelo zaškrtávací seznamy i vlastní místa. Když pod novým
 * názvem už nějaké bloky jsou (dvě stejnojmenné výpravy je sdílejí), slučuje
 * se – smazat se nesmí nic.
 */
function prestehujBloky(stary, novy) {
  if (stary === novy || !store.bloky || !Array.isArray(store.bloky[stary])) return
  store.bloky[novy] = Array.isArray(store.bloky[novy])
    ? [...store.bloky[novy], ...store.bloky[stary]]
    : store.bloky[stary]
  delete store.bloky[stary]
}

/**
 * Přejmenuje výpravu – aktivní (i = -1) i odloženou – a přestěhuje její bloky.
 * @param {number} i  pořadí v `store.vypravy`, -1 pro aktivní
 * @param {string} nazev
 * @returns {boolean}
 */
export function prejmenuj(i, nazev) {
  const novy = (nazev || '').trim()
  if (i < 0) {
    prestehujBloky(store.vypravaNazev || BEZ_NAZVU, novy || BEZ_NAZVU)
    store.vypravaNazev = novy
    return save()
  }
  const v = odlozene()[i]
  if (!v) return true
  prestehujBloky(v.nazev || BEZ_NAZVU, novy || BEZ_NAZVU)
  v.nazev = novy || BEZ_NAZVU
  return save()
}

/** Přejmenuje aktivní výpravu. Zůstává kvůli stávajícím voláním. */
export function prejmenujVypravu(nazev) {
  return prejmenuj(-1, nazev)
}

/**
 * Smaže výpravu i s jejími zastávkami – aktivní (i = -1) i odloženou.
 * Za smazanou aktivní nastoupí první odložená. Bloky se nechávají být:
 * stejnojmenná výprava by o ně přišla a osiřelý klíč nikomu nevadí.
 * @param {number} i  pořadí v `store.vypravy`, -1 pro aktivní
 * @returns {boolean}
 */
export function smaz(i) {
  const sez = odlozene()
  if (i >= 0) {
    if (!sez[i]) return true
    sez.splice(i, 1)
    return save()
  }
  const dalsi = sez.shift()
  store.vypravaNazev = dalsi ? dalsi.nazev || BEZ_NAZVU : ''
  store.plan = dalsi && Array.isArray(dalsi.plan) ? dalsi.plan : []
  store.planDny = dalsi && Array.isArray(dalsi.planDny) ? dalsi.planDny : []
  store.vypravaSlozka = dalsi && typeof dalsi.slozka === 'string' ? dalsi.slozka : ''
  store.vypravaVytvoreno = (dalsi && dalsi.vytvoreno) || 0
  store.aktivniPrepocet = (dalsi && dalsi.prepocet) || null
  return save()
}

/** Smaže aktivní výpravu. Zůstává kvůli stávajícím voláním. */
export function smazAktivniVypravu() {
  return smaz(-1)
}

/* ================= složky ================= */

/**
 * Založí složku. Prázdný název a duplicita se tiše přeskočí.
 * @param {string} nazev
 * @returns {boolean}
 */
export function novaSlozka(nazev) {
  const n = (nazev || '').trim()
  if (!n || slozky().includes(n)) return true
  slozky().push(n)
  return save()
}

/**
 * Přejmenuje složku všude: v seznamu, na záznamech i u aktivní výpravy.
 * Když nový název už existuje, složky se slijí.
 * @param {string} stara
 * @param {string} nova
 * @returns {boolean}
 */
export function prejmenujSlozku(stara, nova) {
  const n = (nova || '').trim()
  if (!n || n === stara) return true
  const sez = slozky()
  const i = sez.indexOf(stara)
  if (i < 0) return true
  if (sez.includes(n)) sez.splice(i, 1)
  else sez[i] = n
  for (const v of odlozene()) if (v.slozka === stara) v.slozka = n
  if (store.vypravaSlozka === stara) store.vypravaSlozka = n
  return save()
}

/**
 * Smaže složku. Výpravy v ní zůstávají – spadnou mezi nezařazené.
 * @param {string} nazev
 * @returns {boolean}
 */
export function smazSlozku(nazev) {
  const sez = slozky()
  const i = sez.indexOf(nazev)
  if (i < 0) return true
  sez.splice(i, 1)
  for (const v of odlozene()) if (v.slozka === nazev) v.slozka = ''
  if (store.vypravaSlozka === nazev) store.vypravaSlozka = ''
  return save()
}

/**
 * Přesune výpravu do složky ('' = mezi nezařazené). Neznámou složku založí,
 * ať přesun nikdy neskončí v prázdnu.
 * @param {number} i  pořadí v `store.vypravy`, -1 pro aktivní
 * @param {string} slozka
 * @returns {boolean}
 */
export function presunVypravu(i, slozka) {
  const n = (slozka || '').trim()
  if (n && !slozky().includes(n)) slozky().push(n)
  if (i < 0) store.vypravaSlozka = n
  else {
    const v = odlozene()[i]
    if (!v) return true
    v.slozka = n
  }
  return save()
}
