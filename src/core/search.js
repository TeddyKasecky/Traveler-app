/**
 * Fulltext přes místa.
 *
 * ZMĚNA PROTI PŮVODNÍ APLIKACI (odsouhlaseno): hledání teď nebere ohled na
 * diakritiku. Dřív se jen převedlo na malá písmena, takže „soutesky“ nenašlo
 * „Soutěsky“. Nově se z obou stran odstraní háčky a čárky.
 *
 * Prohledávají se pole:
 *   n (název) · z (země) · r (oblast) · t (typ) · p (praktické info) ·
 *   f (zajímavost) · sh (krátký popis, N7)
 *
 * Text se předpočítá jednou při načtení dat, ne při každém stisku klávesy.
 */

/**
 * Kombinující znaky diakritiky (U+0300–U+036F), které po NFD zbudou nad písmeny.
 * Regulární výraz se skládá z řetězce schválně: kdyby byly ty znaky v souboru
 * napsané přímo, byly by neviditelné a každý editor by si je mohl přerovnat.
 */
const DIAKRITIKA = new RegExp('[\\u0300-\\u036f]', 'g')

/** @type {Map<string, string>} id místa → předpočítaný text bez diakritiky */
const index = new Map()

/**
 * Malá písmena a pryč s diakritikou.
 * NFD rozloží „ě“ na „e“ + háček, druhý krok háčky zahodí.
 * @param {string} s
 * @returns {string}
 */
export function bezDiakritiky(s) {
  return (s || '').normalize('NFD').replace(DIAKRITIKA, '').toLowerCase()
}

/**
 * Postaví index pro hledání. Volá se z reindex() při každé výměně dat.
 * @param {Array<Record<string, unknown>>} places
 */
export function postavIndex(places) {
  index.clear()
  for (const p of places) {
    index.set(p.id, bezDiakritiky(`${p.n} ${p.z} ${p.r} ${p.t} ${p.p} ${p.f || ''} ${p.sh || ''}`))
  }
}

/**
 * Odpovídá místo hledanému výrazu?
 * @param {{id:string}} p
 * @param {string} dotaz  už převedený přes bezDiakritiky()
 * @returns {boolean}
 */
export function sedi(p, dotaz) {
  if (!dotaz) return true
  return (index.get(p.id) ?? '').includes(dotaz)
}
