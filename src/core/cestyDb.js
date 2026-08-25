/**
 * Archiv ukončených cest v IndexedDB.
 *
 * PROČ SE ODSTĚHOVAL: archiv rostl o 2–8 kB na každou ukončenou cestu, nikdy
 * se nemazal a seděl ve `vandrbuch:v1`, kde je tvrdý strop ~5 MB pro všechna
 * uživatelská data dohromady. Do zdi to mělo daleko, ale rostlo to bez horní
 * meze – a `save()` serializuje celý store naráz, takže každá archivovaná
 * cesta prodražovala i zápis jedné poznámky.
 *
 * NENÍ TO CACHE, JE TO NENAHRADITELNÉ. Na rozdíl od geometrie tras
 * (`core/trasyDb.js`) se archiv nedá dopočítat ničím – je to jediný záznam
 * o tom, kde jsme byli. Proto:
 *   - **zůstává v záloze** (`core/csv.js`), zatímco geometrie z ní vypadla,
 *   - stěhování ze `store` maže až po potvrzeném zápisu (`core/cesty.js`),
 *   - čte se do zrcadla v paměti, ne asynchronně při kreslení – archiv čte
 *     třicet míst včetně `map/planLine.js` a dvaceti achievementů.
 *
 * KLÍČEM JE `zacatek` (čas vyjetí v ms). Není to náhoda: `core/csv.js` podle
 * něj už dnes slučuje archiv při obnově ze zálohy, takže je to zavedená
 * identita cesty.
 *
 * Vlastní databáze, ne sklad vedle fotek – přidat sklad do `vandrbuch`
 * znamená zvednout verzi a blokovaný upgrade by shodil zápis fotek. Stejný
 * důvod má mapa i trasy.
 */

const DB = 'vandrbuch-cesty'
const SKLAD = 'cesty'

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
 * Všechny ukončené cesty, nejnovější první.
 *
 * Při chybě prázdné pole – appka se bez archivu obejde a ukáže prázdnou
 * knihovnu. NIKDY se kvůli tomu nesmí nic přepsat: prázdné pole tady
 * neznamená „archiv je prázdný", ale „nepovedlo se přečíst".
 *
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function nactiCesty() {
  try {
    const db = await otevri()
    const r = await transakce(db, 'readonly', (s) => s.getAll())
    return (r.result || []).sort((a, b) => (b.zacatek || 0) - (a.zacatek || 0))
  } catch {
    return []
  }
}

/**
 * Uloží jednu cestu pod jejím časem vyjetí.
 *
 * Vrací výsledek, ne holé true – volající to NESMÍ zahodit. U archivu to platí
 * dvojnásob: neuložená cesta je nenávratně pryč, dopočítat se nedá.
 *
 * @param {Record<string, any>} cesta
 * @returns {Promise<{ok: boolean, plno: boolean}>}
 */
export async function ulozCestu(cesta) {
  if (!cesta || typeof cesta.zacatek !== 'number') return { ok: false, plno: false }
  try {
    const db = await otevri()
    await transakce(db, 'readwrite', (s) => s.put(cesta, cesta.zacatek))
    return { ok: true, plno: false }
  } catch (e) {
    return { ok: false, plno: jePlno(e) }
  }
}

/**
 * Smaže jednu cestu z archivu.
 * @param {number} zacatek
 * @returns {Promise<boolean>}
 */
export async function zahodCestu(zacatek) {
  try {
    const db = await otevri()
    await transakce(db, 'readwrite', (s) => s.delete(zacatek))
    return true
  } catch {
    return false
  }
}

/**
 * Kolik cest v archivu je. Levné – `count()` samotné záznamy nečte.
 * @returns {Promise<number>}
 */
export async function pocetCest() {
  try {
    const db = await otevri()
    const r = await transakce(db, 'readonly', (s) => s.count())
    return r.result || 0
  } catch {
    return 0
  }
}
