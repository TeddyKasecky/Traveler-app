/**
 * Ukončené cesty v knihovně Výprav – řádky ve stylu `.vypravaradek`, po letech.
 *
 * Do srpna 2026 to byla vlastní karta na kartě Na cestě s rozbalováním
 * detailu na místě. Ukončená cesta se dnes chová jako výprava: ťuknutí ji
 * jen aktivuje na mapě (`S.otevrenaCesta`), detail (dny se zastávkami,
 * čísla, achievementy) je v Itineráři v zamčeném režimu – jedno místo na
 * „otevřít a podívat se", ne dvě různá.
 *
 * Souhrny počítá `ukonciCestu()` už při ukončení, tady se jen čtou. Schválně:
 * data míst se můžou změnit (CSV import) a archiv má držet, jaká cesta BYLA,
 * ne jaká by byla dnes.
 *
 * Kilometry tu nejsou, a je to rozhodnutí: bez GPS by šly spočítat jen
 * vzdušnou čarou přes odznačené zastávky, a to je číslo, které lže.
 */

import { S, store } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { IC } from '../../icons/sprite.js'
import { sklonuj } from './plan.js'
import { planoveAchievementy } from './achievementy.js'
import { CESTY } from '../../core/cesty.js'

/** Které roky jsou rozbalené. Jen v paměti; poslední (nejnovější) se rozbalí sám. */
const rozbaleneRoky = new Set()

const datum = (ms) => new Date(ms).toLocaleDateString('cs-CZ')

/** Ukončené cesty seskupené po letech, nejnovější rok první. */
function poLetech() {
  const m = new Map()
  CESTY.forEach((c, i) => {
    const rok = new Date(c.zacatek).getFullYear()
    if (!m.has(rok)) m.set(rok, [])
    m.get(rok).push({ c, i })
  })
  return [...m.entries()].sort((a, b) => b[0] - a[0])
}

/**
 * Sekce „Ukončené cesty" pro knihovnu Výprav. Prázdný archiv nevrací nic –
 * sekce se pak vůbec neukazuje.
 * @returns {string}
 */
export function archivRadkyHtml() {
  if (!CESTY.length) return ''
  const roky = poLetech()
  if (!rozbaleneRoky.size && roky.length) rozbaleneRoky.add(roky[0][0])

  return (
    `<div class="sekce"><span class="sekce-text">Ukončené cesty</span></div>` +
    roky
      .map(([rok, cesty]) => {
        const otevreny = rozbaleneRoky.has(rok)
        return (
          `<div class="slozka-radek${otevreny ? '' : ' sbalena'}" data-rok="${rok}">
            ${IC('i-kalendar')}
            <b>${rok}</b>
            <span class="slozka-pocet">${cesty.length} ${sklonuj(cesty.length, 'cesta', 'cesty', 'cest')}</span>
            <span class="slozka-sipka">${IC('i-down')}</span>
          </div>` +
          (otevreny ? `<div class="slozka-obsah">${cesty.map(({ c, i }) => radekCesty(c, i)).join('')}</div>` : '')
        )
      })
      .join('')
  )
}

/** Jeden řádek ukončené cesty. Zamčená ikona rovnou říká, že je jen ke čtení. */
function radekCesty(c, i) {
  const aktivni = S.otevrenaCesta === i
  return `<div class="vypravaradek archivradek${aktivni ? ' on' : ''}" data-cesta="${i}">
    ${IC('i-zamek')}
    <div>
      <b>${esc(c.nazev)}</b>
      <span>${datum(c.zacatek)} · ${c.navstiveno}/${c.zastavek} ${sklonuj(c.zastavek, 'zastávka', 'zastávky', 'zastávek')}</span>
    </div>
    ${aktivni ? `<i title="Tahle cesta je vidět na mapě">na mapě</i>` : ''}
  </div>`
}

/**
 * Rozpad ukončené cesty pro zamčený Itinerář: země, kraje, kategorie,
 * počet poznámek a achievementy. Čísla (čistý čas, navštíveno/vynecháno)
 * a samotná poznámka se kreslí v `cesta.js`, který má `fmtDoba` a řeší
 * i editovatelnost po „Odemknout poznámky" – nedávat je sem, ať `archiv.js`
 * nemusí importovat z `cesta.js` a `cesta.js` z `archiv.js` navzájem.
 * @param {object} c
 * @returns {string}
 */
export function detailCestyHtml(c) {
  const kategorie = Object.entries(c.kategorie || {}).sort((a, b) => b[1] - a[1])
  const hodnoceni = Object.values(c.hodnoceni || {})
  const prumer = hodnoceni.length ? (hodnoceni.reduce((a, b) => a + b, 0) / hodnoceni.length).toFixed(1) : null
  const poznamky = Object.values(c.poznamky || {}).filter((t) => (t || '').trim()).length

  // Definice se generují z otisku cesty – archiv je má díky tomu i zpětně
  // a přepsání generátoru nikomu nic nesmaže (uložená jsou jen id).
  const definice = planoveAchievementy(c.zastavky || [], c.dny || [])
  const ziskane = new Set(c.ziskane || [])

  return `
    ${prumer ? `<div class="meta archiv-radka">${IC('i-star')}Průměr hodnocení ${prumer} ★</div>` : ''}
    ${c.zeme && c.zeme.length ? `<div class="meta archiv-radka">${IC('i-globe')}${c.zeme.map(esc).join(' · ')}</div>` : ''}
    ${c.kraje && c.kraje.length ? `<div class="meta archiv-radka">${IC('i-map')}${c.kraje.map(esc).join(' · ')}</div>` : ''}
    ${
      kategorie.length
        ? `<div class="archiv-tagy">${kategorie.map(([k, n]) => `<span class="tag">${esc(k)} × ${n}</span>`).join('')}</div>`
        : ''
    }
    ${poznamky ? `<div class="meta archiv-radka">${IC('i-quill')}${poznamky} ${sklonuj(poznamky, 'poznámka', 'poznámky', 'poznámek')} ze zastávek</div>` : ''}
    ${
      definice.length
        ? `<div class="meta archiv-radka">${IC('i-spark')}Achievementy: ${ziskane.size} z ${definice.length}</div>
           <div class="achv-mriz">${definice
             .map((a) => `<span class="achv${ziskane.has(a.id) ? ' ma' : ''}" title="${esc(a.popis)}">${esc(a.nazev)}</span>`)
             .join('')}</div>`
        : ''
    }`
}

/**
 * Naváže sbalování let a aktivaci cesty (ťuknutí = jen na mapu, jako
 * u výpravy – žádné rozbalování detailu na místě).
 * @param {HTMLElement} wrap
 * @param {(i: number|null) => void} naAktivaci  null = jen se sbalil/rozbalil rok
 */
export function napojArchivRadky(wrap, naAktivaci) {
  for (const r of wrap.querySelectorAll('.slozka-radek[data-rok]')) {
    const rok = Number(r.dataset.rok)
    r.onclick = () => {
      rozbaleneRoky.has(rok) ? rozbaleneRoky.delete(rok) : rozbaleneRoky.add(rok)
      naAktivaci(null)
    }
  }
  for (const r of wrap.querySelectorAll('.archivradek[data-cesta]')) {
    r.onclick = () => naAktivaci(Number(r.dataset.cesta))
  }
}
