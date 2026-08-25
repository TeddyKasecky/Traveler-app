/**
 * Rozjetá cesta – data bez vzhledu.
 *
 * ODDĚLENO OD `cesta.js` ze stejného důvodu jako `body.js` od `bloky.js`:
 * `cesta.js` importuje `IC` z `icons/sprite.js`, který čte `sprite.svg?raw`
 * (Vite syntaxe, kterou čistý Node neumí). Kdyby tyhle funkce zůstaly tam,
 * `check-dny.mjs` by spadl na „Unknown file extension .svg" hned při importu.
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
 * CESTA SE ZA JÍZDY MĚNÍ (srpen 2026). `zastavky` byl do teď zmrazený otisk
 * z okamžiku Vyjet – plán se dal upravovat, cesta ne. Jenže právě to se na
 * roadtripu dělá: večer se něco přidá z košíku a něco vynechá. `puvodni`
 * drží, jak to bylo naplánované, takže se při ukončení dá zeptat, jestli
 * změny promítnout zpátky do plánu. `store.plan` se za jízdy NEMĚNÍ – plán
 * je „jak jsme to chtěli", cesta „jak to fakt bylo".
 */

import { S, store, save } from '../../core/store.js'
import { sklonuj } from '../../core/html.js'
import { dnyPlanu } from './dny.js'
import { BEZ_NAZVU } from './vypravy.js'
import { pridejDoKosiku } from './kosik.js'
import { ulozCestu } from '../../core/cesty.js'

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
    // Kopie zastávek z okamžiku vyjetí. `zastavky` se od srpna 2026 za jízdy
    // mění (přidání z košíku, vynechání), takže je potřeba vědět, jak to
    // bylo naplánované – kvůli dotazu při ukončení („promítnout do plánu?")
    // i kvůli archivu, který ukládá obojí. Cesty rozjeté před touhle změnou
    // pole nemají a chovají se jako dřív.
    puvodni: [...store.plan],
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

/**
 * Ukončí cestu: spočítá souhrn a přesune ji do archivu (`core/cesty.js`).
 *
 * Souhrn se počítá TEĎ, ne při čtení archivu – data míst se můžou změnit
 * (CSV import) a archiv má držet, jaká cesta BYLA.
 *
 * Od srpna 2026 asynchronní: archiv bydlí v IndexedDB, ne v localStorage.
 * Vrací `false`, když se zápis nepovedl – volající to NESMÍ zahodit, jinak
 * by cesta zmizela z „Na cestě" a nikam by se nedostala.
 */
export async function ukonciCestu() {
  const c = store.cesta
  if (!c) return false
  if (c.pauzaOd) {
    c.pauzy.push({ od: c.pauzaOd, do: Date.now() })
    c.pauzaOd = null
  }

  // Do archivu DŘÍV, než se rozjetá cesta zahodí. Archiv bydlí od srpna 2026
  // v IndexedDB (`core/cestyDb.js`) a zápis se může nepovést – kdyby se
  // `store.cesta` vynulovala první, ztratilo by se obojí. Ukončená cesta se
  // dopočítat nedá.
  if (!(await ulozCestu(zaznamCesty(c)))) return false

  store.cesta = null
  // Stejný důvod jako u zrusCestu() výš – bez aktivní cesty nemá mód
  // „Na cestě“ co zobrazovat, a tipy „Co dál?“ patřily k rozjeté cestě.
  S.mapaMod = 'plna'
  S.coDalId = []
  return save()
}

/**
 * Složí archivní záznam z rozjeté cesty. Nic nezapisuje.
 *
 * Oddělené od `ukonciCestu()` ze stejného důvodu, jako je `cestaData.js`
 * oddělené od `cesta.js`: zápis potřebuje IndexedDB, kterou čistý Node nemá,
 * takže by se `check-dny.mjs` k obsahu záznamu nedostal. A obsah je přesně
 * to, na čem záleží – právě tady se do srpna 2026 ztrácely `dny`.
 *
 * @param {Record<string, any>} c  `store.cesta`
 */
export function zaznamCesty(c) {
  const mista = c.zastavky.map((id) => S.byId[id]).filter(Boolean)
  const navstivena = mista.filter((p) => c.odznacene[p.id])
  const zeme = [...new Set(navstivena.map((p) => p.z))]
  const kraje = [...new Set(navstivena.map((p) => p.r).filter(Boolean))]
  const kategorie = {}
  for (const p of navstivena) kategorie[p.k] = (kategorie[p.k] || 0) + 1
  const hodnoceni = {}
  for (const p of navstivena) if (store.rating[p.id]) hodnoceni[p.id] = store.rating[p.id]

  return {
    nazev: c.nazev,
    zacatek: c.zacatek,
    konec: Date.now(),
    cistyMs: cistyCas(c),
    zastavek: c.zastavky.length,
    navstiveno: navstivena.length,
    vynechano: c.zastavky.length - navstivena.length,
    zastavky: c.zastavky,
    // Délky dnů. Do srpna 2026 se do archivu nezapisovaly, přestože je cesta
    // po celou dobu přepočítávala (`prepocitejDny()` níž) – `dnyCesty()` proto
    // u každé ukončené cesty spadla na `[zastavky.length]` a zamčený itinerář
    // hodil celou cestu pod jeden den. Rozdělení, které se na cestě udržovalo,
    // se tím ztrácelo v okamžiku, kdy se stalo vzpomínkou.
    dny: c.dny || [],
    // Jak to bylo naplánované, vedle toho, jak to dopadlo. Archiv tak unese
    // otázku „co jsme nakonec vynechali a co přibylo".
    puvodni: c.puvodni,
    odznacene: c.odznacene,
    poznamky: c.poznamky,
    poznamka: c.poznamka,
    zeme,
    kraje,
    kategorie,
    hodnoceni,
    ziskane: c.ziskane || [],
    // Otisk mohl mít vlastní přepočet z Mapy.com (#cestaPrepocitat) – bez
    // téhle kopie by ukončená cesta v knihovně o spočítanou trasu přišla.
    prepocet: c.prepocet,
  }
}

/**
 * Kde jsi TY – jen z GPS, nikdy jako odhad z trasy.
 *
 * Živě sledovaná poloha má přednost před jednorázovou: na cestě se hýbeme
 * a `S.userPos` je „kde jsem se naposledy zeptal", což může být před hodinou
 * a sto kilometrů zpátky. Bez sledování (mimo kartu Na cestě, na pozadí) je
 * `S.zivaPoloha` null a nastoupí jednorázová.
 *
 * @returns {{lat:number, lon:number, popis:string, zdroj:'ja'}|null}
 */
export function mojePoloha() {
  if (S.zivaPoloha && Number.isFinite(S.zivaPoloha.lat)) {
    return { lat: S.zivaPoloha.lat, lon: S.zivaPoloha.lon, popis: 'od tebe', zdroj: 'ja' }
  }
  if (S.userPos && Number.isFinite(S.userPos.lat)) {
    return { lat: S.userPos.lat, lon: S.userPos.lon, popis: 'od tebe', zdroj: 'ja' }
  }
  return null
}

/**
 * Poslední ODŠKRTNUTÁ zastávka rozjeté cesty.
 *
 * Poslední v pořadí odznačení, ne poslední v seznamu – odznačovat se dá na
 * přeskáčku a zajímá nás, kde jsme naposledy opravdu byli.
 *
 * @returns {{lat:number, lon:number, popis:string, zdroj:'posledni', nazev:string}|null}
 */
export function posledniOdznacena() {
  const c = store.cesta
  if (!c) return null
  const posledni = odznaceneVPoradi().slice(-1)[0]
  const p = posledni && S.byId[posledni]
  return p ? { lat: p.lat, lon: p.lon, popis: `od: ${p.n}`, zdroj: 'posledni', nazev: p.n } : null
}

/**
 * Odkud se měří „co je poblíž" – pro tipy Co dál? i pro vzdálenosti v košíku.
 *
 * VOLBA, NE AUTOMATIKA (srpen 2026). Do teď měla GPS vždycky přednost
 * a poslední odškrtnutá zastávka byla jen záskok, když poloha nebyla. Jenže
 * obojí je legitimní otázka a liší se: „co je kolem mě teď" (stojím na
 * parkovišti) proti „co je kolem místa, kde jsme skončili" (plánuju večer
 * u ohně, kam zítra). Přepíná se tlačítkem v hlavičce „Co dál?".
 *
 * Fallback zůstává: když zvolený zdroj není k dispozici, nastoupí ten druhý.
 * Bez obojího vrací null a volající karty se prostě nevykreslí.
 *
 * @returns {{lat:number, lon:number, popis:string, zdroj:string}|null}
 */
export function vychoziBod() {
  const ja = mojePoloha()
  const posledni = posledniOdznacena()
  if (S.coDalOdkud === 'posledni') return posledni || ja
  return ja || posledni
}

/* ================= úpravy rozjeté cesty ================= */

/**
 * Cesta se za jízdy MĚNÍ, a je to záměr (srpen 2026).
 *
 * Do teď byl `store.cesta.zastavky` zmrazený otisk z okamžiku Vyjet – plán
 * se dal upravovat, ale cesta ne. Jenže právě to člověk na roadtripu dělá:
 * večer se podívá do košíku, něco přidá, něco vynechá. Zmrazený otisk to
 * neuměl a cesta se rozcházela se skutečností.
 *
 * `puvodni` drží, jak to bylo naplánované, takže se při ukončení dá zeptat,
 * jestli změny promítnout zpátky do plánu výpravy. `store.plan` se za jízdy
 * NEMĚNÍ – plán je „jak jsme to chtěli", cesta „jak to fakt bylo".
 *
 * Rozdělení na dny se přepočítává spolu se seznamem: `c.dny` jsou délky
 * a musí sedět na počet zastávek, jinak by se `cestaHtml()` rozjelo.
 */

/** Zastávky cesty po dnech, jako `dnyPlanu()` pro plán. */
function dnyCesty(c) {
  const delky = c.dny && c.dny.length ? c.dny : [c.zastavky.length]
  const out = []
  let i = 0
  for (const d of delky) {
    out.push(c.zastavky.slice(i, i + d))
    i += d
  }
  if (i < c.zastavky.length) out.push(c.zastavky.slice(i))
  return out
}

/**
 * Přidá zastávku do rozjeté cesty.
 * @param {string} id
 * @param {'dalsi'|'konecDne'|number} kam  „dalsi" = hned za poslední
 *   odznačenou (stane se dalším cílem), „konecDne" = na konec dnešního dne,
 *   číslo = na konec toho dne
 * @returns {boolean}
 */
export function pridejDoCesty(id, kam = 'dalsi') {
  const c = store.cesta
  if (!c || c.zastavky.includes(id)) return false
  const dny = dnyCesty(c)

  if (kam === 'dalsi') {
    // Hned za poslední odznačenou zastávku – tedy tam, kde zrovna jsme.
    const poradi = odznaceneVPoradi()
    const posledni = poradi[poradi.length - 1]
    const kde = posledni ? c.zastavky.indexOf(posledni) + 1 : 0
    c.zastavky.splice(kde, 0, id)
    // Do kterého dne to spadlo, se dopočítá z hranic – den, ve kterém index
    // leží, se prodlouží o jedna.
    let hranice = 0
    for (let i = 0; i < dny.length; i++) {
      hranice += dny[i].length
      if (kde <= hranice) {
        c.dny = dny.map((d, j) => d.length + (j === i ? 1 : 0))
        return save()
      }
    }
    c.dny = dny.map((d, j) => d.length + (j === dny.length - 1 ? 1 : 0))
    return save()
  }

  const cil = kam === 'konecDne' ? kolikatyDenCesty(c) : Math.max(1, Math.min(Number(kam) || 1, dny.length))
  const index = Math.min(cil, dny.length) - 1
  dny[index].push(id)
  c.zastavky = dny.flat()
  c.dny = dny.map((d) => d.length)
  return save()
}

/**
 * Vynechá zastávku z rozjeté cesty. Vrací se do košíku – „dneska ne"
 * neznamená „už nikdy", a bez toho by se místo z cesty ztratilo úplně.
 * @param {string} id
 * @returns {boolean}
 */
export function vynechZCesty(id) {
  const c = store.cesta
  if (!c) return false
  const dny = dnyCesty(c)
  const kde = dny.findIndex((d) => d.includes(id))
  if (kde < 0) return false
  dny[kde].splice(dny[kde].indexOf(id), 1)
  c.zastavky = dny.flat()
  c.dny = dny.map((d) => d.length)
  delete c.odznacene[id]
  delete (c.poznamky || {})[id]
  pridejDoKosiku(id)
  return save()
}

/** Kolikátý den cesty je dnes, od jedničky. Počítá se od vyjetí. */
export function kolikatyDenCesty(c) {
  if (!c) return 1
  return Math.max(1, Math.floor((Date.now() - c.zacatek) / 86400000) + 1)
}

/** Liší se rozjetá cesta od toho, jak byla naplánovaná? */
export const cestaZmenena = (c) =>
  !!c && Array.isArray(c.puvodni) && c.puvodni.join() !== c.zastavky.join()

/** Pořadí odznačení – pro čáru ujeté trasy na mapě. */
export function odznaceneVPoradi() {
  const c = store.cesta
  if (!c) return []
  return Object.entries(c.odznacene)
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id)
}

