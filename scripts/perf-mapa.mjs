/**
 * Změří, jak rychle se posouvá a přibližuje **stažená malovaná mapa**.
 *
 *   npm run build && node scripts/perf-mapa.mjs
 *
 * PROČ ZVLÁŠŤ OD `perf.mjs`: ten měří start aplikace. Tohle měří něco úplně
 * jiného – plynulost při tažení prstem po mapě, kterou kreslí MapLibre
 * z vektorových dlaždic. Bez tohohle by „zrychlili jsme to“ byl jen dojem.
 *
 * Postup je stejný jako u člověka: otevřít, stáhnout balík mapy tlačítkem
 * v Nastavení, přepnout na offline podklad a chvíli po mapě courovat. Měří se
 * délky snímků mezi tím – medián, nejhorší dvacetina a kolik snímků přeteklo
 * přes 50 ms, protože právě ty jsou vidět jako škubnutí.
 *
 * MĚŘÍ SE BEZ GRAFICKÉ KARTY. Edge běží bez okna, takže WebGL kreslí
 * SwiftShader, tedy procesor. Absolutní čísla proto nejsou čísla z telefonu –
 * jsou horší. Zato je v nich **vidět práce na pixelech**, která je na skutečném
 * telefonu tím hlavním nákladem, a porovnání před × po je poctivé, protože obě
 * měření běží na stejném rendereru.
 */

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 4197

const TYPY = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  // Modulový worker MapLibre. Se špatným typem ho prohlížeč odmítne a mapa
  // pak mlčky nenačte jedinou dlaždici.
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.vbm': 'application/octet-stream',
}

const dist = path.join(ROOT, 'dist')
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('Chybí dist/. Pusť napřed `npm run build`.')
  process.exit(1)
}

const balik = path.join(dist, 'mapa-evropa.vbm')
if (!fs.existsSync(balik)) {
  console.error('Chybí dist/mapa-evropa.vbm. Pusť napřed `node scripts/make-mapa.mjs --zapis` a build.')
  process.exit(1)
}
console.log(`\nStažená malovaná mapa – plynulost\n`)
console.log(`  balík  ${(fs.statSync(balik).size / 1048576).toFixed(1)} MB\n`)

/* ---------- server ---------- */

const srv = http.createServer((req, res) => {
  const cesta = decodeURIComponent(req.url.split('?')[0])
  let soubor = path.join(dist, cesta === '/' ? 'index.html' : cesta)
  if (!fs.existsSync(soubor) || fs.statSync(soubor).isDirectory()) soubor = path.join(dist, 'index.html')
  res.writeHead(200, { 'Content-Type': TYPY[path.extname(soubor)] || 'application/octet-stream' })
  res.end(fs.readFileSync(soubor))
})
await new Promise((r) => srv.listen(PORT, r))

/**
 * Měřič délky snímků. Běží pořád, výsledky se odebírají po úsecích.
 *
 * Měří se `requestAnimationFrame`, ne `Performance.getMetrics`: zajímá nás
 * plynulost tak, jak ji vidí oko, ne kolik celkem sežral JavaScript.
 */
const MERIC = () => {
  window.__ramce = []
  let minule = performance.now()
  const tik = (t) => {
    window.__ramce.push(t - minule)
    minule = t
    requestAnimationFrame(tik)
  }
  requestAnimationFrame(tik)
  window.__odeber = () => {
    const r = window.__ramce
    window.__ramce = []
    return r
  }
}

/** Medián, 95. percentil a počet škubnutí. */
function statistika(ramce) {
  // První dva snímky po zásahu jsou vždycky delší (rozhodnutí prohlížeče
  // o překreslení), a odečítat je by bylo lhaní. Zahazuje se jen rozběh měřiče.
  const r = ramce.slice(2).sort((a, b) => a - b)
  if (!r.length) return { median: 0, p95: 0, skubnuti: 0, snimku: 0 }
  return {
    median: r[Math.floor(r.length / 2)],
    p95: r[Math.floor(r.length * 0.95)],
    skubnuti: r.filter((x) => x > 50).length,
    snimku: r.length,
  }
}

// WebGL musí být zapnutý i bez okna, jinak by MapLibre vůbec nenaběhl
// a měřilo by se záložní plátno – tedy něco úplně jiného.
const prohlizec = await chromium.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})

/** Průběh na jeden řádek, ať je při dlouhém běhu vidět, kde to je. */
const krok = (t) => process.stdout.write(`    · ${t}\n`)

/**
 * Jedno kolo měření při daném zpomalení procesoru.
 * @param {number} zpomaleni
 */
async function zmer(zpomaleni) {
  krok(`kolo ${zpomaleni}× – otevírám`)
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(MERIC)
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' })
  await page.evaluate(() => document.getElementById('introGo')?.click())
  await page.waitForTimeout(300)

  // Stáhnout balík. Tlačítko je v Nastavení, dřív bylo v Profilu – hledá se
  // podle `id`, takže to přežije obojí.
  krok('stahuju balík mapy')
  await page.evaluate(() => {
    document.getElementById('nastaveniOpen')?.click()
    document.getElementById('profilOpen')?.click()
  })
  await page.waitForTimeout(400)
  await page.evaluate(() => document.getElementById('mapaStahni').click())
  await page.waitForFunction(() => document.getElementById('mapaSmaz') && !document.getElementById('mapaSmaz').hidden, null, {
    timeout: 120000,
  })

  // Teprve teď zpomalit procesor: stahování balíku není to, co měříme.
  if (zpomaleni > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: zpomaleni })

  // Na mapu a na malovaný podklad.
  krok('přepínám na malovanou mapu')
  await page.evaluate(() => document.querySelector('#tabs button[data-tab="map"]').click())
  await page.waitForTimeout(600)
  const jeOffline = await page.evaluate(() => document.getElementById('podkladBtn').classList.contains('on'))
  if (!jeOffline) await page.evaluate(() => document.getElementById('podkladBtn').click())

  // Kolik trvá, než se mapa po přepnutí ustálí: deset snímků pod 20 ms za sebou.
  const usazeni = await page.evaluate(async () => {
    const t0 = performance.now()
    let klidnych = 0
    let minule = performance.now()
    for (;;) {
      const t = await new Promise((r) => requestAnimationFrame(r))
      klidnych = t - minule < 20 ? klidnych + 1 : 0
      minule = t
      if (klidnych >= 10) return performance.now() - t0
      if (performance.now() - t0 > 15000) return -1
    }
  })

  // Rozměry se čtou přes `evaluate`, ne přes `locator().boundingBox()`.
  // Playwright u locatoru čeká, až bude prvek „ustálený“, a mapa, která se
  // překresluje každý snímek, ustálená nikdy není – čekání vyprší.
  const mapa = await page.evaluate(() => {
    const r = document.getElementById('map').getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  const stred = { x: mapa.x + mapa.w / 2, y: mapa.y + mapa.h / 2 }

  /* ---- posun ---- */
  krok('měřím posun')
  await page.evaluate(() => window.__odeber())
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(stred.x, stred.y)
    await page.mouse.down()
    for (let k = 1; k <= 12; k++) {
      const smer = i % 2 ? -1 : 1
      await page.mouse.move(stred.x + smer * k * 14, stred.y - k * 8)
    }
    await page.mouse.up()
    await page.waitForTimeout(120)
  }
  const posun = statistika(await page.evaluate(() => window.__odeber()))

  /* ---- přiblížení ---- */
  krok('měřím přiblížení')
  await page.evaluate(() => window.__odeber())
  for (const smer of [-1, -1, -1, 1, 1, 1]) {
    await page.mouse.move(stred.x, stred.y)
    await page.mouse.wheel(0, smer * 240)
    await page.waitForTimeout(400)
  }
  const zoom = statistika(await page.evaluate(() => window.__odeber()))

  // Kolik paměti to drží. U mapy z dlaždic je to údaj, který roste tiše.
  await cdp.send('Performance.enable')
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]))

  await ctx.close()
  return { zpomaleni, usazeni, posun, zoom, pamet: m.JSHeapUsedSize / 1048576 }
}

// Jen jedno kolo, bez zpomalování procesoru. SwiftShader je sám o sobě
// pomalejší než telefon; přidat k tomu ještě čtyřnásobné zpomalení znamená,
// že stránka přestane odpovídat a měří se čekání, ne kreslení.
const vysledky = [await zmer(1)]

const ms = (x) => `${x < 0 ? '—' : Math.round(x)} ms`

console.log('  Ustálení po přepnutí na malovanou mapu\n')
console.log('    procesor    čas')
console.log('    ' + '─'.repeat(24))
for (const v of vysledky) console.log(`    ${(v.zpomaleni + '×').padEnd(11)} ${ms(v.usazeni).padStart(8)}`)

for (const [jmeno, klic] of [
  ['Posun mapy prstem', 'posun'],
  ['Přiblížení a oddálení', 'zoom'],
]) {
  console.log(`\n  ${jmeno}\n`)
  console.log('    procesor    medián snímku   nejhorší 5 %   škubnutí nad 50 ms   snímků')
  console.log('    ' + '─'.repeat(72))
  for (const v of vysledky) {
    const s = v[klic]
    console.log(
      `    ${(v.zpomaleni + '×').padEnd(11)} ${ms(s.median).padStart(11)}   ${ms(s.p95).padStart(12)}   ` +
        `${String(s.skubnuti).padStart(15)}   ${String(s.snimku).padStart(9)}`
    )
  }
}

console.log('\n  Paměť')
for (const v of vysledky) console.log(`    ${(v.zpomaleni + '×').padEnd(11)} ${v.pamet.toFixed(0)} MB`)
console.log('')

await prohlizec.close()
srv.close()
