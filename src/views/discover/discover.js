/**
 * Záložka Objevuj – co je kolem, kolekce podle nálady, oblasti.
 */

import { S, F } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { dkm, fmtKm, zjistiPolohu } from '../../core/geo.js'
import { visible } from '../../core/filters.js'
import { aktivujZalozku } from '../../core/router.js'
import { COLL } from '../../data/collections.js'
import { IC } from '../../icons/sprite.js'
import { kartaBlizko } from '../../components/placeCard.js'
import { toast } from '../../components/toast.js'
import { goTo, draw, priblizNaFiltr } from '../../map/map.js'

/** Kolik nejbližších míst se ukáže v „Kolem tebe“. */
const BLIZKO = 6
/** Oblast se nabídne, až když v ní jsou aspoň dvě místa. */
const MIN_V_OBLASTI = 2

export function renderDisc() {
  const el = document.getElementById('discInner')
  let html = ''

  /* ---- kolem mě ---- */
  if (S.userPos) {
    const near = S.places
      .map((p) => ({ p, d: dkm(S.userPos, p) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, BLIZKO)
    html += `<div class="hdr">${IC('i-pinme')}Kolem tebe<span class="n">do ${fmtKm(near[near.length - 1].d)}</span></div>`
    html += near.map(({ p, d }) => kartaBlizko(p, d)).join('')
  } else {
    html += `<div class="card" style="--pc:var(--lake)"><span class="spine"></span>
      <h3>${IC('i-pinme')}Kde právě jste?</h3>
      <div class="meta">Zapni polohu a ukážu, co máte na dosah.</div>
      <div class="btnrow" style="margin-bottom:0"><button class="btn small primary" id="discLoc">${IC('i-pinme')}Najít mě</button></div></div>`
  }

  /* ---- kolekce ---- */
  html += `<div class="hdr">${IC('i-sparkles')}Podle nálady</div><div class="collgrid">`
  for (const c of COLL) {
    const n = S.places.filter((p) => (p.col || []).includes(c.k)).length
    if (!n) continue
    html += `<button class="coll" data-coll="${c.k}" style="--cc:${c.c}">${IC(c.i)}<b>${c.n}</b><span>${c.d} · ${n}</span></button>`
  }
  html += '</div>'

  /* ---- oblasti ---- */
  const regs = {}
  for (const p of S.places) regs[p.r] = (regs[p.r] || 0) + 1
  const top = Object.entries(regs).sort((a, b) => b[1] - a[1])
  html += `<div class="hdr" style="margin-top:20px">${IC('i-map')}Oblasti<span class="n">${top.length}</span></div><div class="reglist">`
  for (const [r, n] of top) {
    if (n >= MIN_V_OBLASTI) html += `<button class="reg" data-reg="${esc(r)}">${esc(r)}<i>${n}</i></button>`
  }
  html += '</div><div style="height:20px"></div>'

  el.innerHTML = html

  /* ---- obsluha ---- */
  for (const c of el.querySelectorAll('.card[data-id]')) {
    c.onclick = () => goTo(S.byId[c.dataset.id])
  }
  for (const b of el.querySelectorAll('[data-coll]')) {
    b.onclick = () => {
      F.coll = F.coll === b.dataset.coll ? '' : b.dataset.coll
      const c = COLL.find((x) => x.k === b.dataset.coll)
      aktivujZalozku('map')
      draw()
      const vs = visible()
      priblizNaFiltr(vs)
      toast(F.coll ? `${c.n}: ${vs.length} míst` : 'Filtr zrušen')
    }
  }
  for (const b of el.querySelectorAll('[data-reg]')) {
    b.onclick = () => {
      F.reg = b.dataset.reg
      document.getElementById('fReg').value = F.reg
      aktivujZalozku('map')
      draw()
      const vs = visible()
      priblizNaFiltr(vs)
      toast(`${F.reg}: ${vs.length} míst`)
    }
  }
  const dl = document.getElementById('discLoc')
  if (dl) dl.onclick = zjistiPolohu
}
