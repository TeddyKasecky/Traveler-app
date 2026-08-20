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
import { dkm, fmtKm } from '../../core/geo.js'
import { esc } from '../../core/html.js'
import { IC } from '../../icons/sprite.js'
import { KAT } from '../../data/categories.js'
import { HOME_MOODS } from '../../data/moods.js'
import { obrazekMista } from '../../data/kategorieFoto.js'
import { sekce } from '../../components/vzory.js'
import { toast } from '../../components/toast.js'
import { potvrd } from '../../components/dialog.js'
import {
  kosik, mistaVKosiku, kosikPoZemich, pridejDoKosiku, vyhodZKosiku, vyprazdniKosik, vKosiku,
} from './kosik.js'
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

/** Jedno místo v košíku. Bez pořadí a bez dne – to je celý smysl. */
function kosikRadek(p, odkud) {
  const kat = KAT[p.k] || {}
  const o = obrazekMista(p, PHOTOS)
  const km = odkud ? dkm(odkud, p) : null
  return `<div class="kosik-radek" data-kos="${p.id}">
    <img class="kosik-obr" src="${o.src}" alt="" loading="lazy" decoding="async" width="56" height="56"
      style="object-position:${o.vyrez}"
      ${o.zaloha ? `data-zaloha="${o.zaloha}" onerror="this.onerror=null;this.src=this.dataset.zaloha"` : ''}>
    <div class="kosik-text">
      <h3>${esc(p.n)}</h3>
      <div class="kosik-meta">
        <span style="color:${kat.c || 'var(--text2)'}">${IC(kat.i || 'i-spark')}${esc(p.k || '')}</span>
        ${km != null ? `<span class="tecka">•</span>${fmtKm(km)}` : ''}
      </div>
    </div>
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

  const skupiny = kosikPoZemich(odkud)
  const prehled = skupiny
    .map((s) => `<span class="kosik-zeme-pill">${esc(s.zeme)}<b>${s.mista.length}</b></span>`)
    .join('')

  return `
    <div class="kosik-hlava">
      <div>
        <h3>Košík výpravy</h3>
        <div class="meta">${mista.length} ${sklonuj(mista.length, 'místo', 'místa', 'míst')} ·
          zatím bez pořadí a bez dnů</div>
      </div>
      <button class="btn small nebezpecne" id="kosikVyprazdnit">Vysypat</button>
    </div>
    <div class="kosik-zeme">${prehled}</div>

    ${skupiny
      .map(
        (s) => `
      ${sekce(s.zeme, { pozn: `${s.mista.length} ${sklonuj(s.mista.length, 'místo', 'místa', 'míst')}` })}
      ${s.mista.map((p) => kosikRadek(p, odkud)).join('')}`
      )
      .join('')}

    <div class="meta kosik-napoveda">${IC('i-plus')} přesune místo do itineráře, ${IC('i-x')} ho z košíku vyhodí.</div>`
}

/** Prázdný košík: vysvětlit, k čemu je – jinak vypadá jako rozbitá obrazovka. */
function prazdnyKosik() {
  return `
    <div class="cesta-prazdno">
      ${IC('i-star')}
      <h3>Košík je prázdný</h3>
      <p>Sem patří místa, která na týhle výpravě chceš vidět, ale ještě nevíš kdy.
         Naházej jich klidně padesát – pořadí ani dny řešit nemusíš.</p>
      <p class="meta">Přidávají se hvězdičkou v detailu místa, v Seznamu nebo v Objevuj.</p>
    </div>`
}

/**
 * Naváže obsluhu košíku.
 * @param {HTMLElement} wrap
 * @param {() => void} prekresli
 */
export function napojKosik(wrap, prekresli) {
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
