/**
 * Světlý a tmavý režim.
 *
 * Tři stavy: `system` (výchozí), `svetly`, `tmavy`. Volba se ukládá do
 * `vandrbuch:prefs` pod klíč `motiv`; kdo ho v uložených datech nemá,
 * dostane `system`, takže se nikde nemigruje a nic se nepřepisuje.
 *
 * JAK TO DRŽÍ POHROMADĚ S CSS: `tokens.css` má tmavé hodnoty ve dvou
 * blocích – `@media (prefers-color-scheme:dark)` s výjimkou pro
 * `[data-motiv="svetly"]`, a `[data-motiv="tmavy"]`. Tenhle modul jen
 * nastavuje atribut na `<html>`; žádné barvy nezná.
 *
 * PROČ SE PO PŘEPNUTÍ MUSÍ NĚCO PŘEKRESLIT: Leaflet zapisuje barvy do
 * atributů SVG a do plátna. Ty se změnou proměnné v CSS nepřepočítají, takže
 * by pod tmavou aplikací zůstala svítit béžová pevnina zjednodušené mapy,
 * rezavá čára plánu a puntík polohy. Nespadne to a nikdo si toho nevšimne,
 * dokud nebude v noci bez signálu — proto se překreslení hlásí událostí
 * `motivZmenen` a moduly mapy si na ni sedají samy.
 */

import { prefs, savePrefs, emit } from './store.js'

/** Dotaz, kterým se ptáme systému. Drží se, aby šlo odhlásit i přihlásit. */
const dotazTmavy = window.matchMedia('(prefers-color-scheme: dark)')

/** @returns {'system'|'svetly'|'tmavy'} */
export const zvolenyMotiv = () => prefs.motiv || 'system'

/** Co je opravdu vidět, když se rozhodne i za `system`. */
export const platnyMotiv = () => {
  const m = zvolenyMotiv()
  return m === 'system' ? (dotazTmavy.matches ? 'tmavy' : 'svetly') : m
}

/**
 * Přepíše barvu horní lišty prohlížeče.
 *
 * V `index.html` jsou dvě `<meta name="theme-color">` s `media`, takže systémová
 * volba funguje i bez JavaScriptu. Ruční volbu ale `media` nepokryje – pak by
 * měl tmavý režim na Androidu světlý stavový řádek. Proto se při ruční volbě
 * obě značky přepíšou natvrdo a při návratu na `system` se `media` vrátí.
 */
function srovnejListuProhlizece() {
  const znacky = document.querySelectorAll('meta[name="theme-color"]')
  if (znacky.length < 2) return
  const rucni = zvolenyMotiv() !== 'system'
  const barva = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()

  for (const z of znacky) {
    if (rucni) {
      z.removeAttribute('media')
      z.setAttribute('content', barva)
    } else {
      z.setAttribute('media', z.dataset.media)
      z.setAttribute('content', z.dataset.content)
    }
  }
}

/** Nastaví atribut na `<html>` a dá vědět těm, kdo si barvu zapekli. */
function uplatni() {
  const m = zvolenyMotiv()
  if (m === 'system') delete document.documentElement.dataset.motiv
  else document.documentElement.dataset.motiv = m
  srovnejListuProhlizece()
  emit('motivZmenen', platnyMotiv())
}

/**
 * Změní režim a uloží volbu.
 * @param {'system'|'svetly'|'tmavy'} m
 */
export function nastavMotiv(m) {
  prefs.motiv = m
  savePrefs()
  uplatni()
}

/** Zapne se jednou při startu. */
export function initMotiv() {
  // Původní hodnoty obou značek si schováme, ať se dá vrátit volba „podle
  // systému“ bez znalosti barev – ty patří do tokens.css, ne sem.
  for (const z of document.querySelectorAll('meta[name="theme-color"]')) {
    z.dataset.media = z.getAttribute('media') || ''
    z.dataset.content = z.getAttribute('content') || ''
  }

  // Změna nastavení telefonu za běhu (typicky automatický přechod po setmění)
  // se musí projevit hned, ne až po restartu aplikace.
  dotazTmavy.addEventListener('change', () => {
    if (zvolenyMotiv() === 'system') uplatni()
  })

  uplatni()
}
