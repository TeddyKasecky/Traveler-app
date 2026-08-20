/**
 * Košík – wishlist míst na výpravu, který ještě není trasa.
 *
 * PROČ VEDLE PLÁNU, NE V NĚM: itinerář je závazek. Zastávka v něm má pořadí,
 * den a počítá se do kilometrů. Na začátku roadtripu ale člověk ještě neví,
 * co kdy pojede – ví jen, co ho láká. Do teď musel každé místo rovnou zařadit
 * do dne, takže se plánovalo dřív, než bylo co plánovat.
 *
 * Košík je hromádka bez pořadí a bez dnů. Nekreslí se z něj trasa, nepočítají
 * se z něj kilometry. Až přijde „dneska jedeme sem", vytáhne se z něj jedno
 * místo do itineráře a zbytek čeká dál.
 *
 * KLÍČOVANÝ NÁZVEM VÝPRAVY, stejně jako `store.bloky` – každý roadtrip má svůj
 * wishlist. Sdílí to i slabinu bloků: název je křehká identita, takže
 * přejmenování musí košík přestěhovat (dělá to `prejmenuj()` ve `vypravy.js`).
 *
 * DATOVĚ „PŘIDAT VEDLE, NIKDY NEPŘEPISOVAT": `store.kosik` je nový klíč vedle
 * `plan` a `bloky`. Kdo ho nemá, má prázdný košík – přesně dnešní stav. Při
 * startu se nic nezapisuje a starší build z cache klíč ignoruje.
 *
 * Ukládají se JEN `id` míst, ne jejich kopie. Data míst se můžou změnit
 * importem CSV a košík má odkazovat na místo, ne držet jeho otisk.
 */

import { store, save } from '../../core/store.js'
import { S } from '../../core/store.js'
import { dkm } from '../../core/geo.js'
import { BEZ_NAZVU } from './vypravy.js'

/** Klíč aktivní výpravy v `store.kosik`. */
const klic = () => store.vypravaNazev || BEZ_NAZVU

/** Id v košíku aktivní výpravy, vždycky pole. Staré uložení klíč nemá. */
export function kosik() {
  if (!store.kosik || typeof store.kosik !== 'object') store.kosik = {}
  return store.kosik[klic()] || []
}

/** Zapíše košík aktivní výpravy. Vrací výsledek uložení, nikdy ho nezahazuj. */
export function zapisKosik(nove) {
  if (!store.kosik || typeof store.kosik !== 'object') store.kosik = {}
  store.kosik[klic()] = nove
  return save()
}

/** Je místo v košíku? */
export const vKosiku = (id) => kosik().includes(id)

/**
 * Přidá místo do košíku. Duplicitu tiše ignoruje – dvakrát naházené místo
 * je omyl, ne úmysl.
 * @returns {boolean} true když se opravdu přidalo
 */
export function pridejDoKosiku(id) {
  if (!id || vKosiku(id)) return false
  return zapisKosik([...kosik(), id])
}

/** Vyhodí místo z košíku. */
export function vyhodZKosiku(id) {
  return zapisKosik(kosik().filter((x) => x !== id))
}

/** Přepínač pro tlačítko „do košíku". Vrací, jestli je místo po akci uvnitř. */
export function prepniKosik(id) {
  const bylo = vKosiku(id)
  if (bylo) vyhodZKosiku(id)
  else pridejDoKosiku(id)
  return !bylo
}

/** Vysype celý košík aktivní výpravy. */
export function vyprazdniKosik() {
  return zapisKosik([])
}

/**
 * Přestěhuje košík pod nový název výpravy. Volá `prejmenuj()` ve `vypravy.js`
 * – bez toho by wishlist po přejmenování osiřel, stejně jako kdysi bloky.
 */
export function prestehujKosik(zeStareho, doNoveho) {
  if (!store.kosik || zeStareho === doNoveho) return
  const co = store.kosik[zeStareho]
  if (!co) return
  delete store.kosik[zeStareho]
  store.kosik[doNoveho] = co
}

/** Smaže košík zaniklé výpravy, ať se neplní neviditelnými zbytky. */
export function zahodKosik(nazev) {
  if (store.kosik) delete store.kosik[nazev]
}

/**
 * Místa z košíku jako objekty, bez těch, která už v datech nejsou
 * (import CSV mohl místo odstranit).
 * @returns {Array<Record<string, any>>}
 */
export const mistaVKosiku = () => kosik().map((id) => S.byId[id]).filter(Boolean)

/**
 * Rozdělí košík do skupin podle země a v každé seřadí podle vzdálenosti
 * od `odkud`, nebo abecedně, když polohu neznáme.
 *
 * Země, ne kraj: na roadtripu se člověk rozhoduje „ještě Rakousko, nebo už
 * Slovinsko", ne podle krajů. Skupiny jdou od té s nejbližším místem, aby
 * nahoře bylo to, kam je odsud nejblíž.
 *
 * @param {{lat:number, lon:number}|null} odkud
 * @returns {Array<{zeme: string, mista: Array<Record<string, any>>}>}
 */
export function kosikPoZemich(odkud = null) {
  const skupiny = new Map()
  for (const p of mistaVKosiku()) {
    const zeme = p.z || 'Jinde'
    if (!skupiny.has(zeme)) skupiny.set(zeme, [])
    skupiny.get(zeme).push(p)
  }

  const vzdalenost = (p) => (odkud ? dkm(odkud, p) : Infinity)
  const out = [...skupiny.entries()].map(([zeme, mista]) => ({
    zeme,
    mista: odkud
      ? [...mista].sort((a, b) => vzdalenost(a) - vzdalenost(b))
      : [...mista].sort((a, b) => a.n.localeCompare(b.n, 'cs')),
  }))

  return odkud
    ? out.sort((a, b) => vzdalenost(a.mista[0]) - vzdalenost(b.mista[0]))
    : out.sort((a, b) => a.zeme.localeCompare(b.zeme, 'cs'))
}
