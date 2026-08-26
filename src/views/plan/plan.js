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
import { esc, sklonuj } from '../../core/html.js'
import { dkm, fmtKm } from '../../core/geo.js'
import { KAT } from '../../data/categories.js'
import { obrazekMista } from '../../data/kategorieFoto.js'
import { IC } from '../../icons/sprite.js'
import { toast } from '../../components/toast.js'
import { potvrd, zadej, vyberZeSeznamu, vyberDatum, vyberPocetDni } from '../../components/dialog.js'
import { sekce, segment, ikonBtn } from '../../components/vzory.js'
import { otevriVyber } from '../../components/vyberMista.js'
import { goTo, draw, mapa, priblizNaFiltr, vyberBod } from '../../map/map.js'
import { aktivujZalozku } from '../../core/router.js'
import { stahniSoubor } from '../../core/csv.js'
import {
  dnyPlanu, pridejDen, presunDoDne, zrusDny, nastavDny, presunZastavku, srovnejDny, zastavekNadDen,
} from './dny.js'
import { gpxZPlanu, nazevSouboru } from './gpx.js'
import {
  seznamVyprav, seznamSlozek, prepniVypravu, novaVyprava, novaSlozka, prejmenujSlozku,
  smazSlozku, presunVypravu, prejmenuj, smaz, duplikuj, BEZ_NAZVU,
} from './vypravy.js'
import {
  cestaHtml, napojCestu, jedeSe, vyjed, zamcenaCestaHtml, napojZamcenouCestu, vychoziBod,
  zavriMapuCesty,
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
import { nastavKosikFab, otevriKosikPlat } from '../../components/kosikFab.js'
import { dashboardHtml, kotvyPodleDnu } from './dashboard.js'
import { termin, nastavTermin, datumDne, kratkeDatum, denVTydnu, kolikatyDenDnes } from './termin.js'
import { zahodKosikVrstvu } from '../../map/kosikVrstva.js'
import { vykresliDashMapu, zavriDashMapu } from './dashMapa.js'
import { CESTY } from '../../core/cesty.js'

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
/**
 * Která složka má v knihovně rozbalené akce: 's' + název, nebo prázdné.
 * Výpravy vlastní nabídku nemají – ťuknutí je otevře a všechno ostatní se
 * s nimi dělá v Itineráři pod „…" (`prepniMenu()`).
 */
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

// Skloňování se přestěhovalo do core/html.js (textová utilita jako esc()),
// aby ho mohla používat i datová vrstva cesty – `plan.js` veze obrázky
// kategorií a čistý Node ho kvůli nim nenačte. Reexport, ať se nemusí
// přepisovat všechny importy.
export { sklonuj }

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

  // Košík je plovoucí plát, ne obrazovka – vidí ho jedině Itinerář a karta
  // Na cestě, tedy tam, odkud se z něj tahá do plánu. Nastavuje se PŘED
  // vykreslením, aby odznak seděl na to, co se zrovna kreslí.
  nastavKosikFab({
    vidno: (dil === 'itinerar' && S.otevrenaCesta == null) || dil === 'cesta',
    pocet: kosik().length,
    kresli: (el) => {
      el.innerHTML = kosikHtml(vychoziBod())
      napojKosik(el, renderPlan)
    },
  })

  wrap.innerHTML =
    segment(
      // TŘI ZÁLOŽKY PODLE ČASU, ne podle funkce (srpen 2026). Do teď se
      // dělilo na Na cestě · Výpravy · Itinerář · Košík, tedy podle toho, CO
      // s plánem děláš. Člověk ale přemýšlí v čase: jedu, chystám se, mám za
      // sebou. Itinerář zmizel ze segmentu – není to samostatná obrazovka,
      // ale vnitřek JEDNÉ výpravy; košík se stal plovoucím plátem.
      [
        // Tečka u Na cestě říká „něco běží" – jinak by se na rozjetou
        // cestu dalo zapomenout v jiném dílu.
        { id: 'cesta', popisek: jedeSe() ? 'Na cestě ·' : 'Na cestě' },
        { id: 'vypravy', popisek: 'V plánu' },
        { id: 'archiv', popisek: 'Za námi' },
      ],
      // Itinerář je vnitřek výpravy, ne samostatný díl – segment ho proto
      // zvýrazní jako „V plánu". Bez toho nesvítilo nic a vypadalo to,
      // že aplikace na ťuknutí vůbec nezareagovala.
      dil === 'itinerar' ? 'vypravy' : dil,
      'planSegment'
    ) +
    (dil === 'itinerar' ? drobeckyHtml() : '') +
    (dil === 'cesta'
      ? cestaHtml()
      : dil === 'vypravy'
        ? knihovna()
        : dil === 'archiv'
          ? archivHtml()
          : kartaItinerare(items, dny)) +
    (dil === 'itinerar' && S.otevrenaCesta == null ? lista(items) : '')

  napoj(wrap, items)
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
    if (S.otevrenaCesta != null && CESTY[S.otevrenaCesta]) {
      napojZamcenouCestu(wrap, renderPlan, S.otevrenaCesta, () => {
        // Po smazání zpátky do knihovny: index do `CESTY` se posunul a Itinerář
        // by ukazoval cizí cestu, nebo nic.
        S.otevrenaCesta = null
        dil = 'vypravy'
        draw()
        renderPlan()
      })
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
 * Otevře kartu Na cestě. Vstup zvenku: karta výpravy na Domů a Mapě, když
 * se zrovna jede – tam člověk ťuká na „jak nám to jede", ne na „jak to
 * naplánujeme". Bez rozjeté cesty by karta ukázala jen pozvánku k vyjetí,
 * takže se volá jedině s `jedeSe()`.
 */
export function otevriNaCeste() {
  dil = 'cesta'
  S.otevrenaCesta = null
  aktivujZalozku('plan')
  renderPlan()
}

/**
 * Hlavička Itineráře. Od srpna 2026 je to dashboard cesty (dashboard.js):
 * jméno, termín, mapa a tři čísla. Šedý řádek textu, který tu byl do teď,
 * neodpovídal na jedinou otázku, kterou si člověk nad plánem klade. Kostra
 * dnů z něj odešla do hlaviček dnů v `itinerar()` – dva seznamy dnů pod
 * sebou nutily člověka spojovat obě půlky hlavou.
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
  // Název výpravy tu BÝVAL taky – a hned pod ním ho podruhé psal dashboard
  // jako <h2>. Dvakrát totéž pod sebou nic nepřidávalo a zabíralo řádek.
  // Zůstal štítek, který na první pohled říká, na které obrazovce člověk je;
  // šedý text to dřív neuměl.
  return `<div class="drobecky">
    <button class="drobecky-zpet" id="planZpet">${IC('i-sipka')}Výpravy</button>
    <span class="drobecky-kde">Itinerář</span>
  </div>`
}

/* ---------- Výpravy (knihovna) ---------- */

/**
 * Jeden řádek výpravy v knihovně.
 *
 * ŤUKNUTÍ OTEVŘE ITINERÁŘ (srpen 2026). Do teď ho jen aktivovalo na mapě
 * a do Itineráře se šlo až přes „…" → „Otevřít itinerář", tedy třetím
 * ťuknutím. Aktivace na mapě se tím neztratila – otevřená výprava JE ta na
 * mapě, takže obojí dělá jedno ťuknutí a zmizela dvojkolejnost „aktivní na
 * mapě" × „otevřená v itineráři".
 *
 * ŽÁDNÉ „…" NA ŘÁDKU: přejmenovat/duplikovat/složka/smazat existovaly
 * dvakrát – tady a v nabídce nad Itinerářem (`prepniMenu()`), dvěma
 * nezávislými kódy. Zůstala jen ta v Itineráři.
 */
function radekVypravy(v) {
  const km = planStats(v.plan.map((id) => S.byId[id]).filter(Boolean)).road
  const dnu = (v.planDny || []).filter((d) => d > 0).length || 1
  const meta =
    `${v.plan.length} ${sklonuj(v.plan.length, 'zastávka', 'zastávky', 'zastávek')}` +
    (v.plan.length > 1 ? ` · ${dnu} ${sklonuj(dnu, 'den', 'dny', 'dní')} · ${fmtKm(km)}` : '')

  const naMape = v.aktivni && S.otevrenaCesta == null
  return `<div class="vypravaradek${v.aktivni ? ' on' : ''}" data-vyprava="${v.index}">
      ${IC(v.aktivni ? 'i-route' : 'i-map')}
      <div>
        <b>${esc(v.nazev)}</b>
        <span>${meta}</span>
      </div>
      ${naMape ? `<i title="Tahle výprava je vidět na mapě">na mapě</i>` : ''}
      <span class="vypravaradek-sipka" aria-hidden="true">${IC('i-sipka')}</span>
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
          `<div class="meta slozka-prazdna">Zatím prázdná – výpravu sem přetáhni, nebo ji otevři a zařaď pod „…".</div>`
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
  if (!CESTY.length) {
    return `<div class="cesta-prazdno">
      ${IC('i-kalendar')}
      <h3>Zatím jsme nikde nebyli</h3>
      <p>Až první cestu ukončíš, uloží se sem i se všemi zastávkami,
         poznámkami a čísly. Nic se neztratí.</p>
    </div>`
  }
  return archivRadkyHtml()
}

/** Obsluha knihovny: otevírání výprav, sbalování složek, akce složek. */
function napojKnihovnu(wrap) {
  for (const r of wrap.querySelectorAll('.vypravaradek[data-vyprava]')) {
    const i = Number(r.dataset.vyprava)
    // Ťuknutí otevře Itinerář A zároveň výpravu aktivuje na mapě – otevřená
    // výprava je datově pořád ta aktivní, takže je to jedna akce, ne dvě.
    // Aktivní řádek (index -1) tím přestal být mrtvý: dřív na něj ťuknutí
    // nedělalo vůbec nic.
    r.onclick = () => {
      rozbalenoVKnihovne = ''
      S.otevrenaCesta = null
      if (i >= 0) prepniVypravu(i)
      dil = 'itinerar'
      // Překresluje se přes draw() → emit('prekresleno') → renderPlan().
      draw()
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
    toast(`Na mapě: ${CESTY[i].nazev}`)
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
    const c = CESTY[S.otevrenaCesta]
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

/**
 * Prázdná výprava. Nabídne všechny tři cesty, kterými se dá začít –
 * včetně „Přidat den": kostra dnů je legitimní začátek („jedeme na deset
 * dní, plnit budu cestou") a do teď se k ní bez zastávek nedalo dostat.
 */
function prazdno() {
  return `<div class="empty">${IC('i-van')}Ve výpravě zatím nejsou žádné zastávky.
    <div class="meta" style="margin:6px 0 10px">Kam určitě pojedete, dej jako zastávku.
      Co je zatím jen nápad, hoď do košíku. Nebo začni od dnů a plň je cestou.</div>
    <div class="btnrow" style="justify-content:center;margin-bottom:0">
      <button class="btn small primary" id="planPridat">${IC('i-plus')}Přidat zastávku</button>
      <button class="btn small" id="planDoKosiku">${IC('i-batoh')}Košík výpravy</button>
      <button class="btn small" id="planDen">${IC('i-kalendar')}Přidat den</button>
    </div></div>`
}

/* ---------- Itinerář ---------- */

function itinerar(items, dny) {
  // Prázdná výprava BEZ kostry dnů dostane pozvánku; s kostrou se kreslí
  // dny, protože právě do nich se má co tahat z košíku.
  if (!items.length && dny.length <= 1) return prazdno()

  const vicDnu = dny.length > 1
  // Průběžné číslování napříč dny. `parity` hlídá, že „Kopírovat“ vyrobí text
  // s „1. “, „2. “ – kdyby se čísla resetovala v každém dni, přestalo by to
  // sedět, a hlavně by uživatel nevěděl, kolikátá zastávka to celkem je.
  let poradi = 0

  // Kotvy a dnešek do hlaviček – zbytek po zaniklé kostře (dashboard.js).
  const kotvyDnu = kotvyPodleDnu(dny)
  const dnesniDen = kolikatyDenDnes()

  const telo = dny
    .map((den, di) => {
      const cislo = di + 1
      const mista = den.map((id) => S.byId[id]).filter(Boolean)
      const sd = planStats(mista)
      const sbaleny = sbaleneDny.has(cislo)
      // Přes 4 hodiny za volantem denně je makačka – ať je to vidět rovnou
      // v hlavičce dne, ne až na cestě.
      const hodin = mista.length > 1 ? (sd.road / KMH) : 0
      const datum = datumDne(cislo)
      const kotvy = kotvyDnu.get(cislo) || []
      const zacinajici = kotvy.filter((k) => k.zacinaTady)
      const prazdny = !mista.length && !kotvy.length

      // Kotva má přednost před počty: „chceme do Bernexu mezi 3. a 5. dnem"
      // je závazek, počet zastávek jen popis.
      const popis = zacinajici.length
        ? `<span class="denhd-kotva">${IC('i-flag')}${esc(zacinajici[0].p.n)}<i>${
            zacinajici[0].odeDne === zacinajici[0].doDne
              ? `${zacinajici[0].odeDne}. den`
              : `${zacinajici[0].odeDne}.–${zacinajici[0].doDne}. den`
          }</i></span>`
        : kotvy.length
          ? `<span class="denhd-kotva pokracuje">${IC('i-vice')}pořád ve hře</span>`
          : mista.length
            ? `<span>${mista.length} ${sklonuj(mista.length, 'zastávka', 'zastávky', 'zastávek')}${
                mista.length > 1 ? ` · ${fmtKm(sd.road)} · ${fmtCas(hodin)}` : ''
              }${hodin > 4 ? ' ⚠' : ''}</span>`
            : ''

      // HLAVIČKA VŽDY, i u jednodenního plánu (dřív jen `dny.length > 1`).
      // Bez ní nebylo kam pustit zastávku ani kam přidat druhý den a den 1
      // vypadal, že žádný den není.
      const hlavicka = `<div class="denhd${sbaleny ? ' sbaleny' : ''}${prazdny ? ' volny' : ''}${
        cislo === dnesniDen ? ' dnes' : ''
      }" data-den="${cislo}">
            <span class="uchyt den-uchyt" data-uchyt-dne title="Táhni pro přesun celého dne">${IC('i-vice')}</span>
            <span class="denhd-cislo">${cislo}</span>
            ${datum ? `<span class="denhd-datum">${denVTydnu(datum)}<b>${kratkeDatum(datum)}</b></span>` : ''}
            <span class="denhd-telo"><b>Den ${cislo}</b>${popis}</span>
            <button class="den-sbal" data-act="sbal-den" data-den="${cislo}" title="${sbaleny ? 'Rozbalit den' : 'Sbalit den'}">${IC('i-down')}</button>
          </div>`

      const zacatekBody = sbaleny
        ? ''
        : vsechnyBody().filter((m) => !m.po && m.den === cislo).map(bodRadek).join('')
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

      // Prázdný den NENÍ chyba, je to volné místo, které čeká – proto
      // pozvánka s dost velkou plochou, aby se do ní dalo trefit prstem
      // při tažení z košíku.
      const volno = prazdny && !sbaleny
        ? `<div class="denvolno" data-volny-den="${cislo}">${IC('i-plus')}volno — přetáhni sem z košíku</div>`
        : ''

      return hlavicka + zacatekBody + zastavkyHtml + volno + (sbaleny ? '' : blokyDneHtml(cislo))
    })
    .join('')

  // Historické body bez kotvy (po i den prázdné) patří na konec plánu.
  const zbyleBody = vsechnyBody().filter((m) => !m.po && m.den == null).map(bodRadek).join('')

  const rozpocet = rozpocetCelkem()

  return (
    sekce('Itinerář – dny a zastávky', { pozn: items.length > 1 ? 'Táhni za úchyt' : '' }) +
    `<div class="itinerar" id="itinerar">${telo}${zbyleBody}</div>
    ${blokyDneHtml(null)}
    <button class="pridatzastavku" id="planPridat">${IC('i-plus')}Přidat zastávku</button>
    <!-- JEDNO tlačítko na vlastní bod, ne „+" u každého dne a další na jeho
         konci. Ta byla teoreticky pohodlná (bod rovnou tam, kam patří),
         prakticky z toho byl les plusek, ve kterém nikdo nevěděl, který
         přidává co. Kam bod patří, se řekne v průvodci nebo tažením. -->
    <button class="pridatzastavku napotom" id="planPridatBod">${IC('i-pinme')}Přidat bod – start, nocleh, vlastní místo…</button>
    <button class="pridatzastavku dokosiku" id="planDoKosiku">${IC('i-batoh')}Košík výpravy${
      kosik().length ? ` (${kosik().length})` : ''
    }</button>
    ${pridatBlokHtml()}
    ${rozpocet ? `<div class="meta" style="margin:6px 2px">${IC('i-euro')}Rozpočet plánu celkem: <b>${rozpocet.toLocaleString('cs-CZ')} €</b></div>` : ''}` +
    // „Přidat den" už NENÍ podmíněné dvěma zastávkami – den se musí dát
    // založit i do prázdné výpravy, jinak nejde začít od kostry („jedeme na
    // deset dní, plnit budu cestou").
    `<div class="btnrow" style="margin-top:10px">
      <button class="btn small" id="planDen">${IC('i-kalendar')}Přidat den</button>
      ${vicDnu ? `<button class="btn small" id="planBezDnu">Zrušit dny</button>` : ''}
    </div>`
  )
}

/**
 * Bod trasy v itineráři – řádek ve stylu zastávky, bez fotky. Ťuknutí na
 * „…" rozbalí kartu bloku s úpravami (druh, poloha, poznámka, smazání).
 */
function bodRadek(b) {
  const d = DRUHY[b.druh] || DRUHY.vlastni
  const ma = !!souradniceBodu(b)
  // `b.hotovo` se tu vědomě nečte – stejný důvod jako u zastávky výš.
  return `<div class="zastavka bod${rozbaleno === b.id ? ' otevrena' : ''}" data-bod="${b.id}">
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
 * Průvodce založením bodu: druh → název → (den) → poloha.
 *
 * DEN SE PTÁ AŽ TADY, ne polohou tlačítka. Do srpna 2026 měl každý den
 * vlastní „+" a na svém konci ještě „Přidat bod" – tedy dvě tlačítka na den
 * a při deseti dnech dvacet plusek, u kterých nebylo poznat, který přidává
 * co. Teď je tlačítko jedno a den je otázka jako každá jiná. Volání
 * s `den` (ťuknutí do prázdného dne) otázku přeskočí – ta odpověď už padla.
 *
 * @param {number} [den]  číslo dne od 1; bez něj se průvodce zeptá
 * @param {string|null} [po]  id zastávky, za kterou bod patří
 */
async function pridejBodPruvodce(den = 0, po = null) {
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

  // Start a cíl mají pevné místo na krajích plánu, těch se ptát nemá smysl.
  // Stejně tak jednodenního plánu – tam je jediná odpověď.
  const dny = dnyPlanu()
  if (!den && !jeStartCil && dny.length > 1) {
    const vybrany = await vyberZeSeznamu({
      nadpis: 'Do kterého dne?',
      polozky: dny.map((d, i) => ({
        id: String(i + 1),
        popisek: `Den ${i + 1}`,
        ikona: 'i-kalendar',
        meta: d.length ? `${d.length} ${sklonuj(d.length, 'zastávka', 'zastávky', 'zastávek')}` : 'volno',
      })),
    })
    if (vybrany === null) return
    den = Number(vybrany)
  }
  if (!den) den = 1

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

  // ŽÁDNÝ STAV „BYLI JSME TAM" (srpen 2026). Itinerář odpovídá na „jak to
  // pojedeme", ne „kde jsme byli" – fajfka i ztlumení odjeté zastávky sem
  // pletly druhou otázku a člověk plánující příští léto koukal na to, co
  // odškrtl loni. Odškrtávání zůstalo na kartě Na cestě, kam patří;
  // `store.stav` se nemění, jen se tu nečte.
  return `<div class="zastavka${rozbaleno === p.id ? ' otevrena' : ''}" data-id="${p.id}" style="--pc:${k.c}">
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

/* ================= dashboard: mapa a termín ================= */

/**
 * Průvodce termínem: kalendář a stepper, dvě otázky za sebou.
 *
 * Obojí smí zůstat prázdné – termín je nepovinný a prázdná odpověď ho zase
 * zruší. Do srpna 2026 se datum PSALO (`12.8.2026`) a parsovalo regulárním
 * výrazem; překlep skončil hláškou „Datum nerozumím". Z kalendáře se
 * neplatná hodnota vzít nedá, takže parser zanikl i s ní.
 *
 * Počet dnů se srovnává přes `srovnejDny()`, která umí i zkrátit – dřív
 * uměla appka dny jen přidávat, takže „na kolik dní" šlo nastavit jednou
 * a zpátky už nikdy.
 */
async function upravTermin() {
  const { od, dnu } = termin()

  const kdy = await vyberDatum({
    nadpis: 'Kdy vyrážíme?',
    text: 'Nepovinné. Když datum vybereš, doplním ke dnům kalendářní data.',
    vychozi: od,
  })
  if (kdy === null) return

  const kolik = await vyberPocetDni({
    nadpis: 'Na kolik dní?',
    text: 'Připravím ti tolik dnů. Prázdné taky stačí – dny se dají přidávat průběžně.',
    vychozi: dnu,
  })
  if (kolik === null) return

  // Zkrácení, které by přestěhovalo zastávky, se musí ohlásit dřív, než se
  // stane – slití do posledního dne je sice bezpečné (nic se neztratí), ale
  // překvapivé.
  const stehuje = kolik ? zastavekNadDen(kolik) : 0
  if (stehuje) {
    const dal = await potvrd({
      nadpis: `Zkrátit na ${kolik} ${sklonuj(kolik, 'den', 'dny', 'dní')}?`,
      text: `Dny na konci mají ${stehuje} ${sklonuj(stehuje, 'zastávku', 'zastávky', 'zastávek')}. Přesunou se do posledního zbývajícího dne – neztratí se, jen se sesypou k sobě.`,
      ano: 'Zkrátit',
    })
    if (!dal) return
  }

  if (!nastavTermin(kdy, kolik)) return
  if (kolik) srovnejDny(kolik)
  renderPlan()
}

/**
 * Mini-mapa nad itinerářem: zastávky výpravy, vlastní body, kotvy a tvoje
 * poloha. Kreslení dělá sdílená `dashMapa.js` – tatáž mapa je na kartě
 * Na cestě, jen z otisku cesty místo živého plánu.
 */
function vykresliMapuDashboardu(wrap) {
  const el = wrap.querySelector('#dashMapa')
  if (!el) return
  vykresliDashMapu(el, {
    zastavky: store.plan.map((id) => S.byId[id]).filter(Boolean),
    body: vsechnyBody()
      .map((b) => {
        const s = souradniceBodu(b)
        return s ? { ...b, lat: s.lat, lon: s.lon } : null
      })
      .filter(Boolean),
    prepocet: store.aktivniPrepocet,
    // Otisk se počítá ze `serazenaTrasa()`, ne jen ze zastávek – to je
    // přesně množina bodů, kterou `prepocitejTrasu()` posílá do Mapy.com.
    // Bez toho by dashboard u výprav s vlastním startem/noclehem/cílem
    // navždy zůstal na vzdušném fallbacku (BUGS.md B2).
    proOtisk: serazenaTrasa(),
    odkud: vychoziBod(),
    kotvy: new Set(kotvy().map((k) => k.id)),
  })
}

/** Uklidí mini-mapu itineráře i vrstvu košíku na hlavní mapě. */
export function zavriMapuDashboardu() {
  zahodKosikVrstvu()
  const el = document.getElementById('dashMapa')
  if (el) zavriDashMapu(el)
}

/* ================= obsluha ================= */

function napoj(wrap, items) {
  if (dil === 'itinerar' && S.otevrenaCesta == null) vykresliMapuDashboardu(wrap)

  const terminBtn = wrap.querySelector('#terminNastav')
  if (terminBtn) terminBtn.onclick = upravTermin

  // Dlaždice dashboardu vedou tam, kde se to řeší – číslo, na které se dá
  // ťuknout, musí něco udělat, jinak vypadá jako ovládací prvek a mlčí.
  for (const b of wrap.querySelectorAll('[data-dash]')) {
    b.onclick = () => {
      // Košík už není obrazovka, ale plát – vytáhne se nad tím, co je vidět.
      if (b.dataset.dash === 'kosik') return otevriKosikPlat()
      // Zastávky i volné dny žijí v itineráři pod dashboardem – stačí sjet.
      const cil = wrap.querySelector(b.dataset.dash === 'volno' ? '.denhd.volny' : '.zastavka')
      if (cil) cil.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  for (const b of wrap.querySelectorAll('#planSegment button')) {
    b.onclick = () => {
      // Mini-mapy jsou vlastní instance Leafletu – bez úklidu by zůstaly
      // viset na prvku, který zmizí překreslením. Obě karty mají svou.
      zavriMapuKosiku()
      if (dil === 'itinerar') zavriMapuDashboardu()
      if (dil === 'cesta') zavriMapuCesty()
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

  // Jediná cesta k vlastnímu bodu z Itineráře. Průvodce se zeptá i na to,
  // do kterého dne bod patří – dřív to říkalo tlačítko, u kterého se stálo,
  // takže jich muselo být tolik, kolik je dnů.
  const pridatBod = wrap.querySelector('#planPridatBod')
  if (pridatBod) pridatBod.onclick = () => pridejBodPruvodce()

  const doKosiku = wrap.querySelector('#planDoKosiku')
  if (doKosiku) doKosiku.onclick = () => otevriKosikPlat()

  const zpet = wrap.querySelector('#planZpet')
  if (zpet)
    zpet.onclick = () => {
      zavriMapuDashboardu()
      S.otevrenaCesta = null
      dil = 'vypravy'
      renderPlan()
    }

  // Prázdný den je pozvánka, ne mezera – ťuknutí do něj rovnou nabídne, čím
  // ho naplnit. Tažení z košíku je druhá cesta, tohle je ta pro palec.
  for (const b of wrap.querySelectorAll('[data-volny-den]'))
    b.onclick = () => pridejBodPruvodce(Number(b.dataset.volnyDen))

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
      // VOLÁ SE VŽDY, i když `cil === start`, a `posledniY` jde s tím.
      // Zastávka se dá přetáhnout do JINÉHO DNE, aniž by v seznamu někoho
      // přeskočila – poslední zastávka dne puštěná do prázdného dne pod ním
      // má `cil === start`, a dřívější `if (cil !== start)` ji zahodilo.
      // Rozhodnutí „mění se něco?" patří do poDrop, které jediné vidí dny.
      poDrop(start, cil, posledniY)
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

  /**
   * Do kterého dne prst dopadl – poslední hlavička dne nad danou souřadnicí.
   *
   * PROČ Z HLAVIČEK, NE Z NEJBLIŽŠÍ ZASTÁVKY: prázdný den žádnou zastávku
   * nemá, takže kotva by spadla do dne nad ním a do prázdného dne by se
   * nedalo pustit vůbec nic. Hlavičky se navíc při tažení ZASTÁVKY
   * neposouvají (uhýbají jen `.zastavka` řádky), takže jejich změřená
   * poloha odpovídá tomu, co člověk na obrazovce vidí.
   */
  const denPodPrstem = (y) => {
    let den = 1
    for (const h of seznam.querySelectorAll('.denhd')) {
      if (h.getBoundingClientRect().top <= y) den = Number(h.dataset.den)
    }
    return den
  }

  // Zastávky a body trasy: jeden smíšený seznam napříč dny. Kotva puštění
  // je nejbližší ZASTÁVKA nad novou polohou – bod si podle ní přepíše `po`,
  // zastávka se za ni zařadí uvnitř svého dne.
  const radky = [...seznam.querySelectorAll('.zastavka')]
  const radkySkupiny = radky.map((el) => ({ prvky: [el] }))
  radkySkupiny.forEach((sk, idx) => {
    const el = radky[idx]
    pripoj(radkySkupiny, sk, el.querySelector('[data-uchyt]'), el, (start, cil, y) => {
      const ostatni = radky.filter((r) => r !== el)
      let z = Math.min(cil, ostatni.length) - 1
      while (z >= 0 && !ostatni[z].dataset.id) z--
      const kotva = z >= 0 ? ostatni[z].dataset.id : null
      const denCil = denPodPrstem(y)

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
          // Bez kotvy = na začátek dne, do kterého prst dopadl. Dřív tu byla
          // natvrdo jednička, takže bod puštěný na začátek pátého dne skočil
          // na začátek prvního.
          b.po = null
          b.den = denCil
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

      // Zastávka se stěhuje MEZI DNY, ne jen ve `store.plan` – zápis dělá
      // `presunZastavku()` v dny.js, kde je i vysvětlení, co se tu dřív
      // lámalo (BUGS.md B4) a proč to patří do datové vrstvy.
      if (presunZastavku(el.dataset.id, denCil, kotva)) draw()
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
 * `#planNav` musí existovat od startu, jinak se obsluha nemá na co navěsit.
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
