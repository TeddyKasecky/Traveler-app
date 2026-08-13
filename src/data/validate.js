/**
 * Kontrola dat míst.
 *
 * Čistý JavaScript bez Node API, aby to šlo spustit z obou stran:
 *   - `scripts/validate-data.mjs` (npm run validate, pre-commit hook)
 *   - formulář na přidání místa v prohlížeči
 *
 * Formulář a CLI musí hlásit totéž. Proto tady, ne dvakrát.
 *
 * @typedef {Object} Nalez
 * @property {'chyba'|'varování'} uroven
 * @property {string} id     id místa, kterého se nález týká (nebo '' u globálních)
 * @property {number} index  pořadí v poli (−1 u globálních)
 * @property {string} pole   název pole, u kterého se má chyba v formuláři ukázat
 * @property {string} zprava
 */

import { KAT_KEYS } from './categories.js'
import { COLL_KEYS } from './collections.js'

/** Všech 29 klíčů v závazném pořadí. */
export const KLICE = [
  'id', 'n', 'k', 't', 'z', 'r', 'c', 'd', 'ch', 'ps', 's', 'p', 'f', 'sh',
  'av', 'bs', 'pdf', 'price', 'pv', 'pn', 'parking', 'g', 'col', 'w', 'ig',
  'lat', 'lon', 'nb', 'img',
]

/** Pole, která musí být neprázdná. Ověřeno na všech 580 místech v původních datech. */
export const POVINNA = ['id', 'n', 'k', 't', 'z', 'r', 'c', 'd', 'ch', 's', 'sh']

/** Pole, která musí být pole (i když prázdné). */
const POLE_SEZNAMY = ['g', 'col', 'nb']

/** Pole, která musí být řetězec (klidně prázdný). */
const POLE_TEXTY = [
  'id', 'n', 'k', 't', 'z', 'r', 'c', 'd', 'ch', 'ps', 's', 'p', 'f', 'sh',
  'av', 'bs', 'pdf', 'price', 'pn', 'w', 'ig', 'img',
]

/** Povinné klíče objektu `parking`, když není null. */
const PARKING_KLICE = [
  'name', 'lat', 'lon', 'type', 'heightLimit', 'transitStatus', 'walk', 'price', 'note', 'source',
]

/** Hodnoty, které smí mít `parking.transitStatus`. */
export const TRANSIT_STAVY = ['verified', 'likely', 'unknown', 'no']

/**
 * Konvence id: slug názvu + tři číslice.
 *
 * Dvojitá pomlčka před číslicemi je v pořádku – vzniká, když se slug uřízne
 * zrovna na pomlčce. V datech je takových id osm, třeba `seceda-…-to-je--057`.
 */
export const ID_REGEX = /^[a-z0-9-]+-\d{3}$/

const jeCislo = (v) => typeof v === 'number' && Number.isFinite(v)

/**
 * Zkontroluje jedno místo.
 *
 * @param {Record<string, unknown>} p
 * @param {Object} [ctx]
 * @param {Set<string>} [ctx.znamaId]  id všech míst – kvůli kontrole vazeb `nb`
 * @param {number} [ctx.index]
 * @returns {Nalez[]}
 */
export function zkontrolujMisto(p, ctx = {}) {
  const { znamaId, index = -1 } = ctx
  /** @type {Nalez[]} */
  const n = []
  const id = typeof p?.id === 'string' ? p.id : ''
  const chyba = (pole, zprava) => n.push({ uroven: 'chyba', id, index, pole, zprava })
  const varovani = (pole, zprava) => n.push({ uroven: 'varování', id, index, pole, zprava })

  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    chyba('', 'Místo není objekt.')
    return n
  }

  /* ---- sada klíčů ---- */
  const klice = Object.keys(p)
  const chybi = KLICE.filter((k) => !klice.includes(k))
  const navic = klice.filter((k) => !KLICE.includes(k))
  if (chybi.length) chyba(chybi[0], `Chybí ${chybi.length} polí: ${chybi.join(', ')}`)
  if (navic.length) chyba(navic[0], `Pole navíc: ${navic.join(', ')}`)
  if (!chybi.length && !navic.length && klice.join('|') !== KLICE.join('|')) {
    varovani('', 'Klíče jsou ve zpřeházeném pořadí. Data to nerozbije, ale diff bude nečitelný.')
  }

  /* ---- typy ---- */
  for (const k of POLE_TEXTY) {
    if (k in p && typeof p[k] !== 'string') chyba(k, `Pole \`${k}\` musí být text, je ${typeof p[k]}.`)
  }
  for (const k of POLE_SEZNAMY) {
    if (k in p && !Array.isArray(p[k])) chyba(k, `Pole \`${k}\` musí být seznam, je ${typeof p[k]}.`)
  }
  if ('pv' in p && typeof p.pv !== 'boolean') chyba('pv', 'Pole `pv` musí být true nebo false.')

  /* ---- povinné hodnoty ---- */
  for (const k of POVINNA) {
    if (typeof p[k] === 'string' && p[k].trim() === '') chyba(k, `Pole \`${k}\` nesmí být prázdné.`)
  }

  /* ---- id ---- */
  if (id && !ID_REGEX.test(id)) {
    varovani('id', `Id \`${id}\` neodpovídá konvenci "slug-tři číslice", třeba \`rynske-vodopady-090\`.`)
  }

  /* ---- číselníky ---- */
  if (typeof p.k === 'string' && p.k && !KAT_KEYS.includes(p.k)) {
    chyba('k', `Kategorie \`${p.k}\` neexistuje. Povolené: ${KAT_KEYS.join(', ')}.`)
  }
  if (Array.isArray(p.col)) {
    for (const c of p.col) {
      if (!COLL_KEYS.includes(c)) chyba('col', `Kolekce \`${c}\` neexistuje. Povolené: ${COLL_KEYS.join(', ')}.`)
    }
    if (new Set(p.col).size !== p.col.length) varovani('col', 'V `col` je stejná kolekce víckrát.')
  }
  if (Array.isArray(p.g) && new Set(p.g).size !== p.g.length) {
    varovani('g', 'V `g` je stejná položka výbavy víckrát.')
  }

  /* ---- souřadnice ---- */
  if (!jeCislo(p.lat)) chyba('lat', 'Zeměpisná šířka musí být číslo.')
  else if (p.lat < -90 || p.lat > 90) chyba('lat', `Zeměpisná šířka ${p.lat} je mimo rozsah −90 až 90.`)
  if (!jeCislo(p.lon)) chyba('lon', 'Zeměpisná délka musí být číslo.')
  else if (p.lon < -180 || p.lon > 180) chyba('lon', `Zeměpisná délka ${p.lon} je mimo rozsah −180 až 180.`)
  if (p.lat === 0 && p.lon === 0) chyba('lat', 'Souřadnice 0, 0 je uprostřed Atlantiku – nejspíš nevyplněné.')

  /* ---- odkazy ---- */
  for (const k of ['img', 'av', 'bs', 'pdf']) {
    const v = p[k]
    if (typeof v === 'string' && v !== '' && !jeUrl(v)) chyba(k, `Pole \`${k}\` není platná adresa: ${v}`)
  }
  for (const k of ['w', 'ig']) {
    const v = p[k]
    if (typeof v !== 'string' || v === '') continue
    // Víc adres se odděluje mezerou-svislítkem-mezerou. Jiný oddělovač aplikace tiše nerozdělí.
    if (/\|/.test(v) && !/ \| /.test(v)) {
      chyba(k, `Víc adres v \`${k}\` se odděluje " | " včetně mezer kolem svislítka.`)
    }
    for (const u of v.split(' | ')) {
      if (u.trim() && !jeUrl(u.trim())) chyba(k, `Pole \`${k}\` obsahuje neplatnou adresu: ${u.trim()}`)
    }
  }
  if (typeof p.img === 'string' && p.img) {
    if (!/^https:\/\/commons\.wikimedia\.org\//.test(p.img)) {
      varovani('img', 'Fotka nevede na commons.wikimedia.org – ověř licenci.')
    }
    // Diakritika v adrese musí být procentně zakódovaná, jinak se obrázek tiše nenačte.
    // eslint-disable-next-line no-control-regex
    if (/[^\x00-\x7F]/.test(p.img)) {
      chyba('img', 'Adresa fotky obsahuje znak s diakritikou. Musí být zakódovaný, třeba ö jako %C3%B6.')
    }
  }

  /* ---- parkoviště ---- */
  if (p.parking !== null && p.parking !== undefined) {
    if (typeof p.parking !== 'object' || Array.isArray(p.parking)) {
      chyba('parking', 'Pole `parking` musí být objekt, nebo null.')
    } else {
      const pk = /** @type {Record<string, unknown>} */ (p.parking)
      const chybiPk = PARKING_KLICE.filter((k) => !(k in pk))
      if (chybiPk.length) chyba('parking', `Parkovišti chybí: ${chybiPk.join(', ')}`)
      if (!jeCislo(pk.lat) || !jeCislo(pk.lon)) chyba('parking', 'Parkoviště musí mít číselné souřadnice.')
      if (typeof pk.name !== 'string' || !pk.name.trim()) chyba('parking', 'Parkoviště musí mít název.')
      if (typeof pk.transitStatus === 'string' && !TRANSIT_STAVY.includes(pk.transitStatus)) {
        chyba('parking', `Stav \`${pk.transitStatus}\` neexistuje. Povolené: ${TRANSIT_STAVY.join(', ')}.`)
      }
      if (pk.heightLimit !== null && !jeCislo(pk.heightLimit)) {
        chyba('parking', 'Výškové omezení musí být číslo v metrech, nebo null.')
      }
    }
  }

  /* ---- sousedi ---- */
  if (Array.isArray(p.nb)) {
    for (const x of p.nb) {
      if (!x || typeof x !== 'object') { chyba('nb', 'Položka v `nb` musí být objekt {id, d}.'); continue }
      const klice2 = Object.keys(x).sort().join(',')
      if (klice2 !== 'd,id') chyba('nb', `Položka v \`nb\` má mít přesně klíče id a d, má: ${klice2}.`)
      if (!jeCislo(x.d) || x.d < 0) chyba('nb', `Vzdálenost k \`${x.id}\` musí být kladné číslo.`)
      if (x.id === id) chyba('nb', 'Místo je uvedené jako soused samo sobě.')
      if (znamaId && typeof x.id === 'string' && !znamaId.has(x.id)) {
        chyba('nb', `Soused \`${x.id}\` v datech neexistuje.`)
      }
    }
  }

  return n
}

/** Velmi mírná kontrola tvaru adresy – jen že je to absolutní http(s) URL. */
function jeUrl(s) {
  if (!/^https?:\/\//.test(s)) return false
  try {
    new URL(s)
    return true
  } catch {
    return false
  }
}

/**
 * Zkontroluje celou sadu míst včetně věcí, které jdou poznat jen napříč daty
 * (duplicitní id, vazby `nb`).
 *
 * @param {Array<Record<string, unknown>>} places
 * @returns {{nalezy: Nalez[], chyb: number, varovani: number}}
 */
export function zkontrolujData(places) {
  /** @type {Nalez[]} */
  const nalezy = []

  if (!Array.isArray(places)) {
    return { nalezy: [{ uroven: 'chyba', id: '', index: -1, pole: '', zprava: 'Data nejsou pole.' }], chyb: 1, varovani: 0 }
  }

  /* duplicitní id */
  const videno = new Map()
  places.forEach((p, i) => {
    const id = p?.id
    if (typeof id !== 'string') return
    if (videno.has(id)) {
      nalezy.push({
        uroven: 'chyba', id, index: i, pole: 'id',
        zprava: `Id \`${id}\` je použité dvakrát – poprvé na pozici ${videno.get(id) + 1}.`,
      })
    } else videno.set(id, i)
  })

  const znamaId = new Set(places.map((p) => p?.id).filter((x) => typeof x === 'string'))
  places.forEach((p, i) => nalezy.push(...zkontrolujMisto(p, { znamaId, index: i })))

  return {
    nalezy,
    chyb: nalezy.filter((x) => x.uroven === 'chyba').length,
    varovani: nalezy.filter((x) => x.uroven === 'varování').length,
  }
}
