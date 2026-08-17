/**
 * Export trasy do GPX.
 *
 * PROČ VŮBEC: Google, Apple i Waze umějí spolehlivě jen jeden cíl, Google navíc
 * nejvýš deset bodů v odkazu. Na vícedenní výpravu s dvaceti zastávkami tedy
 * žádná z nich nestačí. GPX je formát, který otevře Organic Maps, OsmAnd, Locus,
 * Mapy.cz i Garmin — a hlavně funguje bez signálu, což je na cestě to podstatné.
 *
 * CO SE DO SOUBORU DÁVÁ:
 *   - `<wpt>` pro každou zastávku (název, popis, poznámka),
 *   - `<rte>` se stejnými body v pořadí plánu.
 * Obojí schválně: některé aplikace umějí jen body, jiné jen trasu.
 *
 * Nekreslí se `<trk>` — to je záznam skutečně projeté stopy a tu aplikace nemá.
 * Vymyslet ji z rovných spojnic by v mapě vypadalo jako trasa po silnici,
 * a přitom by vedla přes pole a jezera.
 */

/**
 * Text do XML. Ošetřuje se víc než v `core/html.js`: v XML musí být ošetřený
 * i apostrof a uvozovka, jinak by název s uvozovkou rozbil atribut.
 * @param {string} s
 */
const x = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

/** Souřadnice na šest desetinných míst, což je zhruba deset centimetrů. */
const sour = (n) => Number(n).toFixed(6)

/**
 * Sestaví GPX 1.1 z plánu.
 *
 * @param {string} nazev      název výpravy
 * @param {Array<Record<string, any>>} items  zastávky v pořadí plánu
 * @param {Record<string, string>} [poznamky] poznámky podle id
 * @returns {string}
 */
export function gpxZPlanu(nazev, items, poznamky = {}) {
  const jmeno = x(nazev || 'Vandrbuch')

  const popis = (p) => {
    const casti = [p.t, p.r || p.z, p.d].filter(Boolean)
    const pozn = (poznamky[p.id] || '').trim()
    return x([casti.join(' · '), pozn].filter(Boolean).join('\n'))
  }

  const body = items
    .map(
      (p) =>
        `  <wpt lat="${sour(p.lat)}" lon="${sour(p.lon)}">\n` +
        `    <name>${x(p.n)}</name>\n` +
        `    <desc>${popis(p)}</desc>\n` +
        `  </wpt>`
    )
    .join('\n')

  const trasa = items
    .map(
      (p) =>
        `    <rtept lat="${sour(p.lat)}" lon="${sour(p.lon)}">\n` +
        `      <name>${x(p.n)}</name>\n` +
        `    </rtept>`
    )
    .join('\n')

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="Vandrbuch" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `  <metadata>\n    <name>${jmeno}</name>\n  </metadata>\n` +
    `${body}\n` +
    `  <rte>\n    <name>${jmeno}</name>\n${trasa}\n  </rte>\n` +
    `</gpx>\n`
  )
}

/** Název souboru bez znaků, které souborovým systémům vadí. */
export function nazevSouboru(nazev) {
  const zaklad = (nazev || 'vandrbuch-trasa').trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 60)
  return `${zaklad || 'vandrbuch-trasa'}.gpx`
}
