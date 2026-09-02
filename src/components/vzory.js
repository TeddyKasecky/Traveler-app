/**
 * Stavební díly rozvržení podle grafických předloh.
 *
 * PROČ TENHLE SOUBOR EXISTUJE: mockupy ve složce `grafika/` stojí na devíti
 * opakujících se dílech — hero pás, popisek sekce, řádek s náhledem, mřížka fotokaret,
 * dlaždice, pilulky, segment, panel statistik a stavová pilulka. Každá
 * obrazovka je z nich složená. Kdyby si je psala každá zvlášť, do měsíce by se
 * rozešly a redesign by se rozpadl na pět různých vzhledů.
 *
 * Díly vracejí **řetězec HTML**, ne prvky — tak to dělá celý zbytek aplikace
 * (`placeCard.js`, `detail.js`). Obsluha se věší až po vložení do stránky.
 *
 * Vědomě se **nesahá** na `.card`, `.hdr`, `.meta` ani `.tag` z `panel.css`:
 * ty používají čtyři obrazovky a změna by je přestavěla naráz. Nové díly mají
 * vlastní jména a vlastní `styles/components/vzory.css`.
 */

import { esc } from '../core/html.js'
import { IC } from '../icons/sprite.js'

/**
 * Hero pás: akvarel, nadpis v Playfair, podtitulek.
 *
 * Obsah obrazovky se pak vkládá do `.list`, který má zaoblené horní rohy
 * a přes hero pás mírně přesahuje — přesně jako v předlohách Objevuj a Seznam.
 * Nadpis leží v bezpečné zóně vlevo dole, jak předepisuje list „Obrázky
 * na pozadí" (nikdy ne přes nejsvětlejší část obrázku).
 *
 * @param {Object} o
 * @param {string} o.obrazek  adresa akvarelu
 * @param {string} o.nadpis
 * @param {string} [o.podtitulek]
 * @param {string} [o.vpravo]  HTML do pravého horního kouta (tlačítko, štítek)
 * @returns {string}
 */
export function heroPas({ obrazek, nadpis, podtitulek = '', vpravo = '' }) {
  return `<div class="heropas">
    <img src="${obrazek}" alt="" class="heropas-obr">
    ${vpravo ? `<div class="heropas-vpravo">${vpravo}</div>` : ''}
    <div class="heropas-text">
      <h2>${esc(nadpis)}</h2>
      ${podtitulek ? `<p>${esc(podtitulek)}</p>` : ''}
    </div>
  </div>`
}

/**
 * Popisek sekce: prostrkané verzálky, vpravo volitelná akce.
 *
 * V předlohách je to jediný způsob, jak se odděluje obsah — žádné linky,
 * žádné rámečky. Akce vpravo je textové tlačítko („Zobrazit vše"), ne ikona.
 *
 * @param {string} popisek
 * @param {Object} [o]
 * @param {string} [o.akce]  text odkazu vpravo
 * @param {string} [o.akceId]  id, na které se věší obsluha
 * @param {string} [o.pozn]  místo akce jen šedý text (např. „Přetáhni pro změnu pořadí“)
 */
export function sekce(popisek, { akce = '', akceId = '', akceIkona = 'i-sipka', pozn = '', poznId = '' } = {}) {
  // `poznId` je tu kvůli údajům, které se dopočítají až po vykreslení –
  // třeba nejbližší město u počasí, které čeká na dotažení `mesta.json`.
  // Prázdná poznámka se pak vykreslí taky, aby bylo kam zapsat.
  const vpravo = akce
    // `akceIkona` je nepovinná a výchozí zůstává šipka doprava. Přepínač
    // režimu počasí ji ale mít nesmí – šipka slibuje odchod jinam, kdežto
    // tenhle knoflík obsah přepne na místě (`tadeas-f32-010`).
    ? `<button class="sekce-akce"${akceId ? ` id="${akceId}"` : ''}>${esc(akce)}${IC(akceIkona, 'font-size:12px')}</button>`
    : pozn || poznId
      ? `<span class="sekce-pozn"${poznId ? ` id="${poznId}"` : ''}>${esc(pozn)}</span>`
      : ''
  return `<div class="sekce">${esc(popisek)}${vpravo}</div>`
}

/**
 * Řádek: náhled vlevo, texty, ovládání vpravo.
 *
 * Nejpoužívanější díl předloh — Seznam, Rychlá inspirace, Itinerář. Pevná
 * velikost náhledu je tu schválně: seznam kreslí až 250 řádků a bez pevných
 * rozměrů by se rozvržení přepočítávalo pod prstem.
 *
 * @param {Object} o
 * @param {string} [o.obrazek]
 * @param {string} o.nadpis
 * @param {string} [o.podnadpis]
 * @param {string} [o.meta]  HTML – bývá tam ikona kategorie nebo hvězdičky
 * @param {string} [o.vpravo]  HTML – ikonové tlačítko, stavová pilulka, šipka
 * @param {string} [o.vlevo]  HTML před náhledem – úchyt na tahání, číslo zastávky
 * @param {string} [o.id]  do `data-id`
 * @param {string} [o.tridy]  navíc
 * @param {string} [o.vyrez]  object-position náhledu
 * @param {string} [o.styl]  inline styl obalu – tudy chodí `--pc`
 * @param {string} [o.zaloha]  adresa, na kterou se přepne, když se obrázek nenačte
 */
export function radek({
  obrazek = '',
  nadpis,
  podnadpis = '',
  meta = '',
  vpravo = '',
  vlevo = '',
  id = '',
  tridy = '',
  vyrez = '',
  styl = '',
  zaloha = '',
}) {
  return `<div class="radek ${tridy}"${styl ? ` style="${styl}"` : ''}${id ? ` data-id="${id}"` : ''}>
    ${vlevo}
    ${
      obrazek
        ? `<img class="radek-obr" src="${obrazek}" alt="" loading="lazy" decoding="async"
             width="76" height="76"${vyrez ? ` style="object-position:${vyrez}"` : ''}
             ${zaloha ? `data-zaloha="${zaloha}" onerror="this.onerror=null;this.src=this.dataset.zaloha"` : ''}>`
        : ''
    }
    <div class="radek-text">
      <h3>${esc(nadpis)}</h3>
      ${podnadpis ? `<div class="radek-pod">${esc(podnadpis)}</div>` : ''}
      ${meta ? `<div class="radek-meta">${meta}</div>` : ''}
    </div>
    ${vpravo ? `<div class="radek-vpravo">${vpravo}</div>` : ''}
  </div>`
}

/**
 * Mřížka fotokaret s názvem přes obrázek – tři sloupce.
 *
 * DO SRPNA 2026 SE JMENOVALA `karusel()` a byl to posuvný pás. Na obrazovku
 * se vešly dvě a půl karty a o zbytku se člověk dozvěděl jedině tím, že zkusil
 * táhnout prstem. Dnes jsou vidět všechny naráz: Domů 3 × 2, Objevuj 3 × 3.
 *
 * Pás z aplikace úplně nezmizel – „Uložená místa" na Mapě ho mají dál, ale je
 * to jiná komponenta (`.karusel-radky`) a jsou v ní řádky, ne fotokarty.
 *
 * @param {Array<{obrazek:string, nadpis:string, podnadpis?:string, meta?:string, id?:string, vyrez?:string}>} karty
 * @param {string} [tridy]
 */
export function fotomrizka(karty, tridy = '') {
  if (!karty.length) return ''
  return `<div class="fotomrizka ${tridy}">${karty
    .map(
      (k) => `<div class="fotokarta"${k.id ? ` data-id="${k.id}"` : ''}>
        ${k.obrazek ? `<img src="${k.obrazek}" alt="" loading="lazy" decoding="async"${k.vyrez ? ` style="object-position:${k.vyrez}"` : ''}${k.zaloha ? ` data-zaloha="${k.zaloha}" onerror="this.onerror=null;this.src=this.dataset.zaloha"` : ''}>` : ''}
        <div class="fotokarta-text">
          <h3>${esc(k.nadpis)}</h3>
          ${k.podnadpis ? `<span>${esc(k.podnadpis)}</span>` : ''}
          ${k.meta ? `<div class="fotokarta-meta">${k.meta}</div>` : ''}
        </div>
      </div>`
    )
    .join('')}</div>`
}

/**
 * Mřížka dlaždic: nadpis nahoře, ikona uprostřed, popisek dole.
 *
 * Pořadí je z předlohy Objevuj a je obrácené proti dnešním dlaždicím kolekcí,
 * kde je ikona první. Čtyři sloupce, na úzkém telefonu dva.
 *
 * @param {Array<{nadpis:string, ikona:string, popisek?:string, barva?:string, id?:string}>} polozky
 */
export function dlazdice(polozky) {
  return `<div class="dlazdice">${polozky
    .map(
      // `nejde` = dlaždice, na kterou nejsou data. Zůstane vidět a řekne proč,
      // ale je OPRAVDU neaktivní – tlačítko, které vypadá zmáčknutelně a nic
      // nedělá, je horší než tlačítko, které se nedá zmáčknout.
      (p) => `<button class="dlazdice-kus${p.nejde ? ' nejde' : ''}"${p.nejde ? ' disabled' : ''}${p.id ? ` data-id="${p.id}"` : ''}${p.barva ? ` style="--dc:${p.barva}"` : ''}>
        <b>${esc(p.nadpis)}</b>
        ${IC(p.ikona)}
        ${p.popisek ? `<span>${esc(p.popisek)}</span>` : ''}
      </button>`
    )
    .join('')}</div>`
}

/**
 * Řádek pilulek: ikona nad popiskem, aktivní plná.
 *
 * Předlohy je používají na nálady a na rychlé filtry nad mapou. Prázdná `ikona`
 * se vynechá — rychlý filtr „Vše“ ji v předloze nemá a `IC('')` by vyrobilo
 * odkaz do prázdna.
 *
 * @param {Array<{id:string, popisek:string, ikona?:string, on?:boolean}>} polozky
 * @param {string} [tridy]
 */
export function pilulky(polozky, tridy = '') {
  return `<div class="pilulky ${tridy}">${polozky
    .map(
      (p) => `<button class="pilulka${p.on ? ' on' : ''}" data-id="${p.id}">
        ${p.ikona ? IC(p.ikona) : ''}<span>${esc(p.popisek)}</span>
      </button>`
    )
    .join('')}</div>`
}

/**
 * Segmentovaný přepínač. Aktivní díl je okrový.
 * @param {Array<{id:string, popisek:string}>} dily
 * @param {string} aktivni
 * @param {string} [id]  id obalu, na který se věší obsluha
 */
export function segment(dily, aktivni, id = '') {
  return `<div class="segment"${id ? ` id="${id}"` : ''}>${dily
    .map((d) => `<button class="${d.id === aktivni ? 'on' : ''}" data-seg="${d.id}">${esc(d.popisek)}</button>`)
    .join('')}</div>`
}

/**
 * Panel statistik: ikona · popisek · hodnota, pod sebou.
 * Předlohy ho mají v kartě trasy a ve faktech o místě.
 *
 * @param {Array<{ikona:string, popisek:string, hodnota:string}>} radky
 * @param {string} [tridy]
 */
export function statpanel(radky, tridy = '') {
  return `<div class="statpanel ${tridy}">${radky
    .map(
      (r) => `<div class="statradek">${IC(r.ikona)}<div>
        <span>${esc(r.popisek)}</span><b>${esc(r.hodnota)}</b>
      </div></div>`
    )
    .join('')}</div>`
}

/**
 * Vodorovná řada čísel s popiskem – „6 420 km · 28 míst · 12 kempů · 4 země".
 *
 * Ikona stojí vedle čísla a popisek je pod nimi, jak to má karta výpravy
 * v předloze. Sloupce odděluje vlasová linka, ne mezera.
 *
 * `klic` je nepovinný: když ho položka má, vznikne z ní `<button>` s
 * `data-cislo`, na který jde věšet obsluhu. Bez něj zůstane `<div>` – pět
 * dalších obrazovek řadu používá jako čistý údaj a klikatelné číslo, které
 * nic nedělá, je horší než nudné.
 *
 * @param {Array<{ikona?:string, hodnota:string, popisek:string, klic?:string}>} cisla
 */
export function cislaRada(cisla) {
  return `<div class="cisla">${cisla
    .map((c) => {
      const vnitrek = `<div class="cislo-h">${c.ikona ? IC(c.ikona) : ''}<b>${esc(c.hodnota)}</b></div>
        <span>${esc(c.popisek)}</span>`
      return c.klic
        ? `<button class="cislo cislo-akce" data-cislo="${esc(c.klic)}">${vnitrek}</button>`
        : `<div class="cislo">${vnitrek}</div>`
    })
    .join('')}</div>`
}

/**
 * Stavová pilulka podle `store.stav[id]`.
 *
 * Tři stavy: nic → „Uložit" (světlá), `wish` → „Uložená" zvýrazněná,
 * `visited` → „Navštíveno" plná mechová. Stav `wish` se VŠUDE jmenuje
 * „Uložená" a kreslí záložkou – do srpna 2026 se tomu na Mapě říkalo
 * „Uložená" a v Seznamu jinak, s botou – vypadalo to jako dvě různé věci.
 * Bota (`i-boot`) zůstává jen filtru „Nenavštívená". Hlídá `check-ikony`.
 *
 * @param {string|undefined} stav
 */
export function stavPill(stav) {
  if (stav === 'visited') return `<span class="stavpill je">${IC('i-check')}Navštíveno</span>`
  if (stav === 'wish') return `<span class="stavpill chci">${IC('i-zalozka')}Uložená</span>`
  return `<span class="stavpill">${IC('i-zalozka')}Uložit</span>`
}

/**
 * Ikonové tlačítko – světlý zaoblený kvadrát, jak ho má list „Komponenty UI".
 * @param {string} ikona
 * @param {Object} [o]
 * @param {string} [o.id]
 * @param {string} [o.titul]
 * @param {boolean} [o.on]
 */
export function ikonBtn(ikona, { id = '', titul = '', on = false } = {}) {
  return `<button class="ikonbtn${on ? ' on' : ''}"${id ? ` id="${id}"` : ''}${titul ? ` title="${esc(titul)}"` : ''}>${IC(ikona)}</button>`
}

/**
 * Sbalitelná skupina – hlavička s šipkou a tělo pod ní.
 *
 * PROČ VZNIKLA: Nastavení mělo dvanáct oddílů pod sebou v jedné řadě a Profil
 * sedm, z toho tři s mřížkou devadesáti šesti aut. Na telefonu se obojí
 * scrollovalo donekonečna (hlášení `tadeas-001`). Vzhled je opsaný z panelu
 * EXPORT v poznámkovači, který tenhle problém řešil první.
 *
 * TĚLO SE SKRÝVÁ, NEODSTRAŇUJE. Půlka Nastavení je staticky v `index.html`
 * a obsluha se na ni věší **jednou při startu** (`initFilterPanel()`,
 * `initMapaKeStazeni()`). Kdyby sbalení prvky z DOM vyhodilo, „Stáhnout zálohu"
 * by po prvním sbalení přestalo fungovat a nikde by to neblikklo. Skrytí navíc
 * nic nestojí: mřížka aut má `loading="lazy"`, takže se schované obrázky
 * stejně nestahují.
 *
 * Panel EXPORT v poznámkovači si svoje vykreslování nechává – tělo si renderuje
 * podmíněně, protože se mu obsluha věší až při otevření. Sdílí se vzhled, ne
 * mechanika.
 *
 * @param {string} id      stabilní jméno skupiny, drží se v něm otevřenost
 * @param {string} nadpis
 * @param {string} obsah   HTML těla
 * @param {Object} [o]
 * @param {string} [o.ikona]
 * @param {boolean} [o.otevreno]
 */
export function sbalka(id, nadpis, obsah, { ikona = '', otevreno = false } = {}) {
  return `<div class="sbalka">
    <button class="sbalka-hlava${otevreno ? ' on' : ''}" data-sbalka="${esc(id)}" aria-expanded="${otevreno}">
      ${ikona ? IC(ikona) : ''}<span>${esc(nadpis)}</span>${IC('i-sipka')}
    </button>
    <div class="sbalka-telo" data-sbalka-telo="${esc(id)}"${otevreno ? '' : ' hidden'}>${obsah}</div>
  </div>`
}

/**
 * Naváže přepínání skupin uvnitř `koren` a hlásí změnu volajícímu.
 *
 * Otevřenost si drží volající v `Set`u, ne tenhle díl: Nastavení i Profil se
 * překreslují a stav musí překreslení přežít. Do předvoleb se neukládá –
 * po zavření aplikace se všechno zase sbalí, takže obrazovka je vždycky krátká.
 *
 * @param {HTMLElement} koren
 * @param {Set<string>} otevrene
 */
export function napojSbalky(koren, otevrene) {
  for (const hlava of koren.querySelectorAll('[data-sbalka]')) {
    hlava.onclick = () => {
      const id = hlava.dataset.sbalka
      const telo = koren.querySelector(`[data-sbalka-telo="${id}"]`)
      const nove = !otevrene.has(id)
      if (nove) otevrene.add(id)
      else otevrene.delete(id)
      hlava.classList.toggle('on', nove)
      hlava.setAttribute('aria-expanded', String(nove))
      if (telo) telo.hidden = !nove
    }
  }
}
