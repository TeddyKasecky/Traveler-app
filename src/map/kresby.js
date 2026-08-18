/**
 * Kde na mapě stojí stromy a hory — skládá se z masky až tady, v prohlížeči.
 *
 * PROČ MASKA A NE SEZNAM SOUŘADNIC. Do srpna 2026 se rozmístění vyrábělo při
 * buildu jako seznam bodů: 30 tisíc lesů a 12 tisíc hor, dohromady 953 kB.
 * Řídké to bylo znát — les byl rozeseté stromy, ne les. Hustší síť ale
 * seznamem nejde: bod stojí 22 bajtů, takže rozteč po 5 km by znamenala
 * půl milionu bodů a přes deset megabajtů.
 *
 * Maska je obrázek: jeden bod = jedna buňka mřížky (~3 km), hodnota říká,
 * co tam roste. Pět hodnot se zabalí na sto kilobajtů — a hlavně přestane
 * platit, že hustotu určují data. Určuje ji **přiblížení a volba
 * v Nastavení**, protože body se z masky sypou až podle toho, co je zrovna
 * vidět. Do mapy tak jde vždycky jen několik set kreseb, ne půl milionu.
 *
 * Mřížka je stejná jako u stínování terénu (`scripts/mrizka.mjs`), takže
 * masky i reliéf leží přesně na sobě. Je v Mercatoru, takže konstantní krok
 * v buňkách znamená konstantní hustotu **na obrazovce** — a o tu jde.
 */

import maskaLesuUrl from '../assets/kresby-lesy.png?url'
import maskaHorUrl from '../assets/kresby-hory.png?url'

/**
 * Cílová rozteč kreseb na obrazovce v bodech.
 *
 * Kresba je 40–60 px široká, takže při 44 px se sousedi opravdu překrývají
 * a z lesa je souvislá koruna. Při 66 px mezi nimi prosvítá barva plochy,
 * takže je pořád poznat, kde les končí a začíná pole.
 */
export const ROZTEC = { huste: 44, stridme: 66 }

/** Víc než tolik kreseb se do mapy neposílá, ať to nejde přetáhnout omylem. */
const STROP = 6000

/** @type {{data: Uint8Array, w: number, h: number}|null} */
let lesy = null
/** @type {{data: Uint8Array, w: number, h: number}|null} */
let hory = null
/** Meze masky – tytéž jako u reliéfu. */
let meze = null

/** Stabilní hash dvou čísel → 0..1. Stejná buňka dá pokaždé tentýž strom. */
function hash(a, b, sul) {
  let v = 2166136261
  v = Math.imul(v ^ a, 16777619)
  v = Math.imul(v ^ b, 16777619)
  v = Math.imul(v ^ sul, 16777619)
  return ((v >>> 0) % 100000) / 100000
}

/** Mercatorova y-ová souřadnice 0–1 pro danou šířku. */
function merkator(lat) {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2
}

/** Načte jednu masku jako pole hodnot. */
async function nactiMasku(adresa) {
  const bitmapa = await createImageBitmap(await (await fetch(adresa)).blob())
  // Rozměry se musí opsat **před** `close()`. Zavřená bitmapa hlásí nulu
  // a maska pak vyjde prázdná, aniž by cokoli spadlo.
  const w = bitmapa.width
  const h = bitmapa.height

  const platno = document.createElement('canvas')
  platno.width = w
  platno.height = h
  const ctx = platno.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmapa, 0, 0)
  const obr = ctx.getImageData(0, 0, w, h)
  bitmapa.close()

  // Z RGBA nás zajímá jen červený kanál – maska je šedotónová.
  const data = new Uint8Array(w * h)
  for (let i = 0; i < data.length; i++) data[i] = obr.data[i * 4]
  return { data, w, h }
}

/** Načte obě masky a meze. Volá se jednou. */
export async function nactiMasky() {
  if (lesy && hory) return true
  const [l, h, m] = await Promise.all([
    nactiMasku(maskaLesuUrl),
    nactiMasku(maskaHorUrl),
    import('../data/relief.json'),
  ])
  lesy = l
  hory = h
  const [[jih, zapad], [sever, vychod]] = m.default.meze
  meze = { jih, zapad, sever, vychod, ySever: merkator(sever), yJih: merkator(jih) }
  return true
}

/** Pořadové číslo kresby 1…`kolik`. Strop kvůli hodnotě přesně 1. */
const která = (kolik, v) => 1 + Math.min(kolik - 1, Math.floor(v * kolik))

const DRUHY_HOR = ['', 'kopec', 'hrbet', 'skala', 'snih']

/**
 * Poskládá kresby pro daný výřez.
 *
 * Krok se počítá tak, aby rozteč na obrazovce vyšla na `cil`. Buňka masky má
 * na obrazovce `2 × 2^(zoom−6)` bodů, protože maska je dvakrát řidší než
 * dlaždice přiblížení 6, ze kterých vznikla.
 *
 * @param {{sever:number, jih:number, zapad:number, vychod:number}} vyrez
 * @param {number} zoom  přiblížení Leafletu
 * @param {number} cil  cílová rozteč na obrazovce v bodech
 * @returns {{type: string, features: Array}}
 */
export function poskladej(vyrez, zoom, cil) {
  const prvky = []
  if (!lesy || !hory || !meze) return { type: 'FeatureCollection', features: prvky }

  const boduNaBunku = 2 * Math.pow(2, zoom - 6)
  const krok = Math.max(1, Math.round(cil / boduNaBunku))

  const naX = (lon) => ((lon - meze.zapad) / (meze.vychod - meze.zapad)) * lesy.w
  const naY = (lat) => ((merkator(lat) - meze.ySever) / (meze.yJih - meze.ySever)) * lesy.h

  const x0 = Math.max(0, Math.floor(naX(vyrez.zapad) / krok) * krok)
  const x1 = Math.min(lesy.w - 1, Math.ceil(naX(vyrez.vychod)))
  const y0 = Math.max(0, Math.floor(naY(vyrez.sever) / krok) * krok)
  const y1 = Math.min(lesy.h - 1, Math.ceil(naY(vyrez.jih)))

  // Zeměpisná šířka závisí jen na řádku, délka jen na sloupci – převádí se
  // proto po řádcích, ne pro každý bod zvlášť.
  const lonNa = (x) => meze.zapad + (x / lesy.w) * (meze.vychod - meze.zapad)
  const latNa = (y) => {
    const ym = meze.ySever + (y / lesy.h) * (meze.yJih - meze.ySever)
    return (Math.atan(Math.sinh(Math.PI * (1 - 2 * ym))) * 180) / Math.PI
  }

  for (let y = y0; y <= y1 && prvky.length < STROP; y += krok) {
    for (let x = x0; x <= x1 && prvky.length < STROP; x += krok) {
      const i = y * lesy.w + x
      const les = lesy.data[i]
      const hora = hory.data[i]
      if (!les && !hora) continue

      // Rozházení uvnitř oka sítě, ať to není mřížka. Z hashe, ne z náhody:
      // tatáž buňka musí dát pokaždé tentýž strom na tomtéž místě, jinak by
      // les při každém překreslení poskočil.
      const jx = x + (hash(x, y, 1) - 0.5) * krok * 0.9
      const jy = y + (hash(x, y, 2) - 0.5) * krok * 0.9
      const v = hash(x, y, 3)

      // Hora vyhrává nad lesem: na hřebeni má být vidět skála, ne smrk.
      let ik
      let im
      if (hora) {
        ik = `${DRUHY_HOR[hora]}-${která(4, v)}`
        im = `maly-teren-${hora}`
      } else {
        const zaklad = les === 2 ? 'jehl' : 'list'
        const zrcadlo = hash(x, y, 4) > 0.5 ? 'z' : ''
        ik = `${zaklad}-${která(16, v)}${zrcadlo}`
        im = `maly-${zaklad}-${která(4, v)}${zrcadlo}`
      }

      prvky.push({
        type: 'Feature',
        properties: { ik, im, v: +(0.85 + v * 0.35).toFixed(2) },
        geometry: { type: 'Point', coordinates: [+lonNa(jx).toFixed(4), +latNa(jy).toFixed(4)] },
      })
    }
  }

  return { type: 'FeatureCollection', features: prvky }
}
