/**
 * Panel filtrů a správa dat (CSV, záloha, obnova, návrat k vestavěným datům).
 */

import {
  S,
  F,
  store,
  save,
  PHOTOS,
  savePhotos,
  prefs,
  savePrefs,
  VESTAVENA_DATA,
  nastavData,
  ulozVlastniData,
} from '../core/store.js'
import { esc } from '../core/html.js'
import { resetFiltru } from '../core/filters.js'
import { registrujOverlay, aktivujZalozku } from '../core/router.js'
import { mistaZCsv, zalohaData, obnovZalohu, stahniJson } from '../core/csv.js'
import { draw } from '../map/map.js'
import { toast } from './toast.js'
import { syncFiltersUI } from './chip.js'
import { otevriFormular } from './addForm.js'
import { nastavMotiv, zvolenyMotiv } from '../core/motiv.js'

const panel = () => document.getElementById('filters')
const backdrop = () => document.getElementById('backdrop')

export const jeOtevreny = () => panel().classList.contains('show')

export function otevriFiltry() {
  obnovInfoOZaloze()
  panel().classList.add('show')
  backdrop().classList.add('show')
}

/**
 * Doplní hlášku „poslední záloha před …".
 *
 * Přepočítává se při každém otevření panelu, ne jednou při startu – aplikace
 * bývá otevřená celý den a údaj by zestárnul.
 *
 * Po týdnu se zvýrazní. Záloha je jediná cesta, jak si data přenést do jiného
 * telefonu, a na cestě poznámek rychle přibývá.
 */
function obnovInfoOZaloze() {
  const el = document.getElementById('zalohaInfo')
  if (!el) return

  const kdy = prefs.posledniZaloha || 0
  const dni = kdy ? Math.floor((Date.now() - kdy) / 86400000) : -1
  const text =
    dni < 0
      ? 'Zálohu jsi ještě nestahovala.'
      : dni === 0
        ? 'Záloha stažená dnes.'
        : dni === 1
          ? 'Poslední záloha včera.'
          : `Poslední záloha před ${dni} dny.`

  el.textContent = text
  el.style.color = dni < 0 || dni >= 7 ? 'var(--clay)' : ''
  el.style.fontWeight = dni < 0 || dni >= 7 ? '800' : ''
}

export function zavriFiltry() {
  panel().classList.remove('show')
  backdrop().classList.remove('show')
}

/**
 * Naplní rozbalovací seznamy hodnotami, které se v datech opravdu vyskytují.
 * Volá se znovu po každé výměně dat (import CSV, návrat k vestavěným).
 */
export function fillSelects() {
  const mk = (id, vals, vse) => {
    const s = document.getElementById(id)
    s.innerHTML = `<option value="">${vse}</option>${vals.map((x) => `<option>${esc(x)}</option>`).join('')}`
  }
  const unik = (klic) => [...new Set(S.places.map((p) => p[klic]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'))

  // Prázdná volba je zároveň popiskem pilulky – tak to má předloha Seznamu.
  mk('fReg', unik('r'), 'Oblast')
  mk('fZeme', unik('z'), 'Země')
  mk('fTyp', unik('t'), 'Typ')

  // Pilulky na Seznamu překreslují hned, protože jsou vidět rovnou nad výsledky.
  // Přepínače v panelu Filtry se dál potvrzují tlačítkem „Ukázat výsledky".
  const hned = (klic) => (e) => {
    F[klic] = e.target.value
    draw()
  }
  document.getElementById('fReg').onchange = hned('reg')
  document.getElementById('fZeme').onchange = hned('zeme')
  document.getElementById('fTyp').onchange = hned('typ')
  document.getElementById('fStav').onchange = hned('stav')
  document.getElementById('fRazeni').onchange = () => draw()
}

/** Zvýrazní tlačítko, které odpovídá uložené volbě vzhledu. */
function srovnejMotivUI() {
  for (const b of document.querySelectorAll('.motivbtn')) {
    b.classList.toggle('on', b.dataset.motiv === zvolenyMotiv())
  }
}

/** Naváže ovládání panelu. Volá se jednou při startu. */
export function initFilterPanel() {
  document.getElementById('fabFilter').onclick = otevriFiltry
  // Tlačítko filtrů je nově i ve vyhledávací liště na Seznamu – předloha ho
  // má u hledání, ne jako plovoucí knoflík vpravo dole.
  document.getElementById('listFiltry').onclick = otevriFiltry
  backdrop().onclick = () => zavriVse()

  for (const b of document.querySelectorAll('.motivbtn')) {
    b.onclick = () => {
      nastavMotiv(b.dataset.motiv)
      srovnejMotivUI()
    }
  }
  srovnejMotivUI()

  document.getElementById('fApply').onclick = () => {
    zavriVse()
    draw()
  }

  document.getElementById('fReset').onclick = () => {
    resetFiltru()
    // Jedno srovnání místo pěti smyček: `syncFiltersUI()` umí přepínače,
    // rozbalovací seznamy i rychlé pilulky nad mapou. Když se přidal další
    // prvek filtru, na tenhle výčet se pokaždé zapomnělo.
    syncFiltersUI()
    zavriVse()
    draw()
    toast('Filtry zrušeny')
  }

  // Přepínače mění stav filtrů, ale nepřekreslují – to udělá až „Ukázat výsledky“.
  for (const t of document.querySelectorAll('.toggle[data-f]')) {
    t.onclick = () => {
      F[t.dataset.f] = !F[t.dataset.f]
      t.classList.toggle('on')
    }
  }
  for (const t of document.querySelectorAll('.toggle.stav')) {
    t.onclick = () => {
      F.stav = t.dataset.s
      for (const x of document.querySelectorAll('.toggle.stav')) x.classList.toggle('on', x === t)
    }
  }

  // Hledání je podle předlohy na dvou obrazovkách – v liště Mapy i Seznamu.
  // Obě políčka píšou do jednoho `F.q` a to druhé si srovnají, aby si
  // neprotiřečila. Skok na Seznam při psaní na mapě odpadl: na mapě jsou
  // výsledkem hledání špendlíky, což je celý smysl toho, že tam hledání je.
  for (const id of ['q', 'qMapa']) {
    document.getElementById(id).oninput = (e) => {
      F.q = e.target.value
      for (const druhe of ['q', 'qMapa']) {
        const el = document.getElementById(druhe)
        if (el && el !== e.target) el.value = F.q
      }
      draw()
    }
  }

  initData()
  registrujOverlay({ jeOtevreny, zavri: zavriFiltry })
}

/**
 * Zavře všechno, co visí na stejném ztmavení: panel filtrů, průvodce, nabídku
 * navigace a vybírátko míst.
 *
 * Sahá se na ně přes DOM, ne přes import: zavření je čistě vizuální věc
 * a panel filtrů nemá důvod znát obrazovku Plán ani vybírátko.
 */
function zavriVse() {
  zavriFiltry()
  for (const id of ['wizard', 'navSheet', 'vyberMista']) {
    document.getElementById(id)?.classList.remove('show')
  }
}

/* ================= data a zálohy ================= */

/**
 * Stáhne zálohu uživatelských dat a zapamatuje si kdy.
 *
 * Exportované schválně: spouští ji i varovný pruh při plné paměti. Tam je to
 * jediná záchrana, jak si data odnést, než se něco ztratí.
 *
 * Razítko se zapisuje až po sestavení zálohy, aby v ní bylo datum té předchozí.
 */
export function stahniZalohu() {
  stahniJson(zalohaData(store, PHOTOS, prefs), `vandrbuch-zaloha-${new Date().toISOString().slice(0, 10)}.json`)
  prefs.posledniZaloha = Date.now()
  savePrefs()
  toast('Záloha stažena')
}

function initData() {
  document.getElementById('csvIn').onchange = (e) => {
    const f = e.target.files[0]
    if (!f) return
    const rd = new FileReader()
    rd.onload = () => {
      try {
        const data = mistaZCsv(rd.result)
        ulozVlastniData(data)
        nastavData(data)
        fillSelects()
        draw()
        aktivujZalozku('home')
        toast(`Načteno ${data.length} míst`)
      } catch {
        alert('CSV se nepodařilo načíst – zkontroluj formát vse-dohromady-v3.')
      }
    }
    rd.readAsText(f, 'utf-8')
  }

  // Formulář na přidání místa. Schválně tady mezi správcovskými tlačítky,
  // ne na hlavní obrazovce – přidávání míst není každodenní činnost.
  document.getElementById('addOpen').onclick = () => {
    zavriFiltry()
    otevriFormular()
  }

  document.getElementById('dataReset').onclick = () => {
    if (!confirm('Vrátit vestavěná data? Poznámky zůstanou.')) return
    ulozVlastniData(null)
    nastavData(VESTAVENA_DATA)
    fillSelects()
    draw()
    aktivujZalozku('home')
  }

  document.getElementById('expBtn').onclick = stahniZalohu

  document.getElementById('impIn').onchange = (e) => {
    const f = e.target.files[0]
    if (!f) return
    const rd = new FileReader()
    rd.onload = async () => {
      try {
        obnovZalohu(store, JSON.parse(rd.result), PHOTOS, prefs)
        save()
        savePrefs()
        draw()
        // Fotky jdou do IndexedDB, tedy asynchronně – hláška až potom, ať se
        // uživatel nedozví „obnoveno“ dřív, než je jasné, že fotky opravdu sedí.
        toast((await savePhotos()) ? 'Záloha obnovena' : 'Obnoveno, ale fotky se neuložily')
      } catch {
        alert('Soubor se nepodařilo načíst.')
      }
    }
    rd.readAsText(f, 'utf-8')
  }
}

export { syncFiltersUI }
