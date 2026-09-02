/**
 * Záložka Domů – „co dnes".
 *
 * Skladba ze společných dílů podle grafického manuálu: hero pás s pozdravem,
 * karta výpravy, mřížka „Možná dnes", řádky rozkoukaných míst a čísla.
 *
 * CO ODSUD ODEŠLO A KAM:
 *   - **Bikeparky (32 karet)** do kolekce „Na kolo" v Objevuj. Byla to jedna
 *     kategorie z deseti, která zabírala většinu obrazovky, a žádná předloha
 *     nic takového nemá. Ceny se neztratily – přestěhovaly se do detailu místa,
 *     kam patří, protože jsou to údaje o konkrétním bikeparku.
 *   - **Nálady** na Objevuj: „jakou máte náladu" je otázka pro toho, kdo neví,
 *     kam chce, a to je otázka Objevuj, ne Domů.
 *   - **Pilulka polohy** na mapu, kde je z ní kolečko vpravo nahoře. Jedno
 *     místo, ne dvě.
 *   - **Ilustrace dodávky** na mapu, na trasu plánu – tak ji má předloha.
 *     Na Domů ji nahradil akvarel v hero pásu.
 */

import { S, prefs, savePrefs } from '../../core/store.js'
import { obsahDomu } from './sekce.js'
import { zjistiPolohu } from '../../core/geo.js'
import { aktivujZalozku } from '../../core/router.js'
import { otevriItinerar, otevriNaCeste } from '../plan/plan.js'
import { jedeSe } from '../plan/cestaData.js'
import { IC } from '../../icons/sprite.js'
import { openWizard } from '../../components/wizard.js'
import { heroPas } from '../../components/vzory.js'
import { napojVypravu } from '../../components/vypravaKarta.js'
import {
  napojPocasi,
  nejblizsiMesto,
  pocasiCestaHtml,
  pocasiHodinyHtml,
  pocasiHtml,
  pocasiProBod,
  pocasiProCestu,
} from '../../components/pocasi.js'
import { dnyCesty } from '../plan/termin.js'
import { goTo } from '../../map/map.js'
import heroObr from '../../assets/hero/domu.webp'

/** Pozdrav podle denní doby. */
export function greeting() {
  const h = new Date().getHours()
  const n = prefs.userName ? `, ${prefs.userName}` : ''
  if (h >= 5 && h < 10) return `Dobré ráno${n}. Kam se dnes zatouláme?`
  if (h >= 10 && h < 14) return `Tak co${n}, co dnes objevíme?`
  if (h >= 14 && h < 18) return `Ještě někam odbočíme${n}?`
  if (h >= 18 && h < 22) return `Kam nás to zaválo dnes${n}?`
  return `Dobrou noc na čtyřech kolech${n}.`
}


export function renderHome() {
  const el = document.getElementById('homeInner')
  if (!el) return
  // POŘADÍ I VIDITELNOST SEKCÍ ŘÍDÍ `sekce.js`, ne tenhle soubor (hlášení
  // `tadeas-f32-009`). Obsah se počítá až u sekcí, které jsou opravdu vidět –
  // schování tak ušetří i těch šest průchodů přes 580 míst, které se tu dřív
  // dělaly pokaždé.
  const obsah = obsahDomu()

  el.innerHTML =
    heroPas({ obrazek: heroObr, nadpis: greeting(), podtitulek: 'Ťukni na pozdrav a nastav si oslovení.' }) +
    `<div class="list">` +
    // Zhasnout jde i všechno. Bez téhle věty by Domů vypadala rozbitě – a je
    // to stav, do kterého se člověk dostane dvěma ťuknutími.
    (obsah ||
      `<div class="domu-prazdno">${IC('i-oko-ne')}<div>
        Všechno je schované. Zapni si sekce v <b>Nastavení → Domů</b>.
      </div></div>`) +
    `<div style="height:22px"></div></div>`

  /* ---- obsluha ---- */

  // Ťuknutí na pozdrav ho vymění za políčko na oslovení. Zůstává z původní
  // aplikace – je to jediné místo, kde se oslovení dá nastavit bez Profilu.
  const pozdrav = el.querySelector('.heropas-text h2')
  if (pozdrav) {
    // Id zůstává `hgreet` z původní aplikace, i když se pozdrav přestěhoval
    // z řádku pod obrázkem do hero pásu – je to pořád ta samá funkce.
    pozdrav.id = 'hgreet'
    pozdrav.onclick = () => zeptejSeNaJmeno(pozdrav)
  }

  napojVypravu(el, {
    naPlan: () => otevriItinerar(),
    naCestu: () => otevriNaCeste(),
    naPruvodce: () => openWizard(),
  })

  const doPlanu = document.getElementById('homePlan')
  if (doPlanu) doPlanu.onclick = () => (jedeSe() ? otevriNaCeste() : otevriItinerar())

  for (const k of el.querySelectorAll('.fotokarta[data-id]')) {
    k.onclick = () => goTo(S.byId[k.dataset.id])
  }
  for (const r of el.querySelectorAll('.radek[data-id]')) {
    r.onclick = () => goTo(S.byId[r.dataset.id])
  }

  naplnPocasi()
}

/**
 * Doplní předpověď do připraveného místa.
 *
 * SAMO SI O POLOHU NEŘEKNE. Bere tu, kterou appka už zná; kdo ji nedal,
 * dostane tlačítko. Systémový dotaz na polohu hned po otevření Domů by byl
 * přepadení – a `on('poloha')` v `main.js` Domů stejně překreslí, takže se
 * počasí objeví samo ve chvíli, kdy si o polohu řekne někdo jiný.
 */
async function naplnPocasi() {
  const kam = document.getElementById('homePocasi')
  if (!kam) return

  // JEDNO TLAČÍTKO, které pojmenovává běžící režim (`tadeas-f32-010`). Sedí
  // v pravém slotu nadpisu, který vykreslila `sekce()` – do září 2026 se sem
  // vkládalo lomítko se dvěma tlačítky přes `insertAdjacentHTML`, což při
  // dvojím průchodu téhle funkce vyrobilo přepínače dva.
  //
  // „Na cestě" potřebuje vědět, který den výpravy je které datum. Za jízdy se
  // to počítá od vyjetí, jinak z termínu; bez obojího je tlačítko NEAKTIVNÍ
  // a řekne proč – stejný vzor jako u dlaždic rychlé inspirace.
  // DŮVOD SI NESE `dnyCesty()` S SEBOU. Prázdný seznam má čtyři různé příčiny
  // – chybí termín, výprava nemá zastávky, dny už jsou za námi, nebo začíná
  // dál, než předpověď dohlédne. Jedna věta natvrdo by ve třech z nich lhala.
  const okno = dnyCesty()
  const jdeCesta = okno.dny.length > 0
  const rezim = prefs.pocasiRezim === 'nacest' && jdeCesta ? 'nacest' : 'utebe'
  const prepinac = document.getElementById('homePocasiRezim')
  if (prepinac) {
    prepinac.firstChild.textContent = rezim === 'nacest' ? 'na cestě' : 'u tebe'
    prepinac.disabled = !jdeCesta && rezim === 'utebe'
    prepinac.title = jdeCesta
      ? 'Přepnout na počasí ' + (rezim === 'nacest' ? 'u tebe' : 'na cestě')
      : okno.duvod
    prepinac.onclick = () => {
      prefs.pocasiRezim = rezim === 'nacest' ? 'utebe' : 'nacest'
      savePrefs()
      renderHome()
    }
  }

  // HODINY JSOU V OBOU REŽIMECH a vždycky z tvé polohy – odpovídají na „prší
  // tady teď". Do září 2026 v režimu „na cestě" chyběly úplně: vykreslovaly
  // se jen dny výpravy.
  if (!S.userPos) {
    // Bez polohy nejsou hodiny odkud vzít. Na cestě aspoň dny, jinak tlačítko.
    if (rezim !== 'nacest') {
      kam.innerHTML = `<div class="btnrow" style="margin:0">
        <button class="btn" id="homePocasiPoloha">${IC('i-compass')}Ukázat počasí u mě</button>
      </div>`
      document.getElementById('homePocasiPoloha').onclick = () => zjistiPolohu()
      return
    }
  }

  kam.innerHTML = `<div class="meta">Načítám předpověď…</div>`

  const p = S.userPos ? await pocasiProBod(S.userPos) : null
  const cesta = rezim === 'nacest' ? await pocasiProCestu() : null

  // Mezitím se mohlo překreslit (přišla poloha, přepnula se záložka). Zápis
  // do odpojeného prvku by zmizel do prázdna – a hůř, přepsal by novější.
  const porad = document.getElementById('homePocasi')
  if (!porad || porad !== kam) return

  const hodiny = p ? pocasiHodinyHtml(p, { kdeId: 'homePocasiKde' }) : ''

  if (rezim === 'nacest') {
    kam.innerHTML =
      hodiny + (cesta ? pocasiCestaHtml(cesta) : '<div class="meta">Předpověď výpravy se nepodařilo načíst.</div>')
  } else {
    kam.innerHTML = p
      ? pocasiHtml(p, { kdeId: 'homePocasiKde' })
      : `<div class="meta">Předpověď se nepodařilo načíst. Zkusím to zase, až bude signál.</div>`
  }

  // Posouvač pod pruhem hodin. Musí se navěsit v OBOU režimech – pruh je
  // v obou a bez toho by lišta pod ním stála na místě.
  if (hodiny) napojPocasi(kam)

  // Odkud se předpověď bere. Počítá se z `mesta.json`, tedy BEZ DOTAZU NA SÍŤ.
  const kde = document.getElementById('homePocasiKde')
  if (kde && S.userPos) {
    const nazev = await nejblizsiMesto(S.userPos)
    if (nazev && document.getElementById('homePocasiKde') === kde) kde.textContent = nazev
  }
}

/** Vymění pozdrav za políčko a uloží oslovení. */
function zeptejSeNaJmeno(prvek) {
  const inp = document.createElement('input')
  inp.type = 'text'
  inp.maxLength = 24
  inp.value = prefs.userName || ''
  inp.placeholder = 'Jak vám máme říkat? (prázdné = bez oslovení)'
  inp.className = 'wsel'
  inp.style.cssText = 'margin:4px 0 0;max-width:260px;font-size:.86rem'
  inp.setAttribute('aria-label', 'Oslovení')
  prvek.replaceWith(inp)
  inp.focus()
  inp.select()

  let hotovo = false
  const dokonci = (ulozit) => {
    if (hotovo) return
    hotovo = true
    if (ulozit) {
      prefs.userName = inp.value.trim().slice(0, 24)
      savePrefs()
    }
    renderHome()
  }
  inp.onkeydown = (e) => {
    if (e.key === 'Enter') dokonci(true)
    else if (e.key === 'Escape') dokonci(false)
  }
  inp.onblur = () => dokonci(true)
}
