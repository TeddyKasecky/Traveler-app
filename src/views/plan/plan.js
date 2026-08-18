/**
 * Záložka Plán – „jak to pojedeme".
 *
 * Skladba podle předlohy `grafika/…11_09_50 (4).png`: název výpravy, segment
 * Přehled · Plán · Mapa, karta trasy se statistikami a tlačítkem „Optimalizovat
 * trasu", itinerář po dnech s náhledy a dole lišta „Uloženo" a „Odeslat do
 * navigace".
 *
 * PROČ SEGMENT, A NE JEDNA DLOUHÁ STRÁNKA: obrazovka odpovídá na tři různé
 * otázky – kolik to je (Přehled), v jakém pořadí (Plán) a kudy (Mapa).
 * Do teď byly všechny tři pomíchané v jednom sloupci karet.
 *
 * NAVIGAČNÍ TLAČÍTKA (`#planNav`, `#planNavApple`, `#planNavWaze`) se přesunula
 * do vysouvací nabídky, ale **zůstala synchronní**: okno se otevírá přímo
 * v obsluze kliknutí. Prohlížeče blokují `window.open`, které nepřijde rovnou
 * z gesta uživatele, a `parity` na tom stojí.
 */

import { S, store, save, PHOTOS } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { dkm, fmtKm } from '../../core/geo.js'
import { KAT } from '../../data/categories.js'
import { obrazekMista } from '../../data/kategorieFoto.js'
import { IC } from '../../icons/sprite.js'
import { toast } from '../../components/toast.js'
import { sekce, segment, statpanel, ikonBtn } from '../../components/vzory.js'
import { otevriVyber } from '../../components/vyberMista.js'
import { goTo, draw, mapa, priblizNaFiltr } from '../../map/map.js'
import { aktivujZalozku } from '../../core/router.js'
import { stahniSoubor } from '../../core/csv.js'
import { dnyPlanu, pridejDen, presunDoDne, zrusDny, rozdelPodleHodin, rozdelNaPocet, nastavDny } from './dny.js'
import { gpxZPlanu, nazevSouboru } from './gpx.js'
import { seznamVyprav, prepniVypravu, novaVyprava, prejmenujVypravu, smazAktivniVypravu, BEZ_NAZVU } from './vypravy.js'
import { cestaHtml, napojCestu, jedeSe } from './cesta.js'
import { blokyDneHtml, pridatBlokHtml, napojBloky, rozpocetCelkem } from './bloky.js'

/** Kolik zastávek unese odkaz do Google Maps. */
const MAX_DO_NAVIGACE = 10
/** Silnice bývá delší než vzdušná čára. Hrubý, ale osvědčený koeficient. */
const KLIKATOST = 1.35
/** Průměrná rychlost pro odhad času za volantem. */
const KMH = 62

/**
 * Který díl segmentu je vidět. Jen v paměti; po restartu se začíná Aktuální
 * cestou, když se zrovna jede – kdo je na cestě, chce odznačovat, ne plánovat.
 */
let dil = ''
const vychoziDil = () => (jedeSe() ? 'cesta' : 'prehled')
/** Která zastávka má rozbalené ovládání pod sebou. */
let rozbaleno = ''
/** Sbalené dny (čísla od jedničky). Jen v paměti. */
const sbaleneDny = new Set()

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
 * Čas jízdy na každou zastávku, v hodinách. `useky[0]` je 0 – na první
 * zastávku se nikam nejede. Vstup pro automatické dělení na dny.
 * @param {Array<Record<string, any>>} items
 * @returns {number[]}
 */
function useky(items) {
  return items.map((p, i) => (i === 0 ? 0 : (dkm(items[i - 1], p) * KLIKATOST) / KMH))
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

export const sklonuj = (n, a, b, c) => (n === 1 ? a : n < 5 ? b : c)

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

  wrap.innerHTML =
    hlava(items, dny) +
    segment(
      [
        // Tečka u Aktuální cesty říká „něco běží" – jinak by se na rozjetou
        // cestu dalo zapomenout v jiném dílu.
        { id: 'cesta', popisek: jedeSe() ? 'Cesta ·' : 'Cesta' },
        { id: 'prehled', popisek: 'Přehled' },
        { id: 'plan', popisek: 'Plán' },
      ],
      dil,
      'planSegment'
    ) +
    (dil === 'cesta' ? cestaHtml() : dil === 'prehled' ? prehled(items, dny) : itinerar(items, dny)) +
    (dil === 'cesta' ? '' : lista(items))

  napoj(wrap, items)
  if (dil === 'cesta') napojCestu(wrap, renderPlan)
  if (dil === 'plan') {
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

/** Hlavička: název výpravy a co obnáší. */
function hlava(items, dny) {
  const st = planStats(items)
  const popis = items.length
    ? `${items.length} ${sklonuj(items.length, 'zastávka', 'zastávky', 'zastávek')} · ${dny.length} ${sklonuj(dny.length, 'den', 'dny', 'dní')}${
        items.length > 1 ? ` · ${fmtKm(st.road)}` : ''
      }`
    : 'Zatím prázdná'

  return `<div class="planhlava">
    <div class="planhlava-text">
      <h2>${esc(store.vypravaNazev || BEZ_NAZVU)}</h2>
      <div class="meta">${esc(popis)}</div>
    </div>
    ${ikonBtn('i-vice', { id: 'planVice', titul: 'Další akce' })}
  </div>
  <div id="planMenu" hidden></div>`
}

/* ---------- Přehled ---------- */

function prehled(items, dny) {
  const st = planStats(items)
  const zemi = new Set(items.map((p) => p.z)).size

  const vypravy = seznamVyprav()
  const seznamHtml = vypravy
    .map((v) => {
      const km = planStats(v.plan.map((id) => S.byId[id]).filter(Boolean)).road
      return `<button class="vypravaradek${v.aktivni ? ' on' : ''}" data-vyprava="${v.index}">
        ${IC(v.aktivni ? 'i-route' : 'i-map')}
        <div>
          <b>${esc(v.nazev)}</b>
          <span>${v.plan.length} ${sklonuj(v.plan.length, 'zastávka', 'zastávky', 'zastávek')}${v.plan.length > 1 ? ` · ${fmtKm(km)}` : ''}</span>
        </div>
        ${v.aktivni ? `<i>aktivní</i>` : IC('i-sipka', 'font-size:15px;color:var(--text3)')}
      </button>`
    })
    .join('')

  return (
    sekce('Moje výpravy', { akce: 'Nová výprava', akceId: 'vypNova' }) +
    `<div class="vypravy">${seznamHtml}</div>` +
    (items.length ? pruhPrubehu(items) : '') +
    sekce('Trasa a přehled') +
    (items.length
      ? `<div class="trasakarta">
          ${statpanel([
            { ikona: 'i-route', popisek: 'Celkem vzdálenost', hodnota: items.length > 1 ? fmtKm(st.road) : '—' },
            { ikona: 'i-clock', popisek: 'Odhadovaný čas', hodnota: items.length > 1 ? fmtCas(st.hrs) : '—' },
            { ikona: 'i-pinme', popisek: 'Zastávky', hodnota: `${items.length} ${sklonuj(items.length, 'místo', 'místa', 'míst')}` },
            { ikona: 'i-kalendar', popisek: 'Rozděleno na', hodnota: `${dny.length} ${sklonuj(dny.length, 'den', 'dny', 'dní')}` },
            { ikona: 'i-globe', popisek: 'Zemí na trase', hodnota: String(zemi) },
          ])}
          <button class="btn small" id="planNaMapu">${IC('i-map')}Ukázat na mapě</button>
          ${items.length > 2 ? `<button class="btn zvyrazneny" id="planOpt">${IC('i-sparkles')}Optimalizovat trasu</button>` : ''}
          ${items.length > 2 ? rozdeleni() : ''}
        </div>`
      : prazdno())
  )
}

/**
 * Pruh průběhu výpravy.
 *
 * Do teď byl Plán jen seznam před cestou a za jízdy neměl co dělat. Odškrtnutá
 * zastávka se zapisuje jako navštívená (`store.stav`), takže se objeví i v číslech
 * na Domů a v Seznamu — je to jedna a ta samá informace, ne druhá evidence.
 */
function pruhPrubehu(items) {
  const { hotovo, celkem, zbyva } = prubehVypravy(items)
  const podil = celkem ? Math.round((hotovo / celkem) * 100) : 0
  const vpravo = hotovo === celkem ? 'Hotovo, celá výprava objetá' : `zbývá ${fmtKm(zbyva)}`

  return `<div class="prubeh">
    <div class="prubeh-hlava"><b>${hotovo} z ${celkem} ${sklonuj(celkem, 'zastávky', 'zastávek', 'zastávek')}</b><span>${esc(vpravo)}</span></div>
    <div class="prubeh-lista"><i style="width:${podil}%"></i></div>
  </div>`
}

/** Tlačítka na automatické rozdělení trasy na dny. */
function rozdeleni() {
  return `<div class="rozdeleni">
    <span>Rozdělit na dny</span>
    <div class="btnrow" style="margin:0">
      <button class="btn small" id="planDnyHodiny">${IC('i-clock')}podle hodin</button>
      <button class="btn small" id="planDnyPocet">${IC('i-kalendar')}podle počtu dní</button>
    </div>
  </div>`
}

/** Prázdná výprava. Nabídne obojí, čím se dá začít. */
function prazdno() {
  return `<div class="empty">${IC('i-van')}Ve výpravě zatím nejsou žádné zastávky.
    <div class="btnrow" style="justify-content:center;margin-bottom:0">
      <button class="btn small primary" id="planPridat">${IC('i-plus')}Přidat zastávku</button>
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
            <button class="den-sbal" data-act="sbal-den" data-den="${di + 1}" title="${sbaleny ? 'Rozbalit den' : 'Sbalit den'}">${IC('i-down')}</button>
          </div>`
        : ''

      const zastavkyHtml = sbaleny
        ? ''
        : mista
            .map((p, i) => {
              poradi++
              const posledniVeDni = i === mista.length - 1
              return zastavka(p, poradi, i === 0 ? null : mista[i - 1], di, dny.length, posledniVeDni, poradi === items.length)
            })
            .join('')
      if (sbaleny) poradi += mista.length

      return hlavicka + zastavkyHtml + (sbaleny ? '' : blokyDneHtml(vicDnu ? di + 1 : null))
    })
    .join('')

  const rozpocet = rozpocetCelkem()

  return (
    sekce('Itinerář – dny a zastávky', { pozn: items.length > 1 ? 'Táhni za úchyt' : '' }) +
    `<div class="itinerar" id="itinerar">${telo}</div>
    ${vicDnu ? blokyDneHtml(null) : ''}
    <button class="pridatzastavku" id="planPridat">${IC('i-plus')}Přidat zastávku</button>
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

/* ================= obsluha ================= */

function napoj(wrap, items) {
  for (const b of wrap.querySelectorAll('#planSegment button')) {
    b.onclick = () => {
      dil = b.dataset.seg
      renderPlan()
    }
  }

  for (const b of wrap.querySelectorAll('[data-vyprava]')) {
    b.onclick = () => {
      const i = Number(b.dataset.vyprava)
      if (i < 0) return
      prepniVypravu(i)
      draw()
      toast(`Výprava: ${store.vypravaNazev || BEZ_NAZVU}`)
    }
  }

  const nova = document.getElementById('vypNova')
  if (nova)
    nova.onclick = () => {
      const nazev = prompt('Jak se bude výprava jmenovat?', '')
      if (nazev === null) return
      novaVyprava(nazev)
      draw()
      toast('Nová výprava založená')
    }

  const vice = document.getElementById('planVice')
  if (vice) vice.onclick = () => prepniMenu()

  const pridat = document.getElementById('planPridat')
  if (pridat)
    pridat.onclick = () =>
      otevriVyber((p) => {
        store.plan.push(p.id)
        save()
        draw()
        toast(`${p.n.split(/\s[–(]/)[0]} přidáno do plánu`)
      })

  const naMapu = document.getElementById('planNaMapu')
  if (naMapu)
    naMapu.onclick = () => {
      aktivujZalozku('map')
      priblizNaFiltr(items)
    }

  const opt = document.getElementById('planOpt')
  if (opt) opt.onclick = optimalizuj

  const den = document.getElementById('planDen')
  if (den)
    den.onclick = () => {
      pridejDen()
      draw()
    }

  const dnyHodiny = document.getElementById('planDnyHodiny')
  if (dnyHodiny) dnyHodiny.onclick = () => rozdelDny('hodiny', items)

  const dnyPocet = document.getElementById('planDnyPocet')
  if (dnyPocet) dnyPocet.onclick = () => rozdelDny('pocet', items)

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
 * Tahání za úchyt – zastávky i celé sbalené dny.
 *
 * Ukazatelové události, ne HTML5 drag-and-drop: ten na mobilu nefunguje.
 * Tažená položka jde za prstem, sousedi se před ní ROZESTUPUJÍ (transform,
 * žádné překreslování během tažení), takže je pořád vidět, kam spadne.
 * U okraje obrazovky se seznam sám roluje – bez toho se na telefonu nedá
 * přesunout nic přes půl seznamu.
 *
 * Přesouvá se jen `store.plan`; dělení na dny zůstává jak bylo – délky dnů
 * se počítají z počtů, takže zastávka po přesunu spadne do dne podle pozice.
 * Přesun CELÉHO dne přeskládá úsek `store.plan` i pořadí délek v `planDny`
 * a zapisuje přes `nastavDny()`, které odmítne rozdělení s nesedícím součtem.
 */
function napojTahani(wrap) {
  const seznam = wrap.querySelector('#itinerar')
  if (!seznam) return
  const rolovac = document.querySelector('#panelPlan .inner')

  /** Společná mechanika: prvek jde za prstem, sousedi uhýbají. */
  const tahni = (uchyt, el, radky, poDrop) => {
    uchyt.style.touchAction = 'none'
    uchyt.onpointerdown = (e) => {
      if (e.button) return
      e.preventDefault()
      uchyt.setPointerCapture(e.pointerId)

      const y0 = e.clientY
      const vyska = el.offsetHeight + 8 // 8 = mezera mezi kartami
      const start = radky.indexOf(el)
      let cil = start
      let rafId = 0
      let posledniY = y0
      el.classList.add('tahne')

      const prekresliPosuny = () => {
        for (let i = 0; i < radky.length; i++) {
          const r = radky[i]
          if (r === el) continue
          // Sousedi mezi startem a cílem uhnou o výšku tažené položky.
          let posun = 0
          if (start < cil && i > start && i <= cil) posun = -vyska
          else if (start > cil && i >= cil && i < start) posun = vyska
          r.style.transform = posun ? `translateY(${posun}px)` : ''
        }
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

      uchyt.onpointermove = (ev) => {
        posledniY = ev.clientY
        el.style.transform = `translateY(${ev.clientY - y0}px)`
        // Cíl podle středů OSTATNÍCH řádků v jejich PŮVODNÍ poloze – uhnuté
        // transformy se do getBoundingClientRect promítají, proto se posun
        // odečítá zpátky.
        let novy = 0
        for (const r of radky) {
          if (r === el) continue
          const rect = r.getBoundingClientRect()
          const posunuty = r.style.transform ? (r.style.transform.includes('-') ? vyska : -vyska) : 0
          if (ev.clientY > rect.top + posunuty + rect.height / 2) novy++
        }
        cil = Math.max(0, Math.min(radky.length - 1, novy))
        prekresliPosuny()
      }

      const konec = () => {
        uchyt.onpointermove = null
        uchyt.onpointerup = null
        uchyt.onpointercancel = null
        cancelAnimationFrame(rafId)
        el.classList.remove('tahne')
        el.style.transform = ''
        for (const r of radky) r.style.transform = ''
        if (cil !== start) poDrop(start, cil)
      }
      uchyt.onpointerup = konec
      uchyt.onpointercancel = konec
    }
  }

  // Zastávky: tahá se mezi VŠEMI zastávkami napříč dny.
  const zastavky = [...seznam.querySelectorAll('.zastavka')]
  for (const el of zastavky) {
    const uchyt = el.querySelector('[data-uchyt]')
    if (!uchyt) continue
    tahni(uchyt, el, zastavky, (start, cil) => {
      const id = el.dataset.id
      const kde = store.plan.indexOf(id)
      // Cíl je index mezi VYKRESLENÝMI zastávkami; sbalené dny se nekreslí,
      // takže se přepočítá na index v plánu podle id sousedа.
      const cilId = zastavky[cil].dataset.id
      const kam = store.plan.indexOf(cilId)
      if (kde < 0 || kam < 0 || kde === kam) return
      store.plan.splice(kde, 1)
      store.plan.splice(kam, 0, id)
      save()
      draw()
    })
  }

  // Sbalené dny: tahá se hlavička, přesouvá se celý úsek plánu i s délkou.
  const hlavicky = [...seznam.querySelectorAll('.denhd')]
  for (const el of hlavicky) {
    const uchyt = el.querySelector('[data-uchyt-dne]')
    if (!uchyt) continue
    tahni(uchyt, el, hlavicky, (start, cil) => {
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

/**
 * Rozdělí trasu na dny automaticky./**
 * Rozdělí trasu na dny automaticky.
 *
 * PŘED ZÁPISEM SE UKÁŽE, CO Z TOHO VYJDE. Ruční dělení je práce, kterou by
 * jedno ťuknutí smazalo — a `store.planDny` jsou uživatelská data. Potvrzení
 * proto není zdvořilost, ale pojistka.
 *
 * @param {'hodiny'|'pocet'} zpusob
 * @param {Array<Record<string, any>>} items
 */
function rozdelDny(zpusob, items) {
  if (items.length < 3) return
  const u = useky(items)

  let delky
  if (zpusob === 'hodiny') {
    const zadano = prompt('Kolik hodin denně chceme nejvýš jet?', '4')
    if (zadano === null) return
    const limit = Number(String(zadano).replace(',', '.'))
    if (!(limit > 0)) {
      toast('To není počet hodin')
      return
    }
    delky = rozdelPodleHodin(u, limit)
    if (!delky.length) {
      toast(`Do ${limit} h denně se celá trasa vejde za jeden den`)
      return
    }
  } else {
    const zadano = prompt('Na kolik dní to rozdělit?', String(Math.max(2, dnyPlanu().length)))
    if (zadano === null) return
    const pocet = Math.floor(Number(zadano))
    if (!(pocet > 1)) {
      toast('Dní musí být aspoň dva')
      return
    }
    delky = rozdelNaPocet(u, pocet)
    if (!delky.length) {
      toast('Na tolik dní to rozdělit nejde')
      return
    }
  }

  // Náhled: kolik zastávek a kolik za volantem připadne na každý den.
  let od = 0
  const nahled = delky
    .map((d, i) => {
      const den = items.slice(od, od + d)
      // Úsek na první zastávku dne se počítá do něj – je to cesta, která ten
      // den opravdu čeká.
      const hodin = u.slice(od, od + d).reduce((a, b) => a + b, 0)
      od += d
      return `Den ${i + 1}: ${den.length} ${sklonuj(den.length, 'zastávka', 'zastávky', 'zastávek')} · ${fmtCas(hodin)}`
    })
    .join('\n')

  if (!confirm(`Rozdělit takhle?\n\n${nahled}\n\nDosavadní rozdělení na dny se přepíše.`)) return

  if (!nastavDny(delky)) {
    toast('Rozdělení nesedělo na počet zastávek, nic jsem neměnila')
    return
  }
  draw()
  toast(`Rozděleno na ${delky.length} ${sklonuj(delky.length, 'den', 'dny', 'dní')}`)
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
    <button id="planShare">${IC('i-copy')}Kopírovat plán</button>
    ${store.plan.length > 1 ? `<button id="planOtoc">${IC('i-route')}Otočit pořadí</button>` : ''}
    ${(store.planDny || []).length > 1 ? `<button id="planDupDen">${IC('i-kalendar')}Duplikovat poslední den</button>` : ''}
    <button id="planClear">${IC('i-trash')}Vyprázdnit zastávky</button>
    <button id="planSmaz">${IC('i-x')}Smazat celou výpravu</button>`
  m.hidden = false

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

  const dup = document.getElementById('planDupDen')
  if (dup)
    dup.onclick = () => {
      // „Duplikovat den" kopíruje jen strukturu (prázdný den stejné velikosti
      // nedává smysl) – zastávky zůstávají jednou, den se přidá prázdný za
      // poslední a zastávky se do něj přesouvají. Kopírovat tatáž místa
      // dvakrát plán neumí ani jinde: `store.plan` je množina zastávek.
      pridejDen()
      draw()
      toast('Přidán den na konec')
    }

  document.getElementById('planPrejmenuj').onclick = () => {
    const n = prompt('Název výpravy:', store.vypravaNazev || '')
    if (n === null) return
    prejmenujVypravu(n)
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
      prompt('Zkopíruj:', t)
    }
  }

  document.getElementById('planClear').onclick = () => {
    if (!confirm('Vyprázdnit zastávky téhle výpravy?')) return
    store.plan = []
    store.planDny = []
    save()
    draw()
  }

  document.getElementById('planSmaz').onclick = () => {
    if (!confirm(`Smazat výpravu „${store.vypravaNazev || BEZ_NAZVU}" i se zastávkami?`)) return
    smazAktivniVypravu()
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
