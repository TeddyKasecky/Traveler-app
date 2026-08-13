/**
 * Registrace service workeru.
 *
 * Přeskakuje se ve dvou případech:
 *   - v single-file variantě: ta má všechno v sobě a otevírá se z disku,
 *     kde service worker stejně registrovat nejde,
 *   - mimo https a localhost: prohlížeč to zakazuje.
 *
 * Selhání se polyká schválně. Aplikace musí fungovat i bez service workeru
 * a hláška v konzoli by jen mátla.
 */

export function registrujServiceWorker() {
  if (import.meta.env.SINGLE_FILE) return
  if (!('serviceWorker' in navigator)) return
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
