/**
 * Že throttle() a projektujNaTrasu() (živé sledování polohy na trase) počítají
 * správně na jednoduchých, ručně spočítaných případech.
 *
 *   npm run check-projekce
 *
 * PROČ ZVLÁŠŤ A NE VE SMOKE: obě funkce jsou čisté (žádný DOM, žádné GPS),
 * takže se dají otestovat jako čistý Node bez prohlížeče, stejně jako
 * `check-dny.mjs`. `throttle()` se testuje s ručně posunutým `Date.now()`,
 * ať test neběží v reálném čase.
 */

const { throttle } = await import('../src/core/throttle.js')
const { projektujNaTrasu } = await import('../src/core/projekce.js')

const barvy = process.stdout.isTTY && !process.env.NO_COLOR
const zeleny = (s) => (barvy ? `\x1b[32m${s}\x1b[0m` : s)
const cerveny = (s) => (barvy ? `\x1b[31m${s}\x1b[0m` : s)

let ok = 0
let chyb = 0

/** @param {string} popis @param {boolean} podminka */
function t(popis, podminka) {
  if (podminka) {
    ok++
    console.log(`  ${zeleny('ok')}    ${popis}`)
  } else {
    chyb++
    console.log(`  ${cerveny('CHYBA')} ${popis}`)
  }
}

console.log('throttle()\n')

{
  let volani = 0
  const skutecnyNow = Date.now
  let cas = 1000
  Date.now = () => cas

  const f = throttle(() => volani++, 100)
  f()
  t('první volání proběhne hned', volani === 1)
  f()
  f()
  t('volání během okna se ignoruje (zatím)', volani === 1)
  cas += 50
  f()
  t('volání uvnitř okna zatím pořád nic', volani === 1)

  // Odložené volání z předchozích f() se spustí přes setTimeout – bez
  // reálného časovače v testu ho nevyvoláme, ověřujeme jen synchronní chování.
  Date.now = skutecnyNow
}

{
  let volani = 0
  const skutecnyNow = Date.now
  let cas = 5000
  Date.now = () => cas

  const f = throttle(() => volani++, 100)
  f()
  cas += 150
  f()
  t('volání po uplynutí okna proběhne hned znovu', volani === 2)

  Date.now = skutecnyNow
}

console.log('\nprojektujNaTrasu()\n')

{
  // Vodorovná trasa podél rovnoběžky (zjednodušeno pro ruční ověření).
  const polyline = [
    [50.0, 14.0],
    [50.0, 14.1],
    [50.0, 14.2],
  ]
  const naZacatku = projektujNaTrasu({ lat: 50.0, lon: 14.0 }, polyline)
  t('poloha přesně na začátku má nulovou odchylku od trasy', Math.abs(naZacatku.vzdalenostOdTrasyKm) < 1e-6)
  t('poloha na začátku má segmentIdx 0', naZacatku.segmentIdx === 0)

  const uprostred = projektujNaTrasu({ lat: 50.0, lon: 14.1 }, polyline)
  t('poloha uprostřed trasy má menší zbývající vzdálenost než ze začátku', uprostred.zbyvaKm < naZacatku.zbyvaKm)

  const naKonci = projektujNaTrasu({ lat: 50.0, lon: 14.2 }, polyline)
  t('poloha na konci trasy má nulovou zbývající vzdálenost', naKonci.zbyvaKm < 1e-6)

  const mimoTrasu = projektujNaTrasu({ lat: 50.5, lon: 14.1 }, polyline)
  t('poloha mimo trasu má nenulovou odchylku', mimoTrasu.vzdalenostOdTrasyKm > 1)
  t('projekce mimo trasu se přesto promítne na nejbližší bod čáry', Math.abs(mimoTrasu.bod.lon - 14.1) < 0.01)

  t('kratší polyline (jeden bod) vrací null', projektujNaTrasu({ lat: 50, lon: 14 }, [[50, 14]]) === null)
  t('prázdná polyline vrací null', projektujNaTrasu({ lat: 50, lon: 14 }, []) === null)
  t('chybějící polyline vrací null', projektujNaTrasu({ lat: 50, lon: 14 }, null) === null)
}

console.log(`\n${ok}/${ok + chyb} kontrol prošlo`)
process.exit(chyb ? 1 : 0)
