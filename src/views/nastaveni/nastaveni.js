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

import { prefs, savePrefs } from '../../core/store.js'
import { zmerUloziste } from '../../core/storage.js'
import { IC } from '../../icons/sprite.js'
import { segment } from '../../components/vzory.js'
import { toast } from '../../components/toast.js'
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

export async function renderNastaveni() {
  const wrap = document.getElementById('nastaveniInner')
  if (!wrap) return

  obnovInfoOZaloze()

  // Kresby jsou jen na stažené malované mapě, takže bez ní se přepínač
  // ukáže zašedlý – slibovat něco, co se nemá odkud vzít, je horší než to
  // nenabídnout.
  const kresbyJdou = jsouVektory()

  wrap.innerHTML = `
    <div class="sechd">${IC('i-strom')}Kresby krajiny</div>
    <div class="meta" style="margin:0 2px 10px">Stromy a hory kreslené do mapy. Stojí na skutečných lesích a skutečných hřebenech.${kresbyJdou ? '' : ' <b>Napřed je potřeba stáhnout malovanou mapu.</b>'}</div>
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
    </div>

    <div class="sechd">${IC('i-route')}Řazení výprav</div>
    <div class="meta" style="margin:0 2px 10px">Jak řadit výpravy v knihovně a ve složkách. Řazení se nemění tím, kterou výpravu si otevřeš.</div>
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
    <div class="meta" style="margin:0 2px 10px">Čím se počítá skutečná trasa (tlačítko Přepočítat v Itineráři).</div>
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
    <div class="meta" style="margin:0 2px 10px">Zatím appka používá jeden sdílený klíč pro všechny. Možnost nastavit si vlastní přijde později.</div>
    <div class="volbaapiklic nejde">
      <input type="text" placeholder="Zatím není k dispozici" disabled>
      <button class="btn small" disabled>Uložit</button>
    </div>

    <div class="sechd">${IC('i-globe')}Místo v telefonu</div>
    <div class="meta" id="mistoInfo" style="margin:0 2px 10px">Počítá se…</div>

    <div class="sechd">${IC('i-van')}Karta výpravy</div>
    <div class="meta" style="margin:0 2px 10px">Karta „Naplánovat výlet" se ukáže při prvním otevření Mapy, pak je sbalená do bubliny vpravo dole.</div>
    <div class="btnrow" style="margin:0">
      <button class="btn small" id="vypravaZnovu">Ukázat ji znovu</button>
    </div>

    <div class="sechd">${IC('i-book')}O aplikaci</div>
    <div class="meta" style="margin:0 2px 4px">Vandrbuch je statická aplikace bez serveru. Poznámky, hodnocení a fotky nikam neodcházejí – jsou jen v tomhle telefonu.</div>
    <div class="meta" style="margin:0 2px 10px">Podklad malované mapy: <b>OpenStreetMap</b> přes Protomaps (ODbL) · obrysy zemí <b>Natural Earth</b> (public domain) · stínování terénu z výškopisu <b>elevation-tiles-prod</b> (SRTM, GMTED) · online dlaždice <b>OpenStreetMap</b>.</div>
  `

  // Obsluha se věší při každém otevření – `#nastaveniInner` se překresluje,
  // takže tu na rozdíl od statických částí nehrozí, že se ztratí.
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

  const m = await zmerUloziste()
  const el = document.getElementById('mistoInfo')
  if (!el) return
  el.innerHTML =
    m.pouzito === null
      ? 'Kolik místa aplikace zabírá, tenhle prohlížeč neřekne.'
      : `Aplikace, fotky a stažená mapa zabírají <b>${mb(m.pouzito)}</b>${m.strop ? ` z ${mb(m.strop)}, které prohlížeč nabízí` : ''}.`

  // Stav stažené mapy se přepočítá při každém otevření – balík mohl mezitím
  // přibýt, zmizet nebo zastarat.
  srovnejStavMapy()
}
