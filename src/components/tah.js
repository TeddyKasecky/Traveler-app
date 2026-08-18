/**
 * Svislé tažení prstem — jedna mechanika pro plát uložených míst, kartu
 * výpravy a detail místa.
 *
 * PROČ SDÍLENÉ: do srpna 2026 měla tažení jen Mapa (`views/mapa/mapa.js`)
 * a detail neměl žádné. Při doplnění detailu by vznikla druhá kopie a ta by
 * se s první rozešla — u gest je to horší než jinde, protože rozdíl v prahu
 * nebo pružení je cítit pod prstem.
 *
 * DVĚ VĚCI, KTERÉ NEJSOU VIDĚT, ALE BEZ NICH TO NEFUNGUJE:
 *
 * `touch-action: none` si nastavuje tenhle modul sám na prvku, na kterém se
 * tahá. Bez toho si prohlížeč vezme prst na posun stránky dřív, než přijde
 * první `pointermove` — myší to pak chodí a prstem ne. Přesně to byla chyba
 * plátu uložených míst.
 *
 * Ukazatel se zachytává až po šesti pixelech pohybu, ne hned při stisku.
 * Kdyby se zachytil rovnou, prohlížeč by na prvek přesměroval i `click`
 * a tlačítka uvnitř by přestala fungovat (stalo se šipce na kartě výpravy).
 *
 * Klik po tažení se spolkne přes `stopImmediatePropagation`, ne přes
 * `stopPropagation`. TOHLE BYLA TA CHYBA, KVŮLI KTERÉ TAŽENÍ „NEFUNGOVALO":
 * `stopPropagation` zastaví jen cestu k jiným prvkům, ale posluchače na tomtéž
 * prvku běží dál. Úchyt plátu má vlastní `onclick`, který polohu přepíná —
 * tažení ji tedy přepnulo a klik hned nato vrátil zpátky. Navenek to vypadalo,
 * že se nestalo vůbec nic. A protože prohlížeče po tažení klik někdy nepošlou
 * vůbec, jednorázový posluchač se navíc musí po chvilce uklidit sám, jinak by
 * spolkl příští poctivé ťuknutí.
 */

/** O kolik pixelů musí prst ujet, než se to bere jako tažení, ne ťuknutí. */
export const PRAH_TAHU = 40

/**
 * Rychlost, od které švihnutí přehodí polohu i na kratší dráze (px/ms).
 * 0,5 px/ms je líné mávnutí — pomalejší pohyb rozhoduje jen dráhou.
 */
const PRAH_SVIHU = 0.5

/**
 * Naváže svislé tažení.
 *
 * `konec` dostane posun a rychlost; `svih()` z nich udělá rozhodnutí.
 * `behem` chodí průběžně, ať prvek může jet za prstem; po puštění přijde
 * ještě jednou s nulou, aby se posun uklidil.
 *
 * @param {HTMLElement} prvek  na čem se tahá
 * @param {(dy: number, rychlost: number) => void} konec  po puštění; dy 0 = ťuknutí
 * @param {(dy: number) => void} [behem]
 */
export function napojTah(prvek, konec, behem) {
  // Bez tohohle tažení na dotyku vůbec nezačne, viz úvodní komentář.
  prvek.style.touchAction = 'none'

  prvek.onpointerdown = (e) => {
    // Jen primární tlačítko/prst; na pravý klik se nereaguje.
    if (e.button) return
    // Tlačítka uvnitř si musí klik obsloužit sama.
    if (e.target.closest('button') && e.target.closest('button') !== prvek) return

    const y0 = e.clientY
    const t0 = performance.now()
    let tahalo = false
    // Rychlost se počítá z posledního kousku dráhy, ne z celé: prst často
    // nejdřív váhá a švih přijde až na konci.
    let minulyY = y0
    let minulyCas = t0
    let rychlost = 0

    prvek.onpointermove = (ev) => {
      const dy = ev.clientY - y0
      if (!tahalo && Math.abs(dy) > 6) {
        tahalo = true
        prvek.setPointerCapture(ev.pointerId)
      }
      const ted = performance.now()
      if (ted - minulyCas > 0) rychlost = (ev.clientY - minulyY) / (ted - minulyCas)
      minulyY = ev.clientY
      minulyCas = ted
      if (tahalo && behem) behem(dy)
    }

    const dokonci = (ev) => {
      prvek.onpointermove = null
      prvek.onpointerup = null
      prvek.onpointercancel = null
      const dy = ev.clientY - y0
      if (behem) behem(0)
      if (tahalo) {
        const spolkni = (c) => {
          c.stopImmediatePropagation()
          c.preventDefault()
        }
        prvek.addEventListener('click', spolkni, { capture: true, once: true })
        // Klik po tažení někdy vůbec nepřijde — jednorázový posluchač by pak
        // zůstal nastražený a spolkl příští poctivé ťuknutí.
        setTimeout(() => prvek.removeEventListener('click', spolkni, { capture: true }), 350)
      }
      konec(tahalo ? dy : 0, tahalo ? rychlost : 0)
    }
    prvek.onpointerup = dokonci
    prvek.onpointercancel = dokonci
  }
}

/**
 * Rozhodne, jestli tažení stačí na změnu polohy.
 *
 * Dráha přes práh rozhodne vždycky; rychlé švihnutí stejným směrem rozhodne
 * i na kratší dráze — tak se chová každý pořádný plát.
 *
 * @param {number} dy  posun (kladný = dolů)
 * @param {number} rychlost  px/ms (kladná = dolů)
 * @param {1|-1} smer  který směr znamená „ano“ (1 dolů, −1 nahoru)
 */
export function svih(dy, rychlost, smer) {
  if (dy * smer >= PRAH_TAHU) return true
  return dy * smer > 12 && rychlost * smer >= PRAH_SVIHU
}
