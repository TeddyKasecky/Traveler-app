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
 *
 * PO PŘIDÁNÍ SE NEZAVÍRÁ (srpen 2026). Do té doby zmizel
 * hned po prvním výběru, takže přidat pět zastávek znamenalo pětkrát projít
 * tutéž cestu – deset dotyků místo šesti. Zavírá se tlačítkem, které tu bylo
 * odjakživa (`vmClose`), nebo systémovým zpět.
 *
 * Přidané místo ze seznamu NEZMIZÍ, jen zšedne a přebarví pilulku na
 * „Přidáno". Kdyby se odfiltrovalo, seznam by se pod prstem posunul o řádek
 * nahoru a druhé ťuknutí by trefilo něco jiného, než na co se člověk díval.
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

/**
 * Co se přidalo za tohohle otevření. Jen v paměti – po zavření se zapomene,
 * protože pak už je to prostě součást plánu jako všechno ostatní.
 * @type {Set<string>}
 */
let pridaneTed = new Set()

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
  pridaneTed = new Set()
  el().classList.add('show')
  document.getElementById('backdrop').classList.add('show')
  vykresli('')
  // Klávesnice se nevyvolává sama: na telefonu by zakryla polovinu seznamu
  // dřív, než si ho člověk stihne prohlédnout.
}

function vykresli(dotaz) {
  const q = bezDiakritiky(dotaz)
  const vPlanu = new Set(store.plan)

  // Právě přidané zůstává v seznamu, i když už v plánu je – viz hlavička souboru.
  let mista = S.places.filter((p) => !vPlanu.has(p.id) || pridaneTed.has(p.id))
  if (q) mista = mista.filter((p) => sedi(p, q))

  // Do počtu „mimo plán" se přidané NEPOČÍTAJÍ – v plánu už jsou.
  const mimoPlan = mista.filter((p) => !vPlanu.has(p.id)).length

  mista = S.userPos
    ? mista.map((p) => ({ p, d: dkm(S.userPos, p) })).sort((a, b) => a.d - b.d)
    : mista.map((p) => ({ p, d: null })).sort((a, b) => a.p.n.localeCompare(b.p.n, 'cs'))

  const seznam = mista.slice(0, STROP)
  const n = pridaneTed.size

  telo().innerHTML =
    `<div class="vmhead">
      <h2>${IC('i-plus')}Přidat zastávku</h2>
      <div class="meta">${mimoPlan} ${mimoPlan === 1 ? 'místo' : mimoPlan < 5 ? 'místa' : 'míst'} mimo plán${
        n ? ` <span class="tecka">·</span> <b id="vmPridano">${n} ${n === 1 ? 'přidané' : n < 5 ? 'přidaná' : 'přidaných'}</b>` : ''
      }</div>
    </div>
    <div class="hledani">
      <div class="hledani-pole">${IC('i-hledat')}<input id="vmQ" type="search" placeholder="Hledat místo…" autocomplete="off" value="${esc(dotaz)}"></div>
    </div>` +
    (seznam.length
      ? seznam
          .map(({ p, d }) => {
            const k = KAT[p.k] || {}
            const obr = obrazekMista(p, PHOTOS)
            const jePridane = pridaneTed.has(p.id)
            return radek({
              id: p.id,
              obrazek: obr.src,
              zaloha: obr.zaloha,
              vyrez: obr.vyrez,
              nadpis: p.n,
              podnadpis: p.r && p.r !== p.z ? `${p.r}, ${p.z}` : p.z,
              meta: `${IC(k.i)}${esc(p.t)}${d != null ? `<span class="tecka">·</span>${IC('i-nav')}${fmtKm(d)}` : ''}`,
              vpravo: jePridane
                ? `<span class="stavpill je">${IC('i-check')}Přidáno</span>`
                : `<span class="stavpill chci">${IC('i-plus')}Přidat</span>`,
              tridy: jePridane ? 'vmradek vmpridane' : 'vmradek',
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
      // Druhé ťuknutí na už přidané nedělá nic. Vyhodit ho z plánu by bylo
      // překvapení: pilulka říká „Přidáno", ne „Odebrat".
      if (!p || !vyber || pridaneTed.has(p.id)) return
      pridaneTed.add(p.id)
      vyber(p)
      // Až po volání – teprve tím je místo v `store.plan` a hlavička to ví.
      vykresli(dotaz)
    }
  }
}

/** Naváže zavírání. Volá se jednou při startu. */
export function initVyberMista() {
  document.getElementById('vmClose').onclick = zavriVyber
  registrujOverlay({ jeOtevreny, zavri: zavriVyber })
}
