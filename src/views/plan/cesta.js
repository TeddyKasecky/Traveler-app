/**
 * Aktuální cesta – vykreslení karty Na cestě a její obsluha.
 *
 * DATA JSOU VE `cestaData.js`, tenhle soubor je vzhled. Rozděleno stejně
 * jako `body.js`/`bloky.js` a `kosik.js`/`kosikView.js`: odsud se importuje
 * `IC`, který čte `sprite.svg?raw` (Vite syntaxe, kterou čistý Node neumí),
 * takže by `check-dny.mjs` na téhle větvi spadl hned při importu.
 *
 * Datové funkce se odsud **reexportují** – volajících je hodně (plan.js,
 * kosikView.js, map/planLine.js, home.js) a přepisovat jim všem cestu
 * importu by bylo dražší než jeden řádek tady.
 */

import { S, store, save, saveOdlozene } from '../../core/store.js'
import { dkm, fmtKm } from '../../core/geo.js'
import { esc } from '../../core/html.js'
import { IC } from '../../icons/sprite.js'
import { sklonuj } from './plan.js'
import { dnyPlanu } from './dny.js'
import { BEZ_NAZVU } from './vypravy.js'
import { toast } from '../../components/toast.js'
import { potvrd } from '../../components/dialog.js'
import { draw } from '../../map/map.js'
import { planoveAchievementy, pripisPlanove, pripisProfilove } from './achievementy.js'
import { detailCestyHtml } from './archiv.js'
import { bloky, blok } from './bloky.js'
import { serazenePolozky, serazenaTrasa, vsechnyBody, souradniceBodu, DRUHY } from './body.js'
import { vykresliDashMapu, zavriDashMapu } from './dashMapa.js'
import { kotvy, pridejDoKosiku } from './kosik.js'
import { coDalHtml, napojCoDal, tipyOdsud } from './kosikView.js'
import { spustSledovani, zastavSledovani, aktualniProjekce } from './cesta-zivot.js'
import { prepocitejOtiskCesty } from './routing.js'
import {
  fmtDoba, cistyCas, jedeSe, vyjed, ukonciCestu, vychoziBod, odznaceneVPoradi,
  pridejDoCesty, vynechZCesty, kolikatyDenCesty, cestaZmenena,
} from './cestaData.js'

// Reexport datové vrstvy: volající (plan.js, kosikView.js, map/planLine.js)
// sahali sem odjakživa a rozdělení souboru není důvod je všechny přepsat.
export {
  fmtDoba, cistyCas, jedeSe, vyjed, ukonciCestu, vychoziBod, odznaceneVPoradi,
  pridejDoCesty, vynechZCesty, kolikatyDenCesty, cestaZmenena,
}

/** Silnice bývá delší než vzdušná čára – týž koeficient jako v plan.js. */
const KLIKATOST = 1.35

/** Pauza ↔ pokračování. */
function prepniPauzu() {
  const c = store.cesta
  if (!c) return
  if (c.pauzaOd) {
    c.pauzy.push({ od: c.pauzaOd, do: Date.now() })
    c.pauzaOd = null
  } else {
    c.pauzaOd = Date.now()
  }
  save()
}

/** Zahodí rozjetou cestu. Nevratné, proto s potvrzením u volajícího. */
function zrusCestu() {
  store.cesta = null
  // Bez aktivní cesty nemá mód „Na cestě“ (S.mapaMod) co zobrazovat –
  // jinak by appka po zrušení dál schovávala běžné špendlíky bezdůvodně.
  S.mapaMod = 'plna'
  // Tipy „Co dál?“ patřily k rozjeté cestě (vychoziBod() bez ní vrací null) –
  // vynulovat hned, ne čekat na další vykreslení karty Na cestě.
  S.coDalId = []
  save()
}

/* ================= vykreslení ================= */

/**
 * Obsah karty Aktuální cesta.
 * @returns {string}
 */
export function cestaHtml() {
  const c = store.cesta
  if (!c) return prazdnaCesta()

  const mista = c.zastavky.map((id) => S.byId[id]).filter(Boolean)
  const hotovo = mista.filter((p) => c.odznacene[p.id]).length
  const podil = mista.length ? Math.round((hotovo / mista.length) * 100) : 0

  // Zbývá = součet úseků, jejichž CÍLOVÁ zastávka ještě není odznačená –
  // funguje i při odznačování na přeskáčku (stejná definice jako v plan.js).
  let zbyva = 0
  for (let i = 1; i < mista.length; i++) if (!c.odznacene[mista[i].id]) zbyva += dkm(mista[i - 1], mista[i]) * KLIKATOST
  const dalsiCil = mista.find((p) => !c.odznacene[p.id])

  // Živé sledování (cesta-zivot.js): vzdálenost/čas přesnější než odhad
  // výš, protože vychází ze skutečné trasy z Routing API a reálné polohy –
  // ale POZOR, je to "zbývá do cíle CELÉ trasy", ne do dalšího cíle jako
  // pole výš. Vidí to jen ten, kdo appku drží na popředí na kartě Na cestě.
  const proj = aktualniProjekce(store.aktivniPrepocet)

  // ZASTÁVKY A VLASTNÍ BODY V JEDNOM POŘADÍ (srpen 2026). Do teď se body
  // kreslily v jedné sekci úplně dole, mimo dny, a jejich kotvení `po`/`den`
  // se ignorovalo – nocleh mezi druhou a třetí zastávkou tak na cestě stál
  // za vším ostatním. Řadí je `serazenePolozky()` v body.js, tedy tatáž
  // funkce jako v Itineráři.
  //
  // Bloky se čtou pod `store.cesta.nazev`, ne pod aktivní výpravou: po
  // přepnutí výpravy za jízdy by cesta ukazovala cizí body.
  const dny = c.dny && c.dny.length ? c.dny : [mista.length]
  const polozky = serazenePolozky(c.zastavky, dny, vsechnyBody(c.nazev))
  const poDnech = dny.map((_, i) => ({
    den: i + 1,
    kus: polozky.filter((x) => x.den === i + 1),
  }))

  // Kolikátý den cesty je dnes – počítá se z okamžiku vyjetí, ne z termínu
  // výpravy: cesta může vyjet jindy, než se plánovalo, a „3. den" má být
  // pravda o cestě, ne o plánu.
  const denCesty = Math.floor((Date.now() - c.zacatek) / 86400000) + 1

  return `
    <div class="cesta-hlava${c.pauzaOd ? ' pauza' : ''}">
      <div class="cesta-hlava-text">
        <span class="cesta-stitek">${c.pauzaOd ? 'Pauza' : 'Na cestě'} · ${denCesty}. den</span>
        <h3>${esc(c.nazev)}</h3>
        <div class="meta">Vyjeli jsme ${new Date(c.zacatek).toLocaleDateString('cs-CZ')} ·
          na cestě ${fmtDoba(cistyCas(c))}</div>
      </div>
      <div class="cesta-cisla"><b>${hotovo}</b><span>z ${mista.length}</span></div>
    </div>
    <div class="cesta-pruh"><span style="width:${podil}%"></span></div>
    ${mista.length > 1 ? `<div class="meta cesta-zbyva">${hotovo === mista.length ? 'Projeli jsme celou trasu' : `v plánu je ještě ${fmtKm(zbyva)}`}</div>` : ''}
    ${
      proj
        ? `<div class="meta cesta-ziva">${IC('i-compass')}Podle polohy je do konce trasy ${fmtKm(proj.zbyvaKm)}</div>`
        : ''
    }

    <!-- Mapa až pod čísly: „jak nám to jede" je první otázka, „kde to je"
         druhá. Kreslí ji tatáž dashMapa.js jako v Itineráři, jen z otisku
         cesty a se zvýrazněným dalším cílem. -->
    <div class="dash-mapa" id="cestaMapa"></div>

    ${
      dalsiCil
        ? `<div class="cesta-dalsi">
            <div><span class="meta">Další cíl</span><b>${esc(dalsiCil.n)}</b></div>
            <button class="btn small primary" id="cestaNavigovat" data-lat="${dalsiCil.lat}" data-lon="${dalsiCil.lon}">${IC('i-nav')}Navigovat</button>
            <button class="btn small" id="cestaPrepocitat">${IC('i-route')}Přepočítat</button>
          </div>`
        : ''
    }

    ${poDnech
      .map(
        ({ den, kus }) => `
      ${dny.length > 1 ? `<div class="sekce"><span class="sekce-text">${den}. den</span></div>` : ''}
      ${kus.map((x) => (x.typ === 'bod' ? bodCesty(x.b) : zastavkaCesty(x.p, c))).join('')}`
      )
      .join('')}

    ${coDal()}

    ${seznamyNaCeste()}

    <div class="sekce"><span class="sekce-text">Poznámka z cesty</span></div>
    <textarea class="cesta-poznamka" id="cestaPoznamka" rows="3"
      placeholder="Co si z cesty chceme pamatovat…">${esc(c.poznamka || '')}</textarea>

    <div class="btnrow cesta-akce">
      <button class="btn" id="cestaPauza">${IC(c.pauzaOd ? 'i-route' : 'i-clock')}${c.pauzaOd ? 'Pokračovat' : 'Pauza'}</button>
      <button class="btn primary" id="cestaKonec">${IC('i-flag')}Ukončit cestu</button>
      <button class="btn small nebezpecne" id="cestaZrusit">Zrušit</button>
    </div>

    ${achievementyCesty(c)}`
}

/**
 * Karta „Co dál?" – jedno místo, kde se výchozí bod počítá.
 *
 * `S.coDalId` se zapisuje i bez aktivní cesty (odkud === null → tipy === [] →
 * S.coDalId = []) – map/map.js#draw() v módu „oko" tak vždy vidí aktuální
 * stav, ne zastaralý seznam z předchozí jízdy.
 */
function coDal() {
  const odkud = vychoziBod()
  const tipy = tipyOdsud(odkud)
  S.coDalId = tipy.map((t) => t.p.id)
  return coDalHtml(odkud, tipy, odkud ? odkud.popis : '')
}

/**
 * Vlastní bod trasy na cestě – řádek mezi zastávkami, kam podle `po`/`den`
 * patří. Do srpna 2026 se kreslil v jedné sekci úplně dole a jeho kotvení se
 * ignorovalo, takže nocleh mezi druhou a třetí zastávkou stál za vším.
 *
 * Odškrtává se přímo na bloku (`hotovo`), ne do `cesta.odznacene`: otisk
 * cesty klíčuje id míst z databáze a vlastní bod v ní není. Díky tomu
 * odškrtnutí rovnou vidí i Itinerář, který čte týž blok.
 */
function bodCesty(b) {
  const d = DRUHY[b.druh] || DRUHY.vlastni
  // `souradniceBodu()`, ne `b.lat` – bod se `zdroj: pozice`/`gps` má
  // `lat: null` a dřívější `Number.isFinite(b.lat)` ho z cesty vyhodilo úplně.
  const s = souradniceBodu(b)
  return `
    <div class="cesta-zastavka vlastni${b.hotovo ? ' hotova' : ''}">
      <button class="cesta-fajfka" data-vlastni="${b.id}" title="${b.hotovo ? 'Odznačit' : 'Byli jsme tu'}">${IC('i-check')}</button>
      <div class="cesta-telo">
        <b>${esc(b.nazev || d.popisek)}</b>
        <span class="meta">${d.popisek}${s ? ` · ${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}` : ' · bez polohy'}</span>
      </div>
    </div>`
}

/**
 * Zaškrtávací seznamy z bloků výpravy – jediný druh bloku, který se na cestě
 * odškrtává. Vlastní místa odsud odešla mezi zastávky (`bodCesty()` výš).
 */
function seznamyNaCeste() {
  const c = store.cesta
  const seznamy = bloky(c ? c.nazev : null).filter((b) => b.typ === 'seznam' && (b.polozky || []).length)
  if (!seznamy.length) return ''

  const seznamyHtml = seznamy
    .map(
      (b) => `
      <div class="cesta-seznam" data-blok="${b.id}">
        <b>${esc(b.nadpis || 'Seznam')}</b>
        ${(b.polozky || [])
          .map(
            (p, i) => `<button class="cesta-radek-seznamu${p.hotovo ? ' ma' : ''}" data-blok="${b.id}" data-i="${i}">
              ${IC('i-check')}<span>${esc(p.text || '…')}</span></button>`
          )
          .join('')}
      </div>`
    )
    .join('')

  return `<div class="sekce"><span class="sekce-text">Seznamy</span></div>${seznamyHtml}`
}

/**
 * Achievementy téhle cesty. Získané se připisují při každém vykreslení –
 * vykreslení je jediný okamžik, kdy se na ně někdo dívá, a připsání je
 * levné (pár čistých funkcí nad otiskem cesty).
 */
function achievementyCesty(c) {
  const nove = pripisPlanove(c)
  if (nove.length) toast(`🏅 ${nove[nove.length - 1].nazev}`)
  const definice = planoveAchievementy(c.zastavky, c.dny)
  const ziskane = new Set(c.ziskane || [])
  return `
    <div class="sekce"><span class="sekce-text">Achievementy cesty</span>
      <span class="sekce-pozn">${ziskane.size} z ${definice.length}</span></div>
    <div class="achv-mriz">${definice
      .map((a) => `<span class="achv${ziskane.has(a.id) ? ' ma' : ''}" title="${esc(a.popis)}">${esc(a.nazev)}</span>`)
      .join('')}</div>`
}

/**
 * Jedna zastávka s fajfkou a poznámkou – živé i ukončené cesty. `zamceno`
 * vypne fajfku (trasa a odznačení ukončené cesty se už nedají měnit);
 * `poznEditovatelna` řídí vstupní pole vs. prostý text (odemyká se zvlášť).
 */
function zastavkaCesty(p, c, { zamceno = false, poznEditovatelna = true } = {}) {
  const odznacena = !!c.odznacene[p.id]
  const pozn = (c.poznamky || {})[p.id] || ''
  return `
    <div class="cesta-zastavka${odznacena ? ' hotova' : ''}${zamceno ? ' zamcena' : ''}" data-id="${p.id}">
      <button class="cesta-fajfka" data-id="${p.id}" title="${odznacena ? 'Byli jsme tu' : 'Odznačit'}"${zamceno ? ' disabled' : ''}>${IC('i-check')}</button>
      <div class="cesta-telo">
        <b>${esc(p.n)}</b>
        <span class="meta">${esc(p.z)}${odznacena ? ` · ${new Date(c.odznacene[p.id]).toLocaleDateString('cs-CZ')}` : ''}</span>
        ${
          odznacena
            ? poznEditovatelna
              ? `<input class="cesta-pozn" data-id="${p.id}" placeholder="Poznámka…" value="${esc(pozn)}">`
              : pozn
                ? `<div class="meta cesta-pozn-zamcena">${IC('i-quill')}${esc(pozn)}</div>`
                : ''
            : ''
        }
      </div>
      ${
        // Vynechat jen u neodznačené zastávky rozjeté cesty: co jsme projeli,
        // se z cesty nemaže, a ukončená cesta je záznam, ne plán.
        zamceno || odznacena
          ? ''
          : `<button class="cesta-vynech" data-vynech="${p.id}" title="Dneska ne – vrátit do košíku">${IC('i-x')}</button>`
      }
    </div>`
}

/** Karta bez rozjeté cesty: vyjet, nebo dovytvořit plán. */
function prazdnaCesta() {
  const mist = store.plan.length
  return `
    <div class="cesta-prazdno">
      ${IC('i-van')}
      <h3>Zatím se nikam nejede</h3>
      ${
        mist
          ? `<p>Výprava „${esc(store.vypravaNazev || BEZ_NAZVU)}" má ${mist} ${sklonuj(mist, 'zastávku', 'zastávky', 'zastávek')}. Až sednete do auta, vyjeďte – odznačování a čas poběží odsud.</p>
             <button class="btn primary" id="cestaVyjed">${IC('i-van')}Vyjet</button>`
          : `<p>Nejdřív je potřeba plán: v kartě Výpravy si otevři nebo založ výpravu, v Itineráři poskládej zastávky a vyjeď.</p>`
      }
    </div>`
}

/* ================= ukončená cesta v Itineráři (jen ke čtení) ================= */

/** Které ukončené cestě (index do `store.cesty`) jsou zrovna odemčené poznámky. */
let odemcenaCesta = -1
export const jsouPoznamkyOdemcene = (i) => odemcenaCesta === i

/**
 * Karta Itineráře pro ukončenou cestu otevřenou z knihovny Výprav – jen ke
 * čtení. Trasa, dny a časy jsou zamčené navždy (byly to a nejde je předělat);
 * poznámka cesty a poznámky zastávek jde upravit po „Odemknout poznámky".
 * @param {object} c  záznam ze `store.cesty`
 * @param {number} i  jeho index
 * @returns {string}
 */
export function zamcenaCestaHtml(c, i) {
  const mista = c.zastavky.map((id) => S.byId[id]).filter(Boolean)
  const hotovo = mista.filter((p) => c.odznacene[p.id]).length
  const odemceno = jsouPoznamkyOdemcene(i)

  const dny = c.dny && c.dny.length ? c.dny : [mista.length]
  let od = 0
  const poDnech = dny.map((delka, di) => {
    const kus = mista.slice(od, od + delka)
    od += delka
    return { den: di + 1, kus }
  })

  return `
    <div class="cesta-zamek">${IC('i-zamek')}<span>Ukončená cesta · jen ke čtení</span>
      <button class="btn small" id="cestaOdemknout">${odemceno ? 'Poznámky odemčené' : 'Odemknout poznámky'}</button>
    </div>
    <div class="cesta-hlava">
      <div>
        <h3>${esc(c.nazev)}</h3>
        <div class="meta">${new Date(c.zacatek).toLocaleDateString('cs-CZ')} – ${new Date(c.konec).toLocaleDateString('cs-CZ')} ·
          na cestě ${fmtDoba(c.cistyMs || 0)}</div>
      </div>
      <div class="cesta-cisla"><b>${hotovo}</b><span>z ${mista.length}</span></div>
    </div>

    ${poDnech
      .map(
        ({ den, kus }) => `
      ${dny.length > 1 ? `<div class="sekce"><span class="sekce-text">${den}. den</span></div>` : ''}
      ${kus.map((p) => zastavkaCesty(p, c, { zamceno: true, poznEditovatelna: odemceno })).join('')}`
      )
      .join('')}

    <div class="sekce"><span class="sekce-text">Poznámka z cesty</span></div>
    ${
      odemceno
        ? `<textarea class="cesta-poznamka" id="cestaArchivPoznamka" data-cesta="${i}" rows="3"
             placeholder="Co si z cesty pamatujeme…">${esc(c.poznamka || '')}</textarea>`
        : c.poznamka
          ? `<p class="archiv-poznamka">${esc(c.poznamka)}</p>`
          : `<div class="meta" style="margin:0 2px 10px">Zatím žádná – odemkni poznámky a dopiš ji.</div>`
    }

    ${detailCestyHtml(c)}`
}

/**
 * Naváže obsluhu zamčené karty. Odznačování, mazání a bloky tu nejsou –
 * jediné, co jde měnit, jsou poznámky, a jen po odemčení.
 * @param {HTMLElement} wrap
 * @param {() => void} prekresli
 * @param {number} i  index cesty ve `store.cesty`
 */
export function napojZamcenouCestu(wrap, prekresli, i) {
  const odemkni = wrap.querySelector('#cestaOdemknout')
  if (odemkni)
    odemkni.onclick = () => {
      odemcenaCesta = odemcenaCesta === i ? -1 : i
      prekresli()
    }

  const c = store.cesty[i]
  if (!c) return

  for (const inp of wrap.querySelectorAll('.cesta-pozn')) {
    inp.oninput = () => {
      c.poznamky = c.poznamky || {}
      c.poznamky[inp.dataset.id] = inp.value
      saveOdlozene()
    }
  }

  const pozn = wrap.querySelector('#cestaArchivPoznamka')
  if (pozn)
    pozn.oninput = () => {
      c.poznamka = pozn.value
      saveOdlozene()
    }
}

/**
 * Mini-mapa karty Na cestě.
 *
 * Kreslí OTISK cesty (`c.zastavky`, `c.prepocet`), ne živý plán – ten se za
 * jízdy dál upravuje a mapa by ukazovala trasu, kterou nikdo nejede.
 * Zvýrazněný je další cíl: to je jediná otázka, na kterou se na mapě za
 * volantem někdo dívá.
 */
function vykresliMapuCesty(wrap) {
  const el = wrap.querySelector('#cestaMapa')
  const c = store.cesta
  if (!el || !c) return

  const mista = c.zastavky.map((id) => S.byId[id]).filter(Boolean)
  const dalsiCil = mista.find((p) => !c.odznacene[p.id])
  vykresliDashMapu(el, {
    zastavky: mista,
    body: vsechnyBody(c.nazev)
      .map((b) => {
        const s = souradniceBodu(b)
        return s ? { ...b, lat: s.lat, lon: s.lon } : null
      })
      .filter(Boolean),
    prepocet: c.prepocet,
    // Přesně ta množina bodů, kterou posílá do Mapy.com
    // `prepocitejOtiskCesty()` – včetně vlastních bodů pod názvem CESTY.
    // Slouží dvakrát: k ověření, jestli je uložený přepočet ještě platný,
    // a jako pořadí pro vzdušnou čáru, když platný není.
    proOtisk: serazenaTrasa(c.zastavky, c.dny, vsechnyBody(c.nazev)),
    odkud: vychoziBod(),
    kotvy: new Set(kotvy().map((k) => k.id)),
    zvyraznit: dalsiCil ? dalsiCil.id : '',
    prazdno: 'Cesta zatím nemá zastávku s polohou.',
  })
}

/** Uklidí mini-mapu karty Na cestě. */
export function zavriMapuCesty() {
  const el = document.getElementById('cestaMapa')
  if (el) zavriDashMapu(el)
}

/**
 * Naváže obsluhu karty. Volá se z `renderPlan()` po vložení HTML.
 * @param {HTMLElement} wrap
 * @param {() => void} prekresli
 */
export function napojCestu(wrap, prekresli) {
  // Živé sledování jen na viditelné kartě Na cestě (S.activeTab==='plan')
  // – jinak by běželo na pozadí, i když se dívá člověk na Mapu nebo Domů.
  // zastavSledovani() je idempotentní, bezpečné volat, i když už neběží.
  if (store.cesta && S.activeTab === 'plan') spustSledovani()
  else zastavSledovani()

  vykresliMapuCesty(wrap)

  const vyjedBtn = wrap.querySelector('#cestaVyjed')
  if (vyjedBtn)
    vyjedBtn.onclick = () => {
      if (vyjed()) {
        toast('Šťastnou cestu!')
        draw()
        prekresli()
      }
    }

  // Jen zastávky z otisku – vlastní místa mají vlastní fajfku o kus níž.
  // Bez `[data-id]` by sem spadla i ta jejich a zapsala `odznacene[undefined]`.
  for (const b of wrap.querySelectorAll('.cesta-fajfka[data-id]')) {
    b.onclick = () => {
      const c = store.cesta
      if (!c) return
      const id = b.dataset.id
      if (c.odznacene[id]) delete c.odznacene[id]
      else c.odznacene[id] = Date.now()
      // Odznačení rovnou označí místo jako navštívené – to je celý smysl.
      if (c.odznacene[id]) store.stav[id] = 'visited'
      if (!save()) return
      draw()
      prekresli()
    }
  }

  // Vlastní místa se odškrtávají na bloku (`hotovo`), ne do `cesta.odznacene`:
  // otisk cesty klíčuje id míst z databáze a vlastní bod v ní není. Díky tomu
  // odškrtnutí rovnou vidí i Itinerář, který čte týž blok.
  for (const b of wrap.querySelectorAll('.cesta-fajfka[data-vlastni]')) {
    b.onclick = () => {
      const bod = blok(b.dataset.vlastni)
      if (!bod) return
      // `hotovo` je časové razítko, ne boolean – nula znamená neodškrtnuto.
      bod.hotovo = bod.hotovo ? 0 : Date.now()
      if (!save()) return
      // Znak bodu na mapě se odznačením mění, tak se překreslí i trasa.
      draw()
      prekresli()
    }
  }

  // „Dneska ne" – zastávka z cesty ven a zpátky do košíku. Bez toho by se
  // vynechané místo ztratilo úplně, přitom „dneska ne" není „už nikdy".
  for (const b of wrap.querySelectorAll('[data-vynech]')) {
    b.onclick = async () => {
      const id = b.dataset.vynech
      const p = S.byId[id]
      const dal = await potvrd({
        nadpis: `Vynechat ${p ? p.n : 'zastávku'}?`,
        text: 'Z téhle cesty zmizí a vrátí se do košíku výpravy. Plán výpravy zůstane, jak je.',
        ano: 'Vynechat',
      })
      if (!dal) return
      if (!vynechZCesty(id)) return
      toast('Vynecháno – je zpátky v košíku')
      draw()
      prekresli()
    }
  }

  for (const r of wrap.querySelectorAll('.cesta-radek-seznamu')) {
    r.onclick = () => {
      const b = blok(r.dataset.blok)
      const i = Number(r.dataset.i)
      if (!b || !b.polozky || !b.polozky[i]) return
      b.polozky[i].hotovo = b.polozky[i].hotovo ? 0 : Date.now()
      if (!save()) return
      prekresli()
    }
  }

  napojCoDal(wrap, prekresli)

  for (const inp of wrap.querySelectorAll('.cesta-pozn')) {
    inp.oninput = () => {
      const c = store.cesta
      if (!c) return
      c.poznamky[inp.dataset.id] = inp.value
      saveOdlozene()
    }
  }

  const pozn = wrap.querySelector('#cestaPoznamka')
  if (pozn)
    pozn.oninput = () => {
      if (!store.cesta) return
      store.cesta.poznamka = pozn.value
      saveOdlozene()
    }

  const pauza = wrap.querySelector('#cestaPauza')
  if (pauza)
    pauza.onclick = () => {
      prepniPauzu()
      prekresli()
    }

  const konec = wrap.querySelector('#cestaKonec')
  if (konec)
    konec.onclick = async () => {
      const c = store.cesta
      const hotovo = c ? Object.keys(c.odznacene).length : 0
      const dal = await potvrd({
        nadpis: 'Ukončit cestu?',
        text: `${hotovo ? `Odznačeno ${hotovo} zastávek. ` : ''}Cesta se uloží do ukončených.`,
        ano: 'Ukončit',
      })
      if (!dal) return

      // Trasa se za jízdy mohla změnit (přidání z košíku, vynechání).
      // Plán výpravy se přitom nedotkl – je to „jak jsme to chtěli", cesta
      // „jak to fakt bylo". Nabídnout srovnání má smysl jen u výpravy, ze
      // které se vyjelo; po přepnutí na jinou by se přepsal cizí plán.
      if (c && cestaZmenena(c) && store.vypravaNazev === c.nazev) {
        const promitnout = await potvrd({
          nadpis: 'Promítnout změny do plánu výpravy?',
          text: 'Na cestě jsi trasu upravil. Mám podle ní srovnat i plán výpravy, ať ho máš příště aktuální?',
          ano: 'Promítnout',
          ne: 'Nechat plán, jak byl',
        })
        if (promitnout) {
          store.plan = [...c.zastavky]
          store.planDny = c.dny && c.dny.length > 1 ? [...c.dny] : []
        }
      }

      if (ukonciCestu()) {
        // Ukončená cesta se může propsat do profilových achievementů
        // (první cesta, týden na kolech…), tak se rovnou připíšou.
        pripisProfilove()
        toast('Cesta uložená do ukončených')
        draw()
        prekresli()
      }
    }

  const navigovat = wrap.querySelector('#cestaNavigovat')
  if (navigovat)
    // Google Maps, přímo v obsluze kliknutí – prohlížeče blokují window.open,
    // které nepřijde rovnou z gesta uživatele (stejné pravidlo jako v plan.js).
    navigovat.onclick = () => {
      const { lat, lon } = navigovat.dataset
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`, '_blank')
    }

  const prepocitat = wrap.querySelector('#cestaPrepocitat')
  if (prepocitat)
    // Na rozdíl od plan.js#akceItinerare (ten počítá živý store.plan do
    // store.aktivniPrepocet) tohle počítá OTISK cesty (store.cesta.zastavky/
    // dny) do store.cesta.prepocet – appka za jízdy plán dál upravuje, ale
    // cesta jede podle otisku. Na mapě se projeví v módu „Na cestě"
    // (S.mapaMod), viz map/planLine.js.
    prepocitat.onclick = async () => {
      toast('Počítám trasu…')
      const v = await prepocitejOtiskCesty()
      toast(v.ok ? 'Trasa přepočítána' : v.chyba)
      draw()
      prekresli()
    }

  const zrusit = wrap.querySelector('#cestaZrusit')
  if (zrusit)
    zrusit.onclick = async () => {
      const dal = await potvrd({
        nadpis: 'Zrušit rozjetou cestu?',
        text: 'Odznačení a poznámky z cesty se zahodí. Tohle nejde vrátit.',
        ano: 'Zahodit cestu',
        nebezpecne: true,
      })
      if (!dal) return
      zrusCestu()
      draw()
      prekresli()
    }
}
