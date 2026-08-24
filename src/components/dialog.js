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
 *
 * `disabled` je pro volby, které appka nabízí jen jako informaci proč
 * chybí ("Start už v plánu je") – needitovatelná, klik ji nezavře.
 * @param {{nadpis?: string, text?: string, polozky: Array<{id: string, popisek: string, ikona?: string, meta?: string, on?: boolean, disabled?: boolean}>}} p
 * @returns {Promise<string|null>}
 */
export async function vyberZeSeznamu({ nadpis = '', text = '', polozky }) {
  const slib = otevri(`
    ${hlava(nadpis, 'i-slozka')}
    ${text ? `<p class="dialog-text">${esc(text)}</p>` : ''}
    <div class="dialog-seznam">${polozky
      .map(
        (p, i) => `<button class="dialog-volba${p.on ? ' on' : ''}"${p.disabled ? ' disabled' : ''} data-i="${i}">
          ${p.ikona ? IC(p.ikona) : ''}${esc(p.popisek)}${p.meta ? `<span>${esc(p.meta)}</span>` : ''}
        </button>`
      )
      .join('')}</div>
    <div class="btnrow"><button class="btn" id="dialogNe">Zrušit</button></div>`)
  document.getElementById('dialogNe').onclick = () => zavriDialog(null)
  for (const b of el().querySelectorAll('.dialog-volba:not([disabled])'))
    b.onclick = () => zavriDialog(polozky[Number(b.dataset.i)].id)
  const v = await slib
  return typeof v === 'string' ? v : null
}

/**
 * Výběr VÍCE položek naráz, s volitelnou rychlou volbou nahoře.
 *
 * PROČ VZNIKL: `vyberZeSeznamu()` zavírá po prvním kliku, takže „přidej to
 * místo do téhle a téhle výpravy" znamenalo otevřít dialog tolikrát, kolik
 * je výprav. `on: true` v něm je jen obarvení, ne stav.
 *
 * `hlavni` je nepovinná zkratka na první řádek – typicky otevřená výprava.
 * Jedno ťuknutí ji přepne a dialog rovnou zavře, protože v devíti případech
 * z deseti je odpověď právě tahle. Ostatní se zaškrtávají a potvrzují.
 *
 * Zaškrtávátko je `<button>` s ikonou, ne `<input type="checkbox">` – ten
 * v appce není ani jednou a nešel by sladit se zbytkem.
 *
 * @param {{nadpis?: string, text?: string, ikona?: string,
 *   polozky: Array<{id: string, popisek: string, ikona?: string, meta?: string}>,
 *   vybrane?: string[],
 *   hlavni?: {id: string, popisek: string, meta?: string, on?: boolean}|null,
 *   ano?: string}} p
 * @returns {Promise<string[]|null>} vybraná id, nebo null při zrušení
 */
export async function vyberVice({
  nadpis = '', text = '', ikona = 'i-slozka', polozky, vybrane = [], hlavni = null, ano = 'Hotovo',
}) {
  const stav = new Set(vybrane)

  const slib = otevri(`
    ${hlava(nadpis, ikona)}
    ${text ? `<p class="dialog-text">${esc(text)}</p>` : ''}
    ${hlavni
      ? `<button class="dialog-volba hlavni${hlavni.on ? ' on' : ''}" id="dialogHlavni">
           ${IC(hlavni.on ? 'i-check' : 'i-plus')}${esc(hlavni.popisek)}
           ${hlavni.meta ? `<span>${esc(hlavni.meta)}</span>` : ''}
         </button>
         ${polozky.length ? '<div class="dialog-del">nebo do jiné výpravy</div>' : ''}`
      : ''}
    <div class="dialog-seznam" id="dialogVice"></div>
    <div class="btnrow">
      <button class="btn" id="dialogNe">Zrušit</button>
      <button class="btn primary" id="dialogAno">${esc(ano)}</button>
    </div>`)

  const box = document.getElementById('dialogVice')
  const kresli = () => {
    box.innerHTML = polozky
      .map(
        (p) => `<button class="dialog-volba zaskrt${stav.has(p.id) ? ' on' : ''}" data-id="${p.id}"
          role="checkbox" aria-checked="${stav.has(p.id)}">
          <i class="dialog-box">${IC('i-check')}</i>${esc(p.popisek)}
          ${p.meta ? `<span>${esc(p.meta)}</span>` : ''}
        </button>`
      )
      .join('')
    for (const b of box.querySelectorAll('[data-id]')) {
      b.onclick = () => {
        const id = b.dataset.id
        stav.has(id) ? stav.delete(id) : stav.add(id)
        kresli()
      }
    }
  }
  kresli()

  if (hlavni) {
    // Rychlá volba zavírá hned – je to zkratka, ne položka seznamu. Vrací
    // se s ní i to, co je zaškrtané, aby jedno ťuknutí nezahodilo zbytek.
    document.getElementById('dialogHlavni').onclick = () => {
      hlavni.on ? stav.delete(hlavni.id) : stav.add(hlavni.id)
      zavriDialog([...stav])
    }
  }
  document.getElementById('dialogNe').onclick = () => zavriDialog(null)
  document.getElementById('dialogAno').onclick = () => zavriDialog([...stav])
  const v = await slib
  return Array.isArray(v) ? v : null
}

/* ================= kalendář a počet dnů ================= */

/**
 * PROČ VLASTNÍ KALENDÁŘ, A NE PSANÍ DATA: termín se do srpna 2026 zadával
 * textem („12.8.2026") a parsoval regulárním výrazem. Překlep, americký tvar
 * nebo lomítka skončily hláškou „Datum nerozumím" – tedy prací navíc za to,
 * že člověk napsal datum jinak, než appka čekala. Z vybírání se neplatná
 * hodnota vzít nedá.
 *
 * `<input type="date">` by byl kratší, ale vypadá na každé platformě jinak
 * a nejde ho sladit s Golden Moss. Mřížka je devadesát řádků a je celá naše.
 */
const MESICE = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen',
  'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']

/** Pondělí první – české zvyklosti, ne nedělní americké. */
const DNY_ZKR = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne']

/** 'YYYY-MM-DD'. Přes UTC jako termin.js#datumDne() – letní čas neposune den. */
const isoDatum = (r, m, d) => `${r}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/**
 * Výběr data z kalendáře.
 *
 * Vrací `'YYYY-MM-DD'`, prázdný řetězec pro „Bez termínu" (termín se tím
 * ruší) a `null` při zrušení – tedy stejné rozlišení „prázdné" × „nic",
 * jaké má `zadej()`.
 *
 * @param {{nadpis?: string, text?: string, vychozi?: string, ano?: string}} p
 * @returns {Promise<string|null>}
 */
export async function vyberDatum({ nadpis = '', text = '', vychozi = '', ano = 'Vybrat' }) {
  const dnes = new Date()
  const dnesIso = isoDatum(dnes.getFullYear(), dnes.getMonth(), dnes.getDate())
  let vybrane = /^\d{4}-\d{2}-\d{2}$/.test(vychozi) ? vychozi : ''
  const [r0, m0] = vybrane ? vybrane.split('-').map(Number) : [dnes.getFullYear(), dnes.getMonth() + 1]
  let rok = r0
  let mesic = m0 - 1

  const slib = otevri(`
    ${hlava(nadpis, 'i-kalendar')}
    ${text ? `<p class="dialog-text">${esc(text)}</p>` : ''}
    <div class="kal" id="dialogKal"></div>
    <div class="btnrow">
      <button class="btn" id="dialogNe">Zrušit</button>
      <button class="btn" id="dialogBez">Bez termínu</button>
      <button class="btn primary" id="dialogAno">${esc(ano)}</button>
    </div>`)

  const kal = document.getElementById('dialogKal')
  const kresli = () => {
    // Posun prvního dne: getUTCDay() má neděli jako 0, my pondělí.
    const posun = (new Date(Date.UTC(rok, mesic, 1)).getUTCDay() + 6) % 7
    const pocet = new Date(Date.UTC(rok, mesic + 1, 0)).getUTCDate()
    const bunky = Array(posun).fill('<span></span>')
    for (let d = 1; d <= pocet; d++) {
      const hodnota = isoDatum(rok, mesic, d)
      bunky.push(`<button class="kal-den${hodnota === vybrane ? ' on' : ''}${
        hodnota === dnesIso ? ' dnes' : ''}" data-datum="${hodnota}">${d}</button>`)
    }
    kal.innerHTML = `
      <div class="kal-hlava">
        <button class="kal-sip" data-kal="-1" aria-label="Předchozí měsíc">${IC('i-sipka')}</button>
        <b>${MESICE[mesic]} ${rok}</b>
        <button class="kal-sip dopredu" data-kal="1" aria-label="Další měsíc">${IC('i-sipka')}</button>
      </div>
      <div class="kal-tydny">${DNY_ZKR.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="kal-mriz">${bunky.join('')}</div>
      <button class="kal-dnes" id="dialogDnes">Dnes</button>`

    for (const b of kal.querySelectorAll('[data-kal]')) {
      b.onclick = () => {
        mesic += Number(b.dataset.kal)
        if (mesic < 0) {
          mesic = 11
          rok--
        } else if (mesic > 11) {
          mesic = 0
          rok++
        }
        kresli()
      }
    }
    for (const b of kal.querySelectorAll('[data-datum]')) {
      b.onclick = () => {
        vybrane = b.dataset.datum
        kresli()
      }
    }
    kal.querySelector('#dialogDnes').onclick = () => {
      vybrane = dnesIso
      rok = dnes.getFullYear()
      mesic = dnes.getMonth()
      kresli()
    }
  }
  kresli()

  document.getElementById('dialogNe').onclick = () => zavriDialog(null)
  document.getElementById('dialogBez').onclick = () => zavriDialog('')
  document.getElementById('dialogAno').onclick = () => zavriDialog(vybrane)
  const v = await slib
  return typeof v === 'string' ? v : null
}

/** Nad kolik dnů se výprava hlásí jako extrém. Upozornění, ne zákaz. */
const DNU_HODNE = 30

/**
 * Výběr počtu dnů: stepper s rychlými volbami.
 *
 * Nad `DNU_HODNE` se ukáže upozornění – seznam dnů se při takové délce dělá
 * hodně dlouhý. Je to VAROVÁNÍ, NE ZÁKAZ: kdo jede na tři měsíce, má na to
 * právo a appka mu do toho nemá mluvit.
 *
 * @param {{nadpis?: string, text?: string, vychozi?: number, max?: number, ano?: string}} p
 * @returns {Promise<number|null>}
 */
export async function vyberPocetDni({ nadpis = '', text = '', vychozi = 0, max = 365, ano = 'Uložit' }) {
  const RYCHLE = [3, 5, 7, 10, 14, 21]
  let n = Math.max(0, Math.min(max, Math.round(vychozi) || 0))

  const slib = otevri(`
    ${hlava(nadpis, 'i-kalendar')}
    ${text ? `<p class="dialog-text">${esc(text)}</p>` : ''}
    <div class="pocet" id="dialogPocet"></div>
    <div class="btnrow">
      <button class="btn" id="dialogNe">Zrušit</button>
      <button class="btn primary" id="dialogAno">${esc(ano)}</button>
    </div>`)

  const box = document.getElementById('dialogPocet')
  const kresli = () => {
    box.innerHTML = `
      <div class="pocet-stepper">
        <button class="pocet-krok" data-krok="-1" aria-label="O den míň"${n <= 0 ? ' disabled' : ''}>−</button>
        <b>${n || '—'}</b>
        <button class="pocet-krok" data-krok="1" aria-label="O den víc"${n >= max ? ' disabled' : ''}>+</button>
      </div>
      <div class="pocet-rychle">${RYCHLE.map(
        (d) => `<button class="pocet-pill${d === n ? ' on' : ''}" data-pocet="${d}">${d}</button>`
      ).join('')}</div>
      ${n > DNU_HODNE
        ? `<div class="pocet-pozor">${IC('i-clock')}To je pořádná výprava. Nad ${DNU_HODNE} dní se seznam
             dnů dělá hodně dlouhý – zvaž rozdělení na víc výprav.</div>`
        : ''}`

    for (const b of box.querySelectorAll('[data-krok]')) {
      b.onclick = () => {
        n = Math.max(0, Math.min(max, n + Number(b.dataset.krok)))
        kresli()
      }
    }
    for (const b of box.querySelectorAll('[data-pocet]')) {
      b.onclick = () => {
        // Druhé ťuknutí na tutéž pilulku ji zruší – stejné pravidlo jako
        // u chutí v „Co dál?".
        const d = Number(b.dataset.pocet)
        n = n === d ? 0 : d
        kresli()
      }
    }
  }
  kresli()

  document.getElementById('dialogNe').onclick = () => zavriDialog(null)
  document.getElementById('dialogAno').onclick = () => zavriDialog(n)
  const v = await slib
  return typeof v === 'number' ? v : null
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
