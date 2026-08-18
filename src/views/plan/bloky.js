/**
 * Vlastní bloky v plánu – stavebnice: poznámka, zaškrtávací seznam, vlastní
 * místo na mapě, odkaz a rozpočet.
 *
 * Bloky bydlí ve `store.bloky` klíčované názvem výpravy (výpravy vlastní id
 * nemají a název je jejich klíč i jinde). Každý blok má `id`, `typ` a `den`
 * (číslo dne od jedničky, null = k celému plánu). V itineráři se kreslí na
 * konci svého dne.
 *
 * VLASTNÍ MÍSTO je bod, který není v databázi míst – tři cesty zadání:
 * vložení textu z externího zdroje (odkaz z Google Maps / Mapy.cz, souřadnice
 * v desetinném tvaru i ve stupních), ruční GPS a výběr ťuknutím do mapy
 * aplikace. Ukazuje se na mapě vlastním špendlíkem, počítá se do trasy
 * (`map/planLine.js`) a v Aktuální cestě jde odznačit jako zastávka.
 *
 * Zaškrtnutí (`hotovo` u položek seznamu a u vlastních míst) žije na bloku
 * samém – odškrtává se v Aktuální cestě a dá se vynulovat v editoru.
 */

import { store, save, saveOdlozene } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { IC } from '../../icons/sprite.js'
import { BEZ_NAZVU } from './vypravy.js'
import { toast } from '../../components/toast.js'

/** Klíč aktivní výpravy v `store.bloky`. */
const klic = () => store.vypravaNazev || BEZ_NAZVU

/** Bloky aktivní výpravy, vždycky pole. */
export function bloky() {
  if (!store.bloky || typeof store.bloky !== 'object') store.bloky = {}
  return store.bloky[klic()] || []
}

/** Zapíše bloky aktivní výpravy. */
function zapis(nove) {
  store.bloky[klic()] = nove
  return save()
}

/** Nové id bloku. Čas + náhoda stačí – bloků jsou jednotky, ne tisíce. */
const noveId = () => `b${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`

/** Přidá blok daného typu. Vrací jeho id. */
export function pridejBlok(typ, den = null) {
  const zaklad = { id: noveId(), typ, den }
  const podleTypu = {
    poznamka: { nadpis: '', text: '' },
    seznam: { nadpis: 'Seznam', polozky: [] },
    misto: { nazev: '', lat: null, lon: null, poznamka: '', hotovo: 0 },
    odkaz: { popisek: '', url: '' },
    rozpocet: { nadpis: 'Rozpočet', polozky: [] },
  }
  zapis([...bloky(), { ...zaklad, ...podleTypu[typ] }])
  return zaklad.id
}

/** Smaže blok. */
export function smazBlok(id) {
  zapis(bloky().filter((b) => b.id !== id))
}

/** Najde blok podle id. */
export const blok = (id) => bloky().find((b) => b.id === id)

/* ================= rozpoznání souřadnic ================= */

/**
 * Vytáhne souřadnice z vloženého textu.
 *
 * Rozumí odkazům z Google Maps (`@50.08,14.42` i `q=50.08,14.42`), Mapy.cz
 * (`x=14.42&y=50.08` – pozor, x je délka), dvojici desetinných čísel
 * a stupňům-minutám-vteřinám (`50°5'12.3"N 14°25'8"E`).
 *
 * @param {string} text
 * @returns {{lat: number, lon: number}|null}
 */
export function rozpoznejSouradnice(text) {
  const t = (text || '').trim()
  if (!t) return null

  const platne = (lat, lon) =>
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null

  // Google Maps: …/@50.0755,14.4378,12z nebo ?q=50.0755,14.4378
  const google = /[@?&](?:q=)?(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(t)
  if (google) return platne(Number(google[1]), Number(google[2]))

  // Mapy.cz: ?x=14.4378&y=50.0755 – x je DÉLKA, y šířka.
  const mapyX = /[?&]x=(-?\d{1,3}\.\d+)/.exec(t)
  const mapyY = /[?&]y=(-?\d{1,2}\.\d+)/.exec(t)
  if (mapyX && mapyY) return platne(Number(mapyY[1]), Number(mapyX[1]))

  // Stupně-minuty-vteřiny: 50°5'12.3"N 14°25'8"E (vteřiny nepovinné).
  const dms = /(\d{1,2})°(\d{1,2})'(?:([\d.]+)")?\s*([NS])[,\s]+(\d{1,3})°(\d{1,2})'(?:([\d.]+)")?\s*([EW])/i.exec(t)
  if (dms) {
    const lat = (Number(dms[1]) + Number(dms[2]) / 60 + Number(dms[3] || 0) / 3600) * (/s/i.test(dms[4]) ? -1 : 1)
    const lon = (Number(dms[5]) + Number(dms[6]) / 60 + Number(dms[7] || 0) / 3600) * (/w/i.test(dms[8]) ? -1 : 1)
    return platne(lat, lon)
  }

  // Prostá dvojice: 50.0755, 14.4378 (oddělená čárkou, středníkem nebo mezerou).
  const par = /^(-?\d{1,2}[.,]\d+)[\s;,]+(-?\d{1,3}[.,]\d+)$/.exec(t)
  if (par) return platne(Number(par[1].replace(',', '.')), Number(par[2].replace(',', '.')))

  return null
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

/** Součet rozpočtu celého plánu – ukazuje se pod itinerářem. */
export function rozpocetCelkem() {
  let suma = 0
  for (const b of bloky())
    if (b.typ === 'rozpocet') for (const p of b.polozky || []) suma += Number(p.castka) || 0
  return suma
}

/**
 * HTML bloků jednoho dne (`den` = číslo od 1, null = bloky celého plánu).
 * @returns {string}
 */
export function blokyDneHtml(den) {
  return bloky()
    .filter((b) => (den === null ? b.den == null : b.den === den))
    .map(blokHtml)
    .join('')
}

/** Nabídka „přidat blok“. */
export function pridatBlokHtml() {
  return `<div class="blok-pridat">
    ${Object.entries(TYPY)
      .map(([typ, t]) => `<button class="btn small" data-blok-novy="${typ}">${IC(t.ikona)}${t.popisek}</button>`)
      .join('')}
  </div>`
}

function blokHtml(b) {
  const t = TYPY[b.typ] || TYPY.poznamka
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
  const ma = Number.isFinite(b.lat) && Number.isFinite(b.lon)
  return `<input class="blok-nadpis" data-pole="nazev" placeholder="Název místa (třeba Nocleh u splavu)" value="${esc(b.nazev || '')}">
    ${
      ma
        ? `<div class="meta blok-gps">${IC('i-pinme')}${b.lat.toFixed(5)}, ${b.lon.toFixed(5)}
             ${b.hotovo ? ' · odznačené' : ''}</div>`
        : `<input class="blok-nadpis" data-pole="vlozeno" placeholder="Vlož odkaz z map nebo souřadnice…">
           <div class="blok-gpsrucne">
             <input data-pole="lat" inputmode="decimal" placeholder="Šířka (50.08)">
             <input data-pole="lon" inputmode="decimal" placeholder="Délka (14.43)">
           </div>`
    }
    <div class="btnrow" style="margin:8px 0 0">
      ${ma ? '' : `<button class="btn small" data-act="prevzit">${IC('i-check')}Převzít souřadnice</button>
                   <button class="btn small" data-act="z-mapy">${IC('i-map')}Vybrat z mapy</button>`}
      ${ma ? `<button class="btn small" data-act="zrusit-gps">Zadat znovu</button>` : ''}
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
        if (pole.dataset.pole === 'vlozeno') return // jen schránka na rozpoznání
        b[pole.dataset.pole] = pole.value
        saveOdlozene()
      }
    }

    kartaBloku.onclick = (e) => {
      const akce = e.target.closest('[data-act]')
      if (!akce) return
      const act = akce.dataset.act
      const i = Number(akce.dataset.i)

      if (act === 'smaz') {
        if (!confirm('Smazat tenhle blok?')) return
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
        save()
        return prekresli()
      }
      if (act === 'z-mapy') {
        vyberZMapy((lat, lon) => {
          b.lat = lat
          b.lon = lon
          save()
          prekresli()
        })
        return
      }
      if (act === 'zrusit-gps') {
        b.lat = b.lon = null
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
            save()
            toast('Souřadnice převzaté')
            prekresli()
          }
        }, 50)
      }
  }
}
