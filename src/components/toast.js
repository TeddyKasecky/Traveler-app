/**
 * Bublina s hláškou dole nad taby.
 */

let casovac

/**
 * Ukáže hlášku na 2,2 s. Další hláška předchozí přebije.
 * @param {string} zprava
 */
export function toast(zprava) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = zprava
  el.classList.add('show')
  clearTimeout(casovac)
  casovac = setTimeout(() => el.classList.remove('show'), 2200)
}
