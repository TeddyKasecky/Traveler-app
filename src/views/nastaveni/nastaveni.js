/**
 * Nastavení – jak má aplikace fungovat.
 *
 * PROČ VEDLE PROFILU A NE V NĚM: Profil odpovídá na „kdo jsem a co mám za
 * sebou". Vzhled, zálohy, CSV a stahování mapy na to neodpovídají – jsou to
 * páky, ne čísla. Do léta 2026 byly na jedné obrazovce a bylo to znát: člověk
 * hledal mezi statistikami tlačítko na zálohu.
 *
 * Otevírá se ozubeným kolečkem v hlavičce (`#nastaveniOpen`), hned vedle
 * profilového. Zaregistrované je to jako normální záložka, takže funguje
 * adresa `#nastaveni` i tlačítko zpět – `core/router.js` snese záložku bez
 * tlačítka ve spodní liště, protože si třídu `on` jen zkouší nasadit
 * a nikde nesedne.
 *
 * VĚTŠINA OBSAHU JE STATICKY V `index.html`. Na tlačítka se věší obsluha při
 * startu a překreslení by ji smazalo – stejný důvod, jaký má hledání v mapě
 * nebo přepínač vzhledu. Odsud se plní jen to, co se mění: kolik místa zabírá
 * telefon, jestli je karta výpravy schovaná a zdroje dat.
 */

import { emit, prefs, savePrefs } from '../../core/store.js'
import { zmerUloziste } from '../../core/storage.js'
import { esc, sklonuj } from '../../core/html.js'
import { debugData, mojeZaznamy, prefixId, prejmenujNeodeslane, sanitizujAutora, ulozDebug } from '../../core/debug.js'
import { aktivujZalozku } from '../../core/router.js'
import { IC } from '../../icons/sprite.js'
import { napojSbalky, segment } from '../../components/vzory.js'
import { toast } from '../../components/toast.js'
import { vyberZeSeznamu, zadej } from '../../components/dialog.js'
import { srovnejDebugTlacitko } from '../../components/debugZapis.js'
import { jsouVektory, obnovKresbyVMape } from '../../map/podklad.js'
import { srovnejStavMapy } from './mapaKeStazeni.js'

const mb = (n) => `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`

/**
 * Doplní hlášku „poslední záloha před …".
 *
 * Přepočítává se při každém otevření Nastavení, ne jednou při startu –
 * aplikace bývá otevřená celý den a údaj by zestárnul. Po týdnu se zvýrazní:
 * záloha je jediná cesta, jak si data přenést do jiného telefonu, a na cestě
 * poznámek rychle přibývá.
 */
function obnovInfoOZaloze() {
  const el = document.getElementById('zalohaInfo')
  if (!el) return

  const kdy = prefs.posledniZaloha || 0
  const dni = kdy ? Math.floor((Date.now() - kdy) / 86400000) : -1
  el.textContent =
    dni < 0
      ? 'Zálohu jsi ještě nestahovala.'
      : dni === 0
        ? 'Záloha stažená dnes.'
        : dni === 1
          ? 'Poslední záloha včera.'
          : `Poslední záloha před ${dni} dny.`
  el.style.color = dni < 0 || dni >= 7 ? 'var(--clay)' : ''
  el.style.fontWeight = dni < 0 || dni >= 7 ? '800' : ''
}

/**
 * Vloží HTML do přihrádky, když v stránce je.
 *
 * Přihrádek je sedm, po jedné ve sbalitelné skupině v `index.html`. Do srpna
 * 2026 to byl jediný `#nastaveniInner` na konci obrazovky; rozdělily je
 * skupiny, protože dvanáct oddílů pod sebou se na telefonu scrollovalo
 * donekonečna (hlášení `tadeas-001`).
 *
 * @param {string} id
 * @param {string} html
 */
/**
 * Které skupiny jsou rozbalené. Jen v paměti, do předvoleb schválně ne:
 * po zavření aplikace se všechno zase sbalí, takže se Nastavení vždycky
 * otevře krátké. Přežít musí jen překreslení, kterých je při jednom otevření
 * obrazovky několik.
 * @type {Set<string>}
 */
const otevreneSkupiny = new Set()

function doPrihradky(id, html) {
  const el = document.getElementById(id)
  if (el) el.innerHTML = html
}

export async function renderNastaveni() {
  // Stačí jedna přihrádka jako důkaz, že je obrazovka v stránce – buď jsou
  // tam všechny, nebo žádná.
  if (!document.getElementById('nastMapa')) return

  obnovInfoOZaloze()

  // Kresby jsou jen na stažené malované mapě, takže bez ní se přepínač
  // ukáže zašedlý – slibovat něco, co se nemá odkud vzít, je horší než to
  // nenabídnout.
  const kresbyJdou = jsouVektory()

  // Kolik záznamů poznámkovač drží. Číslo v tlačítku je jediné místo, kde je
  // vidět, že tam něco leží – jinak by se na zapsané poznámky snadno zapomnělo.
  const zaznamu = debugData.zaznamy.length

  // MAPA – k offline mapě v `index.html` patří i hustota kreseb.
  doPrihradky(
    'nastMapa',
    `<div class="sechd">${IC('i-strom')}Kresby krajiny</div>
    <div class="meta">Stromy a hory kreslené do mapy. Stojí na skutečných lesích a skutečných hřebenech.${kresbyJdou ? '' : ' <b>Napřed je potřeba stáhnout malovanou mapu.</b>'}</div>
    <div class="volbakresby${kresbyJdou ? '' : ' nejde'}">
      ${segment(
        [
          { id: 'vypnute', popisek: 'Vypnuté' },
          { id: 'stridme', popisek: 'Střídmé' },
          { id: 'huste', popisek: 'Husté' },
        ],
        prefs.kresby || 'huste',
        'kresbySeg'
      )}
    </div>`
  )

  // PLÁNOVÁNÍ A TRASY – tři oddíly, takže si nadpisy uvnitř nechávají.
  doPrihradky(
    'nastPlan',
    `<div class="sechd">${IC('i-route')}Řazení výprav</div>
    <div class="meta">Jak řadit výpravy v knihovně a ve složkách. Řazení se nemění tím, kterou výpravu si otevřeš.</div>
    ${segment(
      [
        { id: 'abecedne', popisek: 'Abecedně' },
        { id: 'nejnovejsi', popisek: 'Nejnovější' },
        { id: 'zastavky', popisek: 'Největší' },
        { id: 'zadne', popisek: 'Bez řazení' },
      ],
      prefs.razeniVyprav || 'abecedne',
      'razeniSeg'
    )}

    <div class="sechd">${IC('i-route')}Typ dopravy pro přepočet trasy</div>
    <div class="meta">Čím se počítá skutečná trasa (tlačítko Přepočítat v Itineráři).</div>
    ${segment(
      [
        { id: 'car_fast', popisek: 'Auto' },
        { id: 'bike_road', popisek: 'Kolo' },
        { id: 'foot_fast', popisek: 'Pěšky' },
      ],
      prefs.routeType || 'car_fast',
      'routeTypeSeg'
    )}

    <div class="sechd">${IC('i-nastaveni')}Vlastní API klíč Mapy.com</div>
    <div class="meta">Zatím appka používá jeden sdílený klíč pro všechny. Možnost nastavit si vlastní přijde později.</div>
    <div class="volbaapiklic nejde">
      <input type="text" placeholder="Zatím není k dispozici" disabled>
      <button class="btn small" disabled>Uložit</button>
    </div>`
  )

  // KAŽDÁ SKUPINA ZAČÍNÁ NADPISEM, i ta s jediným oddílem. Do srpna 2026 ho
  // jednotématické neměly, aby neopakovaly hlavičku – jenže vedle skupin, které
  // ho měly, to nevypadalo jako záměr, ale jako chybějící nadpis. Vyřešilo se to
  // opačně: hlavička říká „kam to patří" (Výpravy, Úložiště, Vývoj) a nadpis
  // uvnitř „co to je" (Karta výpravy, Místo v telefonu, Debug poznámkovač).
  doPrihradky(
    'nastMisto',
    `<div class="sechd">${IC('i-globe')}Místo v telefonu</div>
    <div class="meta" id="mistoInfo">Počítá se…</div>`
  )

  doPrihradky(
    'nastKarta',
    `<div class="sechd">${IC('i-van')}Karta výpravy</div>
    <div class="meta">Karta „Naplánovat výlet" se ukáže při prvním otevření Mapy, pak je sbalená do bubliny vpravo dole.</div>
    <div class="btnrow">
      <button class="btn small" id="vypravaZnovu">Ukázat ji znovu</button>
    </div>`
  )

  doPrihradky(
    'nastPoznamkovac',
    `<div class="sechd">${IC('i-brouk')}Debug poznámkovač</div>
    <div class="meta">Zápis nápadu, bugu nebo poznámky za běhu appky, i s technickým kontextem. Přepínač řídí <b>jen</b> to, jestli je v hlavičce vidět kolečko – zachytávání chyb běží vždycky.</div>
    ${segment([{ id: 'zap', popisek: 'Zapnutý' }, { id: 'vyp', popisek: 'Vypnutý' }], prefs.debugRezim ? 'zap' : 'vyp', 'debugSeg')}
    <div class="meta">Píše jako: <b id="debugAutorInfo">${esc(prefs.debugAutor || 'zeptáme se při prvním zápisu')}</b></div>
    <div class="btnrow">
      <button class="btn small" id="debugAutorZmen">Změnit přezdívku</button>
      <button class="btn small" id="debugHesloZmen">Heslo odesílání</button>
      <button class="btn small" id="debugOtevri">Otevřít poznámkovač${zaznamu ? ` (${zaznamu})` : ''}</button>
    </div>`
  )

  doPrihradky(
    'nastOAplikaci',
    `<div class="sechd">${IC('i-book')}Co je Vandrbuch</div>
    <div class="meta">Statická aplikace bez serveru. Poznámky, hodnocení a fotky nikam neodcházejí – jsou jen v tomhle telefonu.</div>

    <div class="sechd">${IC('i-globe')}Zdroje dat</div>
    <div class="meta">Podklad malované mapy: <b>OpenStreetMap</b> přes Protomaps (ODbL) · obrysy zemí <b>Natural Earth</b> (public domain) · stínování terénu z výškopisu <b>elevation-tiles-prod</b> (SRTM, GMTED) · online dlaždice <b>OpenStreetMap</b>.</div>`
  )

  // PŘEPÍNÁNÍ SKUPIN. Hlavičky jsou staticky v `index.html` a překreslením
  // přihrádek se neztratí, ale navěsit se musí – při prvním otevření obrazovky
  // tenhle kód ještě neběžel. Věšet znovu nevadí, `onclick` se přepisuje.
  napojSbalky(document.getElementById('panelNastaveni'), otevreneSkupiny)

  // Obsluha se věší při každém otevření – přihrádky se překreslují, takže tu
  // na rozdíl od statických částí v `index.html` nehrozí, že se ztratí.
  // Právě proto se sbalené skupiny SKRÝVAJÍ a neodstraňují: statické prvky
  // (#expBtn, #csvIn, #mapaStahni…) dostaly obsluhu jednou při startu.
  for (const b of document.querySelectorAll('#kresbySeg button')) {
    b.onclick = () => {
      if (!kresbyJdou) return
      prefs.kresby = b.dataset.seg
      if (!savePrefs()) return
      for (const x of document.querySelectorAll('#kresbySeg button')) x.classList.toggle('on', x === b)
      obnovKresbyVMape()
      toast(b.dataset.seg === 'vypnute' ? 'Kresby vypnuté' : `Kresby ${b.dataset.seg === 'huste' ? 'husté' : 'střídmé'}`)
    }
  }

  for (const b of document.querySelectorAll('#razeniSeg button')) {
    b.onclick = () => {
      prefs.razeniVyprav = b.dataset.seg
      if (!savePrefs()) return
      for (const x of document.querySelectorAll('#razeniSeg button')) x.classList.toggle('on', x === b)
      toast('Řazení výprav nastavené')
    }
  }

  for (const b of document.querySelectorAll('#routeTypeSeg button')) {
    b.onclick = () => {
      prefs.routeType = b.dataset.seg
      if (!savePrefs()) return
      for (const x of document.querySelectorAll('#routeTypeSeg button')) x.classList.toggle('on', x === b)
      toast('Typ dopravy nastavený')
    }
  }

  document.getElementById('vypravaZnovu').onclick = () => {
    prefs.vypravaPredstavena = false
    if (!savePrefs()) return
    toast('Karta výpravy se zase ukáže')
  }

  for (const b of document.querySelectorAll('#debugSeg button')) {
    b.onclick = () => {
      prefs.debugRezim = b.dataset.seg === 'zap'
      if (!savePrefs()) return
      for (const x of document.querySelectorAll('#debugSeg button')) x.classList.toggle('on', x === b)
      srovnejDebugTlacitko()
      toast(prefs.debugRezim ? 'Poznámkovač je v hlavičce' : 'Poznámkovač schovaný')
    }
  }

  // Přejmenování autora. Do srpna 2026 to bylo jedno pole a žádné slovo navíc,
  // takže v telefonu zůstala směs `tadeas-001` a `pc-tadeas-002` podle toho,
  // kdy který záznam vznikl – a nikde nebylo vidět proč.
  document.getElementById('debugAutorZmen').onclick = async () => {
    const podpis = prefs.debugZarizeni
    const zadane = await zadej({
      nadpis: 'Kdo píše?',
      text:
        'Krátká přezdívka bez diakritiky. Je v identifikátoru každého záznamu ' +
        `(${prefixId(prefs.debugAutor || 'tadeas', podpis)}-014) i v názvu exportovaného souboru. ` +
        (podpis
          ? `Písmena ${podpis} uprostřed jsou tohle zařízení a ta se nemění – díky nim si telefon a počítač nesáhnou do stejných čísel.`
          : 'Tohle zařízení zatím nemá svůj podpis – doplní se při prvním zápisu.'),
      vychozi: prefs.debugAutor,
      placeholder: 'tadeas',
    })
    if (zadane === null) return

    const stary = prefixId(prefs.debugAutor, podpis)
    const novy = prefixId(zadane, podpis)
    if (novy === stary) return

    // Odeslané se nepřejmenují ani na přání: na jejich `id` už odkazuje git,
    // rejstřík i konverzace. Neodeslané nikdy neopustily tenhle telefon,
    // takže je bezpečné je srovnat – a je to jediná výjimka z pravidla,
    // že se `id` nemění.
    const { neodeslane, odeslane } = mojeZaznamy(stary)
    if (neodeslane.length) {
      const volba = await vyberZeSeznamu({
        nadpis: `Přejmenovat i ${neodeslane.length} ${sklonuj(neodeslane.length, 'záznam', 'záznamy', 'záznamů')}?`,
        text:
          `Mají zatím ${stary}-… a ještě neodešly do repozitáře, takže je jde bezpečně přečíslovat na ${novy}-…` +
          (odeslane.length
            ? ` ${odeslane.length} už ${sklonuj(odeslane.length, 'odeslaný si své id nechá', 'odeslané si své id nechají', 'odeslaných si své id nechá')} – na to už odkazuje repozitář.`
            : ''),
        polozky: [
          { id: 'ano', popisek: `Přečíslovat na ${novy}-…` },
          { id: 'ne', popisek: 'Nechat je, jak jsou' },
        ],
      })
      if (volba === null) return
      if (volba === 'ano') {
        prejmenujNeodeslane(stary, novy)
        if (!(await ulozDebug())) return toast('Přečíslování se neuložilo')
        emit('debugZmena')
      }
    }

    prefs.debugAutor = sanitizujAutora(zadane)
    if (!savePrefs()) return
    document.getElementById('debugAutorInfo').textContent = prefs.debugAutor
    toast(`Píšeš jako ${prefs.debugAutor}`)
  }

  // Heslo pro odesílání do repozitáře. Není v balíčku aplikace – repozitář je
  // veřejný, takže by šlo vyčíst a na endpoint by mohl psát kdokoli.
  document.getElementById('debugHesloZmen').onclick = async () => {
    const zadane = await zadej({
      nadpis: 'Heslo pro odesílání',
      text:
        'Chrání adresu, na kterou appka posílá poznámky do repozitáře. ' +
        'Musí sedět na to, co je nastavené v Cloudflare. Prázdné heslo odesílání vypne – ' +
        'zbyde tlačítko Stáhnout.',
      vychozi: prefs.debugHeslo,
      placeholder: 'heslo',
    })
    if (zadane === null) return
    prefs.debugHeslo = String(zadane).trim()
    if (!savePrefs()) return
    toast(prefs.debugHeslo ? 'Heslo uložené' : 'Heslo smazané')
  }

  document.getElementById('debugOtevri').onclick = () => aktivujZalozku('debug')

  const m = await zmerUloziste()
  const el = document.getElementById('mistoInfo')
  if (!el) return

  // Rozpad po klíčích, ne jen souhrn. `navigator.storage.estimate()` počítá
  // celý původ – fotky a staženou mapu v IndexedDB, kde je místa dost –
  // takže se v něm ztratí právě to jediné číslo, které může bolet: kolik
  // zabírají uživatelská data v localStorage, kde je strop kolem 5 MB.
  // V srpnu 2026 tam ležely 4,3 MB geometrie tras a nikde to nebylo vidět.
  const kb = (n) => `${Math.round(n / 1024)} kB`
  const rozpad = Object.entries(m.klice)
    .sort((a, b) => b[1] - a[1])
    .map(([klic, n]) => `${esc(klic)} ${kb(n)}`)
    .join(' · ')
  const celkem = Object.values(m.klice).reduce((a, n) => a + n, 0)

  // Druhá půlka rozpadu: co leží ve velkých schránkách. Bez ní je vidět jen
  // localStorage, tedy po srpnu 2026 ta menší část – fotky, trasy, archiv
  // a stažená mapa se slévaly do jednoho čísla za celý původ.
  const s = m.sklady || { fotky: 0, trasy: 0, cesty: 0, mapa: false }
  const velke = [
    s.fotky ? `${s.fotky} ${sklonuj(s.fotky, 'fotka', 'fotky', 'fotek')}` : '',
    s.cesty ? `${s.cesty} ${sklonuj(s.cesty, 'ukončená cesta', 'ukončené cesty', 'ukončených cest')}` : '',
    s.trasy ? `${s.trasy} ${sklonuj(s.trasy, 'spočítaná trasa', 'spočítané trasy', 'spočítaných tras')}` : '',
    s.mapa ? 'stažená mapa' : '',
  ]
    .filter(Boolean)
    .join(' · ')

  el.innerHTML =
    (m.pouzito === null
      ? 'Kolik místa aplikace zabírá, tenhle prohlížeč neřekne.'
      : `Aplikace, fotky a stažená mapa zabírají <b>${mb(m.pouzito)}</b>${m.strop ? ` z ${mb(m.strop)}, které prohlížeč nabízí` : ''}.`) +
    (rozpad
      ? `<br>Poznámky a plány zabírají <b>${kb(celkem)}</b> z asi 5 MB, které na ně prohlížeč dává: ${rozpad}.`
      : '') +
    `<br>Ve velké schránce, kde je místa dost: ${velke || 'zatím nic'}.`

  // Stav stažené mapy se přepočítá při každém otevření – balík mohl mezitím
  // přibýt, zmizet nebo zastarat.
  srovnejStavMapy()
}
