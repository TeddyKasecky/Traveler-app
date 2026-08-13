/**
 * Obal nad localStorage.
 *
 * Klíče se nesmí měnit – jsou v nich poznámky, hodnocení, plán a fotky, které
 * uživatel nasbíral. Kdyby se přejmenovaly, o všechno by přišel.
 *
 * Migrace zatím žádná není potřeba: tvar dat pod všemi třemi klíči zůstává
 * stejný jako v původní aplikaci. Kdyby někdy byla, patří sem.
 */

export const KEY = 'vandrbuch:v1'
export const PKEY = 'vandrbuch:photos'
export const PREFK = 'vandrbuch:prefs'

/**
 * Načte hodnotu a doplní ji do výchozího objektu.
 * Poškozený nebo chybějící záznam tiše vrátí výchozí stav – přesně jako dřív.
 *
 * @template T
 * @param {string} klic
 * @param {T} vychozi  mutuje se a vrací (kvůli tomu, aby ostatní moduly mohly
 *                     držet stabilní referenci na objekt stavu)
 * @returns {T}
 */
export function nacti(klic, vychozi) {
  try {
    const s = localStorage.getItem(klic)
    if (s) Object.assign(vychozi, JSON.parse(s))
  } catch {
    /* rozbitý JSON nebo zakázané úložiště – zůstane výchozí stav */
  }
  return vychozi
}

/**
 * Uloží hodnotu. Vrací false, když se to nepovedlo (typicky plná paměť).
 * @param {string} klic
 * @param {unknown} data
 * @returns {boolean}
 */
export function uloz(klic, data) {
  try {
    localStorage.setItem(klic, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}
