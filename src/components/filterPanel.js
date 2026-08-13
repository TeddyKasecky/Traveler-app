/**
 * Panel filtrů a správa dat (CSV, záloha, obnova, návrat k vestavěným datům).
 */

import { S, F, store, save, VESTAVENA_DATA, nastavData } from '../core/store.js'
import { esc } from '../core/html.js'
import { resetFiltru } from '../core/filters.js'
import { registrujOverlay, aktivujZalozku } from '../core/router.js'
import { mistaZCsv, zalohaData, obnovZalohu, stahniJson } from '../core/csv.js'
import { draw } from '../map/map.js'
import { toast } from './toast.js'
import { syncFiltersUI } from './chip.js'

const panel = () => document.getElementById('filters')
const backdrop = () => document.getElementById('backdrop')

export const jeOtevreny = () => panel().classList.contains('show')

export function otevriFiltry() {
  panel().classList.add('show')
  backdrop().classList.add('show')
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

  mk('fReg', unik('r'), 'Všechny oblasti')
  mk('fZeme', unik('z'), 'Všechny země')
  mk('fTyp', unik('t'), 'Všechny typy')

  document.getElementById('fReg').onchange = (e) => (F.reg = e.target.value)
  document.getElementById('fZeme').onchange = (e) => (F.zeme = e.target.value)
  document.getElementById('fTyp').onchange = (e) => (F.typ = e.target.value)
}

/** Naváže ovládání panelu. Volá se jednou při startu. */
export function initFilterPanel() {
  document.getElementById('fabFilter').onclick = otevriFiltry
  backdrop().onclick = () => zavriVse()

  document.getElementById('fApply').onclick = () => {
    zavriVse()
    draw()
  }

  document.getElementById('fReset').onclick = () => {
    resetFiltru()
    for (const i of ['fReg', 'fZeme', 'fTyp']) document.getElementById(i).value = ''
    for (const t of document.querySelectorAll('.toggle')) t.classList.remove('on')
    document.querySelector('.toggle.stav[data-s=""]').classList.add('on')
    for (const c of document.querySelectorAll('.chip')) c.classList.remove('on')
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

  // Hledání naopak reaguje okamžitě a z mapy přepne na seznam.
  document.getElementById('q').oninput = (e) => {
    F.q = e.target.value
    draw()
    if (S.activeTab === 'map' && F.q) aktivujZalozku('list')
  }

  initData()
  registrujOverlay({ jeOtevreny, zavri: zavriFiltry })
}

/** Zavře panel filtrů i průvodce – oboje visí na stejném ztmavení. */
function zavriVse() {
  zavriFiltry()
  document.getElementById('wizard').classList.remove('show')
}

/* ================= data a zálohy ================= */

function initData() {
  document.getElementById('csvIn').onchange = (e) => {
    const f = e.target.files[0]
    if (!f) return
    const rd = new FileReader()
    rd.onload = () => {
      try {
        const data = mistaZCsv(rd.result)
        store.dataOverride = data
        save()
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

  document.getElementById('dataReset').onclick = () => {
    if (!confirm('Vrátit vestavěná data? Poznámky zůstanou.')) return
    store.dataOverride = null
    save()
    nastavData(VESTAVENA_DATA)
    fillSelects()
    draw()
    aktivujZalozku('home')
  }

  document.getElementById('expBtn').onclick = () => {
    stahniJson(zalohaData(store), `vandrbuch-zaloha-${new Date().toISOString().slice(0, 10)}.json`)
    toast('Záloha stažena')
  }

  document.getElementById('impIn').onchange = (e) => {
    const f = e.target.files[0]
    if (!f) return
    const rd = new FileReader()
    rd.onload = () => {
      try {
        obnovZalohu(store, JSON.parse(rd.result))
        save()
        draw()
        toast('Záloha obnovena')
      } catch {
        alert('Soubor se nepodařilo načíst.')
      }
    }
    rd.readAsText(f, 'utf-8')
  }
}

export { syncFiltersUI }
