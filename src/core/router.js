/**
 * Záložky a adresa v prohlížeči.
 *
 * PŘIDÁNÍ ZÁLOŽKY: složka ve views/ + jeden záznam do ZALOZKY + tlačítko
 * v index.html. Nic jiného.
 *
 * NOVÉ PROTI PŮVODNÍ APLIKACI (odsouhlaseno): záložka se propisuje do adresy
 * (`#map`, `#plan`, …) a tlačítko zpět mezi nimi přepíná. Dřív aplikace
 * s historií nepracovala vůbec a tlačítko zpět ji na Androidu rovnou opustilo.
 *
 * Chování tlačítka zpět:
 *   1. Je otevřený panel (detail, filtry, průvodce)? Zavře se, záložka zůstane.
 *   2. Jinak se skočí na předchozí záložku.
 *   3. Na první záložce zpět aplikaci opustí, jak je na Androidu zvykem.
 */

import { S } from './store.js'

/**
 * @typedef {Object} Zalozka
 * @property {string|null} panel  id prvku s panelem; `null` u mapy, která panel nemá
 * @property {(() => void)|null} render  překreslení při aktivaci
 * @property {(() => void)} [poAktivaci]  co dodělat po přepnutí
 */

/**
 * Registr záložek. Funkce jsou schválně zabalené do šipky – vyhodnotí se až při
 * volání, takže nevadí, že se moduly obrazovek načtou později než tenhle.
 * @type {Record<string, Zalozka>}
 */
export const ZALOZKY = {}

/** @type {Array<{jeOtevreny: () => boolean, zavri: () => void}>} */
const overlaye = []

/**
 * Zaregistruje vysouvací panel, který má tlačítko zpět zavírat dřív,
 * než začne přepínat záložky. Pozdější registrace = vyšší priorita.
 * @param {{jeOtevreny: () => boolean, zavri: () => void}} o
 */
export function registrujOverlay(o) {
  overlaye.push(o)
}

/** Zavře nejvýše položený otevřený panel. Vrací true, když nějaký zavřel. */
function zavriNejvyssiOverlay() {
  for (let i = overlaye.length - 1; i >= 0; i--) {
    if (overlaye[i].jeOtevreny()) {
      overlaye[i].zavri()
      return true
    }
  }
  return false
}

/**
 * Přepne záložku.
 * @param {string} t
 * @param {boolean} [zHistorie]  true = vyvolané tlačítkem zpět, do historie se nezapisuje
 */
export function aktivujZalozku(t, zHistorie = false) {
  const z = ZALOZKY[t]
  if (!z) return

  S.activeTab = t
  for (const b of document.querySelectorAll('#tabs button')) {
    b.classList.toggle('on', b.dataset.tab === t)
  }
  for (const [klic, zal] of Object.entries(ZALOZKY)) {
    if (zal.panel) document.getElementById(zal.panel)?.classList.toggle('show', klic === t)
  }
  z.render?.()
  z.poAktivaci?.()

  if (!zHistorie) zapisDoHistorie(t)
}

function zapisDoHistorie(t) {
  const hash = `#${t}`
  if (location.hash === hash) return
  history.pushState({ tab: t }, '', hash)
}

/** Záložka podle adresy, nebo `home`, když adresa nedává smysl. */
function zalozkaZAdresy() {
  const t = (location.hash || '').slice(1)
  return ZALOZKY[t] ? t : 'home'
}

/**
 * Nastartuje směrování. Volá se jednou, až jsou všechny záložky zaregistrované.
 */
export function spustRouter() {
  window.addEventListener('popstate', () => {
    // 1. otevřený panel má přednost – zpět ho jen zavře
    if (zavriNejvyssiOverlay()) {
      // vrať historii tam, kde byla, ať zpět nezměnilo i záložku
      history.pushState({ tab: S.activeTab }, '', `#${S.activeTab}`)
      return
    }
    // 2. jinak přepni podle adresy
    const t = zalozkaZAdresy()
    if (t !== S.activeTab) aktivujZalozku(t, true)
  })

  const start = zalozkaZAdresy()
  history.replaceState({ tab: start }, '', `#${start}`)
  aktivujZalozku(start, true)
}
