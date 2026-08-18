/**
 * Stažení malované mapy Evropy do telefonu.
 *
 * Balík má skoro deset megabajtů, takže není součástí instalace – aplikace má
 * jinak 1,3 MB a nikdo nechce stahovat osminásobek jen proto, že si někdy
 * možná zapne offline mapu. Stahuje se odsud, z Profilu, a bydlí v IndexedDB
 * (`core/mapaDb.js`).
 *
 * Ovládání je staticky v `index.html` a obsluha se věší jednou při startu –
 * `renderProfil()` překresluje jen `#profilInner` nad tím, ale kdyby se to
 * někdy změnilo, obsluha by se ztratila. Stejný důvod jako u záloh a vzhledu.
 *
 * Proč se ukazuje průběh: je to skoro deset megabajtů. Bez pruhu by to na
 * pomalé síti vypadalo jako zaseknutá aplikace a člověk by odešel.
 */

import { nactiMapu, ulozMapu, smazMapu } from '../../core/mapaDb.js'
import { toast } from '../../components/toast.js'
import { mapa } from '../../map/map.js'
import { obnovVektory } from '../../map/podklad.js'

/** Kde balík leží. Vyrábí ho `scripts/make-mapa.mjs` do `public/`. */
const ADRESA = './mapa-evropa.vbm'

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`

/** Právě se stahuje? Ať se to nepustí dvakrát. */
let stahuje = false

/** Srovná popisek a tlačítka podle toho, jestli je mapa stažená. */
async function srovnej() {
  const stav = document.getElementById('mapaStav')
  const stahni = document.getElementById('mapaStahni')
  const smaz = document.getElementById('mapaSmaz')
  if (!stav || !stahni || !smaz) return

  const blob = await nactiMapu()
  if (blob) {
    stav.textContent = `Stažená, ${mb(blob.size)}. Malovaná mapa funguje bez signálu.`
    stahni.hidden = true
    smaz.hidden = false
  } else {
    stav.textContent = 'Zatím nestažená. Bez ní se offline kreslí jen zjednodušené obrysy.'
    stahni.hidden = false
    smaz.hidden = true
  }
}

/** Nastaví pruh průběhu. `null` ho schová. */
function pruh(podil) {
  const el = document.getElementById('mapaPruh')
  if (!el) return
  el.hidden = podil === null
  if (podil !== null) el.firstElementChild.style.width = `${Math.round(podil * 100)}%`
}

/**
 * Stáhne balík a uloží ho.
 *
 * Čte se po kouscích, aby šel ukázat průběh. Kdyby server nehlásil délku,
 * pruh se schová a jen se čeká – to je pořád lepší než lhát o procentech.
 */
async function stahni() {
  if (stahuje) return
  stahuje = true
  const tlacitko = document.getElementById('mapaStahni')
  if (tlacitko) tlacitko.disabled = true

  try {
    const r = await fetch(ADRESA)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)

    const celkem = Number(r.headers.get('content-length') || 0)
    const kusy = []
    let hotovo = 0
    pruh(celkem ? 0 : null)

    const ctecka = r.body.getReader()
    for (;;) {
      const { done, value } = await ctecka.read()
      if (done) break
      kusy.push(value)
      hotovo += value.length
      if (celkem) pruh(hotovo / celkem)
    }

    const blob = new Blob(kusy, { type: 'application/octet-stream' })
    const { ok, plno } = await ulozMapu(blob)
    if (!ok) {
      toast(plno ? 'V telefonu není místo na mapu' : 'Mapu se nepodařilo uložit')
      return
    }

    // Postavit mapu hned, ať se nemusí restartovat aplikace.
    await obnovVektory(mapa)
    toast(`Mapa stažená, ${mb(blob.size)}`)
  } catch (e) {
    console.warn('Stažení mapy selhalo:', e)
    toast('Mapu se nepodařilo stáhnout')
  } finally {
    pruh(null)
    stahuje = false
    if (tlacitko) tlacitko.disabled = false
    await srovnej()
  }
}

/** Naváže tlačítka. Volá se jednou při startu. */
export function initMapaKeStazeni() {
  const stahniBtn = document.getElementById('mapaStahni')
  const smazBtn = document.getElementById('mapaSmaz')
  if (!stahniBtn || !smazBtn) return

  stahniBtn.onclick = stahni
  smazBtn.onclick = async () => {
    if (!confirm('Smazat staženou mapu? Offline se pak kreslí jen zjednodušené obrysy.')) return
    await smazMapu()
    await obnovVektory(mapa)
    await srovnej()
    toast('Mapa smazána')
  }

  srovnej()
}
