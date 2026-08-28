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
import { visible } from '../../core/filters.js'
import { aktivujZalozku } from '../../core/router.js'
import { COLL } from '../../data/collections.js'
import { HOME_MOODS } from '../../data/moods.js'
import { obrazekMista } from '../../data/kategorieFoto.js'
import { PHOTOS } from '../../core/store.js'
import { IC } from '../../icons/sprite.js'
import { hash } from '../../components/postcard.js'
import { srovnejPocty } from '../../components/filterPanel.js'
import { heroPas, sekce, dlazdice, pilulky, fotomrizka, radek } from '../../components/vzory.js'
import { toast } from '../../components/toast.js'
import { goTo, draw, priblizNaFiltr } from '../../map/map.js'
import { applyMood } from '../home/moods.js'
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
 * Rychlá inspirace – hotové kombinace filtrů.
 *
 * Předloha má „Výhledy do 15 km", „Méně známá místa", „Podzimní kouzlo".
 * Tady jsou to skutečné filtry nad našimi daty, ne vymyšlené kategorie:
 * každá položka umí spočítat, kolik míst jí odpovídá, a nastavit se.
 */
const INSPIRACE = [
  {
    id: 'blizko',
    nadpis: 'Co je blízko',
    popis: 'Do hodiny cesty od dodávky',
    ikona: 'i-pinme',
    /** Bez známé polohy nemá smysl – schová se. */
    jde: () => !!S.userPos,
    vyber: (mista) => mista.filter((p) => dkm(S.userPos, p) < 60),
    nastav: () => {},
  },
  {
    id: 'zdarma-deti',
    nadpis: 'Zdarma a s dětmi',
    popis: 'Bez vstupného, zvládnou to všichni',
    ikona: 'i-kid',
    jde: () => true,
    vyber: (mista) => mista.filter((p) => (p.c || '').startsWith('Zdarma') && p.ch === 'Ano'),
    nastav: () => {
      F.free = true
      F.kids = true
    },
  },
  {
    id: 'musime',
    nadpis: 'Co jsme si slíbili',
    popis: 'Místa označená plamínky',
    ikona: 'i-fire',
    jde: () => Object.values(store.prio).some((x) => x >= 2),
    vyber: (mista) => mista.filter((p) => (store.prio[p.id] || 0) >= 2),
    nastav: () => {
      F.fire = true
    },
  },
  {
    id: 'nevideno',
    nadpis: 'Ještě jsme tam nebyli',
    popis: 'Z míst, která máte v seznamu přání',
    ikona: 'i-boot',
    jde: () => Object.values(store.stav).includes('wish'),
    vyber: (mista) => mista.filter((p) => store.stav[p.id] === 'wish'),
    nastav: () => {
      F.stav = 'wish'
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
  const nalady = HOME_MOODS.map((m) => ({
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
  const inspirace = INSPIRACE.filter((i) => i.jde())
    .map((i) => ({ i, n: i.vyber(S.places).length }))
    .filter(({ n }) => n > 0)

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
    dlazdice(kolekce) +
    sekce('Jakou máte náladu?') +
    pilulky(nalady, 'nalady') +
    sekce('Doporučené pro vás', { akce: 'Zobrazit vše', akceId: 'discVse' }) +
    fotomrizka(karty) +
    (inspirace.length
      ? sekce('Rychlá inspirace') +
        inspirace
          .map(({ i, n }) =>
            radek({
              id: i.id,
              nadpis: i.nadpis,
              podnadpis: i.popis,
              meta: `${IC(i.ikona)}${n} ${n === 1 ? 'místo' : n < 5 ? 'místa' : 'míst'}`,
              vpravo: IC('i-sipka', 'font-size:17px;color:var(--text3)'),
              tridy: 'inspirace',
            })
          )
          .join('')
      : '') +
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
  for (const b of el.querySelectorAll('.dlazdice-kus[data-id]')) {
    b.onclick = () => nastavKolekci(b.dataset.id)
  }
  for (const b of el.querySelectorAll('.pilulka[data-id]')) {
    b.onclick = () => applyMood(HOME_MOODS.find((m) => m.id === b.dataset.id))
  }
  for (const k of el.querySelectorAll('.fotokarta[data-id]')) {
    k.onclick = () => goTo(S.byId[k.dataset.id])
  }
  for (const r of el.querySelectorAll('.radek.inspirace[data-id]')) {
    r.onclick = () => spustInspiraci(r.dataset.id)
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
  if (!i) return
  i.nastav()
  aktivujZalozku('list')
  draw()
  toast(`${i.nadpis}: ${i.vyber(visible()).length} míst`)
}
