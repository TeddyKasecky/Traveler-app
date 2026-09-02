/**
 * Rozdělení plánu na dny.
 *
 * NEJCITLIVĚJŠÍ MÍSTO CELÉHO REDESIGNU: `store.plan` je ploché pole `id`
 * v klíči `vandrbuch:v1`, kde jsou všechna uživatelská data a nikde jinde
 * neexistují. Klíč se nesmí měnit a nesmí se stát, že se zastávka ztratí.
 *
 * ŘEŠENÍ: přidat vedle, nikdy nepřepisovat.
 *
 *   plan: []      beze změny – pořadí i členství zastávek
 *   planDny: []   NOVÉ – počty zastávek po dnech. [3,2] = Den 1 první tři,
 *                 Den 2 zbytek.
 *
 * PROČ POČTY, A NE MAPA `id → den`: `plan` zůstává jediným zdrojem pravdy
 * o tom, které zastávky v plánu jsou a v jakém pořadí. Kdyby dny byly seznamy
 * `id`, mohla by po obnově ze zálohy vzniknout zastávka, která není v žádném
 * dni – a tiše by z plánu zmizela. S počty to nejde: `dnyPlanu()` přebytek
 * vždycky přiřkne poslednímu dni.
 *
 * MIGRACE ŽÁDNÁ: chybějící `planDny` znamená „všechno první den“. Nikde se
 * při startu nic nezapisuje, takže není ani šance ztratit data při plné paměti.
 * Starší build z cache klíč ignoruje a s `plan` pracuje dál; co v něm přidá,
 * nový build příště přiřkne poslednímu dni.
 */

import { store, save } from '../store.js'

/**
 * Plán rozdělený na dny, jako pole polí `id`.
 *
 * Opravuje nesoulad na místě a **nikdy nezapisuje** – čte se při každém
 * překreslení a zápis při čtení je cesta, jak si rozbít data.
 *
 * @returns {string[][]}
 */
export function dnyPlanu() {
  const n = store.plan.length
  // Nula je platná délka – prázdný den (srpen 2026). Dřív se zahazovala
  // a „Přidat den" bylo od druhého kliknutí tiché nic: prázdný den se nedal
  // ani zapsat, ani zobrazit. Záporné a nečíselné délky se přeskakují dál.
  const delky = (store.planDny || []).map(Number).filter((x) => Number.isFinite(x) && x >= 0)

  const out = []
  let i = 0
  for (const d of delky) {
    if (i > n || (i === n && d > 0)) break
    out.push(store.plan.slice(i, i + d))
    i += d
  }
  // Co zbylo (a taky celý plán, když `planDny` nejsou) padá do posledního dne.
  if (i < n || !out.length) out.push(store.plan.slice(i))
  return out
}

/** Zapíše délky dnů zpátky do storu. Prázdné dny jsou dovolené. */
function uloz(dny) {
  const delky = dny.map((d) => d.length)
  // Jediný den = stejné jako žádné dělení. Ať se v datech nedrží zbytečnost.
  store.planDny = delky.length > 1 ? delky : []
  return save()
}

/** Přidá na konec prázdný den. Zastávky se do něj přesouvají tažením a šipkami. */
export function pridejDen() {
  const dny = dnyPlanu()
  dny.push([])
  return uloz(dny)
}

/**
 * Přesune zastávku do sousedního dne.
 * @param {string} id
 * @param {-1|1} smer
 */
export function presunDoDne(id, smer) {
  const dny = dnyPlanu()
  const kde = dny.findIndex((d) => d.includes(id))
  const cil = kde + smer
  if (kde < 0 || cil < 0 || cil >= dny.length) return true

  dny[kde].splice(dny[kde].indexOf(id), 1)
  // Při posunu dopředu jde zastávka na začátek dalšího dne, při posunu zpět
  // na konec předchozího – tedy vždycky na tu stranu, odkud přišla.
  if (smer > 0) dny[cil].unshift(id)
  else dny[cil].push(id)

  // `plan` se musí přeskládat do stejného pořadí, jinak by si pořadí zastávek
  // a hranice dnů začaly odporovat.
  store.plan = dny.flat()
  return uloz(dny)
}

/**
 * Přesune zastávku do konkrétního dne, volitelně za konkrétní zastávku.
 *
 * PROČ TADY, A NE V `plan.js`: tažení v itineráři do srpna 2026 přeskládalo
 * jen `store.plan` a `store.planDny` nechalo být. `dnyPlanu()` pak plán
 * rozřezal podle STARÝCH délek, takže se přetažení projevilo jako „zastávky
 * se prohodily" – u dnů s jednou zastávkou (délky [1,1]) nejvíc: přesun A za
 * B dal plan=[B,A] a délky pořád [1,1], tedy den 1 = B, den 2 = A. Viz
 * BUGS.md B4. Zápis dnů má jedinou cestu (`nastavDny`), takže sem patří
 * i přesun – a jako čistá funkce nad daty jde testovat bez prohlížeče.
 *
 * @param {string} id  zastávka, která se stěhuje
 * @param {number} doDne  cílový den od jedničky; mimo rozsah se ořízne
 * @param {string|null} [poId]  za kterou zastávku; když není v cílovém dni,
 *   zastávka jde na jeho začátek (zastávka nad hlavičkou dne patří dni
 *   předchozímu a vkládat za ni by znamenalo minout cíl)
 * @returns {boolean} true když se něco změnilo a zapsalo
 */
export function presunZastavku(id, doDne, poId = null) {
  const dny = dnyPlanu()
  const puvodniPlan = store.plan.join()
  const puvodniDelky = dny.map((d) => d.length).join()
  const zdroj = dny.findIndex((d) => d.includes(id))
  if (zdroj < 0) return false

  const cil = Math.min(Math.max(Math.round(doDne) || 1, 1), dny.length) - 1
  dny[zdroj].splice(dny[zdroj].indexOf(id), 1)
  const kam = poId && dny[cil].includes(poId) ? dny[cil].indexOf(poId) + 1 : 0
  dny[cil].splice(kam, 0, id)

  const novy = dny.flat()
  const delky = dny.map((d) => d.length)
  // Beze změny se nezapisuje – puštění na místě nemá přepisovat úložiště.
  if (novy.join() === puvodniPlan && delky.join() === puvodniDelky) return false

  store.plan = novy
  return nastavDny(delky)
}

/**
 * Kolik zastávek by přestěhovalo zkrácení plánu na `kolik` dnů.
 *
 * Volající se podle toho ptá – zkrácení, které jen ukrojí prázdné dny, je
 * bez následků a ptát se na něj je otravné. Vrací 0 i při prodlužování.
 * @param {number} kolik
 * @returns {number}
 */
export function zastavekNadDen(kolik) {
  const dny = dnyPlanu()
  const cil = Math.max(1, Math.round(kolik) || 1)
  if (cil >= dny.length) return 0
  return dny.slice(cil).reduce((a, d) => a + d.length, 0)
}

/**
 * Srovná počet dnů plánu na `kolik` – nahoru i dolů.
 *
 * PROČ VZNIKLA: `pripravDny()` v plan.js uměla jen dorovnat nahoru, takže
 * „na kolik dní" šlo nastavit jednou a zpátky už nikdy. Počet dnů má
 * fungovat vždy a oběma směry.
 *
 * ZKRÁCENÍ NIKDY NEZAHODÍ ZASTÁVKU: co je v odříznutých dnech, slije se do
 * posledního zbývajícího. Pořadí se tím nemění (odříznuté dny jsou na konci),
 * jen hranice. Zápis jde přes `nastavDny()`, které odmítne rozdělení
 * s nesedícím součtem – druhá pojistka proti ztrátě.
 *
 * @param {number} kolik  cílový počet dnů, 1–365
 * @returns {boolean} výsledek uložení; false i když nebylo co dělat
 */
export function srovnejDny(kolik) {
  const cil = Math.max(1, Math.min(365, Math.round(kolik) || 1))
  const dny = dnyPlanu()
  if (cil === dny.length) return false

  if (cil > dny.length) {
    return nastavDny([...dny.map((d) => d.length), ...Array(cil - dny.length).fill(0)])
  }

  const zustava = dny.slice(0, cil)
  zustava[cil - 1] = [...zustava[cil - 1], ...dny.slice(cil).flat()]
  store.plan = zustava.flat()
  return nastavDny(zustava.map((d) => d.length))
}

/** Zruší dělení na dny. Zastávky ani jejich pořadí se nemění. */
export function zrusDny() {
  store.planDny = []
  return save()
}

/**
 * Zapíše navržené délky dnů.
 *
 * Kontroluje, že součet sedí na počet zastávek – kdyby ne, dělení by tiše
 * ukrojilo konec plánu. Radši se nezapíše nic.
 *
 * @param {number[]} delky
 * @returns {boolean}
 */
export function nastavDny(delky) {
  const soucet = delky.reduce((a, b) => a + b, 0)
  if (soucet !== store.plan.length) return false
  store.planDny = delky.length > 1 ? delky : []
  return save()
}
