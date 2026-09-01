/**
 * Plovoucí košík výpravy – tlačítko nad spodní lištou a plát pod ním.
 *
 * PROČ TO VZNIKLO: košík byl do srpna 2026 pod-obrazovka Itineráře. Došlo se
 * do něj přes dlaždici v dashboardu nebo přes řádkové tlačítko, obrazovka se
 * VYMĚNILA a zpátky se šlo přes drobečky. Jenže z košíku se do plánu tahá –
 * a tahat se dá jen mezi dvěma věcmi, které jsou vidět naráz. Proto plát,
 * který překrývá jen spodek obrazovky a dny nad ním nechává jako cíl.
 *
 * JEN V PLÁNU, a to na kartách Itinerář a Na cestě. Jinde by překážel: na
 * Mapě a v Seznamu se místa prohlížejí, nesbírají do konkrétní výpravy –
 * odtamtud vede do košíku detail místa, kde se navíc dá vybrat, do KTERÉ
 * výpravy. Viditelnost řídí `nastavKosikFab()`, kterou volá `renderPlan()`;
 * CSS to hlídá podruhé přes `body[data-tab]`.
 *
 * Obsah plátu si kreslí volající (`views/plan/*`) – tenhle modul jen otevírá,
 * zavírá a počítá odznak. Kdyby si kreslil sám, musel by znát košík, kotvy
 * i cestu, a `components/` nemá vědět o obrazovkách.
 */

import { registrujOverlay } from '../core/router.js'
import { pocitej } from '../core/store.js'

/** Co se má vykreslit do plátu, když se otevře. Nastavuje `nastavKosikFab()`. */
let vykresli = null

const fab = () => document.getElementById('kosikFab')
const plat = () => document.getElementById('kosikPlat')
const obsah = () => document.getElementById('kosikPlatObsah')

export const jeOtevrenyKosik = () => !!plat() && plat().classList.contains('show')

/**
 * Posadí kolečko do pravého horního rohu otevřeného plátu.
 *
 * PROČ POSUN, A NE DRUHÉ TLAČÍTKO V PLÁTU: kolečko a „zavřít" je tatáž věc.
 * Kdyby v rohu plátu sedělo jiné tlačítko, musel by člověk pochopit, že
 * spolu souvisejí; takhle to vidí – knoflík, kterým košík otevřel, doletí
 * na místo, odkud ho zavře. Uvolnilo se přesně tím, že z hlavičky košíku
 * odešlo „Vysypat".
 *
 * Cílová pozice se počítá z `offsetHeight` plátu, ne z `getBoundingClientRect()`:
 * plát se v tu chvíli teprve vysouvá (`translateY(100%)`), takže by rect
 * vrátil polohu za spodní hranou obrazovky. `offsetHeight` transform nezná.
 */
function posadNaPlat() {
  const b = fab()
  const p = plat()
  if (!b || !p) return
  // Změřit bez vlastního posunu a bez přechodu – jinak by se počítalo
  // z místa, kam kolečko teprve letí, a chyba by se sčítala při každém
  // otevření.
  const puvodni = b.style.transition
  b.style.transition = 'none'
  b.style.transform = ''
  const r = b.getBoundingClientRect()
  // 30 px pod horní hranou plátu: pod úchytem, na úrovni hlavičky košíku.
  const cil = window.innerHeight - p.offsetHeight + 30
  // Reflow mezi vypnutím a zapnutím přechodu, ať se obojí nesloučí do
  // jednoho snímku a posun se opravdu animoval.
  void b.offsetWidth
  b.style.transition = puvodni
  b.classList.add('vplatu')
  b.style.transform = `translateY(${Math.round(cil - r.top)}px)`
}

/** Vrátí kolečko na jeho místo nad spodní lištou. */
function vratZPlatu() {
  const b = fab()
  if (!b) return
  b.classList.remove('vplatu')
  b.style.transform = ''
}

/** Otevře plát a nechá volajícího naplnit obsah. */
export function otevriKosikPlat() {
  const p = plat()
  if (!p || !vykresli) return
  // Proti čítači `itinerar` – teprve poměr řekne, jestli je košík nejvytíženější
  // překryv appky, nebo věc na jednou za cestu (`NAPADY.md` N23).
  pocitej('kosik')
  obsah().innerHTML = ''
  p.hidden = false
  // Obsah PŘED měřením: výška plátu závisí na tom, co v něm je, a kolečko
  // míří na jeho horní hranu.
  vykresli(obsah())
  posadNaPlat()
  // Dvě fáze: `hidden` se musí sundat dřív, než se nasadí třída s přechodem,
  // jinak prohlížeč animaci přeskočí (prvek z `display:none` neanimuje).
  requestAnimationFrame(() => p.classList.add('show'))
}

/** Zavře plát. Vrací, jestli nějaký otevřený byl – pro tlačítko zpět. */
export function zavriKosikPlat() {
  const p = plat()
  if (!p || !p.classList.contains('show')) return false
  p.classList.remove('show')
  vratZPlatu()
  // Skrýt až po doběhnutí přechodu, ať plát neuskočí.
  setTimeout(() => {
    if (!p.classList.contains('show')) p.hidden = true
  }, 240)
  return true
}

/**
 * Nastaví, jestli je košík vidět, kolik má položek a co se do plátu kreslí.
 *
 * @param {{vidno: boolean, pocet?: number, kresli?: (el: HTMLElement) => void}} o
 */
export function nastavKosikFab({ vidno, pocet = 0, kresli = null }) {
  const b = fab()
  if (!b) return
  vykresli = kresli
  b.hidden = !vidno
  const odznak = document.getElementById('kosikFabPocet')
  if (odznak) {
    odznak.hidden = !pocet
    odznak.textContent = String(pocet)
  }
  // Zmizí-li tlačítko (odchod z Plánu, přepnutí na knihovnu), plát nesmí
  // zůstat viset nad cizí obrazovkou.
  if (!vidno) {
    zavriKosikPlat()
    vratZPlatu()
  } else if (jeOtevrenyKosik() && vykresli) {
    vykresli(obsah())
    // Obsah se překreslením mohl zkrátit nebo prodloužit – kolečko musí
    // dosednout na novou horní hranu plátu, ne zůstat viset ve vzduchu.
    posadNaPlat()
  }
}

/**
 * Naváže obsluhu. Volá se JEDNOU při startu z `main.js` – prvky jsou
 * staticky v `index.html`, takže překreslení Plánu obsluhu nesmaže.
 */
export function initKosikFab() {
  const b = fab()
  if (!b) return
  b.onclick = () => (jeOtevrenyKosik() ? zavriKosikPlat() : otevriKosikPlat())
  const zavri = document.getElementById('kosikPlatZavri')
  if (zavri) zavri.onclick = () => zavriKosikPlat()
  // Tlačítko zpět zavře plát dřív, než přepne záložku – stejně jako dialog.
  registrujOverlay({ jeOtevreny: jeOtevrenyKosik, zavri: zavriKosikPlat })
}
