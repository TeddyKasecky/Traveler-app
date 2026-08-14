/**
 * Vlastní vyfocené fotky míst.
 *
 * Ukládají se jako JPEG v data URI, delší strana nejvýš 760 px a kvalita 0,72.
 * Zmenšení zůstává, i když je fotek nově kam ukládat: menší fotka se rychleji
 * vykreslí v detailu a rychleji projde zálohou.
 *
 * Trvalé úložiště je IndexedDB (`core/fotoDb.js`), ne localStorage – zápis je
 * proto asynchronní a hláška se ukazuje až po něm.
 */

import { PHOTOS, ulozFotku, zahodFotku } from '../core/store.js'
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
      // Na obrazovku se fotka dostane hned, uložení doběhne na pozadí.
      // Kdyby selhalo, ohlásí to varovný pruh přes `ulozeniSelhalo`.
      hotovo && hotovo()
      ulozFotku(id).then((ok) => toast(ok ? 'Fotka uložena' : 'Fotku se nepodařilo uložit'))
    }
    img.onerror = () => toast('Obrázek se nepodařilo načíst')
    img.src = rd.result
  }
  rd.readAsDataURL(file)
}

/** Smaže vlastní fotku místa. */
export function smazFotku(id) {
  delete PHOTOS[id]
  zahodFotku(id)
}
