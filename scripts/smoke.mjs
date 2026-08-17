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
// colorScheme schválně napevno: od zavedení tmavého režimu by kontrola barvy
// pozadí jinak dopadla podle toho, jak má vzhled nastavený počítač, na kterém
// se pouští. Tmavý režim si měří vlastní průchod níž.
const page = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'light' })

/**
 * Cizí zdroje, které v testu stejně nejsou dostupné: dlaždice mapy a fotky.
 * V offline části navíc selhávají schválně – právě jejich selhání zapíná
 * zjednodušenou mapu, takže je nesmíme počítat jako chybu aplikace.
 */
const CIZI = (u) => u.includes('tile.openstreetmap.org') || u.includes('wikimedia.org')

page.on('console', (m) => {
  if (m.type() !== 'error') return
  if (CIZI(m.location()?.url || '')) return
  chyby.push(`konzole: ${m.text()}`)
})
page.on('pageerror', (e) => chyby.push(`výjimka: ${e.message}`))
page.on('requestfailed', (r) => {
  if (CIZI(r.url())) return
  problemySite.push(`${r.failure()?.errorText} ${r.url()}`)
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

await kontrola('sada ikon vložená', () => page.locator('svg symbol').count(), 57)
await kontrola('počet míst v hlavičce', () => page.locator('#totalN').innerText(), '580')
await kontrola('počítadlo na mapě', () => page.locator('#countN').innerText(), '580 míst')
// Nad mapou je od přestavby rozvržení pět rychlých pilulek podle předlohy
// (Vše, Kempy, Výhledy, Turistika, U vody) místo deseti chipů kategorií.
// Kategorie se tím neztratily – všech deset je v panelu Filtry, což ověřuje
// druhá kontrola. Bez ní by se dalo pět chybějících kategorií přehlédnout.
await kontrola('rychlé filtry nad mapou', () => page.locator('#chips .pilulka').count(), 5)
await kontrola('všech deset kategorií ve filtru', () => page.locator('#katRow .toggle.kat').count(), 10)
await kontrola('naplněné oblasti ve filtru', () => page.locator('#fReg option').count(), 118)
await kontrola('mapa má dlaždicovou vrstvu', () => page.locator('.leaflet-tile-pane').count(), 1)
// Do stránky se vkládají jen špendlíky ve výřezu – 580 kusů naráz stálo skoro
// vteřinu přepočtu stylů při každém posunu mapy. Že se tím žádné místo neztratí,
// ověřuje kontrola „po oddálení jsou vidět všechna místa“ níž.
await kontrola('špendlíky ve výřezu', () => page.locator('.badge-pin').count().then((n) => n > 0 && n <= 580))
await kontrola('uvítání se ukázalo', () => page.locator('#intro.show').count(), 1)
// #introGo musí být dosažitelné hned na prvním kroku – visí na něm čtyři
// kontroly, které klikají hned po načtení. Kdyby bylo až na posledním kroku,
// vytuhly by naráz a vypadalo by to jako zaseknutý prohlížeč.
await kontrola('uvítání má tři kroky', () => page.locator('#intro .introtecky span').count(), 3)
await kontrola('na prvním kroku je Přeskočit', () => page.locator('#introGo').innerText(), 'Přeskočit')
await page.click('#introDal')
await page.waitForTimeout(200)
await page.click('#introDal')
await page.waitForTimeout(200)
await kontrola('na posledním kroku je Jedeme', () => page.locator('#introGo').innerText(), 'Jedeme')
await kontrola('poslední krok nemá Dál', () => page.locator('#introDal').count(), 0)

// zavřít uvítání
await page.click('#introGo')
await kontrola('uvítání zavřené', () => page.locator('#intro.show').count(), 0)

// Domů
await kontrola('Domů je aktivní', () => page.locator('#panelHome.show').count(), 1)
// Domů se přestavěla na společné díly: hero pás s pozdravem místo obrázku
// dodávky (ta je nově na mapě, na trase plánu), karta výpravy, karusel
// „Možná dnes" a řada čísel.
await kontrola('hero pás s pozdravem', () => page.locator('#homeInner .heropas-obr').count(), 1)
await kontrola('karta výpravy na Domů', () => page.locator('#homeInner .vkarta').count(), 1)
await kontrola('karusel „Možná dnes"', () => page.locator('#homeInner .fotokarta').count().then((n) => n > 0))
await kontrola('statistika míst', () => page.locator('#homeInner .cislo b').first().innerText(), '580')
// Přehled 32 bikeparků odešel do kolekce „Na kolo". Ceny se ale ztratit
// nesměly – kontrola „ceny bikeparku v detailu" níž ověřuje, že jsou v detailu.
await kontrola('bikeparky už nejsou na Domů', () => page.locator('#homeInner .bpc').count(), 0)

// Seznam
await page.click('#tabs button[data-tab="list"]')
await page.waitForTimeout(300)
// Seznam od přestavby rozvržení nekreslí `.card` z panel.css, ale `.radek`
// z vzory.css – řádek s náhledem vlevo podle mockupu grafika/…(3).png.
await kontrola('seznam vykreslen', () => page.locator('#listInner .radek').count(), 250)
await kontrola('adresa se změnila', () => page.evaluate(() => location.hash), '#list')

// Zástupná ilustrace kategorie. Nestačí, že je v HTML <img> – musí se opravdu
// načíst, jinak by 318 míst bez vlastní fotky ukazovalo prázdný rámeček.
await kontrola('náhledy v kartách', () => page.locator('#listInner .radek-obr').count().then((n) => n > 0))
await kontrola('zástupná ilustrace se načetla', () =>
  page.locator('#listInner .radek-obr').first().evaluate((i) => i.complete && i.naturalWidth > 0)
)

// hledání bez diakritiky
await page.fill('#q', 'soutesky')
await page.waitForTimeout(300)
await kontrola('hledání "soutesky" bez diakritiky', () => page.locator('#listInner .radek').count(), 3)
await page.fill('#q', '')
await page.waitForTimeout(300)

// Profil – nemá tlačítko v liště, otevírá se kolečkem v hlavičce
await page.click('#profilOpen')
await page.waitForTimeout(300)
await kontrola('Profil se otevřel', () => page.locator('#panelProfil.show').count(), 1)
await kontrola('Profil má adresu', () => page.evaluate(() => location.hash), '#profil')
await kontrola('Profil má čísla', () => page.locator('#profilInner .pstat').count(), 6)
await page.goBack()
await page.waitForTimeout(400)

// Objevuj
await page.click('#tabs button[data-tab="disc"]')
await page.waitForTimeout(300)
// Objevuj má od přestavby rozvržení dlaždice `.dlazdice-kus` místo `.coll`
// a nálady jako pilulky – přestěhovaly se sem z Domů, kde je předloha nemá.
await kontrola('kolekce v Objevuj', () => page.locator('.dlazdice-kus').count(), 11)
await kontrola('nálady v Objevuj', () => page.locator('.nalady .pilulka').count(), 6)
// Karusel má od přestavby Domů dvě obrazovky, takže se musí počítat jen ten
// na Objevuj – bez `#discInner` by se sečetly oba a číslo by nic neznamenalo.
await kontrola('karusel doporučených', () => page.locator('#discInner .karusel .fotokarta').count(), 8)
await kontrola('oblasti v Objevuj', () => page.locator('.reg').count() )

// Výřez: po oddálení na celý svět musí být vidět všechna místa. Tohle je pojistka
// proti tomu, aby vkládání jen viditelných špendlíků některé místo tiše ztratilo.
await page.click('#tabs button[data-tab="map"]')
await page.waitForTimeout(400)
await page.mouse.move(195, 480)
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(250)
}
await page.waitForTimeout(1000)
await kontrola('po oddálení jsou vidět všechna místa', () => page.locator('.badge-pin').count(), 580)

// detail místa
await page.click('#tabs button[data-tab="list"]')
await page.waitForTimeout(300)
await page.locator('#listInner .radek').first().click()
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

// Ceny bikeparků: přehled odešel z Domů, ale údaje se nesměly ztratit.
// Cesta je přes hledání, aby se ověřilo i to, že se k bikeparku dá dostat.
//
// Na Seznam se kliká výslovně: `goBack()` zavře detail, ale zároveň se vrátí
// o záložku zpět, takže políčko `#q` nemusí být vidět.
await page.click('#tabs button[data-tab="list"]')
await page.waitForTimeout(300)
await page.fill('#q', 'bikepark')
await page.waitForTimeout(400)
await page.locator('#listInner .radek').first().click()
await page.waitForTimeout(900)
await kontrola('ceny bikeparku jsou v detailu', () => page.locator('#sheet .cenabox').count(), 1)
await kontrola('cena má štítek s částkou', () => page.locator('#sheet .cenabox .pricechip').count(), 1)
await page.goBack()
await page.waitForTimeout(500)
// Zase výslovně na Seznam: `goBack()` vrátil i záložku, takže by `#q` nebylo vidět.
await page.click('#tabs button[data-tab="list"]')
await page.waitForTimeout(300)
await page.fill('#q', '')
await page.waitForTimeout(300)

// Porovnání dvou míst. První kliknutí jen naplní košík, druhé otevře.
//
// Na Seznam se kliká výslovně: goBack() zavře detail, ale zároveň se vrátí
// na předchozí záložku, takže spoléhat na to, kde skončíme, by bylo křehké.
await page.click('#tabs button[data-tab="list"]')
await page.waitForTimeout(400)
await page.locator('#listInner .radek').first().click()
await page.waitForTimeout(700)
await page.evaluate(() => document.getElementById('dPorovnat').click())
await page.waitForTimeout(200)
await kontrola('jedno místo porovnání neotevře', () => page.locator('#porovnani.show').count(), 0)
// Detail leží nad spodní lištou (z-index 1300 vs 1200), takže se musí zavřít,
// než se dá kliknout na záložku.
await page.goBack()
await page.waitForTimeout(400)
await page.click('#tabs button[data-tab="list"]')
await page.waitForTimeout(400)
await page.locator('#listInner .radek').nth(1).click()
await page.waitForTimeout(700)
await page.evaluate(() => document.getElementById('dPorovnat').click())
await page.waitForTimeout(400)
await kontrola('druhé místo otevře porovnání', () => page.locator('#porovnani.show').count(), 1)
await kontrola('porovnání má obě hlavičky', () => page.locator('#porovnaniBody .pvhead').count(), 2)
await kontrola('porovnání má řádky', () => page.locator('#porovnaniBody .pvradek').count().then((n) => n >= 9))
await page.goBack()
await page.waitForTimeout(400)
await kontrola('zpět zavřelo porovnání', () => page.locator('#porovnani.show').count(), 0)
await kontrola('detail pod porovnáním zůstal', () => page.locator('#sheet.show').count(), 1)
await page.goBack()
await page.waitForTimeout(400)

// plán
await page.click('#tabs button[data-tab="plan"]')
await page.waitForTimeout(300)
await kontrola('prázdný plán má hlášku', () => page.locator('#planWrap .empty').count(), 1)
await kontrola('segment Přehled · Plán · Mapa', () => page.locator('#planSegment button').count(), 3)
// I bez jediné zastávky má člověk jednu výpravu – tu bezejmennou, kterou měl
// odjakživa. Kdyby se seznam ukázal prázdný, vypadalo by to, že se něco ztratilo.
await kontrola('výprava je v seznamu i prázdná', () => page.locator('.vypravaradek').count(), 1)
await kontrola('aktivní výprava je označená', () => page.locator('.vypravaradek.on').count(), 1)

// „Přidat zastávku“ → vybírátko míst → zastávka v plánu
await page.click('#planPridat')
await page.waitForTimeout(600)
await kontrola('vybírátko míst se otevřelo', () => page.locator('#vyberMista.show').count(), 1)
await kontrola('vybírátko nabízí místa', () => page.locator('#vmBody .radek').count().then((n) => n > 0))
await page.locator('#vmBody .radek').first().click()
await page.waitForTimeout(700)
await kontrola('zastávka přibyla do plánu', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).plan.length),
  1
)
await kontrola('počítadlo nad záložkou Plán', () => page.locator('#planCount').innerText(), '1')

// Navigace je nově pod jedním tlačítkem, ne třemi v řádku.
await page.click('#planDoNavigace')
await page.waitForTimeout(500)
await kontrola('nabídka navigace se otevřela', () => page.locator('#navSheet.show').count(), 1)
await kontrola('tři cíle navigace', () => page.locator('#navSheet .navvolba').count(), 3)
await page.click('#backdrop')
await page.waitForTimeout(400)

// uklidit po sobě, ať další kontroly počítají s prázdným plánem
await page.evaluate(() => document.getElementById('planVice').click())
await page.waitForTimeout(300)
page.once('dialog', (d) => d.accept())
await page.evaluate(() => document.getElementById('planClear').click())
await page.waitForTimeout(500)
await kontrola('plán se dá vyprázdnit', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).plan.length),
  0
)

// filtry – tlačítko je od přestavby rozvržení ve vyhledávacím řádku Mapy,
// takže se na mapu musí přepnout. Dřív to byl plovoucí knoflík vpravo dole,
// ale i ten byl pod panely, takže cesta je stejná.
await page.click('#tabs button[data-tab="map"]')
await page.waitForTimeout(300)
await kontrola('na mapě není žádný panel', () => page.locator('.panel.show').count(), 0)

// spodní část obrazovky Mapa – karta výpravy a uložená místa (nové, podle předlohy)
await kontrola('karta výpravy je na mapě', () => page.locator('#vypravaKarta .vkarta').count(), 1)
// Karta výpravy je na dvou obrazovkách naráz (Domů i Mapa), takže se počítá
// jen ta na mapě. Dřív měla `id` a druhá karta by kvůli tomu neměla obsluhu.
await kontrola('prázdná výprava nabízí průvodce', () => page.locator('#vypravaKarta .vk-zaloz').count(), 1)
await kontrola('bez uložených míst je hláška', () => page.locator('#mapUlozene .mapdolu-prazdno').count(), 1)
await page.click('#fabPlus')
await page.waitForTimeout(250)
await kontrola('„+" otevře nabídku', () => page.locator('#plusMenu button').count(), 3)
await page.click('#fabPlus')
await page.waitForTimeout(250)
await kontrola('druhé ťuknutí nabídku zavře', () => page.locator('#plusMenu[hidden]').count(), 1)

// rychlý filtr nad mapou se projeví hned, bez potvrzování
await page.click('#chips .pilulka[data-id="kempy"]')
await page.waitForTimeout(400)
await kontrola('rychlý filtr Kempy', () => page.locator('#countN').innerText(), '11 míst')
await page.click('#chips .pilulka[data-id="vse"]')
await page.waitForTimeout(400)
await kontrola('rychlý filtr Vše vrátí všechna', () => page.locator('#countN').innerText(), '580 míst')

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

/* ---------- formulář na přidání místa ---------- */

console.log('\n  formulář „Přidat místo":')

await page.click('#fabFilter')
await page.waitForTimeout(400)
await page.evaluate(() => document.getElementById('addOpen').click())
await page.waitForTimeout(1300)

await kontrola('formulář se otevřel', () => page.locator('#addPlace.show').count(), 1)
await kontrola('dlaždice kategorií', () => page.locator('#addBody [data-kat]').count(), 10)
await kontrola('dlaždice kolekcí', () => page.locator('#addBody [data-coll]').count(), 11)
await kontrola('mapka na výběr souřadnic', () => page.locator('#afMap.leaflet-container').count(), 1)
await kontrola('prázdný formulář hlásí, co chybí', () =>
  page.locator('.afsouhrn b').innerText().then((t) => /je potřeba doplnit/.test(t))
)

// vyplnit a ověřit, že výstup je platné místo
await page.fill('#addBody [data-pole="n"]', 'Zkušební vodopád')
await page.evaluate(() => document.querySelector('#addBody [data-pole="n"]').blur())
await page.waitForTimeout(400)
await page.evaluate(() => document.querySelector('#addBody [data-kat="Vodopády"]').click())
await page.waitForTimeout(400)

await kontrola('výběr kategorie se propíše', () => page.locator('#addBody [data-kat="Vodopády"].on').count(), 1)
await kontrola('výstup má 29 polí', () =>
  page.locator('#afText').inputValue().then((t) => Object.keys(JSON.parse(t)).length)
, 29)
await kontrola('id se vyrobí z názvu', () =>
  page.locator('#afText').inputValue().then((t) => JSON.parse(t).id.startsWith('zkusebni-vodopad-'))
)
await kontrola('koncept se uloží', () => page.evaluate(() => !!localStorage.getItem('vandrbuch:draft')))
await kontrola('původní klíče zůstaly nedotčené', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).seen === true)
)

// zavřít a uklidit po sobě
await page.evaluate(() => document.getElementById('addClose').click())
await page.waitForTimeout(500)
await kontrola('formulář se zavřel', () => page.locator('#addPlace.show').count(), 0)
await page.evaluate(() => localStorage.removeItem('vandrbuch:draft'))

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
  await kontrola('offline: špendlíky ve výřezu', () =>
    page.locator('.badge-pin').count().then((n) => n > 0 && n <= 580)
  )
  await kontrola('offline: styly se načetly', () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(250, 245, 236)')
  )
  await kontrola('offline: nadpisové písmo k dispozici', () =>
    page.evaluate(() => document.fonts.check('700 1.5rem "Playfair Display"'))
  )

  // Chování bez signálu má dvě části a obě se zkoušejí:
  //
  //   1. ONLINE REŽIM (výchozí). Dlaždice jsou z cizí domény, service worker
  //      je neukládá a hromadně stahovat se nesmějí. Plochy zemí ale leží pod
  //      nimi pořád, takže v mapě nevznikne díra, a rozsvítí se štítek.
  //      Samotné vypnutí sítě nestačí: prohlížeč si dlaždice z prvního načtení
  //      nechal ve své cache a beze změny výřezu je servíruje dál. Přiblížení
  //      vyžádá dlaždice, které v cache nejsou.
  //   2. OFFLINE MAPA, na kterou se přepíná pilulkou – malovaná krajina
  //      s kresbami a názvy zemí, která žádnou síť nepotřebuje.
  //
  // Napřed na záložku Mapa – po znovunačtení je navrchu panel Domů. Přibližuje
  // se kolečkem, ne tlačítkem: knoflíky +/− mapa nemá.
  await page.click('#tabs button[data-tab="map"]')
  await page.waitForTimeout(500)
  await page.mouse.move(195, 480)
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, -400)
    await page.waitForTimeout(500)
  }
  await page.waitForTimeout(3000) // ať stihnou selhat dlaždice a načíst se podklad

  await kontrola('offline: štítek chybějících dlaždic', () => page.locator('#offlineStitek').isVisible(), true)
  await kontrola('offline: podklad má vlastní vrstvu', () =>
    page.locator('.leaflet-podklad-pane canvas').count().then((n) => n >= 1)
  )
  await kontrola('offline: podklad je opravdu nakreslený', () =>
    page.evaluate(() => {
      const cv = document.querySelector('.leaflet-podklad-pane canvas')
      if (!cv) return false
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
      // Stačí najít jediný neprůhledný bod – prázdné plátno je průhledné celé.
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true
      return false
    })
  )

  // Přepnutí na malovanou offline mapu.
  await page.evaluate(() => document.getElementById('podkladBtn').click())
  await page.waitForTimeout(1200)

  await kontrola('offline mapa: přepínač hlásí stav', () => page.locator('#podkladBtn span').innerText(), 'Offline')
  await kontrola('offline mapa: názvy měst', () => page.locator('.mesto-popisek').count().then((n) => n > 0))
  // Barva moře se dřív zapínala třídou `#map.offline`. Ta zanikla – moře je
  // teď obyčejné pozadí mapy z tokenu `--mapa-more`. Hodnota se nepočítá ručně,
  // nechá se přeložit prohlížečem přes pomocný prvek: zapsaný `#C6DAE1`
  // a spočítaný `rgb(198, 218, 225)` jsou tatáž barva a porovnání řetězců
  // by na tom padalo.
  await kontrola('offline mapa: barva moře, ne šeď', () =>
    page.evaluate(() => {
      const sonda = document.createElement('div')
      sonda.style.color = 'var(--mapa-more)'
      document.body.appendChild(sonda)
      const ocekavano = getComputedStyle(sonda).color
      sonda.remove()
      return getComputedStyle(document.getElementById('map')).backgroundColor === ocekavano
    })
  )
  // Kresby se ukazují jen v pásmu přiblížení 4–8, takže se napřed oddálí zpátky.
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(400)
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(1500)
  await kontrola('offline mapa: malované kresby', () => page.locator('.kresba img').count().then((n) => n > 0))

  await page.evaluate(() => document.getElementById('podkladBtn').click())
  await page.context().setOffline(false)
}

/* ---------- vzhled: tmavý režim ---------- */

// Vlastní stránka s tmavým systémovým nastavením. Hlavní průchod má
// colorScheme napevno 'light', aby na něm nezáleželo, jak má vzhled
// nastavený počítač – tady se naopak testuje právě to.
console.log('\n  vzhled:')
{
  const tmavaStranka = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' })
  await tmavaStranka.goto(adresa, { waitUntil: 'load' })
  await tmavaStranka.waitForTimeout(1200)

  await kontrola('tmavý režim podle systému', () =>
    tmavaStranka.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(27, 36, 26)')
  )
  await kontrola('tmavý režim: text je světlý', () =>
    tmavaStranka.evaluate(() => getComputedStyle(document.body).color === 'rgb(237, 231, 216)')
  )

  // Ruční volba musí systém přebít a přežít znovunačtení – jinak by uživatel
  // ve tmavém telefonu nemohl vynutit světlý režim.
  // Panel se otevírá přes evaluate: klik přes hit-testing tu kolidoval
  // s dlaždicí mapy. Že je tlačítko opravdu napojené, hlídá check-handlers.
  await tmavaStranka.evaluate(() => document.getElementById('introGo').click())
  await tmavaStranka.evaluate(() => document.getElementById('fabFilter').click())
  await tmavaStranka.waitForTimeout(400)
  await tmavaStranka.evaluate(() => document.querySelector('.motivbtn[data-motiv="svetly"]').click())
  await tmavaStranka.waitForTimeout(300)
  await kontrola('ruční volba přebije systém', () =>
    tmavaStranka.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(250, 245, 236)')
  )
  await kontrola('volba vzhledu se uložila', () =>
    tmavaStranka.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:prefs') || '{}').motiv),
    'svetly'
  )
  await tmavaStranka.reload({ waitUntil: 'load' })
  await tmavaStranka.waitForTimeout(1200)
  await kontrola('volba vzhledu přežije restart', () =>
    tmavaStranka.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(250, 245, 236)')
  )
  await tmavaStranka.close()
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
