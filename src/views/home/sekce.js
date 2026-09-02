/**
 * Co je na Domů, v jakém pořadí a co z toho je vidět.
 *
 * PROČ TENHLE SOUBOR VZNIKL (hlášení `tadeas-f32-009`): Domů měla sedm sekcí
 * v pevném pořadí, zadrátovaném v jednom dlouhém řetězci v `home.js`. Každý
 * ale používá appku jinak — kdo neplánuje, nechce kartu výpravy nahoře.
 *
 * JEDEN SEZNAM, DVA ČTENÁŘI. `home.js` z něj vykresluje, Nastavení z něj bere
 * názvy a důvody do tabulky se šipkami. Kdyby si Nastavení psalo svůj vlastní
 * seznam, do měsíce by se rozešly a přejmenovaná sekce by se v tabulce
 * jmenovala jinak než na obrazovce.
 *
 * `html()` JE FUNKCE, NE ŘETĚZEC, a to je celý smysl přestavby. `renderHome()`
 * dřív napřed spočítala všechno — šest průchodů přes 580 míst (nejbližší
 * odsud, nejlepší, tipy dne, rozkoukaná, dvakrát množina zemí) — a teprve pak
 * skládala HTML. Kdyby se jen přeskládalo pořadí, schovaná sekce by se dál
 * počítala. Takhle schování ušetří i tu práci.
 *
 * Pozdrav v hero pásu tu není schválně: to není sekce, to je hlavička
 * obrazovky. Stejně tak obal `.list` — ten stojí kolem pořadí, ne v něm.
 */

import { S, store, prefs, savePrefs } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { dkm, fmtKm } from '../../core/geo.js'
import { IC } from '../../icons/sprite.js'
import { hash } from '../../components/postcard.js'
import { obrazekMista } from '../../data/kategorieFoto.js'
import { PHOTOS } from '../../core/store.js'
import { sekce, fotomrizka, radek, cislaRada } from '../../components/vzory.js'
import { vypravaKarta } from '../../components/vypravaKarta.js'
import { prubehVypravy } from '../plan/plan.js'
import { jedeSe } from '../plan/cestaData.js'

/** Kolik karet je v mřížce „Možná dnes" – tři sloupce, dvě řady. */
const TIPU = 6
/** Kolik rozkoukaných řádků se vypíše. */
const ROZKOUKANYCH = 3
/** Kolik pětihvězdičkových míst se vypíše. */
const NEJLEPSICH = 3

/* ================= podklady sekcí ================= */

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

/** Řádek místa – používají ho tři sekce, tak ať to je na jednom místě. */
function radekMista(p, meta) {
  const obr = obrazekMista(p, PHOTOS)
  return radek({
    id: p.id,
    obrazek: obr.src,
    zaloha: obr.zaloha,
    vyrez: obr.vyrez,
    nadpis: nm(p),
    podnadpis: p.r || p.z,
    meta,
  })
}

/* ================= registr sekcí ================= */

/**
 * Sekce Domů. **Pořadí v tomhle poli je výchozí pořadí na obrazovce** – nesmí
 * se měnit bez rozmyslu: `smoke` ověřuje, že za jízdy je první „Právě jedeme".
 *
 * - `proc()` vrátí důvod, proč se sekce zrovna nemá co ukázat, nebo prázdno.
 *   Nastavení ho píše k řádku, aby zapnutí sekce, která stejně nic neukáže,
 *   nevypadalo jako chyba.
 * - `html()` staví obsah. Volá se jen u viditelných sekcí.
 *
 * @type {Array<{id: string, nazev: string, proc: () => string, html: () => string}>}
 */
export const SEKCE_DOMU = [
  {
    id: 'vyprava',
    nazev: 'Naše výprava',
    proc: () => '',
    // Za jízdy se ptáme jinak: „jak nám to jede", ne „co máme naplánované".
    // Tomu odpovídá i akce vpravo – do plánu se za volantem nechodí.
    html: () =>
      sekce(jedeSe() ? 'Právě jedeme' : 'Naše výprava', {
        akce: jedeSe() ? 'Na cestě' : 'Otevřít plán',
        akceId: 'homePlan',
      }) +
      vypravaKarta() +
      pruhVypravy(),
  },
  {
    id: 'pocasi',
    // JEN „Počasí". Od září 2026 se přepíná mezi „u tebe" a „na cestě"
    // (`tadeas-f32-010`), takže pevné „u tebe" v nadpisu by lhalo.
    nazev: 'Počasí',
    // Hlavní vypínač počasí je ve vlastní skupině Nastavení, protože řídí
    // i to, jestli se sahá na síť. Oko v tabulce Domů je jen o rozvržení.
    proc: () => (prefs.pocasi ? '' : 'vypnuté v Nastavení → Počasí'),
    // VYPNUTÉ POČASÍ MUSÍ ZMIZET, ne jen mlčet. Oko v tabulce Domů řídí
    // rozvržení, tenhle vypínač celou funkci včetně sítě – kdyby se sekce
    // kreslila dál, zůstal by po ní prázdný nadpis. Hlídá to `smoke`.
    // Obsah se doplní až po načtení – tohle je synchronní, předpověď je síť.
    html: () =>
      prefs.pocasi
        ? // PŘEPÍNAČ REŽIMU je v pravém slotu nadpisu; nejbližší město se
          // přestěhovalo pod pruh hodin, které popisuje. Popisek tlačítka
          // pojmenovává BĚŽÍCÍ režim, ne ten, na který přepne – vedle nadpisu
          // se to čte jako „Počasí · u tebe". Ikona proto není šipka doprava:
          // ta slibuje odchod jinam, kdežto tenhle knoflík přepne obsah na
          // místě. Text i stav doplní `naplnPocasi()`, protože závisí na tom,
          // jestli je co ukázat.
          sekce('Počasí', { akce: 'u tebe', akceId: 'homePocasiRezim', akceIkona: 'i-obnovit' }) +
          '<div id="homePocasi"></div>'
        : '',
  },
  {
    id: 'blizko',
    nazev: 'Nejblíž odsud',
    proc: () => (S.userPos ? '' : 'potřebuje polohu'),
    html: () => {
      const b = nejblizOdsud()
      if (!b) return ''
      return (
        sekce('Nejblíž odsud', { pozn: fmtKm(b.km) }) +
        radekMista(b.p, `${IC('i-pinme')}${esc(b.p.t || '')}`)
      )
    },
  },
  {
    id: 'tipy',
    nazev: 'Možná dnes. Možná někdy.',
    proc: () => '',
    html: () =>
      sekce('Možná dnes. Možná někdy.') +
      fotomrizka(
        tipyDne().map((p) => {
          const obr = obrazekMista(p, PHOTOS)
          return {
            id: p.id,
            obrazek: obr.src,
            zaloha: obr.zaloha,
            vyrez: obr.vyrez,
            nadpis: nm(p),
            podnadpis: p.r || p.z,
            meta: (store.prio[p.id] || 0) >= 2 ? `${IC('i-fire')}slíbeno` : esc(p.d || ''),
          }
        })
      ),
  },
  {
    id: 'rozkoukane',
    nazev: 'Rozkoukané',
    proc: () => (rozkoukana().length ? '' : 'zatím žádná poznámka'),
    html: () => {
      const pozn = rozkoukana()
      if (!pozn.length) return ''
      return (
        sekce('Rozkoukané', { pozn: 'místa s poznámkou' }) +
        pozn
          .map((p) => {
            const t = (store.notes[p.id] || '').trim()
            return radekMista(p, `${IC('i-quill')}„${esc(t.slice(0, 40))}${t.length > 40 ? '…' : ''}“`)
          })
          .join('')
      )
    },
  },
  {
    id: 'nejlepsi',
    nazev: 'Naše nejlepší',
    proc: () => (nejlepsi().length ? '' : 'zatím nic na pět hvězd'),
    html: () => {
      const top = nejlepsi()
      if (!top.length) return ''
      return (
        sekce('Naše nejlepší', { pozn: 'pět hvězd' }) +
        top.map((p) => radekMista(p, `${IC('i-star')}${esc(p.t || '')}`)).join('')
      )
    },
  },
  {
    id: 'cisla',
    nazev: 'Náš Vandrbuch v číslech',
    proc: () => '',
    html: () => {
      const navstiveno = S.places.filter((p) => store.stav[p.id] === 'visited').length
      const zemiCelkem = new Set(S.places.map((p) => p.z).filter(Boolean)).size
      const zemiNase = new Set(
        S.places.filter((p) => store.stav[p.id] === 'visited').map((p) => p.z).filter(Boolean)
      ).size
      return (
        sekce('Náš Vandrbuch v číslech') +
        `<div class="cislapanel">` +
        cislaRada([
          { ikona: 'i-map', hodnota: String(S.places.length), popisek: 'míst' },
          { ikona: 'i-check', hodnota: String(navstiveno), popisek: 'navštíveno' },
          { ikona: 'i-route', hodnota: String(store.plan.length), popisek: 'v plánu' },
          { ikona: 'i-globe', hodnota: `${zemiNase}/${zemiCelkem}`, popisek: 'zemí' },
        ]) +
        `</div>`
      )
    },
  },
]

/** Výchozí pořadí – tak, jak sekce stojí v registru. */
export const VYCHOZI_PORADI = SEKCE_DOMU.map((s) => s.id)

/**
 * Pořadí sekcí podle předvoleb.
 *
 * MUSÍ UNÉST TŘI VĚCI, jinak se appka rozbije potichu:
 *
 *   1. **chybí předvolba** (nikdo pořadí neměnil) → výchozí,
 *   2. **`id`, které v uloženém pořadí není** → NA KONEC. Bez toho by po
 *      každém rozšíření appky nová sekce lidem s uloženým pořadím tiše
 *      zmizela a nikdo by nepoznal proč,
 *   3. **`id` dvakrát nebo neznámé** (poškozená předvolba, sekce ze starší
 *      verze) → zahodit. Dvakrát vykreslená sekce by vyrobila dvě stejná `id`
 *      v DOM a obsluha by se navěsila jen na první z nich.
 *
 * @returns {string[]}
 */
export function poradiSekci() {
  const ulozene = Array.isArray(prefs.domuPoradi) ? prefs.domuPoradi : []
  const znama = new Set(VYCHOZI_PORADI)
  const videne = new Set()
  const poradi = []
  for (const id of ulozene) {
    if (!znama.has(id) || videne.has(id)) continue
    videne.add(id)
    poradi.push(id)
  }
  for (const id of VYCHOZI_PORADI) if (!videne.has(id)) poradi.push(id)
  return poradi
}

/** Je sekce schovaná? */
export const jeSkryta = (id) => Array.isArray(prefs.domuSkryte) && prefs.domuSkryte.includes(id)

/**
 * Posune sekci o jedno místo nahoru (−1) nebo dolů (+1).
 *
 * Opsané z `posun()` ve `views/plan/plan.js`, které totéž dělá se zastávkami.
 * @param {string} id
 * @param {number} smer
 * @returns {boolean}  false = na kraji, nic se nestalo
 */
export function posunSekci(id, smer) {
  const poradi = poradiSekci()
  const i = poradi.indexOf(id)
  const j = i + smer
  if (i < 0 || j < 0 || j > poradi.length - 1) return false
  ;[poradi[j], poradi[i]] = [poradi[i], poradi[j]]
  prefs.domuPoradi = poradi
  savePrefs()
  return true
}

/** Přepne viditelnost sekce. */
export function prepniSekci(id) {
  const skryte = Array.isArray(prefs.domuSkryte) ? [...prefs.domuSkryte] : []
  const i = skryte.indexOf(id)
  if (i < 0) skryte.push(id)
  else skryte.splice(i, 1)
  prefs.domuSkryte = skryte
  savePrefs()
}

/** Vrátí výchozí pořadí a zase všechno zapne. */
export function vratVychoziSekce() {
  prefs.domuPoradi = [...VYCHOZI_PORADI]
  prefs.domuSkryte = []
  savePrefs()
}

/**
 * Poskládá obsah Domů. Sekce, které jsou schované, se ani nepočítají – proto
 * je `html()` funkce.
 * @returns {string}
 */
export function obsahDomu() {
  return poradiSekci()
    .filter((id) => !jeSkryta(id))
    .map((id) => SEKCE_DOMU.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => s.html())
    .join('')
}
