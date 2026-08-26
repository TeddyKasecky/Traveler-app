/**
 * Zavření debug záznamu jedním příkazem.
 *
 *   npm run debug-zavri -- tadeas-003 hotovo "vrací zpátky do detailu"
 *   npm run debug-zavri -- anicka-002 zahozeno "duplicita k tadeas-003"
 *
 * PROČ TO VZNIKLO: zavírání se dělalo ručně ve třech krocích – vyhodit sekci
 * ze `.md`, přidat řádek do `VYRESENO.md`, smazat prázdný soubor. Každý z nich
 * šlo zapomenout a druhý navíc zprasit: řádek, který neodpovídá tvaru, parser
 * rejstříku **tiše přeskočí** a záznam z appky beze stopy zmizí. Autor se pak
 * nikdy nedozví, jak to dopadlo – a přesně kvůli tomu poznámkovač vznikl.
 *
 * VŠECHNY TŘI KROKY, NEBO ŽÁDNÝ. Změny se poskládají v paměti a zapíšou až
 * nakonec; půlka provedeného zavření je horší než žádné.
 *
 * `VYRESENO.md` se jen doplňuje, nikdy nepřepisuje – je to jediná historie
 * uzavřených záznamů. Je to zároveň jediný soubor ve složce, na kterém může
 * vzniknout konflikt v gitu; řeší se ponecháním obou řádků.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  VYCHOZI_SLOZKA,
  VYRESENO,
  exportniSoubory,
  prectiVyreseno,
  rozeber,
  sloz,
  zapisAtomicky,
} from './debug-slozka.mjs'

const barvy = process.stdout.isTTY && !process.env.NO_COLOR
const zeleny = (s) => (barvy ? `\x1b[32m${s}\x1b[0m` : s)
const cerveny = (s) => (barvy ? `\x1b[31m${s}\x1b[0m` : s)

/** Stavy, kterými se dá zavřít. Jiný `.md` ani rejstřík nezná. */
export const ZAVIRACI_STAVY = ['hotovo', 'zahozeno']

/** `2026-09-02` z času. Do řádku ve `VYRESENO.md`. */
const denNaText = (ms) => new Date(ms).toISOString().slice(0, 10)

/**
 * Zavře jeden záznam.
 *
 * @param {string} id
 * @param {string} stav  `hotovo` | `zahozeno`
 * @param {string} duvod  krátká věta do řádku; smí být prázdná
 * @param {{slozka?: string, ted?: number}} [o]
 * @returns {{ok: boolean, chyba?: string, soubor?: string, smazan?: boolean, radek?: string}}
 */
export function zavriZaznam(id, stav, duvod, { slozka = VYCHOZI_SLOZKA, ted = Date.now() } = {}) {
  if (!id) return { ok: false, chyba: 'Chybí id záznamu.' }
  if (!ZAVIRACI_STAVY.includes(stav)) {
    return { ok: false, chyba: `Stav musí být ${ZAVIRACI_STAVY.join(' nebo ')}, ne „${stav}".` }
  }

  const { uzavrene } = prectiVyreseno(slozka)
  if (uzavrene.has(id)) {
    return { ok: false, chyba: `${id} je už uzavřený (${uzavrene.get(id)}). Dvakrát se nezavírá.` }
  }

  // Najít, ve kterém souboru záznam je. Kdyby byl ve víc, platí nejnovější –
  // ale to je stav, který má uklidit `debug-uklid.mjs`, ne tenhle skript.
  let cilovy = null
  let rozebrany = null
  for (const jmeno of exportniSoubory(slozka)) {
    const r = rozeber(fs.readFileSync(path.join(slozka, jmeno), 'utf8'))
    if (r.kusy.some((k) => k.id === id)) {
      cilovy = jmeno
      rozebrany = r
    }
  }
  if (!cilovy) return { ok: false, chyba: `${id} ve složce debug/ není. Překlep?` }

  // Všechno v paměti, zápis až nakonec.
  const zustavaji = rozebrany.kusy.filter((k) => k.id !== id)
  const novyObsah = sloz(rozebrany.hlavicka, zustavaji)
  const cistyDuvod = String(duvod || '').replace(/\s+/g, ' ').trim()
  const radek = `- \`${id}\` · ${denNaText(ted)} · ${stav}${cistyDuvod ? ` · ${cistyDuvod}` : ''}`

  const cestaVyreseno = path.join(slozka, VYRESENO)
  const hlavicka =
    '# Vyřešené debug záznamy\n\n' +
    'Jeden řádek na každý uzavřený záznam. **Nikdy se nemaže ani nepřepisuje** –\n' +
    'je to jediná stopa po záznamu, který už ve složce není, a appka z ní bere\n' +
    'stav zpátky. Řádky skládá `npm run debug-zavri`, ne ruka: ručně napsaný\n' +
    'řádek se špatným tvarem parser tiše přeskočí a záznam beze stopy zmizí.\n'
  const stavajici = fs.existsSync(cestaVyreseno) ? fs.readFileSync(cestaVyreseno, 'utf8') : hlavicka
  const doplneny = `${stavajici.replace(/\n*$/, '')}\n${radek}\n`

  // Zápis. Pořadí: napřed VYRESENO.md, pak úprava/smazání `.md` – kdyby to
  // mezi tím spadlo, zůstane záznam na obou místech, což umí uklidit
  // `debug-uklid.mjs`. Obráceně by zmizel úplně.
  zapisAtomicky(cestaVyreseno, doplneny)

  const cesta = path.join(slozka, cilovy)
  if (novyObsah === null) {
    fs.unlinkSync(cesta)
    return { ok: true, soubor: cilovy, smazan: true, radek }
  }
  zapisAtomicky(cesta, novyObsah)
  return { ok: true, soubor: cilovy, smazan: false, radek }
}

/* ---------- spuštění z příkazové řádky ---------- */

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [id, stav, ...zbytek] = process.argv.slice(2)
  if (!id || !stav) {
    console.error('Použití: npm run debug-zavri -- <id> <hotovo|zahozeno> "krátký důvod"')
    process.exit(1)
  }

  const v = zavriZaznam(id, stav, zbytek.join(' '))
  if (!v.ok) {
    console.error(cerveny(v.chyba))
    process.exit(1)
  }

  console.log(zeleny(`Zavřeno ${id}`))
  console.log(`  ${v.radek}`)
  console.log(v.smazan ? `  ${v.soubor} byl poslední záznam – soubor smazán` : `  vyhozeno z ${v.soubor}`)
  console.log('\nNezapomeň na commit se zprávou `debug: ' + id + ' – …`.')
}
