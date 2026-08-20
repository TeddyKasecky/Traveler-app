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
import { BEZ_NAZVU } from './vypravy.js'
import { kosik, kotvy } from './kosik.js'

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

/** Jeden řádek kostry. */
function radekDne({ cislo, zastavky, kotvy: kot, volny }) {
  const zacinajici = kot.filter((k) => k.zacinaTady)
  const pokracujici = kot.length && !zacinajici.length

  const obsah = zacinajici.length
    ? zacinajici
        .map(
          (k) => `<span class="kostra-kotva">${IC('i-flag')}<b>${esc(k.p.n)}</b>
            <span class="meta">${k.odeDne === k.doDne ? `${k.odeDne}. den` : `${k.odeDne}.–${k.doDne}. den`}</span></span>`
        )
        .join('')
    : pokracujici
      ? `<span class="kostra-okno">${IC('i-vice')}<span class="meta">pořád ve hře</span></span>`
      : zastavky
        ? `<span class="kostra-pocet">${zastavky} ${zastavky === 1 ? 'zastávka' : zastavky < 5 ? 'zastávky' : 'zastávek'}</span>`
        : `<span class="kostra-volno">volno — ${IC('i-plus')}naplánovat</span>`

  return `<button class="kostra-den${volny ? ' volny' : ''}${zacinajici.length ? ' kotva' : ''}"
    data-kostra-den="${cislo}">
    <span class="kostra-cislo">${cislo}</span>
    <span class="kostra-telo">${obsah}</span>
  </button>`
}

/**
 * Dashboard nad itinerářem: název, čísla, kostra dnů.
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

  return `<div class="planhlava">
    <div class="planhlava-text">
      <h2>${esc(store.vypravaNazev || BEZ_NAZVU)}</h2>
      <div class="meta">${
        items.length
          ? `${kostra.length} ${kostra.length === 1 ? 'den' : kostra.length < 5 ? 'dny' : 'dní'}${
              items.length > 1 ? ` · ${fmtKm(statistika.road)}` : ''
            }${slozka ? ` · ${esc(slozka)}` : ''}`
          : 'Zatím prázdná'
      }</div>
    </div>
    ${ikonBtn('i-vice', { id: 'planVice', titul: 'Další akce' })}
  </div>
  <div id="planMenu" hidden></div>

  <div class="dash-cisla">
    <button class="dash-dlazdice" data-dash="zastavky">
      <b>${items.length}</b><span>${items.length === 1 ? 'zastávka' : 'zastávek'}</span></button>
    <button class="dash-dlazdice${volnych ? ' zvyraznena' : ''}" data-dash="volno">
      <b>${volnych}</b><span>${volnych === 1 ? 'volný den' : 'volných dnů'}</span></button>
    <button class="dash-dlazdice" data-dash="kosik">
      <b>${vKosiku}</b><span>v košíku</span></button>
  </div>

  ${
    kostra.length
      ? `<div class="sekce"><span class="sekce-text">Kostra cesty</span>
           ${volnych ? `<span class="sekce-pozn">${volnych} ${volnych === 1 ? 'den čeká' : 'dnů čeká'}</span>` : ''}</div>
         <div class="kostra">${kostra.map(radekDne).join('')}</div>`
      : ''
  }`
}
