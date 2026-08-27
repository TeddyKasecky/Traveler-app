/**
 * Společná práce se složkou `debug/` – čtení, přepis a atomický zápis.
 *
 * PROČ ZVLÁŠŤ: úklid (`debug-uklid.mjs`) i zavírání (`debug-zavri.mjs`) sahají
 * na tytéž soubory a musí je rozebrat a složit úplně stejně. Kdyby to každý
 * dělal po svém, rozešly by se – a rozdíl by se poznal až tím, že by jeden
 * z nich soubor poškodil.
 *
 * ROZDĚLOVAČ JE `\n---\n`, stejný jako v `debug-rejstrik.mjs#zaznamyZeSouboru`.
 * Je bezpečný, protože `bezpecnyText()` v `src/core/debugExport.js` odřádkované
 * `---` uvnitř uživatelského textu escapuje – jinak by stačilo napsat do popisu
 * vodorovnou čáru a soubor by se rozpadl na dva záznamy.
 *
 * ZAPISUJE SE PŘES DOČASNÝ SOUBOR A `rename`. Přerušený zápis do `.md`
 * uprostřed by byl horší než neuklizená složka: přišlo by se o hlášení, která
 * nikdo nemá jinde.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath, ne ruční ořezávání – cesta obsahuje diakritiku („Anička“).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Výchozí složka s exporty. Parametrem kvůli testům nad dočasnou složkou. */
export const VYCHOZI_SLOZKA = path.join(ROOT, 'debug')

/** Soubor, do kterého se zapisuje uzavření. Nikdy se nemaže ani nepřepisuje. */
export const VYRESENO = 'VYRESENO.md'

/**
 * Exportované soubory ve složce, seřazené.
 *
 * ABECEDNÍ POŘADÍ JE ČASOVÉ: názvy začínají datem a časem
 * (`2026-08-26-1215-tadeas.md`). Na tom stojí pravidlo „platí nejnovější“
 * v `postavRejstrik()` i v úklidu – proto se soubory ve složce
 * NEPŘEJMENOVÁVAJÍ, změnilo by to, co platí.
 *
 * @param {string} [slozka]
 * @returns {string[]} jména souborů, nejstarší první
 */
export function exportniSoubory(slozka = VYCHOZI_SLOZKA) {
  if (!fs.existsSync(slozka)) return []
  return fs
    .readdirSync(slozka, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.md') && d.name !== VYRESENO)
    .map((d) => d.name)
    .sort()
}

/**
 * Rozebere soubor na hlavičku a jednotlivé záznamy.
 *
 * @param {string} text
 * @returns {{hlavicka: string, kusy: Array<{id: string, text: string}>}}
 */
export function rozeber(text) {
  const casti = text.split('\n---\n')
  const kusy = casti.slice(1).map((kus) => {
    const m = /^##\s+(\S+)\s+·/m.exec(kus)
    return { id: m ? m[1] : '', text: kus }
  })
  return { hlavicka: casti[0], kusy }
}

/**
 * Složí soubor zpátky. Prázdný seznam záznamů vrací `null` – takový soubor
 * nemá co existovat a volající ho má smazat.
 *
 * @param {string} hlavicka
 * @param {Array<{text: string}>} kusy
 * @returns {string|null}
 */
export function sloz(hlavicka, kusy) {
  if (!kusy.length) return null
  return [hlavicka, ...kusy.map((k) => k.text)].join('\n---\n')
}

/**
 * Zapíše soubor atomicky – přes dočasný a `rename`.
 * @param {string} cesta
 * @param {string} obsah
 */
export function zapisAtomicky(cesta, obsah) {
  const docasny = `${cesta}.nove`
  fs.writeFileSync(docasny, obsah, 'utf8')
  fs.renameSync(docasny, cesta)
}

/**
 * Která `id` už jsou uzavřená ve `VYRESENO.md`.
 *
 * Řádek, který **vypadá jako záznam, ale tvar nemá**, se hlásí, ne přeskakuje:
 * parser rejstříku ho tiše ignoruje a záznam by z appky beze stopy zmizel.
 * Právě proto řádky skládá `debug-zavri.mjs` a nepíšou se rukou.
 *
 * ZÁZNAM SE POZNÁ PODLE ODRÁŽKY. Všechno ostatní je próza a přeskakuje se –
 * hlavička souboru je čtyři řádky vysvětlení a do srpna 2026 se hlásila jako
 * čtyři vadné záznamy. Přišlo se na to teprve tím, že `VYRESENO.md` do té doby
 * ani jednou nevznikl: `debug-zavri.mjs` tu hlavičku píše a vlastní kontrola ji
 * pak neuměla přečíst.
 *
 * @param {string} [slozka]
 * @returns {{uzavrene: Map<string, string>, vadneRadky: string[]}}
 */
export function prectiVyreseno(slozka = VYCHOZI_SLOZKA) {
  const cesta = path.join(slozka, VYRESENO)
  const uzavrene = new Map()
  const vadneRadky = []
  if (!fs.existsSync(cesta)) return { uzavrene, vadneRadky }

  for (const radek of fs.readFileSync(cesta, 'utf8').split('\n')) {
    const t = radek.trim()
    if (!t.startsWith('- ')) continue
    const m = /^-\s+`([^`]+)`\s+·\s+(\d{4}-\d{2}-\d{2})\s+·\s+(\S+)\s*(?:·\s*(.*))?$/.exec(t)
    if (!m) {
      vadneRadky.push(t)
      continue
    }
    uzavrene.set(m[1], m[2])
  }
  return { uzavrene, vadneRadky }
}

/**
 * Kde všude která `id` leží. Klíč je `id`, hodnota seznam souborů v pořadí
 * od nejstaršího.
 *
 * @param {string} [slozka]
 * @returns {Map<string, string[]>}
 */
export function kdeJsouZaznamy(slozka = VYCHOZI_SLOZKA) {
  const kde = new Map()
  for (const jmeno of exportniSoubory(slozka)) {
    const { kusy } = rozeber(fs.readFileSync(path.join(slozka, jmeno), 'utf8'))
    for (const k of kusy) {
      if (!k.id) continue
      if (!kde.has(k.id)) kde.set(k.id, [])
      kde.get(k.id).push(jmeno)
    }
  }
  return kde
}
