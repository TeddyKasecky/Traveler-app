/**
 * Nálady na Domů a co dělají.
 *
 * Definice dlaždic je v data/moods.js, tady je jen chování.
 */

import { S, F, store, prefs, savePrefs } from '../../core/store.js'
import { visible } from '../../core/filters.js'
import { dkm, zjistiPolohu } from '../../core/geo.js'
import { aktivujZalozku } from '../../core/router.js'
import { HOME_MOODS } from '../../data/moods.js'
import { syncFiltersUI } from '../../components/chip.js'
import { toast } from '../../components/toast.js'
import { draw, goTo } from '../../map/map.js'

export { HOME_MOODS }

/**
 * Spustí náladu. Dvě z nich se chovají zvlášť, ostatní jen nastaví filtr
 * kategorií a přepnou na mapu.
 * @param {{id:string, l:string, kat?:string[]}} m
 */
export function applyMood(m) {
  prefs.lastMood = m.id
  // Počítadlo se zapisuje, ale zatím se nikde nečte – viz NAPADY.md N9.
  prefs.moodUse[m.id] = (prefs.moodUse[m.id] || 0) + 1
  savePrefs()

  if (m.id === 'tip') {
    surprise()
    return
  }
  if (m.id === 'near') {
    aktivujZalozku('disc')
    if (!S.userPos) zjistiPolohu()
    else toast('Koukám, co je kolem dodávky ✦')
    return
  }

  F.kat = new Set(m.kat)
  syncFiltersUI()
  draw()
  aktivujZalozku('map')
  const n = visible().length
  toast(n ? `${m.l}: ${n} míst na mapě` : `${m.l}: nic nevyhovuje – mrkni na ostatní filtry`)
}

/**
 * „Překvap mě“ – losuje místo s váhami.
 *
 * Nenavštívené má náskok, priorita a hodnocení váhu zvyšují a blízká místa
 * dostanou přilepšení. Poslední tip se vynechá, ať se dvakrát po sobě neopakuje.
 * Když posledně padla nálada s kategoriemi, losuje se přednostně z nich.
 */
export function surprise() {
  const mood = HOME_MOODS.find((x) => x.id === prefs.lastMood && x.kat)
  let pool = S.places.filter((p) => p.id !== prefs.lastTip)
  if (mood) {
    const s = new Set(mood.kat)
    const sub = pool.filter((p) => s.has(p.k))
    if (sub.length > 3) pool = sub
  }
  if (!pool.length) pool = S.places

  const sc = (p) => {
    let s = 1 + (store.stav[p.id] === 'visited' ? 0 : 3) + (store.prio[p.id] || 0) * 2 + (store.rating[p.id] || 0) * 0.5
    if (S.userPos) {
      const d = dkm(S.userPos, p)
      s += d < 60 ? 2 : d < 160 ? 1 : 0
    }
    return s
  }

  let tot = 0
  const cum = pool.map((p) => (tot += sc(p)))
  const r = Math.random() * tot
  let i = cum.findIndex((x) => x >= r)
  if (i < 0) i = 0

  const p = pool[i]
  prefs.lastTip = p.id
  savePrefs()
  goTo(p)
  toast(`Co třeba… ${p.n.split(/\s[–(]/)[0].slice(0, 32)}?`)
}
