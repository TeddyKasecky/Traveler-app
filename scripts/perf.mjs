/**
 * Změří, jak rychle appka naběhne – a hlavně jak na pomalém telefonu.
 *
 *   node scripts/perf.mjs
 *
 * Zadání upozorňovalo, že se při startu rozparsuje 535 kB dat a seznam se
 * vykreslí najednou. Tohle to změří místo hádání.
 *
 * Zpomalení procesoru napodobuje mobil: 1× je tenhle počítač, 4× odpovídá zhruba
 * střední třídě, 6× starším nebo přehřátým telefonům. Síť se schválně nezpomaluje
 * – po instalaci appka běží ze service workeru, tedy z disku telefonu.
 */

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 4193

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
}

/* ---------- velikosti ---------- */

console.log('Co se stahuje (hostovaná varianta)\n')
const dist = path.join(ROOT, 'dist')
const soubory = fs
  .readdirSync(path.join(dist, 'assets'))
  .map((f) => {
    const b = fs.readFileSync(path.join(dist, 'assets', f))
    return { f, syrove: b.length, gzip: zlib.gzipSync(b).length }
  })
  .sort((a, b) => b.syrove - a.syrove)

const kb = (n) => `${(n / 1024).toFixed(0).padStart(5)} kB`
for (const s of soubory) console.log(`  ${s.f.padEnd(34)} ${kb(s.syrove)}  po zabalení ${kb(s.gzip)}`)
const celkem = soubory.reduce((a, s) => a + s.syrove, 0)
const celkemGz = soubory.reduce((a, s) => a + s.gzip, 0)
console.log(`  ${'CELKEM'.padEnd(34)} ${kb(celkem)}  po zabalení ${kb(celkemGz)}`)
console.log(
  `\n  Jednorázově při instalaci: ~${(celkemGz / 1024).toFixed(0)} kB přes síť.` +
    '\n  Potom už se nestahuje nic – appka běží z paměti telefonu.\n'
)

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
 * Zaznamená okamžik, kdy jsou špendlíky dokreslené.
 *
 * Nečeká se na 580 kusů: do stránky se vkládají jen ty ve výřezu, takže by se
 * jich tolik nikdy nesešlo. Čeká se, až se jejich počet přestane měnit.
 */
const SLEDUJ = () => {
  window.__tPiny = null
  window.__pinu = 0
  let stejne = 0
  const tik = () => {
    const n = document.querySelectorAll('.badge-pin').length
    stejne = n > 0 && n === window.__pinu ? stejne + 1 : 0
    window.__pinu = n
    if (stejne >= 3) {
      window.__tPiny = performance.now()
      return
    }
    requestAnimationFrame(tik)
  }
  requestAnimationFrame(tik)
}

const prohlizec = await chromium.launch({ executablePath: EDGE, headless: true })

/**
 * Jedno měření při daném zpomalení procesoru.
 * @param {number} zpomaleni
 */
async function zmer(zpomaleni) {
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(SLEDUJ)
  const page = await ctx.newPage()

  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Performance.enable')
  if (zpomaleni > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: zpomaleni })

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__tPiny !== null, null, { timeout: 60000 })

  const t = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0]
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]
    return {
      dcl: n.domContentLoadedEventEnd,
      load: n.loadEventEnd,
      fcp: fcp ? fcp.startTime : null,
      piny: window.__tPiny,
      pinu: window.__pinu,
    }
  })

  // Seznam: 250 karet najednou. Měří se od kliknutí po dokreslení.
  await page.evaluate(() => document.getElementById('introGo')?.click())
  await page.waitForTimeout(300)
  const seznam = await page.evaluate(async () => {
    const t0 = performance.now()
    document.querySelector('#tabs button[data-tab="list"]').click()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    return { ms: performance.now() - t0, karet: document.querySelectorAll('#listInner .radek').length }
  })

  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]))
  await ctx.close()

  return {
    zpomaleni,
    ...t,
    seznamMs: seznam.ms,
    karet: seznam.karet,
    skript: m.ScriptDuration * 1000,
    rozvrzeni: (m.LayoutDuration + m.RecalcStyleDuration) * 1000,
    pamet: m.JSHeapUsedSize / 1024 / 1024,
  }
}

console.log('Start aplikace\n')
console.log('  procesor   první obraz   DOM hotový   špendlíky hotové   seznam 250 karet')
console.log('  ' + '─'.repeat(74))

const vysledky = []
for (const z of [1, 4, 6]) {
  const v = await zmer(z)
  vysledky.push(v)
  const ms = (x) => `${Math.round(x)} ms`.padStart(9)
  console.log(
    `  ${(z + '×').padEnd(10)} ${ms(v.fcp)}     ${ms(v.dcl)}    ${ms(v.piny)}       ${ms(v.seznamMs)}`
  )
}

console.log('\nZ čeho se čas skládá\n')
console.log('  procesor   běh JavaScriptu   rozvržení a styly   paměť')
console.log('  ' + '─'.repeat(58))
for (const v of vysledky) {
  console.log(
    `  ${(v.zpomaleni + '×').padEnd(10)} ${(Math.round(v.skript) + ' ms').padStart(12)}      ${(
      Math.round(v.rozvrzeni) + ' ms'
    ).padStart(12)}    ${v.pamet.toFixed(0)} MB`
  )
}

console.log(`\n  Karet v seznamu: ${vysledky[0].karet} (strop je 250, viz NAPADY.md N10)`)
console.log(`  Špendlíků ve výřezu: ${vysledky[0].pinu} z 580 – do stránky jdou jen viditelné`)

await prohlizec.close()
srv.close()
