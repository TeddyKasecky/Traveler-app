/**
 * Záložka Seznam – „vím, co chci".
 *
 * Skladba podle mockupu `grafika/…11_09_49 (3).png`: hero pás, vyhledávací
 * pilulka s tlačítkem filtrů, čtyři rozbalovací pilulky, řádek aktivních
 * filtrů, počet nalezených se řazením a pak řádky míst.
 *
 * PROČ JE OVLÁDÁNÍ V `index.html` A NE TADY: `#q`, `#fReg`, `#fZeme` a `#fTyp`
 * mají obsluhu navěšenou při startu (`filterPanel.js`). Kdyby je `renderList()`
 * tvořil znovu při každém překreslení, obsluha by se ztratila – prvek by na
 * obrazovce zůstal a jen by přestal reagovat. Vykresluje se proto jen obsah,
 * ne lišta.
 */

import { S, F, store, save } from '../../core/store.js'
import { visible } from '../../core/filters.js'
import { dkm, fmtKm } from '../../core/geo.js'
import { esc } from '../../core/html.js'
import { COLL } from '../../data/collections.js'
import { KAT } from '../../data/categories.js'
import { obrazekMista } from '../../data/kategorieFoto.js'
import { IC } from '../../icons/sprite.js'
import { radek, heroPas, stavPill, ikonBtn } from '../../components/vzory.js'
import { goTo, draw } from '../../map/map.js'
import { vyberZeSeznamu } from '../../components/dialog.js'
import { PHOTOS } from '../../core/store.js'
import heroObr from '../../assets/hero/seznam.webp'

/** Kolik řádků se nejvýš vykreslí, dokud nikdo neklikne na „Zobrazit dalších 50“. */
const STROP = 250

/** Kolik řádků je aktuálně rozbaleno (N10). */
let zobrazeno = STROP

/** Otisk poslední sady id – když se změní (nový filtr/hledání), `zobrazeno` se vrátí na STROP. */
let posledniSada = ''

/**
 * Seřadí místa podle volby v `#fRazeni`.
 *
 * „Doporučené" je schválně dnešní chování — se známou polohou podle
 * vzdálenosti, jinak česky abecedně. Kdo řazení nesáhne, nic se mu nezmění.
 *
 * @param {Record<string, any>[]} mista
 * @returns {{p: Record<string, any>, d: number|null}[]}
 */
/**
 * Čím se dá řadit. Pořadí je pořadí v nabídce.
 *
 * `potrebujePolohu` zašedne volbu, dokud appka neví, kde jsi – řadit podle
 * vzdálenosti od neznámého bodu nejde a tichý přeskok zpátky na abecedu by
 * vypadal jako porouchané tlačítko.
 */
export const RAZENI = [
  { id: 'dopor', popisek: 'Doporučené' },
  { id: 'blizko', popisek: 'Od nejbližšího', potrebujePolohu: true },
  { id: 'daleko', popisek: 'Od nejvzdálenějšího', potrebujePolohu: true },
  { id: 'abc', popisek: 'Podle abecedy' },
  { id: 'hodnoceni', popisek: 'Podle hodnocení' },
  { id: 'doba', popisek: 'Podle doby' },
]

/**
 * Zvolené řazení. V paměti, ne v DOM – tlačítko od srpna 2026 hodnotu nenese,
 * jen ji vypisuje.
 */
let razeni = 'dopor'

function serad(mista) {
  const jak = razeni
  const sD = mista.map((p) => ({ p, d: S.userPos ? dkm(S.userPos, p) : null }))

  if (jak === 'abc') return sD.sort((a, b) => a.p.n.localeCompare(b.p.n, 'cs'))
  if (jak === 'hodnoceni') return sD.sort((a, b) => (store.rating[b.p.id] || 0) - (store.rating[a.p.id] || 0))
  // Bez polohy se `d` nedá spočítat; volba je v nabídce zašedlá, ale kdyby se
  // sem přesto dostala (stará předvolba), spadne to na abecedu místo na NaN.
  if ((jak === 'blizko' || jak === 'daleko') && S.userPos) {
    return sD.sort((a, b) => (jak === 'blizko' ? a.d - b.d : b.d - a.d))
  }
  if (jak === 'doba') {
    // `d` je volný text („2-3 h“, „0,5-1 h“). Řadí se podle prvního čísla,
    // co v něm je – přesnější to z těch dat udělat nejde.
    const cislo = (t) => parseFloat(String(t).replace(',', '.')) || 99
    return sD.sort((a, b) => cislo(a.p.d) - cislo(b.p.d))
  }
  return S.userPos ? sD.sort((a, b) => a.d - b.d) : sD.sort((a, b) => a.p.n.localeCompare(b.p.n, 'cs'))
}

/**
 * Otevře nabídku řazení. Věší se na `#fRazeni` při startu (`filterPanel.js`),
 * proto je to export a ne obsluha uvnitř `renderList()` – tlačítko je staticky
 * v `index.html` a překreslení seznamu by obsluhu smazalo.
 */
export async function otevriRazeni() {
  const v = await vyberZeSeznamu({
    nadpis: 'Seřadit',
    polozky: RAZENI.map((r) => ({
      id: r.id,
      popisek: r.popisek,
      on: r.id === razeni,
      disabled: r.potrebujePolohu && !S.userPos,
      meta: r.potrebujePolohu && !S.userPos ? 'potřebuje polohu' : '',
    })),
  })
  if (!v) return
  razeni = v
  renderList()
}

/** Popisek na tlačítku – jediné místo, kde se zvolené řazení vypisuje. */
function srovnejTlacitkoRazeni() {
  const b = document.getElementById('fRazeni')
  if (!b) return
  const r = RAZENI.find((x) => x.id === razeni) || RAZENI[0]
  b.innerHTML = `Seřadit: <b>${esc(r.popisek)}</b>${IC('i-sipka')}`
}

/**
 * Meta řádek pod názvem.
 *
 * Předloha má ★ u každého místa. Hodnocení si ale dává uživatel a většina
 * z 580 míst ho nemá, takže se ukáže jen kde je; jinde nastoupí doba,
 * která je vyplněná u všech. Žádná vymyšlená čísla.
 */
function meta(p, d) {
  const k = KAT[p.k] || {}
  const hv = store.rating[p.id]
  const kus = [`${IC(k.i)}${esc(p.t)}`]
  if (hv) kus.push(`<span class="hvezdy">${'★'.repeat(hv)}</span>`)
  else if (p.d) kus.push(`${IC('i-clock')}${esc(p.d)}`)
  if (d != null) kus.push(`${IC('i-nav')}${fmtKm(d)}`)
  return kus.join('<span class="tecka">·</span>')
}

export function renderList() {
  const heroEl = document.getElementById('listHero')
  const aktivniEl = document.getElementById('listAktivni')
  const pocetEl = document.getElementById('listPocet')
  const kartyEl = document.getElementById('listKarty')
  if (!kartyEl) return

  if (!heroEl.innerHTML) {
    heroEl.innerHTML = heroPas({
      obrazek: heroObr,
      nadpis: 'Seznam míst',
      podtitulek: 'Najdi místa, která tě volají.',
    })
  }

  srovnejTlacitkoRazeni()
  const serazene = serad(visible())

  // Nová sada (jiný filtr/hledání) vrací rozbalení zpátky na STROP – jinak
  // by po zpřesnění hledání zůstalo „rozbaleno na 400“ z předchozího, širšího
  // výsledku a UI by ukazovalo zavádějící číslo.
  const sada = serazene.map(({ p }) => p.id).join(',')
  if (sada !== posledniSada) zobrazeno = STROP
  posledniSada = sada

  // Řádek aktivních filtrů. V předloze je jen když něco filtruje.
  const aktivni = [
    F.coll && COLL.find((c) => c.k === F.coll)?.n,
    F.reg,
    F.zeme,
    F.typ,
    F.stav === 'wish' ? 'Nenavštívená' : F.stav === 'visited' ? 'Navštíveno' : '',
    ...[...F.kat],
  ].filter(Boolean)

  aktivniEl.innerHTML = aktivni.length
    ? `<div class="aktivni">Filtry: ${aktivni.map(esc).join(' <span class="tecka">•</span> ')}
        <button id="listZrus">Zrušit vše</button></div>`
    : ''

  pocetEl.textContent = `${serazene.length} ${serazene.length === 1 ? 'místo' : serazene.length < 5 ? 'místa' : 'míst'} nalezeno`

  if (!serazene.length) {
    kartyEl.innerHTML = `<div class="empty">${IC('i-map')}Nic neodpovídá filtrům.<br>Zkus je zrušit.</div>`
    return
  }

  kartyEl.innerHTML =
    serazene
      .slice(0, zobrazeno)
      .map(({ p, d }) => {
        const k = KAT[p.k] || {}
        const stav = store.stav[p.id]
        const obr = obrazekMista(p, PHOTOS)
        return radek({
          id: p.id,
          obrazek: obr.src,
          zaloha: obr.zaloha,
          vyrez: obr.vyrez,
          nadpis: p.n,
          podnadpis: p.r && p.r !== p.z ? `${p.r}, ${p.z}` : p.z,
          meta: meta(p, d),
          vpravo:
            ikonBtn(stav === 'visited' ? 'i-check' : 'i-zalozka', {
              titul: stav === 'visited' ? 'Navštíveno' : 'Uložit místo',
              on: !!stav,
            }) + stavPill(stav),
          tridy: 'misto',
          styl: `--pc:${k.c}`,
        })
      })
      .join('') +
    (serazene.length > zobrazeno
      ? `<button class="btn small" id="listVic" style="margin:12px auto;display:block">Zobrazit dalších 50 (z ${serazene.length})</button>`
      : '')

  const zrus = document.getElementById('listZrus')
  if (zrus) zrus.onclick = () => document.getElementById('fReset').click()

  const vic = document.getElementById('listVic')
  if (vic)
    vic.onclick = () => {
      zobrazeno += 50
      renderList()
    }

  for (const r of kartyEl.querySelectorAll('.radek[data-id]')) {
    const id = r.dataset.id
    r.onclick = () => goTo(S.byId[id])
    // Srdce/fajfka nesmí otevřít detail – je to zkratka přímo ze seznamu.
    r.querySelector('.ikonbtn').onclick = (e) => {
      e.stopPropagation()
      prepniStav(id)
    }
  }
}

/**
 * Přepne stav místa rovnou ze seznamu: nic → chci → navštíveno → nic.
 *
 * V předloze je srdce a fajfka na každém řádku. Do teď se stav dal měnit
 * jen v detailu, což znamenalo otevřít a zavřít panel u každého místa.
 */
function prepniStav(id) {
  const ted = store.stav[id]
  if (!ted) store.stav[id] = 'wish'
  else if (ted === 'wish') store.stav[id] = 'visited'
  else delete store.stav[id]

  save()
  draw()
}
