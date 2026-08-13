/**
 * Vlastní vyfocené fotky míst.
 *
 * Ukládají se do localStorage jako JPEG v data URI, delší strana nejvýš 760 px
 * a kvalita 0,72. Bez zmenšení by se do úložiště vešlo jen pár fotek.
 */

import { PHOTOS, savePhotos } from '../core/store.js'
import { toast } from './toast.js'

const MAX_STRANA = 760
const KVALITA = 0.72

/**
 * Načte soubor, zmenší ho a uloží k místu.
 * @param {string} id
 * @param {File} file
 * @param {() => void} [hotovo]  zavolá se po uložení
 */
export function addPhoto(id, file, hotovo) {
  const rd = new FileReader()
  rd.onload = () => {
    const img = new Image()
    img.onload = () => {
      const s = Math.min(1, MAX_STRANA / Math.max(img.width, img.height))
      const cv = document.createElement('canvas')
      cv.width = img.width * s
      cv.height = img.height * s
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height)
      PHOTOS[id] = cv.toDataURL('image/jpeg', KVALITA)
      if (savePhotos()) toast('Fotka uložena')
      else toast('Paměť je plná – smaž pár fotek')
      hotovo && hotovo()
    }
    img.onerror = () => toast('Obrázek se nepodařilo načíst')
    img.src = rd.result
  }
  rd.readAsDataURL(file)
}

/** Smaže vlastní fotku místa. */
export function smazFotku(id) {
  delete PHOTOS[id]
  savePhotos()
}
