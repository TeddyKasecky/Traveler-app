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
export const fmtKm = (d) => (d < 10 ? `${d.toFixed(1).replace('.', ',')} km` : `${Math.round(d)} km`)

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
