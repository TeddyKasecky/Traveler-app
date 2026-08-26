/**
 * Registrace service workeru.
 *
 * Přeskakuje se ve třech případech:
 *   - ve vývojovém režimu: sw.js vzniká až při buildu, takže by dev server
 *     na jeho místě vrátil index.html a prohlížeč by si stěžoval na typ
 *     souboru. Tuhle hlášku nejde odchytit, jde jen nezpůsobit ji.
 *   - v single-file variantě: ta má všechno v sobě a otevírá se z disku,
 *     kde service worker stejně registrovat nejde,
 *   - mimo https a localhost: prohlížeč to zakazuje.
 *
 * Selhání se polyká schválně. Aplikace musí fungovat i bez service workeru
 * a hláška v konzoli by jen mátla.
 */

export function registrujServiceWorker() {
  if (import.meta.env.DEV) return
  if (import.meta.env.SINGLE_FILE) return
  if (!('serviceWorker' in navigator)) return
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return

  // Když už stránku někdo řídí, je tohle návštěva po nasazení nové verze.
  // Zjišťuje se před registrací – po ní už by bylo pozdě.
  const bylaStaraVerze = !!navigator.serviceWorker.controller

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!bylaStaraVerze || uzSePrekresluje) return
    // Přebírání řízení znamená, že se stáhla novější verze. Bez tohohle by se
    // ukázala až při dalším otevření a kdo právě přidal místo, viděl by staré.
    //
    // Tři vteřiny jsou strop schválně: kdo mezitím začal psát poznámku, o ni
    // překreslením přijít nesmí. Pak nová verze prostě počká na příště.
    if (performance.now() > 3000) return
    uzSePrekresluje = true
    location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}

/** Pojistka proti smyčce překreslování. */
let uzSePrekresluje = false

/**
 * Načte aplikaci znovu a zahodí přitom cache service workeru.
 *
 * PROČ TO EXISTUJE: po nasazení nové verze na betu servíruje service worker
 * ještě chvíli starou z cache a obyčejné obnovení stránky s tím nehne –
 * `controllerchange` výš zabere jen do tří vteřin od startu a jen když se
 * nová verze zrovna stáhla. Jediné, co při ladění spolehlivě zabíralo, bylo
 * aplikaci zavřít a znovu otevřít.
 *
 * NEMAŽE UŽIVATELSKÁ DATA a mazat je nikdy nesmí. Poznámky, hodnocení, plán,
 * výpravy (localStorage), fotky, trasy, archiv cest, debug záznamy a stažená
 * mapa (IndexedDB) zůstávají netknuté – smaže se jen to, co si prohlížeč umí
 * stáhnout znovu. Kdo sem přidá `localStorage.clear()`, zahodí jediné, co
 * v téhle appce nejde ničím nahradit.
 *
 * Rozepsaná poznámka se neztratí: `location.reload()` spustí `pagehide`
 * a na něm visí doplach `save()` (viz `main.js`).
 *
 * OFFLINE SE TO ODMÍTNE. Po smazání cache by nebylo co načíst a zbyla by bílá
 * stránka až do chvíle, kdy bude signál – na cestě přesně to, co se stát nesmí.
 *
 * @returns {Promise<boolean>} `false` = neudělalo se nic (offline)
 */
export async function resetujAppku() {
  if (!navigator.onLine) return false

  try {
    if ('caches' in window) {
      const klice = await caches.keys()
      // Jen naše klíče. Původ může hostit i něco jiného a mazat cizí cache
      // by bylo přesně to, co tenhle soubor nemá dělat.
      await Promise.all(klice.filter((k) => k.startsWith('vandrbuch-')).map((k) => caches.delete(k)))
    }
    if ('serviceWorker' in navigator) {
      const registrace = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrace.map((r) => r.unregister()))
    }
  } catch {
    // Zakázané úložiště nebo prohlížeč bez cache API – načíst znovu se dá tak jako tak.
  }

  location.reload()
  return true
}
