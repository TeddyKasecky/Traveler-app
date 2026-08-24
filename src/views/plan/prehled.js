/**
 * Čísla výpravy – čtyři skupiny čísel otevřené výpravy a volitelné srovnání.
 *
 * Do srpna 2026 to byla samostatná karta Přehled s vlastním výběrem plánu.
 * Zanikla schválně: výběr plánu patří do knihovny Výpravy a čísla k otevřené
 * výpravě do Itineráře – dvě místa výběru dvěma mechanikami mátla.
 *
 * SROVNÁNÍ JE NADSTAVBA, ne výchozí stav – tlačítkem „Srovnat s…" se přidá
 * druhý plán (výběr seskupený po složkách) a tatáž čísla se ukážou vedle
 * sebe; křížkem se zase vypne.
 *
 * Všechno jsou čisté funkce nad seznamem míst – žádný stav kromě toho,
 * s kterou výpravou se zrovna srovnává (jen v paměti).
 */

import { S, store } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { IC } from '../../icons/sprite.js'
import { dkm } from '../../core/geo.js'
import { seznamVyprav, seznamSlozek, BEZ_NAZVU } from './vypravy.js'
import { planStats } from './plan.js'
import { fmtKm } from '../../core/geo.js'

/** Silnice bývá delší než vzdušná čára – týž koeficient jako v plan.js. */
const KLIKATOST = 1.35

/** S kterou výpravou se srovnává: index v `store.vypravy`, null = bez srovnání. */
let srovnavana = null

/**
 * Čísla jedné výpravy pro všechny čtyři skupiny.
 * @param {string[]} plan  id zastávek
 */
export function cislaVypravy(plan) {
  const mista = plan.map((id) => S.byId[id]).filter(Boolean)
  const st = planStats(mista)

  // Nejdelší přejezd mezi sousedy – „nejhorší den za volantem v malém".
  let nejdelsi = 0
  for (let i = 1; i < mista.length; i++) nejdelsi = Math.max(nejdelsi, dkm(mista[i - 1], mista[i]) * KLIKATOST)

  const kategorie = {}
  for (const p of mista) kategorie[p.k] = (kategorie[p.k] || 0) + 1

  const zeme = new Set(mista.map((p) => p.z))
  const kraje = new Set(mista.map((p) => p.r).filter(Boolean))
  const navstivenaZeme = new Set(S.places.filter((p) => store.stav[p.id] === 'visited').map((p) => p.z))

  return {
    mist: mista.length,
    km: st.road,
    nejdelsi,
    navstiveno: mista.filter((p) => store.stav[p.id] === 'visited').length,
    hodnocenych4: mista.filter((p) => (store.rating[p.id] || 0) >= 4).length,
    kategorie,
    zeme: [...zeme],
    kraje: [...kraje],
    novychZemi: [...zeme].filter((z) => !navstivenaZeme.has(z)).length,
    // Tatáž pole, podle kterých filtrují rychlé filtry (`core/filters.js`) –
    // kdyby se tu počítalo jinak, čísla by nesedla na to, co filtr ukáže.
    zdarma: mista.filter((p) => (p.c || '').startsWith('Zdarma')).length,
    sDetmi: mista.filter((p) => p.ch === 'Ano').length,
    sePsem: mista.filter((p) => p.ps === 'Ano').length,
    parkoviste: mista.filter((p) => !!p.parking).length,
    prespani: mista.filter((p) => p.k === 'Spaní').length,
  }
}

/**
 * Jedna dvojice popisek–hodnota; při srovnání dvě hodnoty vedle sebe.
 * Test je `!= null`, ne `!== undefined`: bez zapnutého srovnání sem chodí
 * `b && f(…)`, tedy `null` – a ten se dřív vypisoval doslova jako „null".
 */
function radek(popisek, a, b) {
  return `<div class="preh-radek"><span>${popisek}</span><b>${a}</b>${b != null ? `<b class="druhy">${b}</b>` : ''}</div>`
}

/** Skupina řádků s nadpisem. */
function skupina(nadpis, ikona, radky) {
  return `<div class="preh-skupina"><div class="preh-nadpis">${IC(ikona)}${nadpis}</div>${radky}</div>`
}

/** Záznam výpravy, se kterou se srovnává, nebo null. */
function srovnavanaVyprava() {
  if (srovnavana == null) return null
  const v = (store.vypravy || [])[srovnavana]
  if (!v || !Array.isArray(v.plan)) {
    srovnavana = null
    return null
  }
  return { nazev: v.nazev || BEZ_NAZVU, plan: v.plan }
}

/**
 * Volby pro výběr srovnávané výpravy, seskupené po složkách.
 * Aktivní (index -1) se vynechává – sama se sebou se nesrovnává.
 */
function volbySrovnani() {
  return seznamSlozek()
    .map((s) => {
      const opts = s.vypravy
        .filter((v) => !v.aktivni)
        .map((v) => `<option value="${v.index}"${v.index === srovnavana ? ' selected' : ''}>${esc(v.nazev)}</option>`)
        .join('')
      if (!opts) return ''
      return s.slozka ? `<optgroup label="${esc(s.slozka)}">${opts}</optgroup>` : opts
    })
    .join('')
}

/**
 * HTML čísel otevřené výpravy. Vkládá je Itinerář (`plan.js`).
 * @returns {string}
 */
export function cislaPlanuHtml() {
  if (!store.plan.length) return ''
  const a = cislaVypravy(store.plan)
  const druha = srovnavanaVyprava()
  const b = druha ? cislaVypravy(druha.plan) : null
  const jineJsou = seznamVyprav().some((v) => !v.aktivni)

  const srovnaniHtml = druha
    ? `<div class="preh-vyber">
        <span class="preh-proti">proti</span>
        <select id="prehSrovnat">${volbySrovnani()}</select>
        <button class="ikonbtn" id="prehZrusSrovnani" title="Zrušit srovnání">${IC('i-x')}</button>
      </div>`
    : jineJsou
      ? `<div class="preh-vyber"><button class="btn small" id="prehSrovnej">${IC('i-copy')}Srovnat s…</button></div>`
      : ''

  const kategorieHtml = (c) =>
    Object.entries(c.kategorie)
      .sort((x, y) => y[1] - x[1])
      .map(([k, n]) => `<span class="tag">${esc(k)} × ${n}</span>`)
      .join('') || '<span class="meta">nic</span>'

  const f = (n) => String(n)

  return `<div class="sekce"><span class="sekce-text">Čísla výpravy</span></div>
    ${srovnaniHtml}
    <div class="preh${b ? ' srovnani' : ''}">
      ${b ? `<div class="preh-hlavy"><span></span><b>${esc(store.vypravaNazev || BEZ_NAZVU)}</b><b class="druhy">${esc(druha.nazev)}</b></div>` : ''}
      ${skupina(
        'Délka a náročnost',
        'i-route',
        radek('Zastávek', f(a.mist), b && f(b.mist)) +
          radek('Vzdálenost po trase', a.mist > 1 ? fmtKm(a.km) : '—', b && (b.mist > 1 ? fmtKm(b.km) : '—')) +
          radek('Nejdelší přejezd', a.nejdelsi ? fmtKm(a.nejdelsi) : '—', b && (b.nejdelsi ? fmtKm(b.nejdelsi) : '—'))
      )}
      ${skupina(
        'Co je na trase',
        'i-compass',
        // „Už navštívených" odešlo (srpen 2026) spolu s fajfkou u zastávky:
        // Itinerář odpovídá na „jak to pojedeme", ne na „kde jsme byli".
        // Hodnocení zůstává – to je vlastnost místa, ne stav plánu.
        radek('Hodnocených 4★+', f(a.hodnocenych4), b && f(b.hodnocenych4)) +
          `<div class="preh-tagy">${kategorieHtml(a)}</div>` +
          (b ? `<div class="preh-tagy druhy">${kategorieHtml(b)}</div>` : '')
      )}
      ${skupina(
        'Země a oblasti',
        'i-globe',
        radek('Zemí', `${a.zeme.length}${a.novychZemi ? ` (${a.novychZemi} nových)` : ''}`, b && `${b.zeme.length}${b.novychZemi ? ` (${b.novychZemi} nových)` : ''}`) +
          radek('Krajů', f(a.kraje.length), b && f(b.kraje.length)) +
          `<div class="meta preh-zeme">${a.zeme.map(esc).join(' · ') || '—'}</div>`
      )}
      ${skupina(
        'Praktické',
        'i-check',
        radek('Zdarma', f(a.zdarma), b && f(b.zdarma)) +
          radek('S dětmi', f(a.sDetmi), b && f(b.sDetmi)) +
          radek('Se psem', f(a.sePsem), b && f(b.sePsem)) +
          radek('Ověřené parkoviště', f(a.parkoviste), b && f(b.parkoviste)) +
          radek('Míst na přespání', f(a.prespani), b && f(b.prespani))
      )}
    </div>`
}

/**
 * Naváže zapnutí, přepnutí a vypnutí srovnání.
 * @param {HTMLElement} wrap
 * @param {() => void} prekresli
 */
export function napojCislaPlanu(wrap, prekresli) {
  const srovnej = wrap.querySelector('#prehSrovnej')
  if (srovnej)
    srovnej.onclick = () => {
      const prvni = seznamVyprav().find((v) => !v.aktivni)
      srovnavana = prvni ? prvni.index : null
      prekresli()
    }
  const vyberSrovnani = wrap.querySelector('#prehSrovnat')
  if (vyberSrovnani)
    vyberSrovnani.onchange = () => {
      srovnavana = Number(vyberSrovnani.value)
      prekresli()
    }
  const zrus = wrap.querySelector('#prehZrusSrovnani')
  if (zrus)
    zrus.onclick = () => {
      srovnavana = null
      prekresli()
    }
}
