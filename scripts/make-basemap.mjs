/**
 * Vyrobí podklad pro offline mapu ze zdrojů Natural Earth.
 *
 *   node scripts/make-basemap.mjs
 *
 * Pouští se ručně, jen když je potřeba podklad přegenerovat. Výsledek
 * `src/data/basemap.json` je v repozitáři, takže build ani nasazení na síť nechodí.
 *
 * PROČ TO VŮBEC JE: dlaždice z OpenStreetMap se offline neukládají a hromadně
 * stahovat se nesmějí (podmínky OSM). Bez signálu tedy byla mapa šedá. Tenhle
 * podklad je náhrada – pobřeží, hranice, jezera, řeky a města. Není to mapa na
 * navigaci, je to mapa na „kde zhruba jsme".
 *
 * Natural Earth je public domain, takže s ním není žádná licenční past.
 *
 * Velikost se drží dole třemi věcmi:
 *   - zjednodušením obrysů (Ramer–Douglas–Peucker, vlastní, bez závislosti),
 *   - hrubším zjednodušením mimo Evropu, kde stačí obrys pro orientaci,
 *   - zaokrouhlením souřadnic a zahozením všech vlastností kromě názvu města.
 *
 * Souřadnice se ukládají jako [lat, lon], ne [lon, lat] jako v GeoJSON. Leaflet
 * je chce v tomhle pořadí a je zbytečné otáčet tisíce bodů v telefonu.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CIL = path.join(ROOT, 'src', 'data', 'basemap.json')
const CACHE = path.join(ROOT, 'node_modules', '.cache', 'basemap')
const ZDROJ = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson'

/** Kde chceme detail: Evropa i s kusem okolí. Zbytek světa jen hrubě. */
const EVROPA = { minLat: 33, maxLat: 72, minLon: -26, maxLon: 46 }

/** Zjednodušení ve stupních. V Evropě jemněji, jinde hrubě. */
const TOL_DETAIL = 0.012
const TOL_HRUBE = 0.3

/** Desetinná místa souřadnic. Tři ≈ 100 m, na přehledovou mapu bohatě stačí. */
const MIST_DETAIL = 3
const MIST_HRUBE = 2

/** Nejmenší plocha útvaru (ve čtverečních stupních), pod kterou se zahazuje. */
const MIN_PLOCHA_DETAIL = 0.002
const MIN_PLOCHA_HRUBE = 0.5

/** Města: menší číslo = významnější. V Evropě pustíme dál, jinde jen ta hlavní. */
const MESTA_DETAIL = 5
const MESTA_HRUBE = 1

/* ================= stažení ================= */

/** Stáhne soubor a nechá si ho v node_modules/.cache, ať se to nestahuje pokaždé. */
async function stahni(jmeno) {
  fs.mkdirSync(CACHE, { recursive: true })
  const soubor = path.join(CACHE, `${jmeno}.geojson`)
  if (fs.existsSync(soubor)) {
    console.log(`  ${jmeno} – z mezipaměti`)
    return JSON.parse(fs.readFileSync(soubor, 'utf8'))
  }
  process.stdout.write(`  ${jmeno} – stahuji… `)
  const r = await fetch(`${ZDROJ}/${jmeno}.geojson`)
  if (!r.ok) throw new Error(`${jmeno}: HTTP ${r.status}`)
  const text = await r.text()
  fs.writeFileSync(soubor, text)
  console.log(`${(text.length / 1024 / 1024).toFixed(1)} MB`)
  return JSON.parse(text)
}

/* ================= geometrie ================= */

/** Leží bod v oblasti s detailem? */
const vEvrope = (lat, lon) =>
  lat >= EVROPA.minLat && lat <= EVROPA.maxLat && lon >= EVROPA.minLon && lon <= EVROPA.maxLon

/** Zasahuje obrys do Evropy? Stačí jediný bod. */
const zasahujeDoEvropy = (body) => body.some(([lon, lat]) => vEvrope(lat, lon))

/** Kolmá vzdálenost bodu od úsečky, ve stupních. Na porovnání to stačí. */
function vzdalenostOdUsecky(b, a, c) {
  const dx = c[0] - a[0]
  const dy = c[1] - a[1]
  if (dx === 0 && dy === 0) return Math.hypot(b[0] - a[0], b[1] - a[1])
  const t = Math.max(0, Math.min(1, ((b[0] - a[0]) * dx + (b[1] - a[1]) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(b[0] - (a[0] + t * dx), b[1] - (a[1] + t * dy))
}

/**
 * Ramer–Douglas–Peucker. Nerekurzivní schválně: některé obrysy mají přes deset
 * tisíc bodů a rekurze by na nich přetekla zásobník.
 */
function zjednodus(body, tolerance) {
  if (body.length < 3) return body
  const drzet = new Uint8Array(body.length)
  drzet[0] = 1
  drzet[body.length - 1] = 1

  const zasobnik = [[0, body.length - 1]]
  while (zasobnik.length) {
    const [od, do_] = zasobnik.pop()
    let nejdal = 0
    let kde = -1
    for (let i = od + 1; i < do_; i++) {
      const d = vzdalenostOdUsecky(body[i], body[od], body[do_])
      if (d > nejdal) {
        nejdal = d
        kde = i
      }
    }
    if (nejdal > tolerance && kde > 0) {
      drzet[kde] = 1
      zasobnik.push([od, kde], [kde, do_])
    }
  }
  return body.filter((_, i) => drzet[i])
}

/** Plocha obrysu ve čtverečních stupních (shoelace). Jen na porovnání velikostí. */
function plocha(body) {
  let s = 0
  for (let i = 0, j = body.length - 1; i < body.length; j = i++) {
    s += (body[j][0] + body[i][0]) * (body[j][1] - body[i][1])
  }
  return Math.abs(s / 2)
}

/**
 * Zpracuje jeden obrys: zjednoduší, zaokrouhlí a otočí na [lat, lon].
 * Vrátí null, když je útvar tak malý, že nemá smysl ho kreslit.
 */
function obrys(body, detail, minPlocha) {
  if (plocha(body) < minPlocha) return null
  const zj = zjednodus(body, detail ? TOL_DETAIL : TOL_HRUBE)
  if (zj.length < 3) return null
  const m = detail ? MIST_DETAIL : MIST_HRUBE
  return zj.map(([lon, lat]) => [+lat.toFixed(m), +lon.toFixed(m)])
}

/** Rozloží Polygon i MultiPolygon na jednotlivé vnější obrysy. */
function obrysyPlochy(geom) {
  if (!geom) return []
  if (geom.type === 'Polygon') return [geom.coordinates[0]]
  if (geom.type === 'MultiPolygon') return geom.coordinates.map((c) => c[0])
  return []
}

/** Rozloží LineString i MultiLineString na jednotlivé čáry. */
function cary(geom) {
  if (!geom) return []
  if (geom.type === 'LineString') return [geom.coordinates]
  if (geom.type === 'MultiLineString') return geom.coordinates
  return []
}

/* ================= sestavení ================= */

console.log('Stahuji podklady z Natural Earth (public domain):')

const [zeme, jezera, reky, mesta] = await Promise.all([
  stahni('ne_50m_admin_0_countries'),
  stahni('ne_50m_lakes'),
  stahni('ne_50m_rivers_lake_centerlines'),
  stahni('ne_50m_populated_places'),
])

/** Plochy: země se kreslí vyplněné (souš) a obtažené (hranice) v jednom. */
function zpracujPlochy(kolekce, minDetail, minHrube) {
  const out = []
  for (const f of kolekce.features) {
    for (const ring of obrysyPlochy(f.geometry)) {
      const detail = zasahujeDoEvropy(ring)
      const o = obrys(ring, detail, detail ? minDetail : minHrube)
      if (o) out.push(o)
    }
  }
  return out
}

const podklad = {
  /**
   * Popis se ukládá do souboru schválně – kdo ho jednou otevře, má hned jasno,
   * odkud data jsou a v jakém pořadí jsou souřadnice.
   */
  _o: 'Podklad offline mapy. Natural Earth (public domain). Souřadnice [lat, lon].',
  zeme: zpracujPlochy(zeme, MIN_PLOCHA_DETAIL, MIN_PLOCHA_HRUBE),
  jezera: zpracujPlochy(jezera, MIN_PLOCHA_DETAIL, 2),
  reky: [],
  mesta: [],
}

// Řeky jen v Evropě. Jinde by přidaly kilobajty a orientaci nezlepšily.
for (const f of reky.features) {
  for (const cara of cary(f.geometry)) {
    if (!zasahujeDoEvropy(cara)) continue
    const zj = zjednodus(cara, TOL_DETAIL)
    if (zj.length < 2) continue
    podklad.reky.push(zj.map(([lon, lat]) => [+lat.toFixed(MIST_DETAIL), +lon.toFixed(MIST_DETAIL)]))
  }
}

// Města: [lat, lon, název]. Mimo Evropu jen ta úplně hlavní, ať je vidět kontext.
for (const f of mesta.features) {
  const [lon, lat] = f.geometry.coordinates
  const rank = f.properties.SCALERANK ?? 99
  const detail = vEvrope(lat, lon)
  if (rank > (detail ? MESTA_DETAIL : MESTA_HRUBE)) continue
  const nazev = f.properties.NAME || f.properties.NAMEASCII || ''
  if (!nazev) continue
  const m = detail ? MIST_DETAIL : MIST_HRUBE
  podklad.mesta.push([+lat.toFixed(m), +lon.toFixed(m), nazev])
}

podklad.mesta.sort((a, b) => a[2].localeCompare(b[2], 'cs'))

/* ================= zápis ================= */

const text = JSON.stringify(podklad)
fs.writeFileSync(CIL, text)

const kb = (s) => `${(JSON.stringify(s).length / 1024).toFixed(0)} kB`
const bodu = (s) => s.reduce((n, x) => n + x.length, 0)

console.log('\nHotovo:')
console.log(`  země   ${String(podklad.zeme.length).padStart(5)} obrysů, ${bodu(podklad.zeme)} bodů  ${kb(podklad.zeme)}`)
console.log(`  jezera ${String(podklad.jezera.length).padStart(5)} obrysů, ${bodu(podklad.jezera)} bodů  ${kb(podklad.jezera)}`)
console.log(`  řeky   ${String(podklad.reky.length).padStart(5)} čar,    ${bodu(podklad.reky)} bodů  ${kb(podklad.reky)}`)
console.log(`  města  ${String(podklad.mesta.length).padStart(5)}                     ${kb(podklad.mesta)}`)
console.log(`\n  celkem ${(text.length / 1024).toFixed(0)} kB → ${path.relative(ROOT, CIL)}`)
