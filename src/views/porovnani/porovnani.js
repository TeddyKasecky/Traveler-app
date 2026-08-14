/**
 * Porovnání dvou míst vedle sebe.
 *
 * Obrazovka z grafického manuálu, kterou aplikace neměla.
 *
 * PROČ OVERLAY A NE ZÁLOŽKA: porovnání je krátká epizoda uprostřed
 * rozhodování, ne místo, kde se bydlí. Chová se stejně jako detail –
 * vysune se zdola a tlačítko zpět ho zavře (`registrujOverlay`).
 *
 * NIC SE NEUKLÁDÁ. Košík na porovnání žije v `S` (běhový stav), ne ve
 * `store`. Do `vandrbuch:v1` nepatří: je to výběr na pár vteřin, ne
 * uživatelská data, a každý zápis navíc je další šance, jak o něco přijít.
 *
 * Všechna porovnávaná pole už v `places.json` jsou, žádné se nedoplňuje.
 */

import { S, store } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { dkm, fmtKm } from '../../core/geo.js'
import { KAT } from '../../data/categories.js'
import { IC } from '../../icons/sprite.js'
import { registrujOverlay } from '../../core/router.js'
import { fotoKategorie, vyrez } from '../../data/kategorieFoto.js'
import { toast } from '../../components/toast.js'
import { PHOTOS } from '../../core/store.js'

const el = () => document.getElementById('porovnani')

export const jeOtevreny = () => el().classList.contains('show')

export function zavriPorovnani() {
  el().classList.remove('show')
}

/**
 * Přidá místo do porovnání. Při druhém místě rovnou otevře.
 *
 * Třetí místo vytlačí to první – je to méně otravné než hláška „nejdřív
 * něco odeber“ a odpovídá to tomu, jak se lidé rozmýšlejí.
 *
 * @param {Record<string, any>} p
 */
export function pridejDoPorovnani(p) {
  const kos = S.porovnani
  if (kos.includes(p.id)) {
    toast('Tohle místo už v porovnání je')
    return
  }
  kos.push(p.id)
  if (kos.length > 2) kos.shift()

  if (kos.length < 2) {
    toast('Vyber druhé místo k porovnání')
    return
  }
  otevriPorovnani()
}

/** Jeden řádek tabulky. `hodnota` dostane místo a vrací text. */
const RADKY = [
  ['Kategorie', (p) => p.k],
  ['Typ', (p) => p.t],
  ['Kde', (p) => p.r || p.z],
  ['Země', (p) => p.z],
  ['Doba', (p) => p.d],
  ['Vstup', (p) => (p.c || '').split(' (')[0]],
  ['S dětmi', (p) => p.ch],
  ['Se psem', (p) => p.ps || '—'],
  ['Sezóna', (p) => (p.s || '').replace(' *', '')],
]

export function otevriPorovnani() {
  const mista = S.porovnani.map((id) => S.byId[id]).filter(Boolean)
  if (mista.length < 2) return

  const [a, b] = mista
  const hlavicka = (p) => {
    const k = KAT[p.k] || {}
    const foto = PHOTOS[p.id] || p.img || fotoKategorie(p)
    return `<div class="pvhead" style="--pc:${k.c}">
      ${foto ? `<img src="${foto}" alt="" loading="lazy" style="object-position:${vyrez(p)}">` : ''}
      <h3>${esc(p.n)}</h3>
      <div class="meta">${IC(k.i)}${esc(p.r || p.z)}</div>
      <div class="pvhvezdy">${store.rating[p.id] ? '★'.repeat(store.rating[p.id]) : '<span>bez hodnocení</span>'}</div>
    </div>`
  }

  // Vzdálenost mezi místy navzájem je to, co se z tabulky nedá vyčíst
  // a přitom rozhoduje: dá se stihnout obojí, nebo je to přes půl Evropy?
  const mezi = fmtKm(dkm(a, b))
  const odTebe = S.userPos
    ? `<div class="pvradek"><span>Od tebe</span><b>${fmtKm(dkm(S.userPos, a))}</b><b>${fmtKm(dkm(S.userPos, b))}</b></div>`
    : ''

  document.getElementById('porovnaniBody').innerHTML = `
    <div class="pvmrizka">${hlavicka(a)}${hlavicka(b)}</div>
    <div class="pvmezi">${IC('i-nav')}Mezi sebou ${mezi}</div>
    <div class="pvtab">
      ${RADKY.map(
        ([popis, hodnota]) =>
          `<div class="pvradek"><span>${esc(popis)}</span><b>${esc(hodnota(a) || '—')}</b><b>${esc(hodnota(b) || '—')}</b></div>`
      ).join('')}
      ${odTebe}
    </div>
    <div class="btnrow" style="margin-top:14px">
      <button class="btn" id="pvZavri">Zavřít</button>
      <button class="btn small" id="pvVycisti">${IC('i-trash')}Vyprázdnit</button>
    </div>`

  document.getElementById('pvZavri').onclick = zavriPorovnani
  document.getElementById('pvVycisti').onclick = () => {
    S.porovnani.length = 0
    zavriPorovnani()
    toast('Porovnání vyprázdněno')
  }

  el().classList.add('show')
}

/** Zaregistruje overlay, ať ho zavírá tlačítko zpět. Volá se jednou při startu. */
export function initPorovnani() {
  registrujOverlay({ jeOtevreny, zavri: zavriPorovnani })
}
