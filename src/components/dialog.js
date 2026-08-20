/**
 * Dialogy ve stylu aplikace – náhrada prompt(), confirm() a alert().
 *
 * PROČ: nativní okna vypadala v aplikaci cize, confirm neměl pořádné
 * potvrzovací tlačítko a prompt se nedal stylovat vůbec. Tohle je jedna
 * karta nad #backdrop (vzor #vyberMista: statická sekce v index.html,
 * třída .show, registrace overlaye kvůli tlačítku zpět).
 *
 * API vrací promise – obsluhy, které se ptají, jsou async. Zrušení
 * (backdrop, tlačítko zpět, Zrušit) vrací null/false, přesně jako zrušený
 * prompt/confirm. POZOR: window.open musí zůstat v synchronní obsluze
 * kliknutí – navigační tlačítka se přes dialogy neptají.
 *
 * Otevře-li se dialog nad jiným panelem (formulář, filtry), backdrop se při
 * zavření nezhasne, dokud je ten panel vidět – jinak by pod dialogem zhasl.
 */

import { registrujOverlay } from '../core/router.js'
import { esc } from '../core/html.js'
import { IC } from '../icons/sprite.js'

/** Resolve právě otevřeného dialogu; null = žádný. */
let rozhodni = null

const el = () => document.getElementById('dialog')
const backdrop = () => document.getElementById('backdrop')

/** Panely, které si backdrop drží i po zavření dialogu. */
const JINE_PANELY = ['wizard', 'navSheet', 'vyberMista', 'addPlace', 'filters']
const jinyOtevreny = () => JINE_PANELY.some((id) => document.getElementById(id)?.classList.contains('show'))

export const jeOtevrenyDialog = () => !!rozhodni

/**
 * Zavře dialog s výsledkem. Vrací true, když nějaký otevřený byl –
 * toho využívá klik na backdrop, aby nezavřel i panel pod dialogem.
 * @param {any} vysledek
 */
export function zavriDialog(vysledek = null) {
  if (!rozhodni) return false
  const r = rozhodni
  rozhodni = null
  el().classList.remove('show')
  if (!jinyOtevreny()) backdrop().classList.remove('show')
  r(vysledek)
  return true
}

/** Otevře dialog s daným obsahem a vrátí promise na výsledek. */
function otevri(html) {
  return new Promise((resolve) => {
    zavriDialog(null)
    rozhodni = resolve
    el().innerHTML = html
    el().classList.add('show')
    backdrop().classList.add('show')
  })
}

const hlava = (nadpis, ikona) => (nadpis ? `<h2>${IC(ikona)}${esc(nadpis)}</h2>` : '')

/**
 * Potvrzení. Vrací true jen po ťuknutí na potvrzovací tlačítko.
 * @param {{nadpis?: string, text?: string, ano?: string, ne?: string, nebezpecne?: boolean}} p
 * @returns {Promise<boolean>}
 */
export async function potvrd({ nadpis = '', text = '', ano = 'Potvrdit', ne = 'Zrušit', nebezpecne = false }) {
  const slib = otevri(`
    ${hlava(nadpis, nebezpecne ? 'i-x' : 'i-check')}
    ${text ? `<p class="dialog-text">${esc(text)}</p>` : ''}
    <div class="btnrow">
      <button class="btn" id="dialogNe">${esc(ne)}</button>
      <button class="btn primary${nebezpecne ? ' nebezpecne' : ''}" id="dialogAno">${esc(ano)}</button>
    </div>`)
  document.getElementById('dialogNe').onclick = () => zavriDialog(false)
  document.getElementById('dialogAno').onclick = () => zavriDialog(true)
  return !!(await slib)
}

/**
 * Zadání jednoho řádku textu. Enter potvrzuje, zrušení vrací null.
 * @param {{nadpis?: string, text?: string, vychozi?: string, placeholder?: string, ano?: string, ne?: string}} p
 * @returns {Promise<string|null>}
 */
export async function zadej({ nadpis = '', text = '', vychozi = '', placeholder = '', ano = 'Uložit', ne = 'Zrušit' }) {
  const slib = otevri(`
    ${hlava(nadpis, 'i-quill')}
    ${text ? `<p class="dialog-text">${esc(text)}</p>` : ''}
    <input id="dialogVstup" type="text" value="${esc(vychozi).replace(/"/g, '&quot;')}" placeholder="${esc(placeholder)}" autocomplete="off">
    <div class="btnrow">
      <button class="btn" id="dialogNe">${esc(ne)}</button>
      <button class="btn primary" id="dialogAno">${esc(ano)}</button>
    </div>`)
  const vstup = document.getElementById('dialogVstup')
  document.getElementById('dialogNe').onclick = () => zavriDialog(null)
  document.getElementById('dialogAno').onclick = () => zavriDialog(vstup.value)
  vstup.onkeydown = (e) => {
    if (e.key === 'Enter') zavriDialog(vstup.value)
  }
  vstup.focus()
  vstup.select()
  const v = await slib
  return typeof v === 'string' ? v : null
}

/**
 * Výběr jedné položky ze seznamu. Vrací její id, zrušení null.
 * @param {{nadpis?: string, text?: string, polozky: Array<{id: string, popisek: string, ikona?: string, meta?: string, on?: boolean}>}} p
 * @returns {Promise<string|null>}
 */
export async function vyberZeSeznamu({ nadpis = '', text = '', polozky }) {
  const slib = otevri(`
    ${hlava(nadpis, 'i-slozka')}
    ${text ? `<p class="dialog-text">${esc(text)}</p>` : ''}
    <div class="dialog-seznam">${polozky
      .map(
        (p, i) => `<button class="dialog-volba${p.on ? ' on' : ''}" data-i="${i}">
          ${p.ikona ? IC(p.ikona) : ''}${esc(p.popisek)}${p.meta ? `<span>${esc(p.meta)}</span>` : ''}
        </button>`
      )
      .join('')}</div>
    <div class="btnrow"><button class="btn" id="dialogNe">Zrušit</button></div>`)
  document.getElementById('dialogNe').onclick = () => zavriDialog(null)
  for (const b of el().querySelectorAll('.dialog-volba'))
    b.onclick = () => zavriDialog(polozky[Number(b.dataset.i)].id)
  const v = await slib
  return typeof v === 'string' ? v : null
}

/**
 * Oznámení – náhrada alert(). Jen se odklepne.
 * @param {{nadpis?: string, text?: string, ano?: string}} p
 * @returns {Promise<void>}
 */
export async function oznam({ nadpis = '', text = '', ano = 'Rozumím' }) {
  const slib = otevri(`
    ${hlava(nadpis, 'i-spark')}
    ${text ? `<p class="dialog-text">${esc(text)}</p>` : ''}
    <div class="btnrow"><button class="btn primary" id="dialogAno">${esc(ano)}</button></div>`)
  document.getElementById('dialogAno').onclick = () => zavriDialog(true)
  await slib
}

/** Registrace overlaye – tlačítko zpět zavře dialog dřív, než přepne záložku. */
export function initDialog() {
  registrujOverlay({ jeOtevreny: jeOtevrenyDialog, zavri: () => zavriDialog(null) })
}
