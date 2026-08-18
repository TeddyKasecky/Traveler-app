/**
 * Čtení a filtrování vektorových dlaždic (Mapbox Vector Tile) bez závislostí.
 *
 * Používá to `make-mapa.mjs` na tři věci:
 *   1. vyhodit z dlaždice vrstvy, které styl nekreslí (65 % balíku),
 *   2. vytáhnout z vrstvy `places` sídla do `src/data/mesta.json`,
 *   3. vytáhnout z vrstvy `landcover` lesy, aby se do nich daly nasypat kresby.
 *
 * PROČ VLASTNÍ A NE `@mapbox/vector-tile`: kvůli bodu 1 stačí projít wire
 * formát a chunky přeskakovat, aniž by se cokoli dekódovalo – to je pár desítek
 * řádků. Body 2 a 3 potřebují geometrii, ale jen body a mnohoúhelníky, ne celý
 * formát. Za to nestojí dvě závislosti navíc do repozitáře, který jich má
 * v běhu dvě a v nástrojích čtyři.
 *
 * Schéma (proto soubor vector_tile.proto):
 *   Tile    { repeated Layer layers = 3 }
 *   Layer   { string name = 1, repeated Feature features = 2, repeated string keys = 3,
 *             repeated Value values = 4, uint32 extent = 5, uint32 version = 15 }
 *   Feature { uint64 id = 1, repeated uint32 tags = 2, GeomType type = 3,
 *             repeated uint32 geometry = 4 }
 *   Value   { string 1, float 2, double 3, int64 4, uint64 5, sint64 6, bool 7 }
 */

/** Typy geometrie podle protokolu. */
export const BOD = 1
export const CARA = 2
export const PLOCHA = 3

/**
 * Přečte varint. Vrací hodnotu a novou pozici.
 *
 * Skládá se násobením, ne posunem: posun v JavaScriptu pracuje na 32 bitech
 * a u delších varintů (identifikátory prvků) by tiše přetekl.
 *
 * @param {Buffer|Uint8Array} b
 * @param {number} p
 * @returns {[number, number]}
 */
export function varint(b, p) {
  let x = 0
  let s = 1
  for (;;) {
    const c = b[p++]
    x += (c & 0x7f) * s
    if (!(c & 0x80)) return [x, p]
    s *= 128
  }
}

/** Přeskočí pole podle typu na drátě a vrátí pozici za ním. */
function preskoc(b, p, typ) {
  if (typ === 0) return varint(b, p)[1]
  if (typ === 1) return p + 8
  if (typ === 5) return p + 4
  if (typ === 2) {
    const [d, q] = varint(b, p)
    return q + d
  }
  throw new Error(`neznámý typ pole ${typ}`)
}

/**
 * Projde pole zprávy a na každé zavolá `kdyz(cislo, typ, pozice)`.
 * Návratová hodnota `kdyz` se ignoruje; posun řeší tahle funkce.
 */
function projdi(b, od, do_, kdyz) {
  let p = od
  while (p < do_) {
    const [tag, q] = varint(b, p)
    kdyz(tag >> 3, tag & 7, q)
    p = preskoc(b, q, tag & 7)
  }
}

/** Vrátí obsah length-delimited pole jako podpole. */
function kus(b, p) {
  const [d, q] = varint(b, p)
  return b.subarray(q, q + d)
}

/** Jméno vrstvy, aniž by se dekódovalo cokoli dalšího. */
function jmenoVrstvy(v) {
  let jmeno = ''
  projdi(v, 0, v.length, (pole, typ, p) => {
    if (pole === 1 && typ === 2 && !jmeno) jmeno = Buffer.from(kus(v, p)).toString('utf8')
  })
  return jmeno
}

/** Zakóduje varint do pole bajtů. */
function zapisVarint(x, out) {
  while (x >= 0x80) {
    out.push((x & 0x7f) | 0x80)
    x = Math.floor(x / 128)
  }
  out.push(x)
}

/**
 * Vyhodí z dlaždice vrstvy, které nejsou v `nechat`.
 *
 * Zbylé vrstvy se **opisují bajt po bajtu**, nedekódují se – výsledek je tedy
 * pořád platná dlaždice a nemůže se v ní nic ztratit překódováním.
 *
 * @param {Buffer} b  rozbalená dlaždice
 * @param {Set<string>} nechat  jména vrstev, které mají zůstat
 * @returns {Buffer}
 */
export function filtrujVrstvy(b, nechat) {
  const casti = []
  let p = 0
  while (p < b.length) {
    const [tag, q] = varint(b, p)
    const pole = tag >> 3
    const typ = tag & 7
    const konec = preskoc(b, q, typ)

    if (pole === 3 && typ === 2) {
      const v = kus(b, q)
      if (nechat.has(jmenoVrstvy(v))) {
        const hlavicka = []
        zapisVarint(tag, hlavicka)
        zapisVarint(v.length, hlavicka)
        casti.push(Buffer.from(hlavicka), Buffer.from(v))
      }
    } else {
      // Cokoli jiného na nejvyšší úrovni se opíše beze změny. Dnes tam nic
      // není, ale zahodit neznámé pole by z dlaždice udělalo něco jiného.
      casti.push(b.subarray(p, konec))
    }
    p = konec
  }
  return Buffer.concat(casti)
}

/** Rozbalí `Value` na obyčejnou hodnotu. */
function hodnota(v) {
  let out = null
  projdi(v, 0, v.length, (pole, typ, p) => {
    if (pole === 1 && typ === 2) out = Buffer.from(kus(v, p)).toString('utf8')
    else if (pole === 5 && typ === 0) out = varint(v, p)[0]
    else if (pole === 4 && typ === 0) out = varint(v, p)[0]
    else if (pole === 6 && typ === 0) {
      const [x] = varint(v, p)
      out = (x >>> 1) ^ -(x & 1)
    } else if (pole === 7 && typ === 0) out = !!varint(v, p)[0]
    else if (pole === 2 && typ === 5) out = v.readFloatLE(p)
    else if (pole === 3 && typ === 1) out = v.readDoubleLE(p)
  })
  return out
}

/**
 * Rozebere geometrii prvku na kusy souřadnic v dlaždicových jednotkách.
 *
 * Vrací pole kusů: u bodů jeden kus se všemi body, u čar a ploch jeden kus
 * na čáru nebo prstenec. Souřadnice jsou relativní k dlaždici, přepočet na
 * zeměpisné dělá `naGeo()`.
 *
 * @param {number[]} g  proud příkazů
 * @returns {Array<Array<[number, number]>>}
 */
function geometrie(g) {
  const kusy = []
  let aktualni = null
  let x = 0
  let y = 0
  let i = 0
  while (i < g.length) {
    const prikaz = g[i] & 0x7
    const kolik = g[i] >> 3
    i++
    if (prikaz === 1 || prikaz === 2) {
      for (let k = 0; k < kolik; k++) {
        x += (g[i] >>> 1) ^ -(g[i] & 1)
        y += (g[i + 1] >>> 1) ^ -(g[i + 1] & 1)
        i += 2
        if (prikaz === 1) {
          // MoveTo začíná nový kus – u bodů jich může být víc za sebou.
          aktualni = [[x, y]]
          kusy.push(aktualni)
        } else aktualni.push([x, y])
      }
    } else {
      // ClosePath nenese souřadnice, prstenec se uzavírá sám.
      i += 0
    }
  }
  return kusy
}

/**
 * Rozebere jednu vrstvu dlaždice.
 *
 * @param {Buffer} b  rozbalená dlaždice
 * @param {string} jmeno  která vrstva
 * @returns {{extent: number, prvky: Array<{typ: number, vlastnosti: Record<string, any>, kusy: Array<Array<[number, number]>>}>}|null}
 */
export function vrstva(b, jmeno) {
  let nalezena = null
  projdi(b, 0, b.length, (pole, typ, p) => {
    if (pole !== 3 || typ !== 2 || nalezena) return
    const v = kus(b, p)
    if (jmenoVrstvy(v) === jmeno) nalezena = v
  })
  if (!nalezena) return null

  const v = nalezena
  const klice = []
  const hodnoty = []
  const syrovePrvky = []
  let extent = 4096

  projdi(v, 0, v.length, (pole, typ, p) => {
    if (pole === 2 && typ === 2) syrovePrvky.push(kus(v, p))
    else if (pole === 3 && typ === 2) klice.push(Buffer.from(kus(v, p)).toString('utf8'))
    else if (pole === 4 && typ === 2) hodnoty.push(hodnota(kus(v, p)))
    else if (pole === 5 && typ === 0) extent = varint(v, p)[0]
  })

  const prvky = []
  for (const f of syrovePrvky) {
    let druh = BOD
    const tagy = []
    const g = []
    projdi(f, 0, f.length, (pole, typ, p) => {
      if (pole === 3 && typ === 0) druh = varint(f, p)[0]
      else if (pole === 2 && typ === 2) {
        const c = kus(f, p)
        let q = 0
        while (q < c.length) {
          const [x, n] = varint(c, q)
          tagy.push(x)
          q = n
        }
      } else if (pole === 4 && typ === 2) {
        const c = kus(f, p)
        let q = 0
        while (q < c.length) {
          const [x, n] = varint(c, q)
          g.push(x)
          q = n
        }
      }
    })

    const vlastnosti = {}
    for (let k = 0; k + 1 < tagy.length; k += 2) vlastnosti[klice[tagy[k]]] = hodnoty[tagy[k + 1]]
    prvky.push({ typ: druh, vlastnosti, kusy: geometrie(g) })
  }

  return { extent, prvky }
}

/**
 * Přepočte souřadnici uvnitř dlaždice na zeměpisnou.
 *
 * @param {number} px  x v dlaždicových jednotkách
 * @param {number} py  y v dlaždicových jednotkách
 * @param {number} z
 * @param {number} tx  číslo dlaždice ve směru x
 * @param {number} ty  číslo dlaždice ve směru y
 * @param {number} extent
 * @returns {[number, number]}  [lat, lon]
 */
export function naGeo(px, py, z, tx, ty, extent) {
  const n = 2 ** z
  const lon = ((tx + px / extent) / n) * 360 - 180
  const y = 1 - 2 * ((ty + py / extent) / n)
  const lat = (Math.atan(Math.sinh(Math.PI * y)) * 180) / Math.PI
  return [lat, lon]
}

/** Plocha mnohoúhelníku v dlaždicových jednotkách. Kladná = vnější prstenec. */
export function plocha(prstenec) {
  let s = 0
  for (let i = 0, j = prstenec.length - 1; i < prstenec.length; j = i++) {
    s += (prstenec[j][0] - prstenec[i][0]) * (prstenec[j][1] + prstenec[i][1])
  }
  return s / 2
}

/** Leží bod uvnitř prstence? Souřadnice jsou [x, y]. */
export function uvnitr(x, y, prstenec) {
  let je = false
  for (let i = 0, j = prstenec.length - 1; i < prstenec.length; j = i++) {
    const [xi, yi] = prstenec[i]
    const [xj, yj] = prstenec[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) je = !je
  }
  return je
}
