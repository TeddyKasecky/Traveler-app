/**
 * Záložka Plán – „jak to pojedeme".
 *
 * Tři karty, každá odpovídá na jednu otázku (přejmenováno v srpnu 2026,
 * inspirace knihovnou tras v Mapy.cz – ne kopie):
 *
 *   Na cestě   „jak nám to jede"     – probíhající cesta + archiv po letech
 *   Výpravy    „které plány mám"     – knihovna: složky, výpravy, zakládání
 *   Itinerář   „jak to pojedeme"     – VŠECHNO o otevřené výpravě: dny,
 *                                      zastávky, bloky, akce i čísla se srovnáním
 *
 * ŽÁDNÝ VĚČNĚ VYBRANÝ PLÁN NAHOŘE: dřív visel název aktivní výpravy jako
 * titulek nade všemi kartami a výběr plánu byl na dvou místech dvěma
 * mechanikami. Teď se plán vybírá jedině v knihovně – ťuknutí ho otevře
 * v Itineráři. „Otevřená" výprava je datově pořád ta aktivní (`store.plan`
 * řídí mapu, Domů i vyjetí), jen se ten pojem už nikam nepíše.
 *
 * NAVIGAČNÍ TLAČÍTKA (`#planNav`, `#planNavApple`, `#planNavWaze`) se přesunula
 * do vysouvací nabídky, ale **zůstala synchronní**: okno se otevírá přímo
 * v obsluze kliknutí. Prohlížeče blokují `window.open`, které nepřijde rovnou
 * z gesta uživatele, a `parity` na tom stojí.
 */

import { S, store, save, prefs, savePrefs, PHOTOS } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { dkm, fmtKm } from '../../core/geo.js'
import { KAT } from '../../data/categories.js'
import { obrazekMista } from '../../data/kategorieFoto.js'
import { IC } from '../../icons/sprite.js'
import { toast } from '../../components/toast.js'
import { potvrd, zadej, vyberZeSeznamu } from '../../components/dialog.js'
import { sekce, segment, ikonBtn } from '../../components/vzory.js'
import { otevriVyber } from '../../components/vyberMista.js'
import { goTo, draw, mapa, priblizNaFiltr, vyberBod } from '../../map/map.js'
import { aktivujZalozku } from '../../core/router.js'
import { stahniSoubor } from '../../core/csv.js'
import { dnyPlanu, pridejDen, presunDoDne, zrusDny, nastavDny } from './dny.js'
import { gpxZPlanu, nazevSouboru } from './gpx.js'
import {
  seznamVyprav, seznamSlozek, prepniVypravu, novaVyprava, novaSlozka, prejmenujSlozku,
  smazSlozku, presunVypravu, prejmenuj, smaz, duplikuj, BEZ_NAZVU,
} from './vypravy.js'
import {
  cestaHtml, napojCestu, jedeSe, vyjed, zamcenaCestaHtml, napojZamcenouCestu, vychoziBod,
} from './cesta.js'
import { zastavSledovani } from './cesta-zivot.js'
import {
  blokyDneHtml, pridatBlokHtml, napojBloky, rozpocetCelkem, blokHtml, blok, bloky,
  vsechnyBody, pridejBod, hledejAdresu, rozpoznejSouradnice, DRUHY, souradniceBodu,
  maBod, pridejStartCil,
} from './bloky.js'
import { zjistiPolohuJednorazove } from '../../core/geo.js'
import { ulozenePozice } from '../../core/pozice.js'
import { prepocitejTrasu, otiskBodu } from './routing.js'
import { serazenaTrasa } from './body.js'
import { archivRadkyHtml, napojArchivRadky } from './archiv.js'
import { cislaPlanuHtml, napojCislaPlanu } from './prehled.js'
import { kosik, kotvy, pridejDoKosiku } from './kosik.js'
import { kosikHtml, napojKosik, zavriMapuKosiku } from './kosikView.js'
import { dashboardHtml, pocasiDne } from './dashboard.js'
import { termin, nastavTermin, datumDne, kratkeDatum, nactiPocasi } from './termin.js'
import { zahodKosikVrstvu } from '../../map/kosikVrstva.js'
import { token } from '../../core/barvy.js'
import L from 'leaflet'

/** Kolik zastávek unese odkaz do Google Maps. */
const MAX_DO_NAVIGACE = 10
/** Silnice bývá delší než vzdušná čára. Hrubý, ale osvědčený koeficient. */
const KLIKATOST = 1.35
/** Průměrná rychlost pro odhad času za volantem. */
const KMH = 62

/**
 * Který díl segmentu je vidět. Jen v paměti; po restartu se začíná kartou
 * Na cestě, když se zrovna jede – kdo je na cestě, chce odznačovat, ne
 * plánovat. Jinak knihovnou Výpravy: ta je vstupní bod ke všemu ostatnímu.
 */
let dil = ''
const vychoziDil = () => (jedeSe() ? 'cesta' : 'vypravy')
/** Která zastávka má rozbalené ovládání pod sebou. */
let rozbaleno = ''
/** Sbalené dny (čísla od jedničky). Jen v paměti. */
const sbaleneDny = new Set()
/** Co má v knihovně rozbalené akce: 'v' + index výpravy, 's' + název složky. */
let rozbalenoVKnihovne = ''
/** Sbalené složky si pamatuje prefs – přežijí restart. Zápis až při ťuknutí. */
const sbaleneSlozky = () => new Set(Array.isArray(prefs.sbaleneSlozky) ? prefs.sbaleneSlozky : [])
const prepniSbaleni = (nazev) => {
  const mn = sbaleneSlozky()
  mn.has(nazev) ? mn.delete(nazev) : mn.add(nazev)
  prefs.sbaleneSlozky = [...mn]
  savePrefs()
}

/** Přidá nebo odebere místo z plánu. */
export function togglePlan(id) {
  const i = store.plan.indexOf(id)
  if (i >= 0) {
    store.plan.splice(i, 1)
    toast('Odebráno z plánu')
  } else {
    store.plan.push(id)
    toast('Přidáno do plánu')
  }
  save()
  draw()
}

/** Vzdušné kilometry, odhad po silnici a čas za volantem. */
export function planStats(items) {
  let d = 0
  for (let i = 1; i < items.length; i++) d += dkm(items[i - 1], items[i])
  const road = d * KLIKATOST
  return { air: d, road, hrs: road / KMH }
}

/**
 * Kolik zastávek je odškrtnutých a kolik kilometrů zbývá.
 *
 * „Zbývá“ je součet úseků, jejichž CÍLOVÁ zastávka ještě není navštívená.
 * Definice, která funguje i tehdy, když se odškrtává na přeskáčku – a to se
 * na cestě stane pokaždé, když se něco vynechá.
 */
export function prubehVypravy(items) {
  const hotovo = items.filter((p) => store.stav[p.id] === 'visited').length
  let zbyva = 0
  for (let i = 1; i < items.length; i++) {
    if (store.stav[items[i].id] !== 'visited') zbyva += dkm(items[i - 1], items[i]) * KLIKATOST
  }
  return { hotovo, celkem: items.length, zbyva }
}

/** Čas za volantem pro člověka. */
function fmtCas(hrs) {
  if (hrs < 1) return `${Math.round(hrs * 60)} min`
  const h = Math.floor(hrs)
  const m = Math.round((hrs - h) * 60)
  return m ? `${h} h ${m} min` : `${h} h`
}

// Nula skloňuje jako pět a víc: „0 výprav", ne „0 výpravy".
export const sklonuj = (n, a, b, c) => (n === 1 ? a : n >= 2 && n < 5 ? b : c)

/* ================= vykreslení ================= */

export function renderPlan() {
  const wrap = document.getElementById('planWrap')
  if (!wrap) return

  const items = store.plan.map((id) => S.byId[id]).filter(Boolean)
  const dny = dnyPlanu()

  const pc = document.getElementById('planCount')
  pc.hidden = !items.length
  pc.textContent = items.length

  if (!dil) dil = vychoziDil()

  // Živé sledování polohy (cesta-zivot.js) smí běžet jen na téhle konkrétní
  // kartě – jakmile appka opustí "Na cestě" (i uvnitř Plánu, i na jinou
  // hlavní záložku), sledování se zastaví. napojCestu() ho níž zase
  // spustí, pokud je dil==='cesta'.
  if (dil !== 'cesta') zastavSledovani()

  wrap.innerHTML =
    segment(
      // TŘI ZÁLOŽKY PODLE ČASU, ne podle funkce (srpen 2026). Do teď se
      // dělilo na Na cestě · Výpravy · Itinerář · Košík, tedy podle toho, CO
      // s plánem děláš. Člověk ale přemýšlí v čase: jedu, chystám se, mám za
      // sebou. Itinerář a Košík proto zmizely ze segmentu – nejsou to
      // samostatné obrazovky, ale části JEDNÉ konkrétní cesty a otevírají se
      // z jejího dashboardu.
      [
        // Tečka u Na cestě říká „něco běží" – jinak by se na rozjetou
        // cestu dalo zapomenout v jiném dílu.
        { id: 'cesta', popisek: jedeSe() ? 'Na cestě ·' : 'Na cestě' },
        { id: 'vypravy', popisek: 'V plánu' },
        { id: 'archiv', popisek: 'Za námi' },
      ],
      // Itinerář a Košík jsou vnitřky výpravy, ne samostatné díly – segment
      // je proto zvýrazní jako „V plánu". Bez toho nesvítilo nic a vypadalo
      // to, že aplikace na ťuknutí vůbec nezareagovala.
      dil === 'itinerar' || dil === 'kosik' ? 'vypravy' : dil,
      'planSegment'
    ) +
    (dil === 'itinerar' || dil === 'kosik' ? drobeckyHtml() : '') +
    (dil === 'cesta'
      ? cestaHtml()
      : dil === 'vypravy'
        ? knihovna()
        : dil === 'archiv'
          ? archivHtml()
          : dil === 'kosik'
            ? kosikHtml(vychoziBod())
            : kartaItinerare(items, dny)) +
    (dil === 'itinerar' && S.otevrenaCesta == null ? lista(items) : '')

  napoj(wrap, items)
  if (dil === 'kosik') napojKosik(wrap, renderPlan)
  if (dil === 'cesta') napojCestu(wrap, renderPlan)
  if (dil === 'archiv')
    // JEDNO ŤUKNUTÍ OTEVŘE, na rozdíl od knihovny Výprav. Tam ťuknutí výpravu
    // jen aktivuje na mapě, protože se z ní ještě pojede. Ukončená cesta se
    // chodí PROHLÍŽET – dvojí ťuknutí (nejdřív na mapu, pak otevřít) by nikdo
    // neuhodl. Na mapu se stejně vykreslí, `S.otevrenaCesta` řídí obojí.
    // `null` znamená jen rozbalení roku – tam se překresluje.
    napojArchivRadky(wrap, (i) => {
      if (i === null) return renderPlan()
      S.otevrenaCesta = i
      dil = 'itinerar'
      draw()
      renderPlan()
    })
  if (dil === 'vypravy') {
    napojKnihovnu(wrap)
    napojTahaniKnihovny(wrap)
  }
  if (dil === 'itinerar') {
    if (S.otevrenaCesta != null && store.cesty[S.otevrenaCesta]) {
      napojZamcenouCestu(wrap, renderPlan, S.otevrenaCesta)
    } else {
      napojCislaPlanu(wrap, renderPlan)
      // Překresluje se přes draw(), ne jen renderPlan(): vlastní místa mění
      // trasu i špendlíky na mapě a ta by jinak zůstala stará.
      napojBloky(wrap, draw, (cb) => vyberBod(cb))
      for (const b of wrap.querySelectorAll('[data-act="sbal-den"]')) {
        b.onclick = (e) => {
          e.stopPropagation()
          const den = Number(b.dataset.den)
          sbaleneDny.has(den) ? sbaleneDny.delete(den) : sbaleneDny.add(den)
          renderPlan()
        }
      }
    }
  }
}

/**
 * Otevře Itinerář otevřené výpravy. Vstup zvenku: karta výpravy na Domů
 * a Mapě, průvodce a výběr míst na mapě – všude tam člověk právě sáhl na
 * konkrétní plán a chce ho vidět, ne knihovnu.
 */
export function otevriItinerar() {
  dil = 'itinerar'
  S.otevrenaCesta = null
  aktivujZalozku('plan')
  renderPlan()
}

/**
 * Hlavička Itineráře. Od srpna 2026 je to dashboard cesty (dashboard.js):
 * jméno, tři čísla a kostra dnů s kotvami. Šedý řádek textu, který tu byl
 * do teď, neodpovídal na jedinou otázku, kterou si člověk nad plánem klade.
 */
function hlava(items, dny) {
  return dashboardHtml(items, dny, planStats(items))
}

/**
 * Řádek „kde jsem a jak zpátky" nad Itinerářem a Košíkem.
 *
 * Obojí je vnitřek jedné výpravy, ne díl segmentu – bez tohohle řádku nebylo
 * z obrazovky poznat, kde člověk je, ani jak se dostat ven. Segment nesvítil
 * a vypadalo to, že appka nereaguje.
 */
function drobeckyHtml() {
  const nazev = S.otevrenaCesta != null && store.cesty[S.otevrenaCesta]
    ? store.cesty[S.otevrenaCesta].nazev
    : store.vypravaNazev || BEZ_NAZVU
  return `<div class="drobecky">
    <button class="drobecky-zpet" id="planZpet">${IC('i-sipka')}Zpět na výpravy</button>
    <span class="drobecky-kde">${esc(nazev)}<b>${dil === 'kosik' ? 'Košík' : 'Itinerář'}</b></span>
  </div>`
}

/* ---------- Výpravy (knihovna) ---------- */

/** Jeden řádek výpravy v knihovně. */
function radekVypravy(v) {
  const km = planStats(v.plan.map((id) => S.byId[id]).filter(Boolean)).road
  const dnu = (v.planDny || []).filter((d) => d > 0).length || 1
  const meta =
    `${v.plan.length} ${sklonuj(v.plan.length, 'zastávka', 'zastávky', 'zastávek')}` +
    (v.plan.length > 1 ? ` · ${dnu} ${sklonuj(dnu, 'den', 'dny', 'dní')} · ${fmtKm(km)}` : '')

  const naMape = v.aktivni && S.otevrenaCesta == null
  return (
    `<div class="vypravaradek${v.aktivni ? ' on' : ''}" data-vyprava="${v.index}">
      ${IC(v.aktivni ? 'i-route' : 'i-map')}
      <div>
        <b>${esc(v.nazev)}</b>
        <span>${meta}</span>
      </div>
      ${naMape ? `<i title="Tahle výprava je vidět na mapě">na mapě</i>` : ''}
      <button class="ikonbtn vyprava-vice" data-vyprava-vice title="Co s touhle výpravou">${IC('i-vice')}</button>
    </div>` + (rozbalenoVKnihovne === `v${v.index}` ? akceVypravy(v) : '')
  )
}

/** Rozbalené akce pod řádkem výpravy. Otevření Itineráře je jen tady. */
function akceVypravy(v) {
  return `<div class="vyprava-akce" data-pro="${v.index}">
    <div class="btnrow" style="margin:0">
      <button class="btn small primary" data-act="v-otevrit">${IC('i-route')}Otevřít itinerář</button>
      <button class="btn small" data-act="v-prejmenovat">${IC('i-quill')}Přejmenovat</button>
      <button class="btn small" data-act="v-duplikovat">${IC('i-copy')}Duplikovat</button>
      <button class="btn small" data-act="v-slozka">${IC('i-slozka')}${v.slozka ? esc(v.slozka) : 'Bez složky'}</button>
      <button class="btn small nebezpecne" data-act="v-smazat">${IC('i-x')}Smazat</button>
    </div>
  </div>`
}

/** Hlavička složky: sbalitelná, s počtem a vlastní nabídkou. */
function hlavickaSlozky(s) {
  const sbalena = sbaleneSlozky().has(s.slozka)
  return (
    `<div class="slozka-radek${sbalena ? ' sbalena' : ''}" data-slozka="${esc(s.slozka)}">
      ${IC('i-slozka')}
      <b>${esc(s.slozka)}</b>
      <span class="slozka-pocet">${s.vypravy.length} ${sklonuj(s.vypravy.length, 'výprava', 'výpravy', 'výprav')}</span>
      <button class="ikonbtn" data-slozka-vice title="Co s touhle složkou">${IC('i-vice')}</button>
      <span class="slozka-sipka">${IC('i-down')}</span>
    </div>` +
    (rozbalenoVKnihovne === `s${s.slozka}`
      ? `<div class="vyprava-akce" data-akce-slozky="${esc(s.slozka)}">
          <div class="btnrow" style="margin:0">
            <button class="btn small" data-act="s-prejmenovat">${IC('i-quill')}Přejmenovat složku</button>
            <button class="btn small" data-act="s-smazat">${IC('i-x')}Smazat složku</button>
          </div>
        </div>`
      : '')
  )
}

/**
 * Knihovna výprav: složky jako sbalitelné skupiny, nezařazené nakonec.
 * Žádný připnutý aktivní plán – ťuknutí na výpravu ji otevře v Itineráři.
 */
function knihovna() {
  const vypravy = seznamVyprav()

  if (!vypravy.length)
    return `<div class="empty">${IC('i-van')}Zatím tu není žádná výprava.
      Založ si první – zastávky do ní pak přidáš v Itineráři, z Objevuj nebo výběrem z mapy.
      <div class="btnrow" style="justify-content:center;margin-bottom:0">
        <button class="btn small primary" id="vypNova">${IC('i-plus')}Nová výprava</button>
      </div></div>`

  const skupiny = seznamSlozek()
  const maSlozky = skupiny.some((s) => s.slozka)

  const casti = []
  for (const s of skupiny) {
    if (s.slozka) {
      casti.push(hlavickaSlozky(s))
      if (!sbaleneSlozky().has(s.slozka))
        casti.push(`<div class="slozka-obsah" data-slozka="${esc(s.slozka)}">${
          s.vypravy.map(radekVypravy).join('') ||
          `<div class="meta slozka-prazdna">Zatím prázdná – výpravu sem přetáhni, nebo ji zařaď přes „…".</div>`
        }</div>`)
    } else {
      const kus = s.vypravy.map(radekVypravy).join('')
      casti.push(maSlozky ? `<div class="sekce"><span class="sekce-text">Nezařazené</span></div>${kus}` : kus)
    }
  }

  return (
    sekce('Moje výpravy', { pozn: `${vypravy.length} ${sklonuj(vypravy.length, 'výprava', 'výpravy', 'výprav')}` }) +
    `<div class="vypravy">${casti.join('')}</div>
    <div class="btnrow knihovna-pridat">
      <button class="ghostbtn" id="vypNova">${IC('i-plus')}Nová výprava</button>
      <button class="ghostbtn" id="slozkaNova">${IC('i-slozka')}Nová složka</button>
    </div>`
    // Ukončené cesty tu odsud odešly do vlastní záložky „Za námi" (srpen 2026).
    // Knihovna odpovídá na „kam se chystáme", archiv na „kde jsme byli“ –
    // dvě různé otázky nepatří na jednu obrazovku.
  )
}

/**
 * Záložka „Za námi" – ukončené cesty po letech.
 *
 * Do teď to byla sekce dole v knihovně Výprav, kam se muselo doscrollovat
 * přes všechny plánované výpravy. Vzpomínky jsou přitom to, k čemu se člověk
 * vrací nejčastěji.
 */
function archivHtml() {
  if (!store.cesty.length) {
    return `<div class="cesta-prazdno">
      ${IC('i-kalendar')}
      <h3>Zatím jsme nikde nebyli</h3>
      <p>Až první cestu ukončíš, uloží se sem i se všemi zastávkami,
         poznámkami a čísly. Nic se neztratí.</p>
    </div>`
  }
  return archivRadkyHtml()
}

/** Obsluha knihovny: otevírání, sbalování složek, akce řádků. */
function napojKnihovnu(wrap) {
  for (const r of wrap.querySelectorAll('.vypravaradek[data-vyprava]')) {
    const i = Number(r.dataset.vyprava)
    // Ťuknutí NEotevírá Itinerář – jen přepne, co je vidět na mapě.
    r.onclick = () => {
      if (i < 0) return
      S.otevrenaCesta = null
      prepniVypravu(i)
      draw()
      toast(`Na mapě: ${store.vypravaNazev || BEZ_NAZVU}`)
    }
    const vice = r.querySelector('[data-vyprava-vice]')
    if (vice)
      vice.onclick = (e) => {
        e.stopPropagation()
        rozbalenoVKnihovne = rozbalenoVKnihovne === `v${i}` ? '' : `v${i}`
        renderPlan()
      }
  }

  for (const akce of wrap.querySelectorAll('[data-pro]')) {
    const i = Number(akce.dataset.pro)
    const zaznam = () => seznamVyprav().find((x) => x.index === i)
    akce.querySelector('[data-act="v-otevrit"]').onclick = () => {
      rozbalenoVKnihovne = ''
      dil = 'itinerar'
      S.otevrenaCesta = null
      if (i >= 0) prepniVypravu(i)
      draw()
    }
    akce.querySelector('[data-act="v-duplikovat"]').onclick = () => {
      const novy = duplikuj(i)
      if (novy) toast(`Kopie založená: ${novy}`)
      renderPlan()
    }
    akce.querySelector('[data-act="v-slozka"]').onclick = async () => {
      const v = zaznam()
      const polozky = [
        { id: '', popisek: 'Bez složky', ikona: 'i-x', on: !(v && v.slozka) },
        ...seznamSlozek()
          .map((s) => s.slozka)
          .filter(Boolean)
          .map((n) => ({ id: n, popisek: n, ikona: 'i-slozka', on: !!v && v.slozka === n })),
        { id: '+', popisek: 'Nová složka…', ikona: 'i-plus' },
      ]
      let cil = await vyberZeSeznamu({ nadpis: 'Do které složky?', polozky })
      if (cil === null) return
      if (cil === '+') {
        const n = await zadej({ nadpis: 'Nová složka', placeholder: 'třeba Léto 2027' })
        if (n === null || !n.trim()) return
        cil = n.trim()
      }
      presunVypravu(i, cil)
      renderPlan()
    }
    akce.querySelector('[data-act="v-prejmenovat"]').onclick = async () => {
      const v = zaznam()
      const n = await zadej({ nadpis: 'Přejmenovat výpravu', vychozi: v ? v.nazev : '' })
      if (n === null) return
      prejmenuj(i, n)
      renderPlan()
    }
    akce.querySelector('[data-act="v-smazat"]').onclick = async () => {
      const v = zaznam()
      const dal = await potvrd({
        nadpis: `Smazat výpravu „${v ? v.nazev : ''}"?`,
        text: 'Smaže se i se zastávkami a rozdělením na dny.',
        ano: 'Smazat',
        nebezpecne: true,
      })
      if (!dal) return
      rozbalenoVKnihovne = ''
      smaz(i)
      draw()
      toast('Výprava smazána')
    }
  }

  for (const h of wrap.querySelectorAll('.slozka-radek')) {
    const nazev = h.dataset.slozka
    h.onclick = () => {
      prepniSbaleni(nazev)
      renderPlan()
    }
    const vice = h.querySelector('[data-slozka-vice]')
    if (vice)
      vice.onclick = (e) => {
        e.stopPropagation()
        rozbalenoVKnihovne = rozbalenoVKnihovne === `s${nazev}` ? '' : `s${nazev}`
        renderPlan()
      }
  }

  for (const akce of wrap.querySelectorAll('[data-akce-slozky]')) {
    const nazev = akce.dataset.akceSlozky
    akce.querySelector('[data-act="s-prejmenovat"]').onclick = async () => {
      const n = await zadej({ nadpis: 'Přejmenovat složku', vychozi: nazev })
      if (n === null || !n.trim()) return
      rozbalenoVKnihovne = ''
      prejmenujSlozku(nazev, n)
      renderPlan()
    }
    akce.querySelector('[data-act="s-smazat"]').onclick = async () => {
      const dal = await potvrd({
        nadpis: `Smazat složku „${nazev}"?`,
        text: 'Výpravy v ní zůstanou, jen spadnou mezi nezařazené.',
        ano: 'Smazat složku',
        nebezpecne: true,
      })
      if (!dal) return
      rozbalenoVKnihovne = ''
      smazSlozku(nazev)
      renderPlan()
    }
  }

  const slozkaBtn = document.getElementById('slozkaNova')
  if (slozkaBtn)
    slozkaBtn.onclick = async () => {
      const n = await zadej({ nadpis: 'Nová složka', placeholder: 'třeba Léto 2027' })
      if (n === null || !n.trim()) return
      novaSlozka(n)
      renderPlan()
    }

  // Ukončené cesty: ťuknutí aktivuje na mapě, jako výprava – jen z nich
  // nejde vyjet. Tap na už aktivní nic nedělá (stejná symetrie jako výprava).
  napojArchivRadky(wrap, (i) => {
    if (i === null) return renderPlan()
    if (S.otevrenaCesta === i) return
    S.otevrenaCesta = i
    draw()
    toast(`Na mapě: ${store.cesty[i].nazev}`)
  })
}

/**
 * Tažení v knihovně – dlouhé podržení (srpen 2026).
 *
 * Řádek výpravy se po ~0,35 s podržení zvedne a jde za prstem; puštění nad
 * složkou (hlavičkou i obsahem, klidně sbalenou) výpravu přesune přes
 * `presunVypravu`. Hlavička složky se tažením řadí – přeskládá `store.slozky`.
 * Rychlé třídění přes pilulky v akcích řádku zůstává, tažení je druhá cesta.
 *
 * BEZ `touch-action: none` na řádcích – ty musí dál rolovat seznam. Posun
 * stránky se blokuje až PO zvednutí nepasivním `touchmove` s preventDefault;
 * pohyb před zvednutím dlouhé podržení zruší a nechá prst rolovat. Zvednutý
 * prvek má `pointer-events: none`, aby `elementFromPoint` viděl cíl pod ním.
 */
function napojTahaniKnihovny(wrap) {
  const rolovac = document.querySelector('#panelPlan .inner')
  const zrusCil = () => {
    for (const el of wrap.querySelectorAll('.drop-cil')) el.classList.remove('drop-cil')
  }

  /** Dlouhé podržení: zvedni → behem(ev, dy) → poloz(ev | null při zrušení). */
  const dlouze = (el, { smiZacit, zvedni, behem, poloz }) => {
    el.onpointerdown = (e) => {
      if (e.button) return
      if (smiZacit && !smiZacit(e)) return
      const y0 = e.clientY
      const x0 = e.clientX
      let zvednuto = false
      let posledniY = y0
      let rafId = 0
      const blokujScroll = (te) => te.preventDefault()

      const krokRolovani = () => {
        const OKRAJ = 70
        let dy = 0
        if (posledniY < OKRAJ + 60) dy = -Math.ceil((OKRAJ + 60 - posledniY) / 6)
        else if (posledniY > window.innerHeight - OKRAJ) dy = Math.ceil((posledniY - (window.innerHeight - OKRAJ)) / 6)
        if (dy && rolovac) rolovac.scrollTop += dy
        rafId = requestAnimationFrame(krokRolovani)
      }

      const timer = setTimeout(() => {
        zvednuto = true
        el.setPointerCapture(e.pointerId)
        el.addEventListener('touchmove', blokujScroll, { passive: false })
        rafId = requestAnimationFrame(krokRolovani)
        zvedni()
      }, 350)

      const uklid = () => {
        clearTimeout(timer)
        cancelAnimationFrame(rafId)
        el.onpointermove = null
        el.onpointerup = null
        el.onpointercancel = null
        el.removeEventListener('touchmove', blokujScroll)
      }

      el.onpointermove = (ev) => {
        if (!zvednuto) {
          // Pohyb před zvednutím = rolování; tažení se nekoná.
          if (Math.abs(ev.clientY - y0) > 8 || Math.abs(ev.clientX - x0) > 8) uklid()
          return
        }
        posledniY = ev.clientY
        behem(ev, ev.clientY - y0)
      }
      el.onpointerup = (ev) => {
        const bylo = zvednuto
        uklid()
        if (!bylo) return
        poloz(ev)
        // Klik po tažení by řádek otevřel nebo složku sbalil – spolknout
        // (stejná mechanika jako v components/tah.js).
        const spolkni = (c) => {
          c.stopImmediatePropagation()
          c.preventDefault()
        }
        el.addEventListener('click', spolkni, { capture: true, once: true })
        setTimeout(() => el.removeEventListener('click', spolkni, { capture: true }), 350)
      }
      el.onpointercancel = () => {
        const bylo = zvednuto
        uklid()
        if (bylo) poloz(null)
      }
    }
  }

  /** Kam by teď výprava spadla: složka pod prstem, '' = mezi nezařazené. */
  const najdiCil = (x, y) => {
    const pod = document.elementFromPoint(x, y)
    if (!pod) return null
    const hlava = pod.closest('.slozka-radek')
    if (hlava) return { nazev: hlava.dataset.slozka, el: hlava }
    const obsah = pod.closest('.slozka-obsah')
    if (obsah) return { nazev: obsah.dataset.slozka, el: obsah }
    const oblast = pod.closest('#planWrap .vypravy')
    if (oblast) return { nazev: '', el: oblast }
    return null
  }

  for (const r of wrap.querySelectorAll('.vypravaradek[data-vyprava]')) {
    dlouze(r, {
      smiZacit: (e) => !e.target.closest('button'),
      zvedni: () => r.classList.add('tahne'),
      behem: (ev, dy) => {
        r.style.transform = `translateY(${dy}px)`
        zrusCil()
        const cil = najdiCil(ev.clientX, ev.clientY)
        if (cil && cil.el !== r) cil.el.classList.add('drop-cil')
      },
      poloz: (ev) => {
        // Cíl se hledá PŘED úklidem: shozením .tahne se řádku vrátí
        // pointer-events a cestou zpátky by ho elementFromPoint chytil
        // místo složky pod prstem.
        const cil = ev && najdiCil(ev.clientX, ev.clientY)
        r.classList.remove('tahne')
        r.style.transform = ''
        zrusCil()
        const i = Number(r.dataset.vyprava)
        if (cil) presunVypravu(i, cil.nazev)
        renderPlan()
      },
    })
  }

  for (const h of wrap.querySelectorAll('.slozka-radek')) {
    dlouze(h, {
      smiZacit: (e) => !e.target.closest('button'),
      zvedni: () => h.classList.add('tahne'),
      behem: (ev, dy) => {
        h.style.transform = `translateY(${dy}px)`
        zrusCil()
        const pod = document.elementFromPoint(ev.clientX, ev.clientY)
        const cil = pod && pod.closest('.slozka-radek')
        if (cil && cil !== h) cil.classList.add('drop-cil')
      },
      poloz: (ev) => {
        // Cíl před úklidem – stejný důvod jako u řádku výpravy.
        const pod = ev && document.elementFromPoint(ev.clientX, ev.clientY)
        const cil = pod && pod.closest('.slozka-radek')
        h.classList.remove('tahne')
        h.style.transform = ''
        zrusCil()
        if (!cil || cil === h) return renderPlan()
        const sez = store.slozky || []
        const od = sez.indexOf(h.dataset.slozka)
        const kam = sez.indexOf(cil.dataset.slozka)
        if (od < 0 || kam < 0) return renderPlan()
        sez.splice(od, 1)
        sez.splice(kam, 0, h.dataset.slozka)
        save()
        renderPlan()
      },
    })
  }
}

/* ---------- Itinerář (karta) ---------- */

/**
 * Celá karta Itinerář: hlavička, akce, dny se zastávkami a čísla výpravy.
 * Kreslí se i bez jediné výpravy – edituje se aktivní slot, který tu byl
 * odjakživa, a první zastávkou se zhmotní jako výprava i v knihovně.
 */
function kartaItinerare(items, dny) {
  if (S.otevrenaCesta != null) {
    const c = store.cesty[S.otevrenaCesta]
    if (c) return zamcenaCestaHtml(c, S.otevrenaCesta)
    // Záznam zmizel (např. stará záloha bez něj) – bezpečně spadnout na živý itinerář.
    S.otevrenaCesta = null
  }
  return hlava(items, dny) + akceItinerare(items) + itinerar(items, dny) + cislaPlanuHtml()
}

/**
 * Akce nad itinerářem. „Vyjet" je tady, ne schované na kartě Na cestě:
 * vyjíždí se z otevřeného plánu, jako se v navigaci spouští otevřená trasa.
 */
function akceItinerare(items) {
  if (!items.length) return ''
  return `<div class="btnrow itiakce">
    ${!jedeSe() ? `<button class="btn primary" id="planVyjet">${IC('i-van')}Vyjet</button>` : ''}
    <button class="btn small" id="planNaMapu">${IC('i-map')}Na mapě</button>
    ${items.length > 2 ? `<button class="btn small" id="planOpt">${IC('i-sparkles')}Optimalizovat</button>` : ''}
    <button class="btn small" id="planPrepocitat">${IC('i-route')}Přepočítat</button>
  </div>`
}

/** Prázdná výprava. Nabídne obojí, čím se dá začít. */
function prazdno() {
  return `<div class="empty">${IC('i-van')}Ve výpravě zatím nejsou žádné zastávky.
    <div class="meta" style="margin:6px 0 10px">Kam určitě pojedete, dej jako zastávku.
      Co je zatím jen nápad, ulož na potom — do košíku.</div>
    <div class="btnrow" style="justify-content:center;margin-bottom:0">
      <button class="btn small primary" id="planPridat">${IC('i-plus')}Přidat zastávku</button>
      <button class="btn small" id="planNaPotom">${IC('i-star')}Uložit na potom</button>
    </div></div>`
}

/* ---------- Itinerář ---------- */

function itinerar(items, dny) {
  if (!items.length) return prazdno()

  const vicDnu = dny.length > 1
  // Průběžné číslování napříč dny. `parity` hlídá, že „Kopírovat“ vyrobí text
  // s „1. “, „2. “ – kdyby se čísla resetovala v každém dni, přestalo by to
  // sedět, a hlavně by uživatel nevěděl, kolikátá zastávka to celkem je.
  let poradi = 0

  const telo = dny
    .map((den, di) => {
      const mista = den.map((id) => S.byId[id]).filter(Boolean)
      const sd = planStats(mista)
      const sbaleny = vicDnu && sbaleneDny.has(di + 1)
      // Přes 4 hodiny za volantem denně je makačka – ať je to vidět rovnou
      // v hlavičce dne, ne až na cestě.
      const hodin = mista.length > 1 ? (sd.road / KMH) : 0
      const hlavicka = vicDnu
        ? `<div class="denhd${sbaleny ? ' sbaleny' : ''}" data-den="${di + 1}">
            <span class="uchyt den-uchyt" data-uchyt-dne title="Táhni pro přesun celého dne">${IC('i-vice')}</span>
            ${IC('i-kalendar')}<b>Den ${di + 1}</b>
            <span>${mista.length} ${sklonuj(mista.length, 'zastávka', 'zastávky', 'zastávek')}${mista.length > 1 ? ` · ${fmtKm(sd.road)} · ${fmtCas(hodin)}` : ''}${hodin > 4 ? ' ⚠' : ''}</span>
            ${sbaleny ? '' : `<button class="ikonbtn" data-act="pridat-na-zacatek" data-den="${di + 1}" title="Přidat bod na začátek dne">${IC('i-plus')}</button>`}
            <button class="den-sbal" data-act="sbal-den" data-den="${di + 1}" title="${sbaleny ? 'Rozbalit den' : 'Sbalit den'}">${IC('i-down')}</button>
          </div>`
        : ''

      const zacatekBody = sbaleny
        ? ''
        : vsechnyBody().filter((m) => !m.po && m.den === di + 1).map(bodRadek).join('')
      const zastavkyHtml = sbaleny
        ? ''
        : mista
            .map((p, i) => {
              poradi++
              const posledniVeDni = i === mista.length - 1
              return (
                zastavka(p, poradi, i === 0 ? null : mista[i - 1], di, dny.length, posledniVeDni, poradi === items.length) +
                vsechnyBody().filter((m) => m.po === p.id).map(bodRadek).join('')
              )
            })
            .join('')
      if (sbaleny) poradi += mista.length

      const pridatBod = sbaleny
        ? ''
        : `<button class="pridatbod" data-den="${di + 1}" data-po="${mista.length ? mista[mista.length - 1].id : ''}">${IC('i-plus')}Přidat bod – start, nocleh, vlastní místo…</button>`

      return hlavicka + zacatekBody + zastavkyHtml + pridatBod + (sbaleny ? '' : blokyDneHtml(vicDnu ? di + 1 : null))
    })
    .join('')

  // Historické body bez kotvy (po i den prázdné) patří na konec plánu.
  const zbyleBody = vsechnyBody().filter((m) => !m.po && m.den == null).map(bodRadek).join('')

  const rozpocet = rozpocetCelkem()

  return (
    sekce('Itinerář – dny a zastávky', { pozn: items.length > 1 ? 'Táhni za úchyt' : '' }) +
    `<div class="itinerar" id="itinerar">${telo}${zbyleBody}</div>
    ${vicDnu ? blokyDneHtml(null) : ''}
    <button class="pridatzastavku" id="planPridat">${IC('i-plus')}Přidat zastávku</button>
    <!-- Dvě tlačítka vedle sebe vysvětlují rozdíl v okamžiku rozhodování:
         zastávka = pojedeme tam, košík = možná. Do teď se do košíku dalo
         přidat JEN z detailu místa mimo Plán, což nikdo neuhodl. -->
    <button class="pridatzastavku napotom" id="planNaPotom">${IC('i-star')}Uložit na potom</button>
    <button class="pridatzastavku dokosiku" id="planDoKosiku">${IC('i-batoh')}Košík výpravy${
      kosik().length ? ` (${kosik().length})` : ''
    }</button>
    ${pridatBlokHtml()}
    ${rozpocet ? `<div class="meta" style="margin:6px 2px">${IC('i-euro')}Rozpočet plánu celkem: <b>${rozpocet.toLocaleString('cs-CZ')} €</b></div>` : ''}` +
    (items.length > 1
      ? `<div class="btnrow" style="margin-top:10px">
          <button class="btn small" id="planDen">${IC('i-kalendar')}Přidat den</button>
          ${vicDnu ? `<button class="btn small" id="planBezDnu">Zrušit dny</button>` : ''}
        </div>`
      : '')
  )
}

/**
 * Bod trasy v itineráři – řádek ve stylu zastávky, bez fotky. Ťuknutí na
 * „…" rozbalí kartu bloku s úpravami (druh, poloha, poznámka, smazání).
 */
function bodRadek(b) {
  const d = DRUHY[b.druh] || DRUHY.vlastni
  const ma = !!souradniceBodu(b)
  return `<div class="zastavka bod${rozbaleno === b.id ? ' otevrena' : ''}${b.hotovo ? ' hotova' : ''}" data-bod="${b.id}">
    <div class="zastavka-radek">
      <span class="uchyt" data-uchyt title="Táhni pro změnu pořadí">${IC('i-vice')}</span>
      <span class="bod-znak">${IC(d.ikona)}</span>
      <div class="zastavka-text">
        <h3>${esc(b.nazev || d.popisek)}</h3>
        <div class="zastavka-pod">${d.popisek}${ma ? '' : ' <span class="tecka">•</span> bez polohy'}</div>
        ${b.poznamka ? `<div class="zastavka-meta">${esc(b.poznamka)}</div>` : ''}
      </div>
      <button class="zastavka-vice" data-act="bod-upravit" title="Upravit bod">${IC('i-vice')}</button>
    </div>
    ${rozbaleno === b.id ? blokHtml(b) : ''}
  </div>`
}

/**
 * Průvodce založením bodu: druh → název → poloha. Jednoduchá cesta jsou tři
 * ťuknutí (druh, odklepnout název, mapa); podrobnosti se doladí v kartě bodu.
 * @param {number} den  číslo dne od 1
 * @param {string|null} po  id zastávky, za kterou bod patří (konec dne)
 */
async function pridejBodPruvodce(den, po) {
  const druh = await vyberZeSeznamu({
    nadpis: 'Jaký bod přidat?',
    // Start a cíl smí být nejvýš jeden na plán (R1) – když už existuje,
    // volba se zašedne. Úprava jde jen přes kartu existujícího bodu.
    polozky: Object.entries(DRUHY).map(([id, d]) => ({
      id, popisek: d.popisek, ikona: d.ikona,
      disabled: (id === 'start' || id === 'cil') && maBod(id),
    })),
  })
  if (druh === null) return
  const nazev = await zadej({ nadpis: 'Název bodu', vychozi: DRUHY[druh].popisek, placeholder: 'třeba Kemp u splavu' })
  if (nazev === null) return

  const jeStartCil = druh === 'start' || druh === 'cil'

  // Start/cíl se zakládají VŽDY na pevné pozici (začátek/konec plánu),
  // ne tam, kam by mířilo `den`/`po` z místa v itineráři, kde se průvodce
  // otevřel – appka je nedovolí přetáhnout jinam (viz napojTahani výš).
  const zaloz = (lat, lon, zdroj = null) => {
    const id = jeStartCil
      ? pridejStartCil(druh, { nazev: nazev.trim(), lat, lon, zdroj })
      : pridejBod({ druh, nazev: nazev.trim(), lat, lon, den: po ? null : den, po, zdroj })
    // Bez zdroje i bez souřadnic zůstává bod bez polohy – karta se rozbalí,
    // ať ji člověk hned doplní. Zdroj pozice/gps polohu má, i když `lat`
    // sem přišlo jako null (souradniceBodu() ji dotáhne živě).
    const maPolohu = zdroj != null || lat != null
    if (!maPolohu) rozbaleno = id
    toast(maPolohu ? 'Bod přidaný do itineráře' : 'Bod přidaný – poloha se doplní v jeho kartě')
    draw()
  }

  const zpusob = await vyberZeSeznamu({
    nadpis: 'Kde to je?',
    polozky: [
      { id: 'odkaz', popisek: 'Vložit odkaz nebo souřadnice', ikona: 'i-copy', meta: 'Google, Mapy.cz, GPS' },
      { id: 'adresa', popisek: 'Najít adresu', ikona: 'i-hledat', meta: 'jen online' },
      { id: 'mapa', popisek: 'Ťuknout do mapy', ikona: 'i-map' },
      ...(jeStartCil
        ? [
            { id: 'pozice', popisek: 'Uložená pozice', ikona: 'i-dum', meta: 'z profilu' },
            { id: 'poloha', popisek: 'Aktuální poloha', ikona: 'i-compass', meta: 'GPS teď' },
          ]
        : []),
      { id: 'pozdeji', popisek: 'Zatím bez polohy', ikona: 'i-clock' },
    ],
  })
  if (zpusob === null) return
  if (zpusob === 'pozdeji') return zaloz(null, null)
  if (zpusob === 'odkaz') {
    const text = await zadej({ nadpis: 'Odkaz nebo souřadnice', placeholder: 'https://maps.app… nebo 46.138, 12.435' })
    if (text === null) return
    const gps = rozpoznejSouradnice(text)
    if (!gps) {
      toast('Souřadnice se nepodařilo rozpoznat – doplň je v kartě bodu')
      return zaloz(null, null)
    }
    return zaloz(gps.lat, gps.lon)
  }
  if (zpusob === 'adresa') {
    const dotaz = await zadej({ nadpis: 'Hledat adresu', placeholder: 'Riva del Garda, kemp…' })
    if (dotaz === null || !dotaz.trim()) return
    let vysledky
    try {
      vysledky = await hledejAdresu(dotaz)
    } catch {
      toast('Hledání adresy potřebuje internet')
      return zaloz(null, null)
    }
    if (!vysledky.length) {
      toast('Adresa se nenašla – zkus to jinak, nebo ťukni do mapy')
      return zaloz(null, null)
    }
    const vyber = await vyberZeSeznamu({
      nadpis: 'Který z nich?',
      polozky: vysledky.map((v, i) => ({ id: String(i), popisek: v.popisek, ikona: 'i-pinme' })),
    })
    if (vyber === null) return zaloz(null, null)
    const v = vysledky[Number(vyber)]
    return zaloz(v.lat, v.lon)
  }
  if (zpusob === 'mapa') return vyberBod((lat, lon) => zaloz(lat, lon))
  if (zpusob === 'pozice') {
    const seznam = ulozenePozice()
    if (!seznam.length) {
      toast('V profilu zatím nemáš žádnou uloženou pozici')
      return zaloz(null, null)
    }
    const vyber = await vyberZeSeznamu({
      nadpis: 'Která pozice?',
      polozky: seznam.map((p) => ({ id: p.id, popisek: p.nazev, ikona: 'i-dum' })),
    })
    if (vyber === null) return
    return zaloz(null, null, { typ: 'pozice', id: vyber })
  }
  if (zpusob === 'poloha') {
    // JEDNORÁZOVÉ zjištění, NE watchPosition – core/geo.js zjistiPolohuJednorazove().
    toast('Zjišťuju polohu…')
    let poz
    try {
      poz = await zjistiPolohuJednorazove()
    } catch (e) {
      toast(e.message || 'Polohu se nepodařilo zjistit')
      return zaloz(null, null)
    }
    return zaloz(poz.lat, poz.lon, { typ: 'gps' })
  }
}

/**
 * Jedna zastávka v itineráři.
 *
 * Role je odvozená z pozice, ne z dat: první zastávka dne je příjezd, poslední
 * v celé výpravě cíl, poslední ve dni nocleh. Předloha má u zastávek přesně
 * tyhle popisky a jsou to jediné, které se z plánu dají poctivě odvodit.
 */
function zastavka(p, poradi, predchozi, denIdx, poctDnu, posledniVeDni, uplnePosledni) {
  const k = KAT[p.k] || {}
  const obr = obrazekMista(p, PHOTOS)
  const leg = predchozi ? dkm(predchozi, p) * KLIKATOST : 0
  const role = uplnePosledni && poradi > 1 ? 'Cíl' : !predchozi ? 'Příjezd' : posledniVeDni && poctDnu > 1 ? 'Nocleh' : 'Zastávka'

  const hotova = store.stav[p.id] === 'visited'

  return `<div class="zastavka${rozbaleno === p.id ? ' otevrena' : ''}${hotova ? ' hotova' : ''}" data-id="${p.id}" style="--pc:${k.c}">
    <div class="zastavka-radek">
      <span class="uchyt" data-uchyt title="Táhni pro změnu pořadí">${IC('i-vice')}</span>
      <img class="zastavka-obr" src="${obr.src}" alt="" loading="lazy" decoding="async"
        ${obr.zaloha ? `data-zaloha="${obr.zaloha}" onerror="this.onerror=null;this.src=this.dataset.zaloha"` : ''}
        ${obr.vyrez ? `style="object-position:${obr.vyrez}"` : ''}>
      <div class="zastavka-text">
        <h3><span class="zastavka-cislo">${poradi}</span>${esc(p.n)}</h3>
        <div class="zastavka-pod">${poctDnu > 1 ? `Den ${denIdx + 1} <span class="tecka">•</span> ` : ''}${role}</div>
        <div class="zastavka-meta">${
          predchozi ? `${fmtKm(leg)} <span class="tecka">•</span> ${fmtCas((leg / KMH) * 1)}` : esc(p.r || p.z)
        }${store.notes[p.id] ? ` <span class="tecka">•</span> ${IC('i-quill', 'font-size:12px')}poznámka` : ''}</div>
      </div>
      <button class="zastavka-hotovo${hotova ? ' on' : ''}" data-act="hotovo"
        title="${hotova ? 'Přece jsme tam nebyli' : 'Byli jsme tady'}"
        aria-label="${hotova ? 'Přece jsme tam nebyli' : 'Byli jsme tady'}">${IC('i-check')}</button>
      <button class="zastavka-vice" data-act="vice" title="Co s touhle zastávkou">${IC('i-vice')}</button>
    </div>
    <div class="zastavka-akce">
      <button class="btn small" data-act="open">${IC('i-map')}Detail</button>
      <button class="btn small" data-act="up">${IC('i-up')}Nahoru</button>
      <button class="btn small" data-act="down">${IC('i-down')}Dolů</button>
      ${poctDnu > 1 ? `<button class="btn small" data-act="denzpet">${IC('i-kalendar')}O den zpět</button>` : ''}
      ${poctDnu > 1 ? `<button class="btn small" data-act="dendal">${IC('i-kalendar')}O den dál</button>` : ''}
      <button class="btn small" data-act="rm">${IC('i-x')}Odebrat</button>
    </div>
  </div>`
}

/* ---------- spodní lišta ---------- */

function lista(items) {
  return `<div class="planlista">
    <div class="planlista-stav">${IC('i-check')}<div><b>Uloženo</b><span>Změny jsou v telefonu</span></div></div>
    <button class="btn primary" id="planDoNavigace" ${items.length ? '' : 'disabled'}>${IC('i-nav')}Odeslat do navigace</button>
  </div>`
}

/* ================= dashboard: mapa, termín, počasí ================= */

/**
 * Datum z lidského zápisu na 'YYYY-MM-DD'. Rozumí `12.8.2026`, `12. 8. 2026`
 * i `2026-08-12`. Nerozpoznané vrací '' – volající to pozná a řekne to.
 */
function naIso(text) {
  const t = (text || '').trim()
  if (!t) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(t)
  if (!m) return ''
  return `${m[3]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`
}

/**
 * Dorovná `planDny` na zadaný počet dnů. Prázdné dny jsou platný stav –
 * „jedeme na deset dní, plnit budu na poslední chvíli".
 * Existující rozdělení se NIKDY nezkracuje: to by snědlo zastávky.
 */
function pripravDny(kolik) {
  if (!kolik) return
  const ted = store.planDny || []
  if (ted.length >= kolik) return
  store.planDny = [...(ted.length ? ted : [store.plan.length]), ...Array(kolik - Math.max(1, ted.length)).fill(0)]
  save()
}

/** Vlastní instance mapy na dashboardu. Jako u košíku se uklízí při odchodu. */
let mapaDashboardu = null
let koloDashMapy = 0

export function zavriMapuDashboardu() {
  koloDashMapy++
  zahodKosikVrstvu()
  if (mapaDashboardu) {
    try {
      mapaDashboardu.remove()
    } catch {
      /* prvek zmizel s překreslením */
    }
    mapaDashboardu = null
  }
}

/**
 * Mapa nad kostrou: zastávky výpravy, kotvy a tvoje poloha.
 *
 * Textová kostra odpovídá na „kolikátý den", mapa na „kde to vlastně je" –
 * proto obojí naráz, ne jedno místo druhého.
 */
function vykresliMapuDashboardu(wrap) {
  zavriMapuDashboardu()
  const el = wrap.querySelector('#dashMapa')
  if (!el || el._leaflet_id) return

  const body = store.plan.map((id) => S.byId[id]).filter((p) => p && Number.isFinite(p.lat))
  const odkud = vychoziBod()
  if (!body.length && !odkud) {
    el.innerHTML = '<div class="meta kosik-bezmapy">Zatím není co ukázat — přidej první zastávku.</div>'
    return
  }

  const moje = ++koloDashMapy
  requestAnimationFrame(() => {
    setTimeout(() => {
      if (moje !== koloDashMapy || !document.body.contains(el) || el._leaflet_id) return
      try {
        const stred = body[0] || odkud
        mapaDashboardu = L.map(el, {
          zoomControl: false,
          attributionControl: false,
          scrollWheelZoom: false,
        }).setView([stred.lat, stred.lon], 7, { animate: false })
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(mapaDashboardu)

        if (body.length > 1) {
          // Skutečná trasa z Mapy.com Routing API (views/plan/routing.js),
          // pokud je pro TENHLE seznam bodů ještě platná – stejné pravidlo
          // jako na hlavní mapě (map/planLine.js). Otisk se počítá ze
          // serazenaTrasa() (views/plan/body.js), NE jen ze `body` (zastávky
          // bez vlastních míst) – to je přesně množina bodů, kterou
          // prepocitejTrasu() posílá do Mapy.com, takže se otisky vždy
          // shodují i u výprav s vlastním startem/noclehem/cílem. Bez toho
          // by dashboard u takových výprav navždy zůstal na fallbacku.
          const prepocet = store.aktivniPrepocet
          const platny = prepocet && prepocet.otisk === otiskBodu(serazenaTrasa())
          L.polyline(
            platny ? prepocet.polyline : body.map((p) => [p.lat, p.lon]),
            { color: token('--akcent'), weight: 3, opacity: 0.75 }
          ).addTo(mapaDashboardu)
        }
        const kotvyId = new Set(kotvy().map((k) => k.id))
        for (const p of body) {
          const jeKotva = kotvyId.has(p.id)
          L.marker([p.lat, p.lon], {
            icon: L.divIcon({
              className: 'kos-pin-obal',
              html: jeKotva
                ? `<div class="kos-pin kotva" style="--kb:${token('--rust')}">★</div>`
                : `<div class="kos-pin blizko" style="--kb:${token('--akcent')}"></div>`,
              iconSize: [jeKotva ? 34 : 26, jeKotva ? 34 : 26],
              iconAnchor: [jeKotva ? 17 : 13, jeKotva ? 17 : 13],
            }),
            zIndexOffset: jeKotva ? 1000 : 0,
          })
            .addTo(mapaDashboardu)
            .bindTooltip(p.n, { direction: 'top' })
        }
        // Vlastní body trasy (start/nocleh/cíl/vlastní z bloků) – poloviční
        // průměr běžné zastávky (.kos-pin.blizko je 20px, tohle 10px). Start
        // a cíl mají vlastní barvu (žlutá/červená), zbytek stejnou barvu jako
        // běžné zastávky – jen menší, ať je jasné, že nejde o místo z databáze.
        const vlastni = vsechnyBody()
          .map((b) => {
            const s = souradniceBodu(b)
            return s ? { ...b, lat: s.lat, lon: s.lon } : null
          })
          .filter(Boolean)
        for (const m of vlastni) {
          const barva = m.druh === 'start' ? token('--sun') : m.druh === 'cil' ? token('--upozorneni') : token('--akcent')
          L.marker([m.lat, m.lon], {
            icon: L.divIcon({
              className: 'kos-pin-obal',
              html: `<div class="kos-pin vlastni" style="--kb:${barva}"></div>`,
              iconSize: [10, 10],
              iconAnchor: [5, 5],
            }),
          })
            .addTo(mapaDashboardu)
            .bindTooltip(m.nazev || 'Vlastní místo', { direction: 'top' })
        }

        if (odkud) {
          L.marker([odkud.lat, odkud.lon], {
            icon: L.divIcon({ className: 'kos-pin-obal', html: '<div class="kos-ja"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
            zIndexOffset: 2000,
          })
            .addTo(mapaDashboardu)
            .bindTooltip('Tady jsi', { direction: 'top', offset: [0, -9] })
        }

        const vse = [...body.map((p) => [p.lat, p.lon]), ...vlastni.map((m) => [m.lat, m.lon])]
        if (odkud) vse.push([odkud.lat, odkud.lon])
        if (vse.length > 1) mapaDashboardu.fitBounds(L.latLngBounds(vse), { padding: [30, 30], maxZoom: 10, animate: false })
      } catch {
        el.innerHTML = '<div class="meta kosik-bezmapy">Mapu se nepovedlo načíst.</div>'
      }
    }, 180)
  })
}

/** Aby se počasí netahalo znovu při každém překreslení. */
let pocasiProTermin = ''

/**
 * Dotáhne předpověď pro první zastávku a rozsah termínu.
 *
 * Jen když je termín a jen jednou pro danou kombinaci – druhé (a poslední)
 * síťové volání za běhu vedle Nominatimu. Selhání je tichá: dashboard
 * funguje dál, jen bez počasí. Bez signálu v horách je to běžný stav,
 * ne chyba, kterou by bylo potřeba hlásit.
 */
function dotahniPocasi(prekresli) {
  const { od, dnu } = termin()
  const misto = store.plan.map((id) => S.byId[id]).find((p) => p && Number.isFinite(p.lat)) || vychoziBod()
  if (!od || !misto) return
  const klic = `${od}|${dnu}|${misto.lat.toFixed(2)},${misto.lon.toFixed(2)}`
  if (pocasiProTermin === klic) return
  pocasiProTermin = klic

  // Open-Meteo dává předpověď na 16 dní dopředu, dál nemá smysl se ptát.
  const konec = datumDne(Math.min(dnu || 1, 16))
  nactiPocasi(misto, od, konec)
    .then((dny) => {
      for (const d of dny) pocasiDne.set(d.datum, d)
      if (dny.length) prekresli()
    })
    .catch(() => {
      /* offline nebo služba mlčí – dashboard funguje i bez počasí */
    })
}

/* ================= obsluha ================= */

function napoj(wrap, items) {
  if (dil === 'itinerar' && S.otevrenaCesta == null) {
    vykresliMapuDashboardu(wrap)
    dotahniPocasi(renderPlan)
  }

  const terminBtn = wrap.querySelector('#terminNastav')
  if (terminBtn)
    terminBtn.onclick = async () => {
      // Dvě otázky za sebou, obě smí zůstat prázdné – termín je nepovinný
      // a prázdná odpověď ho zase zruší.
      const { od, dnu } = termin()
      const kdy = await zadej({
        nadpis: 'Kdy vyrážíme?',
        text: 'Ve tvaru 12.8.2026, nebo nech prázdné – termín je nepovinný.',
        vychozi: od ? kratkeDatum(od).replace(/\s/g, '') + new Date(od).getFullYear() : '',
        placeholder: '12.8.2026',
      })
      if (kdy === null) return
      const kolik = await zadej({
        nadpis: 'Na kolik dní?',
        text: 'Připravím ti tolik dnů v kostře. Prázdné taky stačí.',
        vychozi: dnu ? String(dnu) : '',
        placeholder: '10',
      })
      if (kolik === null) return

      const iso = naIso(kdy)
      if (kdy.trim() && !iso) return toast('Datum nerozumím – zkus třeba 12.8.2026')
      if (!nastavTermin(iso, Number(kolik) || 0)) return
      // Termín mění, kolik dnů kostra ukazuje – bez zastávek by jinak
      // zůstala prázdná i po zadání „na 10 dní".
      pripravDny(Number(kolik) || 0)
      renderPlan()
    }

  // Dlaždice dashboardu vedou tam, kde se to řeší – číslo, na které se dá
  // ťuknout, musí něco udělat, jinak vypadá jako ovládací prvek a mlčí.
  for (const b of wrap.querySelectorAll('[data-dash]')) {
    b.onclick = () => {
      if (b.dataset.dash === 'kosik') {
        dil = 'kosik'
        renderPlan()
        return
      }
      // Zastávky i volné dny žijí v itineráři pod dashboardem – stačí sjet.
      const cil = wrap.querySelector(b.dataset.dash === 'volno' ? '.kostra-den.volny' : '.zastavka')
      if (cil) cil.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  // Ťuknutí na den kostry: zatím sjede na ten den v itineráři. Průvodce
  // „naplánujme tenhle den" přijde v dalším kole (dohodnuto se zadavatelkou).
  for (const b of wrap.querySelectorAll('[data-kostra-den]')) {
    b.onclick = () => {
      const den = Number(b.dataset.kostraDen)
      const cil = wrap.querySelector(`.denhd[data-den="${den}"]`)
      if (cil) cil.scrollIntoView({ behavior: 'smooth', block: 'center' })
      else toast(`${den}. den je zatím volný`)
    }
  }

  for (const b of wrap.querySelectorAll('#planSegment button')) {
    b.onclick = () => {
      // Mapa košíku je vlastní instance Leafletu – bez úklidu by po odchodu
      // z karty zůstala viset na prvku, který zmizí překreslením.
      if (dil === 'kosik' && b.dataset.seg !== 'kosik') zavriMapuKosiku()
      if (dil === 'itinerar') zavriMapuDashboardu()
      dil = b.dataset.seg
      renderPlan()
    }
  }

  const nova = document.getElementById('vypNova')
  if (nova)
    nova.onclick = async () => {
      const nazev = await zadej({ nadpis: 'Nová výprava', text: 'Jak se bude jmenovat?', placeholder: 'třeba Jarní Alpy' })
      if (nazev === null) return
      novaVyprava(nazev)
      // Rovnou do Itineráře: nová výprava je prázdná a tam se plní.
      dil = 'itinerar'
      draw()
      toast('Nová výprava založená')
    }

  const vice = document.getElementById('planVice')
  if (vice) vice.onclick = () => prepniMenu()

  const vyjet = document.getElementById('planVyjet')
  if (vyjet)
    vyjet.onclick = () => {
      if (!vyjed()) return
      dil = 'cesta'
      toast('Šťastnou cestu!')
      draw()
    }

  const pridat = document.getElementById('planPridat')
  if (pridat)
    pridat.onclick = () =>
      otevriVyber((p) => {
        store.plan.push(p.id)
        save()
        draw()
        toast(`${p.n.split(/\s[–(]/)[0]} přidáno do plánu`)
      })

  // Totéž vybírátko jako u zastávky, jen výsledek jde do košíku. Sdílená
  // cesta je záměr: člověk vybírá stejně, mění se jen závaznost.
  const naPotom = wrap.querySelector('#planNaPotom')
  if (naPotom)
    naPotom.onclick = () =>
      otevriVyber((p) => {
        if (store.plan.includes(p.id)) return toast('Tohle místo už je v itineráři')
        if (!pridejDoKosiku(p.id)) return toast('Tohle už v košíku máš')
        toast(`${p.n.split(/\s[–(]/)[0]} uloženo na potom`)
        renderPlan()
      })

  const doKosiku = wrap.querySelector('#planDoKosiku')
  if (doKosiku)
    doKosiku.onclick = () => {
      dil = 'kosik'
      renderPlan()
    }

  const zpet = wrap.querySelector('#planZpet')
  if (zpet)
    zpet.onclick = () => {
      // Z košíku zpět do itineráře, z itineráře do knihovny – o patro výš,
      // ne rovnou ven. Mapa košíku je vlastní Leaflet, musí se uklidit.
      if (dil === 'kosik') {
        zavriMapuKosiku()
        dil = 'itinerar'
      } else {
        zavriMapuDashboardu()
        S.otevrenaCesta = null
        dil = 'vypravy'
      }
      renderPlan()
    }

  for (const b of wrap.querySelectorAll('.pridatbod'))
    b.onclick = () => pridejBodPruvodce(Number(b.dataset.den), b.dataset.po || null)

  // Malé „+“ v hlavičce dne: bod na jeho začátek, ne za poslední zastávku.
  for (const b of wrap.querySelectorAll('[data-act="pridat-na-zacatek"]'))
    b.onclick = (e) => {
      e.stopPropagation()
      pridejBodPruvodce(Number(b.dataset.den), null)
    }

  for (const r of wrap.querySelectorAll('[data-bod]')) {
    const uprav = r.querySelector('[data-act="bod-upravit"]')
    if (uprav)
      uprav.onclick = (e) => {
        e.stopPropagation()
        rozbaleno = rozbaleno === r.dataset.bod ? '' : r.dataset.bod
        renderPlan()
      }
  }

  const naMapu = document.getElementById('planNaMapu')
  if (naMapu)
    naMapu.onclick = () => {
      aktivujZalozku('map')
      priblizNaFiltr(items)
    }

  const opt = document.getElementById('planOpt')
  if (opt) opt.onclick = optimalizuj

  const prepocitat = document.getElementById('planPrepocitat')
  if (prepocitat)
    prepocitat.onclick = async () => {
      toast('Počítám trasu…')
      const v = await prepocitejTrasu()
      // Chyba appku nesmí shodit – poslední známý store.aktivniPrepocet
      // (pokud existuje) zůstává beze změny jako fallback, appka jen
      // ohlásí, že se to nepovedlo.
      toast(v.ok ? 'Trasa přepočítána' : v.chyba)
      draw()
      renderPlan()
    }

  const den = document.getElementById('planDen')
  if (den)
    den.onclick = () => {
      pridejDen()
      draw()
    }

  const bezDnu = document.getElementById('planBezDnu')
  if (bezDnu)
    bezDnu.onclick = () => {
      zrusDny()
      draw()
      toast('Dny zrušeny, zastávky zůstaly')
    }

  const doNav = document.getElementById('planDoNavigace')
  if (doNav) doNav.onclick = otevriNavigaci

  for (const z of wrap.querySelectorAll('.zastavka[data-id]')) {
    const id = z.dataset.id
    z.querySelector('[data-act=vice]').onclick = () => {
      rozbaleno = rozbaleno === id ? '' : id
      renderPlan()
    }
    // Odškrtnutí zapisuje do `store.stav` jako navštívené – tedy do téhož
    // místa, kde to má srdce v Seznamu i fajfka v detailu. Žádná druhá evidence.
    z.querySelector('[data-act=hotovo]').onclick = () => {
      if (store.stav[id] === 'visited') delete store.stav[id]
      else store.stav[id] = 'visited'
      save()
      draw()
    }
    z.querySelector('[data-act=open]').onclick = () => goTo(S.byId[id])
    z.querySelector('[data-act=rm]').onclick = () => togglePlan(id)
    z.querySelector('[data-act=up]').onclick = () => posun(id, -1)
    z.querySelector('[data-act=down]').onclick = () => posun(id, 1)
    const zpet = z.querySelector('[data-act=denzpet]')
    if (zpet)
      zpet.onclick = () => {
        presunDoDne(id, -1)
        draw()
      }
    const dal = z.querySelector('[data-act=dendal]')
    if (dal)
      dal.onclick = () => {
        presunDoDne(id, 1)
        draw()
      }
  }

  napojTahani(wrap)
  napojNavigaci()
}

/** Posune zastávku o jedno místo nahoru (−1) nebo dolů (+1). */
function posun(id, smer) {
  const i = store.plan.indexOf(id)
  const j = i + smer
  if (i < 0 || j < 0 || j > store.plan.length - 1) return
  ;[store.plan[j], store.plan[i]] = [store.plan[i], store.plan[j]]
  save()
  draw()
}

/**
 * Tažení v itineráři – zastávky jednotlivě, dny jako celé skupiny.
 *
 * Ukazatelové události, ne HTML5 drag-and-drop: ten na mobilu nefunguje.
 * Tažené jde za prstem, sousedi se ROZESTUPUJÍ (transform, žádné
 * překreslování během tažení). U okraje obrazovky se seznam sám roluje.
 *
 * DVOJÍ AKTIVACE (srpen 2026): úchyt „⋮" zvedá OKAMŽITĚ – je malý, ale bez
 * čekání. Dlouhé podržení (~0,35 s) kdekoli na řádku nebo hlavičce dne zvedá
 * taky – velká plocha pro palec. Krátký tah mimo úchyt dál roluje stránku;
 * posun se blokuje až po zvednutí nepasivním touchmove (vzor z knihovny).
 *
 * DEN SE TÁHNE CELÝ: hlavička + zastávky + bloky jako jedna skupina, ostatní
 * dny uhýbají o výšku celé skupiny. Dřív se táhly jen hlavičky mezi sebou
 * a obsah stál na místě – vypadalo to rozbitě. Zápis dělení jde výhradně
 * přes `nastavDny()`, které odmítne rozdělení s nesedícím součtem.
 */
function napojTahani(wrap) {
  const seznam = wrap.querySelector('#itinerar')
  if (!seznam) return
  const rolovac = document.querySelector('#panelPlan .inner')
  const MEZERA = 8

  /** Svislý posun, který na prvku zrovna je (z uhýbání sousedů). */
  const aplikovanyPosun = (el) => {
    const m = /translateY\((-?[\d.]+)px\)/.exec(el.style.transform || '')
    return m ? Number(m[1]) : 0
  }

  /**
   * Jádro tažení nad skupinami. Skupina = { prvky: [el, …] } – zastávka je
   * skupina o jednom prvku, den o hlavičce a celém obsahu.
   */
  const zahaj = (drzak, e, skupiny, ja, poDrop, poUklidu) => {
    const y0 = e.clientY
    let posledniY = y0
    let rafId = 0
    const vyska = ja.prvky.reduce((a, p) => a + p.offsetHeight + MEZERA, 0)
    const start = skupiny.indexOf(ja)
    let cil = start
    for (const p of ja.prvky) p.classList.add('tahne')

    const prekresliPosuny = () => {
      skupiny.forEach((sk, i) => {
        if (sk === ja) return
        let posun = 0
        if (start < cil && i > start && i <= cil) posun = -vyska
        else if (start > cil && i >= cil && i < start) posun = vyska
        for (const p of sk.prvky) p.style.transform = posun ? `translateY(${posun}px)` : ''
      })
    }

    const krokRolovani = () => {
      // Autoscroll u okrajů: rychlost roste s blízkostí k okraji.
      const OKRAJ = 70
      let dy = 0
      if (posledniY < OKRAJ + 60) dy = -Math.ceil((OKRAJ + 60 - posledniY) / 6)
      else if (posledniY > window.innerHeight - OKRAJ) dy = Math.ceil((posledniY - (window.innerHeight - OKRAJ)) / 6)
      if (dy && rolovac) rolovac.scrollTop += dy
      rafId = requestAnimationFrame(krokRolovani)
    }
    rafId = requestAnimationFrame(krokRolovani)

    drzak.onpointermove = (ev) => {
      posledniY = ev.clientY
      for (const p of ja.prvky) p.style.transform = `translateY(${ev.clientY - y0}px)`
      // Cíl podle středů OSTATNÍCH skupin v PŮVODNÍ poloze – uhnutí se odečítá.
      let novy = 0
      for (const sk of skupiny) {
        if (sk === ja) continue
        const prvni = sk.prvky[0].getBoundingClientRect()
        const posledni = sk.prvky[sk.prvky.length - 1].getBoundingClientRect()
        const stred = (prvni.top + posledni.bottom) / 2 - aplikovanyPosun(sk.prvky[0])
        if (ev.clientY > stred) novy++
      }
      cil = Math.max(0, Math.min(skupiny.length - 1, novy))
      prekresliPosuny()
    }

    const konec = (spolknoutKlik) => {
      drzak.onpointermove = null
      drzak.onpointerup = null
      drzak.onpointercancel = null
      cancelAnimationFrame(rafId)
      if (poUklidu) poUklidu()
      for (const p of ja.prvky) p.classList.remove('tahne')
      for (const sk of skupiny) for (const p of sk.prvky) p.style.transform = ''
      if (spolknoutKlik) {
        // Klik po tažení by ťukl do tlačítka pod prstem – spolknout
        // (stejná mechanika jako v components/tah.js).
        const spolkni = (c) => {
          c.stopImmediatePropagation()
          c.preventDefault()
        }
        drzak.addEventListener('click', spolkni, { capture: true, once: true })
        setTimeout(() => drzak.removeEventListener('click', spolkni, { capture: true }), 350)
      }
      if (cil !== start) poDrop(start, cil)
    }
    drzak.onpointerup = () => konec(true)
    drzak.onpointercancel = () => konec(false)
  }

  /**
   * Dvojí aktivace: úchyt zvedá hned, dlouhé podržení plochy taky.
   * Plocha nesmí mít touch-action:none – krátký tah musí dál rolovat.
   */
  const pripoj = (skupiny, ja, uchyt, plocha, poDrop) => {
    if (uchyt) {
      uchyt.style.touchAction = 'none'
      uchyt.onpointerdown = (e) => {
        if (e.button) return
        e.preventDefault()
        uchyt.setPointerCapture(e.pointerId)
        zahaj(uchyt, e, skupiny, ja, poDrop)
      }
    }
    plocha.onpointerdown = (e) => {
      if (e.button || e.target.closest('button') || e.target.closest('[data-uchyt], [data-uchyt-dne]')) return
      const x0 = e.clientX
      const y0 = e.clientY
      let zvednuto = false
      const blokujScroll = (te) => te.preventDefault()
      const timer = setTimeout(() => {
        zvednuto = true
        plocha.setPointerCapture(e.pointerId)
        plocha.addEventListener('touchmove', blokujScroll, { passive: false })
        zahaj(plocha, e, skupiny, ja, poDrop, () => plocha.removeEventListener('touchmove', blokujScroll))
      }, 350)
      const zrus = () => {
        clearTimeout(timer)
        if (zvednuto) return
        plocha.onpointermove = null
        plocha.onpointerup = null
        plocha.onpointercancel = null
      }
      // Pohyb před zvednutím = rolování; tažení se nekoná.
      plocha.onpointermove = (ev) => {
        if (!zvednuto && (Math.abs(ev.clientY - y0) > 8 || Math.abs(ev.clientX - x0) > 8)) zrus()
      }
      plocha.onpointerup = zrus
      plocha.onpointercancel = zrus
    }
  }

  // Zastávky a body trasy: jeden smíšený seznam napříč dny. Kotva puštění
  // je nejbližší ZASTÁVKA nad novou polohou – bod si podle ní přepíše `po`,
  // zastávka se za ni zařadí ve `store.plan`.
  const radky = [...seznam.querySelectorAll('.zastavka')]
  const radkySkupiny = radky.map((el) => ({ prvky: [el] }))
  radkySkupiny.forEach((sk, idx) => {
    const el = radky[idx]
    pripoj(radkySkupiny, sk, el.querySelector('[data-uchyt]'), el, (start, cil) => {
      const ostatni = radky.filter((r) => r !== el)
      let z = Math.min(cil, ostatni.length) - 1
      while (z >= 0 && !ostatni[z].dataset.id) z--
      const kotva = z >= 0 ? ostatni[z].dataset.id : null

      if (el.dataset.bod) {
        const b = blok(el.dataset.bod)
        if (!b) return
        // Start a cíl jsou pevně připnuté na začátek/konec plánu (R1) –
        // appka tažení za ně ignoruje, žádná změna po/den. Zakládá je jen
        // pridejStartCil() v body.js a mění jen karta bodu v Itineráři.
        if (b.druh === 'start' || b.druh === 'cil') return
        if (kotva) {
          b.po = kotva
          b.den = null
        } else {
          b.po = null
          b.den = 1
        }
        // Mezi body u stejné kotvy rozhoduje pořadí v poli – přesunutý jde
        // na konec, takže dosedne tam, kam ho člověk pustil.
        const vsech = bloky()
        const kde = vsech.findIndex((x) => x.id === b.id)
        if (kde >= 0) vsech.push(vsech.splice(kde, 1)[0])
        save()
        draw()
        return
      }

      const id = el.dataset.id
      const kde = store.plan.indexOf(id)
      if (kde < 0) return
      let kam = kotva ? store.plan.indexOf(kotva) + 1 : 0
      if (kam < 0) return
      store.plan.splice(kde, 1)
      if (kam > kde) kam--
      if (kam === kde) {
        store.plan.splice(kam, 0, id)
        return
      }
      store.plan.splice(kam, 0, id)
      save()
      draw()
    })
  })

  // Dny: skupina je hlavička + všechno pod ní až po další hlavičku.
  const dnySkupiny = []
  let aktualni = null
  for (const dite of [...seznam.children]) {
    if (dite.classList.contains('denhd')) {
      aktualni = { prvky: [dite], hlava: dite }
      dnySkupiny.push(aktualni)
    } else if (aktualni) aktualni.prvky.push(dite)
  }
  for (const sk of dnySkupiny) {
    pripoj(dnySkupiny, sk, sk.hlava.querySelector('[data-uchyt-dne]'), sk.hlava, (start, cil) => {
      const dny = dnyPlanu()
      if (start === cil || !dny[start] || !dny[cil]) return
      const poradiDnu = dny.map((_, i) => i)
      poradiDnu.splice(start, 1)
      poradiDnu.splice(cil, 0, start)
      const noveDny = poradiDnu.map((i) => dny[i])
      store.plan = noveDny.flat()
      // Zápis délek jde přes nastavDny() – odmítne rozdělení, jehož součet
      // nesedí na počet zastávek. Sbalení zůstává na stejných číslech dnů,
      // takže se po přesunu vyprázdní – obsah se přečísloval.
      nastavDny(noveDny.map((d) => d.length))
      sbaleneDny.clear()
      draw()
    })
  }
}

/** Hladové řazení: začni u nejbližšího místa a pak vždy skoč na nejbližší další. */
function optimalizuj() {
  let rest = store.plan.map((id) => S.byId[id]).filter(Boolean)
  if (rest.length < 3) return
  const start = S.userPos ? rest.reduce((a, b) => (dkm(S.userPos, a) < dkm(S.userPos, b) ? a : b)) : rest[0]
  const out = [start]
  rest = rest.filter((p) => p !== start)
  while (rest.length) {
    const last = out[out.length - 1]
    let best = rest[0]
    let bd = dkm(last, best)
    for (const p of rest) {
      const d = dkm(last, p)
      if (d < bd) {
        bd = d
        best = p
      }
    }
    out.push(best)
    rest = rest.filter((p) => p !== best)
  }
  store.plan = out.map((p) => p.id)
  save()
  draw()
  toast('Seřazeno podle nejkratší trasy')
}

/* ---------- nabídka „…" ---------- */

function prepniMenu() {
  const m = document.getElementById('planMenu')
  if (!m) return
  if (!m.hidden) {
    m.hidden = true
    return
  }

  m.innerHTML = `
    <button id="planPrejmenuj">${IC('i-quill')}Přejmenovat výpravu</button>
    <button id="planDuplikuj">${IC('i-copy')}Duplikovat výpravu</button>
    <button id="planDoSlozky">${IC('i-slozka')}Přesunout do složky</button>
    <button id="planShare">${IC('i-copy')}Kopírovat plán</button>
    ${store.plan.length > 1 ? `<button id="planOtoc">${IC('i-route')}Otočit pořadí</button>` : ''}
    <button id="planClear">${IC('i-trash')}Vyprázdnit zastávky</button>
    <button id="planSmaz">${IC('i-x')}Smazat celou výpravu</button>`
  m.hidden = false

  document.getElementById('planDuplikuj').onclick = () => {
    m.hidden = true
    const novy = duplikuj(-1)
    if (novy) toast(`Kopie založená: ${novy}`)
    renderPlan()
  }

  // Výběr složky je dialog se seznamem – pilulky by se s hodně složkami nevešly.
  document.getElementById('planDoSlozky').onclick = async () => {
    m.hidden = true
    const polozky = [
      { id: '', popisek: 'Bez složky', ikona: 'i-x', on: !store.vypravaSlozka },
      ...seznamSlozek()
        .map((s) => s.slozka)
        .filter(Boolean)
        .map((n) => ({ id: n, popisek: n, ikona: 'i-slozka', on: store.vypravaSlozka === n })),
      { id: '+', popisek: 'Nová složka…', ikona: 'i-plus' },
    ]
    let cil = await vyberZeSeznamu({ nadpis: 'Do které složky?', polozky })
    if (cil === null) return
    if (cil === '+') {
      const n = await zadej({ nadpis: 'Nová složka', placeholder: 'třeba Léto 2027' })
      if (n === null || !n.trim()) return
      cil = n.trim()
    }
    presunVypravu(-1, cil)
    toast(cil ? `Výprava je ve složce ${cil}` : 'Výprava je bez složky')
    renderPlan()
  }

  const otoc = document.getElementById('planOtoc')
  if (otoc)
    otoc.onclick = () => {
      // Otočení obrací i pořadí délek dnů – poslední den se stane prvním
      // a jeho zastávky zůstanou pohromadě.
      store.plan.reverse()
      if ((store.planDny || []).length > 1) store.planDny.reverse()
      save()
      draw()
      toast('Pořadí otočené')
    }

  document.getElementById('planPrejmenuj').onclick = async () => {
    const n = await zadej({ nadpis: 'Přejmenovat výpravu', vychozi: store.vypravaNazev || '' })
    if (n === null) return
    prejmenuj(-1, n)
    renderPlan()
  }

  document.getElementById('planShare').onclick = async () => {
    const items = store.plan.map((id) => S.byId[id]).filter(Boolean)
    const st = planStats(items)
    const t =
      `🚐 ${store.vypravaNazev || 'Plán Vandrbuch'} (${fmtKm(st.road)})\n` +
      items
        .map((p, i) => `${i + 1}. ${p.n} — ${p.lat},${p.lon}${store.notes[p.id] ? `\n   ✎ ${store.notes[p.id]}` : ''}`)
        .join('\n')
    try {
      await navigator.clipboard.writeText(t)
      toast('Plán zkopírován')
    } catch {
      zadej({ nadpis: 'Kopírovat plán', text: 'Zkopíruj ručně:', vychozi: t, ano: 'Zavřít' })
    }
  }

  document.getElementById('planClear').onclick = async () => {
    const dal = await potvrd({
      nadpis: 'Vyprázdnit zastávky?',
      text: 'Zastávky téhle výpravy se odeberou, výprava zůstane.',
      ano: 'Vyprázdnit',
      nebezpecne: true,
    })
    if (!dal) return
    store.plan = []
    store.planDny = []
    save()
    draw()
  }

  document.getElementById('planSmaz').onclick = async () => {
    const dal = await potvrd({
      nadpis: `Smazat výpravu „${store.vypravaNazev || BEZ_NAZVU}"?`,
      text: 'Smaže se i se zastávkami a rozdělením na dny.',
      ano: 'Smazat',
      nebezpecne: true,
    })
    if (!dal) return
    smaz(-1)
    draw()
    toast('Výprava smazána')
  }
}

/* ---------- navigace ---------- */

function otevriNavigaci() {
  const s = document.getElementById('navSheet')
  s.classList.add('show')
  document.getElementById('backdrop').classList.add('show')
}

export function zavriNavigaci() {
  document.getElementById('navSheet').classList.remove('show')
  document.getElementById('backdrop').classList.remove('show')
}

export const jeOtevrenaNavigace = () => document.getElementById('navSheet').classList.contains('show')

/**
 * Naváže tlačítka v nabídce navigace.
 *
 * Nabídka je staticky v `index.html`, takže se tlačítka nevyrábějí znovu –
 * `#planNav` musí existovat od startu, hlídá to `check-handlers`.
 */
function napojNavigaci() {
  const nav = document.getElementById('planNav')
  if (!nav) return

  /** Zastávky plánu jako místa, ořezané na to, co unese odkaz. */
  const zastavky = () => store.plan.map((id) => S.byId[id]).filter(Boolean).slice(0, MAX_DO_NAVIGACE)

  // Google Maps unese celou trasu. Okno se otevírá rovnou v obsluze kliknutí –
  // prohlížeče blokují window.open, které nepřijde přímo z gesta uživatele,
  // a `parity` na to spoléhá.
  nav.onclick = () => {
    const vsechny = store.plan.map((id) => S.byId[id]).filter(Boolean)
    const items = zastavky()
    if (!items.length) {
      toast('Plán je prázdný')
      return
    }
    const dest = items[items.length - 1]
    const wp = items.slice(0, -1).map((p) => `${p.lat},${p.lon}`).join('|')
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lon}${wp ? `&waypoints=${encodeURIComponent(wp)}` : ''}`,
      '_blank'
    )
    zavriNavigaci()
    // Uříznutý konec trasy se musí ohlásit. Do teď se `slice()` provedl mlčky
    // a člověk odjel s tím, že má v navigaci celou výpravu.
    if (vsechny.length > MAX_DO_NAVIGACE) {
      const zbytek = vsechny.length - MAX_DO_NAVIGACE
      toast(`Google unese ${MAX_DO_NAVIGACE} bodů – ${zbytek} ${sklonuj(zbytek, 'zastávka se nevešla', 'zastávky se nevešly', 'zastávek se nevešlo')}. Celou trasu má GPX.`)
    }
  }

  // GPX: jediná cesta, jak dostat do navigace opravdu celou trasu.
  const gpx = document.getElementById('planGpx')
  if (gpx)
    gpx.onclick = () => {
      const items = store.plan.map((id) => S.byId[id]).filter(Boolean)
      if (!items.length) {
        toast('Plán je prázdný')
        return
      }
      const nazev = store.vypravaNazev || BEZ_NAZVU
      stahniSoubor(gpxZPlanu(nazev, items, store.notes), nazevSouboru(nazev), 'application/gpx+xml')
      zavriNavigaci()
      toast(`Staženo ${items.length} ${sklonuj(items.length, 'zastávka', 'zastávky', 'zastávek')} do GPX`)
    }

  // Apple Maps ani Waze neumějí spolehlivě předat víc zastávek najednou.
  // Posílá se proto první zastávka a řekne se to nahlas – jinak by si člověk
  // na cestě myslel, že má v navigaci celou trasu, a měl by tam jeden bod.
  const jedenCil = (adresa, jmeno) => () => {
    const items = zastavky()
    if (!items.length) {
      toast('Plán je prázdný')
      return
    }
    window.open(adresa(items[0]), '_blank')
    zavriNavigaci()
    if (items.length > 1) toast(`${jmeno}: poslala jsem první zastávku`)
  }

  document.getElementById('planNavApple').onclick = jedenCil(
    (p) => `https://maps.apple.com/?daddr=${p.lat},${p.lon}&dirflg=d`,
    'Apple Maps'
  )
  document.getElementById('planNavWaze').onclick = jedenCil(
    (p) => `https://waze.com/ul?ll=${p.lat},${p.lon}&navigate=yes`,
    'Waze'
  )
}
