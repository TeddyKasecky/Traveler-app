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
import { esc } from '../../core/html.js'
import { IC } from '../../icons/sprite.js'
import { sklonuj } from './plan.js'
import { dnyPlanu } from './dny.js'
import { BEZ_NAZVU } from './vypravy.js'
import { toast } from '../../components/toast.js'
import { draw } from '../../map/map.js'
import { planoveAchievementy, pripisPlanove, pripisProfilove } from './achievementy.js'
import { archivHtml, napojArchiv } from './archiv.js'
import { bloky, blok } from './bloky.js'

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
  return save()
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

    ${poDnech
      .map(
        ({ den, kus }) => `
      ${dny.length > 1 ? `<div class="sekce"><span class="sekce-text">${den}. den</span></div>` : ''}
      ${kus.map((p) => zastavkaCesty(p, c)).join('')}`
      )
      .join('')}

    ${blokyNaCeste()}

    <div class="sekce"><span class="sekce-text">Poznámka z cesty</span></div>
    <textarea class="cesta-poznamka" id="cestaPoznamka" rows="3"
      placeholder="Co si z cesty chceme pamatovat…">${esc(c.poznamka || '')}</textarea>

    <div class="btnrow cesta-akce">
      <button class="btn" id="cestaPauza">${IC(c.pauzaOd ? 'i-route' : 'i-clock')}${c.pauzaOd ? 'Pokračovat' : 'Pauza'}</button>
      <button class="btn primary" id="cestaKonec">${IC('i-flag')}Ukončit cestu</button>
      <button class="btn small nebezpecne" id="cestaZrusit">Zrušit</button>
    </div>

    ${achievementyCesty(c)}
    ${archivHtml()}`
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
        <button class="cesta-fajfka" data-vlastni="${b.id}" title="${b.hotovo ? 'Byli jsme tu' : 'Odznačit'}">${IC('i-check')}</button>
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

/** Jedna zastávka s fajfkou a poznámkou. */
function zastavkaCesty(p, c) {
  const odznacena = !!c.odznacene[p.id]
  const pozn = c.poznamky[p.id] || ''
  return `
    <div class="cesta-zastavka${odznacena ? ' hotova' : ''}" data-id="${p.id}">
      <button class="cesta-fajfka" data-id="${p.id}" title="${odznacena ? 'Byli jsme tu' : 'Odznačit'}">${IC('i-check')}</button>
      <div class="cesta-telo">
        <b>${esc(p.n)}</b>
        <span class="meta">${esc(p.z)}${odznacena ? ` · ${new Date(c.odznacene[p.id]).toLocaleDateString('cs-CZ')}` : ''}</span>
        ${odznacena ? `<input class="cesta-pozn" data-id="${p.id}" placeholder="Poznámka…" value="${esc(pozn)}">` : ''}
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
    </div>
    ${archivHtml()}`
}

/**
 * Naváže obsluhu karty. Volá se z `renderPlan()` po vložení HTML.
 * @param {HTMLElement} wrap
 * @param {() => void} prekresli
 */
export function napojCestu(wrap, prekresli) {
  const vyjedBtn = wrap.querySelector('#cestaVyjed')
  if (vyjedBtn)
    vyjedBtn.onclick = () => {
      if (vyjed()) {
        toast('Šťastnou cestu!')
        draw()
        prekresli()
      }
    }

  for (const b of wrap.querySelectorAll('.cesta-fajfka')) {
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
    konec.onclick = () => {
      const c = store.cesta
      const hotovo = c ? Object.keys(c.odznacene).length : 0
      if (!confirm(`Ukončit cestu? ${hotovo ? `Odznačeno ${hotovo} zastávek, ` : ''}cesta se uloží do ukončených.`)) return
      if (ukonciCestu()) {
        // Ukončená cesta se může propsat do profilových achievementů
        // (první cesta, týden na kolech…), tak se rovnou připíšou.
        pripisProfilove()
        toast('Cesta uložená do ukončených')
        draw()
        prekresli()
      }
    }

  napojArchiv(wrap, prekresli)

  const zrusit = wrap.querySelector('#cestaZrusit')
  if (zrusit)
    zrusit.onclick = () => {
      if (!confirm('Zrušit rozjetou cestu? Odznačení a poznámky z cesty se zahodí. Tohle nejde vrátit.')) return
      zrusCestu()
      draw()
      prekresli()
    }
}
