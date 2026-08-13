/**
 * Chipy kategorií v hlavičce.
 *
 * Na rozdíl od panelu filtrů se projeví hned – kliknutí rovnou překreslí mapu.
 * Tak to bylo v původní aplikaci a je to schválně: chip je rychlý přepínač,
 * panel filtrů se potvrzuje tlačítkem.
 */

import { F } from '../core/store.js'
import { KAT } from '../data/categories.js'
import { IC } from '../icons/sprite.js'
import { draw } from '../map/map.js'

/** Vytvoří chipy podle KAT. Volá se jednou při startu. */
export function initChipy() {
  const chipsEl = document.getElementById('chips')
  for (const [k, v] of Object.entries(KAT)) {
    const b = document.createElement('button')
    b.className = 'chip'
    b.dataset.kat = k
    b.style.setProperty('--chipc', v.c)
    b.innerHTML = IC(v.i) + k
    b.onclick = () => {
      if (F.kat.has(k)) F.kat.delete(k)
      else F.kat.add(k)
      b.classList.toggle('on')
      draw()
    }
    chipsEl.appendChild(b)
  }
}

/** Srovná vzhled chipů a přepínačů s aktuálním stavem filtrů. */
export function syncFiltersUI() {
  for (const c of document.querySelectorAll('#chips .chip')) {
    c.classList.toggle('on', F.kat.has(c.dataset.kat))
  }
  for (const t of document.querySelectorAll('.toggle[data-f]')) {
    t.classList.toggle('on', !!F[t.dataset.f])
  }
  for (const t of document.querySelectorAll('.toggle.stav')) {
    t.classList.toggle('on', t.dataset.s === F.stav)
  }
  for (const [id, k] of [
    ['fReg', 'reg'],
    ['fZeme', 'zeme'],
    ['fTyp', 'typ'],
  ]) {
    const el = document.getElementById(id)
    if (el) el.value = F[k] || ''
  }
}
