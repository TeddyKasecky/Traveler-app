/**
 * Geometrie tras v paměti – aby kreslení zůstalo synchronní.
 *
 * `map/planLine.js` a mini-mapy kreslí synchronně, ale geometrie od srpna 2026
 * bydlí v IndexedDB (`core/trasyDb.js`), tedy asynchronně. Řeší to tenhle
 * mezikus: v paměti je obyčejný objekt, ze kterého se čte rovnou při
 * vykreslování, a co v něm není, se dotáhne na pozadí a ohlásí událostí.
 * Je to přesně vzor, jaký mají fotky (`PHOTOS` + `fotkyNacteny`).
 *
 * DRŽÍ SE JEN TO, CO SE KRESLÍ. Dvacet tras v paměti by byl stejný nesmysl
 * jako dvacet tras v localStorage, jen jinde – jedna má sedm tisíc bodů.
 * Naráz jsou potřeba nejvýš tři: aktivní výprava, rozjetá cesta a otevřená
 * archivovaná.
 *
 * Tenhle soubor taky **stěhuje starý tvar dat**: do srpna 2026 ležela polyline
 * přímo v `store`, uvnitř `prepocet`. Kdo appku otevře po aktualizaci, tomu se
 * přesune do IndexedDB a ze `store` zmizí.
 */

import { emit, save, store } from './store.js'
import { nactiTrasu, otiskyTras, ulozTrasu, zahodTrasu } from './trasyDb.js'
import { CESTY } from './cesty.js'

/** Kolik geometrií se drží v paměti. Tři jsou potřeba naráz, čtvrtá je rezerva. */
const STROP_PAMETI = 4

/** @type {Map<string, Array<[number, number]>>} otisk → body. Map kvůli pořadí vkládání. */
const vpameti = new Map()

/**
 * Otisky, na které se už sáhlo a v úložišti nebyly. Bez toho by se na každé
 * překreslení mapy pouštěl nový dotaz do IndexedDB pro trasu, která neexistuje.
 * @type {Set<string>}
 */
const marne = new Set()

/**
 * Geometrie trasy z paměti, nebo `null`. Synchronní schválně – volá se přímo
 * z vykreslování mapy.
 * @param {string} [otisk]
 * @returns {Array<[number, number]>|null}
 */
export const geometrie = (otisk) => (otisk && vpameti.get(otisk)) || null

/** Vloží do paměti a vyhodí nejstarší, když je plno. */
function doPameti(otisk, body) {
  vpameti.delete(otisk)
  vpameti.set(otisk, body)
  marne.delete(otisk)
  while (vpameti.size > STROP_PAMETI) vpameti.delete(vpameti.keys().next().value)
}

/**
 * Zapamatuje si čerstvě spočítanou trasu, aby se hned nakreslila a nemusela
 * se číst zpátky z úložiště.
 * @param {string} otisk
 * @param {Array<[number, number]>} body
 */
export function zapamatujTrasu(otisk, body) {
  if (otisk && Array.isArray(body)) doPameti(otisk, body)
}

/**
 * Dotáhne geometrii do paměti, pokud tam ještě není, a ohlásí to.
 *
 * Volá se z vykreslování, tedy klidně několikrát za vteřinu – proto se
 * nedotahuje znovu to, co už v paměti je nebo co se marně hledalo.
 * Návratovou hodnotu nikdo nečeká; výsledek přijde jako `trasaNactena`.
 *
 * @param {string} [otisk]
 */
export function zajistiTrasu(otisk) {
  if (!otisk || vpameti.has(otisk) || marne.has(otisk)) return
  // Zapsat hned, ne až po odpovědi – jinak by druhé překreslení pustilo
  // druhý dotaz dřív, než doběhne první.
  marne.add(otisk)
  nactiTrasu(otisk).then((body) => {
    if (!body) return
    doPameti(otisk, body)
    emit('trasaNactena', otisk)
  })
}

/* ================= co všechno ve store nese přepočet ================= */

/**
 * Všechna místa, kde ve `store` sedí objekt `prepocet`.
 *
 * Jsou čtyři a je snadné na některé zapomenout – proto jedno místo, ze
 * kterého čerpá stěhování i úklid.
 * @returns {Array<Record<string, any>>}
 */
function vsechnyPrepocty() {
  const ven = []
  if (store.aktivniPrepocet) ven.push(store.aktivniPrepocet)
  if (store.cesta && store.cesta.prepocet) ven.push(store.cesta.prepocet)
  for (const c of CESTY || []) if (c && c.prepocet) ven.push(c.prepocet)
  for (const v of store.vypravy || []) if (v && v.prepocet) ven.push(v.prepocet)
  return ven
}

/** Otisky, na které `store` opravdu odkazuje. */
const zivoteschopneOtisky = () => new Set(vsechnyPrepocty().map((p) => p.otisk).filter(Boolean))

/* ================= stěhování starého tvaru ================= */

/**
 * Přesune polyliny ze `store` do IndexedDB a ze `store` je vyhodí.
 *
 * POLYLINE SE ZE STORE SMAŽE AŽ PO ÚSPĚŠNÉM ZÁPISU – stejné pravidlo, jaké
 * má stěhování fotek (`store.js#pripravFotky`, starý klíč se maže až když
 * zápis do IndexedDB projde). Jinak by se při selhání trasa ztratila úplně.
 *
 * Nezapisuje `save()` – to dělá volající, aby se při obnově ze zálohy
 * neukládalo dvakrát.
 *
 * @returns {Promise<number>} kolik jich přibylo v úložišti
 */
export async function stehujTrasy() {
  let presunuto = 0
  for (const p of vsechnyPrepocty()) {
    if (!Array.isArray(p.polyline) || !p.otisk) continue
    const v = await ulozTrasu(p.otisk, p.polyline)
    if (!v.ok) continue
    doPameti(p.otisk, p.polyline)
    delete p.polyline
    presunuto++
  }
  return presunuto
}

/* ================= úklid ================= */

/**
 * Smaže z úložiště geometrie, na které `store` neodkazuje.
 *
 * Vzniká to normálním používáním: přepočet nahradí předchozí, výprava se
 * smaže, cesta se zruší. Bez úklidu by velká schránka rostla donekonečna –
 * a to, že je velká, není důvod ji zaneřádit.
 *
 * @returns {Promise<number>} kolik se jich smazalo
 */
export async function uklidTrasy() {
  const zive = zivoteschopneOtisky()
  const ulozene = await otiskyTras()
  let smazano = 0
  for (const otisk of ulozene) {
    if (zive.has(otisk)) continue
    if (await zahodTrasu(otisk)) smazano++
  }
  return smazano
}

/**
 * Start: přestěhuje starý tvar, načte do paměti to, co se hned kreslí,
 * a uklidí, co už nikdo nepotřebuje.
 *
 * Volá se ze `main.js` až za prvním vykreslením – mapa umí do té doby
 * nakreslit vzdušnou spojnici a po dotažení se překreslí sama.
 */
export async function pripravTrasy() {
  const presunuto = await stehujTrasy()
  if (presunuto) save()

  // Přednačíst jen to, co je vidět hned: živý plán a rozjetá cesta.
  // Archivovanou cestu si vyžádá až vykreslování, když ji někdo otevře.
  zajistiTrasu(store.aktivniPrepocet && store.aktivniPrepocet.otisk)
  zajistiTrasu(store.cesta && store.cesta.prepocet && store.cesta.prepocet.otisk)

  await uklidTrasy()
  if (presunuto) emit('trasaNactena', null)
}

/**
 * Zahodí přepočet, který přestal platit.
 *
 * Neplatný přepočet se na mapě stejně nikdy nenakreslí (`map/planLine.js`
 * porovnává `otisk` a spadne na vzdušnou čáru), takže je to jen odpad.
 * Do srpna 2026 se vědomě nechával ležet, protože se nevědělo o tom, kolik
 * místa zabírá.
 *
 * @param {Record<string, any>|null} prepocet
 * @param {string} platnyOtisk  otisk, který by musel sedět
 * @returns {boolean} jestli se zahodil
 */
export function zahodNeplatny(prepocet, platnyOtisk) {
  if (!prepocet || !prepocet.otisk || prepocet.otisk === platnyOtisk) return false
  vpameti.delete(prepocet.otisk)
  marne.delete(prepocet.otisk)
  // Úklid v úložišti je asynchronní a nikdo na něj nečeká – kdyby selhal,
  // posbírá to `uklidTrasy()` při příštím startu.
  zahodTrasu(prepocet.otisk)
  return true
}
