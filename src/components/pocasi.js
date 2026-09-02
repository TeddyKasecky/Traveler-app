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
import { nactiPocasi, nactiPocasiProBody, pocasiPodleKodu, termin } from '../views/plan/termin.js'

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
 * Kolik dní výpravy se ukáže v režimu „na cestě".
 *
 * Open-Meteo umí šestnáct, ale poslední třetina je věštění, po kterém se nikdo
 * nerozhoduje. Čtrnáct pokryje běžnou dovolenou celou.
 */
const DNU_CESTY = 14

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
 * Zastávky výpravy rozdělené po dnech, s datem každého dne.
 *
 * ZA JÍZDY Z ROZJETÉ CESTY, jinak z plánu. `CLAUDE.md` ty dvě věci záměrně
 * rozlišuje: cesta je „jak to fakt je" a večer se v ní něco přidá z košíku,
 * plán zůstává „jak jsme to chtěli". Počasí má odpovídat na „bude tam, kam
 * opravdu mířím, pršet".
 *
 * DEN JEDNA JE DATUM ZAČÁTKU. U rozjeté cesty se počítá od vyjetí
 * (`cesta.zacatek`), takže termín není potřeba; u plánu z `vypravaOd`.
 * Bez obojího se vrací prázdno – nedá se říct, který den je které datum.
 *
 * @returns {Array<{den:number, datum:string, mista:Array<Record<string,any>>}>}
 */
export function dnyCesty() {
  const c = store.cesta
  const zastavky = c ? c.zastavky || [] : store.plan || []
  const delky = ((c ? c.dny : store.planDny) || []).map(Number).filter((x) => Number.isFinite(x) && x >= 0)

  // Datum prvního dne. U cesty z okamžiku vyjetí, u plánu z termínu.
  const prvni = c
    ? new Date(c.zacatek).toISOString().slice(0, 10)
    : termin().od
  if (!prvni || !zastavky.length) return []

  // Rozdělení na dny stejným pravidlem jako `dnyPlanu()`: co se do délek
  // nevejde, padá do posledního dne.
  const skupiny = []
  let i = 0
  for (const d of delky) {
    if (i > zastavky.length || (i === zastavky.length && d > 0)) break
    skupiny.push(zastavky.slice(i, i + d))
    i += d
  }
  if (i < zastavky.length || !skupiny.length) skupiny.push(zastavky.slice(i))

  const [r, m, dd] = prvni.split('-').map(Number)
  const zaklad = Date.UTC(r, m - 1, dd)
  return skupiny.slice(0, DNU_CESTY).map((ids, k) => {
    const den = new Date(zaklad + k * 86400000)
    return {
      den: k + 1,
      datum: `${den.getUTCFullYear()}-${String(den.getUTCMonth() + 1).padStart(2, '0')}-${String(den.getUTCDate()).padStart(2, '0')}`,
      mista: ids.map((id) => S.byId[id]).filter((p) => p && Number.isFinite(p.lat)),
    }
  })
}

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
 * @param {{ted?:number}} [o]
 * @returns {Promise<Array<{den:number, datum:string, radky:Array<{nazev:string, den:Record<string,any>|null}>}>|null>}
 */
export async function pocasiProCestu({ ted = Date.now() } = {}) {
  if (!prefs.pocasi) return null
  const dny = dnyCesty()
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
  for (const [k, b] of potreba) {
    if (chybejici.length + predpovedi.size >= STROP_BODU) break
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

  return dny.map((d) => {
    const body = d.mista.length ? d.mista : S.userPos ? [{ ...S.userPos, n: 'u tebe' }] : []
    return {
      den: d.den,
      datum: d.datum,
      radky: body.map((b) => {
        const p = predpovedi.get(klic(b))
        return {
          nazev: b.n || 'u tebe',
          den: p ? (p.dny || []).find((x) => x.datum === d.datum) || null : null,
        }
      }),
    }
  })
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
 * Celá předpověď u tvé polohy: pruh hodin a pod ním dny.
 *
 * @param {Record<string, any>} p
 * @param {{ted?:number, kdeId?:string}} [o]
 */
export function pocasiHtml(p, { ted = Date.now(), kdeId = '' } = {}) {
  const hodiny = pocasiHodinyHtml(p, { ted, kdeId })
  if (!hodiny) return ''

  const dny = (p.dny || [])
    .map((d) => {
      const { ikona, popis } = pocasiPodleKodu(d.kodPocasi)
      const dest = Number.isFinite(d.destProcent) && d.destProcent > 0
        ? `<span class="pocasi-dest">${IC('i-rain')}${d.destProcent} %</span>`
        : ''
      const slunce = d.vychod && d.zapad
        ? `<span class="pocasi-slunce">${IC('i-sun')}${esc(hodina(d.vychod))} – ${esc(hodina(d.zapad))}</span>`
        : ''
      return `<div class="pocasi-den">
        <span class="pocasi-den-kdy">${esc(kratkyDen(d.datum, ted))}</span>
        ${IC(ikona)}
        <span class="pocasi-den-popis">${esc(popis)}</span>
        ${dest}${slunce}
        <b class="pocasi-den-teplota">${stupne(d.maxC)}<i>${stupne(d.minC)}</i></b>
      </div>`
    })
    .join('')

  return `${hodiny}<div class="pocasi-dny">${dny}</div>`
}

/**
 * Dny výpravy s počasím tam, kde ten den máš být (`tadeas-f32-010`).
 *
 * DEN SE KOPÍRUJE POD SEBE ZA KAŽDOU ZASTÁVKU: tři zastávky = tři řádky se
 * stejným datem, každý s počasím své oblasti. Blízké se neslučují – dva body
 * v jednom údolí dají dva řádky, i když řeknou skoro totéž. Že patří k sobě,
 * ukáže **společné podbarvení přes celou skupinu**, ne rámeček kolem každého;
 * datum se proto píše jen u prvního řádku dne.
 *
 * @param {Array<{den:number, datum:string, radky:Array<{nazev:string, den:Record<string,any>|null}>}>} dny
 */
export function pocasiCestaHtml(dny, { ted = Date.now() } = {}) {
  if (!Array.isArray(dny) || !dny.length) return ''

  return `<div class="pocasi-cesta">${dny
    .map((d) => {
      const radky = d.radky
        .map((r, i) => {
          const p = r.den
          const { ikona, popis } = p ? pocasiPodleKodu(p.kodPocasi) : { ikona: 'i-mlha', popis: '' }
          // Déšť ANO, východ a západ slunce NE. V řádcích u tvé polohy jsou
          // obojí, jenže tam je levý sloupec jednořádkový; tady nese datum
          // i název místa, takže by se to na 390 px nevešlo – `pocasi.css`
          // ostatně slunce pod 380 px schovává už dnes.
          const dest = p && Number.isFinite(p.destProcent) && p.destProcent > 0
            ? `<span class="pocasi-dest">${IC('i-rain')}${p.destProcent} %</span>`
            : ''
          // Předpověď dosahuje čtrnáct dní; na vzdálenější den prostě není.
          // Řekne se to, místo aby řádek mlčel nebo zmizel.
          const udaje = p
            ? `<span class="pocasi-den-popis">${esc(popis)}</span>${dest}
               <b class="pocasi-den-teplota">${stupne(p.maxC)}<i>${stupne(p.minC)}</i></b>`
            : '<span class="pocasi-den-popis pocasi-bez">Zatím bez předpovědi</span>'

          // DATUM JEN U PRVNÍHO ŘÁDKU DNE. Je společné celému dni a u dalších
          // zastávek by se jen opakovalo; že řádky patří k sobě, drží
          // podbarvení skupiny. Název místa má naopak každý řádek vlastní.
          return `<div class="pocasi-den pocasi-den-cesta">
            <span class="pocasi-den-kdy">
              <b>${i === 0 ? esc(kratkyDen(d.datum, ted)) : ''}</b>
              <span class="pocasi-kde-radek">${IC('i-pinme')}<span>${esc(r.nazev)}</span></span>
            </span>
            ${IC(ikona)}${udaje}
          </div>`
        })
        .join('')
      return `<div class="pocasi-cesta-den${d.radky.length > 1 ? ' vic' : ''}">${radky}</div>`
    })
    .join('')}</div>`
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
