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
import { dkm } from '../core/geo.js'
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

/**
 * Nejbližší město i se vzdáleností – „Innsbruck · 12 km".
 *
 * BEZ JEDINÉHO DOTAZU NA SÍŤ. Appka má 985 evropských měst se souřadnicemi
 * v `src/data/mesta.json` a ten soubor je v předukládané cache, takže to
 * funguje i bez signálu. Reverzní geokódování přes Nominatim by bylo čtvrté
 * síťové volání za běhu a offline by mlčelo – přesně tam, kde se člověk na
 * „kde to vlastně jsem" ptá nejčastěji.
 *
 * Vzdálenost je v popisku schválně: v horách bývá nejbližší město za kopcem
 * a bez ní by to vypadalo, že předpověď je přímo tam.
 *
 * @param {{lat:number, lon:number}} bod
 * @returns {Promise<string>}  prázdný řetězec, když se data nepodaří načíst
 */
export async function nejblizsiMesto(bod) {
  if (!bod || !Number.isFinite(bod.lat)) return ''
  try {
    const { mesta } = (await import('../data/mesta.json')).default
    let nej = null
    let nejKm = Infinity
    for (const [lat, lon, nazev] of mesta) {
      const km = dkm(bod, { lat, lon })
      if (km < nejKm) {
        nejKm = km
        nej = nazev
      }
    }
    if (!nej) return ''
    // Do dvou kilometrů je vzdálenost šum – člověk je prostě „v Innsbrucku".
    return nejKm < 2 ? nej : `${nej} · ${Math.round(nejKm)} km`
  } catch {
    return ''
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

/**
 * Popisek předělu v pruhu hodin: „dnes", „zítra", jinak datum.
 *
 * Dál než na zítřek pruh nedosáhne (24 hodin), ale třetí den je tam možný —
 * když se člověk dívá ve 23:30, spadne do pruhu i pozítřejší ráno.
 */
function popisekDne(d, ted = Date.now()) {
  const dnes = new Date(ted)
  if (d.toDateString() === dnes.toDateString()) return 'dnes'
  const zitra = new Date(ted + 86400000)
  if (d.toDateString() === zitra.toDateString()) return 'zítra'
  return `${d.getDate()}. ${d.getMonth() + 1}.`
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

  // PŘEDĚL DNE. Pruh sahá 24 hodin dopředu a bez značky se v něm člověk
  // ztratí – neví, kde končí dnešek. Řeší to dvě věci naráz: zítřejší dlaždice
  // mají tmavší plochu (vidět koutkem oka) a na hranici stojí popisek.
  let denPredchozi = ''
  const pruh = hodiny
    .map((h) => {
      const d = new Date(h.cas)
      const den = h.cas.slice(0, 10)
      const zitra = den !== hodiny[0].cas.slice(0, 10)

      // Popisek se vloží před první dlaždici a pak vždy, když se přehoupne
      // datum. `denPredchozi` drží stav mezi průchody mapy.
      const predel =
        den !== denPredchozi
          ? `<div class="pocasi-predel${zitra ? ' zitra' : ''}">${esc(popisekDne(d, ted))}</div>`
          : ''
      denPredchozi = den

      const { ikona } = pocasiPodleKodu(h.kodPocasi)
      // OBOJÍ VŽDYCKY, I NULA. Do srpna 2026 se milimetry kreslily jen když
      // opravdu něco spadlo, kdežto procento i nulové – a právě ta asymetrie
      // dělala dojem, že množství srážek v appce chybí. V běžné předpovědi
      // prší dvě tři hodiny z dvaceti čtyř a bývají na konci pruhu, takže se
      // člověk k jedinému milimetru nedoroloval a viděl dvacet krát „0 %".
      // Nula je platná odpověď na „kolik naprší" a musí být vidět stejně jako
      // procento; navíc mají díky tomu všechny dlaždice stejně řádků.
      const dest = Number.isFinite(h.destProcent) ? `<i class="pocasi-hod-dest">${h.destProcent} %</i>` : ''
      const mmCislo = Number(h.srazkyMm)
      const mm = Number.isFinite(mmCislo)
        ? `<i class="${mmCislo > 0 ? 'pocasi-hod-mm prsi' : 'pocasi-hod-mm'}">${String(h.srazkyMm).replace('.', ',')} mm</i>`
        : ''

      return `${predel}<div class="pocasi-hod${zitra ? ' zitra' : ''}">
        <span>${esc(hodina(h.cas))}</span>
        ${IC(ikona)}
        <b>${stupne(h.teplota)}</b>
        ${dest}${mm}
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

  // Vlasová lišta s běhounkem pod pruhem. Sama o sobě je to jen prvek –
  // hýbe s ní `napojPocasi()`, které se věší až po vložení do stránky.
  return `${stari}<div class="pocasi-pruh">${pruh}</div>
    <div class="pocasi-posuvnik"><i></i></div>
    <div class="pocasi-dny">${dny}</div>`
}

/**
 * Naváže posouvač pod pruhem hodin.
 *
 * PROČ VŮBEC: pruh sahá 24 hodin dopředu, takže je vidět jen jeho třetina
 * a bez ukazatele není poznat, kde se člověk pohybuje. Systémový posuvník
 * je na mobilu schovaný (`scrollbar-width:none`), takže si ho appka kreslí
 * sama – zato tenkou linkou, ne pruhem přes celou obrazovku.
 *
 * @param {HTMLElement} korenovyPrvek  prvek, do kterého se počasí vykreslilo
 */
export function napojPocasi(korenovyPrvek) {
  const pruh = korenovyPrvek.querySelector('.pocasi-pruh')
  const posuvnik = korenovyPrvek.querySelector('.pocasi-posuvnik')
  if (!pruh || !posuvnik) return
  const behoun = posuvnik.firstElementChild

  const srovnej = () => {
    const celkem = pruh.scrollWidth
    const videt = pruh.clientWidth
    // Když se pruh vejde celý, posouvač nemá co ukazovat.
    if (celkem <= videt + 1) {
      posuvnik.hidden = true
      return
    }
    posuvnik.hidden = false
    behoun.style.width = `${(videt / celkem) * 100}%`
    behoun.style.left = `${(pruh.scrollLeft / celkem) * 100}%`
  }

  pruh.onscroll = srovnej
  srovnej()
}
