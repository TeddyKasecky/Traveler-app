/**
 * Uvítací obrazovka. Ukáže se jednou, pak si to zapamatuje ve `store.seen`.
 */

import { store, save } from '../core/store.js'

export function initIntro() {
  if (!store.seen) document.getElementById('intro').classList.add('show')
  document.getElementById('introGo').onclick = () => {
    document.getElementById('intro').classList.remove('show')
    store.seen = true
    save()
  }
}
