/**
 * Je moje složka `debug/` stejná jako ta na `main`?
 *
 * PROČ TO VZNIKLO: od chvíle, co poznámky commituje Cloudflare Worker rovnou
 * přes GitHub API (`worker/index.js`), se `main` mění **kdykoli a potichu** –
 * bez toho, aby někdo něco pushnul z počítače. Do té doby platilo, že se složka
 * hne jen tehdy, když ji někdo změní, takže zastaralý checkout byl vidět.
 * Dneska není.
 *
 * Co tím hrozí, jsou dvě tiché chyby:
 *   1. triáž nad starým stavem – hlášení odeslané před deseti minutami nevidím
 *      a klidně dělám na něčem, co už je nahlášené jinak,
 *   2. `debug-zavri` nad starým stavem – zavře záznam ve starším souboru,
 *      zatímco na `main` už leží novější export s týmž `id`. Řádek ve
 *      `VYRESENO.md` se přitom **nikdy nemaže**.
 *
 * Kontrola je proto v nástrojích, ne jako věta v pravidlech: věta platí jen do
 * chvíle, než na ni někdo zapomene.
 *
 * DVĚ VRSTVY: `rozborDiffu()` je čistá funkce a nese celé rozhodnutí, takže jde
 * testovat bez gitu a bez sítě. `zkontrolujCerstvost()` k ní jen dodá data.
 *
 * SELHÁNÍ NIKDY NEBLOKUJE. Offline, chybějící `origin`, timeout i nefunkční
 * `git` končí jako `nezname` s vysvětlením. Kontrola má chránit před tichou
 * chybou, ne vyrobit novou.
 */

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath, ne ruční ořezávání – cesta obsahuje diakritiku („Anička“).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Větev, na kterou Worker commituje. Nikdy jiná – viz `VETEV` ve `worker/index.js`. */
export const VETEV = 'origin/main'

/** Strop pro každé volání gitu. Bez sítě se `fetch` jinak zasekne na minuty. */
export const TIMEOUT_MS = 10000

/**
 * Rozbor výstupu `git diff --name-status HEAD origin/main -- debug/`.
 *
 * SMĚR DIFFU JE TO PODSTATNÉ. Porovnává se HEAD → `origin/main`, takže značka
 * říká, co by se stalo, kdybych se na `origin/main` přesunul:
 *
 *   `A` – soubor je na `origin/main` a u mě ne  → **chybí mi**
 *   `M` – liší se (prakticky jen `VYRESENO.md`) → mění, co je zavřené
 *   `D` – mám ho já a origin ne                 → **můj vlastní nepushnutý
 *                                                  export, ignorovat**
 *
 * Bez toho posledního by každý rozpracovaný export hlásil planý poplach.
 *
 * @param {string} vystup
 * @returns {{chybejici: string[], zmenene: string[]}}
 */
export function rozborDiffu(vystup) {
  const chybejici = []
  const zmenene = []

  for (const radek of String(vystup || '').split('\n')) {
    // `\r` kvůli Windows, i když git sám píše LF – přes rouru to projít může.
    const t = radek.replace(/\r$/, '').trim()
    if (!t) continue

    // `R100\tstary\tnovy` u přejmenování má tři sloupce; bereme první a poslední.
    const sloupce = t.split('\t')
    const znacka = sloupce[0][0]
    const soubor = sloupce[sloupce.length - 1]
    if (!soubor.startsWith('debug/')) continue

    if (znacka === 'A' || znacka === 'R' || znacka === 'C') chybejici.push(soubor)
    else if (znacka === 'M') zmenene.push(soubor)
  }

  return { chybejici, zmenene }
}

/**
 * Spustí git a vrátí jeho výstup. Chybu nepropaguje – vrací `null`.
 * @param {string[]} argumenty
 * @returns {string|null}
 */
function git(argumenty) {
  try {
    return execFileSync('git', argumenty, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    return null
  }
}

/**
 * Je složka `debug/` čerstvá proti `origin/main`?
 *
 * @param {{fetchni?: boolean}} [o]  `fetchni: false` porovná jen s tím, co už je
 *   stažené – pro testy a pro místa, kde se na síť sahat nesmí
 * @returns {{stav: 'cerstve'|'pozadu'|'nezname', chybejici: string[],
 *   zmenene: string[], duvod: string}}
 */
export function zkontrolujCerstvost({ fetchni = true } = {}) {
  const prazdno = { chybejici: [], zmenene: [] }

  if (git(['rev-parse', '--git-dir']) === null) {
    return { stav: 'nezname', ...prazdno, duvod: 'není to git repozitář' }
  }

  if (fetchni) {
    // Explicitní refspec, ne `git fetch origin main`: to aktualizuje
    // `refs/remotes/origin/main` jen oportunisticky podle nastavení remotu,
    // kdežto tohle vždycky – a porovnává se právě proti němu.
    const stazeno = git(['fetch', '--quiet', 'origin', '+refs/heads/main:refs/remotes/origin/main'])
    if (stazeno === null) {
      return { stav: 'nezname', ...prazdno, duvod: 'stav z originu se nepodařilo stáhnout (offline?)' }
    }
  }

  const vystup = git(['diff', '--name-status', 'HEAD', VETEV, '--', 'debug/'])
  if (vystup === null) {
    return { stav: 'nezname', ...prazdno, duvod: `${VETEV} tady není` }
  }

  const { chybejici, zmenene } = rozborDiffu(vystup)
  const pozadu = chybejici.length + zmenene.length > 0
  return {
    stav: pozadu ? 'pozadu' : 'cerstve',
    chybejici,
    zmenene,
    duvod: pozadu ? `${chybejici.length + zmenene.length} souborů se liší od ${VETEV}` : '',
  }
}

/**
 * Text varování, nebo `null`, když není co hlásit.
 *
 * Společný schválně: kdyby si ho každý nástroj psal sám, rozešly by se – a člověk
 * by u jednoho z nich četl jinou radu než u druhého.
 *
 * @param {ReturnType<typeof zkontrolujCerstvost>} v
 * @returns {string|null}
 */
export function varovani(v) {
  if (v.stav === 'cerstve') return null
  if (v.stav === 'nezname') return `Stav složky debug/ proti ${VETEV} se nedal ověřit – ${v.duvod}.`

  const radky = ['Složka debug/ NENÍ aktuální proti ' + VETEV + '.']
  for (const s of v.chybejici) radky.push(`  chybí ti      ${s}`)
  for (const s of v.zmenene) radky.push(`  liší se       ${s}`)
  radky.push('')
  radky.push('Poznámky commituje Worker rovnou na main, takže složka se mění i bez pushe.')
  radky.push('Srovnej to: git fetch origin && git merge origin/main')
  return radky.join('\n')
}
