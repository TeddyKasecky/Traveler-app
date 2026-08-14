/**
 * Záložka Plán – pořadí zastávek, kilometry, export do navigace.
 */

import { S, store, save } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { dkm, fmtKm } from '../../core/geo.js'
import { KAT } from '../../data/categories.js'
import { IC } from '../../icons/sprite.js'
import { toast } from '../../components/toast.js'
import { goTo, draw } from '../../map/map.js'
import { dnyPlanu, pridejDen, presunDoDne, zrusDny } from './dny.js'

/** Kolik zastávek unese odkaz do Google Maps. */
const MAX_DO_NAVIGACE = 10
/** Silnice bývá delší než vzdušná čára. Hrubý, ale osvědčený koeficient. */
const KLIKATOST = 1.35
/** Průměrná rychlost pro odhad času za volantem. */
const KMH = 62

/** Přidá nebo odebere místo z plánu. */
export function togglePlan(id) {
  const i = store.plan.indexOf(id)
  if (i >= 0) {
    store.plan.splice(i, 1)
    toast('Odebráno z plánu')
  } else {
    store.plan.push(id)
    toast('Přidáno do plánu')
  }
  save()
  draw()
}

/** Vzdušné kilometry, odhad po silnici a čas za volantem. */
export function planStats(items) {
  let d = 0
  for (let i = 1; i < items.length; i++) d += dkm(items[i - 1], items[i])
  const road = d * KLIKATOST
  return { air: d, road, hrs: road / KMH }
}

export function renderPlan() {
  const wrap = document.getElementById('planWrap')
  const items = store.plan.map((id) => S.byId[id]).filter(Boolean)

  const pc = document.getElementById('planCount')
  pc.hidden = !items.length
  pc.textContent = items.length

  const st = planStats(items)
  const cas = st.hrs < 1 ? `${Math.round(st.hrs * 60)} min` : `${st.hrs.toFixed(1).replace('.', ',')} h`
  const head = `<div class="card" style="--pc:var(--sun)"><span class="spine"></span>
      <h3>${IC('i-route')}Plán výletu</h3>
      ${
        items.length > 1
          ? `<div class="meta">${items.length} zastávek · ${fmtKm(st.road)} po silnici (odhad) · ${cas} za volantem</div>`
          : '<div class="meta">Poskládej zastávky, spočítám kilometry a pošlu trasu do navigace.</div>'
      }
      <div class="btnrow" style="margin-bottom:0">
        <button class="btn small" id="planNav">${IC('i-nav')}Google Maps</button>
        <button class="btn small" id="planNavApple" title="Apple Maps – jen další zastávka">${IC('i-nav')}Apple</button>
        <button class="btn small" id="planNavWaze" title="Waze – jen další zastávka">${IC('i-nav')}Waze</button>
        ${items.length > 2 ? `<button class="btn small" id="planOpt">${IC('i-sparkles')}Seřadit podle trasy</button>` : ''}
        <button class="btn small" id="planShare">${IC('i-copy')}Kopírovat</button>
        <button class="btn small" id="planClear">${IC('i-trash')}</button>
      </div></div>`

  if (!items.length) {
    wrap.innerHTML = `${head}<div class="empty">${IC('i-van')}Plán je zatím prázdný.<br>V detailu místa ťukni na <b>Do plánu</b>.</div>`
    bindPlanBtns()
    return
  }

  const dny = dnyPlanu()
  const vicDnu = dny.length > 1

  // Průběžné číslování napříč dny. parity.mjs hlídá, že „Kopírovat“ vyrobí
  // text s „1. “, „2. “ – kdyby se čísla resetovala v každém dni, přestalo by
  // to sedět, a hlavně by uživatel nevěděl, kolikátá zastávka to celkem je.
  let poradi = 0

  wrap.innerHTML =
    head +
    dny
      .map((den, di) => {
        const mista = den.map((id) => S.byId[id]).filter(Boolean)
        const sd = planStats(mista)
        const hlavicka = vicDnu
          ? `<div class="denhd">${IC('i-kalendar')}<b>Den ${di + 1}</b>
              <span>${mista.length} ${mista.length === 1 ? 'zastávka' : mista.length < 5 ? 'zastávky' : 'zastávek'}${
                mista.length > 1 ? ` · ${fmtKm(sd.road)}` : ''
              }</span></div>`
          : ''
        return (
          hlavicka +
          mista
            .map((p, i) => {
              const k = KAT[p.k] || {}
              poradi++
              const predchozi = i > 0 ? mista[i - 1] : null
              const leg = predchozi ? dkm(predchozi, p) * KLIKATOST : 0
              return `${
                predchozi
                  ? `<div class="meta" style="margin:-6px 0 8px 22px;display:flex;align-items:center;gap:7px">${IC('i-nav', 'font-size:13px;color:var(--akcent)')}${fmtKm(leg)}</div>`
                  : ''
              }
            <div class="card" data-id="${p.id}" style="--pc:${k.c}"><span class="spine"></span>
            <span class="dist">${poradi}.</span>
            <h3>${IC(k.i)}${esc(p.n)}</h3>
            ${p.sh ? `<div class="short">${esc(p.sh)}</div>` : ''}
            <div class="meta">${esc(p.r || p.z)} · ${esc(p.d)}${store.notes[p.id] ? ' · ✎ poznámka' : ''}</div>
            <div class="btnrow" style="margin:9px 0 0">
              <button class="btn small" data-act="open">Detail</button>
              <button class="btn small" data-act="up">${IC('i-up')}</button>
              <button class="btn small" data-act="down">${IC('i-down')}</button>
              ${vicDnu ? `<button class="btn small" data-act="denzpet" title="O den zpět">${IC('i-kalendar')}${IC('i-up', 'font-size:11px')}</button>` : ''}
              ${vicDnu ? `<button class="btn small" data-act="dendal" title="O den dál">${IC('i-kalendar')}${IC('i-down', 'font-size:11px')}</button>` : ''}
              <button class="btn small" data-act="rm">${IC('i-x')}</button>
            </div></div>`
            })
            .join('')
        )
      })
      .join('') +
    (items.length > 1
      ? `<div class="btnrow" style="margin-top:4px">
          <button class="btn small" id="planDen">${IC('i-plus')}Přidat den</button>
          ${vicDnu ? `<button class="btn small" id="planBezDnu">Zrušit dny</button>` : ''}
        </div>`
      : '')

  for (const c of wrap.querySelectorAll('.card[data-id]')) {
    const id = c.dataset.id
    c.querySelector('[data-act=open]').onclick = () => goTo(S.byId[id])
    c.querySelector('[data-act=rm]').onclick = () => togglePlan(id)
    c.querySelector('[data-act=up]').onclick = () => posun(id, -1)
    c.querySelector('[data-act=down]').onclick = () => posun(id, 1)
    // Tlačítka dnů jsou v kartě jen když se plán na dny dělí.
    const zpet = c.querySelector('[data-act=denzpet]')
    if (zpet)
      zpet.onclick = () => {
        presunDoDne(id, -1)
        draw()
      }
    const dal = c.querySelector('[data-act=dendal]')
    if (dal)
      dal.onclick = () => {
        presunDoDne(id, 1)
        draw()
      }
  }

  const den = document.getElementById('planDen')
  if (den)
    den.onclick = () => {
      pridejDen()
      draw()
    }
  const bezDnu = document.getElementById('planBezDnu')
  if (bezDnu)
    bezDnu.onclick = () => {
      zrusDny()
      draw()
      toast('Dny zrušeny, zastávky zůstaly')
    }
  bindPlanBtns()
}

/** Posune zastávku o jedno místo nahoru (−1) nebo dolů (+1). */
function posun(id, smer) {
  const i = store.plan.indexOf(id)
  const j = i + smer
  if (i < 0 || j < 0 || j > store.plan.length - 1) return
  ;[store.plan[j], store.plan[i]] = [store.plan[i], store.plan[j]]
  save()
  draw()
}

function bindPlanBtns() {
  const nav = document.getElementById('planNav')
  if (!nav) return

  /** Zastávky plánu jako místa, ořezané na to, co unese odkaz. */
  const zastavky = () => store.plan.map((id) => S.byId[id]).filter(Boolean).slice(0, MAX_DO_NAVIGACE)

  // Google Maps unese celou trasu. Zůstává pod #planNav a otevírá okno rovnou
  // v obsluze kliknutí – parity.mjs na to spoléhá a prohlížeče blokují
  // window.open, které nepřijde přímo z gesta uživatele.
  nav.onclick = () => {
    const items = zastavky()
    if (!items.length) {
      toast('Plán je prázdný')
      return
    }
    const dest = items[items.length - 1]
    const wp = items.slice(0, -1).map((p) => `${p.lat},${p.lon}`).join('|')
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lon}${wp ? `&waypoints=${encodeURIComponent(wp)}` : ''}`,
      '_blank'
    )
  }

  // Apple Maps ani Waze neumějí spolehlivě předat víc zastávek najednou.
  // Posílá se proto první zastávka a řekne se to nahlas – jinak by si člověk
  // na cestě myslel, že má v navigaci celou trasu, a měl by tam jeden bod.
  const jedenCil = (adresa, jmeno) => () => {
    const items = zastavky()
    if (!items.length) {
      toast('Plán je prázdný')
      return
    }
    window.open(adresa(items[0]), '_blank')
    if (items.length > 1) toast(`${jmeno}: poslala jsem první zastávku`)
  }

  document.getElementById('planNavApple').onclick = jedenCil(
    (p) => `https://maps.apple.com/?daddr=${p.lat},${p.lon}&dirflg=d`,
    'Apple Maps'
  )
  document.getElementById('planNavWaze').onclick = jedenCil(
    (p) => `https://waze.com/ul?ll=${p.lat},${p.lon}&navigate=yes`,
    'Waze'
  )

  // Hladové řazení: začni u nejbližšího místa a pak vždy skoč na nejbližší další.
  const opt = document.getElementById('planOpt')
  if (opt)
    opt.onclick = () => {
      let rest = store.plan.map((id) => S.byId[id]).filter(Boolean)
      if (rest.length < 3) return
      const start = S.userPos ? rest.reduce((a, b) => (dkm(S.userPos, a) < dkm(S.userPos, b) ? a : b)) : rest[0]
      const out = [start]
      rest = rest.filter((p) => p !== start)
      while (rest.length) {
        const last = out[out.length - 1]
        let best = rest[0]
        let bd = dkm(last, best)
        for (const p of rest) {
          const d = dkm(last, p)
          if (d < bd) {
            bd = d
            best = p
          }
        }
        out.push(best)
        rest = rest.filter((p) => p !== best)
      }
      store.plan = out.map((p) => p.id)
      save()
      draw()
      toast('Seřazeno podle nejkratší trasy')
    }

  document.getElementById('planShare').onclick = async () => {
    const items = store.plan.map((id) => S.byId[id]).filter(Boolean)
    const st = planStats(items)
    const t =
      `🚐 Plán Vandrbuch (${fmtKm(st.road)})\n` +
      items
        .map((p, i) => `${i + 1}. ${p.n} — ${p.lat},${p.lon}${store.notes[p.id] ? `\n   ✎ ${store.notes[p.id]}` : ''}`)
        .join('\n')
    try {
      await navigator.clipboard.writeText(t)
      toast('Plán zkopírován')
    } catch {
      prompt('Zkopíruj:', t)
    }
  }

  document.getElementById('planClear').onclick = () => {
    if (confirm('Vyprázdnit plán?')) {
      store.plan = []
      save()
      draw()
    }
  }
}
