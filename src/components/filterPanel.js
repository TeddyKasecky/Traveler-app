/**
 * Panel filtrů.
 *
 * Zálohy, obnova, CSV a přepínač vzhledu se přestěhovaly do Nastavení: panel
 * Filtry odpovídá na otázku „co chci vidět", Nastavení na „jak to má fungovat".
 * Obsluha ale zůstala tady, protože se věší při startu na prvky, které jsou
 * staticky v `index.html` – ať už leží kdekoli.
 */

import {
  S,
  F,
  store,
  save,
  PHOTOS,
  savePhotos,
  prefs,
  savePrefs,
  VESTAVENA_DATA,
  nastavData,
  ulozVlastniData,
} from '../core/store.js'
import { esc } from '../core/html.js'
import { pocetAktivnich, resetFiltru, visible } from '../core/filters.js'
import { registrujOverlay, aktivujZalozku } from '../core/router.js'
import { mistaZCsv, zalohaData, obnovZalohu, stahniJson } from '../core/csv.js'
import { stehujTrasy } from '../core/trasy.js'
import { draw } from '../map/map.js'
import { toast } from './toast.js'
import { vyberVice, vyberZeSeznamu } from './dialog.js'
import { otevriRazeni } from '../views/list/list.js'
import { zavriDialog, potvrd, oznam } from './dialog.js'
import { syncFiltersUI } from './chip.js'
import { nastavMotiv, zvolenyMotiv } from '../core/motiv.js'

const panel = () => document.getElementById('filters')
const backdrop = () => document.getElementById('backdrop')

export const jeOtevreny = () => panel().classList.contains('show')

export function otevriFiltry() {
  panel().classList.add('show')
  backdrop().classList.add('show')
}

export function zavriFiltry() {
  panel().classList.remove('show')
  backdrop().classList.remove('show')
}

/**
 * Které pole dat patří ke kterému rozbalovacímu seznamu.
 * Používá se na počty i na plnění, ať to nikde nestojí dvakrát.
 */
const SEZNAMY = [
  { id: 'fReg', klic: 'reg', pole: 'r', popisek: 'Oblast' },
  { id: 'fZeme', klic: 'zeme', pole: 'z', popisek: 'Země' },
  { id: 'fTyp', klic: 'typ', pole: 't', popisek: 'Typ' },
]

/**
 * Kolik míst by dala každá volba, kdyby se zapnula PŘI ZAPNUTÝCH OSTATNÍCH
 * filtrech.
 *
 * Vlastní filtr se na chvíli vypne — jinak by každá volba vyšla nula kromě
 * té právě vybrané. `visible()` se tím projde jednou na seznam, ne jednou
 * na volbu; při 68 oblastech by to jinak bylo 68 průchodů 580 místy.
 *
 * @param {{klic:string, pole:string}} s
 * @returns {Map<string, number>}
 */
function pocty(s) {
  // Vlastní filtr se na chvíli VYPRÁZDNÍ, ne nahradí – `filters.js` na tu
  // množinu drží odkaz a nová instance by mu ho utrhla pod rukama.
  const puvodni = [...F[s.klic]]
  F[s.klic].clear()
  const zaklad = visible()
  for (const v of puvodni) F[s.klic].add(v)

  const m = new Map()
  for (const p of zaklad) {
    const v = p[s.pole]
    if (v) m.set(v, (m.get(v) || 0) + 1)
  }
  return m
}

/**
 * Popisek na tlačítku filtru: „Země", „Země · Rakousko" nebo „Země · 2".
 *
 * Jedna vybraná hodnota se vypíše celá, protože je to ta nejčastější odpověď
 * a číslo „1" by nic neřeklo. Od dvou nahoru se počítá – na tlačítko široké
 * půl obrazovky se dvě jména zemí nevejdou a ořízlo by se to uprostřed.
 */
function popisekTlacitka(s) {
  const v = [...F[s.klic]]
  if (!v.length) return s.popisek
  return v.length === 1 ? `${s.popisek} · ${v[0]}` : `${s.popisek} · ${v.length}`
}

/**
 * Otevře výběr hodnot jednoho filtru.
 *
 * NABÍZÍ JEN TO, CO NĚCO VRÁTÍ. Oblastí je 117 a se zvolenou zemí jich má
 * smysl hrstka; zbytek by byl seznam, kterým se roluje k prázdným výsledkům.
 * Počty vedle názvu jsou ze stejného výpočtu, který dřív plnil `<option>`.
 */
async function otevriVyber(s) {
  const m = pocty(s)
  const polozky = [...new Set(S.places.map((p) => p[s.pole]).filter(Boolean))]
    // Zaškrtnutá hodnota zůstane v nabídce, i kdyby s ostatními filtry nic
    // nevracela – jinak by nešla odškrtnout.
    .filter((v) => m.get(v) || F[s.klic].has(v))
    .sort((a, b) => a.localeCompare(b, 'cs'))
    .map((v) => ({ id: v, popisek: v, meta: String(m.get(v) || 0) }))

  const v = await vyberVice({
    nadpis: s.popisek,
    ikona: 'i-filtr',
    polozky,
    vybrane: [...F[s.klic]],
  })
  if (!v) return
  F[s.klic].clear()
  for (const x of v) F[s.klic].add(x)
  draw()
}

/** Výběr stavu. Jednohodnotový: „Nenavštívená" a „Navštíveno" se doplňují. */
async function otevriStav() {
  const v = await vyberZeSeznamu({
    nadpis: 'Stav',
    polozky: [
      { id: '', popisek: 'Všechna místa', on: !F.stav },
      { id: 'wish', popisek: 'Nenavštívená', on: F.stav === 'wish' },
      { id: 'visited', popisek: 'Navštíveno', on: F.stav === 'visited' },
    ],
  })
  if (v === null) return
  F.stav = v
  draw()
}

/**
 * Srovná popisky čtyř tlačítek filtru a stav rušítka.
 *
 * Do srpna 2026 to přepisovalo `<option>` v `<select>`. Dnes se hodnoty
 * nabízejí až v kartě, takže tady zbývá jen text tlačítka – zato se volá
 * po každém překreslení, protože závisí na ostatních filtrech i na hledání.
 */
export function srovnejPocty() {
  for (const s of SEZNAMY) {
    const el = document.getElementById(s.id)
    if (!el) continue
    el.textContent = popisekTlacitka(s)
    el.classList.toggle('on', F[s.klic].size > 0)
  }
  const stav = document.getElementById('fStav')
  if (stav) {
    stav.textContent = F.stav === 'wish' ? 'Stav · Nenavštívená' : F.stav === 'visited' ? 'Stav · Navštíveno' : 'Stav'
    stav.classList.toggle('on', !!F.stav)
  }
  // Rušítko svítí jen když je co rušit – jinak je šedé A NEAKTIVNÍ.
  const zrus = document.getElementById('listZrusFiltry')
  if (zrus) {
    const kolik = pocetAktivnich()
    zrus.disabled = kolik === 0
    zrus.classList.toggle('ma', kolik > 0)
    zrus.title = kolik ? `Zrušit filtry (${kolik})` : 'Žádný filtr není zapnutý'
  }
}

/**
 * Naplní rozbalovací seznamy hodnotami, které se v datech opravdu vyskytují.
 * Volá se znovu po každé výměně dat (import CSV, návrat k vestavěným).
 */
export function fillSelects() {
  srovnejPocty()

  // Pilulky na Seznamu překreslují hned, protože jsou vidět rovnou nad výsledky.
  // Přepínače v panelu Filtry se dál potvrzují tlačítkem „Ukázat výsledky".
  for (const s of SEZNAMY) {
    const el = document.getElementById(s.id)
    if (el) el.onclick = () => otevriVyber(s)
  }
  document.getElementById('fStav').onclick = otevriStav
  // Rušítko volá `resetFiltru()`, tedy totéž, co tlačítko uvnitř panelu
  // Filtry – jen se na něj nemusí chodit.
  document.getElementById('listZrusFiltry').onclick = () => {
    resetFiltru()
    const q = document.getElementById('q')
    if (q) q.value = ''
    draw()
  }
  // Řazení je od srpna 2026 tlačítko s vlastní kartou, ne systémový select
  // – nabídku i překreslení si řídí `views/list/list.js` samo.
  document.getElementById('fRazeni').onclick = otevriRazeni
}

/** Zvýrazní tlačítko, které odpovídá uložené volbě vzhledu. */
function srovnejMotivUI() {
  for (const b of document.querySelectorAll('.motivbtn')) {
    b.classList.toggle('on', b.dataset.motiv === zvolenyMotiv())
  }
}

/** Naváže ovládání panelu. Volá se jednou při startu. */
export function initFilterPanel() {
  document.getElementById('fabFilter').onclick = otevriFiltry
  // Tlačítko filtrů je nově i ve vyhledávací liště na Seznamu – předloha ho
  // má u hledání, ne jako plovoucí knoflík vpravo dole.
  document.getElementById('listFiltry').onclick = otevriFiltry
  backdrop().onclick = () => zavriVse()

  for (const b of document.querySelectorAll('.motivbtn')) {
    b.onclick = () => {
      nastavMotiv(b.dataset.motiv)
      srovnejMotivUI()
    }
  }
  srovnejMotivUI()

  document.getElementById('fApply').onclick = () => {
    zavriVse()
    draw()
  }

  document.getElementById('fReset').onclick = () => {
    resetFiltru()
    // Jedno srovnání místo pěti smyček: `syncFiltersUI()` umí přepínače,
    // rozbalovací seznamy i rychlé pilulky nad mapou. Když se přidal další
    // prvek filtru, na tenhle výčet se pokaždé zapomnělo.
    syncFiltersUI()
    zavriVse()
    draw()
    toast('Filtry zrušeny')
  }

  // Přepínače mění stav filtrů, ale nepřekreslují – to udělá až „Ukázat výsledky“.
  for (const t of document.querySelectorAll('.toggle[data-f]')) {
    t.onclick = () => {
      F[t.dataset.f] = !F[t.dataset.f]
      t.classList.toggle('on')
    }
  }
  for (const t of document.querySelectorAll('.toggle.stav')) {
    t.onclick = () => {
      F.stav = t.dataset.s
      for (const x of document.querySelectorAll('.toggle.stav')) x.classList.toggle('on', x === t)
    }
  }

  // Hledání je podle předlohy na dvou obrazovkách – v liště Mapy i Seznamu.
  // Obě políčka píšou do jednoho `F.q` a to druhé si srovnají, aby si
  // neprotiřečila. Skok na Seznam při psaní na mapě odpadl: na mapě jsou
  // výsledkem hledání špendlíky, což je celý smysl toho, že tam hledání je.
  for (const id of ['q', 'qMapa']) {
    document.getElementById(id).oninput = (e) => {
      F.q = e.target.value
      for (const druhe of ['q', 'qMapa']) {
        const el = document.getElementById(druhe)
        if (el && el !== e.target) el.value = F.q
      }
      draw()
    }
  }

  initData()
  registrujOverlay({ jeOtevreny, zavri: zavriFiltry })
}

/**
 * Zavře všechno, co visí na stejném ztmavení: panel filtrů, průvodce, nabídku
 * navigace a vybírátko míst.
 *
 * Sahá se na ně přes DOM, ne přes import: zavření je čistě vizuální věc
 * a panel filtrů nemá důvod znát obrazovku Plán ani vybírátko.
 */
function zavriVse() {
  // Dialog je nejvýš – klik na závěs zavře jen jeho, panel pod ním zůstane.
  if (zavriDialog(null)) return
  zavriFiltry()
  for (const id of ['wizard', 'navSheet', 'vyberMista']) {
    document.getElementById(id)?.classList.remove('show')
  }
}

/* ================= data a zálohy ================= */

/**
 * Stáhne zálohu uživatelských dat a zapamatuje si kdy.
 *
 * Exportované schválně: spouští ji i varovný pruh při plné paměti. Tam je to
 * jediná záchrana, jak si data odnést, než se něco ztratí.
 *
 * Razítko se zapisuje až po sestavení zálohy, aby v ní bylo datum té předchozí.
 */
export function stahniZalohu() {
  stahniJson(zalohaData(store, PHOTOS, prefs), `vandrbuch-zaloha-${new Date().toISOString().slice(0, 10)}.json`)
  prefs.posledniZaloha = Date.now()
  savePrefs()
  toast('Záloha stažena')
}

function initData() {
  document.getElementById('csvIn').onchange = (e) => {
    const f = e.target.files[0]
    if (!f) return
    const rd = new FileReader()
    rd.onload = () => {
      try {
        const data = mistaZCsv(rd.result)
        ulozVlastniData(data)
        nastavData(data)
        fillSelects()
        draw()
        aktivujZalozku('home')
        toast(`Načteno ${data.length} míst`)
      } catch {
        oznam({ nadpis: 'Import se nepovedl', text: 'CSV se nepodařilo načíst – zkontroluj formát vse-dohromady-v3.' })
      }
    }
    rd.readAsText(f, 'utf-8')
  }

  document.getElementById('dataReset').onclick = async () => {
    if (!(await potvrd({ nadpis: 'Vrátit vestavěná data?', text: 'Poznámky zůstanou.', ano: 'Vrátit' }))) return
    ulozVlastniData(null)
    nastavData(VESTAVENA_DATA)
    fillSelects()
    draw()
    aktivujZalozku('home')
  }

  document.getElementById('expBtn').onclick = stahniZalohu

  document.getElementById('impIn').onchange = (e) => {
    const f = e.target.files[0]
    if (!f) return
    const rd = new FileReader()
    rd.onload = async () => {
      try {
        obnovZalohu(store, JSON.parse(rd.result), PHOTOS, prefs)
        // Zálohy z doby před srpnem 2026 nesou geometrii tras přímo v sobě.
        // Bez tohohle kroku by se jí store hned zase nafoukl na megabajty –
        // patří do IndexedDB, viz core/trasyDb.js. `obnovZalohu()` to udělat
        // nemůže: je to čistá funkce, kterou testuje check-dny v čistém Node.
        await stehujTrasy()
        save()
        savePrefs()
        draw()
        // Fotky jdou do IndexedDB, tedy asynchronně – hláška až potom, ať se
        // uživatel nedozví „obnoveno“ dřív, než je jasné, že fotky opravdu sedí.
        toast((await savePhotos()) ? 'Záloha obnovena' : 'Obnoveno, ale fotky se neuložily')
      } catch {
        oznam({ nadpis: 'Obnova se nepovedla', text: 'Soubor se nepodařilo načíst.' })
      }
    }
    rd.readAsText(f, 'utf-8')
  }
}

export { syncFiltersUI }
