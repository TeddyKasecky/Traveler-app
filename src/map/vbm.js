/**
 * Napojení staženého balíku (`.vbm`) na MapLibre.
 *
 * Vlastní čtení a rozbalování dělá `vbmWorker.js` ve vlastním vlákně – tenhle
 * soubor je jen okénko do něj a překladač adres `vbm://{z}/{x}/{y}` na zprávy.
 *
 * PROČ TO NEDĚLÁ ROVNOU TENHLE SOUBOR: obsluha protokolu, kterou volá MapLibre,
 * běží na hlavním vlákně. Rozbalit tam gzip každé dlaždice znamenalo jedno
 * škubnutí na dlaždici, a to zrovna při posunu mapy, kdy jich chodí nejvíc.
 *
 * Formát balíku je popsaný v `scripts/make-mapa.mjs` a v komentáři workeru.
 */

/** Jméno protokolu, pod kterým se registruje v MapLibre: `vbm://…`. */
export const PROTOKOL = 'vbm'

/** Značka, kterou umíme přečíst. Balík se starší značkou se odmítá. */
const ZNACKA = 'VBM2'

/** @type {Worker|null} */
let vlakno = null
/** @type {Map<number, {hotovo: Function, selhalo: Function}>} */
const cekaji = new Map()
let poradi = 0

/** Co víme o otevřeném balíku. Null znamená, že žádný otevřený není. */
let otevreny = null

/** Pošle workeru zprávu a počká na odpověď. */
function zeptej(zprava, prenest) {
  if (!vlakno) return Promise.reject(new Error('vlákno neběží'))
  const id = ++poradi
  return new Promise((hotovo, selhalo) => {
    cekaji.set(id, { hotovo, selhalo })
    vlakno.postMessage({ ...zprava, id }, prenest || [])
  })
}

/** Nastartuje vlákno, pokud ještě neběží. */
async function nastartuj() {
  if (vlakno) return
  // Dynamický import, aby se worker nedostal do hlavního balíčku aplikace –
  // stáhne si ho jen ten, kdo má mapu do telefonu opravdu staženou.
  const { default: VbmWorker } = await import('./vbmWorker.js?worker')
  vlakno = new VbmWorker()
  vlakno.onmessage = (e) => {
    const c = cekaji.get(e.data.id)
    if (!c) return
    cekaji.delete(e.data.id)
    if (e.data.chyba) c.selhalo(new Error(e.data.chyba))
    else c.hotovo(e.data)
  }
  vlakno.onerror = (e) => {
    for (const c of cekaji.values()) c.selhalo(new Error(e.message || 'vlákno spadlo'))
    cekaji.clear()
  }
}

/**
 * Je balík ten, kterému rozumíme?
 *
 * Volá to Nastavení, aby mohlo napsat „stažená mapa je zastaralá" místo toho,
 * aby mapa tiše spadla na obrysy a nikdo nevěděl proč. Čte se osm bajtů,
 * takže se kvůli tomu nic nikam nekopíruje.
 *
 * @param {Blob} blob
 * @returns {Promise<boolean>}
 */
export async function jeAktualni(blob) {
  try {
    const b = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
    return String.fromCharCode(...b) === ZNACKA
  } catch {
    return false
  }
}

/**
 * Otevře balík z Blobu.
 *
 * @param {Blob} blob
 * @returns {Promise<{zoomMax: number, dlazdic: number}>}
 */
export async function otevriBalik(blob) {
  await nastartuj()
  const { info } = await zeptej({ typ: 'otevri', blob })
  otevreny = info
  return info
}

/** Je balík otevřený? */
export const jeOtevreny = () => !!otevreny

/** Do jakého přiblížení balík sahá. Nad ním si MapLibre dlaždice roztáhne sám. */
export const zoomMax = () => (otevreny ? otevreny.zoomMax : 0)

/** Zavře balík. Volá se, když se stažená mapa smaže. */
export function zavriBalik() {
  otevreny = null
  if (vlakno) zeptej({ typ: 'zavri' }).catch(() => {})
}

/**
 * Obsluha protokolu pro MapLibre.
 *
 * Registruje se `maplibregl.addProtocol('vbm', obsluhaProtokolu)` a MapLibre
 * pak volá tohle místo síťového požadavku. Adresa je `vbm://{z}/{x}/{y}`.
 *
 * @param {{url: string}} pozadavek
 * @returns {Promise<{data: ArrayBuffer}>}
 */
export async function obsluhaProtokolu(pozadavek) {
  const m = /^vbm:\/\/(\d+)\/(\d+)\/(\d+)/.exec(pozadavek.url)
  if (!m || !otevreny) return { data: new ArrayBuffer(0) }
  try {
    const { data } = await zeptej({ typ: 'dlazdice', z: +m[1], x: +m[2], y: +m[3] })
    return { data }
  } catch {
    // Prázdno, ne výjimka: MapLibre by si jinak mapu obarvil hláškou o chybě.
    return { data: new ArrayBuffer(0) }
  }
}
