/**
 * Mini-mapa nad plánem – sdílená mezi Itinerářem a kartou Na cestě.
 *
 * PROČ SPOLEČNĚ: kreslila se jen v Itineráři (`plan.js#vykresliMapuDashboardu`)
 * a karta Na cestě žádnou mapu neměla – právě ta, u které člověk nejvíc
 * potřebuje vidět, kde je a kam míří. Obojí kreslí totéž (trasu, zastávky,
 * vlastní body, tvoji polohu), jen z jiného zdroje: Itinerář ze živého
 * `store.plan`, cesta z otisku `store.cesta.zastavky`.
 *
 * INSTANCE JE JEDNA NA PRVEK, ne jedna na modul. Původní verze měla jednu
 * globální proměnnou a jeden čítač kol – dvě mapy naráz (obě karty) by se
 * o ně praly a druhá by tu první zabila. Tady si každý prvek nese svůj
 * záznam ve `WeakMap`, takže se navzájem nevidí.
 *
 * Mapa vzniká až s odkladem (rAF + 180 ms): dřív má prvek nulovou velikost
 * a Leaflet by spočítal špatné souřadnice. Mezitím se ale karta může
 * překreslit nebo se z ní dá odejít, a odložený callback by pak postavil
 * Leaflet na prvku, který v dokumentu není – z toho Leaflet padá na
 * `_leaflet_pos` při prvním posunu. Čítač kol proto říká callbacku
 * „tvoje kolo už neplatí, nic nestav".
 */

import L from 'leaflet'
import { token } from '../../core/barvy.js'
import { geometrie, zajistiTrasu } from '../../core/trasy.js'
import { IC } from '../../icons/sprite.js'
import { otiskBodu } from './routing.js'

/** @type {WeakMap<HTMLElement, {mapa: L.Map|null, kolo: number, ja: L.Marker|null}>} */
const instance = new WeakMap()

/**
 * Které mini-mapy jsou odemčené. Klíčem je `id` prvku (`cestaMapa`,
 * `dashMapa`), ne prvek sám – ten při každém překreslení karty zaniká
 * a s ním by zmizelo i odemčení, přestože obrazovka zůstala otevřená.
 *
 * Do předvoleb to nepatří: hlášení `tadeas-f32-020` výslovně chce, aby byl
 * zámek po načtení zase zamčený. Odchod ze záložky Plán zamyká `zamkniMapy()`.
 * @type {Set<string>}
 */
const odemcene = new Set()

/** Posun a přiblížení, které zámek ovládá. Zoom kolečkem je vypnutý vždycky. */
const POHYB = ['dragging', 'touchZoom', 'doubleClickZoom', 'boxZoom', 'keyboard']

/** Zamkne všechny mini-mapy. Volá se při odchodu ze záložky Plán. */
export function zamkniMapy() {
  odemcene.clear()
}

/**
 * Tlačítko zámku v pravém horním rohu mapy.
 *
 * PROČ `L.Control` A NE OBYČEJNÝ `<button>` V PRVKU: control zaniká spolu
 * s mapou, takže po `mapa.remove()` nezůstane osiřelé tlačítko nad prázdným
 * místem. Pravý horní roh je navíc přesně ten, který na to Leaflet má.
 */
function pridejZamek(mapa, klic) {
  const ovladac = L.control({ position: 'topright' })
  ovladac.onAdd = () => {
    const b = L.DomUtil.create('button', 'dashmapa-zamek')
    const nakresli = () => {
      const zamceno = !odemcene.has(klic)
      // JEN MODIFIKÁTOR, NIKDY CELÉ `className`. Třídu `leaflet-control`
      // přidává Leaflet až PO návratu z `onAdd` a právě ona zapíná
      // `pointer-events` – bez ní prokliky propadnou do mapy pod tlačítkem
      // a zámek přestane jít zmáčknout hned po prvním přepnutí.
      b.classList.toggle('odemceno', !zamceno)
      b.innerHTML = IC(zamceno ? 'i-zamek' : 'i-zamek-otevreny')
      b.title = zamceno ? 'Odemknout mapu' : 'Zamknout mapu'
      b.setAttribute('aria-label', b.title)
      for (const p of POHYB) mapa[p][zamceno ? 'disable' : 'enable']()
    }
    // Bez tohohle by ťuknutí na tlačítko propadlo do mapy pod ním.
    L.DomEvent.disableClickPropagation(b)
    L.DomEvent.on(b, 'click', (e) => {
      L.DomEvent.stop(e)
      if (odemcene.has(klic)) odemcene.delete(klic)
      else odemcene.add(klic)
      nakresli()
    })
    nakresli()
    return b
  }
  ovladac.addTo(mapa)
}

/**
 * Přesune značku „Tady jsi" beze změny výřezu.
 *
 * PROČ TO EXISTUJE (hlášení `tadeas-f32-016`): za jízdy se každé dvě sekundy
 * překresloval celý Plán, takže se mini-mapa bourala a stavěla znovu – a s ní
 * i `fitBounds`, který vrátil výřez zpátky. Blikalo to a posunout si mapu
 * nešlo. Za tu dobu se přitom mění jediná věc: kde jsem. Tahle funkce ji
 * změní a ničeho jiného se nedotkne – ŽÁDNÝ `fitBounds`, jinak by to bylo
 * k ničemu a zámek nad tím taky.
 *
 * @param {HTMLElement|null} el
 * @param {{lat:number, lon:number}|null} bod
 */
export function posunZnackuPolohy(el, bod) {
  if (!el || !instance.has(el)) return
  const z = instance.get(el)
  if (!z.mapa || !bod || !Number.isFinite(bod.lat)) return
  if (z.ja) z.ja.setLatLng([bod.lat, bod.lon])
  else z.ja = znackaJa(bod).addTo(z.mapa)
}

/** Značka „Tady jsi". Jedno místo, ať se první vykreslení a posun nerozejdou. */
const znackaJa = (bod) =>
  L.marker([bod.lat, bod.lon], {
    icon: L.divIcon({ className: 'kos-pin-obal', html: '<div class="kos-ja"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
    zIndexOffset: 2000,
  }).bindTooltip('Tady jsi', { direction: 'top', offset: [0, -9] })

const zaznam = (el) => {
  if (!instance.has(el)) instance.set(el, { mapa: null, kolo: 0, ja: null })
  return instance.get(el)
}

/** Uklidí mapu daného prvku. Volá se při odchodu i před novým vykreslením. */
export function zavriDashMapu(el) {
  if (!el || !instance.has(el)) return
  const z = instance.get(el)
  // Zneplatní i požadavek, který se ještě nestihl provést.
  z.kolo++
  if (z.mapa) {
    try {
      z.mapa.remove()
    } catch {
      /* prvek zmizel s překreslením */
    }
    z.mapa = null
  }
  // Značka umírá s mapou – držet na ni odkaz by znamenalo příště posouvat
  // něco, co v žádné mapě není.
  z.ja = null
}

/**
 * Vykreslí mini-mapu do prvku.
 *
 * @param {HTMLElement} el  cílový prvek
 * @param {Object} o
 * @param {Array<Record<string, any>>} o.zastavky  místa s lat/lon, v pořadí trasy
 * @param {Array<{lat:number, lon:number, druh?:string, nazev?:string}>} [o.body]  vlastní body
 * @param {{otisk:string, polyline:Array<[number,number]>}|null} [o.prepocet]  skutečná trasa
 * @param {Array<{lat:number, lon:number, id:string, zdroj?:object}>} [o.proOtisk]  body, ze
 *   kterých se počítá otisk pro ověření platnosti přepočtu
 * @param {{lat:number, lon:number}|null} [o.odkud]  kde jsi ty
 * @param {Set<string>} [o.kotvy]  id míst, která jsou kotvou
 * @param {string} [o.zvyraznit]  id místa, které se má vytáhnout dopředu (další cíl)
 * @param {string} [o.prazdno]  text, když není co kreslit
 */
export function vykresliDashMapu(el, {
  zastavky = [], body = [], prepocet = null, proOtisk = null,
  odkud = null, kotvy = new Set(), zvyraznit = '', prazdno = 'Zatím není co ukázat — přidej první zastávku.',
}) {
  zavriDashMapu(el)
  if (!el || el._leaflet_id) return

  const mista = zastavky.filter((p) => p && Number.isFinite(p.lat))
  if (!mista.length && !body.length && !odkud) {
    el.innerHTML = `<div class="meta kosik-bezmapy">${prazdno}</div>`
    return
  }

  const z = zaznam(el)
  const moje = ++z.kolo
  requestAnimationFrame(() => {
    setTimeout(() => {
      // Mezitím se mohlo odejít z karty nebo překreslit – pak se nestaví nic.
      if (moje !== z.kolo || !document.body.contains(el) || el._leaflet_id) return
      try {
        const stred = mista[0] || body[0] || odkud
        // ZAMČENO OD ZAČÁTKU (hlášení `tadeas-f32-020`). Mini-mapa zabírá
        // kus karty a s zapnutým posunem krade na telefonu tah, takže se
        // přes ni nedá rolovat stránka. Odemkne ji zámek v rohu.
        z.mapa = L.map(el, {
          zoomControl: false,
          attributionControl: false,
          scrollWheelZoom: false,
          dragging: false,
          touchZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
        }).setView([stred.lat, stred.lon], 7, { animate: false })
        pridejZamek(z.mapa, el.id || 'dashmapa')
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(z.mapa)

        // Skutečná trasa z Mapy.com Routing API, pokud je pro TENHLE seznam
        // bodů ještě platná – stejné pravidlo jako na hlavní mapě
        // (map/planLine.js). Otisk se počítá z `proOtisk`, tedy z přesně té
        // množiny bodů, kterou volající poslal do routingu; jinak by se
        // otisky nikdy neshodly a mapa by navždy zůstala na vzdušné čáře.
        //
        // FALLBACK VEDE PŘES TYTÉŽ BODY, ne jen přes zastávky. Do srpna 2026
        // se vzdušná čára skládala z `mista`, tedy z míst z databáze –
        // nocleh, start ani cíl na ní nebyly, přestože se jede přes ně.
        // `proOtisk` je přesně to správné pořadí i s nimi.
        const proCaru = proOtisk && proOtisk.length > 1 ? proOtisk : mista
        if (proCaru.length > 1) {
          const platny = prepocet && proOtisk && prepocet.otisk === otiskBodu(proOtisk)
          // Geometrie je v IndexedDB (core/trasy.js). Když ještě není v paměti,
          // kreslí se vzdušná čára – mini-mapa se překreslí s kartou, jakmile
          // se dotáhne.
          if (platny) zajistiTrasu(prepocet.otisk)
          const skutecna = platny ? geometrie(prepocet.otisk) : null
          L.polyline(skutecna || proCaru.map((p) => [p.lat, p.lon]), {
            color: token('--akcent'), weight: 3, opacity: 0.75,
          }).addTo(z.mapa)
        }

        for (const p of mista) {
          const jeKotva = kotvy.has(p.id)
          const jeCil = p.id === zvyraznit
          const velikost = jeKotva ? 34 : jeCil ? 30 : 26
          L.marker([p.lat, p.lon], {
            icon: L.divIcon({
              className: 'kos-pin-obal',
              html: jeKotva
                ? `<div class="kos-pin kotva" style="--kb:${token('--rust')}">★</div>`
                : `<div class="kos-pin blizko${jeCil ? ' cil' : ''}" style="--kb:${token(jeCil ? '--zvyrazneni' : '--akcent')}"></div>`,
              iconSize: [velikost, velikost],
              iconAnchor: [velikost / 2, velikost / 2],
            }),
            // Další cíl nad zbytkem, kotva nade vším – obojí je to, co člověk
            // na mapě hledá jako první.
            zIndexOffset: jeKotva ? 1000 : jeCil ? 500 : 0,
          })
            .addTo(z.mapa)
            .bindTooltip(p.n, { direction: 'top' })
        }

        // Vlastní body trasy – poloviční průměr běžné zastávky. Start a cíl
        // mají vlastní barvu, zbytek stejnou jako zastávky: jen menší, ať je
        // jasné, že nejde o místo z databáze.
        for (const m of body) {
          const barva = m.druh === 'start' ? token('--sun') : m.druh === 'cil' ? token('--upozorneni') : token('--akcent')
          L.marker([m.lat, m.lon], {
            icon: L.divIcon({
              className: 'kos-pin-obal',
              html: `<div class="kos-pin vlastni" style="--kb:${barva}"></div>`,
              iconSize: [10, 10],
              iconAnchor: [5, 5],
            }),
          })
            .addTo(z.mapa)
            .bindTooltip(m.nazev || 'Vlastní místo', { direction: 'top' })
        }

        // Odkaz na značku se schová do záznamu: za jízdy se pak posouvá
        // jen ona (`posunZnackuPolohy()`), místo aby se stavěla celá mapa.
        if (odkud) z.ja = znackaJa(odkud).addTo(z.mapa)

        const vse = [...mista.map((p) => [p.lat, p.lon]), ...body.map((m) => [m.lat, m.lon])]
        if (odkud) vse.push([odkud.lat, odkud.lon])
        // Menší okraj a vyšší strop přiblížení než u běžné mapy – trasa má
        // vyplnit náhled, ne se schovat uprostřed prázdna.
        if (vse.length > 1) z.mapa.fitBounds(L.latLngBounds(vse), { padding: [14, 14], maxZoom: 13, animate: false })
      } catch {
        el.innerHTML = '<div class="meta kosik-bezmapy">Mapu se nepovedlo načíst.</div>'
      }
    }, 180)
  })
}
