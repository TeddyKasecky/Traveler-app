/**
 * Vzdálenosti a poloha uživatele.
 */

import { S, emit } from './store.js'
import { toast } from '../components/toast.js'

/**
 * Vzdušná vzdálenost dvou bodů v kilometrech (haversine).
 * @param {{lat:number, lon:number}} a
 * @param {{lat:number, lon:number}} b
 * @returns {number}
 */
export function dkm(a, b) {
  const R = 6371
  const dLa = ((b.lat - a.lat) * Math.PI) / 180
  const dLo = ((b.lon - a.lon) * Math.PI) / 180
  const x =
    Math.sin(dLa / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

/**
 * Vzdálenost pro člověka. Do 10 km na jedno desetinné místo s čárkou,
 * dál zaokrouhleně.
 * @param {number} d
 * @returns {string}
 */
export const fmtKm = (d) =>
  d < 10 ? `${d.toFixed(1).replace('.', ',')} km` : `${Math.round(d).toLocaleString('cs-CZ')} km`

/** Do jaké dálky se ještě hledají sousedi a kolik se jich uloží. */
export const OKOLI_KM = 45
export const OKOLI_POCET = 6

/**
 * Spočítá pole `nb` – místa poblíž, seřazená od nejbližšího.
 *
 * Pravidlo pochází z původní aplikace, kde ho měl import CSV zapsané u sebe.
 * Formulář na přidání místa i `npm run slouc` počítají totéž, takže je tady
 * jednou pro všechny. Vzdálenost se zaokrouhluje na jedno desetinné místo,
 * přesně jako v datech.
 *
 * @param {{id:string, lat:number, lon:number}} misto
 * @param {Array<{id:string, lat:number, lon:number}>} vsechna
 * @returns {Array<{id:string, d:number}>}
 */
export function spocitejOkoli(misto, vsechna) {
  return vsechna
    .map((q) => ({ id: q.id, d: +dkm(misto, q).toFixed(1) }))
    .filter((x) => x.id !== misto.id && x.d <= OKOLI_KM)
    .sort((a, b) => a.d - b.d)
    .slice(0, OKOLI_POCET)
}

/**
 * Zeptá se prohlížeče na polohu.
 *
 * Po úspěchu nastaví S.userPos a oznámí `poloha`. Co se má překreslit, řeší
 * odběratelé v main.js – kdyby to řešil tenhle modul, musel by znát mapu
 * i všechny obrazovky.
 */
export function zjistiPolohu() {
  if (!('geolocation' in navigator)) {
    toast('Tenhle prohlížeč polohu neumí')
    return
  }
  if (window.isSecureContext === false) {
    toast('Poloha funguje jen přes HTTPS')
    return
  }
  toast('Hledám polohu…')
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      S.userPos = { lat: pos.coords.latitude, lon: pos.coords.longitude }
      emit('poloha')
      const n = S.places.length ? S.places.map((p) => dkm(S.userPos, p)).sort((a, b) => a - b)[0] : null
      toast(`Poloha nalezena ✓${n != null ? ` · nejblíž ${fmtKm(n)}` : ''}`)
    },
    (err) => {
      const msg = {
        1: 'Přístup k poloze je zamítnutý – povol ho v nastavení prohlížeče',
        2: 'GPS teď není dostupná – zkus to pod širým nebem',
        3: 'Hledání polohy vypršelo – zkus to znovu',
      }
      toast(msg[err && err.code] || 'Polohu se nepodařilo zjistit')
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
  )
}

/**
 * Jednorázové zjištění polohy jako Promise, bez vlastních toastů – volající
 * (výběr start/cíl, sběr bodů pro přepočet trasy) si hlášku dá podle svého
 * kontextu. NENÍ TOTÉŽ jako watchPosition ve views/plan/cesta-zivot.js –
 * tohle je jeden dotaz, appka se ho nezeptá znovu, dokud ji o to nikdo
 * nepožádá.
 * @returns {Promise<{lat: number, lon: number}>}
 */
export function zjistiPolohuJednorazove() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Tenhle prohlížeč polohu neumí'))
    if (window.isSecureContext === false) return reject(new Error('Poloha funguje jen přes HTTPS'))
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => {
        const msg = {
          1: 'Přístup k poloze je zamítnutý – povol ho v nastavení prohlížeče',
          2: 'GPS teď není dostupná – zkus to pod širým nebem',
          3: 'Hledání polohy vypršelo – zkus to znovu',
        }
        reject(new Error(msg[err && err.code] || 'Polohu se nepodařilo zjistit'))
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    )
  })
}
