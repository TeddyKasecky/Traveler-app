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

const { store } = await import('../src/core/store.js')
const { dnyPlanu, presunDoDne, zrusDny } = await import('../src/views/plan/dny.js')
const { zalohaData, obnovZalohu } = await import('../src/core/csv.js')

const barvy = process.stdout.isTTY && !process.env.NO_COLOR
const zeleny = (s) => (barvy ? `[32m${s}[0m` : s)
const cerveny = (s) => (barvy ? `[31m${s}[0m` : s)

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

console.log(`\n${ok}/${ok + chyb} kontrol prošlo`)
process.exit(chyb ? 1 : 0)
