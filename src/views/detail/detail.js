/**
 * Detail místa ve vysouvacím panelu.
 *
 * Vykresluje se celý znovu při každé změně (hvězdička, priorita, fotka).
 * Je to hloupé, ale je to tak od začátku a při jednom místě to nic nestojí.
 */

import { S, store, save, PHOTOS } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { dkm, fmtKm } from '../../core/geo.js'
import { KAT } from '../../data/categories.js'
import { IC } from '../../icons/sprite.js'
import { otevriSheet, teloSheetu } from '../../components/sheet.js'
import { flames, setPrio, PRIO_LBL } from '../../components/prio.js'
import { scene } from '../../components/postcard.js'
import { addPhoto, smazFotku } from '../../components/photos.js'
import { toast } from '../../components/toast.js'
import { vytvorMiniMapu, zavriMiniMapu } from '../../map/detailMap.js'
import { goTo, draw } from '../../map/map.js'
import { togglePlan } from '../plan/plan.js'
import { renderHome } from '../home/home.js'

/** Popisky stavu parkoviště pro Transit vysoký 2,6 m. */
const TRANSIT = {
  verified: 'Ověřeno pro Transit 2,6 m',
  likely: 'Pravděpodobně vhodné pro vysokou dodávku',
  unknown: 'Výška a příjezd nejsou ověřené',
  no: 'Nevhodné pro Transit 2,6 m',
}

/** Pořadové číslo mini-mapy, ať má každé otevření vlastní id prvku. */
let mmSeq = 0

/**
 * Otevře detail místa.
 * @param {Record<string, any>} p
 * @param {boolean} [focus]  false = nezvýrazňovat špendlík (překreslení na místě)
 */
export function openDetail(p, focus) {
  const k = KAT[p.k] || { c: 'var(--rust)', i: 'i-spark' }
  const r = store.rating[p.id] || 0
  const visited = store.stav[p.id] === 'visited'
  const inPlan = store.plan.includes(p.id)

  const gmView = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`
  const gmNav = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=driving`
  const pk = p.parking || null
  const pkNav = pk ? `https://www.google.com/maps/dir/?api=1&destination=${pk.lat},${pk.lon}&travelmode=driving` : ''
  const pkView = pk ? `https://www.google.com/maps/search/?api=1&query=${pk.lat},${pk.lon}` : ''
  const pkFind = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('parking near ')}${p.lat},${p.lon}`
  const imgQ = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
    [p.n.split(/\s[–(]/)[0].trim(), p.r || '', p.z || ''].filter(Boolean).join(' ')
  )}`
  const mc = `https://mapy.com/turisticka?x=${p.lon}&y=${p.lat}&z=15`
  const wx = `https://www.windy.com/?${p.lat},${p.lon},10`
  const mmid = `mm${++mmSeq}`

  // Víc adres se odděluje " | " včetně mezer – jiný oddělovač by se nerozdělil.
  const links = [
    ...(p.w
      ? p.w
          .split(' | ')
          .filter(Boolean)
          .map(
            (u) =>
              `<a href="${u}" target="_blank" rel="noopener">${IC('i-globe', 'font-size:14px')} ${esc(
                u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
              )}</a>`
          )
      : []),
    ...(p.ig
      ? p.ig
          .split(' | ')
          .filter(Boolean)
          .map((u) => `<a href="${u}" target="_blank" rel="noopener">${IC('i-cam', 'font-size:14px')} Instagram</a>`)
      : []),
  ].join('<br>')

  // Sousedi, kteří v datech opravdu jsou. Vzdálenost se bere z dat, nepočítá se.
  const nb = (p.nb || []).map((x) => ({ q: S.byId[x.id], d: x.d })).filter((x) => x.q)
  const photo = PHOTOS[p.id] || p.img || ''

  zavriMiniMapu()

  teloSheetu().innerHTML = `
    <div class="hero" style="--pc:${k.c}">
      ${photo ? `<img src="${photo}" alt="">` : scene(p)}
      <div class="herobar">
        <span class="hchip">${IC(k.i)}${esc(p.t)}</span>
        <label class="hbtn" title="Přidat fotku">${IC(photo ? 'i-cam' : 'i-plus')}${photo ? 'Změnit' : 'Fotka'}<input type="file" accept="image/*" id="photoIn" hidden></label>
        ${photo ? `<button class="hbtn" id="photoDel">${IC('i-trash')}</button>` : ''}
      </div>
      ${!photo ? '<span class="heronote">ilustrace</span>' : ''}
    </div>
    <div class="sh-head" style="--pc:${k.c}">
      <div class="sh-badge">${IC(k.i)}</div>
      <div><div class="kat">${esc(p.k)} · ${esc(p.t)}</div>
        <h2>${esc(p.n)}</h2>
        <div class="meta">${esc(p.r || p.z)}${p.r && p.r !== p.z ? ` · ${esc(p.z)}` : ''}${S.userPos ? ` · ${fmtKm(dkm(S.userPos, p))} od tebe` : ''}</div></div>
    </div>
    <div class="maincta">
      ${pk ? `<a class="gbtn park" href="${pkNav}" target="_blank" rel="noopener noreferrer">${IC('i-van')}<span><b>Navigovat na parkoviště</b><small>${esc(pk.name)}${pk.walk ? ` · ${esc(pk.walk)}` : ''}</small></span>${IC('i-nav', 'font-size:16px;opacity:.6')}</a>` : ''}
      <div class="gbtnrow">
        <a class="gbtn half" href="${gmView}" target="_blank" rel="noopener noreferrer">${IC('i-map')}Otevřít v Google Maps</a>
        <a class="gbtn half" href="${gmNav}" target="_blank" rel="noopener noreferrer">${IC('i-nav')}Navigovat k místu</a>
      </div>
      <a class="fotocard" href="${imgQ}" target="_blank" rel="noopener noreferrer">
        <span class="fico">${IC('i-cam')}</span>
        <span class="ftxt"><b>Fotky místa</b><small>Prohlédnout fotografie ve vyhledávání Google.</small></span>
        ${IC('i-nav', 'font-size:15px;opacity:.55')}</a>
    </div>
    <div class="facts">
      <div class="fact">${IC('i-euro')}<div><b>Vstup</b><span>${esc(p.c) || '—'}</span></div></div>
      <div class="fact">${IC('i-clock')}<div><b>Doba</b><span>${esc(p.d) || '—'}</span></div></div>
      <div class="fact">${IC('i-kid')}<div><b>Děti</b><span>${esc(p.ch) || '—'}</span></div></div>
      <div class="fact">${IC('i-leaf')}<div><b>Sezóna</b><span>${esc(p.s) || '—'}</span></div></div>
      ${p.ps ? `<div class="fact">${IC('i-paw')}<div><b>Psi</b><span>${esc(p.ps)}</span></div></div>` : ''}
    </div>
    ${p.p ? `<div class="desc">${esc(p.p)}</div>` : ''}
    <div class="minimap" id="${mmid}"></div>
    <div class="mmbar">${IC('i-pinme', 'font-size:14px')}<span>${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</span>
      <button class="mmcopy" id="copyGps">${IC('i-copy', 'font-size:13px')}GPS</button></div>
    ${
      pk
        ? `<div class="parkbox">
      <div class="pklab">${IC('i-van')}Doporučené parkování</div>
      <div class="pkname">${esc(pk.name)}</div>
      <div class="pkmeta">${pk.price ? `<span>${IC('i-euro', 'font-size:12px')}${esc(pk.price)}</span>` : ''}${pk.walk ? `<span>${IC('i-boot', 'font-size:12px')}${esc(pk.walk)}</span>` : ''}${pk.heightLimit ? `<span>⚠ výška ${esc(String(pk.heightLimit))} m</span>` : ''}</div>
      ${pk.note ? `<div class="pknote">${esc(pk.note)}</div>` : ''}
      <div class="pkstatus s-${pk.transitStatus}">${TRANSIT[pk.transitStatus] || TRANSIT.unknown}</div>
      <div class="gbtnrow">
        <a class="gbtn half" href="${pkNav}" target="_blank" rel="noopener noreferrer">${IC('i-nav')}Navigovat na parkoviště</a>
        <a class="gbtn half ghost" href="${pkView}" target="_blank" rel="noopener noreferrer">${IC('i-map')}Otevřít parkoviště</a>
      </div>
      <div class="pkwarn">Výšku vjezdu si před příjezdem ověřte. Transit má 2,6 m.</div>
    </div>`
        : `<div class="parkbox none">
      <div class="pklab">${IC('i-van')}Parkoviště zatím nemáme ověřené.</div>
      <a class="gbtn half ghost" href="${pkFind}" target="_blank" rel="noopener noreferrer">${IC('i-map')}Vyhledat parkoviště poblíž</a>
      <div class="pkwarn">Výšku vjezdu si před příjezdem ověřte. Transit má 2,6 m.</div>
    </div>`
    }
    ${p.f ? `<div class="lore"><div class="lab">${IC('i-quill')}Z deníku</div><p>${esc(p.f)}</p></div>` : ''}
    <div class="btnrow" style="margin-top:0">
      <button class="btn ${inPlan ? 'sun' : ''}" id="dPlan">${IC(inPlan ? 'i-check' : 'i-plus')}${inPlan ? 'V plánu' : 'Do plánu'}</button>
      <button class="btn ${visited ? 'moss' : ''}" id="dVisit">${IC('i-check')}${visited ? 'Navštíveno' : 'Byli jsme tu'}</button>
      <a class="btn small" href="${wx}" target="_blank" rel="noopener noreferrer">${IC('i-rain')}Počasí</a>
      <a class="btn small" href="${mc}" target="_blank" rel="noopener noreferrer">${IC('i-boot')}Mapy.com</a>
    </div>
    ${
      p.av || p.bs
        ? `<div class="sec">${IC('i-ferrata', 'font-size:16px')}Topo a podrobnosti</div><div class="ferbtns">
      ${
        p.bs
          ? `<a class="fbtn bs" href="${p.bs}" target="_blank" rel="noopener">
        <span class="fico">${IC('i-mount')}</span>
        <span class="ftxt"><b>Topo a popis trasy</b><small>${p.pdf ? 'bergsteigen.com · obtížnosti úseků, fotky, GPX' : 'bergsteigen.com · vyhledat ferratu'}</small></span>
        ${IC('i-nav', 'font-size:16px;opacity:.6')}</a>`
          : ''
      }
      ${
        p.pdf
          ? `<a class="fbtn pdf" href="${p.pdf}" target="_blank" rel="noopener">
        <span class="fico">${IC('i-save')}</span>
        <span class="ftxt"><b>Topo ke stažení (PDF)</b><small>vytiskni nebo ulož do mobilu na offline</small></span>
        ${IC('i-nav', 'font-size:16px;opacity:.6')}</a>`
          : ''
      }
      ${
        p.av
          ? `<a class="fbtn av small" href="${p.av}" target="_blank" rel="noopener">
        <span class="fico">${IC('i-book')}</span>
        <span class="ftxt"><b>České info a hodnocení</b><small>Alpský vůdce · web občas nedostupný</small></span>
        ${IC('i-nav', 'font-size:16px;opacity:.6')}</a>`
          : ''
      }
    </div>`
        : ''
    }
    ${
      p.g && p.g.length
        ? `<div class="sec">${IC('i-flag', 'font-size:16px')}Co vzít s sebou</div>
      <div class="gearrow">${p.g.map((g) => `<span class="gear">${IC('i-check')}${esc(g)}</span>`).join('')}</div>`
        : ''
    }
    ${
      nb.length
        ? `<div class="sec">${IC('i-route', 'font-size:16px')}Poblíž</div>
      <div class="nbrow">${nb
        .map((x) => {
          const kk = KAT[x.q.k] || {}
          return `<button class="nbcard" data-nb="${x.q.id}" style="--pc:${kk.c}">${IC(kk.i)}<b>${esc(x.q.n)}</b><span>${fmtKm(x.d)} · ${esc(x.q.t)}</span></button>`
        })
        .join('')}</div>`
        : ''
    }
    <div class="sec">${IC('i-fire', 'font-size:16px')}Jak moc tam chceme?</div>
    <div class="priorow" id="dPrio">${[1, 2, 3]
      .map(
        (v) =>
          `<button data-v="${v}" class="priobtn ${(store.prio[p.id] || 0) === v ? 'on' : ''}">${flames(v, v, 14)}<span>${PRIO_LBL[v]}</span></button>`
      )
      .join('')}</div>
    <div class="sec">${IC('i-star', 'font-size:16px')}Naše hodnocení</div>
    <div class="stars" id="dStars">${[1, 2, 3, 4, 5]
      .map((i) => `<button data-i="${i}" class="${i <= r ? '' : 'off'}" aria-label="${i}">${IC('i-star')}</button>`)
      .join('')}</div>
    <div class="sec">${IC('i-quill', 'font-size:16px')}Poznámka</div>
    <textarea id="noteBox" placeholder="parkál za kostelem · brát hotovost · jet brzy ráno…">${esc(store.notes[p.id] || '')}</textarea>
    ${links ? `<div class="sec">${IC('i-globe', 'font-size:16px')}Odkazy</div><div class="links">${links}</div>` : ''}
    <div style="height:10px"></div>`

  otevriSheet()

  /* ---- obsluha ---- */

  const telo = teloSheetu()

  document.getElementById('dPlan').onclick = () => {
    togglePlan(p.id)
    openDetail(p)
  }
  document.getElementById('dVisit').onclick = () => {
    store.stav[p.id] = visited ? '' : 'visited'
    save()
    draw()
    if (!visited) toast('Zapsáno do deníku ✓')
    openDetail(p)
  }
  document.getElementById('dStars').onclick = (e) => {
    const b = e.target.closest('button')
    if (!b) return
    const i = +b.dataset.i
    store.rating[p.id] = store.rating[p.id] === i ? 0 : i
    save()
    openDetail(p)
  }
  document.getElementById('dPrio').onclick = (e) => {
    const b = e.target.closest('button')
    if (!b) return
    setPrio(p.id, +b.dataset.v)
    openDetail(p, false)
    if (S.activeTab === 'home') renderHome()
  }
  document.getElementById('noteBox').oninput = (e) => {
    store.notes[p.id] = e.target.value
    save()
  }
  for (const b of telo.querySelectorAll('[data-nb]')) {
    b.onclick = () => {
      const q = S.byId[b.dataset.nb]
      if (q) goTo(q)
    }
  }

  const pin = document.getElementById('photoIn')
  if (pin)
    pin.onchange = (e) => {
      const f = e.target.files[0]
      if (f) addPhoto(p.id, f, () => openDetail(p, false))
    }
  const pdel = document.getElementById('photoDel')
  if (pdel)
    pdel.onclick = () => {
      smazFotku(p.id)
      openDetail(p, false)
    }

  document.getElementById('copyGps').onclick = async () => {
    const t = `${p.lat}, ${p.lon}`
    try {
      await navigator.clipboard.writeText(t)
      toast('Souřadnice zkopírovány')
    } catch {
      prompt('Souřadnice:', t)
    }
  }

  // Mini-mapa až po vykreslení: dřív má prvek nulovou velikost.
  requestAnimationFrame(() => setTimeout(() => vytvorMiniMapu({ elId: mmid, p, pk, gmView, pkNav }), 180))

  if (focus !== false) S.hiId = p.id
  telo.parentElement.scrollTop = 0
}
