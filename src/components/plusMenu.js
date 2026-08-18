/**
 * Nabídka pod okrovým „+“ na mapě.
 *
 * PROČ VŮBEC: přidat místo šlo do teď jen tlačítkem schovaným úplně dole
 * v panelu Filtry, kde ho nikdo nenašel, a průvodce plánováním byl dlaždicí
 * v posuvném pruhu na Domů. Obojí je přidávání a v předlohách je přidávání
 * jedno tlačítko. Tady se ty dvě věci potkávají.
 *
 * PROČ NENÍ V LIŠTĚ: předloha Plánu má „+“ uprostřed spodní navigace, jenže
 * ta má u nás pět záložek. Šesté místo by je zmáčklo pod čitelnou šířku, takže
 * je „+“ plovoucí kolečko nad kartou výpravy.
 *
 * „Přidat zastávku“ používá stejné vybírátko jako tlačítko „+ Přidat zastávku“
 * v itineráři na Plánu – jedno místo, kde se vybírá, ať se na něj sáhne odkud
 * chce.
 */

import { store, save } from '../core/store.js'
import { IC } from '../icons/sprite.js'
import { registrujOverlay } from '../core/router.js'
import { draw } from '../map/map.js'
import { otevriFormular } from './addForm.js'
import { openWizard } from './wizard.js'
import { zapniVyberMist } from '../map/map.js'
import { novaVyprava } from '../views/plan/vypravy.js'
import { aktivujZalozku } from '../core/router.js'
import { otevriVyber } from './vyberMista.js'
import { toast } from './toast.js'

const tlacitko = () => document.getElementById('fabPlus')
const nabidka = () => document.getElementById('plusMenu')

export const jeOtevreny = () => !nabidka().hidden

export function zavriPlus() {
  nabidka().hidden = true
  tlacitko().classList.remove('on')
}

function otevriPlus() {
  nabidka().hidden = false
  tlacitko().classList.add('on')
}

/** Naváže „+“ a jeho nabídku. Volá se jednou při startu. */
export function initPlusMenu() {
  nabidka().innerHTML = [
    { id: 'plusZastavka', ikona: 'i-route', popisek: 'Přidat zastávku' },
    { id: 'plusVybrat', ikona: 'i-pinme', popisek: 'Vybrat místa z mapy' },
    { id: 'plusMisto', ikona: 'i-plus', popisek: 'Přidat místo' },
    { id: 'plusVylet', ikona: 'i-wand', popisek: 'Naplánovat výlet' },
  ]
    .map((p) => `<button id="${p.id}">${IC(p.ikona)}${p.popisek}</button>`)
    .join('')

  tlacitko().onclick = () => (jeOtevreny() ? zavriPlus() : otevriPlus())

  document.getElementById('plusZastavka').onclick = () => {
    zavriPlus()
    otevriVyber((p) => {
      store.plan.push(p.id)
      save()
      draw()
      toast(`${p.n.split(/\s[–(]/)[0]} přidáno do plánu`)
    })
  }
  document.getElementById('plusVybrat').onclick = () => {
    zavriPlus()
    // Ťukání na špendlíky skládá košík; z něj vznikne NOVÁ výprava, aktivní
    // plán zůstane netknutý – teprve tím se výběr propíše do karty Plán.
    zapniVyberMist((ids) => {
      const nazev = prompt('Jak se bude nová výprava jmenovat?', 'Výlet z mapy')
      if (nazev === null) return
      if (!novaVyprava(nazev)) return
      store.plan = ids
      if (!save()) return
      draw()
      toast(`Výprava založená: ${ids.length} ${ids.length === 1 ? 'místo' : ids.length < 5 ? 'místa' : 'míst'}`)
      aktivujZalozku('plan')
    })
  }
  document.getElementById('plusMisto').onclick = () => {
    zavriPlus()
    otevriFormular()
  }
  document.getElementById('plusVylet').onclick = () => {
    zavriPlus()
    openWizard()
  }

  // Ťuknutí kamkoli mimo nabídku ji zavře. Bez tohohle by zůstala viset přes
  // mapu a nedalo by se pod ní klikat na špendlíky.
  document.addEventListener('pointerdown', (e) => {
    if (!jeOtevreny()) return
    if (nabidka().contains(e.target) || tlacitko().contains(e.target)) return
    zavriPlus()
  })

  registrujOverlay({ jeOtevreny, zavri: zavriPlus })
}
