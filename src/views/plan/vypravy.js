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
 *   vypravy: []       NOVÉ – odložené výpravy [{ nazev, plan, planDny }]
 *   vypravaNazev: ''  NOVÉ – název aktivní výpravy, '' znamená „Náš plán"
 *
 * MIGRACE ŽÁDNÁ: kdo `vypravy` nemá, má jednu výpravu bez názvu – přesně
 * dnešní stav. Při startu se nic nezapisuje. Starší build z cache klíč ignoruje
 * a pracuje dál s `plan`; o odložené výpravy nepřijde, jen je nevidí.
 *
 * PŘEPNUTÍ JE VÝMĚNA NA MÍSTĚ: aktivní výprava si sedne přesně do slotu té,
 * která se aktivuje. Žádné mazání, žádné přidávání, jeden zápis – nemá kde
 * vzniknout okamžik, ve kterém by zastávka neexistovala ani v jednom.
 */

import { store, save } from '../../core/store.js'

/** Jak se jmenuje výprava bez jména. */
export const BEZ_NAZVU = 'Náš plán'

/** Odložené výpravy, vždycky jako pole. Staré uložení klíč nemá. */
const odlozene = () => (Array.isArray(store.vypravy) ? store.vypravy : (store.vypravy = []))

/** Aktivní výprava jako záznam, který se dá odložit. */
const aktivniZaznam = () => ({
  nazev: store.vypravaNazev || BEZ_NAZVU,
  plan: store.plan,
  planDny: store.planDny || [],
})

/**
 * Všechny výpravy k vypsání. Aktivní je první.
 * @returns {Array<{nazev:string, plan:string[], planDny:number[], aktivni:boolean, index:number}>}
 */
export function seznamVyprav() {
  return [
    { ...aktivniZaznam(), aktivni: true, index: -1 },
    ...odlozene().map((v, i) => ({
      nazev: v.nazev || BEZ_NAZVU,
      plan: Array.isArray(v.plan) ? v.plan : [],
      planDny: Array.isArray(v.planDny) ? v.planDny : [],
      aktivni: false,
      index: i,
    })),
  ]
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
  return save()
}

/**
 * Přejmenuje aktivní výpravu.
 * @param {string} nazev
 * @returns {boolean}
 */
export function prejmenujVypravu(nazev) {
  store.vypravaNazev = (nazev || '').trim()
  return save()
}

/**
 * Smaže aktivní výpravu i s jejími zastávkami a přepne na první odloženou.
 *
 * Maže se jen aktivní: co člověk zrovna nevidí, se smazat nedá. Kdo chce
 * zrušit odloženou, přepne se na ni a uvidí, o co přijde.
 *
 * @returns {boolean}
 */
export function smazAktivniVypravu() {
  const sez = odlozene()
  const dalsi = sez.shift()
  store.vypravaNazev = dalsi ? dalsi.nazev || BEZ_NAZVU : ''
  store.plan = dalsi && Array.isArray(dalsi.plan) ? dalsi.plan : []
  store.planDny = dalsi && Array.isArray(dalsi.planDny) ? dalsi.planDny : []
  return save()
}
