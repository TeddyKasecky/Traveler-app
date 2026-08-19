/**
 * Průvodce „Naplánovat výlet“.
 *
 * Otevírá se jen z Domů, z dlaždice plánu (odkaz „vykouzlit ✨“).
 */

import { S, store, save } from '../core/store.js'
import { esc } from '../core/html.js'
import { dkm, zjistiPolohu } from '../core/geo.js'
import { registrujOverlay, aktivujZalozku } from '../core/router.js'
import { otevriItinerar } from '../views/plan/plan.js'
import { IC } from '../icons/sprite.js'
import { toast } from './toast.js'

const el = () => document.getElementById('wizard')
const backdrop = () => document.getElementById('backdrop')

export const jeOtevreny = () => el().classList.contains('show')

let wiz = { where: 'any', reg: '', col: new Set(), n: 5 }

/** Nabídka ve druhém kroku – podmnožina kolekcí, ne všechny. */
const CHUTE = [
  ['rychlovka', 'Rychlovky', 'i-bolt'],
  ['koupacka', 'Koupačka', 'i-swim'],
  ['ferrata', 'Ferraty', 'i-ferrata'],
  ['bike', 'Bike', 'i-bike'],
  ['zdarma', 'Zdarma', 'i-euro'],
  ['deti', 'S dětmi', 'i-kid'],
  ['zima', 'I v zimě', 'i-snow'],
  ['dest', 'Do deště', 'i-rain'],
]

export function openWizard() {
  wiz = { where: 'any', reg: '', col: new Set(), n: 5 }
  const regs = [...new Set(S.places.map((p) => p.r).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'))

  document.getElementById('wizBody').innerHTML = `
    <div class="wstep">1 · Kde?</div>
    <div class="wopts">
      <button class="wopt on" data-w="any">${IC('i-globe')}Kdekoli</button>
      <button class="wopt" data-w="near">${IC('i-pinme')}Kolem nás</button>
    </div>
    <select class="wsel" id="wReg"><option value="">…nebo vyber oblast</option>${regs.map((r) => `<option>${esc(r)}</option>`).join('')}</select>
    <div class="wstep">2 · Na co máme chuť? <span style="font-weight:600;text-transform:none;letter-spacing:0">(klidně nic = všechno)</span></div>
    <div class="wopts" id="wCols">
      ${CHUTE.map(([k, l, ic]) => `<button class="wopt" data-c="${k}">${IC(ic)}${l}</button>`).join('')}
    </div>
    <div class="wstep">3 · Kolik zastávek?</div>
    <div class="wopts" id="wN">
      <button class="wopt" data-n="3">3 · pohodička</button>
      <button class="wopt on" data-n="5">5 · akorát</button>
      <button class="wopt" data-n="8">8 · nálož</button>
    </div>
    <button class="wgo" id="wGo">${IC('i-wand')}Vykouzlit plán</button>`

  for (const b of el().querySelectorAll('[data-w]')) {
    b.onclick = () => {
      wiz.where = b.dataset.w
      wiz.reg = ''
      document.getElementById('wReg').value = ''
      for (const x of el().querySelectorAll('[data-w]')) x.classList.toggle('on', x === b)
      if (wiz.where === 'near' && !S.userPos) zjistiPolohu()
    }
  }
  document.getElementById('wReg').onchange = (e) => {
    if (!e.target.value) return
    wiz.where = 'reg'
    wiz.reg = e.target.value
    for (const x of el().querySelectorAll('[data-w]')) x.classList.remove('on')
  }
  for (const b of el().querySelectorAll('[data-c]')) {
    b.onclick = () => {
      const c = b.dataset.c
      if (wiz.col.has(c)) wiz.col.delete(c)
      else wiz.col.add(c)
      b.classList.toggle('on')
    }
  }
  for (const b of el().querySelectorAll('[data-n]')) {
    b.onclick = () => {
      wiz.n = +b.dataset.n
      for (const x of el().querySelectorAll('[data-n]')) x.classList.toggle('on', x === b)
    }
  }
  document.getElementById('wGo').onclick = makeTrip

  el().classList.add('show')
  backdrop().classList.add('show')
}

export function closeWizard() {
  el().classList.remove('show')
  backdrop().classList.remove('show')
}

/**
 * Sestaví plán: nejdřív vybere kandidáty podle skóre, pak je poskládá
 * hladovým průchodem, kde se váží vzdálenost proti skóre.
 */
export function makeTrip() {
  let pool = S.places.filter((p) => store.stav[p.id] !== 'visited')
  if (wiz.where === 'reg' && wiz.reg) pool = pool.filter((p) => p.r === wiz.reg)
  if (wiz.col.size) pool = pool.filter((p) => p.col && [...wiz.col].some((c) => p.col.includes(c)))

  const origin = wiz.where === 'near' && S.userPos ? S.userPos : null
  const score = (p) => {
    let s = (store.prio[p.id] || 0) * 4 + (store.rating[p.id] || 0) + (p.f ? 1 : 0) + (p.pv ? 0.5 : 0)
    if (origin) s -= dkm(origin, p) / 38
    return s
  }

  pool = pool.sort((a, b) => score(b) - score(a)).slice(0, Math.max(wiz.n * 3, 14))
  if (!pool.length) {
    toast('Nic jsem nenašla – zkus jinou kombinaci')
    return
  }

  const route = []
  let cur = origin || pool[0]
  const cand = [...pool]
  while (route.length < wiz.n && cand.length) {
    cand.sort((a, b) => dkm(cur, a) - dkm(cur, b) - (score(a) - score(b)) * 2.2)
    const nx = cand.shift()
    route.push(nx.id)
    cur = nx
  }

  store.plan = route
  save()
  closeWizard()
  otevriItinerar()
  // Schválně se tu nevolá draw(): původní aplikace taky nepřekreslovala mapu,
  // čára plánu se objeví až při dalším překreslení. Zachováno 1:1.
  toast(`Výlet naplánován – ${route.length} zastávek ✨`)
}

export function initWizard() {
  registrujOverlay({ jeOtevreny, zavri: closeWizard })
}
