/**
 * Předpověď počasí – načtení ze schránky nebo ze sítě a vykreslení.
 *
 * PROČ V `components/` A NE VE `views/home/`: první etapa (srpen 2026) ji
 * ukazuje jen u tvé polohy na Domů, ale hlášení `pc-tadeas-001` chce počasí
 * i u dnů v Itineráři, u jednotlivých míst a na kartě Na cestě. Kdyby to
 * bydlelo v Domů, tahaly by si to odtamtud tři další obrazovky.
 *
 * DVĚ VRSTVY, ZÁMĚRNĚ: `pocasiProBod()` je data (schránka, čerstvost, síť)
 * a `pocasiHtml()` vzhled. Data jdou testovat bez prohlížeče, stejně jako
 * u `body.js` proti `bloky.js`.
 *
 * NIKDY SE NEPTÁ NA POLOHU. Bere tu, kterou appka už zná ze „Nejblíž odsud";
 * kdo ji nedal, dostane místo předpovědi tlačítko. Systémový dotaz na polohu
 * při otevření Domů by byl přepadení.
 */

import { prefs, S, store } from '../core/store.js'
import { esc } from '../core/html.js'
import { dkm } from '../core/geo.js'
import { IC } from '../icons/sprite.js'
import { klicPocasi, nactiPocasiZeSchranky, ulozPocasi } from '../core/pocasiDb.js'
import {
  DNU_CESTY, dnyCesty, nactiPocasi, nactiPocasiProBody, pocasiPodleKodu,
} from '../views/plan/termin.js'

/** Kolik hodin dopředu. Celý den včetně zítřejšího rána. */
const HODIN = 24
/** Kolik dní dopředu. Týden; Open-Meteo umí šestnáct, ale patnáctý den nesedá. */
const DNU = 7

/**
 * Jsme na měřených datech?
 *
 * `navigator.connection` UMÍ JEN CHROMIUM. V Safari neexistuje, takže se
 * vrací `false` – volba „jen na wifi" se tam chová jako vypnutá. Radši
 * stáhnout navíc než tvrdit uživateli, že je na wifi, a mlčet.
 *
 * @returns {boolean}
 */
export function naDatech() {
  const c = typeof navigator !== 'undefined' && navigator.connection
  if (!c) return false
  if (c.saveData) return true
  return ['slow-2g', '2g', '3g', '4g', 'cellular'].includes(c.effectiveType || c.type)
}

/**
 * Předpověď pro bod: ze schránky, a když je stará, ze sítě.
 *
 * VRACÍ I STAROU PŘEDPOVĚĎ, když se stažení nepovede. Bez signálu je „včerejší
 * počasí s datem" mnohem lepší než prázdno – proto je `stazeno` součástí
 * záznamu a proto se chyba sítě nepropaguje ven jako výjimka.
 *
 * @param {{lat:number, lon:number}} bod
 * @param {{ted?:number, vynutit?:boolean}} [o]  `vynutit` = tlačítko, ignoruje čerstvost i wifi
 * @returns {Promise<{hodiny:Array, dny:Array, stazeno:number, stare:boolean}|null>}
 */
export async function pocasiProBod(bod, { ted = Date.now(), vynutit = false } = {}) {
  if (!bod || !Number.isFinite(bod.lat) || !Number.isFinite(bod.lon)) return null
  if (!prefs.pocasi && !vynutit) return null

  const fahrenheity = prefs.pocasiJednotky === 'fahrenheit'
  const klic = klicPocasi(bod, fahrenheity ? 'f' : 't')
  const ulozene = await nactiPocasiZeSchranky(klic)

  const platnost = (Number(prefs.pocasiInterval) || 60) * 60000
  const cerstve = ulozene && ted - ulozene.stazeno < platnost
  if (cerstve && !vynutit) return { ...ulozene, stare: false }

  // Na měřených datech se nestahuje samo – jen na vyžádání tlačítkem.
  if (!vynutit && prefs.pocasiJenWifi && naDatech()) {
    return ulozene ? { ...ulozene, stare: true } : null
  }

  try {
    const data = await nactiPocasi(bod, { hodin: HODIN, dnu: DNU, fahrenheity })
    await ulozPocasi(klic, data, ted)
    return { ...data, stazeno: ted, stare: false }
  } catch {
    // Síť selhala. Co je ve schránce, je pořád lepší než nic.
    return ulozene ? { ...ulozene, stare: true } : null
  }
}

/**
 * Nejbližší město i se vzdáleností – „Innsbruck · 12 km".
 *
 * BEZ JEDINÉHO DOTAZU NA SÍŤ. Appka má 985 evropských měst se souřadnicemi
 * v `src/data/mesta.json` a ten soubor je v předukládané cache, takže to
 * funguje i bez signálu. Reverzní geokódování přes Nominatim by bylo čtvrté
 * síťové volání za běhu a offline by mlčelo – přesně tam, kde se člověk na
 * „kde to vlastně jsem" ptá nejčastěji.
 *
 * Vzdálenost je v popisku schválně: v horách bývá nejbližší město za kopcem
 * a bez ní by to vypadalo, že předpověď je přímo tam.
 *
 * @param {{lat:number, lon:number}} bod
 * @returns {Promise<string>}  prázdný řetězec, když se data nepodaří načíst
 */
export async function nejblizsiMesto(bod) {
  if (!bod || !Number.isFinite(bod.lat)) return ''
  try {
    const { mesta } = (await import('../data/mesta.json')).default
    let nej = null
    let nejKm = Infinity
    for (const [lat, lon, nazev] of mesta) {
      const km = dkm(bod, { lat, lon })
      if (km < nejKm) {
        nejKm = km
        nej = nazev
      }
    }
    if (!nej) return ''
    // Do dvou kilometrů je vzdálenost šum – člověk je prostě „v Innsbrucku".
    return nejKm < 2 ? nej : `${nej} · ${Math.round(nejKm)} km`
  } catch {
    return ''
  }
}

/** „18:40" z ISO času, který Open-Meteo vrací v místní zóně bodu. */
const hodina = (iso) => String(iso || '').slice(11, 16)

/** „po 8. 9." – krátký den v týdnu a datum. */
function kratkyDen(iso, ted = Date.now()) {
  const d = new Date(`${iso}T12:00:00`)
  const dnes = new Date(ted)
  if (d.toDateString() === dnes.toDateString()) return 'dnes'
  const DNY = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so']
  return `${DNY[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`
}

/**
 * Popisek předělu v pruhu hodin: „dnes", „zítra", jinak datum.
 *
 * Dál než na zítřek pruh nedosáhne (24 hodin), ale třetí den je tam možný —
 * když se člověk dívá ve 23:30, spadne do pruhu i pozítřejší ráno.
 */
function popisekDne(d, ted = Date.now()) {
  const dnes = new Date(ted)
  if (d.toDateString() === dnes.toDateString()) return 'dnes'
  const zitra = new Date(ted + 86400000)
  if (d.toDateString() === zitra.toDateString()) return 'zítra'
  return `${d.getDate()}. ${d.getMonth() + 1}.`
}

/** Zaokrouhlená teplota se stupněm. Prázdno projde jako pomlčka. */
const stupne = (x) => (Number.isFinite(x) ? `${Math.round(x)}°` : '–')

/**
 * Kdy se to stáhlo, slovy. Píše se jen u staré předpovědi – u čerstvé by
 * to byl šum.
 */
function kdyStazeno(ms, ted = Date.now()) {
  const d = new Date(ms)
  const dnes = new Date(ted)
  const cas = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === dnes.toDateString()) return `dnes v ${cas}`
  const vcera = new Date(ted - 86400000)
  if (d.toDateString() === vcera.toDateString()) return `včera v ${cas}`
  return `${d.getDate()}. ${d.getMonth() + 1}. v ${cas}`
}

/**
 * Vykreslí předpověď. `null` znamená „není co ukázat" a volající sekci
 * vůbec nevykreslí.
 *
 * @param {{hodiny:Array, dny:Array, stazeno:number, stare:boolean}|null} p
 * @param {{ted?:number}} [o]
 * @returns {string}
 */
/**
 * Strop na počet různých bodů v jednom dotazu.
 *
 * Není to výkonnostní obava – změřeno, že 40 bodů na 14 dní je 29,7 kB
 * a 196 ms. Je to pojistka proti nesmyslu: výprava s dvěma sty zastávkami
 * by poslala dvousetkilometrovou adresu a stáhla čtvrt megabajtu, který
 * by stejně nikdo nepřečetl.
 */
const STROP_BODU = 60


/**
 * Předpověď pro celou výpravu: každý den, každá jeho zastávka.
 *
 * ŘÁDEK ZA KAŽDOU ZASTÁVKU, blízké se neslučují – den se třemi zastávkami dá
 * tři řádky se stejným datem. Že patří k sobě, ukáže podbarvení skupiny.
 *
 * DEN BEZ ZASTÁVEK SE ŘÍDÍ TVOJÍ POLOHOU. Někam ten den jedeš i tak a prázdný
 * řádek by neřekl nic.
 *
 * JEDEN DOTAZ NA CELOU VÝPRAVU. Body, které schránka zná a jsou čerstvé, se
 * do něj vůbec nedávají – druhé otevření tedy nestojí nic.
 *
 * VRACÍ I TO, CO SE NEPOVEDLO. Kolik dní je za horizontem předpovědi, jestli
 * se nějaký bod nevešel do stropu a jak stará je nejstarší použitá předpověď –
 * bez toho by tichý výpadek vypadal úplně stejně jako čerstvá data.
 *
 * @param {{ted?:number}} [o]
 * @returns {Promise<{dny:Array, zaHorizontem:number, nevesloSe:boolean, stazeno:number}|null>}
 */
export async function pocasiProCestu({ ted = Date.now() } = {}) {
  if (!prefs.pocasi) return null
  const { dny, zaHorizontem } = dnyCesty(ted)
  if (!dny.length) return null

  const fahrenheity = prefs.pocasiJednotky === 'fahrenheit'
  const znacka = fahrenheity ? 'f' : 't'
  const platnost = (Number(prefs.pocasiInterval) || 60) * 60000
  // Na měřených datech se nestahuje samo – stejné pravidlo jako u počasí u tebe.
  const jenZeSchranky = prefs.pocasiJenWifi && naDatech()
  // Klíč bodu na tři desetinná místa – stejná přesnost, s jakou se posílá dotaz.
  const klic = (b) => `${b.lat.toFixed(3)},${b.lon.toFixed(3)}`

  /** @type {Map<string, {lat:number, lon:number, nazev:string}>} */
  const potreba = new Map()
  for (const d of dny) {
    const body = d.mista.length ? d.mista : S.userPos ? [{ ...S.userPos, n: 'u tebe' }] : []
    for (const b of body) if (!potreba.has(klic(b))) potreba.set(klic(b), b)
  }
  if (!potreba.size) return null

  /** @type {Map<string, Record<string, any>>} */
  const predpovedi = new Map()
  const chybejici = []
  // Utnutí stropem se musí dát poznat. Do září 2026 to byl tichý `break`,
  // takže den nad stropem vypadal úplně stejně jako den, který se nestáhl
  // kvůli signálu – a s vlastními body se strop přiblížil.
  let nevesloSe = false
  for (const [k, b] of potreba) {
    if (chybejici.length + predpovedi.size >= STROP_BODU) {
      nevesloSe = true
      break
    }
    const ulozene = await nactiPocasiZeSchranky(klicPocasi(b, znacka))
    if (ulozene && ted - ulozene.stazeno < platnost) predpovedi.set(k, ulozene)
    else if (ulozene && jenZeSchranky) predpovedi.set(k, ulozene)
    else if (!jenZeSchranky) chybejici.push([k, b])
  }

  if (chybejici.length) {
    try {
      const nove = await nactiPocasiProBody(
        chybejici.map(([, b]) => b),
        { hodin: 1, dnu: DNU_CESTY, fahrenheity }
      )
      for (let i = 0; i < chybejici.length; i++) {
        const [k, b] = chybejici[i]
        predpovedi.set(k, { ...nove[i], stazeno: ted })
        await ulozPocasi(klicPocasi(b, znacka), nove[i], ted)
      }
    } catch {
      // Bez signálu se ukáže, co schránka zná – prázdno nikdy. Řádky bez
      // předpovědi to řeknou samy.
    }
  }

  // NEJSTARŠÍ POUŽITÁ PŘEDPOVĚĎ. `pocasiProBod()` má na totéž příznak `stare`,
  // jenže tudy nechodí – a bez toho se včerejší data kreslila, jako by byla
  // čerstvá. `CLAUDE.md` přitom slibuje, že se ukáže i to, kdy se stáhla.
  let stazeno = 0
  for (const p of predpovedi.values()) {
    if (p.stazeno && (!stazeno || p.stazeno < stazeno)) stazeno = p.stazeno
  }

  return {
    zaHorizontem,
    nevesloSe,
    stazeno: ted - stazeno > platnost ? stazeno : 0,
    dny: dny.map((d) => {
      const body = d.mista.length ? d.mista : S.userPos ? [{ ...S.userPos, n: 'u tebe', ikona: 'i-compass' }] : []
      return {
        den: d.den,
        datum: d.datum,
        radky: body.map((b) => {
          const p = predpovedi.get(klic(b))
          return {
            nazev: b.n || 'u tebe',
            ikona: b.ikona || 'i-pinme',
            den: p ? (p.dny || []).find((x) => x.datum === d.datum) || null : null,
          }
        }),
      }
    }),
  }
}

/**
 * Pruh 24 hodin s předělem dne, posouvačem a případným místem pod ním.
 *
 * VYTAŽENO Z `pocasiHtml()` (září 2026), protože ho potřebují OBA režimy:
 * u tvé polohy i na cestě. Hodiny jsou vždycky z tvé polohy — odpovídají na
 * „prší tady teď", což je otázka o tom, kde stojíš, ne kde budeš. Kdyby si
 * každý režim kreslil pruh sám, rozešly by se do měsíce; předěl dne
 * a posouvač jsou dost složité na to, aby existovaly jednou.
 *
 * @param {Record<string, any>} p  předpověď z `pocasiProBod()`
 * @param {{ted?:number, kdeId?:string}} [o]  `kdeId` = slot pro nejbližší
 *   město pod pruhem; doplní ho volající, až ho dopočítá z `mesta.json`.
 */
export function pocasiHodinyHtml(p, { ted = Date.now(), kdeId = '' } = {}) {
  if (!p || !Array.isArray(p.hodiny) || !p.hodiny.length) return ''

  // Hodiny, které už byly, nikoho nezajímají – Open-Meteo vrací celý den
  // od půlnoci, takže se ty odbyté zahodí.
  const ted6 = ted - 3600000
  const hodiny = p.hodiny.filter((h) => new Date(h.cas).getTime() >= ted6).slice(0, HODIN)

  // PŘEDĚL DNE. Pruh sahá 24 hodin dopředu a bez značky se v něm člověk
  // ztratí – neví, kde končí dnešek. Řeší to dvě věci naráz: zítřejší dlaždice
  // mají tmavší plochu (vidět koutkem oka) a na hranici stojí popisek.
  let denPredchozi = ''
  const pruh = hodiny
    .map((h) => {
      const d = new Date(h.cas)
      const den = h.cas.slice(0, 10)
      const zitra = den !== hodiny[0].cas.slice(0, 10)

      // Popisek se vloží před první dlaždici a pak vždy, když se přehoupne
      // datum. `denPredchozi` drží stav mezi průchody mapy.
      const predel =
        den !== denPredchozi
          ? `<div class="pocasi-predel${zitra ? ' zitra' : ''}">${esc(popisekDne(d, ted))}</div>`
          : ''
      denPredchozi = den

      const { ikona } = pocasiPodleKodu(h.kodPocasi)
      // OBOJÍ VŽDYCKY, I NULA. Do srpna 2026 se milimetry kreslily jen když
      // opravdu něco spadlo, kdežto procento i nulové – a právě ta asymetrie
      // dělala dojem, že množství srážek v appce chybí. V běžné předpovědi
      // prší dvě tři hodiny z dvaceti čtyř a bývají na konci pruhu, takže se
      // člověk k jedinému milimetru nedoroloval a viděl dvacet krát „0 %".
      // Nula je platná odpověď na „kolik naprší" a musí být vidět stejně jako
      // procento; navíc mají díky tomu všechny dlaždice stejně řádků.
      const dest = Number.isFinite(h.destProcent) ? `<i class="pocasi-hod-dest">${h.destProcent} %</i>` : ''
      const mmCislo = Number(h.srazkyMm)
      const mm = Number.isFinite(mmCislo)
        ? `<i class="${mmCislo > 0 ? 'pocasi-hod-mm prsi' : 'pocasi-hod-mm'}">${String(h.srazkyMm).replace('.', ',')} mm</i>`
        : ''

      return `${predel}<div class="pocasi-hod${zitra ? ' zitra' : ''}">
        <span>${esc(hodina(h.cas))}</span>
        ${IC(ikona)}
        <b>${stupne(h.teplota)}</b>
        ${dest}${mm}
      </div>`
    })
    .join('')

  // Stáří se hlásí jen u staré předpovědi. „Staženo před chvílí" by byl šum.
  const stari = p.stare
    ? `<div class="meta pocasi-stari">Staženo ${esc(kdyStazeno(p.stazeno, ted))} – novější se nepodařilo načíst.</div>`
    : ''

  // Vlasová lišta s běhounkem pod pruhem. Sama o sobě je to jen prvek –
  // hýbe s ní `napojPocasi()`, které se věší až po vložení do stránky.
  //
  // MÍSTO POD PRUHEM, ne v nadpisu sekce (září 2026): pravý slot nadpisu
  // zabral přepínač režimu a město patří k hodinám, které popisuje.
  return `${stari}<div class="pocasi-pruh">${pruh}</div>
    <div class="pocasi-posuvnik"><i></i></div>
    ${kdeId ? `<div class="meta pocasi-kde" id="${kdeId}"></div>` : ''}`
}

/**
 * Vnitřek řádku jednoho dne: datum, ikona počasí, popis, déšť, slunce, teploty.
 *
 * JEDEN ZDROJ PRO OBA REŽIMY (září 2026). U tvé polohy je to celý řádek, na
 * cestě je to jeho horní patro a pod ním stojí název místa. Do té doby si
 * trip-řádek skládal obsah vlastním kódem – a právě proto se rozešel: dostal
 * široký dvouřádkový levý sloupec, na který se muselo vyhodit slunce a nakonec
 * i slovní popis. „Stejný jako u tebe" je teď fakt, ne slib.
 *
 * @param {Record<string, any>|null} d  den z `pocasiProBod()`; `null` = na tenhle
 *   den předpověď nedosáhne (čtrnáctidenní strop)
 * @param {string} kdy  co stojí v levém sloupci; prázdné u druhé a další
 *   zastávky téhož dne, ale sloupec zůstává, aby ikony pod sebou lícovaly
 */
function denRadekHtml(d, { kdy = '' } = {}) {
  // Levá buňka jen tam, kde je co napsat. U tvé polohy nese datum, na cestě
  // ho drží hlavička skupiny – prázdná buňka by tam byla jen odsazení.
  const cely = kdy || !d ? `<span class="pocasi-den-kdy">${esc(kdy)}</span>` : ''
  if (!d) {
    // ŽÁDNÁ IKONA POČASÍ. Do září 2026 tu svítila `i-mlha`, takže „bez
    // předpovědi" vypadalo jako předpověď na mlhu. Od zavedení okna dnů
    // znamená tenhle řádek jedinou věc: nestáhlo se to.
    return `${cely}<span class="pocasi-den-popis pocasi-bez">Zatím bez předpovědi</span>`
  }
  const { ikona, popis } = pocasiPodleKodu(d.kodPocasi)
  // PROCENTO I NULOVÉ, stejné pravidlo jako na dlaždicích hodin: nula je
  // platná odpověď na „kolik naprší", kdežto chybějící údaj vypadá jako
  // porucha. Sloupec se tím navíc přestane zubatit.
  const dest = Number.isFinite(d.destProcent)
    ? `<span class="pocasi-dest">${IC('i-rain')}${d.destProcent} %</span>`
    : ''
  const slunce = d.vychod && d.zapad
    ? `<span class="pocasi-slunce">${IC('i-sun')}${esc(hodina(d.vychod))} – ${esc(hodina(d.zapad))}</span>`
    : ''
  return `${cely}
    ${IC(ikona)}
    <span class="pocasi-den-popis">${esc(popis)}</span>
    ${dest}${slunce}
    <b class="pocasi-den-teplota">${stupne(d.maxC)}<i>${stupne(d.minC)}</i></b>`
}

/**
 * Celá předpověď u tvé polohy: pruh hodin a pod ním dny.
 *
 * @param {Record<string, any>} p
 * @param {{ted?:number, kdeId?:string}} [o]
 */
export function pocasiHtml(p, { ted = Date.now(), kdeId = '' } = {}) {
  const hodiny = pocasiHodinyHtml(p, { ted, kdeId })
  if (!hodiny) return ''

  const dny = (p.dny || [])
    .map((d) => `<div class="pocasi-den">${denRadekHtml(d, { kdy: kratkyDen(d.datum, ted) })}</div>`)
    .join('')

  return `${hodiny}<div class="pocasi-dny">${dny}</div>`
}

/**
 * Dny výpravy s počasím tam, kde ten den máš být (`tadeas-f32-010`).
 *
 * DEN JE SKUPINA S HLAVIČKOU. Nahoře stojí jednou datum a číslo dne výpravy
 * („dnes · 2. den"), pod ním blok za každou zastávku toho dne. Do září 2026
 * nesla datum levá buňka prvního řádku a u dalších zastávek po ní zbývala
 * prázdná díra; navíc se do jednoho řádku tlačilo šest údajů, takže se popis
 * počasí zkracoval na „zataže…", zatímco řádek s názvem byl z poloviny prázdný.
 *
 * Popisek spojuje DATUM A ČÍSLO DNE schválně: počasí do teď mluvilo v datech
 * a itinerář v číslech dnů, takže se ty dvě obrazovky nedaly číst dohromady.
 *
 * Blok samotný má dvě patra – nahoře celý řádek počasí jako u tvé polohy (týž
 * `denRadekHtml()`), dole CELÝ ŘÁDEK jen pro název místa. Že se popis počasí
 * zkracoval, nezpůsobilo slunce, ale levý sloupec s datem; po jeho přesunu do
 * hlavičky se na 390 px vejde všech šest údajů a název má řádek pro sebe.
 * Změřeno: se sluncem dole se místo popisu začal ořezávat název.
 *
 * @param {{dny:Array, zaHorizontem?:number, nevesloSe?:boolean, stazeno?:number}} vysledek
 */
export function pocasiCestaHtml(vysledek, { ted = Date.now() } = {}) {
  const dny = vysledek && Array.isArray(vysledek.dny) ? vysledek.dny : []
  if (!dny.length) return ''

  const skupiny = dny
    .map((d) => {
      const kdy = kratkyDen(d.datum, ted)
      const radky = d.radky
        .map(
          (r) =>
            `<div class="pocasi-den pocasi-den-cesta">
              <div class="pocasi-den-hlava">${denRadekHtml(r.den)}</div>
              <div class="pocasi-kde-radek">
                ${IC(r.ikona || 'i-pinme')}<span>${esc(r.nazev)}</span>
              </div>
            </div>`
        )
        .join('')
      // Dnešek dostane akcentní proužek – ze všech dnů je jediný, kvůli
      // kterému se člověk dívá hned teď.
      return `<div class="pocasi-cesta-den${d.radky.length > 1 ? ' vic' : ''}${kdy === 'dnes' ? ' dnes' : ''}">
        <div class="pocasi-cesta-hlava">${esc(kdy)} <span>· ${d.den}. den</span></div>
        ${radky}
      </div>`
    })
    .join('')

  // Co se nepovedlo, se řekne. Tiché ticho vypadá stejně jako čerstvá data.
  const stari = vysledek.stazeno
    ? `<div class="meta pocasi-stari">Staženo ${esc(kdyStazeno(vysledek.stazeno, ted))} – novější se nepodařilo načíst.</div>`
    : ''
  const pozn = []
  if (vysledek.zaHorizontem) {
    pozn.push(
      `Na dalších ${vysledek.zaHorizontem} ${vysledek.zaHorizontem === 1 ? 'den' : vysledek.zaHorizontem < 5 ? 'dny' : 'dní'} výpravy předpověď nedohlédne.`
    )
  }
  if (vysledek.nevesloSe) pozn.push('Zbytek výpravy se nevešel do jednoho dotazu.')

  return `${stari}<div class="pocasi-cesta">${skupiny}</div>${
    pozn.length ? `<div class="meta pocasi-pozn">${esc(pozn.join(' '))}</div>` : ''
  }`
}

/**
 * Naváže posouvač pod pruhem hodin.
 *
 * PROČ VŮBEC: pruh sahá 24 hodin dopředu, takže je vidět jen jeho třetina
 * a bez ukazatele není poznat, kde se člověk pohybuje. Systémový posuvník
 * je na mobilu schovaný (`scrollbar-width:none`), takže si ho appka kreslí
 * sama – zato tenkou linkou, ne pruhem přes celou obrazovku.
 *
 * @param {HTMLElement} korenovyPrvek  prvek, do kterého se počasí vykreslilo
 */
export function napojPocasi(korenovyPrvek) {
  const pruh = korenovyPrvek.querySelector('.pocasi-pruh')
  const posuvnik = korenovyPrvek.querySelector('.pocasi-posuvnik')
  if (!pruh || !posuvnik) return
  const behoun = posuvnik.firstElementChild

  const srovnej = () => {
    const celkem = pruh.scrollWidth
    const videt = pruh.clientWidth
    // Když se pruh vejde celý, posouvač nemá co ukazovat.
    if (celkem <= videt + 1) {
      posuvnik.hidden = true
      return
    }
    posuvnik.hidden = false
    behoun.style.width = `${(videt / celkem) * 100}%`
    behoun.style.left = `${(pruh.scrollLeft / celkem) * 100}%`
  }

  pruh.onscroll = srovnej
  srovnej()
}
