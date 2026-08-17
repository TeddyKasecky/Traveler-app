/**
 * Karta výpravy – název, začátek a konec trasy a čtyři čísla.
 *
 * Předloha ji má na Mapě (`…11_09_49 (1).png`), ale nejužitečnější je na Domů:
 * je to odpověď na otázku „co dnes" jednou kartou. Aby se nerozešly, bydlí
 * tady a obě obrazovky ji jen vloží.
 *
 * PROČ NEMÁ DATUM: předloha má „23. kvě – 18. čvc • 56 dní", jenže v datech
 * žádné datum není a odhadovat ho by znamenalo lhát. Místo něj je začátek
 * a konec trasy, což je informace, kterou plán opravdu nese.
 *
 * Čtvrté číslo předlohy („kempů") nahradily **dny**: kategorii Spaní má 11 míst
 * z 580, takže by tam skoro pořád svítila nula. Dny se počítají z `planDny`
 * a v plánu opravdu jsou.
 *
 * Nic si nepamatuje a nic neukládá – všechno počítá ze `store.plan`.
 */

import { S, store, PHOTOS } from '../core/store.js'
import { esc } from '../core/html.js'
import { IC } from '../icons/sprite.js'
import { obrazekMista } from '../data/kategorieFoto.js'
import { cislaRada } from './vzory.js'
import { planStats } from '../views/plan/plan.js'
import { dnyPlanu } from '../views/plan/dny.js'
import { BEZ_NAZVU } from '../views/plan/vypravy.js'
import vanObr from '../assets/van.webp'

/** Název bez závorek a pomlčkových přívlastků – dlouhý se do karty nevejde. */
const kratce = (n) => n.split(/\s[–(]/)[0]

/**
 * HTML karty. Prázdný plán dostane pozvánku, ne prázdné místo.
 * @param {{tlacitko?: boolean}} [o]  tlacitko:false schová „Naplánovat výlet"
 * @returns {string}
 */
export function vypravaKarta({ tlacitko = true } = {}) {
  const zastavky = store.plan.map((id) => S.byId[id]).filter(Boolean)

  if (!zastavky.length) {
    return `<div class="vkarta">
      <div class="vk-hlava">
        <img class="vk-obr" src="${vanObr}" alt="">
        <div class="vk-text">
          <h3>${IC('i-leaf')}Zatím žádná výprava</h3>
          <div class="vk-pod">Vyber místa, poskládám trasu.</div>
        </div>
      </div>
      ${tlacitko ? `<button class="btn primary vk-zaloz"  style="margin:0">${IC('i-wand')}Naplánovat výlet</button>` : ''}
    </div>`
  }

  const st = planStats(zastavky)
  const dny = dnyPlanu().length
  const zemi = new Set(zastavky.map((p) => p.z)).size
  const prvni = zastavky[0]
  const posledni = zastavky[zastavky.length - 1]
  const obr = obrazekMista(prvni, PHOTOS)
  const cesta = zastavky.length > 1 ? `${kratce(prvni.n)} → ${kratce(posledni.n)}` : `Zatím jedna zastávka · ${prvni.z}`

  return `<div class="vkarta">
    <div class="vk-hlava">
      <img class="vk-obr" src="${obr.src}" alt="" decoding="async"
        ${obr.zaloha ? `data-zaloha="${obr.zaloha}" onerror="this.onerror=null;this.src=this.dataset.zaloha"` : ''}
        ${obr.vyrez ? `style="object-position:${obr.vyrez}"` : ''}>
      <div class="vk-text">
        <h3>${IC('i-leaf')}${esc(store.vypravaNazev || BEZ_NAZVU)}</h3>
        <div class="vk-pod">${esc(cesta)}</div>
      </div>
      ${IC('i-sipka', 'font-size:19px;color:var(--text3);flex:0 0 auto')}
    </div>
    ${cislaRada([
      // Bez `fmtKm`: v kartě je jednotka zvlášť jako popisek a čtyřmístné
      // číslo potřebuje oddělovač tisíců, jinak z něj je „4437".
      { ikona: 'i-route', hodnota: Math.round(st.road).toLocaleString('cs-CZ'), popisek: 'km' },
      { ikona: 'i-pinme', hodnota: String(zastavky.length), popisek: 'míst' },
      { ikona: 'i-kalendar', hodnota: String(dny), popisek: dny === 1 ? 'den' : dny < 5 ? 'dny' : 'dní' },
      { ikona: 'i-globe', hodnota: String(zemi), popisek: zemi === 1 ? 'země' : 'zemí' },
    ])}
  </div>`
}

/**
 * Naváže kartu. Volá se po každém vložení do stránky.
 *
 * PROČ TŘÍDY A NE `id`: karta je na dvou obrazovkách naráz (Domů i Mapa)
 * a `getElementById` by našel jen tu první – druhé kartě by tlačítka nefungovala.
 * Odhalila to až kontrola, která napočítala „prázdná výprava nabízí průvodce: 2".
 *
 * @param {ParentNode} koren  prvek, ve kterém karta leží
 * @param {Object} o
 * @param {() => void} o.naPlan     ťuknutí na kartu s obsahem
 * @param {() => void} o.naPruvodce ťuknutí na „Naplánovat výlet"
 */
export function napojVypravu(koren, { naPlan, naPruvodce }) {
  const otevri = koren.querySelector('.vk-hlava')
  if (otevri) otevri.onclick = naPlan

  const zaloz = koren.querySelector('.vk-zaloz')
  if (zaloz) zaloz.onclick = naPruvodce
}
