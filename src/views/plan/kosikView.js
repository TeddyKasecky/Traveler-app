/**
 * Košík a „Co dál?" – vykreslení a obsluha.
 *
 * ODDĚLENO OD `kosik.js` ze stejného důvodu jako `body.js` od `bloky.js`:
 * datová vrstva nesmí importovat `IC`, který čte `sprite.svg?raw` (Vite
 * syntaxe, kterou čistý Node neumí). Díky tomu jde `kosik.js` testovat
 * v `check-dny.mjs` bez prohlížeče.
 *
 * DVĚ VĚCI, JEDEN SOUBOR, a je to schválně: „Co dál?" je čtečka košíku –
 * tipy z něj berou přednost. Kdyby bydlely zvlášť, musely by si navzájem
 * importovat vykreslovací pomocníky.
 */

import { S, store, PHOTOS, save } from '../../core/store.js'
import { dkm, fmtKm, zjistiPolohu } from '../../core/geo.js'
import { esc } from '../../core/html.js'
import { IC } from '../../icons/sprite.js'
import { KAT } from '../../data/categories.js'
import { HOME_MOODS } from '../../data/moods.js'
import { obrazekMista } from '../../data/kategorieFoto.js'
import { sekce } from '../../components/vzory.js'
import { toast } from '../../components/toast.js'
import { potvrd } from '../../components/dialog.js'
import {
  kosik, mistaVKosiku, pridejDoKosiku, vyhodZKosiku, vyprazdniKosik, vKosiku,
  kosikSeZajizdkou, hlavniKotva, nastavKotvu, zrusKotvu,
} from './kosik.js'
import L from 'leaflet'
import { drawKosik, zahodKosikVrstvu, priblizNaKosik, maCoKreslit } from '../../map/kosikVrstva.js'
import { zadej } from '../../components/dialog.js'
import { vychoziBod } from './cesta.js'
import { sklonuj } from './plan.js'

/** Silnice bývá delší než vzdušná čára – týž koeficient jako v plan.js. */
const KLIKATOST = 1.35

/** Průměrná rychlost na roadtripu včetně zastávek, km/h. */
const RYCHLOST = 60

/**
 * Kam až se hledají tipy „Co dál?".
 *
 * `nb` v datech má strop 45 km a jen 6 sousedů, což je na „kam zítra" málo –
 * zítřejší přejezd bývá delší. Tipy se proto počítají z celé databáze; 580
 * míst je na jeden průchod polem zanedbatelné a odpadá tím závislost na tom,
 * jestli má místo `nb` spočítané.
 */
const TIPY_KM = 150

/** Kolik tipů se ukáže. Tři, ne seznam – seznam je Objevuj. */
const TIPY_POCET = 3

/** Odhad času přejezdu podle vzdušné čáry. */
const dobaJizdy = (km) => {
  const hodin = (km * KLIKATOST) / RYCHLOST
  return hodin < 1 ? `~${Math.round(hodin * 60)} min` : `~${hodin.toFixed(1).replace('.', ',')} h`
}

/* ================= košík ================= */

/**
 * Jedno místo v košíku. Bez pořadí a bez dne – to je celý smysl.
 * Zajížďka je hlavní číslo: „kolik mě to stojí navíc" je otázka, kterou si
 * u večeře klademe, ne „jak je to daleko vzdušnou čarou".
 */
function kosikRadek({ p, km, zajizdka: z, vKoridoru, kotva }, odkud) {
  const kat = KAT[p.k] || {}
  const o = obrazekMista(p, PHOTOS)
  return `<div class="kosik-radek${kotva ? ' je-kotva' : ''}${z != null && !vKoridoru && !kotva ? ' daleko' : ''}"
    data-kos="${p.id}">
    <img class="kosik-obr" src="${o.src}" alt="" loading="lazy" decoding="async" width="56" height="56"
      style="object-position:${o.vyrez}"
      ${o.zaloha ? `data-zaloha="${o.zaloha}" onerror="this.onerror=null;this.src=this.dataset.zaloha"` : ''}>
    <div class="kosik-text">
      <h3>${esc(p.n)}${kotva ? ` <span class="kosik-kotva-znak">${IC('i-flag')}</span>` : ''}</h3>
      <div class="kosik-meta">
        <span style="color:${kat.c || 'var(--text2)'}">${IC(kat.i || 'i-spark')}${esc(p.k || '')}</span>
        ${
          kotva
            ? `<span class="tecka">•</span><b>${kotva.odeDne}.–${kotva.doDne}. den</b>`
            : z != null
              ? `<span class="tecka">•</span><b class="${vKoridoru ? 'zaj-blizko' : 'zaj-daleko'}">${
                  z < 1 ? 'po cestě' : `+${Math.round(z)} km`
                }</b>`
              : km != null
                ? `<span class="tecka">•</span>${fmtKm(km)}`
                : ''
        }
      </div>
    </div>
    ${
      kotva
        ? ''
        : `<button class="ikonbtn kosik-kotva" data-kos-kotva="${p.id}" title="Udělat z toho kotvu">${IC('i-star')}</button>`
    }
    <button class="ikonbtn kosik-do-planu" data-kos-plan="${p.id}" title="Přidat do itineráře">${IC('i-plus')}</button>
    <button class="ikonbtn kosik-ven" data-kos-ven="${p.id}" title="Vyhodit z košíku">${IC('i-x')}</button>
  </div>`
}

/**
 * Obsah karty Košík.
 * @param {{lat:number, lon:number}|null} odkud  odkud se měří vzdálenosti
 * @returns {string}
 */
export function kosikHtml(odkud = null) {
  const mista = mistaVKosiku()
  if (!mista.length) return prazdnyKosik()

  const polozky = kosikSeZajizdkou(odkud)
  const kotva = hlavniKotva()
  const cil = kotva ? S.byId[kotva.id] : null
  const poCeste = polozky.filter((x) => x.vKoridoru && !x.kotva).length

  return `
    <div class="kosik-hlava">
      <div>
        <h3>Košík výpravy</h3>
        <div class="meta">${mista.length} ${sklonuj(mista.length, 'místo', 'místa', 'míst')} ·
          bez pořadí a bez dnů</div>
      </div>
      <button class="btn small nebezpecne" id="kosikVyprazdnit">Vysypat</button>
    </div>

    ${kotvaPruh(cil, kotva, odkud)}

    <div class="kosik-mapa" id="kosikMapa"></div>
    ${
      odkud && cil
        ? `<div class="meta kosik-legenda">
             <span class="kos-tecka blizko"></span>po cestě (${poCeste})
             <span class="kos-tecka daleko"></span>zajížďka
             <span class="kos-tecka kotva"></span>kotva
             <span class="kosik-odhad">vzdálenosti jsou zhruba – vzdušnou čarou</span>
           </div>`
        : `<div class="meta kosik-legenda">
             ${
               odkud
                 ? 'Vyber kotvu a uvidíš, co máš po cestě.'
                 : `<span>Bez polohy se zajížďka spočítat nedá.</span>
                    <button class="btn small" id="kosikPoloha">${IC('i-pinme')}Zapnout polohu</button>`
             }
           </div>`
    }

    ${sekce(cil ? 'Po cestě ke kotvě' : 'Místa v košíku', {
      pozn: cil ? 'seřazeno podle zajížďky' : '',
    })}
    ${polozky.map((x) => kosikRadek(x, odkud)).join('')}

    <div class="meta kosik-napoveda">${IC('i-plus')} přesune místo do itineráře,
      ${IC('i-star')} z něj udělá kotvu, ${IC('i-x')} ho vyhodí.</div>`
}

/** Pruh s kotvou, nebo výzva ji nastavit. */
function kotvaPruh(cil, kotva, odkud) {
  if (!cil || !kotva) {
    return `<div class="kotva-pruh prazdna">${IC('i-flag')}
      <div><b>Zatím bez kotvy</b>
        <span class="meta">Označ místo, kam se chceš dostat – třeba bikepark mezi 3. a 5. dnem.
          Podle něj se spočítá, co máš po cestě.</span></div>
    </div>`
  }
  const km = odkud ? dkm(odkud, cil) : null
  return `<div class="kotva-pruh">${IC('i-flag')}
    <div>
      <b>${esc(cil.n)}</b>
      <span class="meta">chceme tam ${kotva.odeDne}.–${kotva.doDne}. den${
        km != null ? ` · odsud zhruba ${fmtKm(km * KLIKATOST)}` : ''
      }</span>
    </div>
    <button class="ikonbtn" data-kotva-zrus="${cil.id}" title="Zrušit kotvu">${IC('i-x')}</button>
  </div>`
}

/** Prázdný košík: vysvětlit, k čemu je – jinak vypadá jako rozbitá obrazovka. */
function prazdnyKosik() {
  return `
    <div class="cesta-prazdno">
      ${IC('i-star')}
      <h3>Košík je prázdný</h3>
      <p>Sem patří místa, která na týhle výpravě chceš vidět, ale ještě nevíš kdy.
         Naházej jich klidně padesát – pořadí ani dny řešit nemusíš.</p>
      <p class="meta">Naplníš ho tlačítkem <b>Uložit na potom</b> dole v itineráři,
         nebo hvězdičkou v detailu kteréhokoli místa.</p>
    </div>`
}

/** @type {import('leaflet').Map|null} vlastní instance mapy v kartě Košík */
let mapaKosiku = null

/**
 * Pořadové číslo posledního požadavku na vykreslení mapy.
 *
 * Mapa vzniká až s odkladem (rAF + 180 ms), aby měl prvek nenulovou velikost.
 * Mezitím se ale karta může překreslit nebo se z ní dá odejít – a odložený
 * callback by pak postavil Leaflet na prvku, který už v dokumentu není.
 * Leaflet z toho padá na `_leaflet_pos` při prvním posunu. Čítač říká
 * callbacku „tvoje kolo už neplatí, nic nestav".
 */
let koloMapy = 0

/** Uklidí mapu košíku. Volá se při odchodu z karty i před novým vykreslením. */
export function zavriMapuKosiku() {
  // Zneplatní i požadavek, který se ještě nestihl provést.
  koloMapy++
  zahodKosikVrstvu()
  if (mapaKosiku) {
    try {
      mapaKosiku.remove()
    } catch {
      /* prvek už zmizel s překreslením */
    }
    mapaKosiku = null
  }
}

/**
 * Postaví mapu košíku. Jako mini-mapa v detailu vzniká nová instance
 * pokaždé – karta se překresluje celá a stará mapa zmizí s prvkem.
 *
 * Inicializuje se až po vykreslení (rAF + prodleva): dřív má prvek nulovou
 * velikost a Leaflet by spočítal špatné souřadnice.
 */
function vykresliMapuKosiku(wrap) {
  zavriMapuKosiku()
  const el = wrap.querySelector('#kosikMapa')
  if (!el || el._leaflet_id) return

  const odkud = vychoziBod()
  const polozky = kosikSeZajizdkou(odkud)
  if (!maCoKreslit(polozky)) {
    el.innerHTML = '<div class="meta kosik-bezmapy">Místa v košíku zatím nemají souřadnice.</div>'
    return
  }

  const moje = koloMapy
  requestAnimationFrame(() => {
    setTimeout(() => {
      // Mezitím se mohlo odejít z karty nebo překreslit – pak se nestaví nic.
      if (moje !== koloMapy || !document.body.contains(el) || el._leaflet_id) return
      try {
        mapaKosiku = L.map(el, {
          zoomControl: false,
          attributionControl: false,
          scrollWheelZoom: false,
        }).setView([polozky[0].p.lat, polozky[0].p.lon], 8, { animate: false })
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(mapaKosiku)

        // Kde jsi ty – bez toho by koridor neměl odkud vycházet.
        if (odkud) {
          L.marker([odkud.lat, odkud.lon], {
            icon: L.divIcon({ className: 'kos-pin-obal', html: '<div class="kos-ja"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
            zIndexOffset: 2000,
          })
            .addTo(mapaKosiku)
            .bindTooltip('Tady jsi', { direction: 'top', offset: [0, -9] })
        }

        drawKosik(mapaKosiku, polozky, odkud)
        priblizNaKosik(mapaKosiku, polozky, odkud)
      } catch {
        el.innerHTML = '<div class="meta kosik-bezmapy">Mapu se nepovedlo načíst.</div>'
      }
    }, 180)
  })
}

/**
 * Naváže obsluhu košíku.
 * @param {HTMLElement} wrap
 * @param {() => void} prekresli
 */
export function napojKosik(wrap, prekresli) {
  vykresliMapuKosiku(wrap)

  // Poloha se nikde nezjišťuje sama a je to správně – ptát se na ni bez
  // vyžádání je otravné. Košík ji ale potřebuje, tak si o ni řekne tady.
  const poloha = wrap.querySelector('#kosikPoloha')
  if (poloha) poloha.onclick = () => zjistiPolohu()

  for (const b of wrap.querySelectorAll('[data-kos-kotva]')) {
    b.onclick = async (e) => {
      e.stopPropagation()
      const id = b.dataset.kosKotva
      // Okno ve dnech, ne datum: cesta se počítá od vyjetí a datum by nutilo
      // rozhodnout se dřív, než je jasné, kdy se vůbec vyráží.
      const odpoved = await zadej({
        nadpis: 'Kdy tam chceme být?',
        text: 'Napiš rozsah dnů od vyjetí, třeba „3-5". Jeden den stačí taky.',
        vychozi: '3-5',
        placeholder: '3-5',
      })
      if (odpoved === null) return
      const shoda = /^\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*$/.exec(odpoved)
      if (!shoda) return toast('Nerozumím – zkus třeba „3-5"')
      const od = Number(shoda[1])
      const doD = shoda[2] ? Number(shoda[2]) : od
      if (!nastavKotvu(id, od, doD)) return
      toast('Kotva nastavená')
      prekresli()
    }
  }

  for (const b of wrap.querySelectorAll('[data-kotva-zrus]')) {
    b.onclick = (e) => {
      e.stopPropagation()
      if (!zrusKotvu(b.dataset.kotvaZrus)) return
      prekresli()
    }
  }

  for (const b of wrap.querySelectorAll('[data-kos-ven]')) {
    b.onclick = (e) => {
      e.stopPropagation()
      if (!vyhodZKosiku(b.dataset.kosVen)) return
      prekresli()
    }
  }

  for (const b of wrap.querySelectorAll('[data-kos-plan]')) {
    b.onclick = (e) => {
      e.stopPropagation()
      const id = b.dataset.kosPlan
      if (store.plan.includes(id)) {
        toast('Tohle místo už v itineráři je')
        return
      }
      store.plan.push(id)
      // Z košíku ven: místo je teď v trase a na dvou místech naráz by mátlo.
      vyhodZKosiku(id)
      if (!save()) return
      toast('Přidáno do itineráře')
      prekresli()
    }
  }

  const vysyp = wrap.querySelector('#kosikVyprazdnit')
  if (vysyp)
    vysyp.onclick = async () => {
      const dal = await potvrd({
        nadpis: 'Vysypat košík?',
        text: `Přijdeš o ${kosik().length} ${sklonuj(kosik().length, 'místo', 'místa', 'míst')} v košíku. Itineráře se to nedotkne.`,
        ano: 'Vysypat',
        nebezpecne: true,
      })
      if (!dal) return
      if (!vyprazdniKosik()) return
      prekresli()
    }
}

/* ================= Co dál? ================= */

/**
 * Nálady jako filtr tipů. Bere se z `HOME_MOODS`, aby „chuť na hory" znamenala
 * na Domů i na cestě totéž – dvě různé definice by se rozešly.
 * `near` a `tip` se vynechávají: nemají `kat` a chovají se jinak.
 */
const CHUTE = HOME_MOODS.filter((m) => Array.isArray(m.kat) && m.kat.length)

/** Která chuť je zrovna vybraná. Jen v paměti – je to rozhodnutí na pět minut. */
let chut = ''

/**
 * Tipy na pokračování: nejbližší místa od `odkud`, případně zúžená chutí.
 *
 * Vynechává, co je v itineráři (tam už jedeš) a co je odznačené jako
 * navštívené. Místa z košíku dostávají přednost – „tohle sis chtěl vidět
 * a je to kousek" je lepší tip než cokoli náhodného.
 *
 * @param {{lat:number, lon:number}} odkud
 * @returns {Array<{p: Record<string, any>, km: number, vKosiku: boolean}>}
 */
export function tipyOdsud(odkud) {
  if (!odkud || !Number.isFinite(odkud.lat)) return []
  const kategorie = chut ? new Set((CHUTE.find((c) => c.id === chut) || {}).kat || []) : null
  const vPlanu = new Set(store.plan)

  return (S.places || [])
    .filter((p) => !vPlanu.has(p.id))
    .filter((p) => store.stav[p.id] !== 'visited')
    .filter((p) => !kategorie || kategorie.has(p.k))
    .map((p) => ({ p, km: dkm(odkud, p), vKosiku: vKosiku(p.id) }))
    .filter((x) => x.km <= TIPY_KM)
    .sort((a, b) => (a.vKosiku === b.vKosiku ? a.km - b.km : a.vKosiku ? -1 : 1))
    .slice(0, TIPY_POCET)
}

/** Jeden tip. */
function tipRadek({ p, km, vKosiku: vKos }) {
  const kat = KAT[p.k] || {}
  const o = obrazekMista(p, PHOTOS)
  return `<div class="tip-radek" data-tip="${p.id}">
    <img class="tip-obr" src="${o.src}" alt="" loading="lazy" decoding="async" width="52" height="52"
      style="object-position:${o.vyrez}"
      ${o.zaloha ? `data-zaloha="${o.zaloha}" onerror="this.onerror=null;this.src=this.dataset.zaloha"` : ''}>
    <div class="tip-text">
      <h3>${esc(p.n)}${vKos ? ` <span class="tip-znak" title="Máš ho v košíku">${IC('i-star')}</span>` : ''}</h3>
      <div class="tip-meta">
        <span style="color:${kat.c || 'var(--text2)'}">${IC(kat.i || 'i-spark')}${esc(p.k || '')}</span>
        <span class="tecka">•</span>${fmtKm(km)}
        <span class="tecka">•</span>${dobaJizdy(km)}
      </div>
    </div>
    <div class="tip-akce">
      <button class="btn small primary" data-tip-plan="${p.id}">Do itineráře</button>
      ${vKos ? '' : `<button class="btn small" data-tip-kos="${p.id}">Do košíku</button>`}
    </div>
  </div>`
}

/**
 * Karta „Co dál?" – ukazuje se pod dnešní zastávkou na kartě Na cestě.
 *
 * `odkud` je poloha z GPS, nebo poslední odznačená zastávka jako záloha
 * (viz `vychoziBod()` v cesta.js). Bez obojího se karta nekreslí – tipy
 * odnikud nedávají smysl.
 *
 * @param {{lat:number, lon:number}|null} odkud
 * @param {string} popisOdkud  odkud se měří, do popisku
 * @returns {string}
 */
export function coDalHtml(odkud, popisOdkud = '') {
  if (!odkud) return ''
  const tipy = tipyOdsud(odkud)

  const pilulky = CHUTE.map(
    (c) => `<button class="chut-pill${chut === c.id ? ' on' : ''}" data-chut="${c.id}"
      style="--pc:${c.c}">${IC(c.ic)}${esc(c.l)}</button>`
  ).join('')

  return `
    <div class="sekce"><span class="sekce-text">Co dál?</span>
      ${popisOdkud ? `<span class="sekce-pozn">${esc(popisOdkud)}</span>` : ''}</div>
    <div class="chute">${chut ? `<button class="chut-pill zrus" data-chut="">${IC('i-x')}</button>` : ''}${pilulky}</div>
    ${
      tipy.length
        ? tipy.map(tipRadek).join('')
        : `<div class="meta tip-prazdno">${
            chut ? 'Na tuhle chuť tu nic poblíž není. Zkus jinou.' : 'Do 150 km odsud nic dalšího nemáme.'
          }</div>`
    }`
}

/**
 * Naváže obsluhu „Co dál?".
 * @param {HTMLElement} wrap
 * @param {() => void} prekresli
 */
export function napojCoDal(wrap, prekresli) {
  for (const b of wrap.querySelectorAll('[data-chut]')) {
    b.onclick = () => {
      // Druhé ťuknutí na tutéž chuť ji zruší – filtr má jít vypnout stejnou
      // cestou, jakou se zapnul.
      const nova = b.dataset.chut
      chut = chut === nova ? '' : nova
      prekresli()
    }
  }

  for (const b of wrap.querySelectorAll('[data-tip-plan]')) {
    b.onclick = () => {
      const id = b.dataset.tipPlan
      if (store.plan.includes(id)) return toast('Tohle místo už v itineráři je')
      store.plan.push(id)
      vyhodZKosiku(id)
      if (!save()) return
      toast('Přidáno do itineráře')
      prekresli()
    }
  }

  for (const b of wrap.querySelectorAll('[data-tip-kos]')) {
    b.onclick = () => {
      if (!pridejDoKosiku(b.dataset.tipKos)) return
      toast('Uloženo do košíku')
      prekresli()
    }
  }
}
