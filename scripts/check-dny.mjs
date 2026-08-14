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

console.log(`\n${ok}/${ok + chyb} kontrol prošlo`)
process.exit(chyb ? 1 : 0)
