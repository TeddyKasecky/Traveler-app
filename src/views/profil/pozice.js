/**
 * Sekce „Uložené pozice“ v Profilu – vykreslení a obsluha.
 *
 * proč: datová logika je v core/pozice.js (stejné dělení jako
 * views/plan/body.js a bloky.js – data odděleně od zobrazení), tenhle
 * soubor smí importovat IC a skládat HTML.
 */

import { esc } from '../../core/html.js'
import { IC } from '../../icons/sprite.js'
import { radek } from '../../components/vzory.js'
import { zadej, potvrd, vyberZeSeznamu } from '../../components/dialog.js'
import { toast } from '../../components/toast.js'
import { ulozenePozice, pridejPozici, upravPozici, smazPozici } from '../../core/pozice.js'
import { rozpoznejSouradnice } from '../plan/body.js'
import { pocetOdkazuNaPozici } from '../plan/routing.js'

/** HTML sekce v Profilu. */
export function pozicHtml() {
  const seznam = ulozenePozice()
  return `
    <div class="sechd">${IC('i-dum')}Uložené pozice</div>
    ${
      seznam.length
        ? seznam
            .map((p) =>
              radek({
                nadpis: p.nazev,
                meta: `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`,
                id: p.id,
                tridy: 'pozice-radek',
                vpravo: `<button class="ikonbtn" data-act="upravit" title="Upravit">${IC('i-quill')}</button>
                  <button class="ikonbtn" data-act="smazat" title="Smazat">${IC('i-trash')}</button>`,
              })
            )
            .join('')
        : `<div class="meta" style="margin:0 2px 10px">Zatím žádná – přidej třeba Domov nebo Práci.</div>`
    }
    <div class="pradek"><button class="btn small" id="pozicePridat">${IC('i-plus')}Přidat pozici</button></div>`
}

/**
 * Napojí obsluhu sekce. Volá se po každém `innerHTML =` (Profil kreslí
 * celý `#profilInner` najednou), stejně jako `napojVyberAuta()` vedle ní.
 * @param {HTMLElement} wrap
 * @param {() => void} prekresli
 * @param {(cb: (lat: number, lon: number) => void) => void} vyberZMapy
 */
export function napojPozice(wrap, prekresli, vyberZMapy) {
  const pridat = wrap.querySelector('#pozicePridat')
  if (pridat) pridat.onclick = () => pruvodcePozici(null, prekresli, vyberZMapy)

  for (const r of wrap.querySelectorAll('.pozice-radek[data-id]')) {
    const id = r.dataset.id
    r.querySelector('[data-act="upravit"]').onclick = () => pruvodcePozici(id, prekresli, vyberZMapy)
    r.querySelector('[data-act="smazat"]').onclick = async () => {
      const pocet = pocetOdkazuNaPozici(id)
      const dal = await potvrd({
        nadpis: 'Smazat pozici?',
        text: pocet
          ? `Používá se v ${pocet} ${pocet === 1 ? 'bodu' : 'bodech'} trasy napříč výpravami – tam poloha zmizí taky.`
          : 'Nikde se nepoužívá.',
        ano: 'Smazat',
        nebezpecne: true,
      })
      if (!dal) return
      smazPozici(id)
      toast('Pozice smazána')
      prekresli()
    }
  }
}

/** Průvodce přidáním/úpravou: název → poloha (ručně, nebo z mapy). */
async function pruvodcePozici(id, prekresli, vyberZMapy) {
  const stavajici = id ? ulozenePozice().find((p) => p.id === id) : null
  const nazev = await zadej({
    nadpis: id ? 'Přejmenovat pozici' : 'Nová pozice',
    vychozi: stavajici ? stavajici.nazev : '',
    placeholder: 'třeba Domov nebo Práce',
  })
  if (nazev === null || !nazev.trim()) return

  const uloz = (lat, lon) => {
    if (id) upravPozici(id, { nazev, lat, lon })
    else pridejPozici({ nazev, lat, lon })
    toast(id ? 'Pozice upravena' : 'Pozice přidána')
    prekresli()
  }

  const zpusob = await vyberZeSeznamu({
    nadpis: 'Kde to je?',
    polozky: [
      { id: 'rucne', popisek: 'Zadat souřadnice', ikona: 'i-copy', meta: 'GPS, 50.0755, 14.4378' },
      { id: 'mapa', popisek: 'Vybrat na mapě', ikona: 'i-map' },
    ],
  })
  if (zpusob === null) return
  if (zpusob === 'mapa') return vyberZMapy((lat, lon) => uloz(lat, lon))

  const text = await zadej({
    nadpis: 'Souřadnice',
    vychozi: stavajici ? `${stavajici.lat}, ${stavajici.lon}` : '',
    placeholder: '50.0755, 14.4378',
  })
  if (text === null) return
  const gps = rozpoznejSouradnice(text)
  if (!gps) return toast('Souřadnice se nepodařilo rozpoznat')
  uloz(gps.lat, gps.lon)
}
