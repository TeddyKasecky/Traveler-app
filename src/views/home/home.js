/**
 * Záložka Domů – hero s dodávkou, pozdrav, nálady, rozkoukaná místa,
 * čísla a sbalitelný přehled bikeparků.
 */

import { S, store, prefs, savePrefs } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { zjistiPolohu } from '../../core/geo.js'
import { aktivujZalozku } from '../../core/router.js'
import { IC } from '../../icons/sprite.js'
import { flames, setPrio } from '../../components/prio.js'
import { priceChip, bpWeb } from '../../components/priceChip.js'
import { hash } from '../../components/postcard.js'
import { openWizard } from '../../components/wizard.js'
import { goTo } from '../../map/map.js'
import { togglePlan } from '../plan/plan.js'
import vanImg from '../../assets/van.webp'

/** Kolik prioritních míst a kolik denních tipů se vejde do pruhu. */
const PRIO_MAX = 3
const TIPU = 2

/** Pozdrav podle denní doby. */
export function greeting() {
  const h = new Date().getHours()
  const n = prefs.userName ? `, ${prefs.userName}` : ''
  if (h >= 5 && h < 10) return `Dobré ráno${n}. Kam se dnes zatouláme?`
  if (h >= 10 && h < 14) return `Tak co${n}, co dnes objevíme?`
  if (h >= 14 && h < 18) return `Ještě někam odbočíme${n}?`
  if (h >= 18 && h < 22) return `Kam nás to zaválo dnes${n}?`
  return `Dobrou noc na čtyřech kolech${n}.`
}

/** Zkrácený název na dlaždici. */
const nm = (p) => {
  const s = p.n.split(/\s[–(]/)[0].trim()
  return s.length > 26 ? `${s.slice(0, 25).trim()}…` : s
}

export function renderHome() {
  const el = document.getElementById('homeInner')
  const visited = S.places.filter((p) => store.stav[p.id] === 'visited').length
  const regs = new Set(S.places.map((p) => p.r).filter(Boolean)).size

  const bps = S.places
    .filter((p) => p.k === 'Bikeparky')
    .sort(
      (a, b) =>
        (store.prio[b.id] || 0) - (store.prio[a.id] || 0) ||
        (b.pv ? 1 : 0) - (a.pv ? 1 : 0) ||
        a.n.localeCompare(b.n, 'cs')
    )

  /* ---- pruh „rozkoukaných“ – skládá se z existujících dat, žádný nový stav ---- */
  const used = new Set()
  const prioP = S.places
    .filter((p) => (store.prio[p.id] || 0) >= 2 && store.stav[p.id] !== 'visited')
    .sort((a, b) => (store.prio[b.id] || 0) - (store.prio[a.id] || 0))
    .slice(0, PRIO_MAX)
  for (const p of prioP) used.add(p.id)

  const notedIds = Object.keys(store.notes).filter(
    (id) => store.notes[id] && store.notes[id].trim() && S.byId[id] && !used.has(id)
  )
  const lastNote = notedIds.length ? S.byId[notedIds[notedIds.length - 1]] : null
  if (lastNote) used.add(lastNote.id)

  // Tip dne: náhodný, ale se seedem podle data – během dne se nemění.
  const seed = new Date().toDateString()
  const fresh = []
  const cand = S.places.filter((p) => store.stav[p.id] !== 'visited' && !store.plan.includes(p.id) && !used.has(p.id))
  for (let k = 0; k < TIPU && cand.length; k++) {
    fresh.push(cand.splice(hash(`${seed}#${k}`) % cand.length, 1)[0])
  }

  const poznamka = lastNote ? (store.notes[lastNote.id] || '').trim() : ''

  el.innerHTML = `
    <div class="homehero"><img src="${vanImg}" alt=""></div>
    <div class="htitle"><h1>${IC('i-van')}Vandrbuch</h1>
      <p id="hgreet" title="Ťukni a nastav oslovení">${esc(greeting())}</p></div>

    <button class="locpill ${S.userPos ? 'ok' : ''}" id="locBtn">${IC('i-pinme')}${S.userPos ? 'Poloha nalezena ✓' : 'Použít moji polohu'}</button>

    <div class="sechd">${IC('i-quill')}Možná dnes. Možná někdy.</div>
    <div class="wiprow">
      <button class="wip plan" id="wipPlan">${IC('i-route')}<b>${store.plan.length ? `${store.plan.length} zastávek` : 'Plán je prázdný'}</b><span>v plánu</span><em id="wipWiz">vykouzlit ✨</em></button>
      ${prioP.map((p) => `<button class="wip" data-go="${p.id}"><span class="fl-badge">${flames(store.prio[p.id], store.prio[p.id], 10)}</span><b>${esc(nm(p))}</b><span>${esc(p.r || p.z || '')}</span></button>`).join('')}
      ${lastNote ? `<button class="wip" data-go="${lastNote.id}">${IC('i-quill', 'color:var(--plum)')}<b>${esc(nm(lastNote))}</b><span>„${esc(poznamka.slice(0, 26))}${poznamka.length > 26 ? '…' : ''}“</span></button>` : ''}
      ${fresh.map((p) => `<button class="wip" data-go="${p.id}">${IC('i-spark', 'color:var(--sand)')}<b>${esc(nm(p))}</b><span>ještě neviděno · ${esc(p.r || p.z || '')}</span></button>`).join('')}
    </div>

    <div class="sechd">${IC('i-flag')}Náš Vandrbuch v číslech</div>
    <div class="hstats mini">
      <div class="hstat"><b>${S.places.length}</b><span>míst</span></div>
      <div class="hstat"><b>${visited}</b><span>navštíveno</span></div>
      <div class="hstat"><b>${store.plan.length}</b><span>v plánu</span></div>
      <div class="hstat"><b>${regs}</b><span>oblastí</span></div>
    </div>

    <button class="bphead tgl ${prefs.bpOpen ? 'open' : ''}" id="bpTgl">
      <h2>${IC('i-bike')}Bikeparky – ceny 2026</h2>
      <svg class="ic chev"><use href="#i-down"/></svg></button>
    <div class="bpwrap ${prefs.bpOpen ? 'open' : ''}">
    <div class="bpnote">Denní pass pro dospělé, léto 2026. ${IC('i-check', 'font-size:11px;color:var(--moss)')} = ověřeno na oficiálním webu (červenec 2026) · bez fajfky = orientačně dle ceníků · plamínky = priorita (ťukni!)</div>
    <div class="bpcards">${bps
      .map((p) => {
        const pr = store.prio[p.id] || 0
        const web = bpWeb(p)
        const inPlan = store.plan.includes(p.id)
        return `<div class="bpc ${pr === 3 ? 'hot' : ''}" data-id="${p.id}">
        <div class="r1">
          <button class="flbtn" data-fl="${p.id}" title="priorita" style="background:none;border:none;padding:2px;cursor:pointer">${flames(pr)}</button>
          <h3>${esc(p.n)}</h3>${priceChip(p)}
        </div>
        <div class="meta">${esc(p.r || '')}${p.r && p.z ? ' · ' : ''}${esc(p.z || '')}</div>
        ${p.pn ? `<div class="note">${esc(p.pn)}</div>` : ''}
        <div class="r2">
          ${web ? `<a class="bpbtn web" href="${web}" target="_blank" rel="noopener">${IC('i-globe')}Web</a>` : ''}
          <button class="bpbtn" data-det="${p.id}">${IC('i-map')}Detail</button>
          <button class="bpbtn" data-pl="${p.id}">${inPlan ? `${IC('i-check', 'color:var(--moss)')}V plánu` : `${IC('i-plus')}Do plánu`}</button>
        </div></div>`
      })
      .join('')}</div>
    </div>
    <div style="height:26px"></div>`

  /* ---- obsluha ---- */

  // Kliknutí na pozdrav ho vymění za políčko na oslovení.
  el.querySelector('#hgreet').onclick = function () {
    const inp = document.createElement('input')
    inp.type = 'text'
    inp.maxLength = 24
    inp.value = prefs.userName || ''
    inp.placeholder = 'Jak vám máme říkat? (prázdné = bez oslovení)'
    inp.className = 'wsel'
    inp.style.cssText = 'margin:4px 0 0;max-width:260px;font-size:.86rem'
    inp.setAttribute('aria-label', 'Oslovení')
    this.replaceWith(inp)
    inp.focus()
    inp.select()

    let fin = false
    const done = (ok) => {
      if (fin) return
      fin = true
      if (ok) {
        prefs.userName = inp.value.trim().slice(0, 24)
        savePrefs()
      }
      renderHome()
    }
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') done(true)
      else if (e.key === 'Escape') done(false)
    }
    inp.onblur = () => done(true)
  }

  el.querySelector('#locBtn').onclick = zjistiPolohu
  el.querySelector('#wipPlan').onclick = () => aktivujZalozku('plan')
  el.querySelector('#wipWiz').onclick = (e) => {
    e.stopPropagation()
    openWizard()
  }
  for (const b of el.querySelectorAll('[data-go]')) b.onclick = () => goTo(S.byId[b.dataset.go])

  const tgl = el.querySelector('#bpTgl')
  tgl.onclick = () => {
    prefs.bpOpen = !prefs.bpOpen
    savePrefs()
    tgl.classList.toggle('open', prefs.bpOpen)
    el.querySelector('.bpwrap').classList.toggle('open', prefs.bpOpen)
  }
  for (const b of el.querySelectorAll('[data-fl]')) {
    b.onclick = (e) => {
      e.stopPropagation()
      const id = b.dataset.fl
      setPrio(id, ((store.prio[id] || 0) % 3) + 1)
      renderHome()
    }
  }
  for (const b of el.querySelectorAll('[data-det]')) b.onclick = () => goTo(S.byId[b.dataset.det])
  for (const b of el.querySelectorAll('[data-pl]')) {
    b.onclick = () => {
      togglePlan(b.dataset.pl)
      renderHome()
    }
  }
}
