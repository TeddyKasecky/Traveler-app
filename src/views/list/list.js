/**
 * Záložka Seznam.
 */

import { S, F } from '../../core/store.js'
import { visible } from '../../core/filters.js'
import { dkm } from '../../core/geo.js'
import { COLL } from '../../data/collections.js'
import { IC } from '../../icons/sprite.js'
import { kartaSeznam } from '../../components/placeCard.js'
import { goTo } from '../../map/map.js'

/** Kolik karet se nejvýš vykreslí. Zbytek se schová za hlášku. */
const STROP = 250

export function renderList() {
  const el = document.getElementById('listInner')

  // Se známou polohou se řadí podle vzdálenosti, jinak abecedně česky.
  const vs = visible()
  const sVzdalenosti = S.userPos
    ? vs.map((p) => ({ p, d: dkm(S.userPos, p) })).sort((a, b) => a.d - b.d)
    : [...vs].sort((a, b) => a.n.localeCompare(b.n, 'cs')).map((p) => ({ p, d: null }))

  const nazevFiltru = [F.coll && COLL.find((c) => c.k === F.coll)?.n, F.reg, F.zeme, F.typ].filter(Boolean).join(' · ')
  const head = `<div class="hdr">${IC('i-book')}${nazevFiltru || 'Všechna místa'}<span class="n">${sVzdalenosti.length}</span></div>`

  if (!sVzdalenosti.length) {
    el.innerHTML = `${head}<div class="empty">${IC('i-map')}Nic neodpovídá filtrům.<br>Zkus je zrušit tlačítkem ⚙️.</div>`
    return
  }

  el.innerHTML =
    head +
    sVzdalenosti
      .slice(0, STROP)
      .map(({ p, d }) => kartaSeznam(p, d))
      .join('') +
    (sVzdalenosti.length > STROP
      ? `<div class="meta" style="text-align:center;padding:10px">Zobrazeno prvních ${STROP} – zpřesni hledání.</div>`
      : '')

  for (const c of el.querySelectorAll('.card[data-id]')) {
    c.onclick = () => goTo(S.byId[c.dataset.id])
  }
}
