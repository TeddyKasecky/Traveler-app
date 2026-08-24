/**
 * Spodní část obrazovky Mapa – karta výpravy a uložená místa.
 *
 * Mapa sama žádnou obrazovku neměla: byla to holá plocha se špendlíky a dvěma
 * plovoucími knoflíky. Předloha `grafika/…11_09_49 (1).png` pod ní má kartu
 * výpravy se čtyřmi čísly a karusel uložených míst, takže mapa odpovídá na
 * otázku „kde to je“ a zároveň ukazuje, kde v tom stojíme.
 *
 * PROČ TO NENÍ V `map/map.js`: to je Leaflet a nesmí znát obrazovky. Tohle je
 * obrazovka, takže bydlí ve `views/` jako každá jiná a překresluje se na
 * událost `prekresleno` z `main.js`.
 *
 * Karta výpravy je sdílený díl (`components/vypravaKarta.js`) – stejná je
 * i na Domů a nesmí se rozejít.
 */

import { S, F, store, save, prefs, savePrefs, PHOTOS } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { IC } from '../../icons/sprite.js'
import { obrazekMista } from '../../data/kategorieFoto.js'
import { radek, ikonBtn } from '../../components/vzory.js'
import { vypravaKarta, napojVypravu } from '../../components/vypravaKarta.js'
import { otevriItinerar, otevriNaCeste } from '../plan/plan.js'
import { aktivujZalozku } from '../../core/router.js'
import { resetFiltru } from '../../core/filters.js'
import { goTo, draw } from '../../map/map.js'
import { openWizard } from '../../components/wizard.js'
import { napojTah, svih } from '../../components/tah.js'

/** Kolik uložených míst se vejde do karuselu, než se odkáže na Seznam. */
const ULOZENYCH = 12

/** Název bez závorek a pomlčkových přívlastků – do karty se dlouhý nevejde. */
const kratce = (n) => n.split(/\s[–(]/)[0]

/**
 * Je karta výpravy právě vidět? Jen v paměti – při každém spuštění se začíná
 * sbalené (kromě úplně prvního otevření Mapy, viz `predstavKartu()`).
 * Vytažení je jednorázové nahlédnutí, ne nastavení.
 */
let kartaVidet = false

/** Je plát uložených míst vytažený? Taky jen v paměti. */
let ulozeneNahore = false

/**
 * Srovná spodek Mapy se stavem.
 *
 * Karta výpravy a uložená místa braly skoro třetinu obrazovky natrvalo,
 * přestože Mapa odpovídá na otázku „kde to je“ – tedy má být vidět hlavně mapa.
 * Po sbalené kartě zbude bublina nad „+“ a na ní počet zastávek, aby se nedalo
 * zapomenout, že nějaká výprava je. Po plátu zbude proužek s počtem.
 */
export function srovnejSpodek() {
  const dolu = document.getElementById('mapDolu')
  if (!dolu) return
  dolu.classList.toggle('bezKarty', !kartaVidet)
  dolu.classList.toggle('ulozeneNahore', ulozeneNahore)

  const bublina = document.getElementById('mapBublina')
  if (bublina) bublina.hidden = kartaVidet

  const n = document.getElementById('mapBublinaN')
  if (n) {
    n.hidden = !store.plan.length
    n.textContent = store.plan.length
  }

  const uchyt = document.getElementById('ulozeneUchyt')
  if (uchyt) uchyt.setAttribute('aria-expanded', String(ulozeneNahore))
}

/**
 * Při úplně prvním otevření Mapy se karta ukáže, aby se vědělo, že existuje.
 * Od té chvíle Mapa startuje sbalená.
 *
 * Zapisuje se až tady, ne při startu aplikace – startovní zápis je přesně to,
 * čemu se v tomhle projektu vyhýbáme.
 */
export function predstavKartu() {
  if (prefs.vypravaPredstavena) return
  prefs.vypravaPredstavena = true
  // Návratovou hodnotu nezahazovat: když se nepovede zapsat, `store.js`
  // z toho pošle `ulozeniSelhalo` a ukáže se varovný pruh.
  savePrefs()
  kartaVidet = true
  srovnejSpodek()
}

/** Ukáže nebo schová kartu výpravy. */
function nastavKartu(na) {
  kartaVidet = na
  srovnejSpodek()
}

/** Vytáhne nebo vrátí plát uložených míst. */
function nastavUlozene(na) {
  ulozeneNahore = na
  srovnejSpodek()
}

/**
 * Naváže spodek Mapy. Volá se jednou při startu, ne z `renderMapaDole()` –
 * bublina i proužek jsou staticky v `index.html` a překreslení by obsluhu
 * smazalo. Šipka na kartě je výjimka: karta se překresluje, takže se věší
 * pokaždé znovu, viz `renderMapaDole()`.
 */
export function initMapaDole() {
  document.getElementById('mapBublina').onclick = () => nastavKartu(true)

  const uchyt = document.getElementById('ulozeneUchyt')
  const obsah = document.querySelector('.ulozene-obsah')
  uchyt.onclick = () => nastavUlozene(!ulozeneNahore)

  // Kam až se plát vytahuje. Stejné číslo jako `max-height` v CSS —
  // počítá se tady, protože během tažení se výška řídí přímo prstem.
  const strop = () => Math.round(window.innerHeight * 0.44)

  // Tažení nahoru vytáhne, dolů vrátí; během tažení jde plát za prstem.
  // Rychlé švihnutí přehodí polohu i na kratší dráze, viz `svih()`.
  napojTah(
    uchyt,
    (dy, rychlost) => {
      obsah.classList.remove('tahne')
      obsah.style.maxHeight = ''
      if (!ulozeneNahore && svih(dy, rychlost, -1)) nastavUlozene(true)
      else if (ulozeneNahore && svih(dy, rychlost, 1)) nastavUlozene(false)
    },
    (dy) => {
      if (dy === 0) return
      const zaklad = ulozeneNahore ? strop() : 0
      obsah.classList.add('tahne')
      obsah.style.maxHeight = `${Math.max(0, Math.min(strop(), zaklad - dy))}px`
    }
  )

  srovnejSpodek()
}

export function renderMapaDole() {
  const karta = document.getElementById('vypravaKarta')
  const ulozeneEl = document.getElementById('ulozeneObsah')
  if (!karta || !ulozeneEl) return

  // Tady, ne v `main.js`: „první otevření Mapy“ je právě tenhle okamžik,
  // a zápis do předvoleb tak nepřijde při startu aplikace.
  predstavKartu()
  srovnejSpodek()
  // Šipka na sbalení se přidává až tady, ne do `vypravaKarta()` – ta samá
  // karta je i na Domů a tam se sbalit nesmí.
  karta.innerHTML =
    vypravaKarta() +
    `<button class="vk-sbal" id="vkSbal" title="Schovat výpravu" aria-label="Schovat výpravu">${IC('i-down')}</button>`
  const vkarta = karta.querySelector('.vkarta')
  if (vkarta) vkarta.appendChild(document.getElementById('vkSbal'))

  const ulozena = S.places.filter((p) => store.stav[p.id] === 'wish')
  const pocet = document.getElementById('ulozenePocet')
  if (pocet) pocet.textContent = ulozena.length

  // Popisek sekce tady není: název i počet nese proužek úchytu nad obsahem,
  // takže by to stálo dvakrát pod sebou.
  ulozeneEl.innerHTML = ulozena.length
    ? `<div class="karusel-radky">${ulozena
        .slice(0, ULOZENYCH)
        .map((p) => {
          const obr = obrazekMista(p, PHOTOS)
          return radek({
            id: p.id,
            obrazek: obr.src,
            zaloha: obr.zaloha,
            vyrez: obr.vyrez,
            nadpis: kratce(p.n),
            podnadpis: p.z,
            meta: `<span class="tag">${esc(p.t)}</span>`,
            vpravo: ikonBtn('i-zalozka', { titul: 'Odebrat z uložených', on: true }),
            tridy: 'ulozene',
          })
        })
        .join('')}</div>
      <button class="ulozene-vse" id="mapUlozVse">${IC('i-sipka', 'font-size:13px')}Zobrazit všech ${ulozena.length} v Seznamu</button>`
    : `<div class="mapdolu-prazdno">${IC('i-zalozka')}Uložená místa se sem ukládají záložkou v Seznamu.</div>`

  /* ---- obsluha ---- */
  napojVypravu(karta, {
    naPlan: () => otevriItinerar(),
    naCestu: () => otevriNaCeste(),
    naPruvodce: () => openWizard(),
  })

  // Šipka i tažení sbalují kartu. Věší se při každém překreslení, protože se
  // karta překresluje celá; `stopPropagation` je nutné, pod šipkou je obsluha
  // „otevřít plán“ z `.vk-hlava`.
  const sbal = document.getElementById('vkSbal')
  if (sbal)
    sbal.onclick = (e) => {
      e.stopPropagation()
      nastavKartu(false)
    }
  if (vkarta) {
    napojTah(
      vkarta,
      (dy, rychlost) => {
        if (svih(dy, rychlost, 1)) nastavKartu(false)
      },
      // Karta jde za prstem, ale jen dolů – nahoru není kam.
      (dy) => {
        vkarta.classList.toggle('tahne', dy > 0)
        vkarta.style.transform = dy > 0 ? `translateY(${dy}px)` : ''
      }
    )
  }

  const vse = document.getElementById('mapUlozVse')
  if (vse) {
    vse.onclick = () => {
      // `F.ulozene`, ne `F.stav = 'wish'`: „wish" ve filtru stavu znamená
      // NEnavštívená (stovky míst), kdežto tlačítko slibuje uložená.
      // Ostatní filtry se čistí, aby seznam ukázal přesně to, co je v plátu.
      resetFiltru()
      F.ulozene = true
      aktivujZalozku('list')
      draw()
    }
  }

  for (const r of ulozeneEl.querySelectorAll('.radek[data-id]')) {
    const id = r.dataset.id
    r.onclick = () => goTo(S.byId[id])
    // Záložka je zkratka „už to nechci mít uložené“ – detail se otevírat nemá.
    r.querySelector('.ikonbtn').onclick = (e) => {
      e.stopPropagation()
      delete store.stav[id]
      save()
      draw()
    }
  }
}
