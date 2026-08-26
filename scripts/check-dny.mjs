/**
 * Že se rozdělení plánu na dny nikdy neztratí ani nesní zastávku.
 *
 *   npm run check-dny
 *
 * PROČ ZVLÁŠŤ A NE VE SMOKE: `store.plan` a `store.planDny` žijí ve
 * `vandrbuch:v1`, kde jsou všechna uživatelská data a nikde jinde neexistují.
 * Chyba v dělení na dny se nepozná na obrazovce – pozná se až tím, že někomu
 * po obnově ze zálohy chybí zastávka. Tohle je čistý Node bez prohlížeče,
 * stejně jako `check-filters-parity.mjs`, takže běží za zlomek vteřiny
 * a dá se pouštět po každé změně.
 *
 * Hlídá čtyři věci, na kterých návrh stojí:
 *   1. chybějící `planDny` znamená „všechno první den“ (žádná migrace),
 *   2. nesoulad mezi `plan` a `planDny` nikdy neztratí zastávku,
 *   3. čtení nikdy nezapisuje,
 *   4. záloha a obnova dny přenesou, a stará záloha bez nich nespadne.
 */

// storage.js sahá na localStorage hned při načtení modulu.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

const { store, S } = await import('../src/core/store.js')
const { dnyPlanu, pridejDen, presunDoDne, zrusDny, nastavDny, presunZastavku } =
  await import('../src/views/plan/dny.js')
const { zalohaData, obnovZalohu } = await import('../src/core/csv.js')
const { rozpoznejSouradnice, pridejBod, vsechnyBody, DRUHY } =
  await import('../src/views/plan/body.js')

const barvy = process.stdout.isTTY && !process.env.NO_COLOR
const zeleny = (s) => (barvy ? `\x1b[32m${s}\x1b[0m` : s)
const cerveny = (s) => (barvy ? `\x1b[31m${s}\x1b[0m` : s)

let ok = 0
let chyb = 0

/** @param {string} popis @param {boolean} podminka */
function t(popis, podminka) {
  if (podminka) {
    ok++
    console.log(`  ${zeleny('ok   ')} ${popis}`)
  } else {
    chyb++
    console.log(`  ${cerveny('CHYBA')} ${popis}`)
  }
}

/** Nastaví výchozí stav storu pro jednu zkoušku. */
function priprav(plan, planDny) {
  store.plan = [...plan]
  store.planDny = [...planDny]
  store.notes = {}
  store.stav = {}
  store.rating = {}
  store.prio = {}
}

const jako = (x) => JSON.stringify(x)

console.log('Dělení plánu na dny\n')

priprav(['a', 'b', 'c', 'd', 'e'], [])
t('bez planDny je všechno jeden den', jako(dnyPlanu()) === jako([['a', 'b', 'c', 'd', 'e']]))

priprav(['a', 'b', 'c', 'd', 'e'], [2, 3])
t('planDny [2,3] rozdělí správně', jako(dnyPlanu()) === jako([['a', 'b'], ['c', 'd', 'e']]))

priprav(['a', 'b', 'c', 'd', 'e'], [2, 9])
t('planDny slibují víc, než v plánu je – nic se neztratí', dnyPlanu().flat().length === 5)

priprav(['a', 'b', 'c', 'd', 'e'], [1])
t('planDny pokrývají míň – zbytek padne do posledního dne', dnyPlanu().flat().length === 5)

priprav(['a', 'b', 'c', 'd', 'e'], [0, -3, 2])
t('nesmyslné délky se přeskočí', dnyPlanu().flat().length === 5)

priprav(['a', 'b', 'c', 'd', 'e'], [2, 9])
{
  const pred = jako(store.planDny)
  dnyPlanu()
  t('čtení nikdy nezapisuje', jako(store.planDny) === pred)
}

priprav(['a', 'b', 'c', 'd', 'e'], [2, 3])
presunDoDne('c', -1)
t('přesun o den zpět zachová všech pět zastávek', store.plan.length === 5 && dnyPlanu().flat().length === 5)
t('přesun o den zpět sedí', jako(dnyPlanu()) === jako([['a', 'b', 'c'], ['d', 'e']]))

priprav(['a', 'b', 'c', 'd', 'e'], [2, 3])
presunDoDne('b', 1)
t('přesun o den dál zachová všech pět zastávek', dnyPlanu().flat().length === 5)

priprav(['a', 'b', 'c'], [1, 2])
presunDoDne('a', -1)
t('přesun za první den nic neudělá', jako(dnyPlanu()) === jako([['a'], ['b', 'c']]))

priprav(['a', 'b', 'c', 'd', 'e'], [2, 3])
{
  const z = JSON.parse(JSON.stringify(zalohaData(store, {}, {})))
  priprav([], [])
  obnovZalohu(store, z, {}, {})
  t('záloha nese planDny', jako(store.planDny) === jako([2, 3]))
  t('obnova vrátí dny i zastávky', jako(dnyPlanu()) === jako([['a', 'b'], ['c', 'd', 'e']]))
}

priprav(['a', 'b', 'c'], [1, 2])
obnovZalohu(store, { plan: ['x', 'y'] }, {}, {})
t('stará záloha bez planDny nespadne', store.plan.length === 2 && dnyPlanu().flat().length === 2)

priprav(['a', 'b', 'c'], [1, 2])
zrusDny()
t('zrušení dnů zachová zastávky i pořadí', jako(store.plan) === jako(['a', 'b', 'c']) && store.planDny.length === 0)

/* ================= výpravy ================= */

// Stejná past jako u dnů, jen o patro výš: přepnutí výpravy sahá na `plan`
// i `planDny` naráz. Kdyby se aktivní výprava někam neodložila, zastávky by
// zmizely tiše a nevratně – uživatel by to poznal, až by se chtěl vrátit.
console.log('\nVýpravy\n')

const { seznamVyprav, prepniVypravu, novaVyprava, smazAktivniVypravu, BEZ_NAZVU } = await import(
  '../src/views/plan/vypravy.js'
)
const { pridejPozici } = await import('../src/core/pozice.js')
const { souradniceBodu, maBod, pridejStartCil, serazenaTrasa, serazenePolozky, bodyVKosiku } =
  await import('../src/views/plan/body.js')
const { vyjed, pridejDoCesty, vynechZCesty, cestaZmenena, zaznamCesty } = await import('../src/views/plan/cestaData.js')
const { CESTY } = await import('../src/core/cesty.js')
const { otiskBodu, pocetOdkazuNaPozici } = await import('../src/views/plan/routing.js')

/** Nastaví stav včetně odložených výprav. */
function pripravV(plan, planDny, vypravy, nazev) {
  priprav(plan, planDny)
  store.vypravy = JSON.parse(JSON.stringify(vypravy))
  store.vypravaNazev = nazev
}

/** Všechny zastávky napříč aktivní i odloženými výpravami, seřazené. */
const vsechnyZastavky = () =>
  [...store.plan, ...store.vypravy.flatMap((v) => v.plan)].sort().join(',')

pripravV(['a', 'b'], [], [], '')
t('bez klíče `vypravy` je jedna výprava beze jména', seznamVyprav().length === 1 && seznamVyprav()[0].nazev === BEZ_NAZVU)

pripravV(['a', 'b', 'c'], [2, 1], [{ nazev: 'Dolomity', plan: ['d', 'e'], planDny: [] }], 'Alpy')
{
  const pred = vsechnyZastavky()
  prepniVypravu(0)
  t('přepnutí nahraje vybranou výpravu', jako(store.plan) === jako(['d', 'e']) && store.vypravaNazev === 'Dolomity')
  t('přepnutí odloží tu předchozí', jako(store.vypravy[0].plan) === jako(['a', 'b', 'c']))
  t('přepnutí odloží i její dny', jako(store.vypravy[0].planDny) === jako([2, 1]))
  t('přepnutím se neztratí ani jedna zastávka', vsechnyZastavky() === pred)
  t('dny se přepnutím přenesly správně', jako(dnyPlanu()) === jako([['d', 'e']]))
}

pripravV(['a', 'b', 'c'], [2, 1], [{ nazev: 'Dolomity', plan: ['d'], planDny: [] }], 'Alpy')
{
  const pred = vsechnyZastavky()
  prepniVypravu(0)
  prepniVypravu(0)
  t('přepnutí tam a zpět vrátí přesně původní stav', jako(store.plan) === jako(['a', 'b', 'c']))
  t('přepnutí tam a zpět vrátí i dny', jako(store.planDny) === jako([2, 1]))
  t('přepnutí tam a zpět nic neztratí', vsechnyZastavky() === pred)
}

pripravV(['a', 'b'], [1, 1], [], 'Alpy')
{
  novaVyprava('Norsko')
  t('nová výprava začíná prázdná', store.plan.length === 0 && store.planDny.length === 0)
  t('nová výprava odloží tu předchozí i s dny', jako(store.vypravy[0].plan) === jako(['a', 'b']) && jako(store.vypravy[0].planDny) === jako([1, 1]))
  t('nová výprava má svůj název', store.vypravaNazev === 'Norsko')
}

pripravV([], [], [], '')
novaVyprava('Prázdná')
t('prázdná aktivní výprava se neodkládá', store.vypravy.length === 0)

pripravV(['a'], [], [{ nazev: 'Dolomity', plan: ['d', 'e'], planDny: [1, 1] }], 'Alpy')
{
  smazAktivniVypravu()
  t('smazání aktivní nahraje první odloženou', jako(store.plan) === jako(['d', 'e']) && store.vypravaNazev === 'Dolomity')
  t('smazání aktivní přenese i její dny', jako(store.planDny) === jako([1, 1]))
  t('smazaná výprava zmizí ze seznamu', store.vypravy.length === 0)
}

pripravV(['a', 'b'], [1, 1], [{ nazev: 'Dolomity', plan: ['d'], planDny: [] }], 'Alpy')
{
  const z = JSON.parse(JSON.stringify(zalohaData(store, {}, {})))
  pripravV([], [], [], '')
  obnovZalohu(store, z, {}, {})
  t('záloha nese odložené výpravy', store.vypravy.length === 1 && jako(store.vypravy[0].plan) === jako(['d']))
  t('záloha nese název aktivní výpravy', store.vypravaNazev === 'Alpy')
  t('obnova vrátí aktivní plán i dny', jako(store.plan) === jako(['a', 'b']) && jako(store.planDny) === jako([1, 1]))
}

pripravV(['a', 'b'], [], [{ nazev: 'X', plan: ['c'], planDny: [] }], 'Alpy')
obnovZalohu(store, { plan: ['x', 'y'] }, {}, {})
t('stará záloha bez výprav je nesmaže', store.vypravy.length === 1 && jako(store.plan) === jako(['x', 'y']))

/* ================= složky výprav ================= */
/* Složka je štítek na záznamu, ne mapa podle názvu – přejmenování výpravy ji
 * nesmí shodit a přepnutí výpravy ji musí odnést i přinést. */

console.log('\nSložky výprav\n')

const { seznamSlozek, novaSlozka, prejmenujSlozku, smazSlozku, presunVypravu, prejmenuj, smaz, duplikuj } =
  await import('../src/views/plan/vypravy.js')
const { prefs } = await import('../src/core/store.js')

/** Nastaví stav včetně složek. */
function pripravS(plan, vypravy, nazev, slozky, vypravaSlozka) {
  pripravV(plan, [], vypravy, nazev)
  store.slozky = [...slozky]
  store.vypravaSlozka = vypravaSlozka
  store.bloky = {}
}

pripravS([], [], '', [], '')
t('fantom: čerstvý uživatel nemá žádnou výpravu', seznamVyprav().length === 0)

pripravS([], [{ nazev: 'X', plan: ['a'], planDny: [] }], '', [], '')
t('prázdná bezejmenná vedle odložených fantom není', seznamVyprav().length === 2)

pripravS(['a'], [{ nazev: 'Dolomity', plan: ['d'], planDny: [], slozka: '' }], 'Alpy', ['Léto'], 'Léto')
{
  prepniVypravu(0)
  t('složka odejde s odloženou výpravou', store.vypravy[0].slozka === 'Léto')
  t('složka přijde s aktivovanou výpravou', store.vypravaSlozka === '')
  prepniVypravu(0)
  t('přepnutí tam a zpět vrátí i složku', store.vypravaSlozka === 'Léto' && store.vypravy[0].slozka === '')
}

pripravS(['a'], [{ nazev: 'B', plan: ['b'], planDny: [], slozka: 'Zima' }, { nazev: 'C', plan: ['c'], planDny: [] }], 'Alpy', ['Léto', 'Zima', 'Prázdná'], 'Léto')
{
  const sk = seznamSlozek()
  t('seznamSlozek drží pořadí a nezařazené dává nakonec',
    jako(sk.map((s) => s.slozka)) === jako(['Léto', 'Zima', 'Prázdná', '']))
  t('prázdná složka je vidět', sk[2].vypravy.length === 0)
  t('výpravy padly do svých složek', sk[0].vypravy[0].nazev === 'Alpy' && sk[1].vypravy[0].nazev === 'B' && sk[3].vypravy[0].nazev === 'C')
}

pripravS(['a'], [{ nazev: 'B', plan: ['b'], planDny: [], slozka: 'Ztracená' }], 'Alpy', [], '')
t('záznam se složkou, která neexistuje, spadne mezi nezařazené',
  seznamSlozek().length === 1 && seznamSlozek()[0].vypravy.length === 2)

pripravS(['a'], [{ nazev: 'B', plan: ['b'], planDny: [] }], 'Alpy', [], '')
{
  novaSlozka('Léto')
  novaSlozka('Léto')
  t('nová složka vznikne jen jednou', jako(store.slozky) === jako(['Léto']))
  presunVypravu(-1, 'Léto')
  presunVypravu(0, 'Podzim')
  t('přesun zařadí aktivní i odloženou', store.vypravaSlozka === 'Léto' && store.vypravy[0].slozka === 'Podzim')
  t('přesun do neznámé složky ji založí', jako(store.slozky) === jako(['Léto', 'Podzim']))
  prejmenujSlozku('Léto', 'Jaro')
  t('přejmenování složky vezme záznamy s sebou', store.vypravaSlozka === 'Jaro' && store.slozky.includes('Jaro') && !store.slozky.includes('Léto'))
  const mist = seznamVyprav().length
  smazSlozku('Podzim')
  t('smazání složky nesmaže výpravu', seznamVyprav().length === mist && store.vypravy[0].slozka === '')
}

pripravS(['a'], [{ nazev: 'B', plan: ['b'], planDny: [] }], 'Alpy', [], '')
{
  store.bloky = { Alpy: [{ typ: 'poznamka', text: 'x' }], B: [{ typ: 'seznam' }] }
  prejmenuj(-1, 'Tatry')
  t('přejmenování aktivní přestěhuje bloky', (store.bloky.Tatry || []).length === 1 && !store.bloky.Alpy)
  prejmenuj(0, 'Tatry')
  t('přejmenování odložené bloky slije, nic nesmaže', (store.bloky.Tatry || []).length === 2 && !store.bloky.B)
  t('odložená má nový název', store.vypravy[0].nazev === 'Tatry')
}

pripravS(['a'], [{ nazev: 'B', plan: ['b'], planDny: [], slozka: 'Zima' }, { nazev: 'C', plan: ['c'], planDny: [] }], 'Alpy', ['Zima'], '')
{
  smaz(1)
  t('smazání odložené nechá ostatní být', seznamVyprav().length === 2 && store.vypravy[0].nazev === 'B')
  smaz(-1)
  t('za smazanou aktivní nastoupí odložená i se složkou', store.vypravaNazev === 'B' && store.vypravaSlozka === 'Zima')
}

pripravS(['a'], [{ nazev: 'B', plan: ['b'], planDny: [], slozka: 'Zima' }], 'Alpy', ['Léto', 'Zima'], 'Léto')
{
  const z = JSON.parse(JSON.stringify(zalohaData(store, {}, {})))
  pripravS([], [], '', [], '')
  obnovZalohu(store, z, {}, {})
  t('záloha nese složky i zařazení', jako(store.slozky) === jako(['Léto', 'Zima']) && store.vypravaSlozka === 'Léto' && store.vypravy[0].slozka === 'Zima')
}

pripravS(['a'], [], 'Alpy', ['Léto'], 'Léto')
obnovZalohu(store, { plan: ['x'] }, {}, {})
t('stará záloha bez složek je nesmaže', jako(store.slozky) === jako(['Léto']) && store.vypravaSlozka === 'Léto')

/* ================= duplikace, čas vzniku a řazení ================= */

console.log('\nDuplikace, čas vzniku a řazení\n')

pripravS(['a'], [{ nazev: 'B', plan: ['b'], planDny: [] }], 'Alpy', [], '')
{
  store.vypravaVytvoreno = 111
  store.bloky = { Alpy: [{ typ: 'poznamka', text: 'x' }] }
  const novy = duplikuj(-1)
  t('kopie má unikátní název', novy === 'Alpy (kopie)' && store.vypravy.some((v) => v.nazev === novy))
  const kopie = store.vypravy.find((v) => v.nazev === novy)
  t('kopie nese zastávky i bloky', jako(kopie.plan) === jako(['a']) && (store.bloky[novy] || []).length === 1)
  store.bloky[novy][0].text = 'zmena'
  t('bloky kopie jsou nezávislé na originálu', store.bloky.Alpy[0].text === 'x')
  const druhy = duplikuj(-1)
  t('druhá kopie nekoliduje jménem', druhy === 'Alpy (kopie 2)')
}

pripravS(['a'], [{ nazev: 'B', plan: ['b'], planDny: [], vytvoreno: 222 }], 'Alpy', [], '')
{
  store.vypravaVytvoreno = 111
  prepniVypravu(0)
  t('čas vzniku odejde s odloženou i přijde s aktivovanou',
    store.vypravaVytvoreno === 222 && store.vypravy[0].vytvoreno === 111)
  const z = JSON.parse(JSON.stringify(zalohaData(store, {}, {})))
  store.vypravaVytvoreno = 0
  obnovZalohu(store, z, {}, {})
  t('záloha nese čas vzniku aktivní výpravy', store.vypravaVytvoreno === 222)
}

pripravS(['x'], [
  { nazev: 'Zeta', plan: ['a', 'b'], planDny: [], vytvoreno: 300 },
  { nazev: 'Alfa', plan: ['c'], planDny: [], vytvoreno: 100 },
], 'Méty', [], '')
{
  store.vypravaVytvoreno = 200
  const nazvy = () => seznamSlozek()[0].vypravy.map((v) => v.nazev).join(',')
  prefs.razeniVyprav = 'abecedne'
  t('řazení abecedně', nazvy() === 'Alfa,Méty,Zeta')
  prefs.razeniVyprav = 'nejnovejsi'
  t('řazení podle času vzniku', nazvy() === 'Zeta,Méty,Alfa')
  prefs.razeniVyprav = 'zastavky'
  t('řazení podle počtu zastávek', nazvy() === 'Zeta,Méty,Alfa' || nazvy() === 'Zeta,Alfa,Méty')
  prefs.razeniVyprav = 'zadne'
  t('bez řazení drží pořadí pole', nazvy() === 'Méty,Zeta,Alfa')
  delete prefs.razeniVyprav
  t('řazení je jen zobrazení – data v poli se nehýbají',
    jako(store.vypravy.map((v) => v.nazev)) === jako(['Zeta', 'Alfa']))
}

/* ================= záloha cest, bloků a achievementů ================= */
/* Srpen 2026: bez těchhle klíčů by obnova na jiném telefonu tiše zahodila
 * archiv cest, zaškrtávací seznamy i získané achievementy. */

console.log('\nZáloha cest, bloků a achievementů\n')

pripravV(['a'], [], [], 'Alpy')
{
  store.cesta = null
  // Archiv se od srpna 2026 bere ze zrcadla v paměti (`core/cesty.js`),
  // ne ze `store` – v localStorage už nebydlí.
  CESTY.length = 0
  CESTY.push({ nazev: 'Léto', zacatek: 100, konec: 200, zastavky: ['a'], dny: [1] })
  store.cesty = []
  store.bloky = { Alpy: [{ typ: 'poznamka', text: 'ahoj' }] }
  store.achievementy = { 'prvni-misto': 1 }
  const z = JSON.parse(JSON.stringify(zalohaData(store, {}, {})))
  CESTY.length = 0
  store.cesty = []
  store.bloky = {}
  store.achievementy = {}
  obnovZalohu(store, z, {}, {})
  t('záloha nese archiv cest', store.cesty.length === 1 && store.cesty[0].nazev === 'Léto')
  t('záloha nese bloky', (store.bloky.Alpy || []).length === 1)
  t('záloha nese achievementy', !!store.achievementy['prvni-misto'])
  obnovZalohu(store, z, {}, {})
  t('dvakrát obnovená záloha nezdvojí archiv', store.cesty.length === 1)
}

/* Úklid po smazané výpravě.
 *
 * Do srpna 2026 se `bloky`, `kosik` a `kotvy` smazané výpravy nechávaly ležet
 * („osiřelý klíč nikomu nevadí"). Vadil: nikdy je nic neuklidilo, takže to
 * bylo jediné místo v celém úložišti, které rostlo bez horní meze. */
{
  pripravV(['a'], [], [{ nazev: 'Dolomity', plan: ['d'], planDny: [] }], 'Alpy')
  store.bloky = { Alpy: [{ typ: 'poznamka', text: 'k Alpám' }], Dolomity: [{ typ: 'poznamka', text: 'k Dolomitům' }] }
  store.kosik = { Alpy: ['x'], Dolomity: ['y'] }
  store.kotvy = { Alpy: [{ id: 'x', odeDne: 1, doDne: 2 }], Dolomity: [] }

  smaz(0)
  t('smazaná odložená výprava po sobě uklidí bloky', !store.bloky.Dolomity)
  t('ani košík', !store.kosik.Dolomity)
  t('ani kotvy', !store.kotvy.Dolomity)
  t('cizí výpravě se přitom nesáhlo na nic', (store.bloky.Alpy || []).length === 1 && jako(store.kosik.Alpy) === jako(['x']))
}

{
  // Aktivní výprava: úklid musí proběhnout AŽ po tom, co na její místo
  // nastoupí jiná – jinak by se mazaný název ještě našel jako aktivní.
  pripravV(['a'], [], [{ nazev: 'Dolomity', plan: ['d'], planDny: [] }], 'Alpy')
  store.bloky = { Alpy: [{ typ: 'poznamka', text: 'k Alpám' }], Dolomity: [{ typ: 'poznamka', text: 'k Dolomitům' }] }
  store.kosik = { Alpy: ['x'], Dolomity: ['y'] }
  smaz(-1)
  t('smazaná aktivní výprava po sobě uklidí taky', !store.bloky.Alpy && !store.kosik.Alpy)
  t('a nástupci zůstane všechno', (store.bloky.Dolomity || []).length === 1 && jako(store.kosik.Dolomity) === jako(['y']))
}

{
  // Původní důvod pro neúklid platí dál: stejnojmenná výprava o svoje data
  // přijít nesmí. Proto se uklízí jen tehdy, když název v seznamu zmizel.
  pripravV(['a'], [], [{ nazev: 'Alpy', plan: ['d'], planDny: [] }], 'Alpy')
  store.bloky = { Alpy: [{ typ: 'poznamka', text: 'sdílené' }] }
  smaz(0)
  t('stejnojmenné výpravě se bloky nesmažou', (store.bloky.Alpy || []).length === 1)
}

/* Košík, kotvy a termín v záloze.
 *
 * Do srpna 2026 v ní nebyly, přestože `duplikuj()` i `prestehujBloky()`
 * s košíkem a kotvami zacházejí jako s plnohodnotnými daty výpravy. Obnova
 * na jiném telefonu tedy tiše zahodila celý wishlist a všechny termínové
 * kotvy – a poznalo by se to až tím, že by někomu chybělo, co si nasbíral. */
{
  pripravV(['a'], [], [], 'Alpy')
  store.kosik = { Alpy: ['b', 'c'] }
  store.kotvy = { Alpy: [{ id: 'b', odeDne: 2, doDne: 4 }] }
  store.vypravaOd = '2026-09-01'
  store.vypravaDnu = 7
  const z = JSON.parse(JSON.stringify(zalohaData(store, {}, {})))
  store.kosik = {}
  store.kotvy = {}
  store.vypravaOd = ''
  store.vypravaDnu = 0
  obnovZalohu(store, z, {}, {})
  t('záloha nese košík', jako(store.kosik.Alpy) === jako(['b', 'c']))
  t('záloha nese kotvy', (store.kotvy.Alpy || []).length === 1 && store.kotvy.Alpy[0].odeDne === 2)
  t('záloha nese datum vyjetí', store.vypravaOd === '2026-09-01')
  t('záloha nese počet dní', store.vypravaDnu === 7)
  // Starší záloha tyhle klíče nemá – nesmí kvůli tomu spadnout ani vynulovat,
  // co je v telefonu.
  obnovZalohu(store, { plan: ['a'] }, {}, {})
  t('stará záloha bez košíku ho nevynuluje', jako(store.kosik.Alpy) === jako(['b', 'c']))
  t('stará záloha bez termínu ho nevynuluje', store.vypravaOd === '2026-09-01')
}

/* Ukončená cesta si nese rozdělení na dny.
 *
 * `ukonciCestu()` je do srpna 2026 do archivu nezapisovala, přestože je cesta
 * po celou dobu přepočítávala. Zamčený itinerář pak hodil celou cestu pod
 * jeden den – rozdělení se ztratilo přesně ve chvíli, kdy se stalo vzpomínkou. */
{
  pripravV(['a', 'b', 'c'], [], [], 'Alpy')
  store.cesty = []
  store.cesta = {
    nazev: 'Alpy',
    zacatek: 1000,
    zastavky: ['a', 'b', 'c'],
    puvodni: ['a', 'b', 'c'],
    dny: [2, 1],
    pauzy: [],
    pauzaOd: null,
    odznacene: {},
    poznamky: {},
    poznamka: '',
    ziskane: [],
  }
  const zaznam = zaznamCesty(store.cesta)
  t('archiv si nese délky dnů', jako(zaznam.dny) === jako([2, 1]))
  t('a nespadne na jeden den', zaznam.dny.length === 2)
  t('a nese i zastávky a otisk plánu', jako(zaznam.zastavky) === jako(['a', 'b', 'c']) && jako(zaznam.puvodni) === jako(['a', 'b', 'c']))
}

{
  store.cesta = { nazev: 'Teď', zacatek: 5 }
  obnovZalohu(store, { cesta: { nazev: 'Stará', zacatek: 1 } }, {}, {})
  t('rozjetou cestu v telefonu záloha nezaklepne', store.cesta.nazev === 'Teď')
  store.cesta = null
  obnovZalohu(store, { cesta: { nazev: 'Stará', zacatek: 1 } }, {}, {})
  t('bez rozjeté cesty se cesta ze zálohy převezme', store.cesta.nazev === 'Stará')
  store.cesta = null
}

{
  store.cesty = [{ nazev: 'Léto', zacatek: 100 }]
  store.bloky = { Alpy: [{ typ: 'poznamka' }] }
  obnovZalohu(store, { plan: ['x'] }, {}, {})
  t('stará záloha bez nových klíčů je nesmaže', store.cesty.length === 1 && (store.bloky.Alpy || []).length === 1)
}

/* ================= prázdné dny a přidání dne ================= */
/* Od srpna 2026 je nula platná délka dne. Dřív se prázdný den nedal ani
 * zapsat (uloz ho filtroval) a „Přidat den" bylo od druhého kliknutí tiché
 * nic – přesně když poslední den zbyl s jedinou zastávkou. */

console.log('\nPrázdné dny a přidání dne:')

priprav(['a', 'b', 'c'], [2, 1])
{
  pridejDen()
  t('přidání dne přidá prázdný den', jako(store.planDny) === jako([2, 1, 0]))
  t('prázdný den je vidět v rozdělení', jako(dnyPlanu()) === jako([['a', 'b'], ['c'], []]))
  pridejDen()
  t('jde přidat i druhý prázdný den', jako(store.planDny) === jako([2, 1, 0, 0]))
  t('žádná zastávka se nepřidáním neztratila', dnyPlanu().flat().length === 3)
}

priprav(['a'], [])
{
  pridejDen()
  t('den jde přidat i k jediné zastávce', jako(dnyPlanu()) === jako([['a'], []]))
}

priprav(['a', 'b'], [1, 1, 0])
{
  presunDoDne('b', 1)
  t('šipka přesune zastávku do prázdného dne', jako(dnyPlanu()) === jako([['a'], [], ['b']]))
  presunDoDne('a', 1)
  t('vyprázdněný den zůstává', jako(dnyPlanu()) === jako([[], ['a'], ['b']]))
}

{
  priprav(['a', 'b', 'c', 'd'], [])
  t('nastavDny zapíše sedící rozdělení', nastavDny([2, 2]) && jako(store.planDny) === jako([2, 2]))
  const predtim = jako(store.planDny)
  t('nastavDny odmítne nesedící součet', nastavDny([2, 5]) === false && jako(store.planDny) === predtim)
  t('nastavDny snese prázdný den', nastavDny([2, 0, 2]) && jako(dnyPlanu()) === jako([['a', 'b'], [], ['c', 'd']]))
  t('žádná zastávka se dělením neztratila', jako(dnyPlanu().flat()) === jako(store.plan))
}

/* ================= přesun zastávky tažením (BUGS.md B4) ================= */
/* Tažení v itineráři do srpna 2026 přeskládalo jen `store.plan` a `planDny`
 * nechalo být – `dnyPlanu()` pak plán rozřezal podle starých délek a vypadalo
 * to, že se zastávky prohodily. `presunZastavku()` zapisuje obojí. */

console.log('\nPřesun zastávky mezi dny (tažení):')

priprav(['a', 'b'], [1, 1])
{
  t('přesun do dne s jednou zastávkou se neprohodí', presunZastavku('b', 1, 'a') && jako(dnyPlanu()) === jako([['a', 'b'], []]))
  t('pořadí v plánu sedí na dny', jako(store.plan) === jako(['a', 'b']))
  t('délky dnů se opravdu zapsaly', jako(store.planDny) === jako([2, 0]))
}

priprav(['a', 'b'], [2, 0])
{
  t('poslední zastávka jde do prázdného dne pod ní', presunZastavku('b', 2) && jako(dnyPlanu()) === jako([['a'], ['b']]))
}

priprav(['a', 'b', 'c'], [1, 1, 1])
{
  t('přesun přes dva dny zpět', presunZastavku('c', 1, 'a') && jako(dnyPlanu()) === jako([['a', 'c'], ['b'], []]))
  t('všechny zastávky zůstaly', dnyPlanu().flat().length === 3)
}

priprav(['a', 'b', 'c'], [3])
{
  t('bez kotvy jde zastávka na začátek dne', presunZastavku('c', 1) && jako(dnyPlanu()) === jako([['c', 'a', 'b']]))
}

priprav(['a', 'b'], [1, 1])
{
  t('kotva z cizího dne se ignoruje', presunZastavku('a', 2, 'a') && jako(dnyPlanu()) === jako([[], ['a', 'b']]))
}

priprav(['a', 'b'], [1, 1])
{
  t('puštění na místě nic nezapisuje', presunZastavku('b', 2) === false)
  t('neznámé id nic neudělá', presunZastavku('zzz', 1) === false)
}

priprav(['a', 'b', 'c'], [1, 1, 1])
{
  // Den mimo rozsah se ořízne na poslední existující, ne na jedničku –
  // prst pod posledním dnem míří tam, ne na začátek plánu.
  t('den nad rozsah spadne do posledního', presunZastavku('a', 99) && jako(dnyPlanu()) === jako([[], ['b'], ['a', 'c']]))
  t('den pod rozsah spadne do prvního', presunZastavku('c', 0) && jako(dnyPlanu()) === jako([['c'], ['b'], ['a']]))
}

/* ================= body trasy (bloky typu misto) ================= */
/* Srpen 2026: vlastní místo je plnohodnotný bod trasy s polem `druh`
 * a kotvou `po` (id zastávky, hned ZA kterou stojí). Historické bloky bez
 * těchhle polí (po i den prázdné) musí zůstat na konci plánu, jinak by se
 * po aktualizaci tiše přesunuly. */

console.log('\nBody trasy (bloky misto)\n')

t('Google Maps @lat,lon', (() => {
  const g = rozpoznejSouradnice('https://www.google.com/maps/@50.0755,14.4378,12z')
  return g && Math.abs(g.lat - 50.0755) < 1e-4 && Math.abs(g.lon - 14.4378) < 1e-4
})())

t('Mapy.cz x je délka, y je šířka', (() => {
  const g = rozpoznejSouradnice('https://mapy.cz/turisticka?x=14.4378&y=50.0755')
  return g && Math.abs(g.lat - 50.0755) < 1e-4 && Math.abs(g.lon - 14.4378) < 1e-4
})())

t('DMS se znaménkem podle S/W', (() => {
  const g = rozpoznejSouradnice(`50°5'12.3"N 14°25'8"E`)
  return g && Math.abs(g.lat - 50.0868) < 1e-3 && Math.abs(g.lon - 14.4189) < 1e-3
})())

t('nesmyslný text nedá souřadnice', rozpoznejSouradnice('někde v horách') === null)

t('druhy bodu mají čtyři položky', Object.keys(DRUHY).join(',') === 'start,nocleh,cil,vlastni')

priprav(['a', 'b', 'c'], [2, 1])
{
  store.vypravaNazev = 'Zkouška bodů'
  store.bloky = {}
  const id1 = pridejBod({ druh: 'start', nazev: 'PoznatelnyStart', lat: 50, lon: 14, po: 'a' })
  const id2 = pridejBod({ druh: 'nocleh', nazev: 'Nocleh', den: 2, po: null })
  const id3 = pridejBod({ druh: 'vlastni', nazev: 'Historický', po: null, den: null })
  t('bod za zastávkou má den null', vsechnyBody().find((b) => b.id === id1).den === null)
  t('bod na začátek dne má po null', vsechnyBody().find((b) => b.id === id2).po === null)
  t('historický bod (bez po i dne) je vidět jen v den:null', vsechnyBody().find((b) => b.id === id3).po == null && vsechnyBody().find((b) => b.id === id3).den == null)
  t('id bodů jsou unikátní', new Set([id1, id2, id3]).size === 3)
  // blokyDneHtml() v bloky.js filtruje b.typ !== 'misto' – vykreslování se
  // testuje v prohlížeči (smoke.mjs), tenhle soubor je čistý Node bez IC.
  t('vsechnyBody vrací jen typ misto', vsechnyBody().every((b) => b.typ === 'misto'))
}

console.log('\nUložené pozice a start/cíl (srpen 2026)\n')

priprav(['a', 'b'], [])
{
  store.vypravaNazev = 'Zkouška start/cíl'
  store.bloky = {}
  store.ulozenePozice = []
  const pozId = pridejPozici({ nazev: 'Domov', lat: 50.1, lon: 14.1 })

  t('start jde založit z uložené pozice', (() => {
    const id = pridejStartCil('start', { nazev: 'Start', zdroj: { typ: 'pozice', id: pozId } })
    const b = vsechnyBody().find((x) => x.id === id)
    return b && b.den === 1 && b.po === null
  })())

  t('souradniceBodu dotáhne živou hodnotu pozice, ne zastaralou kopii', (() => {
    const b = vsechnyBody().find((x) => x.zdroj && x.zdroj.typ === 'pozice')
    const s1 = souradniceBodu(b)
    const p = store.ulozenePozice.find((x) => x.id === pozId)
    p.lat = 51.5
    const s2 = souradniceBodu(b)
    return s1.lat === 50.1 && s2.lat === 51.5
  })())

  t('maBod pozná existující start', maBod('start') === true)
  t('maBod nehlásí cíl, který ještě není', maBod('cil') === false)
  t('pridejStartCil odmítne druhý start (pojistka)', pridejStartCil('start', { nazev: 'Další start' }) === null)

  t('cíl se zakládá na konec plánu (po i den null)', (() => {
    const id = pridejStartCil('cil', { nazev: 'Cíl', lat: 48, lon: 16 })
    const b = vsechnyBody().find((x) => x.id === id)
    return b.po === null && b.den === null
  })())

  t('pocetOdkazuNaPozici počítá napříč store.bloky', pocetOdkazuNaPozici(pozId) === 1)

  store.ulozenePozice = store.ulozenePozice.filter((x) => x.id !== pozId)
  t('souradniceBodu vrací null po smazání odkazované pozice', (() => {
    const b = vsechnyBody().find((x) => x.zdroj && x.zdroj.typ === 'pozice')
    return souradniceBodu(b) === null
  })())
}

console.log('\nSeřazená trasa pro Routing API (srpen 2026)\n')

priprav(['x', 'y'], [])
{
  store.vypravaNazev = 'Zkouška trasy'
  store.bloky = {}
  store.ulozenePozice = []
  S.byId = { x: { id: 'x', lat: 50, lon: 14 }, y: { id: 'y', lat: 48, lon: 16 } }
  const idStart = pridejStartCil('start', { nazev: 'Start', lat: 49, lon: 13 })
  const idCil = pridejStartCil('cil', { nazev: 'Cíl', lat: 47, lon: 17 })
  const trasa = serazenaTrasa()
  t('trasa má start na začátku', trasa[0].id === idStart)
  t('trasa má cíl na konci', trasa[trasa.length - 1].id === idCil)
  t('zastávky jsou mezi start a cíl v pořadí store.plan', trasa[1].id === 'x' && trasa[2].id === 'y')
  t('trasa má 4 body (start, 2 zastávky, cíl)', trasa.length === 4)

  // Bod bez rozpoznatelné polohy (zatím bez polohy) se do trasy nepočítá.
  const idBezPolohy = pridejBod({ druh: 'vlastni', nazev: 'Bez polohy', po: 'x' })
  t('bod bez polohy se v serazenaTrasa() přeskočí', serazenaTrasa().length === 4)

  // `serazenePolozky()` je opak: kreslí se z ní, takže bod bez polohy vidět
  // MÁ – „doplním, až budu vědět" je platný stav. `serazenaTrasa()` je od
  // srpna 2026 jen její mapování, takže se pořadí počítá na jednom místě.
  const polozky = serazenePolozky()
  t('serazenePolozky vrací i bod bez polohy', polozky.length === 5)
  t('serazenePolozky rozlišují zastávku a bod',
    polozky.filter((x) => x.typ === 'zastavka').length === 2 && polozky.filter((x) => x.typ === 'bod').length === 3)
  t('bod bez polohy stojí za svou kotvou', (() => {
    const i = polozky.findIndex((x) => x.b && x.b.id === idBezPolohy)
    return i > 0 && polozky[i - 1].typ === 'zastavka' && polozky[i - 1].p.id === 'x'
  })())
  t('každá položka ví, do kterého dne patří', polozky.every((x) => x.den >= 1))
}

console.log('\nÚpravy rozjeté cesty (srpen 2026)\n')

/* Cesta byla do teď zmrazený otisk – plán se dal upravovat, cesta ne.
 * Jenže právě to se na roadtripu dělá: večer se něco přidá a něco vynechá. */
{
  priprav(['a', 'b', 'c'], [2, 1])
  S.byId = {
    a: { id: 'a', n: 'A', lat: 50, lon: 14 },
    b: { id: 'b', n: 'B', lat: 49, lon: 15 },
    c: { id: 'c', n: 'C', lat: 48, lon: 16 },
    d: { id: 'd', n: 'D', lat: 47, lon: 17 },
  }
  store.vypravaNazev = 'Zkouška cesty'
  store.kosik = {}
  store.bloky = {}
  store.cesta = null

  t('vyjed() si uloží původní trasu', vyjed() && store.cesta.puvodni.join() === 'a,b,c')
  t('čerstvá cesta se od plánu neliší', cestaZmenena(store.cesta) === false)

  t('přidání jako další cíl jde na začátek', pridejDoCesty('d', 'dalsi') && store.cesta.zastavky.join() === 'd,a,b,c')
  t('délky dnů se přepočítaly', store.cesta.dny.reduce((x, y) => x + y, 0) === 4)
  t('změněná cesta se pozná', cestaZmenena(store.cesta))
  t('totéž místo podruhé neprojde', pridejDoCesty('d', 'dalsi') === false)

  t('vynechání zastávku odebere', vynechZCesty('a') && store.cesta.zastavky.join() === 'd,b,c')
  t('součet délek dnů pořád sedí',
    store.cesta.dny.reduce((x, y) => x + y, 0) === store.cesta.zastavky.length)
  t('vynechané se vrátilo do košíku', (store.kosik['Zkouška cesty'] || []).includes('a'))
  t('vynechání neznámého nic neudělá', vynechZCesty('zzz') === false)

  t('přidání do konkrétního dne', pridejDoCesty('a', 2) && store.cesta.zastavky.includes('a'))
  store.cesta = null
}

/* Trasa cesty vede i přes vlastní body – nocleh, start a cíl. Do srpna 2026
 * je otisk cesty vynechával (`map/planLine.js` je u otisku nekreslil a
 * `prepocitejOtiskCesty()` je proto neposílala do routingu), takže čára
 * vedla mimo místa, přes která se jede. */
{
  priprav(['a', 'b'], [])
  S.byId = { a: { id: 'a', n: 'A', lat: 50, lon: 14 }, b: { id: 'b', n: 'B', lat: 48, lon: 16 } }
  store.vypravaNazev = 'Cesta s noclehem'
  store.bloky = {}
  store.kosik = {}
  store.cesta = null
  const idNocleh = pridejBod({ druh: 'nocleh', nazev: 'Kemp', lat: 49, lon: 15, po: 'a' })
  vyjed()

  const trasa = serazenaTrasa(store.cesta.zastavky, store.cesta.dny, vsechnyBody(store.cesta.nazev))
  t('trasa cesty vede i přes vlastní bod', trasa.length === 3)
  t('nocleh stojí za svou zastávkou', trasa[1].id === idNocleh)
  t('bez bodů zůstanou jen zastávky', serazenaTrasa(store.cesta.zastavky, store.cesta.dny, []).length === 2)

  // Bod odložený do košíku do trasy nepatří – je to nápad, ne zastávka.
  const idVKosiku = pridejBod({ druh: 'vlastni', nazev: 'Nápad', lat: 47, lon: 17, vKosiku: true })
  t('bod v košíku se do trasy nepočítá',
    serazenaTrasa(store.cesta.zastavky, store.cesta.dny, vsechnyBody(store.cesta.nazev)).length === 3)
  t('a v seznamu bodů košíku je', bodyVKosiku().some((b) => b.id === idVKosiku))
  store.cesta = null
}

console.log('\nOtisk trasy a přepočet vázaný na výpravu (srpen 2026)\n')

t('otiskBodu je stejný pro stejné pořadí a polohu', (() => {
  const body = [{ id: 'x', lat: 50.1, lon: 14.1 }, { id: 'y', lat: 48.2, lon: 16.3 }]
  return otiskBodu(body) === otiskBodu(body.map((b) => ({ ...b })))
})())

t('otiskBodu se změní po posunu souřadnice', (() => {
  const a = [{ id: 'x', lat: 50.1, lon: 14.1 }]
  const b = [{ id: 'x', lat: 50.2, lon: 14.1 }]
  return otiskBodu(a) !== otiskBodu(b)
})())

t('otiskBodu se změní po přeřazení pořadí', (() => {
  const body = [{ id: 'x', lat: 50.1, lon: 14.1 }, { id: 'y', lat: 48.2, lon: 16.3 }]
  return otiskBodu(body) !== otiskBodu([...body].reverse())
})())

pripravV(['a', 'b'], [], [{ nazev: 'Dolomity', plan: ['d'], planDny: [] }], 'Alpy')
{
  store.aktivniPrepocet = { otisk: 'x', polyline: [[1, 2]], vzdalenostKm: 10, casMin: 20, spocitanoV: 1 }
  prepniVypravu(0)
  t('přepočet se přesune do odložené výpravy při přepnutí', store.vypravy[0].prepocet.otisk === 'x')
  t('přepočet aktivní výpravy je z cíle přepnutí (žádný zde)', store.aktivniPrepocet === null)
  prepniVypravu(0)
  t('přepočet se vrátí zpátky při opětovném přepnutí', store.aktivniPrepocet && store.aktivniPrepocet.otisk === 'x')
}

/* ---------- košík, kotva a zajížďka ---------- */
// Čistá logika bez DOM, proto se dá testovat tady. Vykreslení mapy košíku
// a koridoru se testuje v prohlížeči (smoke.mjs).
{
  const { S } = await import('../src/core/store.js')
  const {
    pridejDoKosiku, vyhodZKosiku, vKosiku, kosik, nastavKotvu, zrusKotvu,
    hlavniKotva, kotvaMista, zajizdka, kosikSeZajizdkou, KORIDOR_KM,
  } = await import('../src/views/plan/kosik.js')

  store.vypravaNazev = 'Zkouška košíku'
  store.kosik = {}
  store.kotvy = {}

  // Tři místa v řadě: A --- B --- C. B leží přesně mezi, takže zajížďka ~0.
  S.places = [
    { id: 'A', n: 'Ačko', k: 'Jezera', z: 'Rakousko', lat: 47.0, lon: 11.0 },
    { id: 'B', n: 'Bčko', k: 'Jezera', z: 'Rakousko', lat: 47.5, lon: 11.0 },
    { id: 'C', n: 'Cčko', k: 'Jezera', z: 'Itálie', lat: 48.0, lon: 11.0 },
    { id: 'D', n: 'Déčko', k: 'Hory a túry', z: 'Itálie', lat: 47.5, lon: 14.0 },
  ]
  S.byId = Object.fromEntries(S.places.map((p) => [p.id, p]))

  t('košík je zprvu prázdný', kosik().length === 0)
  pridejDoKosiku('B')
  t('místo se přidá', vKosiku('B'))
  pridejDoKosiku('B')
  t('duplicita se ignoruje', kosik().length === 1)
  pridejDoKosiku('C')
  pridejDoKosiku('D')
  vyhodZKosiku('C')
  t('místo jde vyhodit', !vKosiku('C') && kosik().length === 2)

  const a = S.byId.A
  const c = S.byId.C
  t('bod přesně na trase má zajížďku ~0', zajizdka(a, S.byId.B, c) < 0.5)
  t('bod stranou má zajížďku znatelnou', zajizdka(a, S.byId.D, c) > 100)
  t('zajížďka není nikdy záporná', zajizdka(a, c, c) >= 0)

  t('bez kotvy není hlavní kotva', hlavniKotva() === null)
  pridejDoKosiku('C')
  nastavKotvu('C', 3, 5)
  t('kotva se uloží s oknem dnů', kotvaMista('C').odeDne === 3 && kotvaMista('C').doDne === 5)
  nastavKotvu('C', 4, 6)
  t('stejné místo kotvu přepíše, nezdvojí', store.kotvy['Zkouška košíku'].length === 1)
  t('obrácené pořadí dnů se srovná', (nastavKotvu('C', 5, 2), kotvaMista('C').doDne >= kotvaMista('C').odeDne))

  nastavKotvu('B', 1, 2)
  t('hlavní kotva je ta nejbližší v čase', hlavniKotva().id === 'B')
  zrusKotvu('B')
  t('kotva jde zrušit', kotvaMista('B') == null && hlavniKotva().id === 'C')

  {
    const razeno = kosikSeZajizdkou(a)
    t('kotva je v seznamu první', razeno[0].kotva != null && razeno[0].p.id === 'C')
    t('kotva sama zajížďku nemá', razeno[0].zajizdka === null)
    const bcko = razeno.find((x) => x.p.id === 'B')
    const dcko = razeno.find((x) => x.p.id === 'D')
    t('místo na trase je v koridoru', bcko.vKoridoru === true)
    t('místo stranou v koridoru není', dcko.vKoridoru === false)
    t('koridor má rozumnou šířku', KORIDOR_KM > 0 && KORIDOR_KM < 200)
  }

  t('bez polohy se pořadí nesesype', kosikSeZajizdkou(null).length === 3)
}

/* ---------- termín cesty, kalendářní dny a „stíháme?" ---------- */
// Obojí je NEPOVINNÉ – prázdný termín je platný stav, ne nedodělek.
{
  const { termin, nastavTermin, datumDne, kratkeDatum, denVTydnu, stihameTo, pocasiPodleKodu } =
    await import('../src/views/plan/termin.js')

  store.vypravaNazev = 'Zkouška termínu'
  nastavTermin('', 0)
  t('prázdný termín je platný stav', termin().od === '' && termin().dnu === 0)
  t('bez termínu nemá den datum', datumDne(1) === '')

  nastavTermin('2026-08-12', 10)
  t('termín se uloží', termin().od === '2026-08-12' && termin().dnu === 10)
  t('první den je datum začátku', datumDne(1) === '2026-08-12')
  t('desátý den je o devět dnů dál', datumDne(10) === '2026-08-21')
  t('den 0 a míň nemá datum', datumDne(0) === '' && datumDne(-3) === '')

  // Přes UTC půlnoc, aby letní čas neposunul den o jedna.
  nastavTermin('2026-10-24', 5)
  t('přechod na zimní čas den neposune', datumDne(3) === '2026-10-26')

  nastavTermin('2026-08-12', 10)
  t('krátké datum je česky', kratkeDatum('2026-08-12') === '12. 8.')
  t('prázdný vstup dá prázdné datum', kratkeDatum('') === '')
  t('den v týdnu sedí', denVTydnu('2026-08-12') === 'st')

  nastavTermin('nesmysl', 999)
  t('nesmyslné datum se odmítne', termin().od === '')
  t('počet dnů se zastropuje', termin().dnu === 365)
  nastavTermin('2026-08-12', -5)
  t('záporný počet dnů je nula', termin().dnu === 0)

  // „Stíháme?" vrací větu, ne verdikt – cesta není závod.
  const praha = { lat: 50.08, lon: 14.44 }
  const brno = { lat: 49.2, lon: 16.61 }
  const lisabon = { lat: 38.72, lon: -9.14 }
  {
    const blizko = stihameTo(praha, brno, 3)
    t('blízký přejezd je pohoda', blizko.pohoda === true)
    t('a věta to říká vlídně', /vejde/.test(blizko.veta) && !/nestíh/.test(blizko.veta))

    const daleko = stihameTo(praha, lisabon, 1)
    t('daleký přejezd na jeden den pohoda není', daleko.pohoda === false)
    t('ale ani tak nikoho nekárá', /svižn/.test(daleko.veta) && !/nestíh|pozor/.test(daleko.veta))

    t('bez dnů se odhad nepočítá', stihameTo(praha, brno, 0) === null)
    t('bez bodu se odhad nepočítá', stihameTo(null, brno, 3) === null)
    t('víc dnů znamená menší denní porci', stihameTo(praha, lisabon, 10).denne < stihameTo(praha, lisabon, 2).denne)
  }

  t('kód počasí 0 je jasno', pocasiPodleKodu(0).popis === 'jasno')
  t('kód počasí 61 je déšť', pocasiPodleKodu(61).popis === 'déšť')
  t('každý kód má ikonu', [0, 3, 45, 61, 71, 80, 85, 95].every((k) => !!pocasiPodleKodu(k).ikona))
}

console.log(`\n${ok}/${ok + chyb} kontrol prošlo`)
process.exit(chyb ? 1 : 0)
