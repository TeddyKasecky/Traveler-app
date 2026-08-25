/**
 * Záznamy debug poznámkovače v IndexedDB.
 *
 * PROČ SE STĚHOVALY: `vandrbuch:debug` seděl ve stejném ~5MB stropu jako
 * poznámky z cest, a jeden záznam unese až deset kilobajtů (dvacet připnutých
 * chyb v kontextu). Vývojářská data tam nepatří – kdyby strop došlo kvůli nim,
 * přestaly by se ukládat poznámky, a ty jsou to jediné, co v téhle appce nejde
 * ničím nahradit. Napsané to bylo přímo v komentáři u `DEBUGK` ve `storage.js`,
 * jen se to pak nedodrželo.
 *
 * VLASTNÍ DATABÁZE, ne sklad vedle fotek – ze stejného důvodu jako
 * `core/mapaDb.js`, `trasyDb.js` a `cestyDb.js`: přidat sklad znamená zvednout
 * verzi, a dokud má otevřené spojení starý kód, upgrade se zablokuje a zápis
 * fotek by během toho selhal.
 *
 * JEDEN ZÁZNAM POD JEDNÍM KLÍČEM, ne záznam na poznámku. Je to úmyslně
 * doslovný přepis toho, co dělal localStorage: `debugData` je objekt mutovaný
 * na místě, ve kterém `smazZaznamy()` celé pole `zaznamy` NAHRAZUJE. Rozpad na
 * jednotlivé záznamy by znamenal přepsat celou datovou vrstvu kvůli pár
 * kilobajtům, které se stejně zapisují jednou za minuty. Strop tu není.
 */

const DB = 'vandrbuch-debug'
const SKLAD = 'debug'
const KLIC = 'data'

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
 * Načte uložené záznamy, nebo `null`.
 *
 * `null` znamená „nic tam není nebo se to nedá přečíst“ – volající pak nechá
 * výchozí prázdný stav. Poznámkovač musí naběhnout i bez IndexedDB.
 *
 * @returns {Promise<{dalsiCislo: number, zaznamy: Array<Record<string, any>>}|null>}
 */
export async function nactiDebugDb() {
  try {
    const db = await otevri()
    const r = await transakce(db, 'readonly', (s) => s.get(KLIC))
    const d = r.result
    return d && Array.isArray(d.zaznamy) ? d : null
  } catch {
    return null
  }
}

/**
 * Uloží záznamy.
 *
 * Vrací výsledek, ne holé true/false – volající to NESMÍ zahodit. Rozepsaná
 * poznámka, která se neuloží, je pryč a autor o tom musí vědět.
 *
 * @param {{dalsiCislo: number, zaznamy: Array<Record<string, any>>}} data
 * @returns {Promise<{ok: boolean, plno: boolean}>}
 */
export async function ulozDebugDb(data) {
  try {
    const db = await otevri()
    // Kopie, ne živý objekt: structured clone by jinak běžel nad něčím, co se
    // mezitím může změnit (formulář píše do `debugData` při každé klávese).
    await transakce(db, 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(data)), KLIC))
    return { ok: true, plno: false }
  } catch (e) {
    return { ok: false, plno: jePlno(e) }
  }
}
