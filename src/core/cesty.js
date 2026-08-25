/**
 * Archiv ukončených cest – zrcadlo v paměti nad IndexedDB.
 *
 * PROČ ZRCADLO A NE ASYNCHRONNÍ ČTENÍ: archiv čte třicet míst, mezi nimi
 * `map/planLine.js` při kreslení, dvacet achievementů v `views/plan/achievementy.js`
 * a `renderPlan()`, který běží při každém překreslení. Kdyby se z úložiště četlo
 * až v okamžiku potřeby, musela by se přepsat půlka Plánu. Takhle je `CESTY`
 * obyčejné pole, ze kterého se čte synchronně – přesně jako `PHOTOS`.
 *
 * Držet celý archiv v paměti je tady v pořádku, na rozdíl od geometrie tras:
 * jde o stovky kilobajtů textu, ne o megabajty souřadnic, a čte se z něj často.
 *
 * `CESTY` se **mutuje na místě, nikdy nenahrazuje** – ostatní moduly na něj
 * drží referenci, stejně jako na `store`, `F` a `PHOTOS`.
 *
 * ARCHIV ZŮSTÁVÁ V ZÁLOZE. Na rozdíl od geometrie se nedá dopočítat, takže
 * `core/csv.js` ho zálohuje dál – jen ho bere odsud a ne ze `store`.
 */

import { emit, save, store } from './store.js'
import { nactiCesty, ulozCestu as ulozDoDb, zahodCestu } from './cestyDb.js'

/**
 * Ukončené cesty, nejnovější první.
 * @type {Array<Record<string, any>>}
 */
export const CESTY = []

/** Nahradí obsah zrcadla, aniž by se změnila reference. */
function napln(pole) {
  CESTY.length = 0
  CESTY.push(...pole)
}

/**
 * Přestěhuje archiv ze `store` do IndexedDB.
 *
 * ZE `store` SE MAŽE AŽ PO POTVRZENÉM ZÁPISU všech záznamů – archiv je
 * nenahraditelný, takže poloviční stěhování by znamenalo ztrátu. Když se
 * jediný zápis nepovede, zůstane ve `store` všechno a zkusí se to při příštím
 * startu znovu.
 *
 * Klíč `cesty` ve `store` zůstává jako prázdné pole a nikdy se neodstraňuje:
 * sahá na něj obnova starých záloh i starší kód.
 *
 * @returns {Promise<number>} kolik se jich přestěhovalo
 */
export async function stehujCesty() {
  const kStehovani = (store.cesty || []).filter((c) => c && typeof c.zacatek === 'number')
  if (!kStehovani.length) return 0

  for (const c of kStehovani) {
    const v = await ulozDoDb(c)
    if (!v.ok) return 0
  }

  store.cesty = []
  napln(await nactiCesty())
  return kStehovani.length
}

/**
 * Start: načte archiv do paměti a přestěhuje, co ještě leží ve `store`.
 * Volá se ze `main.js` až za prvním vykreslením.
 */
export async function pripravCesty() {
  napln(await nactiCesty())
  const presunuto = await stehujCesty()
  if (presunuto) save()
  emit('cestyNacteny')
}

/**
 * Přidá nebo přepíše jednu cestu v archivu.
 *
 * Vrací `false`, když se zápis nepovedl – volající to NESMÍ zahodit. Neuložená
 * ukončená cesta je nenávratně pryč.
 *
 * @param {Record<string, any>} cesta
 * @returns {Promise<boolean>}
 */
export async function ulozCestu(cesta) {
  const v = await ulozDoDb(cesta)
  if (!v.ok) {
    emit('ulozeniSelhalo', { klic: 'cesty', plno: v.plno })
    return false
  }
  const kde = CESTY.findIndex((c) => c.zacatek === cesta.zacatek)
  if (kde >= 0) CESTY[kde] = cesta
  else CESTY.unshift(cesta)
  CESTY.sort((a, b) => (b.zacatek || 0) - (a.zacatek || 0))
  return true
}

/**
 * Smaže cestu z archivu i z paměti.
 * @param {number} zacatek
 * @returns {Promise<boolean>}
 */
export async function smazCestu(zacatek) {
  if (!(await zahodCestu(zacatek))) return false
  const kde = CESTY.findIndex((c) => c.zacatek === zacatek)
  if (kde >= 0) CESTY.splice(kde, 1)
  return true
}
