/**
 * Že se vrstvy nepřelezou přes sebe.
 *
 *   npm run check-vrstvy
 *
 * PROČ TAHLE KONTROLA VZNIKLA. `map/planLine.js` si opisoval `otiskBodu()`
 * z `views/plan/routing.js`, protože mapa nesmí importovat views. Když otisk
 * v září 2026 přešel na hash, kopie zůstala u dlouhého řetězce — porovnání
 * pak nemohlo nikdy vyjít a přepočtená trasa se na hlavní mapě NIKDY
 * nenakreslila. Nikdo si toho rok nevšiml, protože se nic nerozbilo hlasitě:
 * appka jen tiše kreslila vzdušnou čáru.
 *
 * Duplicit z téhož důvodu bylo šest. Lék nebyl přepsat kopii, ale přestěhovat
 * data do `core/`, odkud na ně dosáhne mapa i views — a tahle kontrola hlídá,
 * aby se ta hranice zase nerozmělnila.
 *
 * HLÍDÁ SE JEN JEDEN SMĚR, a to schválně:
 *
 *   map/  ->  views/   ZAKÁZÁNO  (odsud pocházely všechny kopie)
 *   core/ ->  views/   ZAKÁZÁNO
 *   core/ ->  map/     ZAKÁZÁNO
 *   views/ -> map/     v pořádku, je toho sedmnáct a obrazovky mapu ovládat mají
 *
 * `CLAUDE.md` do září 2026 tvrdilo „Mapa nesmí volat views a naopak". Ta
 * druhá půlka nikdy neplatila; věta je opravená, protože pravidlo, které
 * z poloviny neexistuje, akorát zve k opisování.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')

const barvy = process.stdout.isTTY && !process.env.NO_COLOR
const zeleny = (s) => (barvy ? `\x1b[32m${s}\x1b[0m` : s)
const cerveny = (s) => (barvy ? `\x1b[31m${s}\x1b[0m` : s)

/** Co odkud nesmí. Klíč je vrstva, hodnota vrstvy, na které nesmí sáhnout. */
const ZAKAZ = {
  map: ['views'],
  core: ['views', 'map'],
}

let ok = 0
const chyby = []

/** Všechny zdrojáky pod `src/`. */
function soubory(dir) {
  const out = []
  for (const jm of fs.readdirSync(dir)) {
    const p = path.join(dir, jm)
    if (fs.statSync(p).isDirectory()) out.push(...soubory(p))
    else if (/\.m?js$/.test(jm)) out.push(p)
  }
  return out
}

/** Do které vrstvy soubor patří: `src/<vrstva>/…` */
const vrstva = (p) => path.relative(SRC, p).split(path.sep)[0]

// Bere staticky i dynamicky importované cesty – dynamický `await import()`
// by build tiše přežil a spadl až za běhu.
const CESTY = /(?:^|\s)(?:import|export)[^'"\n]*from\s*['"]([^'"]+)['"]|await\s+import\(\s*['"]([^'"]+)['"]\s*\)/g

for (const soubor of soubory(SRC)) {
  const odkud = vrstva(soubor)
  const zakazane = ZAKAZ[odkud]
  if (!zakazane) continue

  const text = fs.readFileSync(soubor, 'utf8')
  for (const m of text.matchAll(CESTY)) {
    const cil = m[1] || m[2]
    if (!cil.startsWith('.')) continue
    const kam = vrstva(path.resolve(path.dirname(soubor), cil))
    if (zakazane.includes(kam)) {
      chyby.push(`${path.relative(ROOT, soubor).replace(/\\/g, '/')} -> ${cil}  (${odkud} nesmí na ${kam})`)
    }
  }
}

for (const [odkud, zakazane] of Object.entries(ZAKAZ)) {
  for (const kam of zakazane) {
    const kolik = chyby.filter((c) => c.includes(`(${odkud} nesmí na ${kam})`)).length
    if (kolik) {
      console.log(`  ${cerveny('CHYBA')} ${odkud}/ neimportuje z ${kam}/`.padEnd(46) + `${kolik} porušení`)
    } else {
      ok++
      console.log(`  ${zeleny('ok')}    ${odkud}/ neimportuje z ${kam}/`)
    }
  }
}

/* ---------- opsané funkce ----------
 *
 * Import z views se dá zakázat, opsání funkce ne – a přesně tak ta vada
 * vznikla: `otiskBodu` nebyl import, byla to kopie. Sdílené výpočty proto
 * smějí být definované jen v `core/`; jinde je to znovu ta samá past. */
const JEN_V_CORE = ['otiskBodu', 'souradniceBodu', 'serazenePolozky']
const kopie = []
for (const soubor of soubory(SRC)) {
  if (vrstva(soubor) === 'core') continue
  const text = fs.readFileSync(soubor, 'utf8')
  for (const jm of JEN_V_CORE) {
    if (new RegExp(`(?:function|const|let)\\s+${jm}\\b`).test(text)) {
      kopie.push(`${path.relative(ROOT, soubor).replace(/\\/g, '/')} definuje vlastní ${jm}()`)
    }
  }
}
if (kopie.length) {
  console.log(`  ${cerveny('CHYBA')} sdílené výpočty jsou jen v core/`.padEnd(46) + `${kopie.length} kopií`)
  for (const k of kopie) chyby.push(k)
} else {
  ok++
  console.log(`  ${zeleny('ok')}    sdílené výpočty jsou jen v core/`)
}

if (chyby.length) {
  console.log('\nPorušení:')
  for (const c of chyby) console.log(`   ${c}`)
  console.log(
    '\nData a výpočty, na které potřebuje sáhnout mapa i obrazovka, patří do' +
      '\n`src/core/`. Opsat si je jinam není řešení – přesně tak vznikla vada,' +
      '\nkvůli které tahle kontrola je (viz hlavička souboru).'
  )
}

const celkem = Object.values(ZAKAZ).reduce((s, x) => s + x.length, 0) + 1
console.log(`\n${ok}/${celkem} pravidel vrstev drží`)
process.exit(chyby.length ? 1 : 0)
