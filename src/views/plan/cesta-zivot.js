/**
 * Živé sledování ZBÝVAJÍCÍ VZDÁLENOSTI/ČASU na trase – JINÁ VĚC než „ujetá
 * trasa" v cesta.js (spojnice odznačených zastávek, viz komentář nahoře
 * cesta.js řádky 1-16, který zůstává platný a nedotčený).
 *
 *   UJETÁ TRASA (cesta.js)         ŽIVÉ SLEDOVÁNÍ (tenhle soubor)
 *   žádné GPS                      watchPosition, JEN NA POPŘEDÍ
 *   přežije zavření appky          zastaví se při zhasnutí displeje/přepnutí
 *   trvalá data (store.cesta)      jen v paměti (S), nic se neukládá
 *   spojnice odznačených bodů      projekce polohy na ULOŽENOU polyline z
 *                                  posledního přepočtu (store.aktivniPrepocet)
 *
 * PROČ JE TO OK, PŘESTOŽE cesta.js ŘÍKÁ „BEZ GPS": tamní rozhodnutí se týká
 * TRVALÉHO záznamu ujeté trasy, který musí přežít zavřenou appku – s
 * watchPosition na pozadí to nejde (prohlížeč ho na zhasnutém displeji
 * zastaví, takže by záznam byl děravý). Tohle je okamžitý displej „kolik
 * zbývá TEĎ, když se dívám na appku" – když appka zmizí z popředí, sledování
 * se tiše zastaví a nikomu nechybí děravá čára, protože se NIC neukládá, jen
 * se přestane aktualizovat číslo na obrazovce. NEPOKOUŠET SE obcházet limit
 * prohlížeče (žádné wake lock hacky apod.).
 */

import { S, emit } from '../../core/store.js'
import { geometrie } from '../../core/trasy.js'
import { projektujNaTrasu } from '../../core/projekce.js'
import { throttle } from '../../core/throttle.js'

/** @type {number|null} watchPosition id, nebo null když neběží */
let watchId = null

/** Throttlovaná verze – appka nepřekresluje na každou GPS zprávu. */
const oznamProjekci = throttle(() => emit('zivaProjekce'), 2000)

/**
 * Spustí sledování. Volá se při vstupu na kartu Na cestě / návratu appky
 * na popředí (visibilitychange). Idempotentní – druhé volání, dokud první
 * běží, nic nedělá.
 */
export function spustSledovani() {
  if (watchId != null || !('geolocation' in navigator)) return
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      S.zivaPoloha = { lat: pos.coords.latitude, lon: pos.coords.longitude }
      oznamProjekci()
    },
    () => {}, // chyby tiše ignorovat – je to jen doplňkový displej, appka kvůli němu nesmí rušit toasty
    { enableHighAccuracy: true, maximumAge: 5000 }
  )
}

/** Zastaví sledování – volá se při schování appky a odchodu z karty Na cestě. */
export function zastavSledovani() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId)
  watchId = null
}

/**
 * Aktuální projekce polohy na uloženou trasu, nebo null (chybí poloha,
 * chybí platný přepočet, nebo appka sledování nespustila).
 * @param {object|null} prepocet  store.aktivniPrepocet
 */
export function aktualniProjekce(prepocet) {
  if (!S.zivaPoloha || !prepocet) return null
  // Geometrie bydlí od srpna 2026 v IndexedDB a v paměti je jen to, co se
  // kreslí (core/trasy.js). Když tam ještě není, projekce prostě chybí –
  // dotažení si vyžádá mapa a po něm se karta překreslí.
  const trasa = geometrie(prepocet.otisk)
  return trasa ? projektujNaTrasu(S.zivaPoloha, trasa) : null
}
