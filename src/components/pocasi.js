/**
 * Předpověď počasí – načtení ze schránky nebo ze sítě a vykreslení.
 *
 * PROČ V `components/` A NE VE `views/home/`: první etapa (srpen 2026) ji
 * ukazuje jen u tvé polohy na Domů, ale hlášení `pc-tadeas-001` chce počasí
 * i u dnů v Itineráři, u jednotlivých míst a na kartě Na cestě. Kdyby to
 * bydlelo v Domů, tahaly by si to odtamtud tři další obrazovky.
 *
 * DVĚ VRSTVY, ZÁMĚRNĚ: `pocasiProBod()` je data (schránka, čerstvost, síť)
 * a `pocasiHtml()` vzhled. Data jdou testovat bez prohlížeče, stejně jako
 * u `body.js` proti `bloky.js`.
 *
 * NIKDY SE NEPTÁ NA POLOHU. Bere tu, kterou appka už zná ze „Nejblíž odsud";
 * kdo ji nedal, dostane místo předpovědi tlačítko. Systémový dotaz na polohu
 * při otevření Domů by byl přepadení.
 */

import { prefs } from '../core/store.js'
import { esc } from '../core/html.js'
import { IC } from '../icons/sprite.js'
import { klicPocasi, nactiPocasiZeSchranky, ulozPocasi } from '../core/pocasiDb.js'
import { nactiPocasi, pocasiPodleKodu } from '../views/plan/termin.js'

/** Kolik hodin dopředu. Celý den včetně zítřejšího rána. */
const HODIN = 24
/** Kolik dní dopředu. Týden; Open-Meteo umí šestnáct, ale patnáctý den nesedá. */
const DNU = 7

/**
 * Jsme na měřených datech?
 *
 * `navigator.connection` UMÍ JEN CHROMIUM. V Safari neexistuje, takže se
 * vrací `false` – volba „jen na wifi" se tam chová jako vypnutá. Radši
 * stáhnout navíc než tvrdit uživateli, že je na wifi, a mlčet.
 *
 * @returns {boolean}
 */
export function naDatech() {
  const c = typeof navigator !== 'undefined' && navigator.connection
  if (!c) return false
  if (c.saveData) return true
  return ['slow-2g', '2g', '3g', '4g', 'cellular'].includes(c.effectiveType || c.type)
}

/**
 * Předpověď pro bod: ze schránky, a když je stará, ze sítě.
 *
 * VRACÍ I STAROU PŘEDPOVĚĎ, když se stažení nepovede. Bez signálu je „včerejší
 * počasí s datem" mnohem lepší než prázdno – proto je `stazeno` součástí
 * záznamu a proto se chyba sítě nepropaguje ven jako výjimka.
 *
 * @param {{lat:number, lon:number}} bod
 * @param {{ted?:number, vynutit?:boolean}} [o]  `vynutit` = tlačítko, ignoruje čerstvost i wifi
 * @returns {Promise<{hodiny:Array, dny:Array, stazeno:number, stare:boolean}|null>}
 */
export async function pocasiProBod(bod, { ted = Date.now(), vynutit = false } = {}) {
  if (!bod || !Number.isFinite(bod.lat) || !Number.isFinite(bod.lon)) return null
  if (!prefs.pocasi && !vynutit) return null

  const fahrenheity = prefs.pocasiJednotky === 'fahrenheit'
  const klic = klicPocasi(bod, fahrenheity ? 'f' : 't')
  const ulozene = await nactiPocasiZeSchranky(klic)

  const platnost = (Number(prefs.pocasiInterval) || 60) * 60000
  const cerstve = ulozene && ted - ulozene.stazeno < platnost
  if (cerstve && !vynutit) return { ...ulozene, stare: false }

  // Na měřených datech se nestahuje samo – jen na vyžádání tlačítkem.
  if (!vynutit && prefs.pocasiJenWifi && naDatech()) {
    return ulozene ? { ...ulozene, stare: true } : null
  }

  try {
    const data = await nactiPocasi(bod, { hodin: HODIN, dnu: DNU, fahrenheity })
    await ulozPocasi(klic, data, ted)
    return { ...data, stazeno: ted, stare: false }
  } catch {
    // Síť selhala. Co je ve schránce, je pořád lepší než nic.
    return ulozene ? { ...ulozene, stare: true } : null
  }
}

/** „18:40" z ISO času, který Open-Meteo vrací v místní zóně bodu. */
const hodina = (iso) => String(iso || '').slice(11, 16)

/** „po 8. 9." – krátký den v týdnu a datum. */
function kratkyDen(iso, ted = Date.now()) {
  const d = new Date(`${iso}T12:00:00`)
  const dnes = new Date(ted)
  if (d.toDateString() === dnes.toDateString()) return 'dnes'
  const DNY = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so']
  return `${DNY[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`
}

/** Zaokrouhlená teplota se stupněm. Prázdno projde jako pomlčka. */
const stupne = (x) => (Number.isFinite(x) ? `${Math.round(x)}°` : '–')

/**
 * Kdy se to stáhlo, slovy. Píše se jen u staré předpovědi – u čerstvé by
 * to byl šum.
 */
function kdyStazeno(ms, ted = Date.now()) {
  const d = new Date(ms)
  const dnes = new Date(ted)
  const cas = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === dnes.toDateString()) return `dnes v ${cas}`
  const vcera = new Date(ted - 86400000)
  if (d.toDateString() === vcera.toDateString()) return `včera v ${cas}`
  return `${d.getDate()}. ${d.getMonth() + 1}. v ${cas}`
}

/**
 * Vykreslí předpověď. `null` znamená „není co ukázat" a volající sekci
 * vůbec nevykreslí.
 *
 * @param {{hodiny:Array, dny:Array, stazeno:number, stare:boolean}|null} p
 * @param {{ted?:number}} [o]
 * @returns {string}
 */
export function pocasiHtml(p, { ted = Date.now() } = {}) {
  if (!p || !Array.isArray(p.hodiny) || !p.hodiny.length) return ''

  // Hodiny, které už byly, nikoho nezajímají – Open-Meteo vrací celý den
  // od půlnoci, takže se ty odbyté zahodí.
  const ted6 = ted - 3600000
  const hodiny = p.hodiny.filter((h) => new Date(h.cas).getTime() >= ted6).slice(0, HODIN)

  const pruh = hodiny
    .map((h) => {
      const { ikona } = pocasiPodleKodu(h.kodPocasi)
      const srazky = Number(h.srazkyMm) > 0 ? `<i>${String(h.srazkyMm).replace('.', ',')} mm</i>` : ''
      return `<div class="pocasi-hod">
        <span>${esc(hodina(h.cas))}</span>
        ${IC(ikona)}
        <b>${stupne(h.teplota)}</b>
        ${srazky}
      </div>`
    })
    .join('')

  const dny = (p.dny || [])
    .map((d) => {
      const { ikona, popis } = pocasiPodleKodu(d.kodPocasi)
      const dest = Number.isFinite(d.destProcent) && d.destProcent > 0
        ? `<span class="pocasi-dest">${IC('i-rain')}${d.destProcent} %</span>`
        : ''
      const slunce = d.vychod && d.zapad
        ? `<span class="pocasi-slunce">${IC('i-sun')}${esc(hodina(d.vychod))} – ${esc(hodina(d.zapad))}</span>`
        : ''
      return `<div class="pocasi-den">
        <span class="pocasi-den-kdy">${esc(kratkyDen(d.datum, ted))}</span>
        ${IC(ikona)}
        <span class="pocasi-den-popis">${esc(popis)}</span>
        ${dest}${slunce}
        <b class="pocasi-den-teplota">${stupne(d.maxC)}<i>${stupne(d.minC)}</i></b>
      </div>`
    })
    .join('')

  // Stáří se hlásí jen u staré předpovědi. „Staženo před chvílí" by byl šum.
  const stari = p.stare
    ? `<div class="meta pocasi-stari">Staženo ${esc(kdyStazeno(p.stazeno, ted))} – novější se nepodařilo načíst.</div>`
    : ''

  return `${stari}<div class="pocasi-pruh">${pruh}</div><div class="pocasi-dny">${dny}</div>`
}
