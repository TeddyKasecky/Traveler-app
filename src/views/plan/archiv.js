/**
 * Archiv ukončených cest – tříděný po letech.
 *
 * Souhrny počítá `ukonciCestu()` už při ukončení, tady se jen čtou. Schválně:
 * data míst se můžou změnit (CSV import) a archiv má držet, jaká cesta BYLA,
 * ne jaká by byla dnes.
 *
 * Kilometry tu nejsou, a je to rozhodnutí: bez GPS by šly spočítat jen
 * vzdušnou čarou přes odznačené zastávky, a to je číslo, které lže.
 */

import { store } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { IC } from '../../icons/sprite.js'
import { fmtDoba } from './cesta.js'
import { sklonuj } from './plan.js'
import { planoveAchievementy } from './achievementy.js'

/** Které roky jsou rozbalené. Jen v paměti; poslední rok se rozbalí sám. */
const rozbaleneRoky = new Set()
/** Která cesta má rozbalený detail. */
let rozbalenaCesta = -1

const datum = (ms) => new Date(ms).toLocaleDateString('cs-CZ')

/**
 * HTML archivu. Prázdný archiv nevrací nic – sekce se pak vůbec neukazuje.
 * @returns {string}
 */
export function archivHtml() {
  if (!store.cesty.length) return ''

  // Po letech, nejnovější rok první. Pořadí uvnitř roku drží unshift
  // z `ukonciCestu()` – nejnovější cesta nahoře.
  const poLetech = new Map()
  store.cesty.forEach((c, i) => {
    const rok = new Date(c.zacatek).getFullYear()
    if (!poLetech.has(rok)) poLetech.set(rok, [])
    poLetech.get(rok).push({ c, i })
  })
  const roky = [...poLetech.keys()].sort((a, b) => b - a)
  if (!rozbaleneRoky.size && roky.length) rozbaleneRoky.add(roky[0])

  return `
    <div class="sekce"><span class="sekce-text">Ukončené cesty</span></div>
    ${roky
      .map((rok) => {
        const cesty = poLetech.get(rok)
        const otevreny = rozbaleneRoky.has(rok)
        return `
        <button class="archiv-rok${otevreny ? ' on' : ''}" data-rok="${rok}">
          <b>${rok}</b>
          <span>${cesty.length} ${sklonuj(cesty.length, 'cesta', 'cesty', 'cest')}</span>
          ${IC('i-down')}
        </button>
        ${otevreny ? cesty.map(({ c, i }) => cestaVArchivu(c, i)).join('') : ''}`
      })
      .join('')}`
}

/** Jedna cesta v archivu; rozbalená ukáže rozpad a achievementy. */
function cestaVArchivu(c, i) {
  const rozbalena = rozbalenaCesta === i
  const dni = Math.max(1, Math.round((c.konec - c.zacatek) / 86400000))

  return `
    <div class="archiv-cesta${rozbalena ? ' on' : ''}">
      <button class="archiv-hlava" data-cesta="${i}">
        <div>
          <b>${esc(c.nazev)}</b>
          <span class="meta">${datum(c.zacatek)} – ${datum(c.konec)} · ${dni} ${sklonuj(dni, 'den', 'dny', 'dní')}
            · ${c.navstiveno}/${c.zastavek} ${sklonuj(c.zastavek, 'zastávka', 'zastávky', 'zastávek')}</span>
        </div>
        ${IC('i-down')}
      </button>
      ${rozbalena ? detailCesty(c) : ''}
    </div>`
}

/** Rozbalený detail: čísla, země, kategorie, poznámky a achievementy. */
function detailCesty(c) {
  const kategorie = Object.entries(c.kategorie || {}).sort((a, b) => b[1] - a[1])
  const hodnoceni = Object.values(c.hodnoceni || {})
  const prumer = hodnoceni.length ? (hodnoceni.reduce((a, b) => a + b, 0) / hodnoceni.length).toFixed(1) : null
  const poznamky = Object.values(c.poznamky || {}).filter((t) => (t || '').trim()).length

  // Definice se generují z otisku cesty – archiv je má díky tomu i zpětně
  // a přepsání generátoru nikomu nic nesmaže (uložená jsou jen id).
  const definice = planoveAchievementy(c.zastavky || [], c.dny || [])
  const ziskane = new Set(c.ziskane || [])

  return `
    <div class="archiv-detail">
      <div class="archiv-cisla">
        <div><b>${fmtDoba(c.cistyMs || 0)}</b><span>čistý čas</span></div>
        <div><b>${c.navstiveno}</b><span>navštíveno</span></div>
        <div><b>${c.vynechano}</b><span>vynecháno</span></div>
        ${prumer ? `<div><b>${prumer} ★</b><span>průměr hodnocení</span></div>` : ''}
      </div>
      ${c.zeme && c.zeme.length ? `<div class="meta archiv-radka">${IC('i-globe')}${c.zeme.map(esc).join(' · ')}</div>` : ''}
      ${c.kraje && c.kraje.length ? `<div class="meta archiv-radka">${IC('i-map')}${c.kraje.map(esc).join(' · ')}</div>` : ''}
      ${
        kategorie.length
          ? `<div class="archiv-tagy">${kategorie.map(([k, n]) => `<span class="tag">${esc(k)} × ${n}</span>`).join('')}</div>`
          : ''
      }
      ${poznamky ? `<div class="meta archiv-radka">${IC('i-quill')}${poznamky} ${sklonuj(poznamky, 'poznámka', 'poznámky', 'poznámek')} z cesty</div>` : ''}
      ${c.poznamka ? `<p class="archiv-poznamka">${esc(c.poznamka)}</p>` : ''}
      ${
        definice.length
          ? `<div class="meta archiv-radka">${IC('i-spark')}Achievementy: ${ziskane.size} z ${definice.length}</div>
             <div class="achv-mriz">${definice
               .map(
                 (a) =>
                   `<span class="achv${ziskane.has(a.id) ? ' ma' : ''}" title="${esc(a.popis)}">${esc(a.nazev)}</span>`
               )
               .join('')}</div>`
          : ''
      }
    </div>`
}

/**
 * Naváže rozbalování. Volá se po vložení HTML.
 * @param {HTMLElement} wrap
 * @param {() => void} prekresli
 */
export function napojArchiv(wrap, prekresli) {
  for (const b of wrap.querySelectorAll('.archiv-rok')) {
    b.onclick = () => {
      const rok = Number(b.dataset.rok)
      rozbaleneRoky.has(rok) ? rozbaleneRoky.delete(rok) : rozbaleneRoky.add(rok)
      prekresli()
    }
  }
  for (const b of wrap.querySelectorAll('.archiv-hlava')) {
    b.onclick = () => {
      const i = Number(b.dataset.cesta)
      rozbalenaCesta = rozbalenaCesta === i ? -1 : i
      prekresli()
    }
  }
}
