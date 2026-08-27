/**
 * Stažené předpovědi počasí v IndexedDB.
 *
 * PROČ SEM A NE DO `vandrbuch:v1`: předpověď je **dotažená z API**. Dá se
 * kdykoli stáhnout znovu, takže patří na stranu „co si appka umí opatřit
 * znovu" — stejně jako geometrie tras (`trasyDb.js`), která do malé schránky
 * vedle poznámek taky nepatří. **Do zálohy nejde ani ona**: po obnově na jiném
 * telefonu se počasí prostě natáhne, kdežto poznámka nahradit nejde.
 *
 * VLASTNÍ DATABÁZE, ne sklad vedle fotek – ze stejného důvodu jako u tras
 * a u mapy: přidat sklad do `vandrbuch` znamená zvednout verzi, a dokud má
 * otevřené spojení starý kód, upgrade se zablokuje a zápis fotek by během
 * toho selhal.
 *
 * KLÍČ NESE I JEDNOTKY. Kdo si přepne stupně na Fahrenheity, nesmí dostat
 * uloženou předpověď ve stupních Celsia s novým popiskem — bylo by to tiše
 * o dvacet stupňů vedle. Souřadnice se zaokrouhlují na dvě desetinná místa
 * (zhruba kilometr): o pár set metrů dál je počasí totéž a bez zaokrouhlení
 * by se schránka plnila novým záznamem po každém kroku s GPS.
 */

const DB = 'vandrbuch-pocasi'
const SKLAD = 'pocasi'

/**
 * Tvar uloženého záznamu. **Zvedni při každé změně toho, co se ukládá.**
 *
 * PROČ TO NENÍ „unést chybějící pole": když v srpnu 2026 přibyla do hodin
 * pravděpodobnost srážek, vykreslení se naučilo chybějící údaj vynechat –
 * a tím se ztráta držela tak dlouho, dokud záznam nevypršel. Na telefonu,
 * kde je interval nastavený na tři hodiny, to znamenalo tři hodiny appky,
 * která vypadá rozbitě, a nikde nebylo poznat proč.
 *
 * Se starým číslem se záznam prostě zahodí a stáhne znovu. Je to předpověď,
 * ne uživatelská data – zahodit ji nic nestojí.
 */
export const VERZE_ZAZNAMU = 2

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

/**
 * Klíč jednoho záznamu: kde a v jakých jednotkách.
 *
 * Čistá funkce, aby šla testovat bez prohlížeče (`check-uloziste.mjs`).
 *
 * @param {{lat:number, lon:number}} bod
 * @param {string} jednotky  't' pro Celsia a milimetry, jinak 'f'
 * @returns {string}
 */
export function klicPocasi(bod, jednotky = 't') {
  const z = (x) => Number(x).toFixed(2)
  return `${z(bod.lat)},${z(bod.lon)},${jednotky}`
}

/**
 * Vrátí uloženou předpověď, nebo null.
 *
 * Při jakékoli chybě null – bez uložené předpovědi se sekce prostě natáhne
 * ze sítě, a když ani to nejde, neukáže se nic. Nic se tím nerozbije.
 *
 * @param {string} klic
 * @returns {Promise<{stazeno:number, hodiny:Array, dny:Array}|null>}
 */
export async function nactiPocasiZeSchranky(klic) {
  if (!klic) return null
  try {
    const db = await otevri()
    const r = await transakce(db, 'readonly', (s) => s.get(klic))
    const z = r.result
    // Starý tvar = jako by tam nic nebylo. Volající pak stáhne znovu.
    if (!z || z.verze !== VERZE_ZAZNAMU) return null
    return z
  } catch {
    return null
  }
}

/**
 * Uloží předpověď i s časem stažení.
 *
 * `stazeno` je součástí záznamu schválně: podle něj se pozná, jestli je ještě
 * čerstvá, a bez signálu se z něj vypíše „Staženo včera v 18:40". Kdyby se
 * čas držel jinde, po smazání schránky by ukazoval na prázdno.
 *
 * @param {string} klic
 * @param {{hodiny:Array, dny:Array}} data
 * @param {number} [ted]
 * @returns {Promise<boolean>}
 */
export async function ulozPocasi(klic, data, ted = Date.now()) {
  if (!klic || !data) return false
  try {
    const db = await otevri()
    await transakce(db, 'readwrite', (s) => s.put({ ...data, stazeno: ted, verze: VERZE_ZAZNAMU }, klic))
    return true
  } catch {
    return false
  }
}

/**
 * Vyprázdní schránku – tlačítko v Nastavení.
 * @returns {Promise<boolean>}
 */
export async function zahodVsechnoPocasi() {
  try {
    const db = await otevri()
    await transakce(db, 'readwrite', (s) => s.clear())
    return true
  } catch {
    return false
  }
}

/**
 * Kolik předpovědí je uložených. Pro výpis v Nastavení.
 * @returns {Promise<number>}
 */
export async function pocetPocasi() {
  try {
    const db = await otevri()
    const r = await transakce(db, 'readonly', (s) => s.count())
    return r.result || 0
  } catch {
    return 0
  }
}
