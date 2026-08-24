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

/** Co se má vykreslit do plátu, když se otevře. Nastavuje `nastavKosikFab()`. */
let vykresli = null

const fab = () => document.getElementById('kosikFab')
const plat = () => document.getElementById('kosikPlat')
const obsah = () => document.getElementById('kosikPlatObsah')

export const jeOtevrenyKosik = () => !!plat() && plat().classList.contains('show')

/** Otevře plát a nechá volajícího naplnit obsah. */
export function otevriKosikPlat() {
  const p = plat()
  if (!p || !vykresli) return
  obsah().innerHTML = ''
  p.hidden = false
  // Dvě fáze: `hidden` se musí sundat dřív, než se nasadí třída s přechodem,
  // jinak prohlížeč animaci přeskočí (prvek z `display:none` neanimuje).
  requestAnimationFrame(() => p.classList.add('show'))
  vykresli(obsah())
}

/** Zavře plát. Vrací, jestli nějaký otevřený byl – pro tlačítko zpět. */
export function zavriKosikPlat() {
  const p = plat()
  if (!p || !p.classList.contains('show')) return false
  p.classList.remove('show')
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
  if (!vidno) zavriKosikPlat()
  else if (jeOtevrenyKosik() && vykresli) vykresli(obsah())
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
