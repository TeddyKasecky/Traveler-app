/**
 * Košík – wishlist míst na výpravu, který ještě není trasa.
 *
 * PROČ VEDLE PLÁNU, NE V NĚM: itinerář je závazek. Zastávka v něm má pořadí,
 * den a počítá se do kilometrů. Na začátku roadtripu ale člověk ještě neví,
 * co kdy pojede – ví jen, co ho láká. Do teď musel každé místo rovnou zařadit
 * do dne, takže se plánovalo dřív, než bylo co plánovat.
 *
 * Košík je hromádka bez pořadí a bez dnů. Nekreslí se z něj trasa, nepočítají
 * se z něj kilometry. Až přijde „dneska jedeme sem", vytáhne se z něj jedno
 * místo do itineráře a zbytek čeká dál.
 *
 * KLÍČOVANÝ NÁZVEM VÝPRAVY, stejně jako `store.bloky` – každý roadtrip má svůj
 * wishlist. Sdílí to i slabinu bloků: název je křehká identita, takže
 * přejmenování musí košík přestěhovat (dělá to `prejmenuj()` ve `vypravy.js`).
 *
 * DATOVĚ „PŘIDAT VEDLE, NIKDY NEPŘEPISOVAT": `store.kosik` je nový klíč vedle
 * `plan` a `bloky`. Kdo ho nemá, má prázdný košík – přesně dnešní stav. Při
 * startu se nic nezapisuje a starší build z cache klíč ignoruje.
 *
 * Ukládají se JEN `id` míst, ne jejich kopie. Data míst se můžou změnit
 * importem CSV a košík má odkazovat na místo, ne držet jeho otisk.
 */

import { store, save } from '../../core/store.js'
import { S } from '../../core/store.js'
import { dkm } from '../../core/geo.js'
import { BEZ_NAZVU } from './vypravy.js'
import { bodyVKosiku, souradniceBodu, DRUHY } from './body.js'

/** Klíč aktivní výpravy v `store.kosik`. */
const klic = () => store.vypravaNazev || BEZ_NAZVU

/** Id v košíku aktivní výpravy, vždycky pole. Staré uložení klíč nemá. */
export function kosik() {
  if (!store.kosik || typeof store.kosik !== 'object') store.kosik = {}
  return store.kosik[klic()] || []
}

/** Zapíše košík aktivní výpravy. Vrací výsledek uložení, nikdy ho nezahazuj. */
export function zapisKosik(nove) {
  if (!store.kosik || typeof store.kosik !== 'object') store.kosik = {}
  store.kosik[klic()] = nove
  return save()
}

/** Je místo v košíku? */
export const vKosiku = (id) => kosik().includes(id)

/**
 * Přidá místo do košíku. Duplicitu tiše ignoruje – dvakrát naházené místo
 * je omyl, ne úmysl.
 * @returns {boolean} true když se opravdu přidalo
 */
export function pridejDoKosiku(id) {
  if (!id || vKosiku(id)) return false
  return zapisKosik([...kosik(), id])
}

/** Vyhodí místo z košíku. */
export function vyhodZKosiku(id) {
  return zapisKosik(kosik().filter((x) => x !== id))
}

/** Přepínač pro tlačítko „do košíku". Vrací, jestli je místo po akci uvnitř. */
export function prepniKosik(id) {
  const bylo = vKosiku(id)
  if (bylo) vyhodZKosiku(id)
  else pridejDoKosiku(id)
  return !bylo
}

/**
 * Vysype celý košík aktivní výpravy.
 *
 * Tlačítko na to v košíku od srpna 2026 NENÍ – hromadné smazání wishlistu
 * jedním ťuknutím je destruktivní akce, kterou nikdo denně nepotřebuje,
 * a místa se vyhazují po jednom křížkem na řádku. Funkce zůstává, protože
 * ji potřebuje úklid při zániku výpravy (`zahodKosik()` níž) a testy.
 */
export function vyprazdniKosik() {
  return zapisKosik([])
}

/**
 * Přidá nebo odebere místo v košíku KONKRÉTNÍ výpravy, i té neotevřené.
 *
 * Košík je klíčovaný názvem výpravy, takže na rozdíl od zastávek
 * (`vypravy.js#nastavZastavkuVeVyprave`) stačí název – žádný index.
 *
 * @param {string} nazev  název výpravy; prázdný = „Náš plán"
 * @param {string} id
 * @param {boolean} ma
 * @returns {boolean} výsledek uložení
 */
export function nastavVKosikuVypravy(nazev, id, ma) {
  if (!store.kosik || typeof store.kosik !== 'object') store.kosik = {}
  const k = nazev || BEZ_NAZVU
  const soucasny = store.kosik[k] || []
  if (ma === soucasny.includes(id)) return true
  store.kosik[k] = ma ? [...soucasny, id] : soucasny.filter((x) => x !== id)
  return save()
}

/** V košících kterých výprav (podle názvu) tohle místo je? */
export function vypravySMistemVKosiku(id) {
  if (!store.kosik || typeof store.kosik !== 'object') return []
  return Object.entries(store.kosik).filter(([, ids]) => (ids || []).includes(id)).map(([nazev]) => nazev)
}

/**
 * Přestěhuje košík pod nový název výpravy. Volá `prejmenuj()` ve `vypravy.js`
 * – bez toho by wishlist po přejmenování osiřel, stejně jako kdysi bloky.
 */
export function prestehujKosik(zeStareho, doNoveho) {
  if (!store.kosik || zeStareho === doNoveho) return
  const co = store.kosik[zeStareho]
  if (!co) return
  delete store.kosik[zeStareho]
  store.kosik[doNoveho] = co
}

/** Smaže košík zaniklé výpravy, ať se neplní neviditelnými zbytky. */
export function zahodKosik(nazev) {
  if (store.kosik) delete store.kosik[nazev]
}

/**
 * Místa z košíku jako objekty, bez těch, která už v datech nejsou
 * (import CSV mohl místo odstranit).
 * @returns {Array<Record<string, any>>}
 */
export const mistaVKosiku = () => kosik().map((id) => S.byId[id]).filter(Boolean)

/**
 * Obsah košíku jako jednotné položky – místa z databáze i vlastní body.
 *
 * PROČ SPOLEČNĚ: „kemp u známých" a „Lago di Braies" jsou pro plánování
 * totéž – nápad, u kterého ještě nevím kdy. Košík do srpna 2026 uměl jen
 * `id` z `places.json`, takže vlastní místo se muselo rovnou zařadit do dne.
 *
 * Vlastní bod se pozná tak, že `S.byId` ho nezná – id bloků mají tvar `b…`
 * a s id míst se nepotkají. Body bez polohy se přeskakují stejně jako
 * v `serazenaTrasa()`: bez souřadnic se nedá spočítat zajížďka ani je
 * vykreslit na mapu.
 *
 * @returns {Array<{id: string, nazev: string, lat: number, lon: number, misto: object|null, bod: object|null}>}
 */
export function polozkyKosiku() {
  const out = []
  for (const id of kosik()) {
    const p = S.byId[id]
    if (p) {
      out.push({ id, nazev: p.n, lat: p.lat, lon: p.lon, misto: p, bod: null })
      continue
    }
    const b = bodyVKosiku().find((x) => x.id === id)
    if (!b) continue
    const s = souradniceBodu(b)
    if (!s) continue
    out.push({ id, nazev: b.nazev || DRUHY[b.druh]?.popisek || 'Vlastní místo', lat: s.lat, lon: s.lon, misto: null, bod: b })
  }
  return out
}

/**
 * Vlastní body v košíku, které nemají polohu, takže je `polozkyKosiku()`
 * přeskakuje. Vykreslují se zvlášť, ať se člověku neztratí – bod bez
 * souřadnic je platný stav („polohu doplním, až budu vědět").
 */
export const bodyBezPolohy = () =>
  bodyVKosiku().filter((b) => kosik().includes(b.id) && !souradniceBodu(b))

/* ================= kotva ================= */

/**
 * Kotva = jediný závazek v jinak volné cestě.
 *
 * Nejedeme podle pevného itineráře – s dodávkou se rozhodujeme večer a podle
 * počasí. Skoro nic ale není úplně volné: „do bikeparku chceme mezi 3. a 5.
 * dnem" je závazek, který drží celou cestu pohromadě. Kotva je právě tohle:
 * jedno místo z košíku a okno ve dnech od začátku cesty.
 *
 * PROČ NE DNY V ITINERÁŘI: den je přihrádka, do které se zastávka musí
 * zařadit. Kotva je bod, ke kterému se míří – všechno ostatní zůstává volné.
 *
 * Uloženo v `store.kotvy`, klíčované názvem výpravy jako `bloky` a `kosik`,
 * takže platí stejné pravidlo o stěhování při přejmenování.
 *
 *   { id, odeDne, doDne }   odeDne/doDne = pořadí dne cesty od jedničky
 */

/** Kotvy aktivní výpravy, vždycky pole. */
export function kotvy() {
  if (!store.kotvy || typeof store.kotvy !== 'object') store.kotvy = {}
  return store.kotvy[klic()] || []
}

/** Zapíše kotvy aktivní výpravy. */
export function zapisKotvy(nove) {
  if (!store.kotvy || typeof store.kotvy !== 'object') store.kotvy = {}
  store.kotvy[klic()] = nove
  return save()
}

/** Kotva daného místa, nebo undefined. */
export const kotvaMista = (id) => kotvy().find((k) => k.id === id)

/**
 * Nastaví kotvu. Stejné místo podruhé kotvu přepíše, ne zdvojí.
 * @param {string} id
 * @param {number} odeDne
 * @param {number} doDne
 */
export function nastavKotvu(id, odeDne, doDne) {
  const od = Math.max(1, Math.round(odeDne) || 1)
  const doD = Math.max(od, Math.round(doDne) || od)
  const bez = kotvy().filter((k) => k.id !== id)
  return zapisKotvy([...bez, { id, odeDne: od, doDne: doD }])
}

/** Zruší kotvu místa. */
export function zrusKotvu(id) {
  return zapisKotvy(kotvy().filter((k) => k.id !== id))
}

/**
 * Hlavní kotva – ta nejbližší v čase. Podle ní se kreslí koridor a počítá
 * zajížďka; víc kotev naráz by znamenalo víc koridorů a z mapy by byl chaos.
 * @returns {{id: string, odeDne: number, doDne: number}|null}
 */
export function hlavniKotva() {
  const k = [...kotvy()].sort((a, b) => a.odeDne - b.odeDne)
  return k[0] || null
}

/* ================= zajížďka ================= */

/**
 * O kolik km navíc stojí zastávka v místě `p` cestou z `odkud` do `kam`.
 *
 * `dkm(odkud→p) + dkm(p→kam) − dkm(odkud→kam)`. Nula znamená „přesně po
 * cestě", velké číslo „to je úplně jinam".
 *
 * VZDUŠNOU ČAROU, A JE TO ODHAD: v Alpách údolí a průsmyky znamenají, že
 * dvanáct kilometrů vzdušně může být hodina jízdy. Koeficient `KLIKATOST`
 * to zprůměruje, ale v horách je optimistický. Skutečné routování by
 * znamenalo další síťovou službu za běhu (dnes je jediná Nominatim) a bez
 * signálu v horách by stejně nefungovalo. Proto odhad – a proto se v textu
 * píše „zhruba", ne přesné číslo.
 *
 * @param {{lat:number, lon:number}} odkud
 * @param {{lat:number, lon:number}} p
 * @param {{lat:number, lon:number}} kam
 * @returns {number} km navíc, nikdy záporné
 */
export function zajizdka(odkud, p, kam) {
  if (!odkud || !p || !kam) return 0
  const primo = dkm(odkud, kam)
  const pres = dkm(odkud, p) + dkm(p, kam)
  return Math.max(0, pres - primo)
}

/**
 * Jak daleko od přímé cesty místo leží – pro koridor.
 *
 * Používá se poloviční zajížďka, což je dobrá aproximace kolmé vzdálenosti
 * od spojnice: kdo zajede stranou o x km, ujede navíc zhruba 2x.
 */
export const odchylkaOdTrasy = (odkud, p, kam) => zajizdka(odkud, p, kam) / 2

/** Do jaké odchylky se místo počítá jako „po cestě". */
export const KORIDOR_KM = 30

/**
 * Košík setříděný podle zajížďky k hlavní kotvě.
 *
 * Bez kotvy nebo bez polohy se řadí podle vzdálenosti od `odkud`, a když
 * není ani ta, abecedně – pořád je to použitelný seznam, jen bez koridoru.
 *
 * @param {{lat:number, lon:number}|null} odkud
 * @returns {Array<{p: object, km: number|null, zajizdka: number|null, vKoridoru: boolean, kotva: object|null}>}
 */
export function kosikSeZajizdkou(odkud = null) {
  const kotva = hlavniKotva()
  const vsechny = polozkyKosiku()
  const cil = kotva ? vsechny.find((x) => x.id === kotva.id) : null

  // `p` drží tvar, na který stojí vykreslení i mapa: má vždy `id`, `n`,
  // `lat`, `lon`. U místa z databáze je to rovnou ono, u vlastního bodu
  // obálka nad blokem – zbytek kódu tak nemusí řešit, co drží v ruce.
  const out = vsechny.map((x) => {
    const p = x.misto || { id: x.id, n: x.nazev, lat: x.lat, lon: x.lon, k: '', z: '', vlastni: x.bod }
    const km = odkud ? dkm(odkud, x) : null
    // Kotva sama zajížďku nemá – je to cíl, ne odbočka.
    const z = odkud && cil && x.id !== cil.id ? zajizdka(odkud, x, cil) : null
    return {
      p,
      km,
      zajizdka: z,
      vKoridoru: z != null ? z / 2 <= KORIDOR_KM : false,
      kotva: kotvaMista(x.id) || null,
    }
  })

  return out.sort((a, b) => {
    // Kotvy nahoru – jsou to závazky, ne návrhy.
    if (!!a.kotva !== !!b.kotva) return a.kotva ? -1 : 1
    if (a.zajizdka != null && b.zajizdka != null) return a.zajizdka - b.zajizdka
    if (a.km != null && b.km != null) return a.km - b.km
    return a.p.n.localeCompare(b.p.n, 'cs')
  })
}

/**
 * Rozdělí košík do skupin podle země a v každé seřadí podle vzdálenosti
 * od `odkud`, nebo abecedně, když polohu neznáme.
 *
 * Země, ne kraj: na roadtripu se člověk rozhoduje „ještě Rakousko, nebo už
 * Slovinsko", ne podle krajů. Skupiny jdou od té s nejbližším místem, aby
 * nahoře bylo to, kam je odsud nejblíž.
 *
 * @param {{lat:number, lon:number}|null} odkud
 * @returns {Array<{zeme: string, mista: Array<Record<string, any>>}>}
 */
export function kosikPoZemich(odkud = null) {
  const skupiny = new Map()
  for (const p of mistaVKosiku()) {
    const zeme = p.z || 'Jinde'
    if (!skupiny.has(zeme)) skupiny.set(zeme, [])
    skupiny.get(zeme).push(p)
  }

  const vzdalenost = (p) => (odkud ? dkm(odkud, p) : Infinity)
  const out = [...skupiny.entries()].map(([zeme, mista]) => ({
    zeme,
    mista: odkud
      ? [...mista].sort((a, b) => vzdalenost(a) - vzdalenost(b))
      : [...mista].sort((a, b) => a.n.localeCompare(b.n, 'cs')),
  }))

  return odkud
    ? out.sort((a, b) => vzdalenost(a.mista[0]) - vzdalenost(b.mista[0]))
    : out.sort((a, b) => a.zeme.localeCompare(b.zeme, 'cs'))
}
