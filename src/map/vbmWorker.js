/**
 * Vlákno, které vydává dlaždice ze staženého balíku.
 *
 * PROČ VLASTNÍ VLÁKNO: čtení kousku Blobu z disku a rozbalení gzipu trvá
 * jednotky až desítky milisekund a dřív to běželo v obsluze protokolu, tedy
 * na hlavním vlákně – přesně tam, kde se zároveň počítá posun mapy. Každá
 * dlaždice tak byla jedno škubnutí. Tady o tom hlavní vlákno neví.
 *
 * Formát balíku popisuje `scripts/make-mapa.mjs`. Ve zkratce:
 *
 *   [0..3]   'VBM2'
 *   [4..7]   délka rejstříku (uint32 LE)
 *   [8..]    rejstřík (JSON, gzip)  { zoomMax, meze, dlazdice: {"z/x/y":[pozice,delka]} }
 *   pak      těla dlaždic za sebou  (MVT zabalený gzipem, každá zvlášť)
 *
 * Blob se sem posílá celý, ale nekopíruje se – prohlížeč ho může nechat
 * ležet na disku a `slice()` z něj bere jen to, co je zrovna potřeba.
 */

/** Značka, kterou umíme přečíst. Starší balík se odmítá, viz `vbm.js`. */
const ZNACKA = 'VBM2'

/** @type {{blob: Blob, rejstrik: Record<string, [number, number]>, odTel: number}|null} */
let balik = null

/**
 * Rozbalené dlaždice.
 *
 * Evropa má 229 jedinečných dlaždic, takže se do paměti vejde slušný kus.
 * Strop je tu proto, že rozbalená dlaždice má i přes 400 kB a bez něj by
 * paměť rostla, dokud je kam.
 */
const pamet = new Map()
const PAMET_KUSU = 24

/** Rozbalí gzip. */
async function rozbal(buf) {
  const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(s).arrayBuffer()
}

/** Otevře balík: přečte se jen hlavička a rejstřík, těla zůstanou na disku. */
async function otevri(blob) {
  const hlavicka = new DataView(await blob.slice(0, 8).arrayBuffer())
  const magic = String.fromCharCode(
    hlavicka.getUint8(0),
    hlavicka.getUint8(1),
    hlavicka.getUint8(2),
    hlavicka.getUint8(3)
  )
  if (magic !== ZNACKA) throw new Error(`tohle není balík mapy (${magic})`)

  const delkaRejstriku = hlavicka.getUint32(4, true)
  const rejstrikBin = await blob.slice(8, 8 + delkaRejstriku).arrayBuffer()
  const hlava = JSON.parse(new TextDecoder().decode(await rozbal(rejstrikBin)))

  pamet.clear()
  balik = { blob, rejstrik: hlava.dlazdice, odTel: 8 + delkaRejstriku }
  return { zoomMax: hlava.zoomMax, dlazdic: Object.keys(hlava.dlazdice).length }
}

/**
 * Vrátí tělo jedné dlaždice, nebo prázdno.
 *
 * Prázdná odpověď není chyba: MapLibre se ptá i na čtverce, které v balíku
 * nejsou (moře za hranicí výřezu), a musí dostat prázdno, ne výjimku – jinak
 * by si mapu obarvil hláškou o chybě.
 *
 * VRACÍ SE KOPIE. Odpověď se posílá přenosem, takže by původní pole zůstalo
 * po odeslání odpojené a podruhé prázdné. Kopie 400 kB je práce na desetiny
 * milisekundy, kdežto rozbalení gzipu na desítky – proto se to vyplatí.
 */
async function dlazdice(z, x, y) {
  if (!balik) return new ArrayBuffer(0)
  const klic = `${z}/${x}/${y}`
  const kde = balik.rejstrik[klic]
  if (!kde) return new ArrayBuffer(0)

  const [pozice, delka] = kde
  const ulozena = pamet.get(pozice)
  if (ulozena) return ulozena.slice().buffer

  const od = balik.odTel + pozice
  const syrove = new Uint8Array(await rozbal(await balik.blob.slice(od, od + delka).arrayBuffer()))
  // Nejstarší ven. `Map` drží pořadí vkládání, takže stačí první klíč.
  if (pamet.size >= PAMET_KUSU) pamet.delete(pamet.keys().next().value)
  pamet.set(pozice, syrove)
  return syrove.slice().buffer
}

self.onmessage = async (e) => {
  const { typ, id } = e.data
  try {
    if (typ === 'otevri') {
      const info = await otevri(e.data.blob)
      self.postMessage({ id, info })
    } else if (typ === 'zavri') {
      balik = null
      pamet.clear()
      self.postMessage({ id })
    } else if (typ === 'dlazdice') {
      const data = await dlazdice(e.data.z, e.data.x, e.data.y)
      self.postMessage({ id, data }, [data])
    }
  } catch (chyba) {
    self.postMessage({ id, chyba: String(chyba && chyba.message ? chyba.message : chyba) })
  }
}
