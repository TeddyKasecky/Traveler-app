/**
 * Kontrolní seznam parity – bod po bodu, s důkazy.
 *
 *   node scripts/parity.mjs
 *
 * Prochází věci, které si zadání vyžádalo ověřit: instalovatelnost PWA, přežití
 * uložených dat, tlačítko zpět, bezpečné okraje na iPhonu, CSV/zálohy/obnovu,
 * vlastní fotky, polohu, „Překvap mě“ a „Něco blízko“, export plánu.
 *
 * Část kontrol je statická (porovnání s originálem), část běží v opravdovém
 * prohlížeči na localhostu – tam je zabezpečený kontext, takže funguje service
 * worker, poloha i schránka. Doplněk k smoke.mjs, ne jeho náhrada.
 */

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { NOVE_STYLY } from './nove-styly.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 4184

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

/* ================= evidence ================= */

const body = []
let skupina = ''

const nadpis = (s) => {
  skupina = s
  console.log(`\n${s}`)
  console.log('─'.repeat(s.length))
}

/**
 * Zaznamená jeden bod seznamu.
 * @param {string} popis
 * @param {boolean} ok
 * @param {string} dukaz  co konkrétně to dokazuje – tohle jde do PARITA.md
 */
const bod = (popis, ok, dukaz) => {
  body.push({ skupina, popis, ok, dukaz })
  console.log(`  ${ok ? 'ok   ' : 'CHYBA'} ${popis.padEnd(46)} ${dukaz}`)
}

/** Spustí kontrolu a chybu v ní bere jako neúspěch, ne jako pád skriptu. */
const zkus = async (popis, fn) => {
  try {
    const { ok, dukaz } = await fn()
    bod(popis, ok, dukaz)
  } catch (e) {
    bod(popis, false, `výjimka: ${e.message}`)
  }
}

/* ================= statické kontroly ================= */

const original = fs.readFileSync(path.join(ROOT, 'reference', 'index-original.html'), 'utf8')

nadpis('1. Bezpečné okraje na iPhonu (safe-area)')

await zkus('viewport-fit=cover v hlavičce', async () => {
  const nase = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  const ok = nase.includes('viewport-fit=cover') && original.includes('viewport-fit=cover')
  return { ok, dukaz: 'v originále i u nás' }
})

await zkus('stejný počet použití env(safe-area-inset-*)', async () => {
  const spocti = (s) => (s.match(/env\(safe-area-inset-/g) || []).length
  const puvodni = spocti(original.slice(original.indexOf('<style>'), original.indexOf('</style>')))
  // Prvky, které v originále protějšek nemají. Svůj bezpečný okraj mají správně,
  // ale do porovnání s originálem nepatří – jinak by jejich přidání vypadalo
  // jako chyba. Seznam je sdílený s check-css-parity.mjs, viz nove-styly.mjs.
  const jeNovy = (f) => NOVE_STYLY.some((n) => f.endsWith(n))
  const vsechny = fs
    .readdirSync(path.join(ROOT, 'src', 'styles'), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.css'))
  const cti = (f) => fs.readFileSync(path.join(ROOT, 'src', 'styles', f), 'utf8')
  const nase = spocti(vsechny.filter((f) => !jeNovy(f)).map(cti).join(''))
  const novy = spocti(vsechny.filter(jeNovy).map(cti).join(''))
  return { ok: nase === puvodni, dukaz: `originál ${puvodni}× · naše ${nase}× (+ ${novy}× v nových prvcích)` }
})

nadpis('2. Klíče v localStorage se nezměnily')

await zkus('všechny tři klíče doslova jako v originále', async () => {
  const storage = fs.readFileSync(path.join(ROOT, 'src', 'core', 'storage.js'), 'utf8')
  const chybi = ['vandrbuch:v1', 'vandrbuch:photos', 'vandrbuch:prefs'].filter(
    (k) => !storage.includes(`'${k}'`) || !original.includes(`'${k}'`)
  )
  return { ok: !chybi.length, dukaz: chybi.length ? `chybí ${chybi}` : 'vandrbuch:v1 · :photos · :prefs' }
})

nadpis('2c. Service worker se nepřeinstaluje pro nic za nic')

await zkus('předukládaný seznam je seřazený', async () => {
  // Verze cache je otisk toho seznamu. `Object.keys(bundle)` ale nevrací pokaždé
  // stejné pořadí – stačilo, aby si dva fonty prohodily místo, a verze vyšla jiná,
  // i když se nezměnil jediný bajt. Telefon si pak stáhl celou aplikaci znovu.
  const sw = fs.readFileSync(path.join(ROOT, 'dist', 'sw.js'), 'utf8')
  const seznam = [...sw.matchAll(/"(\.\/[^"]*)"/g)].map((m) => m[1])
  const serazeny = [...seznam].sort()
  const ok = seznam.length > 0 && seznam.every((x, i) => x === serazeny[i])
  return {
    ok,
    dukaz: ok
      ? `${seznam.length} souborů, seřazeno – verze závisí jen na obsahu`
      : 'pořadí není stabilní, verze cache se bude měnit i beze změny obsahu',
  }
})

/* ================= prohlížeč ================= */

const srv = http.createServer((req, res) => {
  const cesta = decodeURIComponent(req.url.split('?')[0])
  let soubor = path.join(ROOT, 'dist', cesta === '/' ? 'index.html' : cesta)
  if (!fs.existsSync(soubor) || fs.statSync(soubor).isDirectory()) soubor = path.join(ROOT, 'dist', 'index.html')
  res.writeHead(200, { 'Content-Type': TYPY[path.extname(soubor)] || 'application/octet-stream' })
  res.end(fs.readFileSync(soubor))
})
await new Promise((r) => srv.listen(PORT, r))
const ADRESA = `http://localhost:${PORT}/`

const prohlizec = await chromium.launch({ executablePath: EDGE, headless: true })
const ctx = await prohlizec.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ['geolocation', 'clipboard-read', 'clipboard-write'],
  geolocation: { latitude: 47.2692, longitude: 11.4041 }, // Innsbruck
  locale: 'cs-CZ',
})
// Hlášky (toasty) zmizí po pár vteřinách, takže je nejde číst až potom.
// Tenhle pozorovatel je zaznamenává průběžně a přežije i znovunačtení stránky.
await ctx.addInitScript(() => {
  window.__hlasky = []
  addEventListener('DOMContentLoaded', () => {
    const t = document.getElementById('toast')
    if (!t) return
    new MutationObserver(() => {
      const s = t.textContent.trim()
      if (s && window.__hlasky[window.__hlasky.length - 1] !== s) window.__hlasky.push(s)
    }).observe(t, { childList: true, characterData: true, subtree: true })
  })
})

const page = await ctx.newPage()

const chybyKonzole = []
page.on('console', (m) => m.type() === 'error' && chybyKonzole.push(m.text()))
page.on('pageerror', (e) => chybyKonzole.push(`výjimka: ${e.message}`))

await page.goto(ADRESA, { waitUntil: 'load' })
await page.waitForTimeout(1200)
await page.click('#introGo')
await page.waitForTimeout(200)

nadpis('3. Instalace jako aplikace (PWA)')

await zkus('manifest se načte a je platný', async () => {
  const m = await page.evaluate(async () => {
    const r = await fetch(document.querySelector('link[rel=manifest]').href)
    return { stav: r.status, data: await r.json() }
  })
  const ok = m.stav === 200 && m.data.display === 'standalone' && m.data.icons.length === 2
  return { ok, dukaz: `HTTP ${m.stav} · display=${m.data.display} · ${m.data.icons.length} ikony` }
})

await zkus('obě ikony se opravdu stáhnou', async () => {
  const r = await page.evaluate(async () => {
    const zkus = (u) =>
      new Promise((res) => {
        const i = new Image()
        i.onload = () => res(`${i.naturalWidth}×${i.naturalHeight}`)
        i.onerror = () => res('CHYBA')
        i.src = u
      })
    return [await zkus('./icon-192.png'), await zkus('./icon-512.png')]
  })
  return { ok: r[0] === '192×192' && r[1] === '512×512', dukaz: r.join(' · ') }
})

await zkus('logo v hlavičce má rozměry (není rozbité)', async () => {
  const w = await page.evaluate(() => document.getElementById('logo').naturalWidth)
  return { ok: w > 0, dukaz: `naturalWidth ${w} px` }
})

await zkus('service worker běží a řídí stránku', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(800)
  const r = await page.evaluate(() => !!navigator.serviceWorker.controller)
  return { ok: r, dukaz: r ? 'controller nastavený' : 'stránku nikdo neřídí' }
})

await zkus('apple-touch-icon pro iPhone', async () => {
  const h = await page.evaluate(() => document.querySelector('link[rel="apple-touch-icon"]')?.href || '')
  return { ok: h.includes('icon-192'), dukaz: h.split('/').pop() }
})

// intro se po reloadu už neukazuje (seen=true), ale pro jistotu
await page.evaluate(() => document.getElementById('intro')?.classList.remove('show'))

nadpis('4. Tlačítko zpět (Android)')

// Vlastní karta s čistou historií – jinak by do sebe jednotlivé kontroly zasahovaly.
const zpetPage = await ctx.newPage()
await zpetPage.goto(ADRESA, { waitUntil: 'load' })
await zpetPage.waitForTimeout(1200)
await zpetPage.evaluate(() => document.getElementById('introGo')?.click())
await zpetPage.waitForTimeout(300)

const zalozka = (p = zpetPage) => p.evaluate(() => location.hash || '#home')

await zkus('přepnutí záložky zapíše historii', async () => {
  await zpetPage.click('#tabs button[data-tab="list"]')
  await zpetPage.waitForTimeout(250)
  const a = await zalozka()
  await zpetPage.click('#tabs button[data-tab="disc"]')
  await zpetPage.waitForTimeout(250)
  const b = await zalozka()
  await zpetPage.goBack()
  await zpetPage.waitForTimeout(400)
  const c = await zalozka()
  return { ok: a === '#list' && b === '#disc' && c === '#list', dukaz: `${a} → ${b} → zpět → ${c}` }
})

await zkus('zpět zavře detail místa a nechá záložku být', async () => {
  await zpetPage.click('#tabs button[data-tab="list"]')
  await zpetPage.waitForTimeout(250)
  await zpetPage.locator('#listInner .card').first().click()
  await zpetPage.waitForTimeout(1100)
  const otevreno = await zpetPage.locator('#sheet.show').count()
  // Ťuknutí na kartu volá goTo(), a to přepíná na mapu – stejně jako originál
  // (index-original.html:1015). Proto se porovnává záložka před a po, ne #list.
  const pred = await zalozka()
  await zpetPage.goBack()
  await zpetPage.waitForTimeout(600)
  const zavreno = await zpetPage.locator('#sheet.show').count()
  const po = await zalozka()
  return {
    ok: otevreno === 1 && zavreno === 0 && po === pred,
    dukaz: `otevřen → zpět → zavřen · záložka ${pred} zůstala ${po}`,
  }
})

await zkus('zpět zavře panel filtrů a nechá záložku být', async () => {
  await zpetPage.click('#tabs button[data-tab="map"]')
  await zpetPage.waitForTimeout(250)
  await zpetPage.click('#fabFilter')
  await zpetPage.waitForTimeout(500)
  const otevreno = await zpetPage.locator('#filters.show').count()
  const pred = await zalozka()
  await zpetPage.goBack()
  await zpetPage.waitForTimeout(600)
  const zavreno = await zpetPage.locator('#filters.show').count()
  const po = await zalozka()
  return { ok: otevreno === 1 && zavreno === 0 && po === pred, dukaz: `otevřen → zpět → zavřen · zůstalo ${po}` }
})

await zpetPage.close()

nadpis('5. Poloha, „Něco blízko“ a „Překvap mě“')

await zkus('„Moje poloha“ najde souřadnice', async () => {
  await page.click('#tabs button[data-tab="map"]')
  await page.waitForTimeout(300)
  await page.click('#fabLoc')
  await page.waitForTimeout(2000)
  // circleMarker z map.js:93 se kreslí jako <path> s výplní --rust
  const znacka = await page.locator('#map path[fill="#D96B3C"]').count()
  const h = await page.evaluate(() => window.__hlasky || [])
  const nalezena = h.some((x) => /poloha nalezena/i.test(x))
  return { ok: znacka > 0 && nalezena, dukaz: `${znacka}× puntík · hlášky: ${h.length ? h.join(' | ') : 'žádné'}` }
})

await zkus('„Něco blízko“ přepne na Objevuj', async () => {
  await page.click('#tabs button[data-tab="home"]')
  await page.waitForTimeout(300)
  await page.locator('.mood', { hasText: 'Něco blízko' }).click()
  await page.waitForTimeout(700)
  const kde = await zalozka(page)
  return { ok: kde === '#disc', dukaz: `záložka ${kde}` }
})

await zkus('„Překvap mě“ vylosuje místo', async () => {
  await page.click('#tabs button[data-tab="home"]')
  await page.waitForTimeout(300)
  await page.locator('.mood', { hasText: 'Překvap mě' }).click()
  await page.waitForTimeout(900)
  const t = await page.locator('#toast').innerText().catch(() => '')
  const tip = await page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:prefs') || '{}').lastTip)
  return { ok: !!tip, dukaz: `vylosováno ${tip} · „${t.trim()}“` }
})

nadpis('6. Vlastní fotka, poznámka, hvězdičky, plamínky')

// jednobarevné PNG 8×8 – nejmenší platný obrázek, na který canvas zabere
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64'
)

/** Panel detailu roluje a Playwright do něj nedosáhne – klikáme přes DOM. */
const klikVDetailu = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel)

/**
 * Sáhne do skladu fotek v IndexedDB.
 *
 * Fotky nově nebydlí v localStorage: ten má strop kolem 5 MB, fotky se do něj
 * ukládaly jako base64 a po pár desítkách kusů v něm nezbylo místo na poznámky.
 * Ověřuje se proto tam, kde data opravdu jsou.
 *
 * @param {'klice'|'smazat'} co
 */
const skladFotek = (co) =>
  page.evaluate(
    (akce) =>
      new Promise((hotovo) => {
        const r = indexedDB.open('vandrbuch', 1)
        r.onsuccess = () => {
          const db = r.result
          if (!db.objectStoreNames.contains('fotky')) return hotovo([])
          const tr = db.transaction('fotky', 'readwrite')
          const s = tr.objectStore('fotky')
          if (akce === 'smazat') s.clear()
          const g = s.getAllKeys()
          tr.oncomplete = () => hotovo(g.result.map(String))
          tr.onerror = () => hotovo([])
        }
        r.onerror = () => hotovo([])
      }),
    co
  )

await zkus('fotka se uloží pod id místa', async () => {
  // Zavřít případný otevřený detail, jinak mini-mapa odchytává kliknutí.
  await page.evaluate(() => document.getElementById('sheet').classList.remove('show'))
  await page.waitForTimeout(300)
  await page.click('#tabs button[data-tab="list"]')
  await page.waitForTimeout(400)
  await page.locator('#listInner .card').first().click()
  await page.waitForTimeout(1100)
  await page.setInputFiles('#photoIn', { name: 't.png', mimeType: 'image/png', buffer: PNG })
  await page.waitForTimeout(1400)
  const p = await skladFotek('klice')
  return { ok: p.length === 1, dukaz: `IndexedDB má ${p.length} záznam (${p[0] || '—'})` }
})

await zkus('poznámka, hvězdičky a plamínky se uloží', async () => {
  await page.fill('#noteBox', 'Zkušební poznámka ěščřžýáíé')
  await page.waitForTimeout(700)
  await klikVDetailu('#dStars button:nth-child(4)')
  await page.waitForTimeout(500)
  await klikVDetailu('#dPrio button:nth-child(3)')
  await page.waitForTimeout(600)
  const v = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('vandrbuch:v1'))
    return {
      pozn: Object.values(s.notes)[0] || '',
      hvezd: Object.values(s.rating)[0] || 0,
      plam: Object.values(s.prio)[0] || 0,
    }
  })
  const ok = v.pozn.includes('ěščřžýáíé') && v.hvezd === 4 && v.plam === 3
  return { ok, dukaz: `poznámka s diakritikou · ${v.hvezd} hvězdy · ${v.plam} plamínky` }
})

nadpis('7. Plán a jeho export')

await zkus('místo jde přidat do plánu', async () => {
  // Tlačítko je hluboko v rolovacím panelu, kam Playwright nedoscrolluje.
  await page.evaluate(() => document.getElementById('dPlan').click())
  await page.waitForTimeout(500)
  const n = await page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).plan.length)
  return { ok: n === 1, dukaz: `${n} zastávka v plánu` }
})

await zkus('„Kopírovat“ dá text do schránky', async () => {
  await page.goBack()
  await page.waitForTimeout(400)
  await page.click('#tabs button[data-tab="plan"]')
  await page.waitForTimeout(400)
  await page.click('#planShare')
  await page.waitForTimeout(600)
  const t = await page.evaluate(() => navigator.clipboard.readText())
  return { ok: t.includes('Vandrbuch') && /\d+\.\s/.test(t), dukaz: `${t.split('\n')[0]} …` }
})

await zkus('„Do navigace“ složí odkaz do Google Maps', async () => {
  const url = await page.evaluate(() => {
    let z = ''
    const p = window.open
    window.open = (u) => { z = u; return null }
    document.getElementById('planNav').click()
    window.open = p
    return z
  })
  const ok = url.startsWith('https://www.google.com/maps/dir/?api=1&destination=')
  return { ok, dukaz: `${url.slice(0, 62)}…` }
})

nadpis('8. Záloha a obnova')

await zkus('záloha obsahuje všech pět druhů dat', async () => {
  const z = await page.evaluate(() => {
    let obsah = null
    const p = URL.createObjectURL
    URL.createObjectURL = (b) => { obsah = b; return 'blob:x' }
    const a = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () {}
    document.getElementById('expBtn').click()
    URL.createObjectURL = p
    HTMLAnchorElement.prototype.click = a
    return obsah.text()
  })
  const d = JSON.parse(z)
  const ma = (k, v) => (v && Object.keys(v).length ? k : null)
  const nalezeno = [
    ma('notes', d.notes),
    ma('stav', d.stav),
    ma('rating', d.rating),
    d.plan?.length ? 'plan' : null,
    ma('prio', d.prio),
    ma('photos', d.photos),
    ma('prefs', d.prefs),
  ].filter(Boolean)
  const chybi = ['notes', 'rating', 'plan', 'prio', 'photos'].filter((k) => !nalezeno.includes(k))
  return { ok: !chybi.length, dukaz: chybi.length ? `CHYBÍ: ${chybi.join(', ')}` : nalezeno.join(' · ') }
})

await zkus('obnova vrátí všechno zpátky', async () => {
  const zaloha = await page.evaluate(() => {
    let o = null
    const p = URL.createObjectURL
    URL.createObjectURL = (b) => { o = b; return 'blob:x' }
    const a = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () {}
    document.getElementById('expBtn').click()
    URL.createObjectURL = p
    HTMLAnchorElement.prototype.click = a
    return o.text()
  })

  // Vyčistit i sklad fotek v IndexedDB. Bez toho by tam zůstala fotka z dřívější
  // kontroly a „obnova vrátila fotku" by prošla, i kdyby ji záloha vůbec nenesla.
  await skladFotek('smazat')
  await page.evaluate(() => {
    localStorage.removeItem('vandrbuch:v1')
    localStorage.removeItem('vandrbuch:photos')
    localStorage.removeItem('vandrbuch:prefs')
    localStorage.removeItem('vandrbuch:data')
  })
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1200)
  await page.evaluate(() => document.getElementById('introGo')?.click())
  await page.waitForTimeout(300)

  await page.click('#tabs button[data-tab="map"]')
  await page.waitForTimeout(250)
  await page.click('#fabFilter')
  await page.waitForTimeout(400)
  await page.setInputFiles('#impIn', { name: 'z.json', mimeType: 'application/json', buffer: Buffer.from(zaloha) })
  await page.waitForTimeout(1200)

  const v = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('vandrbuch:v1'))
    return {
      pozn: Object.values(s.notes)[0] || '',
      hvezd: Object.values(s.rating)[0] || 0,
      plam: Object.values(s.prio)[0] || 0,
      plan: s.plan.length,
    }
  })
  v.fotek = (await skladFotek('klice')).length
  const ok = v.pozn.includes('ěščřžýáíé') && v.hvezd === 4 && v.plam === 3 && v.plan === 1 && v.fotek === 1
  return { ok, dukaz: `poznámka ✓ · ${v.hvezd} hvězdy · ${v.plam} plamínky · ${v.plan} zastávka · ${v.fotek} fotka` }
})

nadpis('9. Import CSV a „Vrátit vestavěná data“')

const CSV = `Název,Kategorie,Typ,Země,Oblast,Zdarma/Placené,Doba návštěvy,Child friendly,Psi,Sezóna,Popis,Zajímavost,Krátce,Výbava,Latitude,Longitude
Zkušební vodopád,Vodopády,Vodopád,Rakousko,Tyrolsko,Zdarma,1-2 h,Ano,Ano,květen-říjen,Popis,Zajímavost,Krátce k místu,"pohorky, voda",47.1234,11.5678
`

await zkus('CSV se naimportuje a vymění data', async () => {
  await page.setInputFiles('#csvIn', { name: 'test.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf8') })
  await page.waitForTimeout(1200)
  const n = await page.locator('#totalN').innerText()
  // Data z importu mají vlastní klíč `vandrbuch:data`. Dřív ležela ve
  // `vandrbuch:v1` u poznámek, takže se půl megabajtu přepisovalo při každé změně.
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:data') || '{}').mista?.[0]?.id)
  return { ok: n === '1' && id === 'zkusebni-vodopad-234', dukaz: `${n} místo · id ${id}` }
})

await zkus('„Vrátit vestavěná data“ obnoví 580 míst', async () => {
  page.once('dialog', (d) => d.accept())
  await page.click('#dataReset')
  await page.waitForTimeout(1500)
  const n = await page.locator('#totalN').innerText()
  const ov = await page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:data') || '{}').mista)
  return { ok: n === '580' && !ov, dukaz: `${n} míst · vlastní data ${ov === null ? 'null' : ov}` }
})

nadpis('10. Uložená data přežijí aktualizaci aplikace')

await zkus('smazání celé cache o data nepřipraví', async () => {
  const pred = await page.evaluate(() => localStorage.getItem('vandrbuch:v1').length)
  const smazano = await page.evaluate(async () => {
    const k = await caches.keys()
    await Promise.all(k.map((x) => caches.delete(x)))
    return k.length
  })
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1500)
  const po = await page.evaluate(() => localStorage.getItem('vandrbuch:v1').length)
  const mist = await page.locator('#totalN').innerText()
  return {
    ok: pred === po && mist === '580',
    dukaz: `smazáno ${smazano} cache · vandrbuch:v1 ${pred} B → ${po} B · appka naběhla s ${mist} místy`,
  }
})

/* ================= shrnutí ================= */

nadpis('Chyby v konzoli za celý průchod')
bod('žádná chyba v konzoli', chybyKonzole.length === 0, chybyKonzole.length ? chybyKonzole.join(' | ') : 'nula')

const selhalo = body.filter((b) => !b.ok)
console.log(`\n${body.length - selhalo.length}/${body.length} bodů prošlo`)

fs.writeFileSync(path.join(ROOT, '.parita.json'), JSON.stringify(body, null, 2))
console.log('Podklady: .parita.json')

await prohlizec.close()
srv.close()
process.exit(selhalo.length ? 1 : 0)
