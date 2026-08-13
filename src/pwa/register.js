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
