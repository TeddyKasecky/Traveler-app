/**
 * Uvítací obrazovka. Ukáže se jednou, pak si to zapamatuje ve `store.seen`.
 *
 * Od redesignu má tři kroky s akvarelovými ilustracemi podle listu „Obrázky
 * na pozadí" z grafického manuálu.
 *
 * POZOR NA `#introGo`: musí být viditelné a klikatelné **hned na prvním
 * kroku**. Visí na něm `smoke.mjs`, `check-regrese.mjs` i `check-uloziste.mjs`
 * — všechny na něj klikají hned po načtení stránky. Kdyby bylo až na posledním
 * kroku, vytuhly by naráz a vypadalo by to jako zaseknutý prohlížeč. Je to
 * zároveň lepší chování: kdo aplikaci zná, nemusí proklikávat tři obrazovky.
 *
 * V single-file variantě se ilustrace nebalí. Jsou vidět jednou za život
 * a každý bajt tam stojí o třetinu víc, protože se inlinuje jako data URI.
 */

import { store, save, emit } from '../core/store.js'
import { IC } from '../icons/sprite.js'

import obrObjevuj from '../assets/onboarding/objevuj.webp'
import obrPlan from '../assets/onboarding/plan.webp'
import obrDenik from '../assets/onboarding/denik.webp'

/** Kroky uvítání. */
const KROKY = [
  {
    obr: obrObjevuj,
    ikona: 'i-compass',
    nadpis: 'Objevuj',
    text: 'Prší? Chcete se koupat? Máte dvě hodiny? Kolekce ti hned nabídnou, co má smysl.',
  },
  {
    obr: obrPlan,
    ikona: 'i-route',
    nadpis: 'Plán na cestu',
    text: 'Přidej zastávky, rozděl je na dny a pošli trasu do navigace. Kilometry spočítám.',
  },
  {
    obr: obrDenik,
    ikona: 'i-quill',
    nadpis: 'Poznámky a deník',
    text: 'U každého místa je zajímavost, co je poblíž a místo pro tvoje poznámky, fotky a hvězdičky.',
  },
]

let krok = 0

const box = () => document.getElementById('introBox')

function zavri() {
  document.getElementById('intro').classList.remove('show')
  store.seen = true
  save()
  // Teprve teď se smí appka zeptat na polohu (`prefs.polohaPriStartu`).
  // Přes událost proto, že `components/` nemá volat `core/geo.js` ani vědět
  // o startu – stejný důvod, proč se takhle oznamuje `zalozkaZmenena`.
  emit('uvodZavren')
}

function vykresli() {
  const k = KROKY[krok]
  const posledni = krok === KROKY.length - 1

  box().innerHTML = `
    ${k.obr ? `<div class="introobr"><img src="${k.obr}" alt=""></div>` : ''}
    <div class="introtelo">
      <div class="introikona">${IC(k.ikona)}</div>
      <h2>${k.nadpis}</h2>
      <p>${k.text}</p>
      <div class="introspod">
        <div class="introtecky">${KROKY.map((_, i) => `<span class="${i === krok ? 'on' : ''}"></span>`).join('')}</div>
        ${posledni ? '' : '<button class="btn small" id="introDal">Dál</button>'}
        <button class="btn primary" id="introGo">${posledni ? 'Jedeme' : 'Přeskočit'}</button>
      </div>
    </div>`

  document.getElementById('introGo').onclick = zavri
  const dal = document.getElementById('introDal')
  if (dal)
    dal.onclick = () => {
      krok++
      vykresli()
    }
}

export function initIntro() {
  if (!store.seen) document.getElementById('intro').classList.add('show')
  vykresli()
}
