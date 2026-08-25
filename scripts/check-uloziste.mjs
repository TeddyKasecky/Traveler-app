/**
 * Kontrola úložiště: co se stane, když dojde místo, a přežije stěhování dat.
 *
 *   npm run check-uloziste     (potřebuje `npm run build`)
 *
 * Vzniklo kvůli chybě, kterou nebylo vidět: `uloz()` vracel `false`, když byl
 * localStorage plný, ale `save()` tu hodnotu zahazoval. Poznámky, hodnocení
 * i plán tedy tiše mizely – u fotek se to kontrolovalo, u zbytku ne. Na cestě,
 * kde je záloha jediná pojistka, je to ta nejhorší možná chyba.
 *
 * Ověřuje sedm věcí, které jdou poznat jen za běhu v opravdovém prohlížeči:
 *   1. fotky se přestěhují z localStorage do IndexedDB a starý klíč zmizí,
 *   2. data z importu CSV se přestěhují ze společného klíče do vlastního,
 *   3. při plné paměti se objeví varovný pruh, ne ticho,
 *   4. psaní poznámky nezapisuje při každé klávese, ale zapíše se,
 *   5. při odchodu ze stránky se rozepsaná poznámka dopíše hned,
 *   6. geometrie tras se přestěhuje do IndexedDB a ve `vandrbuch:v1` po ní
 *      nezůstane stopa (srpen 2026 – kvůli ní narostl na 85 % stropu),
 *   7. geometrie, na kterou už nic neodkazuje, se při startu uklidí.
 *
 * Používá Edge, který je na Windows nainstalovaný – nestahuje se žádný prohlížeč.
 */

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 4185

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

const barva = process.stdout.isTTY && !process.env.NO_COLOR
const cerveny = (s) => (barva ? `\x1b[31m${s}\x1b[0m` : s)
const zeleny = (s) => (barva ? `\x1b[32m${s}\x1b[0m` : s)

/** Malý statický server nad dist/, stejný jako ve smoke.mjs. */
function server(koren) {
  return http.createServer((req, res) => {
    const cesta = decodeURIComponent(req.url.split('?')[0])
    let soubor = path.join(koren, cesta === '/' ? 'index.html' : cesta)
    if (!fs.existsSync(soubor) || fs.statSync(soubor).isDirectory()) soubor = path.join(koren, 'index.html')
    res.writeHead(200, { 'Content-Type': TYPY[path.extname(soubor)] || 'application/octet-stream' })
    res.end(fs.readFileSync(soubor))
  })
}

if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  console.error(cerveny('Chybí dist/ – nejdřív `npm run build`.'))
  process.exit(1)
}

const srv = server(path.join(ROOT, 'dist'))
await new Promise((r) => srv.listen(PORT, r))
const ADRESA = `http://localhost:${PORT}/`

const b = await chromium.launch({ executablePath: EDGE, headless: true })

const vysledky = []
const kontrola = async (popis, fn, ocekavano) => {
  let hodnota
  try {
    hodnota = await fn()
  } catch (e) {
    hodnota = `CHYBA: ${e.message}`
  }
  const ok = ocekavano === undefined ? !!hodnota : String(hodnota) === String(ocekavano)
  vysledky.push({ popis, ok })
  console.log(`  ${ok ? 'ok   ' : cerveny('CHYBA')} ${popis.padEnd(48)} ${hodnota}`)
}

/** Čistý profil pro každý scénář – localStorage ani IndexedDB se nesmí míchat. */
async function novaStranka(pred) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  if (pred) await page.addInitScript(pred)
  await page.goto(ADRESA, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  return { ctx, page }
}

/** Jedno místo se všemi 29 poli – aby se aplikace měla čím vykreslit. */
const TESTOVACI_MISTO = {
  id: 'zkusebni-misto-123',
  n: 'Zkušební místo',
  k: 'Vodopády',
  t: 'Vodopád',
  z: 'Rakousko',
  r: 'Tyrolsko',
  c: 'Zdarma',
  d: '1-2 h',
  ch: 'Ano',
  ps: '',
  s: 'celoročně',
  p: '',
  f: '',
  sh: 'Krátký popis.',
  av: '',
  bs: '',
  pdf: '',
  price: '',
  pv: false,
  pn: '',
  parking: null,
  g: [],
  col: [],
  w: '',
  ig: '',
  lat: 47.1,
  lon: 11.1,
  nb: [],
  img: '',
}

/** Přečte fotku z IndexedDB. Vrací dataURL, nebo null. */
const zIndexedDb = (id) =>
  new Promise((hotovo) => {
    const r = indexedDB.open('vandrbuch', 1)
    r.onsuccess = () => {
      const db = r.result
      if (!db.objectStoreNames.contains('fotky')) return hotovo(null)
      const tr = db.transaction('fotky', 'readonly')
      const g = tr.objectStore('fotky').get(id)
      tr.oncomplete = () => hotovo(g.result ?? null)
      tr.onerror = () => hotovo(null)
    }
    r.onerror = () => hotovo(null)
  })

/* ================= 1. stěhování fotek do IndexedDB ================= */

console.log('\n1. Fotky se přestěhují z localStorage do IndexedDB')
{
  const FOTKA = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  const { ctx, page } = await novaStranka(`
    localStorage.setItem('vandrbuch:photos', JSON.stringify({ 'zkusebni-misto-123': '${FOTKA}' }))
  `)

  await kontrola('fotka je v IndexedDB', () => page.evaluate(zIndexedDb, 'zkusebni-misto-123'), FOTKA)
  await kontrola(
    'starý klíč vandrbuch:photos je pryč',
    () => page.evaluate(() => localStorage.getItem('vandrbuch:photos') === null),
    true
  )
  await ctx.close()
}

/* ================= 2. stěhování dat z importu CSV ================= */

console.log('\n2. Data z importu CSV dostanou vlastní klíč')
{
  const stary = JSON.stringify({
    notes: { 'zkusebni-misto-123': 'stará poznámka' },
    stav: {},
    rating: {},
    plan: [],
    prio: {},
    dataOverride: [TESTOVACI_MISTO],
    seen: true,
  })
  const { ctx, page } = await novaStranka(`localStorage.setItem('vandrbuch:v1', ${JSON.stringify(stary)})`)

  await kontrola(
    'data jsou v novém klíči vandrbuch:data',
    () => page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:data') || '{}').mista?.length ?? 0),
    1
  )
  await kontrola(
    'ze starého klíče zmizela',
    () => page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).dataOverride === null),
    true
  )
  await kontrola(
    'poznámka stěhování přežila',
    () => page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).notes['zkusebni-misto-123']),
    'stará poznámka'
  )
  await kontrola('aplikace ukazuje nahraná data', () => page.locator('#totalN').innerText(), '1')
  await ctx.close()
}

/* ================= 3. plná paměť se ohlásí ================= */

console.log('\n3. Plná paměť se ohlásí varovným pruhem')
{
  const { ctx, page } = await novaStranka()
  await kontrola('pruh je na začátku schovaný', () => page.locator('#pruh').isHidden(), true)

  await page.click('#introGo')
  await page.click('#tabs button[data-tab="list"]')
  await page.waitForTimeout(400)
  await page.locator('#listInner .radek').first().click()
  await page.waitForTimeout(900)

  // Zaplnit úložiště doopravdy.
  //
  // Nestačí psát velké kusy, dokud to nepraskne: prohlížeč počítá jen rozdíl
  // velikostí, takže po prasknutí na 256 kB zbývá až čtvrt megabajtu volna
  // a přepis malého klíče v pohodě projde. Proto se velikost kusu půlí až
  // k desítkám bajtů – teprve pak je opravdu plno.
  const zbylo = await page.evaluate(() => {
    let velikost = 256 * 1024
    let zapsano = 0
    while (velikost > 32) {
      try {
        localStorage.setItem(`balast${zapsano}`, 'x'.repeat(velikost))
        zapsano++
      } catch {
        velikost = Math.floor(velikost / 2)
      }
    }
    return velikost
  })
  console.log(`     (úložiště zaplněné, volno pod ${zbylo} znaků)`)

  // Dlouhá poznámka musí záznam nafouknout – tím se teprve narazí na strop.
  await page.fill('#noteBox', 'A'.repeat(4000))
  await page.waitForTimeout(700)

  await kontrola('pruh se ukázal', () => page.locator('#pruh').isVisible(), true)
  await kontrola(
    'pruh říká, že je plno',
    () => page.locator('#pruh').innerText().then((t) => t.includes('Paměť je plná')),
    true
  )
  await kontrola('pruh nabízí zálohu', () => page.locator('#pruhAkce').count(), 1)
  await ctx.close()
}

/* ================= 4. odložený zápis poznámky ================= */

console.log('\n4. Psaní poznámky nezapisuje při každé klávese')
{
  const { ctx, page } = await novaStranka()
  await page.click('#introGo')
  await page.click('#tabs button[data-tab="list"]')
  await page.waitForTimeout(400)
  await page.locator('#listInner .radek').first().click()
  await page.waitForTimeout(900)

  const vLocalStorage = () =>
    page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('vandrbuch:v1') || '{}').notes || {}))

  await page.fill('#noteBox', 'ODLOZENY ZAPIS')
  await kontrola(
    'hned po napsání se ještě nezapisuje',
    () => vLocalStorage().then((s) => !s.includes('ODLOZENY ZAPIS')),
    true
  )

  await page.waitForTimeout(700)
  await kontrola(
    'po dopsání se poznámka zapíše',
    () => vLocalStorage().then((s) => s.includes('ODLOZENY ZAPIS')),
    true
  )
  await ctx.close()
}

/* ================= 5. doplach při odchodu ze stránky ================= */

console.log('\n5. Rozepsaná poznámka se dopíše při odchodu')
{
  const { ctx, page } = await novaStranka()
  await page.click('#introGo')
  await page.click('#tabs button[data-tab="list"]')
  await page.waitForTimeout(400)
  await page.locator('#listInner .radek').first().click()
  await page.waitForTimeout(900)

  await page.fill('#noteBox', 'NEDOPSANA POZNAMKA')
  // Bez čekání na odklad: přepnutí do jiné aplikace to musí dopsat hned.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(100)

  await kontrola(
    'poznámka je zapsaná bez čekání na odklad',
    () =>
      page
        .evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('vandrbuch:v1') || '{}').notes || {}))
        .then((s) => s.includes('NEDOPSANA POZNAMKA')),
    true
  )
  await ctx.close()
}

/* ================= 6. stěhování geometrie tras ================= */

console.log('\n6. Geometrie tras se přestěhuje do IndexedDB')
{
  // Do srpna 2026 ležela polyline z Mapy.com přímo ve `vandrbuch:v1` – 273 kB
  // na trasu, jedna na každou výpravu i na každou archivovanou cestu. Klíč
  // kvůli tomu narostl na 4,3 MB, tedy 85 % stropu, a `save()` to celé
  // serializoval při každém stisku klávesy v poznámce.
  //
  // Trasa je tu malá schválně: kontroluje se stěhování, ne velikost.
  const POLYLINE = [[47.1, 11.1], [47.2, 11.2], [47.3, 11.3]]
  const stary = JSON.stringify({
    notes: { 'zkusebni-misto-123': 'poznámka, která se nesmí ztratit' },
    stav: {},
    rating: {},
    plan: [],
    prio: {},
    seen: true,
    aktivniPrepocet: { otisk: 'A', polyline: POLYLINE, vzdalenostKm: 12, casMin: 20, spocitanoV: 1 },
    // Odložená výprava se svým vlastním přepočtem – druhé ze čtyř míst, kde
    // geometrie bydlela. Zapomenout na kterékoli z nich = klíč roste dál.
    vypravy: [{ nazev: 'Stará', plan: [], planDny: [], prepocet: { otisk: 'B', polyline: POLYLINE } }],
  })
  const { ctx, page } = await novaStranka(`localStorage.setItem('vandrbuch:v1', ${JSON.stringify(stary)})`)
  await page.waitForTimeout(800)

  await kontrola(
    'polyline zmizela z aktivního přepočtu',
    () => page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).aktivniPrepocet.polyline === undefined),
    true
  )
  await kontrola(
    'zmizela i z odložené výpravy',
    () => page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).vypravy[0].prepocet.polyline === undefined),
    true
  )
  // Ukazatel musí zůstat – bez otisku by se geometrie v úložišti nedala najít
  // a mapa by navždycky kreslila vzdušnou čáru.
  await kontrola('otisk jako ukazatel zůstal', () => page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).aktivniPrepocet.otisk), 'A')
  await kontrola('vzdálenost a čas zůstaly', () => page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).aktivniPrepocet.vzdalenostKm), 12)
  await kontrola(
    'poznámka stěhování přežila',
    () => page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).notes['zkusebni-misto-123']),
    'poznámka, která se nesmí ztratit'
  )
  await kontrola(
    'geometrie je v IndexedDB pod otiskem',
    () =>
      page.evaluate(
        () =>
          new Promise((hotovo) => {
            const r = indexedDB.open('vandrbuch-trasy', 1)
            r.onsuccess = () => {
              const db = r.result
              if (!db.objectStoreNames.contains('trasy')) return hotovo('sklad chybí')
              const tr = db.transaction('trasy', 'readonly')
              const g = tr.objectStore('trasy').get('A')
              tr.oncomplete = () => hotovo(JSON.stringify(g.result ?? null))
              tr.onerror = () => hotovo('chyba')
            }
            r.onerror = () => hotovo('nelze otevřít')
          })
      ),
    JSON.stringify(POLYLINE)
  )
  // Otisk 'B' patří odložené výpravě, takže se uklidit NESMÍ – úklid maže
  // jen to, na co ve storu nic neodkazuje.
  await kontrola(
    'trasa odložené výpravy se neuklidila',
    () =>
      page.evaluate(
        () =>
          new Promise((hotovo) => {
            const r = indexedDB.open('vandrbuch-trasy', 1)
            r.onsuccess = () => {
              const tr = r.result.transaction('trasy', 'readonly')
              const g = tr.objectStore('trasy').get('B')
              tr.oncomplete = () => hotovo(!!g.result)
              tr.onerror = () => hotovo(false)
            }
            r.onerror = () => hotovo(false)
          })
      ),
    true
  )
  await kontrola(
    'záloha už geometrii nenese',
    () =>
      page.evaluate(() => {
        const s = JSON.stringify(JSON.parse(localStorage.getItem('vandrbuch:v1')))
        return s.includes('polyline')
      }),
    false
  )
  await ctx.close()
}

/* ================= 7. úklid nepoužité geometrie ================= */

console.log('\n7. Geometrie, na kterou nic neodkazuje, se uklidí')
{
  // Zbytek po smazané výpravě nebo zrušené cestě. Velká schránka to unese,
  // ale to není důvod ji zaneřádit.
  const { ctx, page } = await novaStranka(`
    localStorage.setItem('vandrbuch:v1', JSON.stringify({ notes:{}, stav:{}, rating:{}, plan:[], prio:{}, seen:true }))
    // Sirotek se založí dřív, než appka nastartuje.
    indexedDB.open('vandrbuch-trasy', 1).onupgradeneeded = (e) => {
      e.target.result.createObjectStore('trasy')
    }
  `)
  await page.evaluate(
    () =>
      new Promise((hotovo) => {
        const r = indexedDB.open('vandrbuch-trasy', 1)
        r.onsuccess = () => {
          const tr = r.result.transaction('trasy', 'readwrite')
          tr.objectStore('trasy').put([[1, 2]], 'sirotek')
          tr.oncomplete = () => hotovo(true)
        }
      })
  )
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1500)

  await kontrola(
    'sirotek je pryč',
    () =>
      page.evaluate(
        () =>
          new Promise((hotovo) => {
            const r = indexedDB.open('vandrbuch-trasy', 1)
            r.onsuccess = () => {
              const tr = r.result.transaction('trasy', 'readonly')
              const g = tr.objectStore('trasy').get('sirotek')
              tr.oncomplete = () => hotovo(g.result === undefined)
              tr.onerror = () => hotovo(false)
            }
            r.onerror = () => hotovo(false)
          })
      ),
    true
  )
  await ctx.close()
}

/* ================= výsledek ================= */

await b.close()
srv.close()

const chyb = vysledky.filter((v) => !v.ok).length
console.log(`\n${chyb ? cerveny(`${vysledky.length - chyb}/${vysledky.length}`) : zeleny(`${vysledky.length}/${vysledky.length}`)} kontrol prošlo`)
if (chyb) process.exit(1)
