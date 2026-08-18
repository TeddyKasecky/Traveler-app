/**
 * Přehled plánu – čísla jedné výpravy a volitelné srovnání s druhou.
 *
 * ZÁKLAD JE PŘEHLED JEDNOHO PLÁNU: vybraná výprava a k ní čtyři skupiny
 * čísel (délka a náročnost · co je na trase · země a oblasti · praktické).
 * SROVNÁNÍ JE NADSTAVBA, ne výchozí stav – tlačítkem „Srovnat s…" se přidá
 * druhý plán a tatáž čísla se ukážou vedle sebe; křížkem se zase vypne.
 *
 * Všechno jsou čisté funkce nad seznamem míst – žádný stav kromě toho,
 * které dvě výpravy se zrovna ukazují (jen v paměti).
 */

import { S, store } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { IC } from '../../icons/sprite.js'
import { dkm } from '../../core/geo.js'
import { seznamVyprav } from './vypravy.js'
import { planStats } from './plan.js'
import { fmtKm } from '../../core/geo.js'

/** Silnice bývá delší než vzdušná čára – týž koeficient jako v plan.js. */
const KLIKATOST = 1.35

/** Kterou výpravu ukazuje přehled (index v seznamu) a s kterou se srovnává. */
let vybrana = -1
let srovnavana = -1

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

/** Jedna dvojice popisek–hodnota; při srovnání dvě hodnoty vedle sebe. */
function radek(popisek, a, b) {
  return `<div class="preh-radek"><span>${popisek}</span><b>${a}</b>${b !== undefined ? `<b class="druhy">${b}</b>` : ''}</div>`
}

/** Skupina řádků s nadpisem. */
function skupina(nadpis, ikona, radky) {
  return `<div class="preh-skupina"><div class="preh-nadpis">${IC(ikona)}${nadpis}</div>${radky}</div>`
}

/**
 * HTML přehledu. Volá `plan.js` z karty Přehled.
 * @returns {string}
 */
export function prehledPlanuHtml() {
  const vypravy = seznamVyprav()
  if (vybrana < 0 || vybrana >= vypravy.length) vybrana = vypravy.findIndex((v) => v.aktivni)
  if (srovnavana >= vypravy.length) srovnavana = -1

  const hlavni = vypravy[vybrana]
  if (!hlavni) return ''
  const a = cislaVypravy(hlavni.plan)
  const b = srovnavana >= 0 && srovnavana !== vybrana ? cislaVypravy(vypravy[srovnavana].plan) : null

  const vyberHtml = `<div class="preh-vyber">
    <select id="prehVyber">${vypravy
      .map((v, i) => `<option value="${i}"${i === vybrana ? ' selected' : ''}>${esc(v.nazev)}</option>`)
      .join('')}</select>
    ${
      b
        ? `<span class="preh-proti">proti</span>
           <select id="prehSrovnat">${vypravy
             .map((v, i) => `<option value="${i}"${i === srovnavana ? ' selected' : ''}${i === vybrana ? ' disabled' : ''}>${esc(v.nazev)}</option>`)
             .join('')}</select>
           <button class="ikonbtn" id="prehZrusSrovnani" title="Zrušit srovnání">${IC('i-x')}</button>`
        : vypravy.length > 1
          ? `<button class="btn small" id="prehSrovnej">${IC('i-copy')}Srovnat s…</button>`
          : ''
    }
  </div>`

  const kategorieHtml = (c) =>
    Object.entries(c.kategorie)
      .sort((x, y) => y[1] - x[1])
      .map(([k, n]) => `<span class="tag">${esc(k)} × ${n}</span>`)
      .join('') || '<span class="meta">nic</span>'

  const f = (n) => String(n)

  return `${vyberHtml}
    <div class="preh${b ? ' srovnani' : ''}">
      ${b ? `<div class="preh-hlavy"><span></span><b>${esc(hlavni.nazev)}</b><b class="druhy">${esc(vypravy[srovnavana].nazev)}</b></div>` : ''}
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
        radek('Už navštívených', f(a.navstiveno), b && f(b.navstiveno)) +
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
 * Naváže výběr a srovnání.
 * @param {HTMLElement} wrap
 * @param {() => void} prekresli
 */
export function napojPrehledPlanu(wrap, prekresli) {
  const vyber = wrap.querySelector('#prehVyber')
  if (vyber)
    vyber.onchange = () => {
      vybrana = Number(vyber.value)
      if (srovnavana === vybrana) srovnavana = -1
      prekresli()
    }
  const srovnej = wrap.querySelector('#prehSrovnej')
  if (srovnej)
    srovnej.onclick = () => {
      const vypravy = seznamVyprav()
      srovnavana = vypravy.findIndex((_, i) => i !== vybrana)
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
      srovnavana = -1
      prekresli()
    }
}
