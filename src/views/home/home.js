/**
 * Záložka Domů – „co dnes".
 *
 * Skladba ze společných dílů podle grafického manuálu: hero pás s pozdravem,
 * karta výpravy, karusel „Možná dnes", řádky rozkoukaných míst a čísla.
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

import { S, store, prefs, savePrefs } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { dkm, fmtKm } from '../../core/geo.js'
import { aktivujZalozku } from '../../core/router.js'
import { prubehVypravy, otevriItinerar, otevriNaCeste } from '../plan/plan.js'
import { jedeSe } from '../plan/cestaData.js'
import { IC } from '../../icons/sprite.js'
import { hash } from '../../components/postcard.js'
import { openWizard } from '../../components/wizard.js'
import { obrazekMista } from '../../data/kategorieFoto.js'
import { PHOTOS } from '../../core/store.js'
import { heroPas, sekce, karusel, radek, cislaRada } from '../../components/vzory.js'
import { vypravaKarta, napojVypravu } from '../../components/vypravaKarta.js'
import { goTo } from '../../map/map.js'
import heroObr from '../../assets/hero/domu.webp'

/** Kolik karet se vejde do karuselu „Možná dnes". */
const TIPU = 6
/** Kolik rozkoukaných řádků se vypíše. */
const ROZKOUKANYCH = 3
/** Kolik pětihvězdičkových míst se vypíše. */
const NEJLEPSICH = 3

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

/** Zkrácený název na kartu. */
const nm = (p) => {
  const s = p.n.split(/\s[–(]/)[0].trim()
  return s.length > 26 ? `${s.slice(0, 25).trim()}…` : s
}

/**
 * Karty do „Možná dnes".
 *
 * Míchá tři zdroje, každý z existujících dat: místa s plamínky (co jsme si
 * slíbili), místa s poznámkou (rozkoukaná) a losované tipy. Los má seed podle
 * data, takže se během dne nemění – kdo přijde dvakrát za hodinu, nemá pocit,
 * že mu aplikace pod rukama přeskládává obsah.
 */
function tipyDne() {
  const pouzite = new Set(store.plan)

  const plaminky = S.places
    .filter((p) => (store.prio[p.id] || 0) >= 2 && store.stav[p.id] !== 'visited')
    .sort((a, b) => (store.prio[b.id] || 0) - (store.prio[a.id] || 0))
  for (const p of plaminky) pouzite.add(p.id)

  const den = new Date().toDateString()
  const zbytek = S.places.filter(
    (p) => store.stav[p.id] !== 'visited' && !pouzite.has(p.id) && (p.img || p.sh)
  )
  const losovane = []
  for (let k = 0; k < TIPU && zbytek.length; k++) {
    losovane.push(zbytek.splice(hash(`${den}#${k}`) % zbytek.length, 1)[0])
  }

  return [...plaminky.slice(0, 2), ...losovane].slice(0, TIPU)
}

/** Místa s poznámkou, od naposledy zapsané. */
function rozkoukana() {
  return Object.keys(store.notes)
    .filter((id) => (store.notes[id] || '').trim() && S.byId[id])
    .reverse()
    .slice(0, ROZKOUKANYCH)
    .map((id) => S.byId[id])
}

/**
 * Nejbližší místo odsud, kde jsme ještě nebyli.
 *
 * Poloha se do teď používala jen na mapě a v řazení Seznamu. Na Domů, které
 * odpovídá na otázku „co dnes“, je to nejpřímější odpověď, jakou data unesou.
 * Bez povolené polohy se sekce vůbec nekreslí – vymýšlet „odhad“ by lhal.
 */
function nejblizOdsud() {
  if (!S.userPos) return null
  let nej = null
  let nejd = Infinity
  for (const p of S.places) {
    if (store.stav[p.id] === 'visited') continue
    const d = dkm(S.userPos, p)
    if (d < nejd) {
      nejd = d
      nej = p
    }
  }
  return nej ? { p: nej, km: nejd } : null
}

/** Místa, kterým jsme dali pět hvězd. `store.rating` se jinde nikde nečte. */
function nejlepsi() {
  return Object.keys(store.rating)
    .filter((id) => store.rating[id] === 5 && S.byId[id])
    .slice(0, NEJLEPSICH)
    .map((id) => S.byId[id])
}

/**
 * Pruh průběhu aktivní výpravy. Stejná čísla jako na Plánu, jeden výpočet.
 *
 * Za jízdy se nekreslí: karta cesty má vlastní pruh počítaný z toho, co se
 * odškrtlo NA TÉHLE CESTĚ, kdežto tenhle jede ze `store.stav` („byli jsme
 * tam někdy"). Dva pruhy s různými čísly pod sebou by si odporovaly.
 */
function pruhVypravy() {
  if (jedeSe()) return ''
  const items = store.plan.map((id) => S.byId[id]).filter(Boolean)
  if (items.length < 2) return ''
  const { hotovo, celkem, zbyva } = prubehVypravy(items)
  const podil = Math.round((hotovo / celkem) * 100)
  const vpravo = hotovo === celkem ? 'Hotovo, celá objetá' : `zbývá ${fmtKm(zbyva)}`
  return `<div class="prubeh">
    <div class="prubeh-hlava"><b>${hotovo} z ${celkem} zastávek</b><span>${esc(vpravo)}</span></div>
    <div class="prubeh-lista"><i style="width:${podil}%"></i></div>
  </div>`
}

export function renderHome() {
  const el = document.getElementById('homeInner')
  if (!el) return

  const navstiveno = S.places.filter((p) => store.stav[p.id] === 'visited').length
  // Zemí, kde jsme byli, z celkového počtu zemí v datech. Vystřídalo počet
  // oblastí, který byl pořád stejný (117) a nic o nás neříkal — tohle roste
  // s cestováním. Ze `stav` a `z`, nic se nedopočítává.
  const zemiCelkem = new Set(S.places.map((p) => p.z).filter(Boolean)).size
  const zemiNase = new Set(
    S.places.filter((p) => store.stav[p.id] === 'visited').map((p) => p.z).filter(Boolean)
  ).size

  const blizko = nejblizOdsud()
  const top = nejlepsi()

  const karty = tipyDne().map((p) => {
    const obr = obrazekMista(p, PHOTOS)
    const prio = store.prio[p.id] || 0
    return {
      id: p.id,
      obrazek: obr.src,
      zaloha: obr.zaloha,
      vyrez: obr.vyrez,
      nadpis: nm(p),
      podnadpis: p.r || p.z,
      meta: prio >= 2 ? `${IC('i-fire')}slíbeno` : esc(p.d || ''),
    }
  })

  const pozn = rozkoukana()

  el.innerHTML =
    heroPas({ obrazek: heroObr, nadpis: greeting(), podtitulek: 'Ťukni na pozdrav a nastav si oslovení.' }) +
    `<div class="list">` +
    // Za jízdy se ptáme jinak: „jak nám to jede", ne „co máme naplánované".
    // Tomu odpovídá i akce vpravo – do plánu se za volantem nechodí.
    sekce(jedeSe() ? 'Právě jedeme' : 'Naše výprava', {
      akce: jedeSe() ? 'Na cestě' : 'Otevřít plán',
      akceId: 'homePlan',
    }) +
    vypravaKarta() +
    pruhVypravy() +
    (blizko
      ? sekce('Nejblíž odsud', { pozn: fmtKm(blizko.km) }) +
        (() => {
          const obr = obrazekMista(blizko.p, PHOTOS)
          return radek({
            id: blizko.p.id,
            obrazek: obr.src,
            zaloha: obr.zaloha,
            vyrez: obr.vyrez,
            nadpis: nm(blizko.p),
            podnadpis: blizko.p.r || blizko.p.z,
            meta: `${IC('i-pinme')}${esc(blizko.p.t || '')}`,
          })
        })()
      : '') +
    sekce('Možná dnes. Možná někdy.') +
    karusel(karty) +
    (pozn.length
      ? sekce('Rozkoukané', { pozn: 'místa s poznámkou' }) +
        pozn
          .map((p) => {
            const obr = obrazekMista(p, PHOTOS)
            const t = (store.notes[p.id] || '').trim()
            return radek({
              id: p.id,
              obrazek: obr.src,
              zaloha: obr.zaloha,
              vyrez: obr.vyrez,
              nadpis: nm(p),
              podnadpis: p.r || p.z,
              meta: `${IC('i-quill')}„${esc(t.slice(0, 40))}${t.length > 40 ? '…' : ''}“`,
            })
          })
          .join('')
      : '') +
    (top.length
      ? sekce('Naše nejlepší', { pozn: 'pět hvězd' }) +
        top
          .map((p) => {
            const obr = obrazekMista(p, PHOTOS)
            return radek({
              id: p.id,
              obrazek: obr.src,
              zaloha: obr.zaloha,
              vyrez: obr.vyrez,
              nadpis: nm(p),
              podnadpis: p.r || p.z,
              meta: `${IC('i-star')}${esc(p.t || '')}`,
            })
          })
          .join('')
      : '') +
    sekce('Náš Vandrbuch v číslech') +
    `<div class="cislapanel">` +
    cislaRada([
      { ikona: 'i-map', hodnota: String(S.places.length), popisek: 'míst' },
      { ikona: 'i-check', hodnota: String(navstiveno), popisek: 'navštíveno' },
      { ikona: 'i-route', hodnota: String(store.plan.length), popisek: 'v plánu' },
      { ikona: 'i-globe', hodnota: `${zemiNase}/${zemiCelkem}`, popisek: 'zemí' },
    ]) +
    `</div><div style="height:22px"></div></div>`

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
