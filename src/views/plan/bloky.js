/**
 * Vykreslení a obsluha vlastních bloků v plánu: poznámka, zaškrtávací
 * seznam, bod trasy, odkaz a rozpočet.
 *
 * Datová logika (`bloky()`, `pridejBod()`, `rozpoznejSouradnice()`…) je
 * v `body.js` – ten neimportuje `IC` ani `icons/sprite.js`, takže ho jde
 * testovat čistým Node bez prohlížeče (`scripts/check-dny.mjs`). Tenhle
 * soubor skládá HTML a věší obsluhu, proto `IC` importovat smí a musí.
 *
 * BOD TRASY (blok typu `misto`) je od srpna 2026 plnohodnotný bod trasy –
 * start, nocleh, cíl nebo vlastní (pole `druh`, viz `body.js`). Kreslí ho
 * `plan.js` mezi zastávkami podle kotvy `po`/`den`, ne `blokyDneHtml()` tady.
 * Čtyři cesty zadání polohy: vložený text (odkaz z Google Maps / Mapy.cz,
 * souřadnice v desetinném tvaru i ve stupních), adresa přes Nominatim (jen
 * online), ruční GPS a ťuknutí do mapy. Na mapě má znak svého druhu, počítá
 * se do trasy (`map/planLine.js`) a v Aktuální cestě jde odznačit jako
 * zastávka.
 *
 * Zaškrtnutí (`hotovo` u položek seznamu a u bodů) žije na bloku samém –
 * odškrtává se v Aktuální cestě a dá se vynulovat v editoru.
 */

import { store, save, saveOdlozene } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { IC } from '../../icons/sprite.js'
import { toast } from '../../components/toast.js'
import { potvrd, vyberZeSeznamu } from '../../components/dialog.js'
import { zjistiPolohuJednorazove } from '../../core/geo.js'
import { ulozenePozice, pozice } from '../../core/pozice.js'
import {
  bloky, pridejBlok, smazBlok, blok, DRUHY, vsechnyBody, pridejBod,
  hledejAdresu, rozpoznejSouradnice, rozpocetCelkem, souradniceBodu,
  maBod, pridejStartCil,
} from '../../core/plan/body.js'

// Znovu vyvezené – plan.js a check-dny.mjs je berou odsud/z body.js podle toho,
// jestli potřebují jen data (body.js) nebo i vzhled (tady).
export {
  bloky, pridejBlok, smazBlok, blok, DRUHY, vsechnyBody, pridejBod,
  hledejAdresu, rozpoznejSouradnice, rozpocetCelkem, souradniceBodu,
  maBod, pridejStartCil,
}

/* ================= vykreslení ================= */

/** Ikony typů – jedna věc, jedna ikona, jako všude jinde. */
const TYPY = {
  poznamka: { ikona: 'i-quill', popisek: 'Poznámka' },
  seznam: { ikona: 'i-check', popisek: 'Zaškrtávací seznam' },
  misto: { ikona: 'i-pinme', popisek: 'Vlastní místo' },
  odkaz: { ikona: 'i-globe', popisek: 'Odkaz' },
  rozpocet: { ikona: 'i-euro', popisek: 'Rozpočet' },
}

/**
 * HTML bloků jednoho dne (`den` = číslo od 1, null = bloky celého plánu).
 * @returns {string}
 */
export function blokyDneHtml(den) {
  // Body trasy (typ misto) se od srpna 2026 kreslí mezi zastávkami – tady ne.
  return bloky()
    .filter((b) => b.typ !== 'misto')
    .filter((b) => (den === null ? b.den == null : b.den === den))
    .map(blokHtml)
    .join('')
}

/**
 * Nabídka „co ještě přidám do plánu“ – jedna skupina pod jedním nadpisem.
 *
 * DEN PATŘÍ MEZI OSTATNÍ (hlášení `tadeas-f32-018`). Do srpna 2026 stálo
 * „Přidat den" samo v `.btnrow` o kus níž, oddělené rozpočtem a seznamem –
 * přitom je to táž otázka jako poznámka nebo seznam: co do plánu ještě dát.
 * Volající ho posílá sem, protože jen on ví, jestli je co přidávat.
 *
 * Tlačítka jsou **každé široké podle svého popisku** a řádky se plní zleva.
 * Do teď dědila `.btn{flex:1;min-width:120px}` ze `sheet.css`, takže se
 * roztahovala na stejnou šířku a „Odkaz" zabíral tolik co „Zaškrtávací seznam“.
 *
 * @param {string} [navic]  HTML dalších tlačítek do téže skupiny
 */
export function pridatBlokHtml(navic = '') {
  // Bez „Vlastní místo": bod trasy se přidává tlačítkem „+ Přidat bod" ve dni.
  return `<div class="sechd">${IC('i-plus')}Přidat do plánu</div>
  <div class="blok-pridat">
    ${Object.entries(TYPY)
      .filter(([typ]) => typ !== 'misto')
      .map(([typ, t]) => `<button class="btn small" data-blok-novy="${typ}">${IC(t.ikona)}${t.popisek}</button>`)
      .join('')}${navic}
  </div>`
}

export function blokHtml(b) {
  const t = b.typ === 'misto' ? DRUHY[b.druh] || DRUHY.vlastni : TYPY[b.typ] || TYPY.poznamka
  const telo =
    b.typ === 'poznamka'
      ? `<input class="blok-nadpis" data-pole="nadpis" placeholder="Nadpis (nepovinný)" value="${esc(b.nadpis || '')}">
         <textarea class="blok-text" data-pole="text" rows="2" placeholder="Text poznámky…">${esc(b.text || '')}</textarea>`
      : b.typ === 'seznam'
        ? seznamTelo(b)
        : b.typ === 'misto'
          ? mistoTelo(b)
          : b.typ === 'odkaz'
            ? `<input class="blok-nadpis" data-pole="popisek" placeholder="Popisek (třeba Kemp u jezera)" value="${esc(b.popisek || '')}">
               <input class="blok-nadpis" data-pole="url" inputmode="url" placeholder="https://…" value="${esc(b.url || '')}">
               ${b.url ? `<a class="blok-odkaz" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">${IC('i-globe')}Otevřít</a>` : ''}`
            : rozpocetTelo(b)

  return `<div class="blok" data-blok="${b.id}">
    <div class="blok-hlava">${IC(t.ikona)}<span>${t.popisek}${b.den ? ` · ${b.den}. den` : ''}</span>
      <button class="blok-smaz" data-act="smaz" title="Smazat blok">${IC('i-x')}</button>
    </div>
    ${telo}
  </div>`
}

function seznamTelo(b) {
  const polozky = (b.polozky || [])
    .map(
      (p, i) => `<div class="blok-polozka">
        <button class="blok-fajfka${p.hotovo ? ' on' : ''}" data-act="odskrtnout" data-i="${i}">${IC('i-check')}</button>
        <input data-act="polozka" data-i="${i}" placeholder="Položka…" value="${esc(p.text || '')}">
        <button class="blok-mensi" data-act="smaz-polozku" data-i="${i}" title="Smazat položku">${IC('i-x')}</button>
      </div>`
    )
    .join('')
  return `<input class="blok-nadpis" data-pole="nadpis" placeholder="Název seznamu" value="${esc(b.nadpis || '')}">
    ${polozky}
    <button class="btn small" data-act="pridat-polozku">${IC('i-plus')}Přidat položku</button>`
}

function mistoTelo(b) {
  const zPozice = b.zdroj && b.zdroj.typ === 'pozice' ? pozice(b.zdroj.id) : null
  const zGps = !!(b.zdroj && b.zdroj.typ === 'gps')
  const s = souradniceBodu(b)
  const ma = !!s
  const jeStartCil = b.druh === 'start' || b.druh === 'cil'
  const druhy = Object.entries(DRUHY)
    .map(
      ([id, d]) =>
        `<button class="slozka-pill${(b.druh || 'vlastni') === id ? ' on' : ''}" data-act="druh" data-druh="${id}">${IC(d.ikona)}${d.popisek}</button>`
    )
    .join('')
  return `<input class="blok-nadpis" data-pole="nazev" placeholder="Název místa (třeba Nocleh u splavu)" value="${esc(b.nazev || '')}">
    <div class="vyprava-slozky" style="margin:2px 0 8px">${druhy}</div>
    ${
      b.zdroj && b.zdroj.typ === 'pozice' && !zPozice
        ? `<div class="meta blok-gps">${IC('i-x')}Uložená pozice byla smazána – doplň polohu znovu</div>`
        : ma
          ? `<div class="meta blok-gps">${IC(zPozice ? 'i-dum' : 'i-pinme')}${
              zPozice ? `${esc(zPozice.nazev)} · ` : ''
            }${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}${zGps ? ' · GPS z přepočtu' : ''}
             ${b.hotovo ? ' · odznačené' : ''}</div>`
          : `<input class="blok-nadpis" data-pole="vlozeno" placeholder="Vlož odkaz z map nebo souřadnice…">
           <div class="blok-gpsrucne">
             <input data-pole="lat" inputmode="decimal" placeholder="Šířka (50.08)">
             <input data-pole="lon" inputmode="decimal" placeholder="Délka (14.43)">
           </div>
           <div class="blok-gpsrucne">
             <input data-pole="adresa" placeholder="…nebo adresa (Riva del Garda, kemp)">
             <button class="btn small" data-act="hledat-adresu">${IC('i-hledat')}Najít</button>
           </div>`
    }
    <div class="btnrow" style="margin:8px 0 0">
      ${
        ma
          ? `<button class="btn small" data-act="zrusit-gps">Zadat znovu</button>`
          : `<button class="btn small" data-act="prevzit">${IC('i-check')}Převzít souřadnice</button>
             <button class="btn small" data-act="z-mapy">${IC('i-map')}Vybrat z mapy</button>
             ${jeStartCil ? `<button class="btn small" data-act="z-pozice">${IC('i-dum')}Uložená pozice</button>
             <button class="btn small" data-act="z-polohy">${IC('i-compass')}Aktuální poloha</button>` : ''}`
      }
    </div>
    <textarea class="blok-text" data-pole="poznamka" rows="1" placeholder="Poznámka k místu…">${esc(b.poznamka || '')}</textarea>`
}

function rozpocetTelo(b) {
  const polozky = (b.polozky || [])
    .map(
      (p, i) => `<div class="blok-polozka">
        <input data-act="polozka" data-i="${i}" placeholder="Za co…" value="${esc(p.text || '')}">
        <input class="blok-castka" data-act="castka" data-i="${i}" inputmode="decimal" placeholder="0" value="${p.castka ?? ''}">
        <button class="blok-mensi" data-act="smaz-polozku" data-i="${i}" title="Smazat položku">${IC('i-x')}</button>
      </div>`
    )
    .join('')
  const suma = (b.polozky || []).reduce((a, p) => a + (Number(p.castka) || 0), 0)
  return `<input class="blok-nadpis" data-pole="nadpis" placeholder="Název rozpočtu" value="${esc(b.nadpis || '')}">
    ${polozky}
    <div class="blok-suma">Celkem <b>${suma.toLocaleString('cs-CZ')} €</b></div>
    <button class="btn small" data-act="pridat-polozku">${IC('i-plus')}Přidat položku</button>`
}

/* ================= obsluha ================= */

/**
 * Naváže obsluhu všech bloků ve `wrap`.
 *
 * @param {HTMLElement} wrap
 * @param {() => void} prekresli
 * @param {(cb: (lat: number, lon: number) => void) => void} vyberZMapy
 *        otevře výběr bodu na mapě; dodává `plan.js`, aby bloky nemusely
 *        znát mapu
 */
export function napojBloky(wrap, prekresli, vyberZMapy) {
  for (const el of wrap.querySelectorAll('[data-blok-novy]')) {
    el.onclick = () => {
      pridejBlok(el.dataset.blokNovy, null)
      prekresli()
    }
  }

  for (const kartaBloku of wrap.querySelectorAll('.blok')) {
    const b = blok(kartaBloku.dataset.blok)
    if (!b) continue

    // Textová pole se ukládají odloženě – save() při každém písmenu by sekal.
    for (const pole of kartaBloku.querySelectorAll('[data-pole]')) {
      pole.oninput = () => {
        if (pole.dataset.pole === 'vlozeno' || pole.dataset.pole === 'adresa') return // jen schránky
        b[pole.dataset.pole] = pole.value
        saveOdlozene()
      }
    }

    kartaBloku.onclick = async (e) => {
      const akce = e.target.closest('[data-act]')
      if (!akce) return
      const act = akce.dataset.act
      const i = Number(akce.dataset.i)

      if (act === 'smaz') {
        if (!(await potvrd({ nadpis: 'Smazat tenhle blok?', ano: 'Smazat', nebezpecne: true }))) return
        smazBlok(b.id)
        return prekresli()
      }
      if (act === 'pridat-polozku') {
        b.polozky = b.polozky || []
        b.polozky.push(b.typ === 'rozpocet' ? { text: '', castka: '' } : { text: '', hotovo: 0 })
        save()
        return prekresli()
      }
      if (act === 'smaz-polozku') {
        b.polozky.splice(i, 1)
        save()
        return prekresli()
      }
      if (act === 'odskrtnout') {
        b.polozky[i].hotovo = b.polozky[i].hotovo ? 0 : Date.now()
        save()
        return prekresli()
      }
      if (act === 'prevzit') {
        // Napřed vložený text, pak ruční pole – kdo vloží odkaz, nemusí
        // vyplňovat nic dalšího.
        const vlozeno = kartaBloku.querySelector('[data-pole="vlozeno"]')
        const rucneLat = kartaBloku.querySelector('[data-pole="lat"]')
        const rucneLon = kartaBloku.querySelector('[data-pole="lon"]')
        const zTextu = rozpoznejSouradnice(vlozeno && vlozeno.value)
        const zRucne = rozpoznejSouradnice(`${rucneLat && rucneLat.value}, ${rucneLon && rucneLon.value}`)
        const gps = zTextu || zRucne
        if (!gps) {
          toast('Souřadnice se nepodařilo rozpoznat')
          return
        }
        b.lat = gps.lat
        b.lon = gps.lon
        b.zdroj = null
        save()
        return prekresli()
      }
      if (act === 'druh') {
        b.druh = akce.dataset.druh
        save()
        return prekresli()
      }
      if (act === 'hledat-adresu') {
        const pole = kartaBloku.querySelector('[data-pole="adresa"]')
        const dotaz = ((pole && pole.value) || '').trim()
        if (!dotaz) return toast('Napiš adresu, co hledat')
        let vysledky
        try {
          vysledky = await hledejAdresu(dotaz)
        } catch {
          return toast('Hledání adresy potřebuje internet')
        }
        if (!vysledky.length) return toast('Adresa se nenašla')
        const vyber = await vyberZeSeznamu({
          nadpis: 'Který z nich?',
          polozky: vysledky.map((v, j) => ({ id: String(j), popisek: v.popisek, ikona: 'i-pinme' })),
        })
        if (vyber === null) return
        const v = vysledky[Number(vyber)]
        b.lat = v.lat
        b.lon = v.lon
        b.zdroj = null
        if (!b.nazev) b.nazev = dotaz
        save()
        return prekresli()
      }
      if (act === 'z-mapy') {
        vyberZMapy((lat, lon) => {
          b.lat = lat
          b.lon = lon
          b.zdroj = null
          save()
          prekresli()
        })
        return
      }
      if (act === 'z-pozice') {
        const seznam = ulozenePozice()
        if (!seznam.length) return toast('V profilu zatím nemáš žádnou uloženou pozici')
        const vyber = await vyberZeSeznamu({
          nadpis: 'Která pozice?',
          polozky: seznam.map((p) => ({ id: p.id, popisek: p.nazev, ikona: 'i-dum' })),
        })
        if (vyber === null) return
        b.zdroj = { typ: 'pozice', id: vyber }
        b.lat = b.lon = null // souradniceBodu() čte živě ze zdroje, tahle pole se nepoužijí
        save()
        return prekresli()
      }
      if (act === 'z-polohy') {
        toast('Zjišťuju polohu…')
        let poz
        try {
          poz = await zjistiPolohuJednorazove()
        } catch (e) {
          toast(e.message || 'Polohu se nepodařilo zjistit')
          return
        }
        b.zdroj = { typ: 'gps' }
        b.lat = poz.lat
        b.lon = poz.lon
        save()
        return prekresli()
      }
      if (act === 'zrusit-gps') {
        b.lat = b.lon = null
        b.zdroj = null
        b.hotovo = 0
        save()
        return prekresli()
      }
    }

    // Vložení odkazu rozpozná souřadnice rovnou – bez klikání na Převzít.
    const vlozeno = kartaBloku.querySelector('[data-pole="vlozeno"]')
    if (vlozeno)
      vlozeno.onpaste = () => {
        setTimeout(() => {
          const gps = rozpoznejSouradnice(vlozeno.value)
          if (gps) {
            b.lat = gps.lat
            b.lon = gps.lon
            b.zdroj = null
            save()
            toast('Souřadnice převzaté')
            prekresli()
          }
        }, 50)
      }
  }
}
