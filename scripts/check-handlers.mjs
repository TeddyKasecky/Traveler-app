/**
 * Hlídá, že se při přestavbě neztratilo napojení žádného tlačítka.
 *
 *   node scripts/check-handlers.mjs
 *
 * Rozdělení kódu do modulů je nejnáchylnější přesně na tohle: funkce se přenese,
 * ale řádek `document.getElementById('neco').onclick = …` zůstane v originále.
 * Aplikace pak vypadá úplně stejně a jen jedno tlačítko mlčí. Očima se to nenajde.
 *
 * Porovnává se za běhu, ne regulárními výrazy nad zdrojákem – ty na jednopísmenných
 * proměnných (`b.onclick=`) hlásily nesmysly. Obě verze projdou stejnou cestu
 * (všechny záložky, filtry, detail) a pak se sesbírá, které prvky s `id` mají
 * napojenou obsluhu. Zachytí se i `addEventListener`, aby nezáleželo na zápisu.
 */

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

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

/** Stará verze nemá vedle sebe manifest ani sw.js – musí dostat 404, jako dnes. */
function server(koren, port) {
  const s = http.createServer((req, res) => {
    const cesta = decodeURIComponent(req.url.split('?')[0])
    const soubor = path.join(koren, cesta === '/' ? 'index.html' : cesta)
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

/** Zaznamenává addEventListener, ať nezáleží na tom, jestli se píše `.onclick=`. */
const ODPOSLECH = () => {
  window.__posluchaci = []
  const p = EventTarget.prototype.addEventListener
  EventTarget.prototype.addEventListener = function (typ, ...zbytek) {
    if (this instanceof Element && this.id) window.__posluchaci.push(`${this.id}.on${typ}`)
    return p.call(this, typ, ...zbytek)
  }
}

/** Projde aplikaci tak, aby se stihla napojit i tlačítka uvnitř panelů. */
async function projdi(page) {
  await page.waitForTimeout(1500)
  await page.evaluate(() => document.getElementById('introGo')?.click())
  await page.waitForTimeout(400)
  for (const t of ['home', 'map', 'disc', 'list', 'plan']) {
    await page.evaluate((x) => document.querySelector(`#tabs button[data-tab="${x}"]`)?.click(), t)
    await page.waitForTimeout(500)
  }
  await page.evaluate(() => document.getElementById('fabFilter')?.click())
  await page.waitForTimeout(500)
  await page.evaluate(() => document.querySelector('#listInner .radek')?.click())
  await page.waitForTimeout(1200)

  // Až úplně nakonec: vedlejší akce Plánu (Kopírovat, Vyprázdnit) se přestavbou
  // přesunuly pod „…“ a napojují se teprve při otevření nabídky. Nabídku navíc
  // zavře každé překreslení Plánu, takže musí zůstat otevřená až do sběru –
  // jinak by kontrola hlásila, že tlačítka z originálu nemají protějšek,
  // a měla by pravdu jen proto, že se na ně nedostala.
  // V originále `#planVice` neexistuje, takže se na staré verzi nic nestane.
  // Od srpna 2026 nabídka bydlí na dílu Itinerář – nejdřív se tam přepnout.
  await page.evaluate(() => document.querySelector('#tabs button[data-tab="plan"]')?.click())
  await page.waitForTimeout(500)
  await page.evaluate(() => document.querySelector('#planSegment button[data-seg="itinerar"]')?.click())
  await page.waitForTimeout(400)
  await page.evaluate(() => document.getElementById('planVice')?.click())
  await page.waitForTimeout(400)
}

/** Vrátí množinu „id.udalost" pro všechna napojení na prvky s id. */
const posbirej = (page) =>
  page.evaluate(() => {
    const UD = ['onclick', 'onchange', 'oninput', 'onkeydown', 'onsubmit', 'onblur', 'onfocus']
    const out = new Set(window.__posluchaci || [])
    for (const el of document.querySelectorAll('[id]')) {
      for (const u of UD) if (typeof el[u] === 'function') out.add(`${el.id}.${u}`)
    }
    return [...out]
  })

/* ---------- obě verze ---------- */

const srvStara = await server(path.join(ROOT, 'reference'), 4191)
const srvNova = await server(path.join(ROOT, 'dist'), 4192)

const b = await chromium.launch({ executablePath: EDGE, headless: true })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
await ctx.addInitScript(ODPOSLECH)

const nactiA = await ctx.newPage()
await nactiA.goto('http://localhost:4191/index-original.html', { waitUntil: 'load' })
await projdi(nactiA)
const stara = new Set(await posbirej(nactiA))

const nactiB = await ctx.newPage()
await nactiB.goto('http://localhost:4192/', { waitUntil: 'load' })
await projdi(nactiB)
const nova = new Set(await posbirej(nactiB))

await b.close()
srvStara.close()
srvNova.close()

/* ---------- porovnání ---------- */

// Prvky, které v originále vůbec nebyly nebo je přidal Leaflet z CDN.
const NEPODSTATNE = (x) => /^(map|mm2)\./.test(x)

/**
 * Napojení, která se přestavbou rozvržení přestěhovala jinam.
 *
 * Kontrola porovnává podle `id`, takže přesunutá funkce vypadá jako ztracená.
 * Tenhle seznam říká, kde ji hledat – a **pořád kontroluje**: nové napojení
 * musí v aplikaci opravdu existovat, jinak se ohlásí stejně jako dřív.
 * Není to obcházení, je to popis skutečné cesty aplikace.
 *
 * `null` znamená, že funkce zanikla i s prvkem; důvod je u ní.
 */
const PRESUNUTO = {
  // Rozbalovací přehled bikeparků na Domů zanikl. 32 karet jedné kategorie
  // z deseti zabíralo většinu obrazovky a v předlohách nic takového není;
  // místa jsou v kolekci „Na kolo" a ceny v detailu místa (`.cenabox`).
  'bpTgl.onclick': null,
  // Pilulka polohy na Domů → kolečko vpravo nahoře v mapě.
  'locBtn.onclick': 'fabLoc.onclick',
  // Dlaždice „v plánu" v posuvném pruhu → odkaz „Otevřít plán" nad kartou výpravy.
  'wipPlan.onclick': 'homePlan.onclick',
  // Dlaždice „vykouzlit ✨" → průvodce v nabídce pod „+" na mapě.
  'wipWiz.onclick': 'plusVylet.onclick',
}

const nedostupne = []
for (const [puvodni, nove] of Object.entries(PRESUNUTO)) {
  if (nove && !nova.has(nove)) nedostupne.push(`${puvodni} → ${nove} (nové napojení chybí)`)
}

const chybi = [...stara]
  .filter((x) => !nova.has(x) && !NEPODSTATNE(x) && !(x in PRESUNUTO))
  .concat(nedostupne)
  .sort()
const navic = [...nova].filter((x) => !stara.has(x) && !NEPODSTATNE(x)).sort()

console.log(`Napojení ve staré verzi: ${stara.size}`)
console.log(`Napojení v nové verzi:   ${nova.size}\n`)

if (navic.length) {
  console.log(`Navíc proti originálu (${navic.length}):`)
  for (const x of navic) console.log(`    ${x}`)
  console.log()
}

if (chybi.length) {
  console.log(`CHYBÍ ${chybi.length} napojení – tlačítko by nic nedělalo:`)
  for (const x of chybi) console.log(`    ${x}`)
  console.log('\nNEPROŠLO')
  process.exit(1)
}

console.log('Každé napojení z originálu má v nové verzi protějšek.')
