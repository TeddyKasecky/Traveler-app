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
 * „Přidat zastávku“ tu zatím není: přidávat zastávky se dnes dá jen z detailu
 * místa a vybírátko na to přijde s přestavbou Plánu, kde bude potřeba i pro
 * tlačítko „+ Přidat zastávku“ v itineráři. Až bude, patří sem jako třetí řádek.
 */

import { IC } from '../icons/sprite.js'
import { registrujOverlay } from '../core/router.js'
import { otevriFormular } from './addForm.js'
import { openWizard } from './wizard.js'

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
    { id: 'plusMisto', ikona: 'i-plus', popisek: 'Přidat místo' },
    { id: 'plusVylet', ikona: 'i-wand', popisek: 'Naplánovat výlet' },
  ]
    .map((p) => `<button id="${p.id}">${IC(p.ikona)}${p.popisek}</button>`)
    .join('')

  tlacitko().onclick = () => (jeOtevreny() ? zavriPlus() : otevriPlus())

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
