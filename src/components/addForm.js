/**
 * Formulář „Přidat místo“.
 *
 * Jediná funkce, kterou původní aplikace neměla. Nezapisuje nikam do dat –
 * vyrobí kus JSONu, který se vloží do `src/data/places-nova.json`. Tím je
 * vyloučené, že by formulář rozbil 580 ověřených míst.
 *
 * Kontroluje se **stejným kódem** jako `npm run validate` (data/validate.js),
 * takže se pravidla nemůžou rozejít. Nálezy nesou název pole, takže se chyba
 * ukáže u konkrétního políčka.
 *
 * Rozepsaný koncept se drží pod novým klíčem `vandrbuch:draft`. Tři původní
 * klíče zůstávají nedotčené.
 */

import L from 'leaflet'
import { S } from '../core/store.js'
import { esc } from '../core/html.js'
import { spocitejOkoli, dkm } from '../core/geo.js'
import { registrujOverlay } from '../core/router.js'
import { DRAFTK, nacti, uloz } from '../core/storage.js'
import { stahniJson } from '../core/csv.js'
import { KAT } from '../data/categories.js'
import { COLL } from '../data/collections.js'
import { zkontrolujMisto } from '../data/validate.js'
import { sestavMisto, naText } from '../data/newPlace.js'
import { IC } from '../icons/sprite.js'
import { toast } from './toast.js'
import { potvrd } from './dialog.js'

/**
 * Popis formuláře. Pořadí odpovídá `data/schema.md`.
 *
 * `zdroj` = ze kterého pole se vezmou nápovědy z existujících dat.
 * `jen` = ukázat jen u téhle kategorie.
 *
 * @type {Array<{k?:string, l?:string, typ:string, zdroj?:string, jen?:string, napoveda?:string, nadpis?:string}>}
 */
const POLE = [
  { typ: 'nadpis', nadpis: 'Co to je' },
  { k: 'n', l: 'Název', typ: 'text', napoveda: 'Jak se místo jmenuje' },
  { k: 'sh', l: 'Krátce', typ: 'text', napoveda: 'Dvě řádky do seznamu a do plánu' },
  { k: 'k', l: 'Kategorie', typ: 'kategorie' },
  { k: 't', l: 'Typ', typ: 'text', zdroj: 't', napoveda: 'Ukazuje se pod názvem' },

  { typ: 'nadpis', nadpis: 'Kde to je' },
  { k: 'z', l: 'Země', typ: 'text', zdroj: 'z' },
  { k: 'r', l: 'Oblast', typ: 'text', zdroj: 'r' },
  { typ: 'souradnice' },

  { typ: 'nadpis', nadpis: 'Návštěva' },
  { k: 'c', l: 'Cena a vstup', typ: 'text', zdroj: 'c', napoveda: 'Text začínající „Zdarma“ propadne filtrem Zdarma' },
  { k: 'd', l: 'Doba návštěvy', typ: 'text', zdroj: 'd', napoveda: 'Třeba 1-2 h' },
  { k: 's', l: 'Sezóna', typ: 'text', zdroj: 's', napoveda: 'Třeba květen-říjen' },
  { k: 'ch', l: 'S dětmi', typ: 'anone' },
  { k: 'ps', l: 'Se psem', typ: 'anone' },
  { k: 'g', l: 'Co vzít s sebou', typ: 'stitky', zdroj: 'g' },

  { typ: 'nadpis', nadpis: 'Texty' },
  { k: 'p', l: 'Praktické info', typ: 'area', napoveda: 'Odstavec v detailu' },
  { k: 'f', l: 'Zajímavost', typ: 'area', napoveda: 'V detailu jako „Z deníku“' },

  { typ: 'nadpis', nadpis: 'Zařazení a odkazy' },
  { k: 'col', l: 'Kolekce', typ: 'kolekce' },
  { k: 'w', l: 'Web', typ: 'text', napoveda: 'Víc adres oddělte mezerou, svislítkem a mezerou' },
  { k: 'ig', l: 'Instagram', typ: 'text' },
  { k: 'img', l: 'Fotka z Wikimedia Commons', typ: 'text', napoveda: 'Diakritika musí být zakódovaná, třeba ö jako %C3%B6' },

  { typ: 'nadpis', nadpis: 'Cena jízdenky', jen: 'Bikeparky' },
  { k: 'price', l: 'Cena za den', typ: 'text', jen: 'Bikeparky' },
  { k: 'pv', l: 'Ověřeno na oficiálním webu', typ: 'anone', jen: 'Bikeparky' },
  { k: 'pn', l: 'Poznámka k ceně', typ: 'text', jen: 'Bikeparky' },

  { typ: 'nadpis', nadpis: 'Odkazy k ferratě', jen: 'Ferraty' },
  { k: 'av', l: 'Alpský vůdce', typ: 'text', jen: 'Ferraty' },
  { k: 'bs', l: 'Topo bergsteigen', typ: 'text', jen: 'Ferraty' },
  { k: 'pdf', l: 'Topo PDF', typ: 'text', jen: 'Ferraty' },
]

/** Pole parkoviště. Vyplňuje se jen když je zaškrtnuté, jinak zůstane `null`. */
const PARKING_POLE = [
  { k: 'name', l: 'Název parkoviště', typ: 'text' },
  { k: 'lat', l: 'Šířka', typ: 'cislo' },
  { k: 'lon', l: 'Délka', typ: 'cislo' },
  { k: 'type', l: 'Druh', typ: 'text' },
  { k: 'heightLimit', l: 'Výškové omezení v metrech', typ: 'cislo' },
  { k: 'transitStatus', l: 'Stav', typ: 'stav' },
  { k: 'walk', l: 'Chůze k místu', typ: 'text' },
  { k: 'price', l: 'Cena', typ: 'text' },
  { k: 'note', l: 'Poznámka', typ: 'text' },
  { k: 'source', l: 'Zdroj informace', typ: 'text' },
]

/** Rozepsané hodnoty. Ukládají se při každé změně. */
let data = {}
/** @type {L.Map|null} */
let mapka = null
/** @type {L.Marker|null} */
let znacka = null

const el = () => document.getElementById('addPlace')
const telo = () => document.getElementById('addBody')

export const jeOtevreny = () => el().classList.contains('show')

/* ================= otevírání ================= */

export function otevriFormular() {
  data = nacti(DRAFTK, {})
  el().classList.add('show')
  vykresli()
  // Leaflet potřebuje prvek, který už má velikost.
  setTimeout(postavMapku, 420)
}

export function zavriFormular() {
  el().classList.remove('show')
  zrusMapku()
}

function zrusMapku() {
  if (!mapka) return
  try {
    mapka.remove()
  } catch {
    /* prvek už je pryč */
  }
  mapka = null
  znacka = null
}

const uloziKoncept = () => uloz(DRAFTK, data)

/* ================= nápovědy z existujících dat ================= */

/**
 * Hodnoty, které se v datech opravdu vyskytují – nabídnou se jako nápověda.
 * Volný zápis zůstává možný, proto `datalist` a ne `select`.
 *
 * @param {string} pole
 * @returns {string[]}
 */
function navrhy(pole) {
  const v = new Set()
  for (const p of S.places) {
    if (pole === 'g') for (const x of p.g || []) v.add(x)
    else if (p[pole]) v.add(String(p[pole]))
  }
  return [...v].sort((a, b) => a.localeCompare(b, 'cs'))
}

/* ================= vykreslení ================= */

function vykresli() {
  const kat = data.k || ''
  const chyby = kontrola()

  const chybaU = (k) => {
    const n = chyby.find((x) => x.pole === k)
    return n ? `<div class="afchyba">${esc(n.zprava)}</div>` : ''
  }

  const casti = []
  for (const f of POLE) {
    if (f.jen && f.jen !== kat) continue
    casti.push(vykresliPole(f, chybaU))
  }

  // Mapku je potřeba přenést přes překreslení živou. Kdyby ji `innerHTML`
  // zahodilo a postavila se znovu, blikala by při každém opuštění políčka
  // a hlavně by se ztratilo kliknutí do ní: rozepsané políčko nad mapou
  // nejdřív ztratí zaměření, to spustí překreslení a mapa by zmizela dřív,
  // než by stihla zpracovat klik. Odpojený prvek si Leaflet drží v pořádku.
  const ziva = mapka ? document.getElementById('afMapWrap') : null
  if (ziva) ziva.remove()

  telo().innerHTML = `
    <div class="afhead">
      <h2>${IC('i-plus', 'color:var(--rust)')}Přidat místo</h2>
      <div class="afsub">Formulář nic nepřepisuje. Vyrobí kus textu, který vložíte do
        <code>places-nova.json</code>. Postup je v README.</div>
    </div>
    ${casti.join('')}
    ${vykresliParking(chybaU)}
    ${vykresliShrnuti(chyby)}
    <div class="btnrow">
      <button class="btn primary" id="afCopy">${IC('i-copy')}Zkopírovat JSON</button>
      <button class="btn small" id="afDown">${IC('i-save')}Stáhnout</button>
      <button class="btn small" id="afClear">${IC('i-trash')}Vyprázdnit</button>
    </div>
    <div class="afout"><textarea id="afText" readonly rows="6">${esc(naText(hotoveMisto()))}</textarea></div>
  `

  const misto = document.getElementById('afMapWrap')
  if (ziva && misto) {
    misto.replaceWith(ziva)
    setTimeout(() => mapka && mapka.invalidateSize(), 60)
  }

  napoj()
}

/**
 * @param {Record<string, any>} f
 * @param {(k:string) => string} chybaU
 */
function vykresliPole(f, chybaU) {
  if (f.typ === 'nadpis') return `<div class="sec">${esc(f.nadpis)}</div>`
  if (f.typ === 'souradnice') return vykresliSouradnice(chybaU)

  const v = data[f.k] ?? ''
  const napoveda = f.napoveda ? `<div class="afnote">${esc(f.napoveda)}</div>` : ''
  const hlava = `<label>${esc(f.l)}</label>`

  if (f.typ === 'kategorie') {
    const dlazdice = Object.entries(KAT)
      .map(
        ([jmeno, k]) =>
          `<button type="button" class="wopt ${data.k === jmeno ? 'on' : ''}" data-kat="${esc(jmeno)}">
             ${IC(k.i, `color:${k.c}`)}${esc(jmeno)}</button>`
      )
      .join('')
    return `<div class="fgroup">${hlava}<div class="wopts">${dlazdice}</div>${chybaU('k')}</div>`
  }

  if (f.typ === 'kolekce') {
    const dlazdice = COLL.map(
      (c) =>
        `<button type="button" class="wopt ${(data.col || []).includes(c.k) ? 'on' : ''}" data-coll="${esc(c.k)}">
           ${IC(c.i)}${esc(c.l)}</button>`
    ).join('')
    return `<div class="fgroup">${hlava}<div class="wopts">${dlazdice}</div>${chybaU('col')}</div>`
  }

  if (f.typ === 'anone') {
    const je = v === 'Ano' || v === true
    return `<div class="fgroup">${hlava}
      <div class="togglerow">
        <button type="button" class="toggle ${je ? 'on' : ''}" data-ano="${f.k}">Ano</button>
        <button type="button" class="toggle ${je ? '' : 'on'}" data-ne="${f.k}">Ne</button>
      </div>${chybaU(f.k)}</div>`
  }

  if (f.typ === 'stitky') {
    const stitky = (data[f.k] || [])
      .map((x, i) => `<button type="button" class="gear" data-smaz="${f.k}:${i}">${esc(x)} ${IC('i-x', 'font-size:11px')}</button>`)
      .join('')
    return `<div class="fgroup">${hlava}
      <div class="gearrow">${stitky}</div>
      <input class="wsel" data-pridej="${f.k}" list="af-${f.k}" placeholder="Napiš a potvrď Enterem">
      ${seznamNavrhu(f)}${chybaU(f.k)}${napoveda}</div>`
  }

  if (f.typ === 'area') {
    return `<div class="fgroup">${hlava}
      <textarea class="afarea" data-pole="${f.k}" rows="3">${esc(String(v))}</textarea>
      ${chybaU(f.k)}${napoveda}</div>`
  }

  return `<div class="fgroup">${hlava}
    <input class="wsel" data-pole="${f.k}" value="${esc(String(v))}" ${f.zdroj ? `list="af-${f.k}"` : ''}>
    ${f.zdroj ? seznamNavrhu(f) : ''}${chybaU(f.k)}${napoveda}</div>`
}

const seznamNavrhu = (f) =>
  `<datalist id="af-${f.k}">${navrhy(f.zdroj || f.k)
    .map((x) => `<option value="${esc(x)}">`)
    .join('')}</datalist>`

function vykresliSouradnice(chybaU) {
  const nej = nejblizsi()
  return `<div class="fgroup">
    <label>Souřadnice</label>
    <div class="afgps">
      <input class="wsel" data-pole="lat" inputmode="decimal" placeholder="šířka" value="${esc(String(data.lat ?? ''))}">
      <input class="wsel" data-pole="lon" inputmode="decimal" placeholder="délka" value="${esc(String(data.lon ?? ''))}">
    </div>
    <div class="btnrow" style="margin:9px 0 0">
      <button class="btn small" id="afHere">${IC('i-pinme')}Moje poloha</button>
    </div>
    <div class="afmapwrap" id="afMapWrap"><div class="afmap" id="afMap"></div></div>
    <div class="afnote">Ťukni do mapy nebo přetáhni špendlík.
      ${nej ? `Nejbližší známé místo: <b>${esc(nej.n)}</b>, ${nej.d.toFixed(1).replace('.', ',')} km.` : ''}</div>
    ${chybaU('lat')}${chybaU('lon')}
  </div>`
}

/** Nejbližší existující místo – pomůcka proti překlepu v souřadnicích. */
function nejblizsi() {
  const lat = Number(data.lat)
  const lon = Number(data.lon)
  if (!lat || !lon || !S.places.length) return null
  let nej = null
  for (const p of S.places) {
    const d = dkm({ lat, lon }, p)
    if (!nej || d < nej.d) nej = { n: p.n, d }
  }
  return nej
}

function vykresliParking(chybaU) {
  const zapnuto = !!data.parking
  const pole = zapnuto
    ? PARKING_POLE.map((f) => {
        const v = data.parking?.[f.k] ?? ''
        if (f.typ === 'stav') {
          return `<div class="fgroup"><label>${esc(f.l)}</label>
            <select class="wsel" data-park="${f.k}">
              ${['verified', 'likely', 'unknown', 'no']
                .map((s) => `<option ${v === s ? 'selected' : ''}>${s}</option>`)
                .join('')}
            </select></div>`
        }
        return `<div class="fgroup"><label>${esc(f.l)}</label>
          <input class="wsel" data-park="${f.k}" ${f.typ === 'cislo' ? 'inputmode="decimal"' : ''} value="${esc(String(v ?? ''))}"></div>`
      }).join('')
    : ''

  return `<div class="sec">Parkoviště</div>
    <div class="togglerow" style="margin-bottom:12px">
      <button type="button" class="toggle ${zapnuto ? 'on' : ''}" id="afParkOn">Ověřené parkoviště</button>
      <button type="button" class="toggle ${zapnuto ? '' : 'on'}" id="afParkOff">Žádné</button>
    </div>${pole}${chybaU('parking')}`
}

function vykresliShrnuti(chyby) {
  const vazne = chyby.filter((x) => x.uroven === 'chyba')
  const varovani = chyby.filter((x) => x.uroven === 'varování')
  if (!vazne.length && !varovani.length) {
    return `<div class="afok">${IC('i-check')}Místo je v pořádku, můžeš ho zkopírovat.</div>`
  }
  return `<div class="afsouhrn ${vazne.length ? 'spatne' : ''}">
    ${vazne.length ? `<b>${vazne.length}× je potřeba doplnit</b>` : `<b>${varovani.length}× drobnost</b>`}
    <ul>${[...vazne, ...varovani].slice(0, 8).map((x) => `<li>${esc(x.zprava)}</li>`).join('')}</ul>
  </div>`
}

/* ================= stav ================= */

/** Hotové místo podle toho, co je vyplněné. */
function hotoveMisto() {
  return sestavMisto(data, { vsechna: S.places, okoli: spocitejOkoli })
}

/** Nálezy ze **stejné** kontroly, jakou pouští `npm run validate`. */
function kontrola() {
  const m = hotoveMisto()
  return zkontrolujMisto(m, { znamaId: new Set([...S.places.map((p) => p.id), m.id]) })
}

/* ================= napojení ================= */

function napoj() {
  const t = telo()

  for (const i of t.querySelectorAll('[data-pole]')) {
    i.oninput = () => {
      data[i.dataset.pole] = i.value
      uloziKoncept()
      if (i.dataset.pole === 'lat' || i.dataset.pole === 'lon') posunZnacku()
    }
    // Překreslit až po opuštění políčka – jinak by se pod rukama měnil text.
    i.onblur = () => vykresli()
  }

  for (const i of t.querySelectorAll('[data-park]')) {
    i.oninput = () => {
      data.parking = data.parking || {}
      const cisla = ['lat', 'lon', 'heightLimit']
      const v = i.value.trim()
      data.parking[i.dataset.park] = cisla.includes(i.dataset.park) ? (v === '' ? null : Number(v)) : v
      uloziKoncept()
    }
    i.onblur = () => vykresli()
  }

  for (const b of t.querySelectorAll('[data-kat]')) {
    b.onclick = () => {
      data.k = data.k === b.dataset.kat ? '' : b.dataset.kat
      uloziKoncept()
      vykresli()
    }
  }

  for (const b of t.querySelectorAll('[data-coll]')) {
    b.onclick = () => {
      const c = b.dataset.coll
      const s = new Set(data.col || [])
      s.has(c) ? s.delete(c) : s.add(c)
      data.col = [...s]
      uloziKoncept()
      vykresli()
    }
  }

  for (const b of t.querySelectorAll('[data-ano]')) {
    b.onclick = () => {
      data[b.dataset.ano] = b.dataset.ano === 'pv' ? true : 'Ano'
      uloziKoncept()
      vykresli()
    }
  }
  for (const b of t.querySelectorAll('[data-ne]')) {
    b.onclick = () => {
      data[b.dataset.ne] = b.dataset.ne === 'pv' ? false : ''
      uloziKoncept()
      vykresli()
    }
  }

  for (const i of t.querySelectorAll('[data-pridej]')) {
    i.onkeydown = (e) => {
      if (e.key !== 'Enter' || !i.value.trim()) return
      e.preventDefault()
      const k = i.dataset.pridej
      data[k] = [...(data[k] || []), i.value.trim()]
      uloziKoncept()
      vykresli()
    }
  }
  for (const b of t.querySelectorAll('[data-smaz]')) {
    b.onclick = () => {
      const [k, i] = b.dataset.smaz.split(':')
      data[k] = (data[k] || []).filter((_, j) => j !== Number(i))
      uloziKoncept()
      vykresli()
    }
  }

  const parkOn = document.getElementById('afParkOn')
  if (parkOn)
    parkOn.onclick = () => {
      data.parking = data.parking || {
        name: '', lat: null, lon: null, type: '', heightLimit: null,
        transitStatus: 'unknown', walk: '', price: '', note: '', source: '',
      }
      uloziKoncept()
      vykresli()
    }
  const parkOff = document.getElementById('afParkOff')
  if (parkOff)
    parkOff.onclick = () => {
      data.parking = null
      uloziKoncept()
      vykresli()
    }

  const here = document.getElementById('afHere')
  if (here)
    here.onclick = () => {
      if (!navigator.geolocation) return toast('Tenhle prohlížeč polohu neumí')
      toast('Hledám polohu…')
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          data.lat = +pos.coords.latitude.toFixed(5)
          data.lon = +pos.coords.longitude.toFixed(5)
          uloziKoncept()
          vykresli()
          setTimeout(postavMapku, 200)
          toast('Poloha doplněna ✓')
        },
        () => toast('Polohu se nepodařilo zjistit')
      )
    }

  document.getElementById('afCopy').onclick = async () => {
    const text = naText(hotoveMisto())
    try {
      await navigator.clipboard.writeText(text)
      toast('Zkopírováno – vlož do places-nova.json')
    } catch {
      // Ze souboru na disku schránka nefunguje, není to zabezpečený kontext.
      const ta = document.getElementById('afText')
      ta.focus()
      ta.select()
      toast('Schránka tu nejde – text je označený, zkopíruj ho ručně')
    }
  }

  document.getElementById('afDown').onclick = () => {
    const m = hotoveMisto()
    stahniJson(m, `misto-${m.id}.json`)
    toast('Staženo')
  }

  document.getElementById('afClear').onclick = async () => {
    if (!(await potvrd({ nadpis: 'Vyprázdnit formulář?', ano: 'Vyprázdnit', nebezpecne: true }))) return
    data = {}
    uloziKoncept()
    zrusMapku()
    vykresli()
    setTimeout(postavMapku, 200)
  }
}

/* ================= mapa ================= */

function postavMapku() {
  const prvek = document.getElementById('afMap')
  if (!prvek || prvek._leaflet_id) return

  const lat = Number(data.lat) || 47.2
  const lon = Number(data.lon) || 11.4
  const maSouradnice = !!(Number(data.lat) && Number(data.lon))

  try {
    mapka = L.map(prvek, { zoomControl: true, attributionControl: false, scrollWheelZoom: false })
      .setView([lat, lon], maSouradnice ? 12 : 6)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(mapka)

    if (maSouradnice) pridejZnacku(lat, lon)

    mapka.on('click', (e) => {
      // Leaflet má `lng`, data mají `lon` – snadná záměna.
      data.lat = +e.latlng.lat.toFixed(5)
      data.lon = +e.latlng.lng.toFixed(5)
      uloziKoncept()
      pridejZnacku(data.lat, data.lon)
      obnovPolickaSouradnic()
    })

    setTimeout(() => mapka && mapka.invalidateSize(), 300)
  } catch {
    prvek.outerHTML = '<div class="mmfail">Mapa se nenačetla – souřadnice jde napsat ručně.</div>'
    mapka = null
  }
}

function pridejZnacku(lat, lon) {
  if (!mapka) return
  if (znacka) znacka.setLatLng([lat, lon])
  else {
    znacka = L.marker([lat, lon], { draggable: true }).addTo(mapka)
    znacka.on('dragend', () => {
      const p = znacka.getLatLng()
      data.lat = +p.lat.toFixed(5)
      data.lon = +p.lng.toFixed(5)
      uloziKoncept()
      obnovPolickaSouradnic()
    })
  }
}

function posunZnacku() {
  const lat = Number(data.lat)
  const lon = Number(data.lon)
  if (mapka && lat && lon) {
    pridejZnacku(lat, lon)
    mapka.panTo([lat, lon])
  }
}

/**
 * Doplní čísla do políček bez překreslení celého formuláře.
 * Překreslení by shodilo mapu a přišlo by o rozepsaný text.
 */
function obnovPolickaSouradnic() {
  const t = telo()
  const la = t.querySelector('[data-pole="lat"]')
  const lo = t.querySelector('[data-pole="lon"]')
  if (la) la.value = data.lat
  if (lo) lo.value = data.lon
  const out = document.getElementById('afText')
  if (out) out.value = naText(hotoveMisto())
}

/* ================= start ================= */

export function initAddForm() {
  registrujOverlay({ jeOtevreny, zavri: zavriFormular })
  document.getElementById('addClose').onclick = zavriFormular
}
