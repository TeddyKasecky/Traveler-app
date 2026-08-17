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

import { store, save } from '../../core/store.js'

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
  const delky = (store.planDny || []).map(Number).filter((x) => Number.isFinite(x) && x > 0)

  const out = []
  let i = 0
  for (const d of delky) {
    if (i >= n) break
    out.push(store.plan.slice(i, i + d))
    i += d
  }
  // Co zbylo (a taky celý plán, když `planDny` nejsou) padá do posledního dne.
  if (i < n || !out.length) out.push(store.plan.slice(i))
  return out
}

/** Zapíše délky dnů zpátky do storu. Prázdné dny se zahazují. */
function uloz(dny) {
  const delky = dny.map((d) => d.length).filter((x) => x > 0)
  // Jediný den = stejné jako žádné dělení. Ať se v datech nedrží zbytečnost.
  store.planDny = delky.length > 1 ? delky : []
  return save()
}

/** Přidá na konec prázdný den. Zastávky se do něj přesouvají tlačítky. */
export function pridejDen() {
  const dny = dnyPlanu()
  dny.push([])
  // Prázdný den by `uloz()` zahodil, tak se do něj rovnou přesune poslední
  // zastávka předchozího dne – jinak by tlačítko navenek nic neudělalo.
  const posledni = dny[dny.length - 2]
  if (posledni && posledni.length > 1) dny[dny.length - 1].push(posledni.pop())
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

/** Zruší dělení na dny. Zastávky ani jejich pořadí se nemění. */
export function zrusDny() {
  store.planDny = []
  return save()
}

/* ================= automatické dělení ================= */

/**
 * Obě funkce níž jsou ČISTÉ: dostanou délky úseků a vrátí délky dnů. Nic
 * nezapisují a neznají rychlost ani klikatost silnic — ty patří do `plan.js`,
 * kde jsou konstanty KMH a KLIKATOST. Díky tomu se dají spočítat i nanečisto
 * a ukázat, co z toho vyjde, než se to uloží.
 *
 * `useky[i]` je čas z předchozí zastávky na i-tou. `useky[0]` je vždycky 0 —
 * na první zastávku se nikam nejede.
 */

/**
 * Rozdělí zastávky tak, aby žádný den nepřekročil limit hodin za volantem.
 *
 * Zastávka, na kterou se jede déle než celý limit, dostane vlastní den —
 * jinak by se cyklus zacyklil, nebo by vznikl den s jedinou zastávkou navíc
 * k předchozímu. Tak jako tak se ten den pojede dýl, než člověk chtěl,
 * a aplikace to nemá zamlčet.
 *
 * @param {number[]} useky
 * @param {number} limit  hodin za volantem denně
 * @returns {number[]} délky dnů
 */
export function rozdelPodleHodin(useky, limit) {
  if (useky.length < 2 || !(limit > 0)) return []

  const delky = []
  let vDni = 1
  let hodin = 0

  for (let i = 1; i < useky.length; i++) {
    const u = useky[i] || 0
    if (hodin + u > limit && vDni > 0) {
      delky.push(vDni)
      vDni = 1
      // Cesta z místa noclehu na první zastávku dalšího dne se počítá do NĚJ.
      // Původně se tady nulovalo, což ten úsek nezapočítalo nikam – dny pak
      // limit překračovaly a náhled v `plan.js` ukazoval jiná čísla než
      // rozdělení, podle kterého vznikly. Odhalil to check-dny.
      hodin = u
    } else {
      vDni++
      hodin += u
    }
  }
  delky.push(vDni)
  return delky.length > 1 ? delky : []
}

/**
 * Rozdělí zastávky na daný počet dní tak, aby dny byly časově co nejvyrovnanější.
 *
 * Ne po stejném počtu zastávek: pět měst vedle sebe a pak dvě stě kilometrů
 * do hor je jeden krátký a jeden dlouhý den, ne dva stejné. Dělí se proto
 * podle času — hledá se hranice, u které je součet nejblíž rovnému dílu.
 *
 * @param {number[]} useky
 * @param {number} pocet
 * @returns {number[]} délky dnů
 */
export function rozdelNaPocet(useky, pocet) {
  const n = useky.length
  if (n < 2 || !(pocet > 1)) return []
  // Víc dnů než zastávek nedává smysl – prázdné dny se stejně zahodí.
  const dni = Math.min(Math.floor(pocet), n)

  const celkem = useky.reduce((a, b) => a + (b || 0), 0)
  const delky = []
  let vDni = 0
  let hodin = 0
  let hotovo = 0

  for (let i = 0; i < n; i++) {
    vDni++
    hodin += useky[i] || 0
    const zbyvaDnu = dni - delky.length
    const zbyvaZastavek = n - i - 1
    // Uzavřít den, když je nabraný jeho díl času – ale jen dokud zbývá dost
    // zastávek na zbylé dny, jinak by poslední dny vyšly prázdné.
    const dil = (celkem - hotovo) / zbyvaDnu
    if (zbyvaDnu > 1 && zbyvaZastavek >= zbyvaDnu && hodin >= dil) {
      delky.push(vDni)
      hotovo += hodin
      vDni = 0
      hodin = 0
    }
  }
  if (vDni) delky.push(vDni)
  return delky.length > 1 ? delky : []
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
