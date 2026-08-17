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
import { radek, sekce, ikonBtn } from '../../components/vzory.js'
import { vypravaKarta, napojVypravu } from '../../components/vypravaKarta.js'
import { aktivujZalozku } from '../../core/router.js'
import { goTo, draw } from '../../map/map.js'
import { openWizard } from '../../components/wizard.js'

/** Kolik uložených míst se vejde do karuselu, než se odkáže na Seznam. */
const ULOZENYCH = 12

/** Název bez závorek a pomlčkových přívlastků – do karty se dlouhý nevejde. */
const kratce = (n) => n.split(/\s[–(]/)[0]

/**
 * Srovná sbalení spodku se stavem v předvolbách.
 *
 * Karta výpravy a uložená místa braly skoro polovinu obrazovky natrvalo,
 * přestože Mapa odpovídá na otázku „kde to je“ – tedy má být vidět hlavně mapa.
 * Sbalené zbude bublina nad „+“ a na ní počet zastávek, aby se nedalo
 * zapomenout, že tam nějaká výprava je.
 */
export function srovnejSbaleni() {
  const dolu = document.getElementById('mapDolu')
  if (!dolu) return
  const sbaleno = !!prefs.mapaSbaleno
  dolu.classList.toggle('sbaleno', sbaleno)

  const bublina = document.getElementById('mapBublina')
  if (bublina) bublina.hidden = !sbaleno

  const n = document.getElementById('mapBublinaN')
  if (n) {
    n.hidden = !store.plan.length
    n.textContent = store.plan.length
  }
}

/**
 * Naváže sbalování. Volá se jednou při startu, ne z `renderMapaDole()` –
 * úchyt i bublina jsou staticky v `index.html` a překreslení by obsluhu smazalo.
 */
export function initMapaDole() {
  const prepni = (na) => {
    prefs.mapaSbaleno = na
    // Návratovou hodnotu nezahazovat: když se nepovede zapsat, `store.js`
    // z toho pošle `ulozeniSelhalo` a ukáže se varovný pruh.
    savePrefs()
    srovnejSbaleni()
  }
  document.getElementById('mapGrip').onclick = () => prepni(true)
  document.getElementById('mapBublina').onclick = () => prepni(false)
  srovnejSbaleni()
}

export function renderMapaDole() {
  const karta = document.getElementById('vypravaKarta')
  const ulozeneEl = document.getElementById('mapUlozene')
  if (!karta || !ulozeneEl) return

  srovnejSbaleni()
  karta.innerHTML = vypravaKarta()

  const ulozena = S.places.filter((p) => store.stav[p.id] === 'wish')
  ulozeneEl.innerHTML =
    sekce('Uložená místa', ulozena.length ? { akce: 'Zobrazit vše', akceId: 'mapUlozVse' } : {}) +
    (ulozena.length
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
          .join('')}</div>`
      : `<div class="mapdolu-prazdno">${IC('i-zalozka')}Uložená místa se sem ukládají srdcem v Seznamu.</div>`)

  /* ---- obsluha ---- */
  napojVypravu(karta, { naPlan: () => aktivujZalozku('plan'), naPruvodce: () => openWizard() })

  const vse = document.getElementById('mapUlozVse')
  if (vse) {
    vse.onclick = () => {
      F.stav = 'wish'
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
