/**
 * Vyfocené fotky míst v IndexedDB.
 *
 * Proč ne localStorage jako dřív: má strop kolem 5 MB a fotky se do něj ukládaly
 * jako base64, takže ho zaplnilo zhruba čtyřicet kusů. A protože v témž úložišti
 * bydlí poznámky, přestaly by se od té chvíle ukládat i ony – tiše, protože se
 * návratová hodnota zahazovala.
 *
 * IndexedDB je pořád jen **v telefonu**, nikam se nic neposílá. Má ale řádově víc
 * místa a zápis neblokuje vykreslování, protože je asynchronní.
 *
 * Rozhraní schválně vrací `{ok, plno}` stejně jako `uloz()` v storage.js – volající
 * pak nemusí řešit, kde data leží.
 */

const DB = 'vandrbuch'
const SKLAD = 'fotky'

/** @type {Promise<IDBDatabase>|null} otevřené spojení, otevírá se jednou */
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

/** Došlo místo? IndexedDB to hlásí stejně jako localStorage. */
const jePlno = (e) => !!e && e.name === 'QuotaExceededError'

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

/**
 * Načte všechny fotky.
 *
 * Při jakékoli chybě vrátí prázdno – aplikace musí naběhnout i bez fotek.
 * @returns {Promise<Record<string, string>>}
 */
export async function nactiFotky() {
  try {
    const db = await otevri()
    // Oba požadavky se zadají naráz, přečtou se až v `oncomplete`, kdy jsou hotové.
    const { klice, hodnoty } = await transakce(db, 'readonly', (s) => ({
      klice: s.getAllKeys(),
      hodnoty: s.getAll(),
    }))
    /** @type {Record<string, string>} */
    const out = {}
    klice.result.forEach((k, i) => (out[String(k)] = hodnoty.result[i]))
    return out
  } catch {
    return {}
  }
}

/**
 * Uloží jednu fotku.
 * @param {string} id
 * @param {string} dataUrl
 * @returns {Promise<{ok: boolean, plno: boolean}>}
 */
export async function zapisFotku(id, dataUrl) {
  try {
    const db = await otevri()
    await transakce(db, 'readwrite', (s) => s.put(dataUrl, id))
    return { ok: true, plno: false }
  } catch (e) {
    return { ok: false, plno: jePlno(e) }
  }
}

/**
 * Zahodí jednu fotku.
 * @param {string} id
 * @returns {Promise<{ok: boolean, plno: boolean}>}
 */
export async function zahodFotku(id) {
  try {
    const db = await otevri()
    await transakce(db, 'readwrite', (s) => s.delete(id))
    return { ok: true, plno: false }
  } catch (e) {
    return { ok: false, plno: jePlno(e) }
  }
}

/**
 * Přepíše celý obsah skladu. Používá se při obnově ze zálohy a při stěhování
 * ze starého úložiště – jinde se zapisuje po jedné fotce, ať se zbytečně
 * nepřepisují megabajty.
 *
 * @param {Record<string, string>} fotky
 * @returns {Promise<{ok: boolean, plno: boolean}>}
 */
export async function zapisFotky(fotky) {
  try {
    const db = await otevri()
    await transakce(db, 'readwrite', (s) => {
      s.clear()
      for (const [id, url] of Object.entries(fotky)) s.put(url, id)
    })
    return { ok: true, plno: false }
  } catch (e) {
    return { ok: false, plno: jePlno(e) }
  }
}

/**
 * Kolik vyfocených fotek je uložených. Levné – `count()` samotné obrázky nečte,
 * a je to celé megabajty (fotka má po zmenšení stovky kilobajtů).
 *
 * Vzniklo pro rozpad v Nastavení → Místo v telefonu: po přesunu fotek, tras
 * a archivu do IndexedDB je v localStorage vidět jen menší půlka úložiště
 * a ta větší se slévala do jednoho čísla z `navigator.storage.estimate()`.
 *
 * @returns {Promise<number>}
 */
export async function pocetFotek() {
  try {
    const db = await otevri()
    const r = await transakce(db, 'readonly', (s) => s.count())
    return r.result || 0
  } catch {
    return 0
  }
}
