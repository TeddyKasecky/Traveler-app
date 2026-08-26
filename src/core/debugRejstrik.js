/**
 * Stav debug záznamů v repozitáři, jak ho appce přibalil build.
 *
 * PROČ TO JDE BEZ BACKENDU: appka se nasazuje z TÉHOŽ repozitáře, do kterého
 * se commitují exporty. `vite.config.js#pluginDebugRejstrik()` proto při buildu
 * přečte složku `debug/` a přibalí z ní `debug-stav.json`. Autor pak v appce
 * vidí, že jeho hlášení někdo řeší nebo vyřešil – a vidí i záznamy toho
 * druhého, takže se totéž nehlásí dvakrát. Žádný server, žádný token.
 *
 * OBNOVUJE SE NASAZENÍM, ne dotazem na cizí službu. Na betě je to každý push
 * na `main`, na produkci vydání. Pravidelné chození na GitHub by z offline
 * appky udělalo appku, která bez signálu půlku obrazovky neukáže.
 *
 * Čte se JEDNOU za běh a drží v paměti: soubor se během jednoho spuštění
 * appky nemůže změnit, protože se mění jen nasazením.
 *
 * Chybějící soubor je platný stav – v jednosouborové variantě žádný není
 * a v `npm run dev` ho servíruje middleware. `null` znamená „nevíme", ne
 * „nic tam není"; UI podle toho nesmí nic tvrdit.
 */

/** @type {{zaznamy: Array<Record<string, any>>}|null} */
let rejstrik = null
let nacita = null

/** Rejstřík, pokud už je v paměti. Bez čekání – pro synchronní vykreslení. */
export const rejstrikVPameti = () => rejstrik

/**
 * Načte rejstřík (jednou). Vrací `null`, když soubor není nebo se nedá přečíst.
 * @returns {Promise<{zaznamy: Array<Record<string, any>>}|null>}
 */
export function nactiRejstrik() {
  if (rejstrik) return Promise.resolve(rejstrik)
  if (nacita) return nacita
  nacita = fetch('./debug-stav.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      rejstrik = d && Array.isArray(d.zaznamy) ? d : null
      return rejstrik
    })
    .catch(() => null)
  return nacita
}

/**
 * Co repozitář ví o jednom záznamu, nebo `null`.
 * @param {string} id
 */
export function stavZRepa(id) {
  if (!rejstrik) return null
  return rejstrik.zaznamy.find((z) => z.id === id) || null
}

/**
 * Záznamy od někoho jiného – to, co v telefonu nemám.
 *
 * Filtruje se podle toho, co appka opravdu drží, ne podle jména autora:
 * na jednom zařízení může být záznam obnovený ze zálohy toho druhého a ten
 * do „od ostatních" nepatří, protože ho vidím v hlavním seznamu.
 *
 * @param {Set<string>} mojeIds
 */
export function odOstatnich(mojeIds) {
  if (!rejstrik) return []
  return rejstrik.zaznamy
    .filter((z) => !mojeIds.has(z.id))
    .sort((a, b) => String(b.id).localeCompare(String(a.id)))
}

/**
 * Je ten záznam ve skutečnosti můj, jen z jiného zařízení?
 *
 * `odOstatnich()` filtruje podle toho, která `id` v telefonu NEMÁM – ne podle
 * autora. Po vyčištění dat prohlížeče se tak mezi „od ostatních“ objeví
 * i vlastní poznámky, a bez tohohle rozlišení je od cizích nepoznáš.
 *
 * Porovnává se jméno autora, ne celý prefix: `tadeas` z telefonu a
 * `tadeas-f32` z počítače je tentýž člověk, jen jiné zařízení.
 *
 * @param {Record<string, any>} z  záznam z rejstříku
 * @param {string} mujAutor        `prefs.debugAutor`
 */
export const jeMuj = (z, mujAutor) =>
  !!mujAutor && (z.autor === mujAutor || String(z.autor || '').startsWith(`${mujAutor}-`))
