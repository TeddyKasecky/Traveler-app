/**
 * Vyfotí obrazovky, aby šly porovnat po pixelech.
 *
 *   node scripts/screenshots.mjs --baseline    → .screenshots/baseline/
 *   node scripts/screenshots.mjs               → .screenshots/aktualni/
 *   node scripts/screenshots.mjs --tmavy       → totéž v tmavém režimu
 *   node scripts/screenshots.mjs --vs-original → původní režim stará vs. nová
 *
 * PROČ TŘI REŽIMY: do léta 2026 tenhle skript dokládal, že přestavba do modulů
 * nezměnila ani pixel proti `reference/index-original.html`. Vizuální redesign
 * (viz VZHLED.md) tenhle vztah vědomě zrušil – porovnávat se starou aplikací už
 * neříká nic, protože se má lišit všechno.
 *
 * Užitečné je porovnání s **posledním odsouhlaseným stavem**: před etapou se
 * nafotí `--baseline`, po etapě běžný režim, a `compare-screens.mjs` ukáže,
 * co se změnilo. U přepisu 44 stínů a 68 obrysů je to jediná realistická obrana
 * proti „na jedné obrazovce jsem zapomněl :active“.
 *
 * Režim `--vs-original` zůstává pro historické spuštění. Fotí do
 * `<obrazovka>-stara.png` a `-nova.png` jako dřív.
 *
 * Všechny verze dostanou stejný stav: uvítání odklikané, žádné poznámky, žádná
 * poloha. Bez toho by se lišily jen proto, že jedna ukazuje uvítání.
 */

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SNIMKY = path.join(ROOT, '.screenshots')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const jeBaseline = process.argv.includes('--baseline')
const jeOriginal = process.argv.includes('--vs-original')
const jeTmavy = process.argv.includes('--tmavy')

/** Kam se fotí. Režim je v názvu složky, aby si světlé a tmavé kolo nepřepisovaly snímky. */
const OUT = jeOriginal
  ? SNIMKY
  : path.join(SNIMKY, (jeBaseline ? 'baseline' : 'aktualni') + (jeTmavy ? '-tmavy' : ''))

const TYPY = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function server(koren, port) {
  const s = http.createServer((req, res) => {
    const cesta = decodeURIComponent(req.url.split('?')[0])
    const soubor = path.join(koren, cesta === '/' ? 'index.html' : cesta)
    // Schválně bez náhradní stránky: stará verze shání manifest, ikonu a sw.js,
    // které vedle sebe nikdy neměla. Musí dostat 404, jako je dostává dnes.
    if (!fs.existsSync(soubor) || fs.statSync(soubor).isDirectory()) {
      res.writeHead(404)
      res.end('nenalezeno')
      return
    }
    res.writeHead(200, { 'Content-Type': TYPY[path.extname(soubor)] || 'application/octet-stream' })
    res.end(fs.readFileSync(soubor))
  })
  return new Promise((r) => s.listen(port, () => r(s)))
}

/** Co se má vyfotit. `pred` doběhne před snímkem. */
const OBRAZOVKY = [
  { nazev: '1-domu', pred: async () => {} },
  {
    nazev: '2-mapa',
    pred: async (p) => {
      await p.click('#tabs button[data-tab="map"]')
      await p.waitForTimeout(1500)
    },
  },
  {
    nazev: '3-objevuj',
    pred: async (p) => {
      await p.click('#tabs button[data-tab="disc"]')
      await p.waitForTimeout(500)
    },
  },
  {
    nazev: '4-seznam',
    pred: async (p) => {
      await p.click('#tabs button[data-tab="list"]')
      await p.waitForTimeout(500)
    },
  },
  {
    nazev: '5-plan',
    pred: async (p) => {
      await p.click('#tabs button[data-tab="plan"]')
      await p.waitForTimeout(400)
    },
  },
  {
    nazev: '6-detail',
    pred: async (p) => {
      await p.click('#tabs button[data-tab="list"]')
      await p.waitForTimeout(400)
      await p.locator('#listInner .radek').first().click()
      await p.waitForTimeout(1600)
    },
  },
  {
    nazev: '7-filtry',
    pred: async (p) => {
      await p.click('#tabs button[data-tab="map"]')
      await p.waitForTimeout(600)
      await p.click('#fabFilter')
      await p.waitForTimeout(600)
    },
  },
  {
    nazev: '8-pruvodce',
    pred: async (p) => {
      await p.click('#wipWiz')
      await p.waitForTimeout(700)
    },
  },
]

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const b = await chromium.launch({ executablePath: EDGE, headless: true })

/** Nafotí jednu verzi. */
async function nafot(adresa, pripona) {
  for (const o of OBRAZOVKY) {
    const ctx = await b.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      locale: 'cs-CZ',
      // Schválně napevno, ne podle stroje: od zavedení tmavého režimu by se
      // snímky lišily podle toho, jak má počítač nastavený vzhled.
      colorScheme: jeTmavy ? 'dark' : 'light',
    })
    const page = await ctx.newPage()

    // Obrázky z ciziny se blokují v obou verzích stejně.
    //
    // Dlaždice mapy a fotky z Wikimedia doletí pokaždé jinak rychle a snímek
    // pak vyjde pokaždé jinak – rozdíl skákal mezi 2 700 a 150 000 pixely,
    // aniž by se v kódu cokoli změnilo. Bez nich porovnává obrázek jen to,
    // co opravdu vykresluje aplikace, a výsledek je opakovatelný.
    //
    // Fonty a Leaflet z CDN se blokovat NESMÍ: stará verze je odtamtud bere,
    // nová je má zabalené u sebe. Bez nich by stará spadla na systémové písmo
    // a lišila by se každá řádka textu.
    await page.route('**/*', (route) => {
      const u = route.request().url()
      return /tile\.openstreetmap\.org|wikimedia\.org/.test(u) ? route.abort() : route.continue()
    })

    // Uvítání odklikané, ať se verze liší jen tím, co nás zajímá.
    await page.addInitScript(() => {
      localStorage.setItem('vandrbuch:v1', JSON.stringify({ notes: {}, stav: {}, rating: {}, plan: [], prio: {}, dataOverride: null, seen: true }))
    })
    await page.goto(adresa, { waitUntil: 'load' })
    await page.waitForTimeout(1400)
    try {
      await o.pred(page)
    } catch (e) {
      console.log(`   ${o.nazev} (${pripona}): ${e.message.split('\n')[0]}`)
    }
    // Stará verze si písma tahá z CDN. Bez tohohle čekání se občas vyfotila
    // ještě se systémovým písmem a rozdíl vyskočil na statisíce pixelů.
    await page.evaluate(() => document.fonts.ready)

    // A počkat, až se stránka přestane měnit. Seznam kreslí 250 karet naráz
    // a stará verze k tomu ještě parsuje 565 kB dat přímo ve stránce – když
    // se vyfotila v půlce, rozdíl vyskočil na 219 000 pixelů.
    await page.waitForFunction(
      () => {
        const n = document.querySelectorAll('*').length
        const stejne = n === window.__poslednipocet
        window.__poslednipocet = n
        return stejne
      },
      null,
      { polling: 250, timeout: 15000 }
    )
    await page.waitForTimeout(250)

    await page.screenshot({ path: path.join(OUT, `${o.nazev}-${pripona}.png`) })
    await ctx.close()
  }
}

const srvNova = await server(path.join(ROOT, 'dist'), 4192)
const srvStara = jeOriginal ? await server(path.join(ROOT, 'reference'), 4191) : null

if (jeOriginal) {
  console.log('Fotím starou verzi…')
  await nafot('http://localhost:4191/index-original.html', 'stara')
  console.log('Fotím novou verzi…')
  await nafot('http://localhost:4192/', 'nova')
} else {
  const kam = jeBaseline ? 'základnu' : 'aktuální stav'
  console.log(`Fotím ${kam}${jeTmavy ? ' (tmavý režim)' : ''}…`)
  await nafot('http://localhost:4192/', jeTmavy ? 'tmavy' : 'svetly')
}

await b.close()
srvNova.close()
srvStara?.close()

console.log(`\nHotovo: ${path.relative(ROOT, OUT)}`)
for (const f of fs.readdirSync(OUT).sort()) {
  console.log(`   ${f.padEnd(22)} ${fs.statSync(path.join(OUT, f)).size} B`)
}
