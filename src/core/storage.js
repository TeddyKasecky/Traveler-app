/**
 * Obal nad localStorage.
 *
 * Klíče se nesmí měnit – jsou v nich poznámky, hodnocení, plán a fotky, které
 * uživatel nasbíral. Kdyby se přejmenovaly, o všechno by přišel.
 *
 * Migrace zatím žádná není potřeba: tvar dat pod všemi třemi klíči zůstává
 * stejný jako v původní aplikaci. Kdyby někdy byla, patří sem.
 */

export const KEY = 'vandrbuch:v1'
export const PKEY = 'vandrbuch:photos'
export const PREFK = 'vandrbuch:prefs'

/**
 * Data míst nahraná z CSV.
 *
 * Nový klíč. Dřív se ukládala do `vandrbuch:v1` k poznámkám, takže ten záznam
 * po importu narostl na ~565 kB a přepisoval se při každé změně poznámky.
 */
export const DATAK = 'vandrbuch:data'

/**
 * Rozepsaný koncept ve formuláři na přidání místa.
 *
 * Nový klíč, přibyl s formulářem. Na tři klíče výš schválně nesahá – kdyby se
 * koncept ukládal k nim, mohl by při chybě ohrozit poznámky a fotky.
 */
export const DRAFTK = 'vandrbuch:draft'

/**
 * Záznamy debug poznámkovače (nápady, bugy, poznámky psané za běhu appky).
 *
 * Samostatný klíč ze stejného důvodu jako `vandrbuch:data`: jsou to vývojářská
 * data, která nesmí být ve stejném zápisu jako poznámky z cest. Kdyby seděla
 * v `vandrbuch:v1`, při plné paměti by stahovala poznámky s sebou – a poznámky
 * jsou to jediné, co v téhle appce nejde nahradit.
 */
export const DEBUGK = 'vandrbuch:debug'

/**
 * Načte hodnotu a doplní ji do výchozího objektu.
 * Poškozený nebo chybějící záznam tiše vrátí výchozí stav – přesně jako dřív.
 *
 * @template T
 * @param {string} klic
 * @param {T} vychozi  mutuje se a vrací (kvůli tomu, aby ostatní moduly mohly
 *                     držet stabilní referenci na objekt stavu)
 * @returns {T}
 */
export function nacti(klic, vychozi) {
  try {
    const s = localStorage.getItem(klic)
    if (s) Object.assign(vychozi, JSON.parse(s))
  } catch {
    /* rozbitý JSON nebo zakázané úložiště – zůstane výchozí stav */
  }
  return vychozi
}

/**
 * Poznal prohlížeč, že je plno?
 *
 * Každý to hlásí jinak: Chrome a Safari `QuotaExceededError`, Firefox
 * `NS_ERROR_DOM_QUOTA_REACHED`, starší prohlížeče jen číselným kódem.
 *
 * @param {unknown} e
 * @returns {boolean}
 */
function jePlno(e) {
  if (!e || typeof e !== 'object') return false
  const x = /** @type {{name?: string, code?: number}} */ (e)
  return x.name === 'QuotaExceededError' || x.name === 'NS_ERROR_DOM_QUOTA_REACHED' || x.code === 22 || x.code === 1014
}

/**
 * Uloží hodnotu.
 *
 * Vrací výsledek, ne holé true/false, protože „plná paměť" a „zakázané úložiště"
 * se řeší jinak: plno uživatel spraví smazáním fotek, zákaz ne. Volající to musí
 * ohlásit – dokud se návratová hodnota zahazovala, mizely poznámky beze slova.
 *
 * @param {string} klic
 * @param {unknown} data
 * @returns {{ok: boolean, plno: boolean}}
 */
export function uloz(klic, data) {
  try {
    localStorage.setItem(klic, JSON.stringify(data))
    return { ok: true, plno: false }
  } catch (e) {
    return { ok: false, plno: jePlno(e) }
  }
}

/** Všechny klíče aplikace, v pořadí od nejcennějšího. Pro měření zabraného místa. */
const VSECHNY_KLICE = [KEY, PREFK, DATAK, DRAFTK, DEBUGK, PKEY]

/**
 * Kolik místa aplikace zabírá.
 *
 * `navigator.storage.estimate()` počítá celý původ (localStorage i obě
 * IndexedDB), takže samo o sobě neřekne, co paměť dusí. Proto se k němu
 * přidává velikost jednotlivých klíčů localStorage – to je jediné místo,
 * kde je strop tvrdý (~5 MB) a kde se selhání zápisu projeví ztrátou poznámek.
 *
 * Bydlí to tady, ne v Nastavení, protože to potřebuje i debug poznámkovač:
 * plná paměť je u téhle appky nejčastější příčina tichých selhání a patří
 * do kontextu každého hlášení.
 *
 * `pouzito` a `strop` jsou `null`, když to prohlížeč neumí říct – `klice`
 * se změří vždycky, ty jdou spočítat i bez `navigator.storage`.
 *
 * @returns {Promise<{pouzito: number|null, strop: number|null, klice: Record<string, number>}>}
 */
export async function zmerUloziste() {
  const klice = {}
  try {
    for (const k of VSECHNY_KLICE) {
      const s = localStorage.getItem(k)
      // UTF-16 v paměti, ale prohlížeče strop počítají po znacích – délka
      // řetězce je nejbližší číslo, které jde získat bez kódování celého klíče.
      if (s) klice[k] = s.length
    }
  } catch {
    /* zakázané úložiště – zůstane prázdné */
  }

  try {
    if (!navigator.storage || !navigator.storage.estimate) return { pouzito: null, strop: null, klice }
    const { usage, quota } = await navigator.storage.estimate()
    return { pouzito: usage || 0, strop: quota || 0, klice }
  } catch {
    return { pouzito: null, strop: null, klice }
  }
}

/**
 * Smaže klíč. Používá se při stěhování dat na jiné místo.
 * @param {string} klic
 */
export function smaz(klic) {
  try {
    localStorage.removeItem(klic)
  } catch {
    /* zakázané úložiště – není co mazat */
  }
}
