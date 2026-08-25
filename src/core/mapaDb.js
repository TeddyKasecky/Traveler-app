/**
 * Stažená malovaná mapa Evropy v IndexedDB.
 *
 * Balík má přes deset megabajtů, takže nemůže být součástí instalace – aplikace
 * má jinak 1,3 MB a nikdo nechce stahovat třicetinásobek jen proto, že si někdy
 * možná zapne offline mapu. Stahuje se proto na vyžádání z Nastavení.
 *
 * VLASTNÍ DATABÁZE, ne sklad vedle fotek. Fotky bydlí v `vandrbuch` verze 1
 * (`core/fotoDb.js`) a přidat tam sklad znamená zvednout verzi – jenže dokud
 * má otevřené spojení starý kód, upgrade se zablokuje a **zápis fotek by během
 * toho selhal**. Oddělená databáze `vandrbuch-mapa` se téhle třídy problémů
 * zbavuje úplně a nestojí nic.
 *
 * Uvnitř je jeden Blob pod klíčem `evropa`. Blob schválně, ne ArrayBuffer:
 * prohlížeč ho může nechat na disku a nemusí ho držet celý v paměti, a čte se
 * z něj po kouscích přes `slice()` – přesně tak, jak dlaždice potřebuje.
 */

const DB = 'vandrbuch-mapa'
const SKLAD = 'mapa'
const KLIC = 'evropa'

/** @type {Promise<IDBDatabase>|null} */
let spojeni = null

/** Otevře databázi. Sklad se zakládá při prvním otevření. */
function otevri() {
  if (spojeni) return spojeni
  spojeni = new Promise((hotovo, selhalo) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(SKLAD)) r.result.createObjectStore(SKLAD)
    }
    r.onsuccess = () => hotovo(r.result)
    r.onerror = () => selhalo(r.error)
    r.onblocked = () => selhalo(new Error('databáze je zablokovaná jinou záložkou'))
  })
  // Neúspěch se nesmí zapamatovat navždy – při dalším pokusu se otevírá znovu.
  spojeni.catch(() => {
    spojeni = null
  })
  return spojeni
}

/** Obalí transakci do slibu. */
function transakce(db, rezim, prace) {
  return new Promise((hotovo, selhalo) => {
    const tr = db.transaction(SKLAD, rezim)
    const vysledek = prace(tr.objectStore(SKLAD))
    tr.oncomplete = () => hotovo(vysledek)
    tr.onerror = () => selhalo(tr.error)
    tr.onabort = () => selhalo(tr.error)
  })
}

/** Došlo místo? IndexedDB to hlásí stejně jako localStorage. */
const jePlno = (e) => !!e && e.name === 'QuotaExceededError'

/**
 * Vrátí stažený balík, nebo null.
 *
 * Při jakékoli chybě vrací null – bez mapy se aplikace musí obejít, nastoupí
 * záložní kreslení z `basemap.json`.
 *
 * @returns {Promise<Blob|null>}
 */
export async function nactiMapu() {
  try {
    const db = await otevri()
    const r = await transakce(db, 'readonly', (s) => s.get(KLIC))
    return r.result || null
  } catch {
    return null
  }
}

/**
 * Uloží stažený balík.
 * @param {Blob} blob
 * @returns {Promise<{ok: boolean, plno: boolean}>}
 */
export async function ulozMapu(blob) {
  try {
    const db = await otevri()
    await transakce(db, 'readwrite', (s) => s.put(blob, KLIC))
    return { ok: true, plno: false }
  } catch (e) {
    return { ok: false, plno: jePlno(e) }
  }
}

/**
 * Smaže staženou mapu. Používá se v Nastavení, když si člověk chce uvolnit místo.
 * @returns {Promise<boolean>}
 */
export async function smazMapu() {
  try {
    const db = await otevri()
    await transakce(db, 'readwrite', (s) => s.delete(KLIC))
    return true
  } catch {
    return false
  }
}

/**
 * Kolik má stažená mapa bajtů. Nula znamená, že stažená není.
 *
 * Pozor: **načte celý balík** (skoro 4 MB) jen aby přečetla `.size`. Kdo chce
 * jen vědět, jestli mapa je, má volat `jeMapaStazena()`.
 *
 * @returns {Promise<number>}
 */
export async function velikostMapy() {
  const b = await nactiMapu()
  return b ? b.size : 0
}

/**
 * Je balík stažený? Levná otázka – `count()` samotný Blob nečte.
 *
 * Vzniklo proto, že `core/debugKontext.js` se na to ptalo přes `velikostMapy()`
 * a tahalo tím z úložiště 3,9 MB při každém zápisu debug poznámky.
 *
 * @returns {Promise<boolean>}
 */
export async function jeMapaStazena() {
  try {
    const db = await otevri()
    const r = await transakce(db, 'readonly', (s) => s.count(KLIC))
    return r.result > 0
  } catch {
    return false
  }
}
