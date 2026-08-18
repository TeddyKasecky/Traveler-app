/**
 * Čtení balíku malované mapy (`.vbm`) a jeho napojení na MapLibre.
 *
 * Formát vyrábí `scripts/make-mapa.mjs`, kde je i popsaný. Ve zkratce:
 *
 *   [0..3]   'VBM1'
 *   [4..7]   délka rejstříku (uint32 LE)
 *   [8..]    rejstřík (JSON, gzip)  { zoomMax, meze, dlazdice: {"z/x/y":[pozice,delka]} }
 *   pak      těla dlaždic za sebou  (MVT zabalený gzipem, každá zvlášť)
 *
 * Pozice v rejstříku jsou počítané od začátku těl, ne od začátku souboru –
 * díky tomu se rejstřík nemusí přepisovat, když se změní jeho vlastní délka.
 *
 * ČTE SE Z BLOBU, ne z paměti. Balík má skoro 10 MB a `blob.slice()` nechá
 * prohlížeči možnost držet ho na disku; do paměti se dostane jen ta dlaždice,
 * kterou mapa zrovna kreslí.
 *
 * Rozbaluje se `DecompressionStream`, což umí každý prohlížeč, který umí
 * i WebGL – bez WebGL se sem stejně nikdo nedostane a nastoupí záložní
 * kreslení z `basemap.json`.
 */

/** Jméno protokolu, pod kterým se registruje v MapLibre: `vbm://…`. */
export const PROTOKOL = 'vbm'

/** @type {{blob: Blob, rejstrik: Record<string, [number, number]>, zoomMax: number, odTel: number}|null} */
let balik = null

/** Rozbalí gzip. */
async function rozbal(buf) {
  const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(s).arrayBuffer()
}

/**
 * Otevře balík z Blobu. Přečte se jen hlavička a rejstřík, těla zůstanou na disku.
 *
 * @param {Blob} blob
 * @returns {Promise<{zoomMax: number, dlazdic: number}>}
 */
export async function otevriBalik(blob) {
  const hlavicka = new DataView(await blob.slice(0, 8).arrayBuffer())
  const magic = String.fromCharCode(hlavicka.getUint8(0), hlavicka.getUint8(1), hlavicka.getUint8(2), hlavicka.getUint8(3))
  if (magic !== 'VBM1') throw new Error(`tohle není balík mapy (${magic})`)

  const delkaRejstriku = hlavicka.getUint32(4, true)
  const rejstrikBin = await blob.slice(8, 8 + delkaRejstriku).arrayBuffer()
  const hlava = JSON.parse(new TextDecoder().decode(await rozbal(rejstrikBin)))

  balik = {
    blob,
    rejstrik: hlava.dlazdice,
    zoomMax: hlava.zoomMax,
    // Těla začínají hned za hlavičkou a rejstříkem.
    odTel: 8 + delkaRejstriku,
  }
  return { zoomMax: hlava.zoomMax, dlazdic: Object.keys(hlava.dlazdice).length }
}

/** Je balík otevřený? */
export const jeOtevreny = () => !!balik

/** Do jakého přiblížení balík sahá. Nad ním si MapLibre dlaždice roztáhne sám. */
export const zoomMax = () => (balik ? balik.zoomMax : 0)

/** Zavře balík. Volá se, když se stažená mapa smaže. */
export function zavriBalik() {
  balik = null
}

/**
 * Vrátí tělo jedné dlaždice, nebo prázdno.
 *
 * Prázdná odpověď není chyba: MapLibre se ptá i na čtverce, které v balíku
 * nejsou (moře za hranicí výřezu), a musí dostat prázdno, ne výjimku – jinak
 * by si mapu obarvil hláškou o chybě.
 *
 * @param {number} z
 * @param {number} x
 * @param {number} y
 * @returns {Promise<ArrayBuffer>}
 */
export async function dlazdice(z, x, y) {
  if (!balik) return new ArrayBuffer(0)
  const kde = balik.rejstrik[`${z}/${x}/${y}`]
  if (!kde) return new ArrayBuffer(0)
  const [pozice, delka] = kde
  const od = balik.odTel + pozice
  return rozbal(await balik.blob.slice(od, od + delka).arrayBuffer())
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
  if (!m) return { data: new ArrayBuffer(0) }
  return { data: await dlazdice(+m[1], +m[2], +m[3]) }
}
