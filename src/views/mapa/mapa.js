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
 * ŽÁDNÁ DATA NAVÍC: karta počítá všechno z `store.plan` a `store.planDny`,
 * uložená místa ze `store.stav`. Nic se tu neukládá.
 */

import { S, F, store, save, PHOTOS } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { IC } from '../../icons/sprite.js'
import { obrazekMista } from '../../data/kategorieFoto.js'
import { radek, sekce, cislaRada, ikonBtn } from '../../components/vzory.js'
import { planStats } from '../plan/plan.js'
import { dnyPlanu } from '../plan/dny.js'
import { aktivujZalozku } from '../../core/router.js'
import { goTo, draw } from '../../map/map.js'
import { openWizard } from '../../components/wizard.js'
import vanObr from '../../assets/van.webp'

/** Kolik uložených míst se vejde do karuselu, než se odkáže na Seznam. */
const ULOZENYCH = 12

/** Název bez závorek a pomlčkových přívlastků – do karty se dlouhý nevejde. */
const kratce = (n) => n.split(/\s[–(]/)[0]

/**
 * Karta výpravy.
 *
 * PROČ NEMÁ DATUM: předloha má „23. kvě – 18. čvc • 56 dní“, jenže v datech
 * žádné datum není a odhadovat ho by znamenalo lhát. Místo něj je začátek
 * a konec trasy, což je informace, kterou plán opravdu nese.
 *
 * Čtvrté číslo je v předloze „kempů“. U nás má kategorii Spaní jen 11 míst
 * z 580, takže by tam skoro pořád svítila nula. Nahradily ho **dny**, které
 * se počítají z `planDny` a v plánu opravdu jsou.
 */
function kartaVypravy(zastavky) {
  const st = planStats(zastavky)
  const dny = dnyPlanu().length
  const zemi = new Set(zastavky.map((p) => p.z)).size
  const prvni = zastavky[0]
  const posledni = zastavky[zastavky.length - 1]
  const obr = obrazekMista(prvni, PHOTOS)

  const cesta =
    zastavky.length > 1 ? `${kratce(prvni.n)} → ${kratce(posledni.n)}` : `Zatím jedna zastávka · ${prvni.z}`

  return `<div class="vkarta">
    <div class="vk-hlava" id="vkOtevri">
      <img class="vk-obr" src="${obr.src}" alt="" decoding="async"
        ${obr.zaloha ? `data-zaloha="${obr.zaloha}" onerror="this.onerror=null;this.src=this.dataset.zaloha"` : ''}
        ${obr.vyrez ? `style="object-position:${obr.vyrez}"` : ''}>
      <div class="vk-text">
        <h3>${IC('i-leaf')}${esc(store.vypravaNazev || 'Náš plán')}</h3>
        <div class="vk-pod">${esc(cesta)}</div>
      </div>
      ${IC('i-sipka', 'font-size:19px;color:var(--text3);flex:0 0 auto')}
    </div>
    ${cislaRada([
      // Bez `fmtKm`: v kartě je jednotka zvlášť jako popisek a čtyřmístné
      // číslo potřebuje oddělovač tisíců, jinak z něj je „4437“.
      { ikona: 'i-route', hodnota: Math.round(st.road).toLocaleString('cs-CZ'), popisek: 'km' },
      { ikona: 'i-pinme', hodnota: String(zastavky.length), popisek: 'míst' },
      { ikona: 'i-kalendar', hodnota: String(dny), popisek: dny === 1 ? 'den' : dny < 5 ? 'dny' : 'dní' },
      { ikona: 'i-globe', hodnota: String(zemi), popisek: zemi === 1 ? 'země' : 'zemí' },
    ])}
  </div>`
}

/** Prázdný plán. Karta zůstává – je to jediné místo, odkud se výprava zakládá. */
function kartaPrazdna() {
  return `<div class="vkarta">
    <div class="vk-hlava">
      <img class="vk-obr" src="${vanObr}" alt="">
      <div class="vk-text">
        <h3>${IC('i-leaf')}Zatím žádná výprava</h3>
        <div class="vk-pod">Vyber místa, poskládám trasu.</div>
      </div>
    </div>
    <button class="btn primary" id="vkZaloz" style="margin:0">${IC('i-wand')}Naplánovat výlet</button>
  </div>`
}

export function renderMapaDole() {
  const karta = document.getElementById('vypravaKarta')
  const ulozeneEl = document.getElementById('mapUlozene')
  if (!karta || !ulozeneEl) return

  const zastavky = store.plan.map((id) => S.byId[id]).filter(Boolean)
  karta.innerHTML = zastavky.length ? kartaVypravy(zastavky) : kartaPrazdna()

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
  const otevri = document.getElementById('vkOtevri')
  if (otevri) otevri.onclick = () => aktivujZalozku('plan')

  const zaloz = document.getElementById('vkZaloz')
  if (zaloz) zaloz.onclick = () => openWizard()

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
