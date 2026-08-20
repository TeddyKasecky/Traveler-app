/**
 * proč: živé sledování (views/plan/cesta-zivot.js) potřebuje najít nejbližší
 * bod na uložené polyline k aktuální poloze a spočítat zbývající vzdálenost
 * k cíli – čistě klientsky, bez dalšího volání API. Nic takového v repu
 * není: point-to-line je jiná úloha než `stredTrasy()` v map/planLine.js
 * (ta umí jen „bod v dané délce PODÉL čáry“, ne „nejbližší bod k
 * libovolnému bodu MIMO čáru“).
 *
 * ZJEDNODUŠENÍ, VĚDOMÉ: promítá se v rovinné aproximaci (lat/lon jako
 * kartézské souřadnice s korekcí zeměpisné šířky pro délku – stejný
 * přístup jako `dkm()` v core/geo.js), ne na skutečné kouli. Pro úseky
 * v řádu kilometrů/desítek km (rozsah appky) je chyba zanedbatelná.
 */

import { dkm } from './geo.js'

/**
 * Promítne bod na úsečku a vrátí nejbližší bod na ní + parametr t (0..1).
 * @param {{lat: number, lon: number}} p
 * @param {{lat: number, lon: number}} a
 * @param {{lat: number, lon: number}} b
 */
function projekceNaUsecku(p, a, b) {
  const k = Math.cos((a.lat * Math.PI) / 180)
  const bx = (b.lon - a.lon) * k
  const by = b.lat - a.lat
  const px = (p.lon - a.lon) * k
  const py = p.lat - a.lat
  const abLenSq = bx * bx + by * by
  let t = abLenSq ? (px * bx + py * by) / abLenSq : 0
  t = Math.max(0, Math.min(1, t))
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, t }
}

/**
 * Najde nejbližší bod na celé lomené čáře a zbývající vzdálenost k jejímu konci.
 * @param {{lat: number, lon: number}} poloha
 * @param {Array<[number, number]>} polyline  [[lat, lon], ...]
 * @returns {{bod: {lat: number, lon: number}, segmentIdx: number, zbyvaKm: number, vzdalenostOdTrasyKm: number}|null}
 */
export function projektujNaTrasu(poloha, polyline) {
  if (!polyline || polyline.length < 2) return null
  let nejlepsi = null
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = { lat: polyline[i][0], lon: polyline[i][1] }
    const b = { lat: polyline[i + 1][0], lon: polyline[i + 1][1] }
    const proj = projekceNaUsecku(poloha, a, b)
    const d = dkm(poloha, proj)
    if (!nejlepsi || d < nejlepsi.d) nejlepsi = { d, proj, i, a, b }
  }
  let zbyva = dkm(nejlepsi.proj, nejlepsi.b)
  for (let i = nejlepsi.i + 1; i < polyline.length - 1; i++) {
    zbyva += dkm({ lat: polyline[i][0], lon: polyline[i][1] }, { lat: polyline[i + 1][0], lon: polyline[i + 1][1] })
  }
  return { bod: nejlepsi.proj, segmentIdx: nejlepsi.i, zbyvaKm: zbyva, vzdalenostOdTrasyKm: nejlepsi.d }
}
