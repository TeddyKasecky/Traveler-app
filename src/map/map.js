/**
 * Hlavní mapa a překreslování.
 *
 * Mapa nezná obrazovky. Když se má po překreslení obnovit i panel, oznámí to
 * událostí `prekresleno`; kdo na ni reaguje, je v main.js. Stejně tak klik na
 * špendlík jen oznámí `otevriDetail`.
 */

import L from 'leaflet'
import { S, store, prefs, savePrefs, emit } from '../core/store.js'
import { visible, pocetAktivnich } from '../core/filters.js'
import { aktivujZalozku } from '../core/router.js'
import { pinIcon } from './markers.js'
import { drawPlanLine } from './planLine.js'
import { vybraneAutoUrl } from '../components/vyberAuta.js'
import { zajistiPodklad, nastavRezim, hlasStavDlazdic } from './podklad.js'

/** @type {L.Map} */
export let mapa
/** @type {L.LayerGroup} */
let vrstva
/** @type {L.Marker|null} */
let markerPolohy = null
/** @type {L.TileLayer|null} dlaždice z OSM – jen když si je uživatel zapne */
let dlazdice = null

/**
 * Do stránky se vkládají jen špendlíky, které jsou vidět.
 *
 * Měření na 4× zpomaleném procesoru: posun mapy stál 849 ms přepočtu stylů,
 * přiblížení 270 ms. Nešlo o skript ani o rozvržení – Leaflet při tažení
 * a přibližování přepíná třídy na kontejneru a prohlížeč musí přepočítat styly
 * všech špendlíků pod ním. Každý má `::after`, stín a proměnnou `--pc`, takže
 * 580 kusů je znát.
 *
 * Vzhled se tím nemění: co je za okrajem, stejně nikdo nevidí. Rezerva kolem
 * výřezu je tu proto, aby špendlíky nedobíhaly až po zastavení posunu.
 */
const REZERVA_VYREZU = 0.4

/** Místa, která prošla filtry. Drží se mezi překresleními kvůli posunu mapy. */
let vFiltru = []

/** @type {Map<string, L.Marker>} id místa → špendlík, který je právě na mapě */
const naMape = new Map()

/** Vytvoří mapu. Volá se jednou při startu. */
export function initMapa() {
  mapa = L.map('map', { zoomControl: false }).setView([47.2, 10.5], 5)
  // Knoflíky +/− tu bývaly vlevo dole. Tam je od přestavby rozvržení karta
  // výpravy a předloha je nikde nemá; přibližuje se prsty, kolečkem myši nebo
  // klávesami, což Leaflet umí sám.
  vrstva = L.layerGroup().addTo(mapa)

  // Dlaždice (když si je uživatel zapnul) a stav přepínače. Malovaný podklad
  // se staví až při prvním přepnutí na mapu, viz `poPrepnutiNaMapu()`.
  srovnejPodklad()

  // Po každém posunu i přiblížení srovnat, které špendlíky jsou vidět.
  // `moveend` přijde i po zoomu, takže stačí jedna událost.
  mapa.on('moveend', () => srovnejVyrez(true))
  mapa.on('zoomend', srovnejVelikostSpendliku)
  srovnejVelikostSpendliku()
}

/**
 * Měřítko špendlíků podle přiblížení.
 *
 * Při pohledu na celou Evropu je ve výřezu přes pět set míst a v plné velikosti
 * z nich byla jedna souvislá skvrna. Zmenšené kapky drží stejnou informaci
 * a mapa pod nimi zůstane vidět – tak to dělají i tištěné mapy.
 *
 * Píše se jedna proměnná na kontejner mapy, ne pět set značek: přestavovat
 * značky při každém zoomu by bylo znát.
 */
const MERITKO_SPENDLIKU = { 3: 0.55, 4: 0.62, 5: 0.75, 6: 0.88 }

function srovnejVelikostSpendliku() {
  const z = mapa.getZoom()
  mapa.getContainer().style.setProperty('--ps', String(MERITKO_SPENDLIKU[z] ?? (z < 3 ? 0.55 : 1)))
}

/** Zapne nebo vypne dlaždice podle `prefs.podklad`. */
function srovnejPodklad() {
  const chceDlazdice = prefs.podklad === 'dlazdice'

  if (chceDlazdice && !dlazdice) {
    dlazdice = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap',
    }).addTo(mapa)
    dlazdice.on('tileerror', () => hlasStavDlazdic(true))
    dlazdice.on('tileload', () => hlasStavDlazdic(false))
  } else if (!chceDlazdice && dlazdice) {
    dlazdice.remove()
    dlazdice = null
    hlasStavDlazdic(false)
  }

  nastavRezim(chceDlazdice)

  // Pilulka ukazuje režim, ve kterém mapa je, ne co udělá ťuknutí. Že je mapa
  // offline, je informace, kterou člověk na cestě potřebuje vidět.
  const b = document.getElementById('podkladBtn')
  if (b) {
    b.classList.toggle('on', !chceDlazdice)
    b.querySelector('span').textContent = chceDlazdice ? 'Online' : 'Offline'
    b.title = chceDlazdice ? 'Přepnout na offline mapu' : 'Zpět na online mapu'
  }
}

/**
 * Přepne podklad mezi dlaždicemi z OpenStreetMap a malovanou offline mapou.
 *
 * Výchozí je online mapa: má silnice a dá se podle ní jet. Malovaná mapa je
 * pro chvíle bez signálu – dlaždice se offline neukládají a hromadně stahovat
 * se nesmějí (podmínky OSM), takže bez ní by mapa bez signálu byla šedá.
 * Volba se pamatuje v `prefs.podklad`.
 *
 * @returns {boolean} true = nově je zapnutá offline mapa
 */
export function prepniPodklad() {
  prefs.podklad = prefs.podklad === 'dlazdice' ? 'malovany' : 'dlazdice'
  savePrefs()
  srovnejPodklad()
  return prefs.podklad === 'malovany'
}

/**
 * Překreslí špendlíky, čáru plánu a všechna počítadla,
 * a nakonec oznámí, ať se obnoví otevřený panel.
 */
export function draw() {
  // Stavy špendlíků (navštíveno, v plánu, zvýrazněno) se mohly změnit, takže se
  // zahodí všechny a postaví znovu – stejně jako dřív. Posun mapy naopak jen
  // doplňuje a odebírá, viz `srovnejVyrez()`.
  vrstva.clearLayers()
  naMape.clear()
  vFiltru = visible()
  srovnejVyrez(false)
  drawPlanLine(mapa)

  const c = document.getElementById('count')
  document.getElementById('countN').textContent = `${vFiltru.length} míst`
  c.classList.remove('bump')
  void c.offsetWidth // vynutí restart animace
  c.classList.add('bump')

  document.getElementById('totalN').textContent = S.places.length
  document.getElementById('visitedN').textContent = Object.values(store.stav).filter((x) => x === 'visited').length

  const n = pocetAktivnich()
  const b = document.getElementById('fBadge')
  b.hidden = !n
  b.textContent = n

  emit('prekresleno')
}

/**
 * Doplní špendlíky, které se dostaly do výřezu, a odebere ty, co z něj vypadly.
 *
 * Počítadlo míst se nemění – ukazuje pořád všechna místa, která prošla filtry,
 * ne jen ta právě vykreslená.
 *
 * @param {boolean} tise  true = špendlíky přibyly posunem, ať nenabíhají animací
 */
function srovnejVyrez(tise = true) {
  const meze = mapa.getBounds().pad(REZERVA_VYREZU)
  const majiByt = new Set()

  let i = 0
  for (const p of vFiltru) {
    if (!meze.contains([p.lat, p.lon])) continue
    majiByt.add(p.id)
    if (!naMape.has(p.id)) {
      const m = L.marker([p.lat, p.lon], { icon: pinIcon(p, i, tise) })
        .on('click', () => emit('otevriDetail', { p }))
        .addTo(vrstva)
      naMape.set(p.id, m)
    }
    i++
  }

  for (const [id, m] of naMape) {
    if (majiByt.has(id)) continue
    vrstva.removeLayer(m)
    naMape.delete(id)
  }
}

/**
 * Skočí na místo: přepne na mapu, zvýrazní špendlík, přiletí k němu
 * a po dokončení letu otevře detail.
 * @param {Record<string, any>} p
 */
export function goTo(p) {
  aktivujZalozku('map')
  S.hiId = p.id
  draw()
  mapa.flyTo([p.lat, p.lon], Math.max(mapa.getZoom(), 11), { duration: 0.8 })
  setTimeout(() => emit('otevriDetail', { p, focus: false }), 450)
}

/** Přiblíží mapu tak, aby byla vidět všechna filtrovaná místa. */
export function priblizNaFiltr(mista) {
  if (!mista.length) return
  mapa.flyToBounds(L.latLngBounds(mista.map((p) => [p.lat, p.lon])).pad(0.2), { duration: 0.9 })
}

/**
 * Kde právě jsme – auto vybrané v Profilu, ne zelený puntík.
 *
 * Ikonu vybírá `components/vyberAuta.js` (64 aut ze `src/assets/auta/`);
 * bez volby jede výchozí dodávka. Puntík tu byl do srpna 2026 a na malované
 * mapě vypadal jako cizí prvek z jiné aplikace.
 *
 * Volá se i po změně auta v Profilu – proto se značka staví vždycky znovu.
 */
export function zobrazPolohu() {
  if (!S.userPos) return
  if (markerPolohy) markerPolohy.remove()
  markerPolohy = L.marker([S.userPos.lat, S.userPos.lon], {
    interactive: false,
    keyboard: false,
    // Nulová velikost a kotva v nule: obrázek si polohu i rozměr řeší v CSS,
    // stejně jako dodávka na trase.
    icon: L.divIcon({
      className: 'poloha',
      iconSize: [0, 0],
      iconAnchor: [0, 0],
      html: `<img src="${vybraneAutoUrl()}" alt="">`,
    }),
  }).addTo(mapa)
}

/**
 * Co se dodělá, až se na mapu opravdu přepne.
 *
 * MALOVANÝ PODKLAD SE STAVÍ AŽ TADY, ne při startu. Aplikace startuje na Domů,
 * kde mapa není vidět, a rozebírat 400kB podkladu, kreslit 477 ploch a stavět
 * tři sta prvků kresby pro obrazovku, na kterou se uživatel třeba vůbec
 * nepodívá, nemá smysl. Na číslech z `npm run perf` to není poznat – to měření
 * kolísá o čtvrtinu a rozdíl v něm zapadne – ale ušetřená práce je skutečná
 * a nic za ni neplatíme, protože podklad je hotový dřív, než mapa doanimuje.
 *
 * Leaflet si po přepnutí musí přeměřit velikost, jinak zůstane zmenšený.
 */
export function poPrepnutiNaMapu() {
  zajistiPodklad(mapa).then(() => srovnejPodklad())
  setTimeout(() => mapa.invalidateSize(), 60)
}
