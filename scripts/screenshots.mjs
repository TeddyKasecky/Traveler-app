/**
 * Vyfotí stejné obrazovky ve staré a nové verzi, aby šly porovnat vedle sebe.
 *
 *   node scripts/screenshots.mjs
 *
 * Výsledek je v .screenshots/ (do gitu nejde). Pro každou obrazovku vznikne
 * dvojice `<obrazovka>-stara.png` a `<obrazovka>-nova.png`.
 *
 * Obě verze dostanou stejný stav: uvítání odklikané, žádné poznámky, žádná
 * poloha. Bez toho by se lišily jen proto, že jedna ukazuje uvítání.
 */

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, '.screenshots')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

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
      await p.locator('#listInner .card').first().click()
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

const srvStara = await server(path.join(ROOT, 'reference'), 4191)
const srvNova = await server(path.join(ROOT, 'dist'), 4192)

console.log('Fotím starou verzi…')
await nafot('http://localhost:4191/index-original.html', 'stara')
console.log('Fotím novou verzi…')
await nafot('http://localhost:4192/', 'nova')

await b.close()
srvStara.close()
srvNova.close()

console.log(`\nHotovo: ${path.relative(ROOT, OUT)}`)
for (const f of fs.readdirSync(OUT).sort()) {
  console.log(`   ${f.padEnd(22)} ${fs.statSync(path.join(OUT, f)).size} B`)
}
