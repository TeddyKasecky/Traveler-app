/**
 * Řezání listů z `grafika/` na jednotlivé kresby — sdílené primitivy.
 *
 * Používá to `make-kresba.mjs` (stromy, hory, sídla) a `make-auta.mjs`
 * (ikony aut). Kdyby si každý skript nesl vlastní kopii, rozešly by se
 * v prazích a jeden list by se řezal jinak než druhý.
 *
 * Listy z generátoru mají tři vlastnosti, se kterými se tu počítá:
 *   - kolem kreseb bývá křiklavě žlutý a červený lem po klíčování,
 *   - obsah nesedí přesně na mřížce, takže se řady a sloupce musí najít
 *     podle prázdných pruhů, ne spočítat,
 *   - v prázdné ploše se povalují osamělé tečky, takže se kresba hledá jako
 *     největší souvislý ostrůvek, ne jako obal všeho neprůhledného.
 */

import fs from 'node:fs'
import path from 'node:path'

/**
 * Kde leží složka `grafika/` s podklady.
 *
 * Hledá se na dvou místech, protože se za život projektu stěhovala: dřív
 * ležela vedle repozitáře (`Traveler/grafika/`), dnes je uvnitř
 * (`vandrbuch/grafika/`). Skripty na ni měly cestu napsanou natvrdo na to
 * první místo a po přesunu spadly na „chybí list", i když list byl na disku.
 * Do repozitáře se nekomituje (89 MB, `.gitignore`), takže se na tom nedá
 * spolehnout ani na čerstvém klonu – proto zkouška, ne pevná cesta.
 *
 * @param {string} root  kořen repozitáře (`vandrbuch/`)
 * @returns {string} cesta ke složce; když není ani jedna, ta uvnitř repa
 */
export function slozkaGrafiky(root) {
  const uvnitr = path.join(root, 'grafika')
  const vedle = path.join(root, '..', 'grafika')
  if (fs.existsSync(uvnitr)) return uvnitr
  if (fs.existsSync(vedle)) return vedle
  return uvnitr
}

/** Od jaké průhlednosti se pixel počítá za kresbu. */
export const PRAH = 32
/** Menší ostrůvky než tolik pixelů jsou tečky po klíčování, ne kresba. */
export const MIN_PLOCHA = 400

/**
 * Zprůhlední křiklavě žlutý a červený lem.
 *
 * Podmínka je schválně úzká: sytost přes 0,75 **a** jas přes 200 **a** modrá
 * složka pod 120. Nejtmavší barva ilustrací, která se tomu blíží, je střecha
 * (#A6714B) – ta má jas 166, takže se pod hranici nedostane.
 */
export function bezLemu(px, w, h) {
  for (let i = 0; i < w * h; i++) {
    const j = i * 4
    if (!px[j + 3]) continue
    const r = px[j]
    const g = px[j + 1]
    const b = px[j + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    if (max >= 200 && b < 120 && (max - min) / max >= 0.75) px[j + 3] = 0
    // Poloprůhledná mlha kolem kresby je zbytek téhož klíčování.
    else if (px[j + 3] < 24) px[j + 3] = 0
  }
}

/**
 * Ubere pixel po obvodu a okraj změkčí.
 *
 * Po odstranění lemu zůstává tvrdá hrana s příměsí lemu v poloprůhledných
 * pixelech. Eroze ji uřízne, rozostření alfy vrátí měkký okraj – bez toho
 * by kresby vypadaly jako vystřižené nůžkami.
 */
export function zmekcit(px, w, h) {
  const a = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) a[i] = px[i * 4 + 3]

  const erodovana = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let min = a[i]
      if (x > 0) min = Math.min(min, a[i - 1])
      if (x < w - 1) min = Math.min(min, a[i + 1])
      if (y > 0) min = Math.min(min, a[i - w])
      if (y < h - 1) min = Math.min(min, a[i + w])
      erodovana[i] = min
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let soucet = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          soucet += erodovana[ny * w + nx]
          n++
        }
      }
      px[i * 4 + 3] = Math.round(soucet / n)
    }
  }
}

/**
 * Rozdělí rozsah na pásy oddělené prázdnem.
 *
 * MŘÍŽKA SE NEPOČÍTÁ, HLEDÁ SE. Listy mívají obsah posazený jinde, než kam
 * by padla pravidelná mřížka, a dělení napevno kresby řezalo. Když pásů
 * nevyjde přesně tolik, kolik se čeká, vrací se null a volající sáhne po
 * rovnoměrném dělení (`naDil`).
 *
 * @param {number[]} soucty  součet průhlednosti po řádcích nebo sloupcích
 * @param {number} kolik  kolik pásů se čeká
 * @param {number} celkem  délka rozsahu
 * @returns {Array<[number, number]>|null}
 */
export function pasy(soucty, kolik, celkem) {
  // Za prázdno se bere řádek, ve kterém je míň než promile plné plochy –
  // ne úplná nula: po klíčování zbývají ojedinělé body i v prázdnu.
  const mez = Math.max(1, Math.round(soucty.reduce((a, b) => a + b, 0) / soucty.length / 40))
  const out = []
  let od = -1
  for (let i = 0; i < soucty.length; i++) {
    const plny = soucty[i] > mez
    if (plny && od < 0) od = i
    else if (!plny && od >= 0) {
      out.push([od, i - 1])
      od = -1
    }
  }
  if (od >= 0) out.push([od, soucty.length - 1])

  // Drobné ostrůvky slepit k sousedovi: stín pod kresbou bývá o pár bodů
  // odsazený a tvořil by vlastní pás.
  const min = celkem / (kolik * 6)
  const slepene = []
  for (const p of out) {
    const posledni = slepene[slepene.length - 1]
    if (posledni && (p[0] - posledni[1] < min || p[1] - p[0] < min)) posledni[1] = p[1]
    else slepene.push([...p])
  }
  return slepene.length === kolik ? slepene : null
}

/** Rovnoměrné dělení, když se pásy najít nedají. */
export function naDil(od, do_, kolik) {
  const krok = (do_ - od + 1) / kolik
  return Array.from({ length: kolik }, (_, i) => [Math.round(od + i * krok), Math.round(od + (i + 1) * krok) - 1])
}

/**
 * Najde v buňce kresbu a vrátí její obdélník.
 *
 * Nebere se prostě obal všeho neprůhledného: po klíčování zbývají v prázdné
 * ploše tečky a ty by obdélník nafoukly na celou buňku. Hledají se proto
 * souvislé ostrůvky a nechá se největší i s těmi, které mu velikostí sahají
 * aspoň po kotníky a leží nad ním nebo pod ním – ostrůvek stojící stranou
 * je kus sousední kresby, kterou dělení uřízlo o pár bodů vedle.
 *
 * @returns {{left: number, top: number, width: number, height: number}|null}
 */
export function najdiKresbu(px, w, h, bunka) {
  const { bx, by, bw, bh } = bunka
  const videno = new Uint8Array(bw * bh)
  const ostruvky = []
  const zasobnik = []

  for (let sy = 0; sy < bh; sy++) {
    for (let sx = 0; sx < bw; sx++) {
      const si = sy * bw + sx
      if (videno[si]) continue
      if (px[((by + sy) * w + bx + sx) * 4 + 3] < PRAH) {
        videno[si] = 1
        continue
      }
      // Šířka do stran, ne rekurzí: ostrůvek může mít statisíce pixelů
      // a rekurze by přetekla zásobník.
      let plocha = 0
      let x0 = bw
      let x1 = -1
      let y0 = bh
      let y1 = -1
      zasobnik.push(si)
      videno[si] = 1
      while (zasobnik.length) {
        const i = zasobnik.pop()
        const x = i % bw
        const y = (i / bw) | 0
        plocha++
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue
          const ni = ny * bw + nx
          if (videno[ni]) continue
          videno[ni] = 1
          if (px[((by + ny) * w + bx + nx) * 4 + 3] >= PRAH) zasobnik.push(ni)
        }
      }
      if (plocha >= MIN_PLOCHA) ostruvky.push({ plocha, x0, x1, y0, y1 })
    }
  }

  if (!ostruvky.length) return null
  const nej = ostruvky.reduce((a, b) => (b.plocha > a.plocha ? b : a))
  const patri = ostruvky.filter((o) => o.plocha >= nej.plocha * 0.15 && o.x1 >= nej.x0 && o.x0 <= nej.x1)

  const x0 = Math.min(...patri.map((o) => o.x0))
  const x1 = Math.max(...patri.map((o) => o.x1))
  const y0 = Math.min(...patri.map((o) => o.y0))
  const y1 = Math.max(...patri.map((o) => o.y1))
  return { left: bx + x0, top: by + y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
}

/**
 * Najde na listu mřížku buněk: řady podle prázdných pruhů, sloupce zvlášť
 * uvnitř každé řady (kresby v různých řadách nemají stejnou šířku).
 *
 * @param {Uint8Array|Buffer} px  RGBA listu
 * @param {number} w
 * @param {number} h
 * @param {number} radku
 * @param {number} sloupcu
 * @returns {Array<{r: number, c: number, bx: number, by: number, bw: number, bh: number}>}
 */
export function najdiMrizku(px, w, h, radku, sloupcu) {
  const poRadcich = new Array(h).fill(0)
  for (let y = 0; y < h; y++) {
    let s = 0
    for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] >= PRAH) s++
    poRadcich[y] = s
  }
  const rady = pasy(poRadcich, radku, h) || naDil(0, h - 1, radku)

  const bunky = []
  for (let r = 0; r < radku; r++) {
    const [ry0, ry1] = rady[r]
    const poSloupcich = new Array(w).fill(0)
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let y = ry0; y <= ry1; y++) if (px[(y * w + x) * 4 + 3] >= PRAH) s++
      poSloupcich[x] = s
    }
    const sloupce = pasy(poSloupcich, sloupcu, w) || naDil(0, w - 1, sloupcu)
    for (let c = 0; c < sloupcu; c++) {
      const [cx0, cx1] = sloupce[c]
      bunky.push({ r, c, bx: cx0, by: ry0, bw: cx1 - cx0 + 1, bh: ry1 - ry0 + 1 })
    }
  }
  return bunky
}
