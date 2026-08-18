/**
 * Evropská mřížka — jedna definice pro reliéf i pro masky kreseb.
 *
 * PROČ SDÍLENÁ: stínování terénu, maska lesů a maska hor musí ležet **přesně
 * na sobě**. Kdyby si každý skript spočítal meze po svém, stačilo by jinak
 * zaokrouhlit a stromy by na mapě stály o kus vedle hor. Meze navíc čte
 * i aplikace (`src/data/relief.json`), takže existují jen na jednom místě.
 *
 * MŘÍŽKA JE V MERCATORU, ne v zeměpisných stupních. Je to schválně: mapa je
 * v Mercatoru taky, takže konstantní krok v buňkách znamená konstantní hustotu
 * **na obrazovce**. O tu jde — kresby mají vypadat stejně husté v Andalusii
 * i v Laponsku, i když v kilometrech to stejné není.
 *
 * Mřížka je odvozená od dlaždic přiblížení 6: buňka rastru = pixel dlaždice
 * 256 × 256, tedy ~1,5 km. Do souborů se ukládá zmenšená (viz `SIRKA_VEN`
 * v `make-relief.mjs`), aby se vešla do rozumných kilobajtů.
 */

/** Evropa i s kusem okolí. Stejný obdélník, jaký bere `make-mapa.mjs`. */
export const MEZE = { minLat: 33, maxLat: 72, minLon: -26, maxLon: 46 }

/**
 * Přiblížení, ze kterého mřížka vychází.
 *
 * Šestka dává dlaždici na ~600 km, tedy bod na ~1,5 km. Na stínování celého
 * kontinentu i na rozmístění kreseb to bohatě stačí a je to 182 dlaždic
 * místo sedmi set.
 */
export const ZOOM = 6
export const STRANA = 256

/** Číslo dlaždice ve směru x pro daný poledník. */
export const naX = (lon, z = ZOOM) => Math.floor(((lon + 180) / 360) * 2 ** z)

/** Číslo dlaždice ve směru y pro danou rovnoběžku (Mercator). */
export function naY(lat, z = ZOOM) {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

/** Zeměpisná šířka horního okraje dlaždice (číslo dlaždice smí být desetinné). */
export function latDlazdice(y, z = ZOOM) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z
  return (180 / Math.PI) * Math.atan(Math.sinh(n))
}

/** Zeměpisná délka levého okraje dlaždice. */
export const lonDlazdice = (x, z = ZOOM) => (x / 2 ** z) * 360 - 180

const x0 = naX(MEZE.minLon)
const x1 = naX(MEZE.maxLon)
const y0 = naY(MEZE.maxLat)
const y1 = naY(MEZE.minLat)

/**
 * Rozsah mřížky.
 *
 * `sloupcu`/`radku` jsou dlaždice, `W`/`H` body. `meze` jsou **skutečné okraje
 * dlaždic**, ne `MEZE` — o ty se opírá umístění obrázku v mapě, takže musí
 * sedět na bod.
 */
export const MRIZKA = {
  x0,
  x1,
  y0,
  y1,
  sloupcu: x1 - x0 + 1,
  radku: y1 - y0 + 1,
  W: (x1 - x0 + 1) * STRANA,
  H: (y1 - y0 + 1) * STRANA,
  meze: {
    sever: latDlazdice(y0),
    jih: latDlazdice(y1 + 1),
    zapad: lonDlazdice(x0),
    vychod: lonDlazdice(x1 + 1),
  },
}

/**
 * Bod mřížky → zeměpisné souřadnice (střed buňky).
 *
 * @param {number} x  sloupec 0…W-1
 * @param {number} y  řádek 0…H-1
 * @returns {[number, number]}  [lat, lon]
 */
export function naGeo(x, y) {
  return [latDlazdice(MRIZKA.y0 + (y + 0.5) / STRANA), lonDlazdice(MRIZKA.x0 + (x + 0.5) / STRANA)]
}

/**
 * Zeměpisné souřadnice → bod mřížky. Vrací desetinná čísla, zaokrouhlení
 * je na volajícím.
 *
 * @returns {[number, number]}  [x, y]
 */
export function naBod(lat, lon) {
  return [(naXpresne(lon) - MRIZKA.x0) * STRANA, (naYpresne(lat) - MRIZKA.y0) * STRANA]
}

/** Číslo dlaždice bez zaokrouhlení – potřebuje ho `naBod()`. */
const naXpresne = (lon) => ((lon + 180) / 360) * 2 ** ZOOM
function naYpresne(lat) {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** ZOOM
}

/**
 * Velikost bodu v metrech pro daný řádek.
 *
 * V Mercatoru se poledník k pólu roztahuje, takže bod na severu pokrývá
 * podstatně menší území. Bez přepočtu by Skandinávie vypadala jako Himálaj.
 */
export function metryNaBod(radek) {
  const lat = latDlazdice(MRIZKA.y0 + radek / STRANA)
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** ZOOM
}
