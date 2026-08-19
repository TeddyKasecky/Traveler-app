/**
 * Stažení malované mapy Evropy a volba, čím se offline mapa kreslí.
 *
 * Balík má několik megabajtů, takže není součástí instalace – aplikace má
 * jinak kolem dvou megabajtů a nikdo nechce stahovat dvojnásobek jen proto,
 * že si někdy možná zapne malovanou mapu. Stahuje se odsud, z Nastavení,
 * a bydlí v IndexedDB (`core/mapaDb.js`).
 *
 * Ovládání je staticky v `index.html` a obsluha se věší jednou při startu –
 * `renderNastaveni()` překresluje jen `#nastaveniInner` pod tím, ale kdyby se
 * to někdy změnilo, obsluha by se ztratila. Stejný důvod jako u záloh a vzhledu.
 *
 * TŘI STAVY, KTERÉ SE MUSÍ ROZLIŠIT:
 *   1. nestažená        → „Stáhnout mapu"
 *   2. stažená a platná → „Aktualizovat mapu" a vedle ní „Smazat"
 *   3. stažená a stará  → totéž, ale stav říká, že je zastaralá
 *
 * Třetí stav je tam proto, že se formát balíku v srpnu 2026 změnil (`VBM2`).
 * Bez něj by lidem se starým balíkem malovaná mapa tiše spadla na obrysy
 * a nikdo by neměl šanci přijít na to proč.
 *
 * Proč se ukazuje průběh: je to několik megabajtů. Bez pruhu by to na pomalé
 * síti vypadalo jako zaseknutá aplikace a člověk by odešel.
 */

import { nactiMapu, ulozMapu, smazMapu } from '../../core/mapaDb.js'
import { prefs, savePrefs } from '../../core/store.js'
import { toast } from '../../components/toast.js'
import { potvrd } from '../../components/dialog.js'
import { mapa } from '../../map/map.js'
import { obnovVektory } from '../../map/podklad.js'

/** Kde balík leží. Vyrábí ho `scripts/make-mapa.mjs` do `public/`. */
const ADRESA = './mapa-evropa.vbm'

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`

/** Právě se stahuje? Ať se to nepustí dvakrát. */
let stahuje = false

/** Je stažený balík ten, kterému rozumíme? Zjišťuje se jen při srovnání stavu. */
async function stavBaliku() {
  const blob = await nactiMapu()
  if (!blob) return { je: false }
  const { jeAktualni } = await import('../../map/vbm.js')
  return { je: true, velikost: blob.size, aktualni: await jeAktualni(blob) }
}

/**
 * Srovná popisek, tlačítka a přepínač podle toho, jak na tom mapa je.
 * Volá se při startu a při každém otevření Nastavení.
 */
export async function srovnejStavMapy() {
  const stav = document.getElementById('mapaStav')
  const stahni = document.getElementById('mapaStahni')
  const smaz = document.getElementById('mapaSmaz')
  if (!stav || !stahni || !smaz) return

  const s = await stavBaliku()

  if (!s.je) {
    stav.textContent = 'Malovaná mapa zatím stažená není.'
    stav.classList.remove('varovani')
    // Poslední potomek tlačítka je textový uzel za ikonou; přepisuje se jen on,
    // aby ikona zůstala. `textContent` na celém tlačítku by ji smazal.
    stahni.lastChild.textContent = 'Stáhnout mapu'
    smaz.hidden = true
  } else if (!s.aktualni) {
    stav.textContent = `Stažená mapa je zastaralá (${mb(s.velikost)}) a nekreslí se. Stáhni ji prosím znovu – nová je menší.`
    stav.classList.add('varovani')
    stahni.lastChild.textContent = 'Aktualizovat mapu'
    smaz.hidden = false
  } else {
    stav.textContent = `Stažená, ${mb(s.velikost)}. Funguje bez signálu.`
    stav.classList.remove('varovani')
    // Tlačítko zůstává vidět i po stažení: jinak by se novější verze balíku
    // nedala vzít vůbec a jediná cesta by byla smazat a stáhnout znovu.
    stahni.lastChild.textContent = 'Aktualizovat mapu'
    smaz.hidden = false
  }

  srovnejVolbu(s.je && s.aktualni)
}

/**
 * Srovná přepínač „čím se kreslí offline mapa".
 *
 * Malovaná volba je zašedlá, dokud balík není stažený – slibovat něco, co
 * se nemá odkud vzít, je horší než ji nenabídnout.
 *
 * @param {boolean} maBalik
 */
function srovnejVolbu(maBalik) {
  const rada = document.getElementById('offlineVolba')
  if (!rada) return
  const zvolena = prefs.offlineMapa === 'zjednodusena' ? 'zjednodusena' : 'stazena'
  for (const b of rada.querySelectorAll('.volba')) {
    const jeStazena = b.dataset.offline === 'stazena'
    b.classList.toggle('on', b.dataset.offline === zvolena)
    b.disabled = jeStazena && !maBalik
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

    // Stažení mapy je zároveň volba, že ji chce používat – jinak by si ji
    // stáhl a nic by se nestalo.
    prefs.offlineMapa = 'stazena'
    savePrefs()

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
    await srovnejStavMapy()
  }
}

/** Naváže tlačítka. Volá se jednou při startu. */
export function initMapaKeStazeni() {
  const stahniBtn = document.getElementById('mapaStahni')
  const smazBtn = document.getElementById('mapaSmaz')
  const volba = document.getElementById('offlineVolba')
  if (!stahniBtn || !smazBtn || !volba) return

  stahniBtn.onclick = stahni
  smazBtn.onclick = async () => {
    const dal = await potvrd({
      nadpis: 'Smazat staženou mapu?',
      text: 'Offline se pak kreslí jen zjednodušená mapa.',
      ano: 'Smazat',
      nebezpecne: true,
    })
    if (!dal) return
    await smazMapu()
    prefs.offlineMapa = 'zjednodusena'
    savePrefs()
    await obnovVektory(mapa)
    await srovnejStavMapy()
    toast('Mapa smazána')
  }

  for (const b of volba.querySelectorAll('.volba')) {
    b.onclick = async () => {
      if (b.disabled) return
      prefs.offlineMapa = b.dataset.offline
      if (!savePrefs()) return
      srovnejVolbu(true)
      // Přestavět hned, ať je změna vidět bez restartu.
      await obnovVektory(mapa)
      toast(b.dataset.offline === 'stazena' ? 'Kreslí se malovaná mapa' : 'Kreslí se zjednodušená mapa')
    }
  }

  srovnejStavMapy()
}
