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

// 58 = 57 z původní aplikace + `i-filtr` (trychtýř podle listu „SADA PIKTOGRAMŮ",
// viz VZHLED.md). Číslo se mění jen s vědomým přidáním ikony do sprite.svg.
await kontrola('sada ikon vložená', () => page.locator('svg symbol').count(), 59)
await kontrola('počet míst v hlavičce', () => page.locator('#totalN').innerText(), '580')
await kontrola('počítadlo na mapě', () => page.locator('#countN').innerText(), '580 míst')
// Nad mapou je pět rychlých pilulek podle předlohy, od srpna 2026 „moje věci"
// (Vše, Uložená, Musíme!, V plánu, Byli jsme) místo kategorií.
// Kategorie se tím neztratily – všech deset je v panelu Filtry, což ověřuje
// druhá kontrola. Bez ní by se dalo pět chybějících kategorií přehlédnout.
await kontrola('rychlé filtry nad mapou', () => page.locator('#chips .pilulka').count(), 5)
await kontrola('všech deset kategorií ve filtru', () => page.locator('#katRow .toggle.kat').count(), 10)
await kontrola('naplněné oblasti ve filtru', () => page.locator('#fReg option').count(), 118)
// Volby nesou počet a prázdné jsou zašedlé – bez toho nabízel Seznam po výběru
// země typy, které v ní vůbec nejsou, a ťuknutí na ně vrátilo prázdno.
await kontrola('volby ve filtru nesou počet', () =>
  page.locator('#fTyp option').nth(1).innerText().then((t) => /\(\d+\)$/.test(t)), true)
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
// Sbalit se karta dá jen na Mapě. Šipku tam kreslí `views/mapa/mapa.js`, ne
// sdílená `vypravaKarta()` — kdyby ji kreslila ta, objevila by se i tady.
await kontrola('na Domů se karta sbalit nedá', () => page.locator('#homeInner .vk-sbal').count(), 0)
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

// Profil – nemá tlačítko v liště, otevírá se kolečkem v hlavičce.
// Od srpna 2026 v něm zůstává jen identita a čísla; všechno ostatní se
// přestěhovalo do Nastavení vedle něj.
await page.click('#profilOpen')
await page.waitForTimeout(300)
await kontrola('Profil se otevřel', () => page.locator('#panelProfil.show').count(), 1)
await kontrola('Profil má adresu', () => page.evaluate(() => location.hash), '#profil')
await kontrola('Profil má čísla', () => page.locator('#profilInner .pstat').count(), 6)
await kontrola('Profil už nemá nastavení', () =>
  page.locator('#panelProfil #expBtn, #panelProfil .motivbtn, #panelProfil #csvIn').count(), 0)
await page.goBack()
await page.waitForTimeout(400)

// Nastavení – druhé kolečko v hlavičce, hned vedle profilového.
await page.click('#nastaveniOpen')
await page.waitForTimeout(400)
await kontrola('Nastavení se otevřelo', () => page.locator('#panelNastaveni.show').count(), 1)
await kontrola('Nastavení má adresu', () => page.evaluate(() => location.hash), '#nastaveni')
// Zálohy, obnova, CSV a vzhled se přestěhovaly z panelu Filtry (ten odpovídá
// na „co chci vidět") sem, kde je zbytek pák na chování aplikace.
await kontrola('Nastavení má zálohu a obnovu', () =>
  page.locator('#panelNastaveni #expBtn, #panelNastaveni #impIn').count(), 2)
await kontrola('Nastavení má přepínač vzhledu', () => page.locator('#panelNastaveni .motivbtn').count(), 3)
await kontrola('Nastavení má správu vlastních dat', () =>
  page.locator('#panelNastaveni #csvIn, #panelNastaveni #dataReset').count(), 2)
// Malovaná mapa Evropy má několik megabajtů, takže není v instalaci a stahuje
// se odsud. Test ji nestahuje – ověřuje jen, že se nabízí a hlásí správný stav.
await kontrola('Nastavení nabízí stažení mapy', () => page.locator('#mapaStahni').isVisible(), true)
await kontrola('bez stažení hlásí, že mapa není', () =>
  page.locator('#mapaStav').innerText().then((t) => /nen[ií]/i.test(t)), true)
// Volba malované mapy je zašedlá, dokud balík není stažený – slibovat něco,
// co se nemá odkud vzít, je horší než to nenabídnout.
await kontrola('bez balíku nejde malovanou zvolit', () =>
  page.locator('.volba[data-offline="stazena"]').isDisabled(), true)
await kontrola('Nastavení hlásí místo v telefonu', () =>
  page.locator('#mistoInfo').innerText().then((t) => t.length > 10), true)
// Hustota kreseb: tři stupně a bez stažené mapy zašedlé, protože kresby
// jsou jen na ní.
await kontrola('přepínač hustoty kreseb má tři stupně', () => page.locator('#kresbySeg button').count(), 3)
await kontrola('bez mapy jsou kresby nedostupné', () =>
  page.locator('.volbakresby.nejde').count(), 1)
// Bez stažené mapy musí nastoupit záložní plátno z basemap.json – jinak by
// offline mapa byla prázdná. Totéž platí pro prohlížeč bez WebGL
// a pro jednosouborovou variantu, kam se dlaždice zabalit nedají.
await kontrola('bez mapy se kreslí záložní podklad', () => page.locator('.maplibregl-canvas').count(), 0)
await kontrola('v panelu Filtry už zálohy nejsou', () => page.locator('#filters #expBtn').count(), 0)
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
// Přestavba detailu: ikonová řada nahoře místo řádku pěti tlačítek dole,
// vedlejší akce pod „…", Instagram jako karta (pole `ig` má 454 z 580 míst
// a do teď to byl textový řádek úplně dole, kam nikdo nedoscrolloval).
await kontrola('detail má ikonovou řadu', () => page.locator('#sheet .ikonrada .ikonbtn').count(), 4)
await page.evaluate(() => document.getElementById('dVice').click())
await page.waitForTimeout(300)
await kontrola('„…" nabízí vedlejší akce', () =>
  page.locator('#dViceMenu a, #dViceMenu button').count().then((n) => n === 4)
)
await page.evaluate(() => document.getElementById('dVice').click())

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
await kontrola('segment Cesta · Přehled · Plán', () => page.locator('#planSegment button').count(), 3)
// Bez rozjeté cesty se začíná Přehledem; karta Cesta vysvětlí, že se nejede.
await kontrola('začíná se Přehledem', () => page.locator('#planSegment button.on').innerText(), 'Přehled')
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

// Průběh výpravy: odškrtnutá zastávka se zapisuje jako navštívená, tedy do
// téhož místa jako srdce v Seznamu. Žádná druhá evidence.
await kontrola('pruh průběhu je v přehledu', () => page.locator('.prubeh').count(), 1)
await kontrola('průběh začíná na nule', () => page.locator('.prubeh-hlava b').innerText(), '0 z 1 zastávky')
await page.click('#planSegment button[data-seg="plan"]')
await page.waitForTimeout(500)
await kontrola('zastávka má fajfku „byli jsme tady"', () => page.locator('.zastavka-hotovo').count(), 1)
await page.click('.zastavka-hotovo')
await page.waitForTimeout(500)
await kontrola('odškrtnutí se zapíše jako navštíveno', () =>
  page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('vandrbuch:v1')).stav).filter((x) => x === 'visited').length),
  1
)
await page.click('.zastavka-hotovo')
await page.waitForTimeout(500)
await page.click('#planSegment button[data-seg="prehled"]')
await page.waitForTimeout(400)

// Navigace je pod jedním tlačítkem, ne třemi v řádku. GPX je čtvrtá volba –
// jediná, která unese celou trasu (Google jen deset bodů, Apple a Waze jeden).
await page.click('#planDoNavigace')
await page.waitForTimeout(500)
await kontrola('nabídka navigace se otevřela', () => page.locator('#navSheet.show').count(), 1)
await kontrola('čtyři cíle navigace včetně GPX', () => page.locator('#navSheet .navvolba').count(), 4)
await kontrola('GPX je mezi nimi', () => page.locator('#planGpx').count(), 1)
// Klik nahoru, ne doprostřed: nabídka je od přibytí GPX vyšší a střed ztmavení
// je pod ní. Doprostřed by se klik trefil do nabídky, ne mimo ni.
await page.click('#backdrop', { position: { x: 190, y: 40 } })
await page.waitForTimeout(400)

// Přehled plánu: čísla jedné výpravy; srovnání je nadstavba (jen když jsou
// aspoň dvě výpravy, což tady není – kontroluje se tedy základ).
await kontrola('přehled má výběr výpravy', () => page.locator('#prehVyber').count(), 1)
await kontrola('přehled má čtyři skupiny čísel', () => page.locator('.preh-skupina').count(), 4)
// Bez zapnutého srovnání chodí do radek() null – dřív se vypisoval doslova.
await kontrola('v číslech přehledu není doslovné „null"', () =>
  page.evaluate(() => [...document.querySelectorAll('.preh-radek')].every((r) => !r.textContent.includes('null'))))

// Vlastní bloky: přidat seznam, položku, odškrtnout; vlastní místo pozná
// vložené souřadnice v několika tvarech.
await page.click('#planSegment button[data-seg="plan"]')
await page.waitForTimeout(400)
await kontrola('nabídka bloků má pět typů', () => page.locator('[data-blok-novy]').count(), 5)
await page.click('[data-blok-novy="seznam"]')
await page.waitForTimeout(400)
await kontrola('seznam se přidal', () => page.locator('.blok').count(), 1)
await page.click('[data-act="pridat-polozku"]')
await page.waitForTimeout(300)
await page.locator('.blok-polozka input').first().fill('Spacáky')
await page.waitForTimeout(600)
await page.click('[data-act="odskrtnout"]')
await page.waitForTimeout(400)
await kontrola('položka jde odškrtnout', () => page.locator('.blok-fajfka.on').count(), 1)
await kontrola('blok se uložil', () =>
  page.evaluate(() => {
    const b = JSON.parse(localStorage.getItem('vandrbuch:v1')).bloky
    const bloky = b[Object.keys(b)[0]] || []
    return bloky.length === 1 && bloky[0].polozky.length === 1 && !!bloky[0].polozky[0].hotovo
  }))
await page.click('[data-blok-novy="misto"]')
await page.waitForTimeout(400)
await page.locator('[data-pole="vlozeno"]').fill('https://www.google.com/maps/@50.0755,14.4378,12z')
await page.click('[data-act="prevzit"]')
await page.waitForTimeout(400)
await kontrola('místo pozná odkaz z Google Maps', () =>
  page.evaluate(() => {
    const b = JSON.parse(localStorage.getItem('vandrbuch:v1')).bloky
    const misto = (b[Object.keys(b)[0]] || []).find((x) => x.typ === 'misto')
    return misto && Math.abs(misto.lat - 50.0755) < 1e-4 && Math.abs(misto.lon - 14.4378) < 1e-4
  }))
await kontrola('vlastní místo má špendlík na mapě', () =>
  page.evaluate(() => document.querySelectorAll('.vlastnipin').length), 1)
// Uklidit bloky SMAZÁNÍM PŘES UI, ne přepsáním localStorage: aplikace při
// odchodu ze stránky dopisuje store z paměti (pagehide → save()), takže by
// přepsaný záznam hned zase přepsala zpátky tím starým.
page.once('dialog', (d) => d.accept())
await page.locator('.blok-smaz').first().click()
await page.waitForTimeout(400)
page.once('dialog', (d) => d.accept())
await page.locator('.blok-smaz').first().click()
await page.waitForTimeout(400)
await kontrola('bloky uklizené', () => page.locator('.blok').count(), 0)

// Aktuální cesta: vyjet → odznačit → ukončit → archiv. Bez GPS, jen
// odznačování; čas se počítá ze začátku a pauz, nikde se netiká.
await page.click('#planSegment button[data-seg="cesta"]')
await page.waitForTimeout(400)
await kontrola('bez cesty nabízí Vyjet', () => page.locator('#cestaVyjed').count(), 1)
await page.click('#cestaVyjed')
await page.waitForTimeout(500)
await kontrola('cesta se rozjela', () =>
  page.evaluate(() => !!JSON.parse(localStorage.getItem('vandrbuch:v1')).cesta))
await kontrola('zastávka jde odznačit', () => page.locator('.cesta-fajfka').count(), 1)
await page.click('.cesta-fajfka')
await page.waitForTimeout(500)
await kontrola('odznačení se zapsalo', () =>
  page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('vandrbuch:v1')).cesta.odznacene).length), 1)
await kontrola('odznačené je i navštívené', () =>
  page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('vandrbuch:v1')).stav).filter((x) => x === 'visited').length), 1)
// Achievementy: plánové se generují z obsahu plánu a pro každý jich musí
// být aspoň dvacet – i pro tenhle miniaturní jednozastávkový.
// Počítá se JEN v kartě Plánu: panely se nezahazují, jen schovávají, takže
// stránkové `.achv` by přičetlo i padesát profilových z dřív vykresleného
// Profilu – a kontrola by prošla, i kdyby generátor vracel jediný kus.
await kontrola('plánové achievementy: aspoň 20', () =>
  page.locator('#planWrap .achv').count().then((n) => n >= 20))
await kontrola('něco už je získané', () => page.locator('#planWrap .achv.ma').count().then((n) => n >= 1))
page.once('dialog', (d) => d.accept())
await page.click('#cestaKonec')
await page.waitForTimeout(600)
await kontrola('cesta skončila v archivu', () =>
  page.evaluate(() => {
    const v = JSON.parse(localStorage.getItem('vandrbuch:v1'))
    return !v.cesta && v.cesty.length === 1 && v.cesty[0].navstiveno === 1
  }))
await kontrola('archiv je vidět po letech', () => page.locator('.archiv-rok').count(), 1)
await kontrola('profilový achievement za první cestu', () =>
  page.evaluate(() => !!JSON.parse(localStorage.getItem('vandrbuch:v1')).achievementy['prvni-cesta']))
// Uklidit stav navštíveného místa po zkoušce cesty. Reload níž zahodí stav
// modulů, takže se musí vrátit i „první otevření Mapy" – karta výpravy po
// něm držela jen v paměti a kontroly na Mapě s prvním otevřením počítají.
await page.evaluate(() => {
  const v = JSON.parse(localStorage.getItem('vandrbuch:v1'))
  v.stav = {}
  v.cesty = []
  v.achievementy = {}
  localStorage.setItem('vandrbuch:v1', JSON.stringify(v))
  const p = JSON.parse(localStorage.getItem('vandrbuch:prefs') || '{}')
  delete p.vypravaPredstavena
  localStorage.setItem('vandrbuch:prefs', JSON.stringify(p))
})
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(900)
await page.evaluate(() => document.getElementById('introGo')?.click())
await page.waitForTimeout(300)
await page.click('#tabs button[data-tab="plan"]')
await page.waitForTimeout(400)

// Výběr míst z mapy: košík → nová výprava. Ťuká se přes emit, protože
// špendlík je malý cíl; podstata (režim přepne klik na přidání) se tím
// ověří stejně.
await page.click('#tabs button[data-tab="map"]')
await page.waitForTimeout(400)
await page.click('#fabPlus')
await page.waitForTimeout(250)
await kontrola('„+" nabízí výběr míst z mapy', () => page.locator('#plusVybrat').count(), 1)
await page.click('#plusVybrat')
await page.waitForTimeout(400)
await kontrola('lišta výběru svítí', () => page.locator('.vyberbod-listka').count(), 1)
await page.evaluate(() => document.querySelector('.badge-pin').closest('.leaflet-marker-icon').dispatchEvent(new Event('click', { bubbles: true })))
await page.waitForTimeout(400)
await kontrola('ťuknutí přidalo do košíku', () =>
  page.locator('.vyberbod-listka span').innerText().then((t) => t.includes('Vybráno 1')))
page.once('dialog', (d) => d.accept())
await page.click('.vyberbod-listka [data-act="hotovo"]')
await page.waitForTimeout(600)
await kontrola('z košíku vznikla nová výprava', () =>
  page.evaluate(() => {
    const v = JSON.parse(localStorage.getItem('vandrbuch:v1'))
    return v.plan.length === 1 && v.vypravy.length === 1
  }))
await kontrola('a skočilo se do Plánu', () => page.evaluate(() => location.hash), '#plan')
// Vrátit se k jediné výpravě: smazat tu novou (aktivuje se odložená).
await page.evaluate(() => document.getElementById('planVice').click())
await page.waitForTimeout(300)
page.once('dialog', (d) => d.accept())
await page.evaluate(() => document.getElementById('planSmaz').click())
await page.waitForTimeout(500)

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
await kontrola('„+" otevře nabídku', () => page.locator('#plusMenu button').count(), 4)
await page.click('#fabPlus')
await page.waitForTimeout(250)
await kontrola('druhé ťuknutí nabídku zavře', () => page.locator('#plusMenu[hidden]').count(), 1)

// Spodek Mapy: karta výpravy a uložená místa braly skoro třetinu obrazovky
// natrvalo. Karta se ukáže jen při PRVNÍM otevření Mapy, uložená místa jsou
// vytahovací plát a dole po nich zůstane jen proužek s počtem.
const spodek = () => page.locator('#mapDolu').evaluate((e) => Math.round(e.getBoundingClientRect().height))
// „+" visí na `bottom:100%` spodku, takže se posouvá s jeho výškou. V žádné
// kombinaci nesmí spadnout na lištu záložek — to je tady nejsnáz rozbitelná věc.
const plusNadListou = async () => {
  const f = await page.locator('#fabPlus').boundingBox()
  const t = await page.locator('#tabs').boundingBox()
  return f.y + f.height <= t.y + 2
}

await kontrola('při prvním otevření je karta výpravy vidět', () => page.locator('#vypravaKarta').isVisible(), true)
await kontrola('první otevření se zapsalo do předvoleb', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:prefs')).vypravaPredstavena), true)
await kontrola('karta má šipku na sbalení', () => page.locator('#vkSbal').isVisible(), true)
await kontrola('„+" je nad lištou záložek', plusNadListou, true)
const sKartou = await spodek()

await page.click('#vkSbal')
await page.waitForTimeout(300)
await kontrola('šipka kartu sbalí', () => page.locator('#vypravaKarta').isVisible(), false)
await kontrola('sbalené zbude bublina', () => page.locator('#mapBublina').isVisible(), true)
await kontrola('sbalením se získá aspoň 150 px mapy', async () => sKartou - (await spodek()) >= 150, true)
await kontrola('„+" je nad lištou i bez karty', plusNadListou, true)
await page.click('#mapBublina')
await page.waitForTimeout(300)
await kontrola('bublina kartu vrátí', () => page.locator('#vypravaKarta').isVisible(), true)
await page.click('#vkSbal')
await page.waitForTimeout(300)

// Plát uložených míst
await kontrola('proužek uložených míst zůstává vidět', () => page.locator('#ulozeneUchyt').isVisible(), true)
await kontrola('proužek nese počet', () => page.locator('#ulozenePocet').innerText(), '0')
await kontrola('seznam je dole schovaný', () =>
  page.locator('#ulozeneObsah').evaluate((e) => e.getBoundingClientRect().height < 2), true)
await page.click('#ulozeneUchyt')
await page.waitForTimeout(500)
await kontrola('ťuknutí plát vytáhne', () =>
  page.locator('#ulozeneObsah').evaluate((e) => e.getBoundingClientRect().height > 20), true)
await kontrola('„+" je nad lištou i s vytaženým plátem', plusNadListou, true)
await page.click('#ulozeneUchyt')
await page.waitForTimeout(500)
await kontrola('druhé ťuknutí plát vrátí', () =>
  page.locator('#ulozeneObsah').evaluate((e) => e.getBoundingClientRect().height < 2), true)

// Rychlé filtry nad mapou se projeví hned, bez potvrzování. Od srpna 2026
// filtrují „moje věci" (uložená, Musíme!, v plánu, byli jsme), ne kategorie —
// kategorii už na mapě rozlišuje barva špendlíku, viz components/chip.js.
await kontrola('nad mapou je pět rychlých pilulek', () => page.locator('#chips .pilulka').count(), 5)
await page.click('#chips .pilulka[data-id="ulozene"]')
await page.waitForTimeout(400)
// Nic uloženého zatím není, takže filtr musí vrátit nulu – a hlavně ne 580.
await kontrola('rychlý filtr Uložená', () => page.locator('#countN').innerText(), '0 míst')
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

// „Přidat místo" se přestěhovalo z panelu Filtry (kde ho nikdo nenašel)
// do nabídky pod okrovým „+" na mapě. Cesta je proto přes „+".
await page.click('#tabs button[data-tab="map"]')
await page.waitForTimeout(400)
await page.click('#fabPlus')
await page.waitForTimeout(300)
await page.click('#plusMisto')
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

  /*
   * Do předukládané cache nesmí spadnout nic kolem stažené malované mapy:
   * MapLibre s workerem, čtečka balíku, sto dvacet kreseb a souřadnice lesů
   * a hor. Je toho přes čtyři megabajty a jsou k ničemu každému, kdo si mapu
   * nestáhne — uloží se až při prvním použití.
   *
   * Filtr ve `vite.config.js` pozná ty soubory podle jména, což je křehké:
   * stačí přejmenovat chunk a instalace tiše naroste o čtyři megabajty.
   * Odsud se to pozná hned.
   */
  await kontrola('do cache nejde nic kolem stažené mapy', () =>
    page
      .evaluate(async () => {
        const text = await (await fetch('./sw.js')).text()
        const seznam = JSON.parse(text.match(/const PRECACHE = (\[[\s\S]*?\n\])/)[1])
        return seznam.filter((f) => /(kresba|kresby-|vektory|vbm|maplibre-|auta-)/.test(f))
      })
      .then((x) => x.length), 0)

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
  // Kresby stromů a hor už nejsou prvky stránky – kreslí je MapLibre na GPU
  // a jen se staženým balíkem. Zjednodušená mapa má obrysy, města a reliéf,
  // takže se kontroluje reliéf: je to jediná nová vrstva, kterou je vidět
  // i bez stažení.
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(400)
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(1500)
  // Popisky měst se skládají jen pro to, co je ve výřezu, takže se kontrolují
  // až po oddálení. Při přiblížení do Alp jich je ve výřezu klidně nula –
  // a to není chyba, jen malý výřez.
  await kontrola('offline mapa: názvy měst', () => page.locator('.mesto-popisek').count().then((n) => n > 0))
  await kontrola('offline mapa: stínování terénu', () =>
    page.locator('.leaflet-relief-pane img.relief').count().then((n) => n === 1)
  )
  await kontrola('offline mapa: reliéf je vidět', () =>
    page.evaluate(() => {
      const el = document.querySelector('img.relief')
      return !!el && el.complete && el.naturalWidth > 1000 && Number(getComputedStyle(el).opacity) > 0.3
    })
  )

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
