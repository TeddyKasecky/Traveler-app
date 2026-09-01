/**
 * Záložka Objevuj – „nevím, kam chci".
 *
 * Skladba podle mockupu `grafika/…11_09_49 (2).png`: hero pás s otázkou,
 * oblíbené kolekce jako dlaždice, nálady jako pilulky, mřížka doporučených
 * a rychlá inspirace. Oblasti zůstávají dole.
 *
 * PROČ SEM PŘIŠLY NÁLADY: v předloze jsou právě tady, a dává to smysl —
 * „jakou máte náladu" je otázka pro toho, kdo neví, kam chce. Na Domů byly
 * mezi statistikami a přehledem bikeparků, kde je otázka jiná: co dnes.
 */

import { S, F, store, prefs } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { dkm, zjistiPolohu } from '../../core/geo.js'
import { resetFiltru, visible } from '../../core/filters.js'
import { aktivujZalozku } from '../../core/router.js'
import { COLL } from '../../data/collections.js'
import { HOME_MOODS } from '../../data/moods.js'
import { obrazekMista } from '../../data/kategorieFoto.js'
import { PHOTOS } from '../../core/store.js'
import { IC } from '../../icons/sprite.js'
import { hash } from '../../components/postcard.js'
import { srovnejPocty } from '../../components/filterPanel.js'
import { syncFiltersUI } from '../../components/chip.js'
import { nastavRazeni } from '../list/list.js'
import { heroPas, sekce, dlazdice, pilulky, fotomrizka } from '../../components/vzory.js'
import { toast } from '../../components/toast.js'
import { goTo, draw, priblizNaFiltr } from '../../map/map.js'
import { applyMood, zapnuteNalady } from '../home/moods.js'
import heroObr from '../../assets/hero/objevuj.webp'

/**
 * Kolik karet je v mřížce doporučených – tři sloupce, tři řady.
 *
 * Do srpna 2026 jich bylo osm a byl to posuvný pás, kde na počtu nezáleželo.
 * V mřížce po třech by osmá řada zůstala rozbitá (3 + 3 + 2), takže přibyla
 * devátá. Objevuj je obrazovka na inspiraci, tak ať je jí plná řada.
 */
const DOPORUCENYCH = 9
/** Oblast se nabídne, až když v ní jsou aspoň dvě místa. */
const MIN_V_OBLASTI = 2

/**
 * Rychlá inspirace – hotové kombinace filtrů, osm dlaždic ve dvou řadách.
 *
 * DO ZÁŘÍ 2026 TO BYLY ČTYŘI PRUHY A TŘI Z NICH BYLY VADNÉ (`tadeas-f32-013`):
 *
 *   - „Co je blízko" nenastavovalo NIC (`nastav: () => {}`), takže Seznam
 *     ukázal všech 580 míst, kdežto bublina hlásila počet těch do 60 km.
 *     Prázdné to bylo proto, že filtr na vzdálenost v `F` neexistuje —
 *     dnes proto ta dlaždice mění ŘAZENÍ, ne filtr, a slibuje to i názvem.
 *   - „Ještě jsme tam nebyli" nastavovalo `F.stav = 'wish'`, což podle
 *     `core/filters.js` znamená „cokoli kromě navštíveného", tedy 575 z 580.
 *     Uložená srdcem jsou `F.ulozene`; ten rozdíl popisuje i `check-filtry.mjs`.
 *   - „Co jsme si slíbili" počítalo `prio >= 2`, ale filtr schovává `prio < 3`,
 *     takže dlaždice napočítala místa, která Seznam vzápětí schoval.
 *
 * PROTO TU UŽ NENÍ `vyber()`. Každá položka je jen filtr; kolik míst vrátí, se
 * počítá jedním způsobem — `visible()` po nastavení. Dvojí počítání bylo přesně
 * to, čím se ta nesrovnalost schovala.
 *
 * `podminka` vrací `false`, když na dlaždici nejsou data. Nezmizí — zašedne
 * a řekne `duvod`. Poloprázdná mřížka vypadá rozbitě, kdežto dlaždice, která
 * říká „zatím jsi nic nehodnotil", je návod.
 */
const INSPIRACE = [
  {
    id: 'blizko',
    nadpis: 'Nejblíž odsud',
    popis: 'Seřadí seznam od nejbližšího',
    ikona: 'i-pinme',
    podminka: () => !!S.userPos,
    duvod: 'Nevím, kde jsi',
    // JEDINÁ, KTERÁ NEFILTRUJE. Filtr na vzdálenost v `F` není a kvůli jedné
    // dlaždici se nezavádí — muselo by přibýt pole do panelu Filtry, do
    // odznaku, do `resetFiltru()` i do kontrol. Řazení „Od nejbližšího"
    // přibylo s `tadeas-f32-015` a dělá přesně to, co dlaždice slibuje.
    razeni: 'blizko',
    nastav: () => {},
  },
  {
    id: 'zdarma-deti',
    nadpis: 'Zdarma a s dětmi',
    popis: 'Bez vstupného, zvládnou to všichni',
    ikona: 'i-kid',
    podminka: () => true,
    nastav: () => {
      F.free = true
      F.kids = true
    },
  },
  {
    id: 'zdarma',
    nadpis: 'Zadarmo',
    popis: 'Nic se neplatí',
    ikona: 'i-euro',
    podminka: () => true,
    nastav: () => {
      F.free = true
    },
  },
  {
    id: 'nedojeli',
    nadpis: 'Kam jsme nedojeli',
    popis: 'Všechno kromě navštíveného',
    ikona: 'i-boot',
    // TADY BÝVALA „Města a památky". Byla to ale KATEGORIE, a od září 2026
    // kategorie patří náladám (`tadeas-f32-011`) – inspirace odpovídá na
    // „co teď dává smysl", ne na „jaké místo chci". Dvě mřížky na Objevuj
    // dělající totéž pod jinými názvy jsou to, čemu se tou dělbou vyhýbáme.
    podminka: () => true,
    nastav: () => {
      F.stav = 'wish'
    },
  },
  {
    id: 'ulozene',
    nadpis: 'Uložená na potom',
    popis: 'Co sis označil záložkou',
    // ZÁLOŽKA, NE SRDCE. `check-ikony` na to má vlastní kontrolu a `chip.js`
    // kreslí rychlý filtr „Uložená" stejnou ikonou.
    ikona: 'i-zalozka',
    podminka: () => Object.values(store.stav).includes('wish'),
    duvod: 'Zatím sis nic neuložil',
    nastav: () => {
      F.ulozene = true
    },
  },
  {
    id: 'musime',
    nadpis: 'Co jsme si slíbili',
    popis: 'Místa označená plamínky',
    ikona: 'i-fire',
    // TŘI PLAMÍNKY, ne dva: `core/filters.js` schovává všechno pod třemi.
    // Dřív tu byla dvojka a dlaždice tím slibovala víc, než Seznam ukázal.
    podminka: () => Object.values(store.prio).some((x) => x >= 3),
    duvod: 'Zatím nic nemá tři plamínky',
    nastav: () => {
      F.fire = true
    },
  },
  {
    id: 'nejlepsi',
    nadpis: 'Nejlépe hodnocená',
    popis: 'Čtyři hvězdy a víc',
    ikona: 'i-star',
    podminka: () => Object.values(store.rating).some((x) => x >= 4),
    duvod: 'Zatím jsi nic nehodnotil',
    nastav: () => {
      F.wow = true
    },
  },
  {
    id: 'byli',
    nadpis: 'Byli jsme tady',
    popis: 'Co máte za sebou',
    // Fajfka jako u rychlého filtru „Byli jsme" v `chip.js`.
    ikona: 'i-check',
    podminka: () => Object.values(store.stav).includes('visited'),
    duvod: 'Zatím nikde',
    nastav: () => {
      F.stav = 'visited'
    },
  },
]

/**
 * Vybere místa do mřížky doporučených.
 *
 * Los je vážený stejně jako „Překvap mě" (nenavštívená mají náskok, priorita
 * a hodnocení váhu zvyšují), ale **seed je datum**, ne náhoda: během dne se
 * nabídka nemění, druhý den je jiná. Kdo přijde dvakrát za hodinu, nemá pocit,
 * že mu aplikace pod rukama přeskládává obsah.
 */
function doporucene() {
  const den = new Date().toISOString().slice(0, 10)
  const skore = (p) =>
    (store.stav[p.id] === 'visited' ? 0 : 3) +
    (store.prio[p.id] || 0) * 2 +
    (store.rating[p.id] || 0) * 0.5 +
    (p.img ? 1 : 0) +
    (hash(den + p.id) % 5)

  return [...S.places].sort((a, b) => skore(b) - skore(a)).slice(0, DOPORUCENYCH)
}

export function renderDisc() {
  const el = document.getElementById('discInner')

  /* ---- kolekce ---- */
  const kolekce = COLL.map((c) => ({
    id: c.k,
    nadpis: c.n,
    ikona: c.i,
    popisek: `${S.places.filter((p) => (p.col || []).includes(c.k)).length} míst`,
    barva: c.c,
  })).filter((k) => !k.popisek.startsWith('0 '))

  /* ---- nálady ---- */
  // JEN ZAPNUTÉ (`tadeas-f32-011`). Ze čtrnácti se vypisují ty, které si člověk
  // nechal v Profilu; výchozí je dnešních šest, takže se nikomu nic nezmění,
  // dokud si nesáhne. Pořadí drží `HOME_MOODS`, ne pořadí zapínání – jinak by
  // se pilulky přeskládaly pokaždé, když se nějaká vypne a zase zapne.
  const zapnute = new Set(zapnuteNalady())
  const nalady = HOME_MOODS.filter((m) => zapnute.has(m.id)).map((m) => ({
    id: m.id,
    popisek: m.l,
    ikona: m.ic,
    on: prefs.lastMood === m.id,
  }))

  /* ---- doporučené ---- */
  const karty = doporucene().map((p) => {
    const obr = obrazekMista(p, PHOTOS)
    const hv = store.rating[p.id]
    return {
      id: p.id,
      obrazek: obr.src,
      zaloha: obr.zaloha,
      vyrez: obr.vyrez,
      nadpis: p.n.split(/\s[–(]/)[0],
      podnadpis: p.r || p.z,
      meta: hv ? `<span class="hvezdy">${'★'.repeat(hv)}</span>` : esc(p.d || ''),
    }
  })

  /* ---- rychlá inspirace ---- */
  // NIC SE NEODFILTROVÁVÁ. Do září 2026 se dlaždice bez dat schovala, takže
  // na čerstvém profilu svítila jediná ze čtyř a sekce vypadala rozbitě.
  // Dnes zůstane vidět, zašedne a řekne proč — mřížka 4×2 je tím vždycky
  // plná a prázdná dlaždice je návod, ne díra.
  const inspirace = INSPIRACE.map((i) => ({ i, jde: i.podminka() }))

  /* ---- oblasti ---- */
  const oblasti = {}
  for (const p of S.places) oblasti[p.r] = (oblasti[p.r] || 0) + 1
  const top = Object.entries(oblasti)
    .sort((a, b) => b[1] - a[1])
    .filter(([, n]) => n >= MIN_V_OBLASTI)

  el.innerHTML =
    heroPas({
      obrazek: heroObr,
      nadpis: 'Kam vás dnes zavede cesta?',
      podtitulek: 'Inspirace na výlety podle počasí, nálady i času, který máte.',
    }) +
    `<div class="list">` +
    sekce('Oblíbené kolekce') +
    `<div id="discKolekce">${dlazdice(kolekce)}</div>` +
    // ZHASNOUT JDE VŠECHNY a pak sekce zmizí celá – nezůstane po ní prázdný
    // nadpis, stejně jako u vypnutého počasí na Domů. Kde se zapínají, řekne
    // Profil; je to stav na dvě ťuknutí.
    (nalady.length ? sekce('Jakou máte náladu?') + pilulky(nalady, 'nalady zalomene') : '') +
    sekce('Doporučené pro vás', { akce: 'Zobrazit vše', akceId: 'discVse' }) +
    fotomrizka(karty) +
    sekce('Rychlá inspirace') +
    // VLASTNÍ OBAL. Obsluha kolekcí níž bere `.dlazdice-kus[data-id]`, takže
    // bez něj by ťuknutí na inspiraci spustilo kolekci téhož `id` — nebo nic.
    `<div id="discInspirace">${dlazdice(
      inspirace.map(({ i, jde }) => ({
        id: i.id,
        nadpis: i.nadpis,
        // Zašedlá dlaždice říká DŮVOD místo slibu, který nemůže splnit.
        popisek: jde ? i.popis : i.duvod,
        ikona: i.ikona,
        nejde: !jde,
      }))
    )}</div>` +
    sekce('Oblasti', { pozn: `${top.length} oblastí` }) +
    `<div class="reglist">${top
      .map(([r, n]) => `<button class="reg" data-reg="${esc(r)}">${esc(r)}<i>${n}</i></button>`)
      .join('')}</div>` +
    (S.userPos
      ? ''
      : `<div class="empty" style="padding:22px 24px">${IC('i-pinme')}Zapni polohu a ukážu, co máte na dosah.
         <div class="btnrow" style="justify-content:center;margin-bottom:0"><button class="btn small primary" id="discLoc">${IC('i-pinme')}Najít mě</button></div></div>`) +
    `<div style="height:20px"></div></div>`

  /* ---- obsluha ---- */
  // ZÚŽENO NA OBAL KOLEKCÍ. Dlaždice inspirace mají tutéž třídu, takže by se
  // do téhle obsluhy jinak chytily taky (`tadeas-f32-013`).
  for (const b of el.querySelectorAll('#discKolekce .dlazdice-kus[data-id]')) {
    b.onclick = () => nastavKolekci(b.dataset.id)
  }
  for (const b of el.querySelectorAll('#discInspirace .dlazdice-kus[data-id]')) {
    b.onclick = () => spustInspiraci(b.dataset.id)
  }
  for (const b of el.querySelectorAll('.pilulka[data-id]')) {
    b.onclick = () => applyMood(HOME_MOODS.find((m) => m.id === b.dataset.id))
  }
  for (const k of el.querySelectorAll('.fotokarta[data-id]')) {
    k.onclick = () => goTo(S.byId[k.dataset.id])
  }
  for (const b of el.querySelectorAll('[data-reg]')) {
    b.onclick = () => {
      // Zkratka NAHRAZUJE výběr, nepřidává se k němu: „ukaž mi Tyrolsko"
      // znamená Tyrolsko, ne Tyrolsko k tomu, co bylo zaškrtnuté předtím.
      const kam = b.dataset.reg
      F.reg.clear()
      F.reg.add(kam)
      srovnejPocty()
      aktivujZalozku('map')
      draw()
      priblizNaFiltr(visible())
      toast(`${kam}: ${visible().length} míst`)
    }
  }
  const vse = document.getElementById('discVse')
  if (vse) vse.onclick = () => aktivujZalozku('list')
  const dl = document.getElementById('discLoc')
  if (dl) dl.onclick = zjistiPolohu
}

/** Zapne kolekci jako filtr a ukáže ji na mapě. */
function nastavKolekci(klic) {
  F.coll = F.coll === klic ? '' : klic
  const c = COLL.find((x) => x.k === klic)
  aktivujZalozku('map')
  draw()
  const vs = visible()
  priblizNaFiltr(vs)
  toast(F.coll ? `${c.n}: ${vs.length} míst` : 'Filtr zrušen')
}

/**
 * Spustí rychlou inspiraci: nastaví filtry a odejde na Seznam.
 *
 * Na Seznam, ne na mapu — inspirace vrací hrst míst, která se čtou,
 * ne hledají v prostoru. Kolekce a oblasti naopak vedou na mapu.
 */
function spustInspiraci(id) {
  const i = INSPIRACE.find((x) => x.id === id)
  if (!i || !i.podminka()) return

  // NAHRAZUJE VÝBĚR, NEPŘIDÁVÁ SE K NĚMU — stejně jako zkratka na oblast pár
  // řádků níž. Bez toho se inspirace přičetla k tomu, co bylo zapnuté, a
  // vyšlo nesouvisející nebo prázdno.
  resetFiltru()
  i.nastav()
  // BEZ TOHO SE TO „NEOBJEVÍ VE FILTRECH" (`tadeas-f32-013`): pilulky ani
  // panel Filtry o nastavení nevědí. `applyMood()` i `filterPanel.js` to volají.
  syncFiltersUI()
  if (i.razeni) nastavRazeni(i.razeni)

  aktivujZalozku('list')
  draw()
  // JEDNO ČÍSLO, NE DVĚ. Dřív se počítalo vlastním predikátem nad `visible()`,
  // takže bublina hlásila něco jiného, než kolik Seznam ukázal — právě tím se
  // ty tři vady schovaly.
  const n = visible().length
  toast(`${i.nadpis}: ${n} ${n === 1 ? 'místo' : n < 5 ? 'místa' : 'míst'}`)
}
