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
import { dnyPlanu } from '../core/plan/dny.js'
import { BEZ_NAZVU } from '../core/plan/vypravy.js'
import { jedeSe, cistyCas, fmtDoba, kolikatyDenCesty } from '../core/plan/cestaData.js'
import { dkm, fmtKm } from '../core/geo.js'
import vanObr from '../assets/van.webp'

/** Název bez závorek a pomlčkových přívlastků – dlouhý se do karty nevejde. */
const kratce = (n) => n.split(/\s[–(]/)[0]

/** Silnice bývá delší než vzdušná čára – týž koeficient jako v plan.js. */
const KLIKATOST = 1.35

/**
 * Karta ROZJETÉ cesty: kde jsme, co je další cíl a kolik zbývá.
 *
 * Čísla se počítají ze `store.cesta` (`odznacene`, `zastavky`, `cistyCas`),
 * NE ze `store.stav` jako u plánu. Vypadalo by to podobně, ale je to jiná
 * otázka: `store.stav` je „byli jsme tam někdy", `cesta.odznacene` „projeli
 * jsme to na téhle cestě". Kdo jel do Dolomit podruhé, má je ve `stav`
 * odjakživa a pruh průběhu by hlásil hotovo hned po vyjetí.
 */
function cestaKarta() {
  const c = store.cesta
  const mista = c.zastavky.map((id) => S.byId[id]).filter(Boolean)
  const hotovo = mista.filter((p) => c.odznacene[p.id]).length
  const podil = mista.length ? Math.round((hotovo / mista.length) * 100) : 0
  const dalsiCil = mista.find((p) => !c.odznacene[p.id])

  // Zbývá = součet úseků, jejichž CÍLOVÁ zastávka ještě není odznačená –
  // funguje i při odznačování na přeskáčku (stejná definice jako v plan.js).
  let zbyva = 0
  for (let i = 1; i < mista.length; i++) if (!c.odznacene[mista[i].id]) zbyva += dkm(mista[i - 1], mista[i]) * KLIKATOST

  const obr = obrazekMista(dalsiCil || mista[0] || {}, PHOTOS)
  const denCesty = kolikatyDenCesty(c)

  return `<div class="vkarta jede">
    <div class="vk-hlava">
      ${obr.src ? `<img class="vk-obr" src="${obr.src}" alt="" decoding="async"
        ${obr.zaloha ? `data-zaloha="${obr.zaloha}" onerror="this.onerror=null;this.src=this.dataset.zaloha"` : ''}
        ${obr.vyrez ? `style="object-position:${obr.vyrez}"` : ''}>` : ''}
      <div class="vk-text">
        <h3>${IC('i-van')}${esc(c.nazev)}</h3>
        <div class="vk-pod">${denCesty}. den · vyjeli jsme ${new Date(c.zacatek).toLocaleDateString('cs-CZ')}</div>
      </div>
      <span class="vk-stitek">${c.pauzaOd ? 'Pauza' : 'Na cestě'}</span>
    </div>
    ${
      dalsiCil
        ? `<div class="vk-dalsi">${IC('i-nav')}<span><b>${esc(dalsiCil.n)}</b>
             <span class="meta">další cíl</span></span></div>`
        : `<div class="vk-dalsi hotovo">${IC('i-flag')}<span><b>Projeli jsme celou trasu</b>
             <span class="meta">zbývá cestu ukončit</span></span></div>`
    }
    <div class="prubeh vk-prubeh">
      <div class="prubeh-hlava"><b>${hotovo} z ${mista.length} zastávek</b><span>${
        hotovo === mista.length ? 'hotovo' : `zbývá ${fmtKm(zbyva)}`
      }</span></div>
      <div class="prubeh-lista"><i style="width:${podil}%"></i></div>
    </div>
    ${cislaRada([
      { ikona: 'i-clock', hodnota: fmtDoba(cistyCas(c)), popisek: 'na cestě' },
      { ikona: 'i-check', hodnota: String(hotovo), popisek: 'za námi' },
      { ikona: 'i-route', hodnota: Math.round(zbyva).toLocaleString('cs-CZ'), popisek: 'km zbývá' },
    ])}
  </div>`
}

/**
 * HTML karty. Prázdný plán dostane pozvánku, ne prázdné místo.
 * @param {{tlacitko?: boolean}} [o]  tlacitko:false schová „Naplánovat výlet"
 * @returns {string}
 */
export function vypravaKarta({ tlacitko = true } = {}) {
  // Když se JEDE, karta odpovídá na „jak nám to jede", ne na „co máme
  // naplánované". Do srpna 2026 Domů o rozjeté cestě nevěděla vůbec
  // (`store.cesta` se v home.js nevyskytoval ani jednou) a ukazovala plán
  // otevřený v Itineráři – tedy něco, co člověk za volantem neřeší.
  if (jedeSe()) return cestaKarta()

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
export function napojVypravu(koren, { naPlan, naPruvodce, naCestu = null }) {
  // Za jízdy vede karta na kartu Na cestě, ne do Itineráře – ukazuje „jak
  // nám to jede", takže ťuknutí má dovést tam, kde se v tom pokračuje.
  // Klikací je celá karta, ne jen hlavička: „další cíl" a pruh průběhu jsou
  // to hlavní, na co se člověk dívá, a ťuknutí do nich musí taky fungovat.
  const jede = koren.querySelector('.vkarta.jede')
  if (jede) {
    jede.onclick = naCestu || naPlan
    return
  }

  const otevri = koren.querySelector('.vk-hlava')
  if (otevri) otevri.onclick = naPlan

  const zaloz = koren.querySelector('.vk-zaloz')
  if (zaloz) zaloz.onclick = naPruvodce
}
