/**
 * Kouřová zkouška v opravdovém prohlížeči.
 *
 *   npm run smoke                 spustí proti dist/ (hostovaná varianta)
 *   npm run smoke -- --single     spustí proti dist-single/index.html z disku
 *
 * Proklikává aplikaci a hlídá, jestli se něco nerozbilo: chyby v konzoli,
 * neodchycené výjimky, neúspěšné požadavky na vlastní soubory, počty míst,
 * obsah detailu, přepínání záložek, tlačítko zpět.
 *
 * Používá Edge, který je na Windows nainstalovaný – nestahuje se žádný prohlížeč.
 */

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SINGLE = process.argv.includes('--single')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 4183

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

/** Malý statický server nad dist/. Preview z Vite by tu byl zbytečná režie. */
function server(korenAdresar) {
  return http.createServer((req, res) => {
    const cesta = decodeURIComponent(req.url.split('?')[0])
    let soubor = path.join(korenAdresar, cesta === '/' ? 'index.html' : cesta)
    if (!fs.existsSync(soubor) || fs.statSync(soubor).isDirectory()) soubor = path.join(korenAdresar, 'index.html')
    res.writeHead(200, { 'Content-Type': TYPY[path.extname(soubor)] || 'application/octet-stream' })
    res.end(fs.readFileSync(soubor))
  })
}

const chyby = []
const problemySite = []

const b = await chromium.launch({ executablePath: EDGE, headless: true })
const page = await b.newPage({ viewport: { width: 390, height: 844 } })

page.on('console', (m) => {
  if (m.type() === 'error') chyby.push(`konzole: ${m.text()}`)
})
page.on('pageerror', (e) => chyby.push(`výjimka: ${e.message}`))
page.on('requestfailed', (r) => {
  const u = r.url()
  // Dlaždice a fotky z ciziny nás nezajímají – v testu stejně nejsou dostupné.
  if (u.includes('tile.openstreetmap.org') || u.includes('wikimedia.org')) return
  problemySite.push(`${r.failure()?.errorText} ${u}`)
})

let srv
let adresa
if (SINGLE) {
  adresa = pathToFileURL(path.join(ROOT, 'dist-single', 'index.html')).href
} else {
  srv = server(path.join(ROOT, 'dist'))
  await new Promise((r) => srv.listen(PORT, r))
  adresa = `http://localhost:${PORT}/`
}

console.log(`Testuji ${SINGLE ? 'single-file z disku' : 'hostovanou variantu'}\n  ${adresa}\n`)
await page.goto(adresa, { waitUntil: 'load' })
await page.waitForTimeout(1200)

/* ---------- kontroly ---------- */

const vysledky = []
const kontrola = async (popis, fn, ocekavano) => {
  let hodnota
  try {
    hodnota = await fn()
  } catch (e) {
    hodnota = `CHYBA: ${e.message}`
  }
  const ok = ocekavano === undefined ? !!hodnota : String(hodnota) === String(ocekavano)
  vysledky.push({ popis, hodnota, ok })
  console.log(`  ${ok ? 'ok   ' : 'CHYBA'} ${popis.padEnd(42)} ${hodnota}`)
}

await kontrola('sada ikon vložená', () => page.locator('svg symbol').count(), 45)
await kontrola('počet míst v hlavičce', () => page.locator('#totalN').innerText(), '580')
await kontrola('počítadlo na mapě', () => page.locator('#countN').innerText(), '580 míst')
await kontrola('chipy kategorií', () => page.locator('#chips .chip').count(), 10)
await kontrola('naplněné oblasti ve filtru', () => page.locator('#fReg option').count(), 118)
await kontrola('mapa má dlaždicovou vrstvu', () => page.locator('.leaflet-tile-pane').count(), 1)
await kontrola('špendlíky na mapě', () => page.locator('.badge-pin').count(), 580)
await kontrola('uvítání se ukázalo', () => page.locator('#intro.show').count(), 1)

// zavřít uvítání
await page.click('#introGo')
await kontrola('uvítání zavřené', () => page.locator('#intro.show').count(), 0)

// Domů
await kontrola('Domů je aktivní', () => page.locator('#panelHome.show').count(), 1)
await kontrola('hero s dodávkou', () => page.locator('.homehero img').count(), 1)
await kontrola('dlaždice nálad', () => page.locator('.mood').count(), 6)
await kontrola('karty bikeparků', () => page.locator('.bpc').count(), 32)
await kontrola('statistika míst', () => page.locator('.hstat b').first().innerText(), '580')

// Seznam
await page.click('#tabs button[data-tab="list"]')
await page.waitForTimeout(300)
await kontrola('seznam vykreslen', () => page.locator('#listInner .card').count(), 250)
await kontrola('adresa se změnila', () => page.evaluate(() => location.hash), '#list')

// hledání bez diakritiky
await page.fill('#q', 'soutesky')
await page.waitForTimeout(300)
await kontrola('hledání "soutesky" bez diakritiky', () => page.locator('#listInner .card').count(), 3)
await page.fill('#q', '')
await page.waitForTimeout(300)

// Objevuj
await page.click('#tabs button[data-tab="disc"]')
await page.waitForTimeout(300)
await kontrola('kolekce v Objevuj', () => page.locator('.coll').count(), 11)
await kontrola('oblasti v Objevuj', () => page.locator('.reg').count() )

// detail místa
await page.click('#tabs button[data-tab="list"]')
await page.waitForTimeout(300)
await page.locator('#listInner .card').first().click()
await page.waitForTimeout(900)
await kontrola('detail otevřený', () => page.locator('#sheet.show').count(), 1)
await kontrola('detail má nadpis', () => page.locator('#sheet h2').innerText().then((t) => t.length > 0))
await kontrola('detail má fakta', () => page.locator('#sheet .fact').count().then((n) => n >= 4))
await kontrola('detail má hvězdičky', () => page.locator('#dStars button').count(), 5)
await kontrola('detail má plamínky', () => page.locator('#dPrio button').count(), 3)
await kontrola('detail má mini-mapu', () => page.locator('#sheet .minimap, #sheet .mmfail').count(), 1)
await kontrola('detail má poznámku', () => page.locator('#noteBox').count(), 1)

// tlačítko zpět zavře detail
await page.goBack()
await page.waitForTimeout(500)
await kontrola('zpět zavřelo detail', () => page.locator('#sheet.show').count(), 0)

// plán
await page.click('#tabs button[data-tab="plan"]')
await page.waitForTimeout(300)
await kontrola('prázdný plán má hlášku', () => page.locator('#planWrap .empty').count(), 1)

// filtry – tlačítko je pod panely, takže jen na mapě. Tak to bylo i v originále.
await page.click('#tabs button[data-tab="map"]')
await page.waitForTimeout(300)
await kontrola('na mapě není žádný panel', () => page.locator('.panel.show').count(), 0)
await page.click('#fabFilter')
await page.waitForTimeout(400)
await kontrola('panel filtrů otevřený', () => page.locator('#filters.show').count(), 1)
await page.click('.toggle[data-f="free"]')
await page.click('#fApply')
await page.waitForTimeout(400)
await kontrola('filtr Zdarma na počítadle', () => page.locator('#countN').innerText(), '402 míst')
await kontrola('odznak filtrů', () => page.locator('#fBadge').innerText(), '1')

// uložení do localStorage
await kontrola('klíč vandrbuch:v1 existuje', () =>
  page.evaluate(() => localStorage.getItem('vandrbuch:v1') !== null)
)
await kontrola('uvítání zapsané do storu', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).seen === true)
)

/* ---------- offline (jen hostovaná varianta, service worker chce localhost) ---------- */

if (!SINGLE) {
  console.log('\n  offline zkouška:')
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  await kontrola('service worker běží', () => page.evaluate(() => !!navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true)))
  await page.waitForTimeout(1500) // ať stihne naplnit cache

  await page.context().setOffline(true)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1500)

  await kontrola('offline: aplikace naběhla', () => page.locator('#totalN').innerText(), '580')
  // Po znovunačtení jsou filtry zase prázdné – stav filtrů se nikdy neukládal,
  // stejně jako v původní aplikaci. Proto zase všech 580 špendlíků.
  await kontrola('offline: špendlíky na mapě', () => page.locator('.badge-pin').count(), 580)
  await kontrola('offline: styly se načetly', () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(244, 239, 226)')
  )
  await kontrola('offline: font Fraunces k dispozici', () =>
    page.evaluate(() => document.fonts.check("900 1.5rem Fraunces"))
  )
  await page.context().setOffline(false)
}

/* ---------- shrnutí ---------- */

console.log()
if (problemySite.length) {
  console.log(`Neúspěšné požadavky (${problemySite.length}):`)
  problemySite.forEach((p) => console.log(`   ${p}`))
  console.log()
}
if (chyby.length) {
  console.log(`Chyby v konzoli (${chyby.length}):`)
  chyby.forEach((c) => console.log(`   ${c}`))
  console.log()
}

const selhalo = vysledky.filter((v) => !v.ok).length
console.log(`${vysledky.length - selhalo}/${vysledky.length} kontrol prošlo`)

await b.close()
srv?.close()
process.exit(selhalo || chyby.length || problemySite.length ? 1 : 0)
