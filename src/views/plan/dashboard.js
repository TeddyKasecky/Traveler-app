/**
 * Dashboard cesty – přehled JEDNÉ výpravy nad jejím itinerářem.
 *
 * PROČ VZNIKL: itinerář začínal šedým řádkem textu („14 zastávek · 8 dní ·
 * 1 240 km") a čísla výpravy ležela až úplně dole pod seznamem, kam se
 * doscrollovalo málokdy. Přitom právě ta čísla odpovídají na otázku
 * „je ten plán v pořádku?".
 *
 * KOSTRA MÍSTO ROZVRHU. Anička to popsala takhle: „vím, že chceme do Bernexu,
 * jen nevím jestli 3. nebo 5. den, a poslední dva dny budeme v Innsbrucku –
 * a s tím mezi tím mi má appka pomoct." Takže:
 *
 *   - dny existují DOPŘEDU a jsou PRÁZDNÉ (víme, že jedeme na deset dní)
 *   - kotvy drží OKNO, ne pevný den („Bernex 3.–5.")
 *   - prázdný den NENÍ chyba, je to volné místo, které čeká
 *
 * Prázdno mezi kotvami je to nejcennější, co obrazovka má – tam se nabízí
 * košík a okolí trasy. Proto se kreslí jako pozvánka, ne jako mezera.
 */

import { S, store } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { fmtKm } from '../../core/geo.js'
import { IC } from '../../icons/sprite.js'
import { ikonBtn } from '../../components/vzory.js'
import { BEZ_NAZVU } from '../../core/plan/vypravy.js'
import { kosik, kotvy } from '../../core/plan/kosik.js'
import { termin, datumDne, kratkeDatum, stihameTo } from '../../core/plan/termin.js'

/**
 * Kostra cesty: pole dnů od jedničky, každý ví, jestli má kotvu a co v něm je.
 *
 * @param {Array<Array<string>>} dny  výsledek `dnyPlanu()` – zastávky po dnech
 * @returns {Array<{cislo:number, zastavky:number, kotvy:Array<object>, volny:boolean}>}
 */
export function kostraDnu(dny) {
  const kotvyDne = new Map()
  for (const k of kotvy()) {
    const p = S.byId[k.id]
    if (!p) continue
    // Kotva patří do celého svého okna, ne jen do prvního dne – proto se
    // zapisuje ke každému dni rozsahu. Kreslí se pak jen jednou, u začátku.
    for (let d = k.odeDne; d <= k.doDne; d++) {
      if (!kotvyDne.has(d)) kotvyDne.set(d, [])
      kotvyDne.get(d).push({ ...k, p, zacinaTady: d === k.odeDne })
    }
  }

  // Kolik dnů kreslit: co je delší – rozdělení plánu, nebo nejzazší kotva.
  // Bez toho by kotva na 10. den v pětidenním plánu nebyla vidět vůbec.
  const nejzazsi = kotvy().reduce((m, k) => Math.max(m, k.doDne), 0)
  const pocet = Math.max(dny.length, nejzazsi)

  return Array.from({ length: pocet }, (_, i) => {
    const cislo = i + 1
    const zastavky = (dny[i] || []).length
    const kot = kotvyDne.get(cislo) || []
    return { cislo, zastavky, kotvy: kot, volny: zastavky === 0 && !kot.length }
  })
}

/**
 * Pruh s termínem, nebo nabídka ho vyplnit.
 *
 * Prázdný termín NENÍ chyba – proto neutrální tón a žádná varovná barva.
 * Nabídka existuje, protože z termínu se postaví kostra a naváže počasí.
 */
function terminPruh(od, dnu) {
  if (!od && !dnu) {
    return `<button class="termin-pruh prazdny" id="terminNastav">${IC('i-kalendar')}
      <span><b>Kdy a na jak dlouho?</b>
        <span class="meta">Nepovinné. Když to vyplníš, připravím dny i s daty a k nim počasí.</span></span>
    </button>`
  }
  const popis = [
    od ? `od ${kratkeDatum(od)}` : '',
    dnu ? `${dnu} ${dnu === 1 ? 'den' : dnu < 5 ? 'dny' : 'dní'}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return `<button class="termin-pruh" id="terminNastav">${IC('i-kalendar')}
    <span><b>${esc(popis)}</b></span>
    <span class="meta">upravit</span>
  </button>`
}

/**
 * Odhad „stíháme?" mezi dvěma po sobě jdoucími kotvami.
 *
 * VĚDOMĚ MĚKKÉ: věta, ne verdikt, a žádná červená. Když se to nevejde
 * pohodlně, řekne se „bude to svižnější tempo" – rozhodnutí zůstává
 * na posádce, viz `stihameTo()` v termin.js.
 */
function stihameHtml(kostra) {
  const zacatky = kostra.flatMap((d) => d.kotvy.filter((k) => k.zacinaTady))
  if (zacatky.length < 2) return ''

  const radky = []
  for (let i = 1; i < zacatky.length; i++) {
    const a = zacatky[i - 1]
    const b = zacatky[i]
    // Nejtěsnější varianta: z posledního dne okna první kotvy do prvního dne
    // okna druhé. Když vyjde i tahle jako pohoda, vyjde každá jiná taky.
    const dnu = b.odeDne - a.doDne
    const odhad = stihameTo(a.p, b.p, dnu)
    if (!odhad) continue
    radky.push(`<div class="stihame${odhad.pohoda ? '' : ' svizne'}">
      ${IC(odhad.pohoda ? 'i-clock' : 'i-route')}
      <span><b>${esc(a.p.n)} → ${esc(b.p.n)}</b><span class="meta">${esc(odhad.veta)}</span></span>
    </div>`)
  }
  return radky.join('')
}

/**
 * Kotvy podle čísla dne, pro hlavičky dnů v itineráři.
 *
 * Kostra jako samostatný blok zanikla (srpen 2026) – byly to dva seznamy
 * dnů pod sebou, jeden s daty a kotvami, druhý se zastávkami, a člověk musel
 * obě půlky spojovat hlavou. `kostraDnu()` zůstala jako datová funkce a její
 * výstup se vlévá rovnou do hlaviček jednoho seznamu.
 *
 * @param {Array<Array<string>>} dny
 * @returns {Map<number, Array<object>>}
 */
export function kotvyPodleDnu(dny) {
  const mapa = new Map()
  for (const d of kostraDnu(dny)) if (d.kotvy.length) mapa.set(d.cislo, d.kotvy)
  return mapa
}

/**
 * Dashboard nad itinerářem: název, termín, mapa, tři čísla.
 *
 * @param {Array<Record<string, any>>} items  zastávky aktivní výpravy
 * @param {Array<Array<string>>} dny
 * @param {{road:number}} statistika  výsledek `planStats(items)`
 * @returns {string}
 */
export function dashboardHtml(items, dny, statistika) {
  const kostra = kostraDnu(dny)
  const volnych = kostra.filter((d) => d.volny).length
  const vKosiku = kosik().length
  const slozka = store.vypravaSlozka || ''
  const { od, dnu } = termin()

  // Popisek pod názvem: termín má přednost, protože odpovídá na „kdy".
  // Bez termínu se ukáže to, co víme – dny a kilometry.
  const casti = []
  if (od) {
    const konec = datumDne(dnu || kostra.length || 1)
    casti.push(dnu > 1 ? `${kratkeDatum(od)} – ${kratkeDatum(konec)}` : kratkeDatum(od))
  }
  if (kostra.length) casti.push(`${kostra.length} ${kostra.length === 1 ? 'den' : kostra.length < 5 ? 'dny' : 'dní'}`)
  if (items.length > 1) casti.push(fmtKm(statistika.road))
  if (slozka) casti.push(esc(slozka))

  return `<div class="planhlava">
    <div class="planhlava-text">
      <h2>${esc(store.vypravaNazev || BEZ_NAZVU)}</h2>
      <div class="meta">${casti.length ? casti.join(' · ') : 'Zatím prázdná'}</div>
    </div>
    ${ikonBtn('i-vice', { id: 'planVice', titul: 'Další akce' })}
  </div>
  <div id="planMenu" hidden></div>

  <div class="dash-mapa" id="dashMapa"></div>
  ${terminPruh(od, dnu)}
  ${stihameHtml(kostra)}

  <div class="dash-cisla">
    <button class="dash-dlazdice" data-dash="zastavky">
      <b>${items.length}</b><span>${items.length === 1 ? 'zastávka' : 'zastávek'}</span></button>
    <button class="dash-dlazdice${volnych ? ' zvyraznena' : ''}" data-dash="volno">
      <b>${volnych}</b><span>${volnych === 1 ? 'volný den' : 'volných dnů'}</span></button>
    <button class="dash-dlazdice" data-dash="kosik">
      <b>${vKosiku}</b><span>v košíku</span></button>
  </div>`
  // Kostra dnů tu bývala jako samostatný blok pod čísly. Zanikla (srpen
  // 2026): dva seznamy dnů pod sebou – jeden s daty a kotvami, druhý se
  // zastávkami – nutily člověka spojovat obě půlky hlavou. Data z ní
  // (`kostraDnu`, `kotvyPodleDnu`) dnes plní hlavičky jednoho seznamu
  // v `plan.js#itinerar()`.
}
