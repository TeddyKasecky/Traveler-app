/**
 * Geometrie přepočtených tras v IndexedDB.
 *
 * PROČ TO SEM PATŘÍ: jedna trasa z Mapy.com Routing API má sedm tisíc bodů,
 * což je **273 kB** JSON textu. Appka jich drží jednu na každou výpravu
 * a jednu na každou archivovanou cestu – v srpnu 2026 se ukázalo, že
 * `vandrbuch:v1` kvůli tomu narostl na 4,3 MB, tedy 85 % tvrdého stropu
 * localStorage. Až se dosáhne, `save()` selže a **neuloží se nic**, ani
 * jednoznaková poznámka: serializuje se celý store naráz.
 *
 * A hlavně: **polyline nejsou uživatelská data, jsou odvozená.** Dají se
 * kdykoli znovu spočítat z bodů trasy jedním voláním API. Nepatří proto
 * do malé schránky vedle poznámek, které nahradit nejdou, a **nepatří ani
 * do zálohy** – ta má nést body, ne co se z nich dopočítá.
 *
 * KLÍČEM JE OTISK (`views/plan/routing.js#otiskBodu`). Ten už dnes existuje
 * a přesně říká, pro kterou množinu bodů trasa platí – je to tedy hotový
 * klíč cache. Navíc tím dvě výpravy se stejnou trasou sdílejí jeden záznam.
 *
 * VLASTNÍ DATABÁZE, ne sklad vedle fotek – ze stejného důvodu jako mapa:
 * přidat sklad do `vandrbuch` znamená zvednout verzi a dokud má otevřené
 * spojení starý kód, upgrade se zablokuje a zápis fotek by během toho selhal.
 */

const DB = 'vandrbuch-trasy'
const SKLAD = 'trasy'

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
 * Vrátí geometrii trasy, nebo null.
 *
 * Při jakékoli chybě null – bez geometrie se appka obejde, `map/planLine.js`
 * nakreslí vzdušnou spojnici bodů jako vždycky, když přepočet chybí.
 *
 * @param {string} otisk
 * @returns {Promise<Array<[number, number]>|null>}
 */
export async function nactiTrasu(otisk) {
  if (!otisk) return null
  try {
    const db = await otevri()
    const r = await transakce(db, 'readonly', (s) => s.get(otisk))
    return r.result || null
  } catch {
    return null
  }
}

/**
 * Uloží geometrii pod jejím otiskem.
 *
 * Vrací výsledek, ne holé true – volající to NESMÍ zahodit. Když se zápis
 * nepovede, nesmí se přepočet ohlásit jako úspěšný: ve storu by pak zůstalo
 * metadata ukazující na geometrii, která nikde není.
 *
 * @param {string} otisk
 * @param {Array<[number, number]>} body
 * @returns {Promise<{ok: boolean, plno: boolean}>}
 */
export async function ulozTrasu(otisk, body) {
  if (!otisk || !Array.isArray(body)) return { ok: false, plno: false }
  try {
    const db = await otevri()
    await transakce(db, 'readwrite', (s) => s.put(body, otisk))
    return { ok: true, plno: false }
  } catch (e) {
    return { ok: false, plno: jePlno(e) }
  }
}

/**
 * Zahodí jednu trasu. Používá se při úklidu – neúspěch nikoho netrápí,
 * nanejvýš zůstane ležet pár kilobajtů ve velké schránce.
 * @param {string} otisk
 * @returns {Promise<boolean>}
 */
export async function zahodTrasu(otisk) {
  if (!otisk) return false
  try {
    const db = await otevri()
    await transakce(db, 'readwrite', (s) => s.delete(otisk))
    return true
  } catch {
    return false
  }
}

/**
 * Otisky všech uložených tras. Slouží k úklidu: co ve storu nemá protějšek,
 * už nikdo nenakreslí.
 * @returns {Promise<string[]>}
 */
export async function otiskyTras() {
  try {
    const db = await otevri()
    const r = await transakce(db, 'readonly', (s) => s.getAllKeys())
    return r.result || []
  } catch {
    return []
  }
}
