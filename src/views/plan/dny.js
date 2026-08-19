/**
 * Rozdělení plánu na dny.
 *
 * NEJCITLIVĚJŠÍ MÍSTO CELÉHO REDESIGNU: `store.plan` je ploché pole `id`
 * v klíči `vandrbuch:v1`, kde jsou všechna uživatelská data a nikde jinde
 * neexistují. Klíč se nesmí měnit a nesmí se stát, že se zastávka ztratí.
 *
 * ŘEŠENÍ: přidat vedle, nikdy nepřepisovat.
 *
 *   plan: []      beze změny – pořadí i členství zastávek
 *   planDny: []   NOVÉ – počty zastávek po dnech. [3,2] = Den 1 první tři,
 *                 Den 2 zbytek.
 *
 * PROČ POČTY, A NE MAPA `id → den`: `plan` zůstává jediným zdrojem pravdy
 * o tom, které zastávky v plánu jsou a v jakém pořadí. Kdyby dny byly seznamy
 * `id`, mohla by po obnově ze zálohy vzniknout zastávka, která není v žádném
 * dni – a tiše by z plánu zmizela. S počty to nejde: `dnyPlanu()` přebytek
 * vždycky přiřkne poslednímu dni.
 *
 * MIGRACE ŽÁDNÁ: chybějící `planDny` znamená „všechno první den“. Nikde se
 * při startu nic nezapisuje, takže není ani šance ztratit data při plné paměti.
 * Starší build z cache klíč ignoruje a s `plan` pracuje dál; co v něm přidá,
 * nový build příště přiřkne poslednímu dni.
 */

import { store, save } from '../../core/store.js'

/**
 * Plán rozdělený na dny, jako pole polí `id`.
 *
 * Opravuje nesoulad na místě a **nikdy nezapisuje** – čte se při každém
 * překreslení a zápis při čtení je cesta, jak si rozbít data.
 *
 * @returns {string[][]}
 */
export function dnyPlanu() {
  const n = store.plan.length
  // Nula je platná délka – prázdný den (srpen 2026). Dřív se zahazovala
  // a „Přidat den" bylo od druhého kliknutí tiché nic: prázdný den se nedal
  // ani zapsat, ani zobrazit. Záporné a nečíselné délky se přeskakují dál.
  const delky = (store.planDny || []).map(Number).filter((x) => Number.isFinite(x) && x >= 0)

  const out = []
  let i = 0
  for (const d of delky) {
    if (i > n || (i === n && d > 0)) break
    out.push(store.plan.slice(i, i + d))
    i += d
  }
  // Co zbylo (a taky celý plán, když `planDny` nejsou) padá do posledního dne.
  if (i < n || !out.length) out.push(store.plan.slice(i))
  return out
}

/** Zapíše délky dnů zpátky do storu. Prázdné dny jsou dovolené. */
function uloz(dny) {
  const delky = dny.map((d) => d.length)
  // Jediný den = stejné jako žádné dělení. Ať se v datech nedrží zbytečnost.
  store.planDny = delky.length > 1 ? delky : []
  return save()
}

/** Přidá na konec prázdný den. Zastávky se do něj přesouvají tažením a šipkami. */
export function pridejDen() {
  const dny = dnyPlanu()
  dny.push([])
  return uloz(dny)
}

/**
 * Přesune zastávku do sousedního dne.
 * @param {string} id
 * @param {-1|1} smer
 */
export function presunDoDne(id, smer) {
  const dny = dnyPlanu()
  const kde = dny.findIndex((d) => d.includes(id))
  const cil = kde + smer
  if (kde < 0 || cil < 0 || cil >= dny.length) return true

  dny[kde].splice(dny[kde].indexOf(id), 1)
  // Při posunu dopředu jde zastávka na začátek dalšího dne, při posunu zpět
  // na konec předchozího – tedy vždycky na tu stranu, odkud přišla.
  if (smer > 0) dny[cil].unshift(id)
  else dny[cil].push(id)

  // `plan` se musí přeskládat do stejného pořadí, jinak by si pořadí zastávek
  // a hranice dnů začaly odporovat.
  store.plan = dny.flat()
  return uloz(dny)
}

/** Zruší dělení na dny. Zastávky ani jejich pořadí se nemění. */
export function zrusDny() {
  store.planDny = []
  return save()
}

/**
 * Zapíše navržené délky dnů.
 *
 * Kontroluje, že součet sedí na počet zastávek – kdyby ne, dělení by tiše
 * ukrojilo konec plánu. Radši se nezapíše nic.
 *
 * @param {number[]} delky
 * @returns {boolean}
 */
export function nastavDny(delky) {
  const soucet = delky.reduce((a, b) => a + b, 0)
  if (soucet !== store.plan.length) return false
  store.planDny = delky.length > 1 ? delky : []
  return save()
}
