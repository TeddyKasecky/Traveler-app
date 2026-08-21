/**
 * Aktuální cesta – z plánu se vyjede a odznačuje se, kde jsme byli.
 *
 * BEZ GPS, A JE TO ROZHODNUTÍ, NE NEDODĚLEK: prohlížeč na zhasnutém displeji
 * sledování polohy zastaví, takže by „ujetá trasa" byla děravá podle toho,
 * kdy byla aplikace zrovna otevřená – a děravá čára je horší než žádná.
 * Ujetou trasu kreslí čára mezi odznačenými zastávkami (`map/planLine.js`).
 *
 * ČAS SE NIKDE NETIKÁ. Čistý čas = teď − začátek − součet pauz; počítá se
 * při každém vykreslení znovu, takže přežije zavření aplikace i restart
 * telefonu a nikde neběží žádný interval.
 *
 * Otisk plánu: `cesta.zastavky` se plní při vyjetí a plán se za jízdy klidně
 * může upravovat – cesta jede podle svého otisku. Bez toho by smazání
 * zastávky z plánu tiše přepsalo i rozjetou cestu.
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
import { coDalHtml, napojCoDal } from './kosikView.js'
import { spustSledovani, zastavSledovani, aktualniProjekce } from './cesta-zivot.js'
import { prepocitejTrasu } from './routing.js'

/** Silnice bývá delší než vzdušná čára – týž koeficient jako v plan.js. */
const KLIKATOST = 1.35

/** Formát času cesty: dny a hodiny, pod hodinu minuty. */
export function fmtDoba(ms) {
  const minut = Math.max(0, Math.round(ms / 60000))
  if (minut < 60) return `${minut} min`
  const hodin = Math.floor(minut / 60)
  if (hodin < 24) return `${hodin} h ${String(minut % 60).padStart(2, '0')} min`
  const dni = Math.floor(hodin / 24)
  return `${dni} ${sklonuj(dni, 'den', 'dny', 'dní')} ${hodin % 24} h`
}

/** Čistý čas probíhající cesty v ms. Pauza se počítá do svého začátku. */
export function cistyCas(c) {
  const konec = c.pauzaOd || Date.now()
  const pauzy = (c.pauzy || []).reduce((a, p) => a + (p.do - p.od), 0)
  return Math.max(0, konec - c.zacatek - pauzy)
}

/** Probíhá cesta? Čte to i planLine, ať ví, jestli kreslit ujetou trasu. */
export const jedeSe = () => !!store.cesta

/**
 * Vyjede podle aktivní výpravy. Vrací false, když není z čeho.
 * @returns {boolean}
 */
export function vyjed() {
  if (store.cesta || !store.plan.length) return false
  store.cesta = {
    nazev: store.vypravaNazev || BEZ_NAZVU,
    zacatek: Date.now(),
    zastavky: [...store.plan],
    // Délky dnů, ne seznamy id: `dnyPlanu()` vrací pole zastávek po dnech
    // a otisk potřebuje jen řez – id už nese `zastavky`.
    dny: dnyPlanu().map((d) => d.length),
    pauzy: [],
    pauzaOd: null,
    odznacene: {},
    poznamky: {},
    poznamka: '',
    ziskane: [],
  }
  return save()
}

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
  save()
}

/**
 * Ukončí cestu: spočítá souhrn a přesune ji do archivu (`store.cesty`).
 *
 * Souhrn se počítá TEĎ, ne při čtení archivu – data míst se můžou změnit
 * (CSV import) a archiv má držet, jaká cesta BYLA.
 */
export function ukonciCestu() {
  const c = store.cesta
  if (!c) return false
  if (c.pauzaOd) {
    c.pauzy.push({ od: c.pauzaOd, do: Date.now() })
    c.pauzaOd = null
  }

  const mista = c.zastavky.map((id) => S.byId[id]).filter(Boolean)
  const navstivena = mista.filter((p) => c.odznacene[p.id])
  const zeme = [...new Set(navstivena.map((p) => p.z))]
  const kraje = [...new Set(navstivena.map((p) => p.r).filter(Boolean))]
  const kategorie = {}
  for (const p of navstivena) kategorie[p.k] = (kategorie[p.k] || 0) + 1
  const hodnoceni = {}
  for (const p of navstivena) if (store.rating[p.id]) hodnoceni[p.id] = store.rating[p.id]

  store.cesty.unshift({
    nazev: c.nazev,
    zacatek: c.zacatek,
    konec: Date.now(),
    cistyMs: cistyCas(c),
    zastavek: c.zastavky.length,
    navstiveno: navstivena.length,
    vynechano: c.zastavky.length - navstivena.length,
    zastavky: c.zastavky,
    odznacene: c.odznacene,
    poznamky: c.poznamky,
    poznamka: c.poznamka,
    zeme,
    kraje,
    kategorie,
    hodnoceni,
    ziskane: c.ziskane || [],
  })
  store.cesta = null
  // Stejný důvod jako u zrusCestu() výš – bez aktivní cesty nemá mód
  // „Na cestě“ co zobrazovat.
  S.mapaMod = 'plna'
  return save()
}

/**
 * Odkud se měří „co je poblíž" – pro tipy Co dál? i pro vzdálenosti v košíku.
 *
 * GPS má přednost, protože je to opravdu tam, kde stojíš. Když není (bez
 * signálu, zamítnuté oprávnění, prohlížeč bez polohy), nastoupí poslední
 * odznačená zastávka: na cestě je to nejlepší odhad, kde jsi. Bez obojího
 * vrací null a volající karty se prostě nevykreslí.
 *
 * @returns {{lat:number, lon:number, popis:string}|null}
 */
export function vychoziBod() {
  if (S.userPos && Number.isFinite(S.userPos.lat)) {
    return { lat: S.userPos.lat, lon: S.userPos.lon, popis: 'od tebe' }
  }
  const c = store.cesta
  if (c) {
    // Poslední v pořadí odznačení, ne poslední v plánu – odznačovat se dá
    // na přeskáčku a zajímá nás, kde jsme skončili.
    const posledni = odznaceneVPoradi().slice(-1)[0]
    const p = posledni && S.byId[posledni]
    if (p) return { lat: p.lat, lon: p.lon, popis: `od: ${p.n}` }
  }
  return null
}

/** Pořadí odznačení – pro čáru ujeté trasy na mapě. */
export function odznaceneVPoradi() {
  const c = store.cesta
  if (!c) return []
  return Object.entries(c.odznacene)
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id)
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

  // Dny podle otisku: délky se převedou na úseky seznamu.
  const dny = c.dny && c.dny.length ? c.dny : [mista.length]
  let od = 0
  const poDnech = dny.map((delka, i) => {
    const kus = mista.slice(od, od + delka)
    od += delka
    return { den: i + 1, kus }
  })

  return `
    <div class="cesta-hlava${c.pauzaOd ? ' pauza' : ''}">
      <div>
        <h3>${esc(c.nazev)}</h3>
        <div class="meta">Vyjeli jsme ${new Date(c.zacatek).toLocaleDateString('cs-CZ')} ·
          na cestě ${fmtDoba(cistyCas(c))}${c.pauzaOd ? ' · pauza' : ''}</div>
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
      ${kus.map((p) => zastavkaCesty(p, c)).join('')}`
      )
      .join('')}

    ${coDal()}

    ${blokyNaCeste()}

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

/** Karta „Co dál?" – jedno místo, kde se výchozí bod počítá. */
function coDal() {
  const odkud = vychoziBod()
  return coDalHtml(odkud, odkud ? odkud.popis : '')
}

/**
 * Bloky, které mají na cestě co dělat: zaškrtávací seznamy a vlastní místa.
 * Odškrtává se přímo na bloku (`hotovo`), takže to vidí i editor plánu.
 */
function blokyNaCeste() {
  const seznamy = bloky().filter((b) => b.typ === 'seznam' && (b.polozky || []).length)
  const mista = bloky().filter((b) => b.typ === 'misto' && Number.isFinite(b.lat))
  if (!seznamy.length && !mista.length) return ''

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

  const mistaHtml = mista
    .map(
      (b) => `
      <div class="cesta-zastavka vlastni${b.hotovo ? ' hotova' : ''}">
        <button class="cesta-fajfka" data-vlastni="${b.id}" title="${b.hotovo ? 'Odznačit' : 'Byli jsme tu'}">${IC('i-check')}</button>
        <div class="cesta-telo">
          <b>★ ${esc(b.nazev || 'Vlastní místo')}</b>
          <span class="meta">${b.lat.toFixed(4)}, ${b.lon.toFixed(4)}${b.den ? ` · ${b.den}. den` : ''}</span>
        </div>
      </div>`
    )
    .join('')

  return `
    ${mista.length ? `<div class="sekce"><span class="sekce-text">Vlastní místa</span></div>${mistaHtml}` : ''}
    ${seznamy.length ? `<div class="sekce"><span class="sekce-text">Seznamy</span></div>${seznamyHtml}` : ''}`
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
    // Stejné volání jako v plan.js#akceItinerare – přepočítává vždy živý
    // store.plan (routing.js), ne otisk cesty. Na mapě se projeví, jen
    // když je zrovna zvolený mód „Itinerář" (S.mapaMod), ne „Na cestě".
    prepocitat.onclick = async () => {
      toast('Počítám trasu…')
      const v = await prepocitejTrasu()
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
