/**
 * proč: UI živého sledování polohy (views/plan/cesta-zivot.js) nesmí
 * překreslovat na každou drobnou změnu ze `watchPosition` (může přijít
 * i vícekrát za sekundu) – throttle omezí na nejvýš jedno spuštění za `ms`.
 * Odlišné od `store.js#saveOdlozene()`, což je DEBOUNCE (čeká na klid) –
 * tady chceme pravidelné tikání i při nepřetržitém proudu událostí.
 */

/**
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
export function throttle(fn, ms) {
  let posledni = 0
  let cekajici = null
  return (...args) => {
    const ted = Date.now()
    const zbyva = ms - (ted - posledni)
    if (zbyva <= 0) {
      posledni = ted
      fn(...args)
    } else {
      clearTimeout(cekajici)
      cekajici = setTimeout(() => {
        posledni = Date.now()
        fn(...args)
      }, zbyva)
    }
  }
}
