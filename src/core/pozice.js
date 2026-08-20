/**
 * Uložené pozice z profilu (Domov, Práce...), neomezený vlastní seznam.
 *
 * proč: aby šly vybírat jako start/cíl trasy odkudkoli a úprava (přejmenování,
 * posun na mapě) se promítla všude, kde je pozice použitá – to jde jen
 * odkazem na `id`, ne kopií souřadnic. Datová logika bez DOM patří do core/,
 * stejně jako views/plan/body.js odděluje data bloků od jejich vykreslení –
 * views/plan/body.js na tenhle modul sahá a appka zakazuje views importovat
 * mezi sebou navzájem.
 */

import { store, save } from './store.js'

/** Nové id pozice. Čas + náhoda stačí – pozic jsou jednotky, ne tisíce. */
export const noveIdPozice = () =>
  `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`

/** Uložené pozice, vždycky pole – lenivý getter jako store.vypravy (staré uložení klíč nemá). */
export const ulozenePozice = () =>
  Array.isArray(store.ulozenePozice) ? store.ulozenePozice : (store.ulozenePozice = [])

/**
 * Přidá novou pozici.
 * @param {{nazev: string, lat: number, lon: number}} p
 * @returns {string} id nové pozice
 */
export function pridejPozici({ nazev, lat, lon }) {
  const p = { id: noveIdPozice(), nazev: nazev.trim(), lat, lon, vytvoreno: Date.now() }
  ulozenePozice().push(p)
  save()
  return p.id
}

/**
 * Upraví pozici na místě – kdo na ni odkazuje (id), vidí změnu hned.
 * @param {string} id
 * @param {{nazev?: string, lat?: number, lon?: number}} zmeny
 * @returns {boolean}
 */
export function upravPozici(id, { nazev, lat, lon } = {}) {
  const p = pozice(id)
  if (!p) return false
  if (nazev != null) p.nazev = nazev.trim()
  if (lat != null) p.lat = lat
  if (lon != null) p.lon = lon
  return save()
}

/**
 * Smaže pozici. Body trasy, které na ni odkazují, po smazání ztratí polohu
 * (views/plan/body.js#souradniceBodu vrátí null) – volající v profilu má
 * uživatele předem varovat, kolik bodů to zasáhne (views/plan/routing.js
 * #pocetOdkazuNaPozici).
 * @param {string} id
 * @returns {boolean}
 */
export function smazPozici(id) {
  store.ulozenePozice = ulozenePozice().filter((p) => p.id !== id)
  return save()
}

/** Pozice podle id, nebo undefined. */
export const pozice = (id) => ulozenePozice().find((p) => p.id === id)
