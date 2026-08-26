/**
 * Úklid složky `debug/`.
 *
 *   npm run debug-uklid              uklidí
 *   npm run debug-uklid -- --kontrola   jen nahlásí, nic nemění (kód 1 při nálezu)
 *
 * PROČ TO VZNIKLO: pět záznamů skončilo ve dvanácti kopiích ve čtyřech
 * souborech za dva dny. Rozsah exportu „nevyřešené“ posílal pokaždé znovu
 * všechno, co ještě nikdo nezavřel – a zavírá se až v repozitáři, takže to
 * bylo prakticky všechno. Rozsah se od srpna 2026 změnil na „nové a změněné“,
 * takže duplicity nevznikají, ale ty staré někdo uklidit musí.
 *
 * DĚLÁ DVĚ VĚCI:
 *   1. když je totéž `id` ve víc souborech, nechá jen výskyt v tom NEJNOVĚJŠÍM
 *      – přesně tak už se chová `postavRejstrik()`, takže se tím nic nemění,
 *      jen se to propíše do souborů,
 *   2. vyhodí ze `.md` záznamy, které jsou už uzavřené ve `VYRESENO.md`
 *      – zapomenutý krok při zavírání, dnes už ho dělá `debug-zavri.mjs` sám.
 *
 * Soubor, ze kterého zmizí poslední záznam, se smaže.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  VYCHOZI_SLOZKA,
  exportniSoubory,
  prectiVyreseno,
  rozeber,
  sloz,
  zapisAtomicky,
} from './debug-slozka.mjs'

const barvy = process.stdout.isTTY && !process.env.NO_COLOR
const zeleny = (s) => (barvy ? `\x1b[32m${s}\x1b[0m` : s)
const cerveny = (s) => (barvy ? `\x1b[31m${s}\x1b[0m` : s)
const seda = (s) => (barvy ? `\x1b[2m${s}\x1b[0m` : s)

/**
 * Uklidí složku, nebo jen popíše, co by udělal.
 *
 * @param {string} [slozka]
 * @param {{jenKontrola?: boolean}} [o]
 * @returns {{duplicity: Array<{id: string, ze: string, zustava: string}>,
 *   uzavrene: Array<{id: string, ze: string}>, smazane: string[], vadneRadky: string[]}}
 */
export function uklidSlozku(slozka = VYCHOZI_SLOZKA, { jenKontrola = false } = {}) {
  const soubory = exportniSoubory(slozka)
  const { uzavrene: zavrene, vadneRadky } = prectiVyreseno(slozka)

  // Kde je které `id` naposledy. Soubory jsou seřazené, takže poslední výskyt
  // je ten nejnovější a ten platí.
  const posledni = new Map()
  const obsah = new Map()
  for (const jmeno of soubory) {
    const rozebrany = rozeber(fs.readFileSync(path.join(slozka, jmeno), 'utf8'))
    obsah.set(jmeno, rozebrany)
    for (const k of rozebrany.kusy) if (k.id) posledni.set(k.id, jmeno)
  }

  const duplicity = []
  const uzavreneVen = []
  const smazane = []

  for (const jmeno of soubory) {
    const { hlavicka, kusy } = obsah.get(jmeno)
    const zustavaji = kusy.filter((k) => {
      if (!k.id) return true
      if (zavrene.has(k.id)) {
        uzavreneVen.push({ id: k.id, ze: jmeno })
        return false
      }
      if (posledni.get(k.id) !== jmeno) {
        duplicity.push({ id: k.id, ze: jmeno, zustava: posledni.get(k.id) })
        return false
      }
      return true
    })

    if (zustavaji.length === kusy.length) continue
    if (jenKontrola) continue

    const novy = sloz(hlavicka, zustavaji)
    const cesta = path.join(slozka, jmeno)
    if (novy === null) {
      fs.unlinkSync(cesta)
      smazane.push(jmeno)
    } else {
      zapisAtomicky(cesta, novy)
    }
  }

  return { duplicity, uzavrene: uzavreneVen, smazane, vadneRadky }
}

/* ---------- spuštění z příkazové řádky ---------- */

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const jenKontrola = process.argv.includes('--kontrola')
  const v = uklidSlozku(VYCHOZI_SLOZKA, { jenKontrola })

  for (const d of v.duplicity) {
    console.log(`  ${d.id.padEnd(20)} ${seda(`v ${d.ze}`)} → platí ${d.zustava}`)
  }
  for (const u of v.uzavrene) {
    console.log(`  ${u.id.padEnd(20)} ${seda(`v ${u.ze}`)} → už je ve VYRESENO.md`)
  }
  for (const s of v.smazane) console.log(`  ${seda(`smazán prázdný ${s}`)}`)
  for (const r of v.vadneRadky) {
    console.log(cerveny(`  VYRESENO.md: řádek se nedá přečíst → ${r.slice(0, 70)}`))
  }

  const nalezu = v.duplicity.length + v.uzavrene.length + v.vadneRadky.length
  if (!nalezu) {
    console.log(zeleny('Složka debug/ je v pořádku.'))
    process.exit(0)
  }

  if (jenKontrola) {
    console.log(cerveny(`\n${nalezu} k úklidu. Spusť \`npm run debug-uklid\`.`))
    process.exit(1)
  }
  console.log(zeleny(`\nUklizeno: ${nalezu}.`))
  // Vadné řádky ve VYRESENO.md úklid neopravuje – tenhle soubor se nikdy
  // nepřepisuje, protože je to jediná historie uzavřených záznamů.
  process.exit(v.vadneRadky.length ? 1 : 0)
}
