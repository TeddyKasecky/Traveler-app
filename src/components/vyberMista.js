/**
 * Vybírátko míst – „Přidat zastávku".
 *
 * PROČ EXISTUJE: do teď se zastávka dala přidat jen z detailu místa. Předloha
 * Plánu má v itineráři čárkované tlačítko „+ Přidat zastávku" a stejnou položku
 * čeká i nabídka pod „+" na mapě. Obojí potřebuje totéž: vybrat místo, které
 * v plánu ještě není.
 *
 * Nabízí se **místa mimo plán**, seřazená stejně jako Seznam – od nejbližšího,
 * když je známá poloha, jinak česky abecedně. Hledá se přes `sedi()` ze
 * `core/search.js`, takže bez diakritiky a stejně jako všude jinde.
 *
 * Panel se chová jako `#addPlace`: stejné třídy, stejné otevírání, registruje
 * se jako overlay, takže ho tlačítko zpět zavře dřív, než přepne záložku.
 */

import { S, store } from '../core/store.js'
import { esc } from '../core/html.js'
import { dkm, fmtKm } from '../core/geo.js'
import { bezDiakritiky, sedi } from '../core/search.js'
import { KAT } from '../data/categories.js'
import { obrazekMista } from '../data/kategorieFoto.js'
import { PHOTOS } from '../core/store.js'
import { IC } from '../icons/sprite.js'
import { radek } from './vzory.js'
import { registrujOverlay } from '../core/router.js'

/** Kolik míst se nejvýš vypíše. Víc než tolik se stejně nedoscrolluje. */
const STROP = 60

const el = () => document.getElementById('vyberMista')
const telo = () => document.getElementById('vmBody')

/** Co se má stát s vybraným místem. Nastaví ho `otevriVyber()`. */
let vyber = null

export const jeOtevreny = () => el().classList.contains('show')

export function zavriVyber() {
  el().classList.remove('show')
  document.getElementById('backdrop').classList.remove('show')
}

/**
 * Otevře vybírátko.
 * @param {(p: Record<string, any>) => void} naVybrane  dostane vybrané místo
 */
export function otevriVyber(naVybrane) {
  vyber = naVybrane
  el().classList.add('show')
  document.getElementById('backdrop').classList.add('show')
  vykresli('')
  // Klávesnice se nevyvolává sama: na telefonu by zakryla polovinu seznamu
  // dřív, než si ho člověk stihne prohlédnout.
}

function vykresli(dotaz) {
  const q = bezDiakritiky(dotaz)
  const vPlanu = new Set(store.plan)

  let mista = S.places.filter((p) => !vPlanu.has(p.id))
  if (q) mista = mista.filter((p) => sedi(p, q))

  mista = S.userPos
    ? mista.map((p) => ({ p, d: dkm(S.userPos, p) })).sort((a, b) => a.d - b.d)
    : mista.map((p) => ({ p, d: null })).sort((a, b) => a.p.n.localeCompare(b.p.n, 'cs'))

  const seznam = mista.slice(0, STROP)

  telo().innerHTML =
    `<div class="vmhead">
      <h2>${IC('i-plus')}Přidat zastávku</h2>
      <div class="meta">${mista.length} ${mista.length === 1 ? 'místo' : mista.length < 5 ? 'místa' : 'míst'} mimo plán</div>
    </div>
    <div class="hledani">
      <div class="hledani-pole">${IC('i-hledat')}<input id="vmQ" type="search" placeholder="Hledat místo…" autocomplete="off" value="${esc(dotaz)}"></div>
    </div>` +
    (seznam.length
      ? seznam
          .map(({ p, d }) => {
            const k = KAT[p.k] || {}
            const obr = obrazekMista(p, PHOTOS)
            return radek({
              id: p.id,
              obrazek: obr.src,
              zaloha: obr.zaloha,
              vyrez: obr.vyrez,
              nadpis: p.n,
              podnadpis: p.r && p.r !== p.z ? `${p.r}, ${p.z}` : p.z,
              meta: `${IC(k.i)}${esc(p.t)}${d != null ? `<span class="tecka">·</span>${IC('i-nav')}${fmtKm(d)}` : ''}`,
              vpravo: `<span class="stavpill chci">${IC('i-plus')}Přidat</span>`,
              tridy: 'vmradek',
              styl: `--pc:${k.c}`,
            })
          })
          .join('') +
        (mista.length > STROP
          ? `<div class="meta" style="text-align:center;padding:10px">Zobrazeno prvních ${STROP} – zpřesni hledání.</div>`
          : '')
      : `<div class="empty">${IC('i-hledat')}Nic takového tu není.<br>Zkus jiné slovo.</div>`)

  const pole = document.getElementById('vmQ')
  pole.oninput = (e) => {
    const kurzor = e.target.selectionStart
    vykresli(e.target.value)
    // Překreslení vyrobí nové políčko, takže se do něj musí vrátit psaní.
    const nove = document.getElementById('vmQ')
    nove.focus()
    nove.setSelectionRange(kurzor, kurzor)
  }

  for (const r of telo().querySelectorAll('.radek[data-id]')) {
    r.onclick = () => {
      const p = S.byId[r.dataset.id]
      zavriVyber()
      if (p && vyber) vyber(p)
    }
  }
}

/** Naváže zavírání. Volá se jednou při startu. */
export function initVyberMista() {
  document.getElementById('vmClose').onclick = zavriVyber
  registrujOverlay({ jeOtevreny, zavri: zavriVyber })
}
