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
// acceptDownloads kvůli exportu debug poznámek: `.md` i `.json` se v kontrole
// opravdu stahují a čte se jejich obsah. Formát `.md` je zároveň vstupem pro
// scripts/debug-rejstrik.mjs, takže se nesmí rozejít nepozorovaně.
const page = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'light', acceptDownloads: true })

// POČÍTADLO DOTAZŮ NA POČASÍ. Kontroly níž ověřují, že vypnuté počasí na síť
// nesáhne – a to se jinak než počítáním nedokáže. Sčítá se v prohlížeči, ne
// přes `page.route`, protože ten by dotaz odchytil a tím i změnil chování.
await page.addInitScript(() => {
  window.__pocasiDotazu = 0
  const puvodni = window.fetch
  window.fetch = function (...a) {
    const url = String((a[0] && a[0].url) || a[0] || '')
    if (url.includes('open-meteo')) window.__pocasiDotazu++
    return puvodni.apply(this, a)
  }
})

/**
 * Archiv ukončených cest z IndexedDB.
 *
 * Od srpna 2026 nebydlí ve `vandrbuch:v1` – rostl o kilobajty na každou cestu
 * a nikdy se nemazal, takže se odstěhoval do vlastní databáze
 * (`src/core/cestyDb.js`). Kontroly níž si ho proto musí přečíst odsud.
 */
const archivCest = () =>
  page.evaluate(
    () =>
      new Promise((hotovo) => {
        const r = indexedDB.open('vandrbuch-cesty', 1)
        r.onsuccess = () => {
          const db = r.result
          if (!db.objectStoreNames.contains('cesty')) return hotovo([])
          const tr = db.transaction('cesty', 'readonly')
          const g = tr.objectStore('cesty').getAll()
          tr.oncomplete = () => hotovo(g.result || [])
          tr.onerror = () => hotovo([])
        }
        r.onerror = () => hotovo([])
      })
  )

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

/**
 * Rozbalí sbalitelnou skupinu v Nastavení nebo v Profilu.
 *
 * Od srpna 2026 jsou obě obrazovky poskládané ze skupin, které startují
 * zavřené (hlášení `tadeas-001`) – na skrytý prvek Playwright neklikne, takže
 * kroky níž musí skupinu napřed otevřít. Podruhé už nic nedělá, aby se dvojím
 * voláním omylem zase nezavřela.
 *
 * @param {string} id  hodnota `data-sbalka`
 */
const rozbal = async (id) => {
  const hlava = page.locator(`[data-sbalka="${id}"]`)
  if ((await hlava.getAttribute('aria-expanded')) === 'true') return
  await hlava.click()
  await page.waitForTimeout(300)
}

/**
 * Zavře detail místa tlačítkem zpět a počká, až opravdu zmizí.
 *
 * PROČ NE JEDNO `goBack()`: detail i dialog nad ním se oba registrují jako
 * překryv s vlastním krokem v historii, takže po zavřeném dialogu je potřeba
 * krok navíc. Do srpna 2026 to nevadilo, protože klik v dialogu detail zavíral
 * sám (chyba tadeas-003) – testy níž na tom tiše stály.
 */
const zavriDetail = async () => {
  for (let i = 0; i < 3; i++) {
    if ((await page.locator('#sheet.show').count()) === 0) return
    await page.goBack()
    await page.waitForTimeout(400)
  }
}

// 57 z původní aplikace + `i-filtr` (trychtýř podle listu „SADA PIKTOGRAMŮ",
// viz VZHLED.md) + `i-zalozka` + `i-slozka` + `i-zamek` (ukončené cesty
// v knihovně, srpen 2026) + `i-dum` (uložené pozice v profilu, srpen 2026)
// + `i-oko-ne` (schování běžných míst u mapy, srpen 2026)
// + `i-brouk` (debug poznámkovač, srpen 2026)
// + `i-seznam` a `i-obnovit` (zkratka do poznámkovače a reset v hlavičce,
//   srpen 2026 – brouk se znovu použít nedal, dvě sousední kolečka s toutéž
//   ikonou by nešlo rozeznat).
// Číslo se mění jen s vědomým přidáním do sprite.svg.
await kontrola('sada ikon vložená', () => page.locator('svg symbol').count(), 70)
await kontrola('počet míst v hlavičce', () => page.locator('#totalN').innerText(), '580')
await kontrola('počítadlo na mapě', () => page.locator('#countN').innerText(), '580 míst')
// Nad mapou jsou čtyři rychlé pilulky „moje věci" (Vše, Uložená, Musíme!,
// Byli jsme). Pátá, „Na cestě" (mód mapy, S.mapaMod), se ukáže jen s aktivní
// cestou (store.cesta) – bez ní appka nemá co přepínat, viz components/chip.js.
// Kategorie se tím neztratily – všech deset je v panelu Filtry, což ověřuje
// druhá kontrola. Bez ní by se dalo pět chybějících kategorií přehlédnout.
await kontrola('rychlé filtry nad mapou', () => page.locator('#chips .pilulka').count(), 4)
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
// dodávky (ta je nově na mapě, na trase plánu), karta výpravy, mřížka
// „Možná dnes" (od srpna 2026 tři sloupce místo posuvného pásu) a řada čísel.
await kontrola('hero pás s pozdravem', () => page.locator('#homeInner .heropas-obr').count(), 1)
await kontrola('karta výpravy na Domů', () => page.locator('#homeInner .vkarta').count(), 1)
// Sbalit se karta dá jen na Mapě. Šipku tam kreslí `views/mapa/mapa.js`, ne
// sdílená `vypravaKarta()` — kdyby ji kreslila ta, objevila by se i tady.
await kontrola('na Domů se karta sbalit nedá', () => page.locator('#homeInner .vk-sbal').count(), 0)
await kontrola('mřížka „Možná dnes"', () => page.locator('#homeInner .fotomrizka .fotokarta').count(), 6)

// POČASÍ U TVÉ POLOHY (hlášení pc-tadeas-001). Kontrola běží bez povolené
// polohy, a to je schválně: appka si o ni SAMA ŘÍCT NESMÍ. Místo předpovědi
// má nabídnout tlačítko a na Open-Meteo nesáhnout.
await kontrola('Domů má sekci počasí', () => page.locator('#homePocasi').count(), 1)
await kontrola('bez polohy nabídne tlačítko', () => page.locator('#homePocasiPoloha').count(), 1)
await kontrola('a nic nestahuje', () => page.evaluate(() => window.__pocasiDotazu), 0)
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

// SBALITELNÉ SKUPINY (hlášení tadeas-001). Jméno a čísla „Co máš za sebou"
// zůstávají vidět – kvůli nim se Profil otevírá. Schovala se mřížka 96 aut,
// dvacet achievementů a seznam pozic.
await kontrola('Profil má tři skupiny', () => page.locator('#panelProfil .sbalka').count(), 3)
await kontrola('a všechny startují zavřené', () =>
  page.locator('#panelProfil .sbalka-telo[hidden]').count(), 3)
await kontrola('jméno je vidět bez rozbalování', () => page.locator('#profilJmeno').isVisible(), true)
await kontrola('čísla taky', () => page.locator('#panelProfil .pstat').first().isVisible(), true)
await kontrola('mřížka aut naopak schovaná', () =>
  page.locator('#panelProfil .autovolba').first().isVisible(), false)

// VÝBĚR BODU Z MAPY MUSÍ VRÁTIT TAM, ODKUD SE PŘIŠLO (hlášení tadeas-002).
// `vyberBod()` se přepne na mapu; do srpna 2026 si nepamatovalo, odkud, takže
// člověk po výběru i po zrušení zůstal stát na mapě a musel se proklikat zpět.
// Testuje se z Profilu, protože je to nejkratší cesta k té službě – z plánu
// vede přes výpravu, den a průvodce bodem, ale kód je tentýž.
await rozbal('pozice')
await page.click('#pozicePridat')
await page.waitForTimeout(300)
await page.fill('#dialogVstup', 'Zkušební pozice')
await page.click('#dialogAno')
await page.waitForTimeout(300)
// Druhá volba v „Kde to je?" je „Vybrat na mapě".
await page.click('#dialog.show .dialog-volba[data-i="1"]')
await page.waitForTimeout(500)
await kontrola('výběr bodu přepnul na mapu', () => page.evaluate(() => document.body.dataset.tab), 'map')
await kontrola('a svítí lišta výběru', () => page.locator('.vyberbod-listka').count(), 1)
await page.click('.vyberbod-listka [data-act="zrusit"]')
await page.waitForTimeout(500)
await kontrola('zrušení vrátilo zpátky do Profilu', () =>
  page.evaluate(() => document.getElementById('panelProfil').classList.contains('show')), true)
await kontrola('a lišta zmizela', () => page.locator('.vyberbod-listka').count(), 0)

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

// SBALITELNÉ SKUPINY (hlášení tadeas-001). Dvanáct oddílů pod sebou se na
// telefonu scrollovalo donekonečna, takže se všechno kromě Vzhledu schovalo.
await kontrola('Nastavení má osm skupin', () => page.locator('#panelNastaveni .sbalka').count(), 8)
await kontrola('a všechny startují zavřené', () =>
  page.locator('#panelNastaveni .sbalka-telo[hidden]').count(), 8)
await kontrola('Vzhled zůstává vidět bez rozbalování', () =>
  page.locator('#panelNastaveni .motivbtn').first().isVisible(), true)
// TOHLE JE TA PODSTATNÁ. Sbalená skupina se jen SKRÝVÁ – kdyby se odstranila
// z DOM, přišla by o obsluhu navěšenou při startu (initFilterPanel) a
// „Stáhnout zálohu" by po prvním sbalení tiše přestalo fungovat.
await kontrola('prvek ve sbalené skupině zůstává v DOM', () =>
  page.locator('#panelNastaveni #expBtn').count(), 1)
await kontrola('ale vidět není', () => page.locator('#expBtn').isVisible(), false)
await rozbal('zalohy')
await kontrola('po rozbalení je vidět', () => page.locator('#expBtn').isVisible(), true)
// Otevřených smí být víc naráz – skupiny se nezavírají navzájem.
await rozbal('mapa')
await kontrola('dvě skupiny otevřené naráz', () =>
  page.locator('#panelNastaveni .sbalka-telo:not([hidden])').count(), 2)
// Hustota kreseb patří k mapě, ne na konec obrazovky jako dřív.
await kontrola('kresby jsou uvnitř skupiny Mapa', () => page.locator('#nastMapa #kresbySeg').count(), 1)

// POČASÍ MÁ VLASTNÍ SKUPINU s přepínačem, intervalem a smazáním schránky.
await rozbal('pocasi')
await kontrola('skupina Počasí má přepínač', () => page.locator('#pocasiSeg button').count(), 2)
await kontrola('a tři intervaly stahování', () => page.locator('#pocasiIntervalSeg button').count(), 3)
await kontrola('a mazání uložených předpovědí', () => page.locator('#pocasiSmaz').count(), 1)
// Malovaná mapa Evropy má několik megabajtů, takže není v instalaci a stahuje
// se odsud. Test ji nestahuje – ověřuje jen, že se nabízí a hlásí správný stav.
await kontrola('Nastavení nabízí stažení mapy', () => page.locator('#mapaStahni').isVisible(), true)
await kontrola('bez stažení hlásí, že mapa není', () =>
  page.locator('#mapaStav').innerText().then((t) => /nen[ií]/i.test(t)), true)
// Volba malované mapy je zašedlá, dokud balík není stažený – slibovat něco,
// co se nemá odkud vzít, je horší než to nenabídnout.
await kontrola('bez balíku nejde malovanou zvolit', () =>
  page.locator('.volba[data-offline="stazena"]').isDisabled(), true)
await rozbal('misto')
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

// VYPNUTÉ POČASÍ NEMÁ JEN ZMIZET Z OBRAZOVKY, ono nesmí sáhnout na síť –
// na roamingu je to jediná jistota. Stojí to až tady schválně: přepnutí
// vyžaduje odskok na Domů a zpátky, což by kontrolám mapy výš rozbilo stav.
await rozbal('pocasi')
await page.click('#pocasiSeg button:not(.on)')
await page.waitForTimeout(400)
await page.click('#tabs button[data-tab="home"]')
await page.waitForTimeout(700)
await kontrola('vypnuté počasí zmizí z Domů', () => page.locator('#homePocasi').count(), 0)
await kontrola('a pořád nic nestahuje', () => page.evaluate(() => window.__pocasiDotazu), 0)
await page.click('#nastaveniOpen')
await page.waitForTimeout(500)
await rozbal('pocasi')
await page.click('#pocasiSeg button:not(.on)')
await page.waitForTimeout(400)

// Debug poznámkovač. Sestavená appka nemá VANDRBUCH_BETA, takže je přepínač
// vypnutý a kolečko v hlavičce schované – přesně jak to má být na produkci.
await kontrola('poznámkovač má přepínač', () => page.locator('#debugSeg button').count(), 2)
await kontrola('bez bety je poznámkovač vypnutý', () =>
  page.locator('#debugSeg button.on').innerText().then((t) => t.trim()), 'Vypnutý')
await kontrola('a kolečko v hlavičce není vidět', () => page.locator('#debugOpen').isVisible(), false)
// Tři vývojářská kolečka řídí jeden přepínač, takže se nesmí rozejít –
// dvě viditelná a jedno schované by vypadalo jako chyba.
await kontrola('ani zkratka do poznámkovače', () => page.locator('#debugSeznam').isVisible(), false)
await kontrola('ani reset', () => page.locator('#debugReset').isVisible(), false)
await rozbal('poznamkovac')
await page.click('#debugSeg button:not(.on)')
await page.waitForTimeout(200)
await kontrola('zapnutí přepínače kolečko ukáže', () => page.locator('#debugOpen').isVisible(), true)
await kontrola('a s ním zkratku do poznámkovače', () => page.locator('#debugSeznam').isVisible(), true)
await kontrola('a reset', () => page.locator('#debugReset').isVisible(), true)
// Pět koleček se na úzký telefon vejde jen bez nápisu VANDRBUCH. Příznak
// dává JavaScript, protože `h1` je v DOM PŘED tlačítky a selektorem se na
// ně odsud nedosáhne. Bez toho poslední kolečko leze mimo obrazovku.
await kontrola('hlavička se vejde do šířky', () =>
  page.evaluate(() => {
    const brand = document.getElementById('brand')
    return brand.scrollWidth <= brand.getBoundingClientRect().width + 1
  }), true)
await kontrola('volba se uložila', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:prefs')).debugRezim), true)

await page.goBack()
await page.waitForTimeout(400)

// Stav z repozitáře. `dist/debug-stav.json` skládá build ze složky `debug/`,
// takže jeho obsah závisí na tom, co je zrovna nahlášené – kontrola na něm
// stát nemůže a podstrčí si vlastní fixture.
//
// NE přes `page.route`: požadavek obsluhuje service worker a ten je pro
// odposlech Playwrightu neviditelný. Zápis na disk navíc rovnou ověří, že
// worker neservíruje starý rejstřík z cache (má na něj síť napřed).
//
// Musí se to udělat DŘÍV, než se kamkoli přejde na záložku `#debug`: rejstřík
// se čte JEDNOU za běh a drží v paměti, takže pozdější zápis by neměl efekt.
const REJSTRIK_CESTA = path.join(ROOT, 'dist', 'debug-stav.json')
const REJSTRIK_PUVODNI = fs.existsSync(REJSTRIK_CESTA) ? fs.readFileSync(REJSTRIK_CESTA, 'utf8') : null
if (!SINGLE) {
  fs.writeFileSync(
    REJSTRIK_CESTA,
    JSON.stringify({
      // Starší než odeslání záznamu níž, takže „odesláno, ale zatím nenasazeno"
      // se nesmí hlásit jako „zmizelo z repozitáře".
      vygenerovano: '2020-01-01T00:00:00.000Z',
      zaznamy: [
        {
          id: 'anicka-003',
          autor: 'anicka',
          typ: 'bug',
          nadpis: 'Cizí hlášení z repozitáře',
          moduly: ['plan'],
          priorita: 'stredni',
          stav: 'resim',
          soubor: '2026-08-20-0900-anicka.md',
          popis: 'Tohle nahlásil někdo jiný.',
          navrh: '',
          zdroj: 'export',
        },
        { id: 'anicka-002', autor: 'anicka', stav: 'hotovo', vyresenoDne: '2026-08-21', poznamka: 'opraveno', zdroj: 'vyreseno' },
      ],
    })
  )
}

// Rychlý zápis. Otevírá se z hlavičky, tedy odkudkoli – tenhle průchod je
// z Domů, protože se ověřuje i předvyplnění modulu podle otevřené záložky.
await page.click('#tabs button[data-tab="home"]')
await page.waitForTimeout(300)
await page.click('#debugOpen')
await page.waitForTimeout(400)
await kontrola('formulář zápisu se otevřel', () => page.locator('#debugZapis.show').count(), 1)
await kontrola('typ má tři volby', () => page.locator('#dzTyp button').count(), 3)
await kontrola('modulů je dvanáct', () => page.locator('.dz-moduly .pilulka').count(), 12)
// Předvyplnění podle záložky: na Domů musí být zaškrtnutý modul „Domů".
await kontrola('modul se předvyplnil podle obrazovky', () =>
  page.locator('.dz-moduly .pilulka.on').innerText().then((t) => t.trim()), 'Domů')
await kontrola('podrobnosti jsou schované', () => page.locator('.dz-podrobnosti').isVisible(), false)
await page.click('#dzVic')
await page.waitForTimeout(150)
await kontrola('Víc podrobností je rozbalí', () => page.locator('.dz-podrobnosti').isVisible(), true)
await kontrola('Návrh řešení je samostatné pole', () => page.locator('#dz-navrh').count(), 1)
// Bug má tři pole navíc, nápad dvě jiná – přepnutí typu je musí vyměnit.
await page.click('#dzTyp button[data-seg="bug"]')
await page.waitForTimeout(150)
await kontrola('bug má Kroky k zopakování', () => page.locator('#dz-kroky').count(), 1)
await kontrola('bug nemá pole nápadu', () => page.locator('#dz-motivace').count(), 0)

// Cesta z formuláře do prohlížeče. Kolečko v hlavičce vede vždycky na prázdný
// formulář, takže bez tohohle tlačítka by se člověk k seznamu dostal jen
// oklikou přes Nastavení.
await kontrola('formulář vede do poznámkovače', () => page.locator('#debugZapisSeznam').isVisible(), true)
await page.click('#debugZapisSeznam')
await page.waitForTimeout(400)
await kontrola('prázdný formulář přejde rovnou', () => page.locator('#debugZapis.show').count(), 0)
await kontrola('a otevře poznámkovač', () => page.evaluate(() => location.hash), '#debug')

// Zpátky do formuláře a totéž s rozepsaným textem: navigace nesmí text zahodit
// mlčky. Křížek zůstává vědomé „zahodit", tohle je něco jiného.
await page.click('#debugOpen')
await page.waitForTimeout(400)
// Znovuotevřený formulář je čistý, tedy zase typu Nápad. Kontroly níž počítají
// s bugem (filtr podle typu), tak se typ vrátí – jinak by ověřovaly něco jiného,
// než se tváří.
await page.click('#dzTyp button[data-seg="bug"]')
await page.waitForTimeout(150)
await page.fill('#dz-nadpis', 'Rozepsané')
await page.click('#debugZapisSeznam')
await page.waitForTimeout(400)
await kontrola('rozepsaný text se nezahodí mlčky', () => page.locator('#dialog.show').count(), 1)
await page.click('#dialogNe')
await page.waitForTimeout(400)
await kontrola('po zrušení zůstane formulář otevřený', () => page.locator('#debugZapis.show').count(), 1)
await kontrola('a text v něm zůstane', () => page.inputValue('#dz-nadpis'), 'Rozepsané')

// Zápis bez přezdívky se na ni zeptá – id záznamu ji nese a nikdy se nemění.
await page.fill('#dz-nadpis', 'Zkušební záznam ze smoke')
await page.fill('#dz-text', 'Tohle napsal kontrolní skript.')
await page.click('#dzUloz')
await page.waitForTimeout(400)
await kontrola('první zápis se ptá na přezdívku', () => page.locator('#dialog.show #dialogVstup').count(), 1)
await page.fill('#dialogVstup', 'Tadeáš Ž.')
await page.click('#dialogAno')
await page.waitForTimeout(800)
await kontrola('formulář se po zápisu zavřel', () => page.locator('#debugZapis.show').count(), 0)
await kontrola('přezdívka je bez diakritiky', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:prefs')).debugAutor), 'tadeas-z')

// Záznamy od srpna 2026 bydlí v IndexedDB (`core/debugDb.js`), ne v localStorage:
// vývojářská data nesmí sedět ve stejném ~5MB stropu jako poznámky z cest.
const debugZaznamy = () =>
  page.evaluate(
    () =>
      new Promise((hotovo) => {
        const r = indexedDB.open('vandrbuch-debug', 1)
        r.onsuccess = () => {
          const db = r.result
          if (!db.objectStoreNames.contains('debug')) return hotovo(null)
          const tr = db.transaction('debug', 'readonly')
          const g = tr.objectStore('debug').get('data')
          tr.oncomplete = () => hotovo(g.result || null)
          tr.onerror = () => hotovo(null)
        }
        r.onerror = () => hotovo(null)
      })
  )

// PODPIS ZAŘÍZENÍ v id (srpen 2026). Bez něj vyrobil telefon i počítač
// `tadeas-001` pro dva různé záznamy a rejstřík je spároval jako jeden.
const PODPIS = await page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:prefs')).debugZarizeni)
await kontrola('zařízení má tříznakový podpis', () => /^[abcdefghjkmnpqrstuvwxyz23456789]{3}$/.test(PODPIS || ''), true)
const PRVNI_ID = `tadeas-z-${PODPIS}-001`
await kontrola('id nese přezdívku i podpis zařízení', async () =>
  (await debugZaznamy()).zaznamy[0].id, PRVNI_ID)
await kontrola('záznam si nese kontext', async () => {
  const k = (await debugZaznamy()).zaznamy[0].kontext
  return !!k && !!k.obrazovka && !!k.viewport && !!k.build
}, true)
await kontrola('debug data nejsou v poznámkách z cest', () =>
  page.evaluate(() => localStorage.getItem('vandrbuch:v1').includes('Zkušební záznam')), false)
await kontrola('a nejsou ani ve vlastním klíči localStorage', () =>
  page.evaluate(() => localStorage.getItem('vandrbuch:debug')), null)

// Prohlížeč poznámek. Od srpna 2026 vede do něj zkratka přímo z hlavičky –
// do teď se otevíral jen oklikou přes Nastavení. Načítá se dynamickým
// importem, takže první vykreslení chvíli trvá.
await page.click('#debugSeznam')
await page.waitForTimeout(700)
await kontrola('zkratka v hlavičce otevře poznámkovač', () => page.evaluate(() => location.hash), '#debug')
// A cesta přes Nastavení musí fungovat dál – je to jediná na produkci, kde
// hlavička kolečka nemá.
await page.click('#nastaveniOpen')
await page.waitForTimeout(400)
await rozbal('poznamkovac')
await page.click('#debugOtevri')
await page.waitForTimeout(700)
await kontrola('poznámkovač se otevřel', () => page.locator('#panelDebug.show').count(), 1)
await kontrola('poznámkovač má adresu', () => page.evaluate(() => location.hash), '#debug')
await kontrola('zapsaný záznam je v seznamu', () => page.locator('.dzr:not(.cizi)').count(), 1)

// ŘÁDEK NESE JEN ČTYŘI ÚDAJE: nadpis, text, stav a prioritu. `id`, datum
// a štítek z repozitáře se ukážou až po rozbalení – v seznamu se rozhoduje
// podle stavu, ne podle identifikátoru.
await kontrola('řádek nese stav', () => page.locator('.dzr:not(.cizi) .dz-znacka.stav.nove').count(), 1)
await kontrola('řádek nenese id', () => page.locator('.dzr:not(.cizi) .dz-id').count(), 0)

// STADIUM VŮČI REPOZITÁŘI nese barva rámečku. Čerstvě zapsaný záznam nikam
// neodešel, takže je „jen tady" – barevný by tvrdil něco, co není pravda.
await kontrola('čerstvý záznam je jen tady', () => page.locator('.dzr.st-jentady').count(), 1)
// Šest stadií, ne pět: legenda je klíč k barvám, takže musí vysvětlit i hliněný
// rámeček „zmizelo z repozitáře", i když se snad nikdy neukáže.
await kontrola('legenda je pod tlačítky', () => page.locator('.dzr-lista + .dzr-legenda .dzl').count(), 6)

// Ťuknutí ROZBALÍ, neotevře úpravu. Teprve tlačítko uvnitř otevře formulář.
await page.click('.dzr:not(.cizi) .dzr-telo')
await page.waitForTimeout(300)
await kontrola('ťuknutí záznam rozbalí', () => page.locator('.dzr.otevreny .dzr-detail').count(), 1)
await kontrola('rozbalený ukáže id', () => page.locator('.dzr:not(.cizi) .dz-id').innerText(), PRVNI_ID)
await kontrola('rozbalený ukáže i celý text', () =>
  page.locator('.dzr.otevreny .dzr-detail').innerText().then((t) => t.includes('Tohle napsal kontrolní skript')), true)
await kontrola('a neotevřel formulář', () => page.locator('#debugZapis.show').count(), 0)
// Zase sbalit: rozbalené záznamy si prohlížeč pamatuje v paměti modulu, takže
// by druhé ťuknutí níž záznam naopak zavřelo.
await page.click('.dzr:not(.cizi) .dzr-telo')
await page.waitForTimeout(250)
await kontrola('druhé ťuknutí zase sbalí', () => page.locator('.dzr.otevreny').count(), 0)

// Oddíl „Od ostatních" je od srpna 2026 druhá půlka segmentu, ne přívěsek
// na konci obrazovky. Rejstřík se dotahuje asynchronně a obrazovka se po něm
// překreslí sama. V jednosouborové variantě žádný `debug-stav.json` není –
// appka pak o stavu v repozitáři nic netvrdí, což je jiný stav než „nic tam není".
await kontrola('segment nabízí obě půlky', () => page.locator('#dzSeg button').count(), 2)
await page.click('#dzSeg button[data-seg="cizi"]')
await page.waitForTimeout(600)
if (!SINGLE) {
  await page.waitForSelector('.dzr.cizi', { timeout: 5000 })
  // ODBYTÉ SE VE VÝCHOZÍM STAVU NEKRESLÍ. Zavřené záznamy nikdy nemizí, takže
  // by z téhle půlky obrazovky byla za rok zeď hotových věcí. Fixture má dva,
  // z toho jeden vyřešený – vidět má být jeden.
  await kontrola('cizí otevřené jsou vidět', () => page.locator('.dzr.cizi').count(), 1)
  await kontrola('a odbyté schované', () =>
    page.locator('#dzCiziOdbyte').innerText().then((x) => /Uk[áa]zat i odbyt/.test(x)), true)
  await kontrola('počet v segmentu je z otevřených', () =>
    page.locator('#dzSeg button[data-seg="cizi"]').innerText().then((x) => x.includes('(1)')), true)
  await kontrola('cizí záznam se needituje', () => page.locator('.dzr.cizi [data-upravit]').count(), 0)
  await kontrola('z cizího vede tlačítko na plné znění', () => page.locator('.dzr.cizi [data-plne]').count(), 1)
  await page.click('#dzCiziOdbyte')
  await page.waitForTimeout(400)
  await kontrola('po přepnutí jsou vidět i odbyté', () => page.locator('.dzr.cizi').count(), 2)
  await kontrola('vyřešené cizí nese datum', () =>
    page.locator('.dzr.cizi').nth(1).innerText().then((t) => /21\. 8\./.test(t)), true)
  await page.click('#dzCiziOdbyte')
  await page.waitForTimeout(400)
  // Rozbalení ukáže popis; plné znění otevře TÝŽ plát jako úprava, jen zamčený.
  await page.click('.dzr.cizi .dzr-telo')
  await page.waitForTimeout(300)
  await kontrola('cizí se taky rozbalí', () => page.locator('.dzr.cizi.otevreny .dz-id').innerText(), 'anicka-003')
  await page.click('.dzr.cizi .dzr-kopie')
  await page.waitForTimeout(600)
  await kontrola('plné znění otevře plát', () => page.locator('#debugZapis.show').count(), 1)
  await kontrola('a je jen ke čtení', () => page.locator('#debugZapis [data-pole]').count(), 0)
  await kontrola('plát řekne, že víc appka neví', () =>
    page.locator('#debugZapis .dz-kontext-vypis').innerText().then((t) => /nenasazuj/i.test(t)), true)
  await page.click('#debugZapisZavri')
  await page.waitForTimeout(400)
} else {
  await kontrola('bez rejstříku se cizí oddíl neukáže', () => page.locator('.dzr.cizi').count(), 0)
  await kontrola('a neřekne, že tam nic není', () =>
    page.locator('.dzr-prazdno').innerText().then((t) => /nepoda[řr]ilo/i.test(t)), true)
}
await page.click('#dzSeg button[data-seg="moje"]')
await page.waitForTimeout(400)

// FILTR JE SBALENÝ. Čtyři řady pilulek (z toho dvanáct modulů) zabraly půl
// telefonu dřív, než se čtenář dostal k prvnímu záznamu.
await kontrola('filtr je schovaný pod tlačítkem', () => page.locator('.dzf-typ').count(), 0)
await page.click('#dzfPrepinac')
await page.waitForTimeout(250)
await kontrola('a rozbalí se', () => page.locator('.dzf-typ').count(), 1)
// Tři řady, ne čtyři: filtr podle části appky zmizel (moduly nejsou vidět ani
// v řádku) a řada „stav" ustoupila stadiím, podle kterých se seznam prochází.
await kontrola('filtr podle části appky je pryč', () => page.locator('.dzf-modul').count(), 0)
await kontrola('a stavy taky', () => page.locator('.dzf-stav').count(), 0)
await kontrola('stadium jde filtrovat', () => page.locator('.dzf-stadium .pilulka').count(), 7)
// ŘADY SE ZALAMUJÍ, NEPOSOUVAJÍ. `.pilulky` má vodorovné posouvání a stačilo
// zapomenout přejmenovanou třídu ve výčtu, aby se řada stadií tiše začala
// posouvat. Měří se to na obsah proti šířce, protože posouvání jinak není
// z DOM poznat – vypadá úplně stejně jako zalomení.
await kontrola('žádná řada filtru nepřetéká', () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.dzf')].every((r) => r.scrollWidth <= r.clientWidth + 1)
  ), true)
// A stadia se opravdu zalomila na víc řádků – kdyby se vešla na jeden,
// kontrola výš by prošla i s posouváním.
await kontrola('stadia se zalomila na dva řádky', () =>
  page.evaluate(() => {
    const r = document.querySelector('.dzf-stadium')
    return new Set([...r.children].map((p) => Math.round(p.getBoundingClientRect().top))).size
  }).then((n) => n >= 2), true)

// Zapsaný záznam nikam neodešel, takže „na mainu" musí seznam vyprázdnit
// a „jen tady" ho vrátit.
await page.click('.dzf-stadium .pilulka:has-text("na mainu")')
await page.waitForTimeout(250)
await kontrola('filtr podle stadia zabral', () => page.locator('.dzr:not(.cizi)').count(), 0)
await page.click('.dzf-stadium .pilulka:has-text("jen tady")')
await page.waitForTimeout(250)
await kontrola('a správné stadium záznam najde', () => page.locator('.dzr:not(.cizi)').count(), 1)
await page.click('.dzf-stadium .pilulka:has-text("Každé stadium")')
await page.waitForTimeout(250)

// Filtr, kterému nic neodpovídá, musí vysvětlit proč – prázdná obrazovka
// bez věty vypadá jako rozbitá appka.
await page.click('.dzf-typ .pilulka:has-text("Nápad")')
await page.waitForTimeout(250)
await kontrola('filtr podle typu zabral', () => page.locator('.dzr:not(.cizi)').count(), 0)
await kontrola('prázdný filtr to vysvětlí', () =>
  page.locator('.dzr-prazdno').innerText().then((t) => /filtru nic neodpov/i.test(t)), true)
await kontrola('počet zapnutých filtrů je vidět', () =>
  page.locator('#dzfPrepinac').innerText().then((t) => t.includes('(1)')), true)
await page.click('.dzf-typ .pilulka:has-text("Vše")')
await page.waitForTimeout(250)
await kontrola('zrušení filtru záznam vrátí', () => page.locator('.dzr:not(.cizi)').count(), 1)
await page.click('#dzfPrepinac')
await page.waitForTimeout(250)

// Úprava vede přes rozbalený záznam – TÝŽ formulář jako zápis, jen se stavem.
await page.click('.dzr:not(.cizi) .dzr-telo')
await page.waitForTimeout(300)
await page.click('.dzr.otevreny [data-upravit]')
await page.waitForTimeout(600)
await kontrola('tlačítko Upravit otevře formulář', () => page.locator('#debugZapis.show').count(), 1)
await kontrola('úprava má i volbu stavu', () => page.locator('#dzStav button').count(), 4)
await page.click('#dzStav button[data-seg="hotovo"]')
await page.click('#dzUloz')
await page.waitForTimeout(800)
await kontrola('změna stavu se uložila', async () => (await debugZaznamy()).zaznamy[0].stav, 'hotovo')
await kontrola('id se úpravou nezměnilo', async () => (await debugZaznamy()).zaznamy[0].id, PRVNI_ID)
await kontrola('seznam se sám překreslil', () => page.locator('.dzr:not(.cizi) .dz-znacka.stav.hotovo').count(), 1)
// Úprava rozbalení nezruší – sbalit ručně, ať další sekce začíná v čistém stavu.
await page.click('.dzr:not(.cizi) .dzr-telo')
await page.waitForTimeout(250)

// EXPORT JE SBALENÝ POD JEDNÍM PANELEM i se zálohou (srpen 2026). Dohromady
// to byla čtyři tlačítka a dva odstavce vysvětlení, tedy víc obrazovky než
// samotný seznam – a opticky to matlo v tom, co je hlavní akce.
// Odznak na sbaleném panelu říká, kolik čeká na odeslání – bez něj by se na
// export dalo zapomenout, protože panel je zavřený.
await kontrola('odznak hlásí čekající', () => page.locator('#dzExportPrepinac .sbalka-odznak').innerText(), '1')
await kontrola('export je schovaný', () => page.locator('#dzRozsah').count(), 0)
await kontrola('a záloha s ním', () => page.locator('#dzZaloha').count(), 0)
await page.click('#dzExportPrepinac')
await page.waitForTimeout(300)
await kontrola('panel Export se rozbalí', () => page.locator('#dzRozsah').count(), 1)
await kontrola('a je v něm i záloha', () => page.locator('#dzZaloha').count(), 1)

// Rozsah je segment na obrazovce, ne dialog: navigator.share() se musí zavolat
// synchronně v obsluze kliknutí a `await` před ním by ho zablokoval.
await kontrola('export nabízí tři rozsahy', () => page.locator('#dzRozsah button').count(), 3)
await kontrola('výchozí rozsah jsou nové a změněné', () =>
  page.locator('#dzRozsah button.on').innerText().then((t) => t.trim()), 'Nové a změněné')
// Záznam ještě nikam neodešel, takže do „nových a změněných" patří.
await kontrola('neodeslaný záznam je v rozsahu', () => page.locator('#dzMd').isDisabled(), false)

// SDÍLET UŽ NEEXISTUJE. Nedělalo nic: Chromium nepustí `.md` přes Web Share
// (není na seznamu povolených přípon), takže kód spadl do větve „stáhnout“,
// a `.catch(() => {})` navíc polykal každou chybu.
await kontrola('tlačítko Sdílet je pryč', () => page.locator('#dzSdilet').count(), 0)
await kontrola('místo něj je Odeslat do repozitáře', () => page.locator('#dzOdeslat').count(), SINGLE ? 0 : 1)
// Stáhnout zůstává napořád jako záložní cesta a musí u sebe mít návod –
// bez něj člověk neví, kam se stažený soubor dává.
await kontrola('Stáhnout zůstalo', () => page.locator('#dzMd').count(), 1)
await kontrola('a nese návod, kam soubor patří', () =>
  page.locator('.dz-export .sbalka-telo').innerText().then((x) => /slo\u017eky <?code>?debug|slo\u017eky .?debug/i.test(x) || /debug\//.test(x)), true)

if (!SINGLE) {
  // Bez hesla se odeslání musí zeptat – heslo není v balíčku aplikace, protože
  // repozitář je veřejný a šlo by ho vyčíst.
  await page.click('#dzOdeslat')
  await page.waitForTimeout(500)
  await kontrola('bez hesla se odeslání zeptá', () => page.locator('#dialog.show #dialogVstup').count(), 1)
  // HESLO S DIAKRITIKOU SCHVÁLNĚ. Hodnota HTTP hlavičky smí jen znaky do 0xFF,
  // takže kdyby se heslo vrátilo z těla do hlavičky, `fetch` by spadl ještě
  // v prohlížeči a požadavek by vůbec neodešel. Poznalo by se to tím, že místo
  // odpovědi serveru přijde „nepodařilo odeslat".
  await page.fill('#dialogVstup', 'žluťoučké-heslíčko')
  await page.click('#dialogAno')
  await page.waitForTimeout(900)

  // A TEĎ TO PODSTATNÉ: selhání se musí pojmenovat, ne spolknout. Přesně tím,
  // že se nepojmenovalo, bylo staré tlačítko Sdílet k ničemu.
  await kontrola('selhání se pojmenuje, ne spolkne', () =>
    page.locator('#dialog.show').innerText().then((x) => /nepovedlo/i.test(x) && x.length > 40), true)
  // A ROZLIŠIT, ČÍ CHYBA TO JE. Když se heslo pošle v HTTP hlavičce, `fetch`
  // spadne kvůli diakritice ještě v prohlížeči a požadavek vůbec neodejde –
  // appka pak hlásí selhání u serveru, kterého nikdo neoslovil. Heslo v testu
  // má diakritiku schválně, aby se to tímhle poznalo.
  await kontrola('a požadavek opravdu odešel', () =>
    page.locator('#dialog.show').innerText().then((x) => !/nepodařilo odeslat/i.test(x)), true)
  await page.click('#dialogNe').catch(() => page.click('#dialogAno'))
  await page.waitForTimeout(400)
  await kontrola('heslo se uložilo do předvoleb', () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:prefs')).debugHeslo), 'žluťoučké-heslíčko')
  await kontrola('a záznam zůstal neodeslaný', async () =>
    (await debugZaznamy()).zaznamy[0].exportovanoDo, '')
}

// Stažení .md. Playwright zachytí soubor a ověří se jeho obsah – formát je
// zároveň vstupem pro scripts/debug-rejstrik.mjs, takže se nesmí rozejít.
const [stazeny] = await Promise.all([page.waitForEvent('download'), page.click('#dzMd')])
const mdNazev = stazeny.suggestedFilename()
await kontrola('název .md nese datum, čas i autora', () =>
  /^\d{4}-\d{2}-\d{2}-\d{4}-tadeas-z\.md$/.test(mdNazev), true)
const mdCesta = path.join(ROOT, 'dist', '.smoke-export.md')
await stazeny.saveAs(mdCesta)
const mdText = fs.readFileSync(mdCesta, 'utf8')
fs.unlinkSync(mdCesta)
await kontrola('export má hlavičku pro AI', () => mdText.startsWith('# Vandrbuch — Debug export'), true)
await kontrola('export odkazuje na pravidlo', () => mdText.includes('.claude/rules/debug.md'), true)
await kontrola('export nese id i s podpisem zařízení', () =>
  new RegExp(`^## ${PRVNI_ID} · `, 'm').test(mdText), true)
// Kontext je víc řádků: čas · obrazovka · online · viewport, pak build a cache.
await kontrola('export nese sebraný kontext', () => /\*\*Kontext\*\*\n[\s\S]{0,400}\nbuild /.test(mdText), true)

// OZNAČENÍ JE AUTOMATICKÉ. Dřív se ptal dialog a odpověď „Teď ne" byla druhá
// cesta, jak si vyrobit duplicitu: záznam zůstal neoznačený a příští export
// ho poslal znovu.
await page.waitForTimeout(900)
await kontrola('označení se neptá', () => page.locator('#dialog.show').count(), 0)
await kontrola('u záznamu zůstal název souboru', async () =>
  (await debugZaznamy()).zaznamy[0].exportovanoDo, mdNazev)
// TOHLE JE CELÝ SMYSL NOVÉHO ROZSAHU: druhý export nesmí vyrobit další kopii.
// Pět záznamů skončilo ve dvanácti kopiích ve čtyřech souborech za dva dny,
// protože „nevyřešené" posílalo pokaždé znovu všechno.
await kontrola('druhý export už nemá co poslat', () => page.locator('#dzMd').isDisabled(), true)
await kontrola('a řekne to slovy', () =>
  page.locator('.dz-export .sbalka-telo').innerText().then((x) => /nen[ií] nic|Nen[ií] co/i.test(x)), true)
// Ale „Vše" ho pořád najde – to je záchrana, když se soubor ztratí.
await page.click('#dzRozsah button[data-seg="vse"]')
await page.waitForTimeout(300)
await kontrola('rozsah Vše záznam pořád najde', () => page.locator('#dzMd').isDisabled(), false)
// A odznak po odeslání zmizí – nic nečeká.
await kontrola('odznak po odeslání zmizel', () => page.locator('#dzExportPrepinac .sbalka-odznak').count(), 0)
await page.click('#dzRozsah button[data-seg="kodeslani"]')
await page.waitForTimeout(300)
// Rejstřík je STARŠÍ než tenhle export, takže „odesláno" je pravda a hlásit
// „zmizelo z repozitáře" by byl planý poplach po každém exportu do nasazení.
await page.click('.dzr:not(.cizi) .dzr-telo')
await page.waitForTimeout(300)
await kontrola('a v rozbaleném je vidět odesláno', () => page.locator('.dz-znacka.odeslano').count(), 1)
// Rejstřík tenhle záznam nezná (je z fixture), takže stadium zůstává „odesláno",
// ne „na mainu" – tvrdit „na mainu" bez potvrzení z rejstříku by byla lež.
await kontrola('po exportu je stadium odesláno', () => page.locator('.dzr.st-odeslano').count(), 1)
await kontrola('nenasazený export nestraší', () => page.locator('.dz-znacka.repo.chybi').count(), 0)
// ÚPRAVA UŽ ODESLANÉHO se musí zeptat: v repozitáři leží podoba, která odešla,
// a změna se tam dostane až dalším exportem.
await page.click('.dzr.otevreny [data-upravit]')
await page.waitForTimeout(500)
await page.fill('#dz-nadpis', 'Přepsáno po exportu')
await page.click('#dzUloz')
await page.waitForTimeout(400)
await kontrola('úprava odeslaného se ptá', () => page.locator('#dialog.show').count(), 1)
await kontrola('a řekne proč', () =>
  page.locator('#dialog.show').innerText().then((x) => /repozit[áa]ři/i.test(x)), true)
await page.click('#dialogAno')
await page.waitForTimeout(700)
// Otisk se rozešel s tím, co odešlo – rámeček to musí říct.
await kontrola('po úpravě je stadium změněné', () => page.locator('.dzr.st-zmeneno').count(), 1)

// Zpátky na původní nadpis, ať další sekce pracují s tím, co čekají.
// A rovnou kontrola: vrácení na odeslanou podobu se NEPTÁ – otisk zase sedí,
// takže není na co upozorňovat.
await page.click('.dzr.otevreny [data-upravit]')
await page.waitForTimeout(500)
await page.fill('#dz-nadpis', 'Zkušební záznam ze smoke')
await page.click('#dzUloz')
await page.waitForTimeout(700)
await kontrola('návrat k odeslané podobě se neptá', () => page.locator('#dialog.show').count(), 0)
await kontrola('a stadium se vrátí na odesláno', () => page.locator('.dzr.st-odeslano').count(), 1)

await page.click('.dzr:not(.cizi) .dzr-telo')
await page.waitForTimeout(300)

// Záloha .json a import zpátky. Import nepřepisuje existující id – je to
// záchrana po přeinstalaci, ne synchronizace.
const [zaloha] = await Promise.all([page.waitForEvent('download'), page.click('#dzZaloha')])
await kontrola('název zálohy navazuje na konvenci', () =>
  /^vandrbuch-debug-zaloha-\d{4}-\d{2}-\d{2}\.json$/.test(zaloha.suggestedFilename()), true)
const zalohaCesta = path.join(ROOT, 'dist', '.smoke-debug-zaloha.json')
await zaloha.saveAs(zalohaCesta)
await kontrola('záloha se představí značkou', () =>
  JSON.parse(fs.readFileSync(zalohaCesta, 'utf8')).format, 'vandrbuch-debug')
await page.setInputFiles('#dzImport', zalohaCesta)
await page.waitForTimeout(800)
await kontrola('import nezduplikuje, co už tu je', async () => (await debugZaznamy()).zaznamy.length, 1)
fs.unlinkSync(zalohaCesta)

// REGRESE: ZÁZNAM BEZ OTISKU, KTERÝ REJSTŘÍK ZNÁ.
//
// `otiskExportu` se ukládá až od srpna 2026 při označení odesláno. Všechno, co
// odešlo dřív, ho nemá – a v okamžiku vydání to byly úplně všechny záznamy,
// takže se u nich změna nedala poznat vůbec a barva rámečku lhala. Tahle sekce
// hlídá druhou cestu: porovnání přímo s tím, co nese rejstřík, a dopočítání
// otisku, jakmile obojí sedne.
if (!SINGLE) {
  const zaznam = (await debugZaznamy()).zaznamy[0]

  // Rejstřík ten záznam nově zná – přesně v podobě, jakou má appka.
  const rejstrik = JSON.parse(fs.readFileSync(REJSTRIK_CESTA, 'utf8'))
  rejstrik.vygenerovano = new Date(Date.now() + 60000).toISOString()
  rejstrik.zaznamy.push({
    id: zaznam.id,
    autor: zaznam.autor,
    typ: zaznam.typ,
    nadpis: zaznam.nadpis,
    moduly: zaznam.moduly,
    priorita: zaznam.priorita,
    stav: zaznam.stav,
    soubor: zaznam.exportovanoDo,
    popis: zaznam.text,
    navrh: zaznam.navrh,
    zdroj: 'export',
  })
  fs.writeFileSync(REJSTRIK_CESTA, JSON.stringify(rejstrik, null, 2))

  // A otisk se smaže, jako by záznam odešel ještě před srpnem 2026.
  await page.evaluate(
    () =>
      new Promise((hotovo) => {
        const r = indexedDB.open('vandrbuch-debug', 1)
        r.onsuccess = () => {
          const tr = r.result.transaction('debug', 'readwrite')
          const sklad = tr.objectStore('debug')
          const g = sklad.get('data')
          g.onsuccess = () => {
            const d = g.result
            for (const z of d.zaznamy) delete z.otiskExportu
            sklad.put(d, 'data')
          }
          tr.oncomplete = () => hotovo(true)
          tr.onerror = () => hotovo(false)
        }
      })
  )

  // SKUTEČNÝ RELOAD, ne `goto` na tutéž adresu s jiným fragmentem – ten dokument
  // nepřenačte a rejstřík by zůstal v paměti ten starý (čte se jednou za běh).
  await page.evaluate(() => {
    location.hash = '#debug'
  })
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(2000)

  await kontrola('bez otisku, ale shodný, je na mainu', () => page.locator('.dzr.st-namainu').count(), 1)
  // Dorovnání: jakmile rejstřík potvrdí shodu, otisk se dopočítá a od té chvíle
  // rozhoduje přesné porovnání – to vidí i na kroky, které rejstřík nenese.
  await kontrola('otisk se dopočítal', async () => !!(await debugZaznamy()).zaznamy[0].otiskExportu, true)

  // A teď to, co dřív mlčelo: úprava záznamu, který je na mainu.
  await page.click('.dzr:not(.cizi) .dzr-telo')
  await page.waitForTimeout(300)
  await page.click('.dzr.otevreny [data-upravit]')
  await page.waitForTimeout(500)
  await page.fill('#dz-nadpis', 'Upraveno po nasazení')
  await page.click('#dzUloz')
  await page.waitForTimeout(400)
  await kontrola('úprava záznamu z mainu se ptá', () => page.locator('#dialog.show').count(), 1)
  await page.click('#dialogAno')
  await page.waitForTimeout(700)
  await kontrola('a rámeček zčervená', () => page.locator('.dzr.st-zmeneno').count(), 1)

  // Zpátky, ať mazání níž najde, co čeká.
  await page.click('.dzr.otevreny [data-upravit]')
  await page.waitForTimeout(500)
  await page.fill('#dz-nadpis', 'Zkušební záznam ze smoke')
  await page.click('#dzUloz')
  await page.waitForTimeout(700)
  await page.click('.dzr:not(.cizi) .dzr-telo')
  await page.waitForTimeout(300)
}

// Hromadný výběr a mazání. Úklid je zároveň příprava pro další sekce – smoke
// nesmí nechat v úložišti záznam, o kterém další kontroly nevědí.
await page.click('.dzr-check')
await page.waitForTimeout(200)
await kontrola('výběr se propíše do tlačítka', () =>
  page.locator('#dzSmaz').innerText().then((t) => t.includes('(1)')), true)
await page.click('#dzSmaz')
await page.waitForTimeout(400)
await kontrola('mazání se ptá', () => page.locator('#dialog.show').count(), 1)
await page.click('#dialogAno')
await page.waitForTimeout(800)
await kontrola('záznam zmizel', () => page.locator('.dzr:not(.cizi)').count(), 0)
await kontrola('prázdný poznámkovač poradí', () =>
  page.locator('.dzr-prazdno').innerText().then((t) => /Zat[ií]m nic/i.test(t)), true)
// Číslo se po smazání NEVRACÍ – další záznam musí dostat 002.
await kontrola('číslování se nevrátilo', async () => (await debugZaznamy()).dalsiCislo, 2)

await page.goBack()
await page.waitForTimeout(300)

// Objevuj
await page.click('#tabs button[data-tab="disc"]')
await page.waitForTimeout(300)
// Objevuj má od přestavby rozvržení dlaždice `.dlazdice-kus` místo `.coll`
// a nálady jako pilulky – přestěhovaly se sem z Domů, kde je předloha nemá.
// 12 od N5 (srpen 2026) – kolekce „Se psem“ dřív v COLL chyběla.
await kontrola('kolekce v Objevuj', () => page.locator('.dlazdice-kus').count(), 12)
await kontrola('nálady v Objevuj', () => page.locator('.nalady .pilulka').count(), 6)
// Karusel má od přestavby Domů dvě obrazovky, takže se musí počítat jen ten
// na Objevuj – bez `#discInner` by se sečetly oba a číslo by nic neznamenalo.
await kontrola('mřížka doporučených', () => page.locator('#discInner .fotomrizka .fotokarta').count(), 9)
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
// Pátá ikona je košík výpravy (srpen 2026) – „chci vidět, zatím nevím kdy",
// na rozdíl od plánu, který je závazek s pořadím a dnem.
await kontrola('detail má ikonovou řadu', () => page.locator('#sheet .ikonrada .ikonbtn').count(), 5)

// ZRUŠENÍ DIALOGU NAD DETAILEM NESMÍ ZAVŘÍT DETAIL (hlášení tadeas-003).
// Detail se zavírá klikem mimo panel a klik uvnitř dialogu je technicky „mimo“,
// takže „Do košíku“ → Zrušit člověka vyhodilo na mapu. Dvakrát: tlačítkem
// Zrušit a klikem na závěs – ten dialog zavírá taky a do `#dialog` nepatří.
await page.evaluate(() => document.getElementById('dKosik').click())
await page.waitForTimeout(400)
await kontrola('výběr výpravy se otevřel nad detailem', () => page.locator('#dialog.show').count(), 1)
await page.click('#dialogNe')
await page.waitForTimeout(400)
await kontrola('a po Zrušit detail zůstal otevřený', () => page.locator('#sheet.show').count(), 1)

await page.evaluate(() => document.getElementById('dKosik').click())
await page.waitForTimeout(400)
await page.evaluate(() => document.getElementById('backdrop').click())
await page.waitForTimeout(400)
await kontrola('ani klik na závěs detail nezavře', () => page.locator('#sheet.show').count(), 1)
await kontrola('a dialog je pryč', () => page.locator('#dialog.show').count(), 0)
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

// plán: knihovna Výpravy → nová výprava → Itinerář
await page.click('#tabs button[data-tab="plan"]')
await page.waitForTimeout(300)
await kontrola('prázdná knihovna má hlášku', () => page.locator('#planWrap .empty').count(), 1)
await kontrola('segment Na cestě · V plánu · Za námi', () => page.locator('#planSegment button').count(), 3)
// Bez rozjeté cesty se začíná knihovnou Výpravy – ta je vstupní bod.
await kontrola('začíná se V plánu', () => page.locator('#planSegment button.on').innerText(), 'V plánu')
// Fantom se nevypisuje (srpen 2026): čerstvý uživatel žádnou výpravu nezaložil,
// takže mu knihovna nemá vnucovat prázdný „Náš plán".
await kontrola('fantomová výprava se nevypisuje', () => page.locator('.vypravaradek').count(), 0)

// Nová výprava (prompt) → rovnou do Itineráře → „Přidat zastávku“ → vybírátko
await page.click('#vypNova')
await page.waitForTimeout(400)
// Dialogy jsou od srpna 2026 vlastní (#dialog), ne nativní prompt/confirm.
await kontrola('dialog má vstup i obě tlačítka', () =>
  page.locator('#dialog.show #dialogVstup, #dialog.show #dialogAno, #dialog.show #dialogNe').count(), 3)
await page.locator('#dialogVstup').fill('Zkušební výprava')
await page.click('#dialogAno')
await page.waitForTimeout(500)
// Itinerář od srpna 2026 není díl segmentu (ten má jen Na cestě · V plánu ·
// Za námi) – je to vnitřek konkrétní cesty. Že se otevřel, se pozná podle
// dashboardu s kostrou dnů, ne podle zvýrazněného tlačítka.
await kontrola('nová výprava otevře Itinerář', () => page.locator('.planhlava h2').count(), 1)
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
// Vyjíždí se z otevřeného plánu, jako se v navigaci spouští otevřená trasa.
await kontrola('Itinerář nabízí Vyjet', () => page.locator('#planVyjet').count(), 1)

// Košík (srpen 2026): wishlist výpravy bez pořadí a bez dnů. Plní se
// hvězdičkou v detailu místa, vysypává se do itineráře.
await page.evaluate(() => document.querySelector('[data-dash="kosik"]')?.click())
await page.waitForTimeout(400)
await kontrola('prázdný košík vysvětluje, k čemu je', () =>
  page.locator('.cesta-prazdno h3').innerText().then((x) => /prázdný/i.test(x))
)
// Do košíku z detailu místa – tam se člověk rozhoduje. Druhý řádek, ne první:
// ten už je v plánu z předchozího kroku a přesun z košíku by se správně
// odmítl hláškou „už v itineráři je".
await page.click('#tabs button[data-tab="list"]')
await page.waitForTimeout(500)
const doKosiku = page.locator('#listInner .radek').nth(1)
await doKosiku.scrollIntoViewIfNeeded()
await doKosiku.click()
await page.waitForTimeout(700)
await kontrola('detail má tlačítko košíku', () => page.locator('#dKosik').count(), 1)
// Tlačítko se od srpna 2026 ptá, DO KTERÉ výpravy – dřív sahalo rovnou na
// otevřenou, takže „chci to na dvě výpravy" znamenalo přepínat sem a tam.
// Otevřená výprava je zkratka na prvním řádku a dialog zavře.
await page.evaluate(() => document.getElementById('dKosik').click())
await page.waitForTimeout(500)
await kontrola('košík se ptá, do které výpravy', () => page.locator('#dialog.show #dialogHlavni').count(), 1)
await page.click('#dialogHlavni')
await page.waitForTimeout(500)
await kontrola('místo se uložilo do košíku', () =>
  page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('vandrbuch:v1'))
    return Object.values(s.kosik || {}).some((x) => x.length === 1)
  })
)
// I POTVRZENÍ nechává detail otevřený, ze stejného důvodu jako zrušení výš.
// Do srpna 2026 ho zavíralo a tenhle test na tom tiše stál: `goBack()` níž
// zavíral už jen zbytek, protože detail spadl sám (hlášení tadeas-003).
await kontrola('detail zůstal otevřený i po potvrzení', () => page.locator('#sheet.show').count(), 1)
await zavriDetail()
await kontrola('a zpět ho zavře', () => page.locator('#sheet.show').count(), 0)
await page.click('#tabs button[data-tab="plan"]')
await page.waitForTimeout(300)
// Košík je plovoucí plát nad obrazovkou, ne karta segmentu – tahá se z něj
// do dnů, takže obojí musí být vidět naráz.
await kontrola('košík má plovoucí tlačítko', () => page.locator('#kosikFab:not([hidden])').count(), 1)
await kontrola('odznak ukazuje počet', () => page.locator('#kosikFabPocet').innerText(), '1')
await page.click('#kosikFab')
await page.waitForTimeout(600)
await kontrola('plát se vytáhl', () => page.locator('#kosikPlat.show').count(), 1)
await kontrola('košík ukazuje uložené místo', () => page.locator('.kosik-radek').count(), 1)
await kontrola('košík nabízí vlastní místo', () => page.locator('#kosikPridatVlastni').count(), 1)
// Kolečko doletí do pravého horního rohu plátu a zesvětlá – je to pořád
// tentýž knoflík, takže je vidět, že plát zavře právě on.
await kontrola('kolečko dosedlo do plátu', () => page.locator('#kosikFab.vplatu').count(), 1)
await kontrola('kolečko sedí uvnitř plátu', () =>
  page.evaluate(() => {
    const f = document.getElementById('kosikFab').getBoundingClientRect()
    const p = document.getElementById('kosikPlat').getBoundingClientRect()
    return f.top >= p.top && f.bottom <= p.bottom && f.right <= p.right + 1
  }))
// Hromadné „Vysypat" odsud odešlo – destruktivní akce, kterou nikdo denně
// nepotřebuje. Místa se vyhazují po jednom křížkem na řádku.
await kontrola('košík nenabízí hromadné vysypání', () => page.locator('#kosikVyprazdnit').count(), 0)
// Přesun do itineráře košík vyprázdní – na dvou místech naráz by místo mátlo.
await page.click('[data-kos-plan]')
await page.waitForTimeout(800)
await kontrola('místo z košíku přešlo do itineráře', () =>
  page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('vandrbuch:v1'))
    return s.plan.length === 2 && Object.values(s.kosik || {}).every((x) => x.length === 0)
  })
)
// Zpátky na Itinerář – další kontroly (dny, bloky) žijí tam a na Košíku
// by `#planPridat` neexistovalo. Zastávka přidaná z košíku se přitom musí
// zase odebrat: následující kontroly stojí na plánu o jedné zastávce
// a jinak by se sesypaly na posunutých počtech.
// Itinerář není díl segmentu – zpátky se jde ťuknutím na řádek v knihovně.
await page.locator('#planSegment button', { hasText: 'V plánu' }).first().click()
await page.waitForTimeout(400)
await page.click('.vypravaradek')
await page.waitForTimeout(600)
await page.locator('.zastavka').nth(1).locator('[data-act="vice"]').click()
await page.waitForTimeout(300)
await page.locator('.zastavka').nth(1).locator('[data-act="rm"]').click()
await page.waitForTimeout(500)
await kontrola('plán je zpátky na jedné zastávce', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).plan.length), 1)

// Dny: „Přidat den" přidá prázdný den (dřív od druhého kliknutí tiché nic),
// prázdný den jde táhnout za úchyt jako celá skupina, „Zrušit dny" uklidí.
await page.click('#planPridat')
await page.waitForTimeout(500)
await page.locator('#vmBody .radek').nth(1).click()
await page.waitForTimeout(600)
await page.click('#planDen')
await page.waitForTimeout(500)
await kontrola('Přidat den přidá prázdný den', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).planDny.join(',')), '2,0')
await kontrola('prázdný den má hlavičku', () => page.locator('.denhd').count(), 2)
{
  const uchyt = await page.locator('.denhd[data-den="2"] [data-uchyt-dne]').boundingBox()
  const prvni = await page.locator('.denhd[data-den="1"]').boundingBox()
  await page.mouse.move(uchyt.x + uchyt.width / 2, uchyt.y + uchyt.height / 2)
  await page.mouse.down()
  await page.mouse.move(prvni.x + 100, prvni.y + 2, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(500)
}
await kontrola('prázdný den jde přetáhnout nahoru', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).planDny.join(',')), '0,2')
await page.click('#planBezDnu')
await page.waitForTimeout(400)
await kontrola('Zrušit dny uklidí dělení', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).planDny.length), 0)
// Druhou zastávku zase odebrat, ať další kontroly počítají s jednou.
await page.locator('.zastavka').nth(1).locator('[data-act="vice"]').click()
await page.waitForTimeout(300)
await page.locator('.zastavka').nth(1).locator('[data-act="rm"]').click()
await page.waitForTimeout(500)
await kontrola('zastávka jde odebrat', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).plan.length), 1)

// Knihovna: výprava v seznamu, složky, sbalování, otevření řádkem
await page.click('#planSegment button[data-seg="vypravy"]')
await page.waitForTimeout(400)
await kontrola('výprava se zastávkou je v knihovně', () => page.locator('.vypravaradek').count(), 1)
await kontrola('výprava na mapě je odlišená', () => page.locator('.vypravaradek.on').count(), 1)
await page.click('#slozkaNova')
await page.waitForTimeout(300)
await page.locator('#dialogVstup').fill('Balkán')
await page.click('#dialogAno')
await page.waitForTimeout(400)
await kontrola('nová složka je vidět i prázdná', () => page.locator('.slozka-radek').count(), 1)
// Akce výpravy jsou od srpna 2026 JEN v Itineráři pod „…" – v knihovně řádek
// žádnou nabídku nemá, ťuknutí ho rovnou otevře.
await kontrola('řádek výpravy nemá vlastní nabídku', () => page.locator('[data-vyprava-vice]').count(), 0)
await kontrola('řádek výpravy má šipku dovnitř', () => page.locator('.vypravaradek-sipka').count(), 1)
await page.click('.vypravaradek')
await page.waitForTimeout(500)
await kontrola('ťuknutí na řádek otevře Itinerář', () => page.locator('.planhlava h2').count(), 1)
await page.click('#planVice')
await page.waitForTimeout(300)
await page.click('#planDoSlozky')
await page.waitForTimeout(300)
await kontrola('výběr složky je dialog se seznamem', () =>
  page.locator('#dialog.show .dialog-volba').count().then((n) => n >= 3))
await page.locator('#dialog .dialog-volba', { hasText: 'Balkán' }).click()
await page.waitForTimeout(400)
await kontrola('výprava se přesunula do složky', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).vypravaSlozka), 'Balkán')
await page.click('#planZpet')
await page.waitForTimeout(400)
await kontrola('řádek je uvnitř složky', () => page.locator('.slozka-obsah .vypravaradek').count(), 1)
await page.click('.slozka-radek')
await page.waitForTimeout(300)
await kontrola('složka jde sbalit', () => page.locator('.slozka-obsah').count(), 0)
await page.click('.slozka-radek')
await page.waitForTimeout(300)

// Tažení dlouhým podržením (druhá cesta vedle dialogu složek): řádek výpravy
// nad hlavičku druhé složky, pak přeskládání složek tažením hlavičky.
await page.click('#slozkaNova')
await page.waitForTimeout(300)
await page.locator('#dialogVstup').fill('Alpy')
await page.click('#dialogAno')
await page.waitForTimeout(400)
{
  const radek = await page.locator('.slozka-obsah .vypravaradek').boundingBox()
  const alpy = await page.locator('.slozka-radek[data-slozka="Alpy"]').boundingBox()
  await page.mouse.move(radek.x + radek.width / 2, radek.y + radek.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(500)
  await page.mouse.move(alpy.x + alpy.width / 2, alpy.y + alpy.height / 2, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(500)
}
await kontrola('tažení přesunulo výpravu do druhé složky', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).vypravaSlozka), 'Alpy')
{
  const balkan = await page.locator('.slozka-radek[data-slozka="Balkán"]').boundingBox()
  const alpy = await page.locator('.slozka-radek[data-slozka="Alpy"]').boundingBox()
  await page.mouse.move(alpy.x + 60, alpy.y + alpy.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(500)
  await page.mouse.move(balkan.x + 60, balkan.y + balkan.height / 2, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(500)
}
await kontrola('tažení hlavičky přeskládá složky', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).slozky.join(',')), 'Alpy,Balkán')

// Duplikace z nabídky „…" v Itineráři; ťuknutí na kopii ji otevře.
await page.click('.slozka-obsah .vypravaradek')
await page.waitForTimeout(500)
await page.click('#planVice')
await page.waitForTimeout(300)
await page.click('#planDuplikuj')
await page.waitForTimeout(400)
await kontrola('kopie zdědila zastávky', () =>
  page.evaluate(() => {
    const v = JSON.parse(localStorage.getItem('vandrbuch:v1'))
    const kopie = v.vypravy.find((x) => x.nazev.includes('(kopie)'))
    return !!kopie && kopie.plan.length === 1
  }))
await page.click('#planZpet')
await page.waitForTimeout(400)
await kontrola('duplikace přidala kopii', () => page.locator('.vypravaradek').count(), 2)
await page.locator('.vypravaradek', { hasText: '(kopie)' }).click()
await page.waitForTimeout(500)
await kontrola('ťuknutí na kopii otevře její Itinerář', () =>
  page.locator('.planhlava h2').innerText().then((t) => t.includes('(kopie)')))
await kontrola('otevřená kopie je zároveň na mapě', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).vypravaNazev.includes('(kopie)')))
// Kopii zase smazat (z její nabídky) a vrátit se k původní.
await page.click('#planVice')
await page.waitForTimeout(300)
await page.click('#planSmaz')
await page.waitForTimeout(300)
await page.click('#dialogAno')
await page.waitForTimeout(500)
await page.locator('#planSegment button', { hasText: 'V plánu' }).first().click()
await page.waitForTimeout(400)
await kontrola('kopie je smazaná', () => page.locator('.vypravaradek').count(), 1)
await page.click('.slozka-obsah .vypravaradek')
await page.waitForTimeout(500)
await kontrola('ťuknutí na řádek ve složce otevře Itinerář', () => page.locator('.planhlava h2').count(), 1)

// Itinerář odpovídá na „jak to pojedeme", ne „kde jsme byli" – fajfka
// „byli jsme tady" odsud v srpnu 2026 odešla (zůstala na kartě Na cestě).
await kontrola('Itinerář neřeší, kde jsme byli', () => page.locator('.zastavka-hotovo').count(), 0)

// Hlavička dne se kreslí VŽDY, i u jednodenního plánu – bez ní není kam
// pustit zastávku ani kam přidat druhý den.
await kontrola('jednodenní plán má hlavičku dne', () => page.locator('.denhd').count(), 1)
await kontrola('hlavička dne nese číslo', () => page.locator('.denhd-cislo').first().innerText(), '1')

// Termín se vybírá z kalendáře, nepíše – z mřížky se neplatná hodnota
// vzít nedá. Dřív to byl `zadej()` s parserem „12.8.2026".
await page.click('#terminNastav')
await page.waitForTimeout(400)
await kontrola('termín otevře kalendář', () => page.locator('#dialog.show .kal-mriz').count(), 1)
await kontrola('kalendář má sedm sloupců zkratek', () => page.locator('#dialog .kal-tydny span').count(), 7)
await kontrola('kalendář zná dnešek', () => page.locator('#dialog .kal-den.dnes').count(), 1)
await page.click('#dialog .kal-den.dnes')
await page.waitForTimeout(200)
await page.click('#dialogAno')
await page.waitForTimeout(400)
await kontrola('po datu se ptá na počet dnů', () => page.locator('#dialog.show .pocet-stepper').count(), 1)
await page.click('#dialog .pocet-pill:nth-child(3)')
await page.waitForTimeout(200)
await kontrola('rychlá volba nastaví počet', () => page.locator('#dialog .pocet-stepper b').innerText(), '7')
await page.click('#dialog [data-krok="1"]')
await page.waitForTimeout(200)
await kontrola('stepper přidá den', () => page.locator('#dialog .pocet-stepper b').innerText(), '8')
await page.click('#dialogAno')
await page.waitForTimeout(600)
await kontrola('termín se zapsal', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).vypravaDnu), 8)
await kontrola('dny se srovnaly na termín', () => page.locator('.denhd').count(), 8)
await kontrola('prázdné dny nabízejí, čím je naplnit', () =>
  page.locator('.denvolno').count().then((n) => n >= 7))
await kontrola('hlavičky dnů mají datum z termínu', () =>
  page.locator('.denhd-datum').count().then((n) => n >= 8))
// Zkrácení zpátky – dřív šel počet dnů nastavit jen nahoru.
await page.click('#terminNastav')
await page.waitForTimeout(400)
await page.click('#dialogAno')
await page.waitForTimeout(300)
await page.click('#dialog [data-pocet="3"]')
await page.waitForTimeout(200)
await page.click('#dialogAno')
await page.waitForTimeout(600)
await kontrola('počet dnů jde i zkrátit', () => page.locator('.denhd').count(), 3)
await kontrola('zkrácením se zastávka neztratila', () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:v1')).plan.length), 1)

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

// Čísla výpravy bydlí dole v Itineráři; srovnání je nadstavba a nabízí se
// až od dvou výprav, což tady není – kontroluje se tedy základ.
await kontrola('čísla výpravy jsou v Itineráři', () => page.locator('.preh-skupina').count(), 4)
await kontrola('srovnání se nabízí až od dvou výprav', () => page.locator('#prehSrovnej').count(), 0)
// Bez zapnutého srovnání chodí do radek() null – dřív se vypisoval doslova.
await kontrola('v číslech výpravy není doslovné „null"', () =>
  page.evaluate(() => [...document.querySelectorAll('.preh-radek')].every((r) => !r.textContent.includes('null'))))

// Vlastní bloky: přidat seznam, položku, odškrtnout. „Vlastní místo“ tu od
// srpna 2026 není – bod trasy se zakládá přes „+ Přidat bod“ (dál v testu).
await kontrola('nabídka bloků má čtyři typy', () => page.locator('[data-blok-novy]').count(), 4)
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
// Uklidit SMAZÁNÍM PŘES UI, ne přepsáním localStorage: aplikace při odchodu
// ze stránky dopisuje store z paměti (pagehide → save()), přepsaný záznam
// by se hned vrátil zpátky.
await page.locator('.blok-smaz').first().click()
await page.waitForTimeout(300)
await page.click('#dialogAno')
await page.waitForTimeout(400)
await kontrola('blok uklizený', () => page.locator('.blok').count(), 0)

// Body trasy (start/nocleh/cíl/vlastní): průvodce druh → název → (den) →
// poloha. JEDNO tlačítko na celý itinerář (srpen 2026) – dřív mělo „+“
// každý den v hlavičce a další na svém konci, tedy dvacet plusek při deseti
// dnech. Den se ptá až průvodce; u start/cíl se otázka přeskakuje, protože
// ty mají pevné místo na krajích plánu.
await kontrola('pluska u dnů zmizela', () => page.locator('.pridatbod, [data-act="pridat-na-zacatek"]').count(), 0)
await kontrola('itinerář nabízí Přidat bod', () => page.locator('#planPridatBod').count(), 1)
await page.click('#planPridatBod')
await page.waitForTimeout(400)
await kontrola('průvodce nabízí čtyři druhy bodu', () => page.locator('#dialog .dialog-volba').count(), 4)
await page.click('.dialog-volba[data-i="0"]') // start
await page.waitForTimeout(400)
await page.click('#dialogAno') // ponechat výchozí název „Start“
await page.waitForTimeout(400)
// Start/cíl mají navíc Uloženou pozici a Aktuální polohu (srpen 2026) –
// u prostředních bodů (nocleh/vlastní) jich zůstávají čtyři.
await kontrola('krok polohy pro start nabízí šest cest', () => page.locator('#dialog .dialog-volba').count(), 6)
await page.click('.dialog-volba[data-i="0"]') // vložit odkaz/souřadnice
await page.waitForTimeout(400)
await page.locator('#dialogVstup').fill('50.0755, 14.4378')
await page.click('#dialogAno')
await page.waitForTimeout(500)
await kontrola('bod je v itineráři', () => page.locator('.zastavka.bod').count(), 1)
await kontrola('bod má špendlík na mapě podle druhu', () =>
  page.evaluate(() => document.querySelectorAll('.vlastnipin.start').length), 1)
await kontrola('bod má souřadnice ze vloženého textu', () =>
  page.evaluate(() => {
    const b = JSON.parse(localStorage.getItem('vandrbuch:v1')).bloky
    const bod = (b[Object.keys(b)[0]] || []).find((x) => x.typ === 'misto')
    return bod && Math.abs(bod.lat - 50.0755) < 1e-4 && Math.abs(bod.lon - 14.4378) < 1e-4
  }))
// Rozbalená karta bodu umí i přepnout druh a smazat se stejně jako blok.
await page.click('.zastavka.bod [data-act="bod-upravit"]')
await page.waitForTimeout(300)
await kontrola('karta bodu nabízí čtyři druhy', () => page.locator('.zastavka.bod .vyprava-slozky .slozka-pill').count(), 4)
await page.click('.blok-smaz')
await page.waitForTimeout(300)
await page.click('#dialogAno')
await page.waitForTimeout(400)
await kontrola('bod jde smazat', () => page.locator('.zastavka.bod').count(), 0)

// Aktuální cesta: vyjet → odznačit → ukončit → archiv. Bez GPS, jen
// odznačování; čas se počítá ze začátku a pauz, nikde se netiká.
await page.click('#planSegment button[data-seg="cesta"]')
await page.waitForTimeout(400)
await kontrola('bez cesty nabízí Vyjet', () => page.locator('#cestaVyjed').count(), 1)
await page.click('#cestaVyjed')
await page.waitForTimeout(500)
await kontrola('cesta se rozjela', () =>
  page.evaluate(() => !!JSON.parse(localStorage.getItem('vandrbuch:v1')).cesta))
// Karta Na cestě dostala v srpnu 2026 vlastní mini-mapu (tutéž jako
// Itinerář, jen z otisku cesty) a štítek, ze kterého je poznat, že appka
// JEDE – dřív to byl obyčejný nadpis, co se v pauze jen zešedil.
await kontrola('Na cestě má mini-mapu', () => page.locator('#cestaMapa').count(), 1)
// `innerText` vrací text po `text-transform: uppercase`, tedy „NA CESTĚ · 1. DEN“.
await kontrola('štítek říká, že jedeme a kolikátý je den', () =>
  page.locator('.cesta-stitek').innerText().then((t) => /^NA CESTĚ · \d+\. DEN$/i.test(t)))
// Otisk se od vyjetí dá měnit, takže si drží kopii toho, jak byl naplánovaný.
await kontrola('cesta si pamatuje původní trasu', () =>
  page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('vandrbuch:v1')).cesta
    return Array.isArray(c.puvodni) && c.puvodni.join() === c.zastavky.join()
  }))
await kontrola('zastávka jde odznačit', () => page.locator('.cesta-fajfka').count(), 1)
// Neodznačená zastávka jde vynechat – „dneska ne" není „už nikdy", takže
// se vrací do košíku. Po odznačení tlačítko mizí: co jsme projeli, se nemaže.
await kontrola('neodznačená zastávka jde vynechat', () => page.locator('[data-vynech]').count(), 1)
await page.click('.cesta-fajfka')
await page.waitForTimeout(500)
await kontrola('odznačení se zapsalo', () =>
  page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('vandrbuch:v1')).cesta.odznacene).length), 1)
await kontrola('odznačené je i navštívené', () =>
  page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('vandrbuch:v1')).stav).filter((x) => x === 'visited').length), 1)
await kontrola('projetá zastávka už nejde vynechat', () => page.locator('[data-vynech]').count(), 0)
// „Co dál?" se počítá od zvoleného bodu – od tebe (GPS), nebo od poslední
// ODŠKRTNUTÉ zastávky. Dřív to byla automatika s šedým popiskem, ze kterého
// nešlo poznat, že se to dá přepnout. Bez GPS je k dispozici jen jeden
// zdroj, takže tlačítko svítí zašedle a ukazuje tu odškrtnutou zastávku.
await kontrola('Co dál? má přepínač zdroje', () => page.locator('#coDalOdkud').count(), 1)
await kontrola('bez GPS se počítá od poslední odškrtnuté', () =>
  page.locator('#coDalOdkud span').innerText().then((t) => t.startsWith('od: ')))
await kontrola('jediný zdroj se nedá přepnout', () => page.locator('#coDalOdkud.nejde').count(), 1)
// S jedinou zastávkou v plánu (odznačenou) není „Další cíl“ ani co ukazovat
// jako zbývá – doplňky se ověřují samostatně v ruční kontrole vzhledu.
await kontrola('u hotové jednozastávkové cesty není Další cíl', () => page.locator('.cesta-dalsi').count(), 0)
// Achievementy: plánové se generují z obsahu plánu a pro každý jich musí
// být aspoň dvacet – i pro tenhle miniaturní jednozastávkový.
// Počítá se JEN v kartě Plánu: panely se nezahazují, jen schovávají, takže
// stránkové `.achv` by přičetlo i padesát profilových z dřív vykresleného
// Profilu – a kontrola by prošla, i kdyby generátor vracel jediný kus.
await kontrola('plánové achievementy: aspoň 20', () =>
  page.locator('#planWrap .achv').count().then((n) => n >= 20))
await kontrola('něco už je získané', () => page.locator('#planWrap .achv.ma').count().then((n) => n >= 1))

// Domů se za jízdy ptá jinak: „jak nám to jede", ne „co máme naplánované".
// Do srpna 2026 o rozjeté cestě nevědělo vůbec (`store.cesta` se v home.js
// nevyskytoval ani jednou) a ukazovalo plán otevřený v Itineráři.
await page.click('#tabs button[data-tab="home"]')
await page.waitForTimeout(600)
await kontrola('Domů ukazuje kartu rozjeté cesty', () => page.locator('.vkarta.jede').count(), 1)
await kontrola('a říká, že se jede', () => page.locator('.vk-stitek').innerText().then((t) => /NA CESTĚ/i.test(t)))
await kontrola('sekce se jmenuje podle toho', () =>
  page.locator('#homeInner .sekce').first().innerText().then((t) => /PRÁVĚ JEDEME/i.test(t)))
// Karta má vlastní pruh z `cesta.odznacene`; ten druhý ze `store.stav` by
// vedle něj hlásil jiná čísla, takže se za jízdy nekreslí.
await kontrola('pruh průběhu je jen jeden', () => page.locator('#homeInner .prubeh').count(), 1)
await page.click('.vkarta.jede')
await page.waitForTimeout(600)
await kontrola('ťuknutí vede na kartu Na cestě', () =>
  page.locator('#planSegment button.on').innerText().then((t) => t.startsWith('Na cestě')))

await page.click('#cestaKonec')
await page.waitForTimeout(300)
await page.click('#dialogAno')
await page.waitForTimeout(600)
await kontrola('rozjetá cesta zmizela ze store', () =>
  page.evaluate(() => !JSON.parse(localStorage.getItem('vandrbuch:v1')).cesta))
await kontrola('cesta skončila v archivu', () =>
  archivCest().then((c) => c.length === 1 && c[0].navstiveno === 1))
// Rozdělení na dny se do archivu do srpna 2026 vůbec nezapisovalo, takže
// každá ukončená cesta spadla na „jeden den".
await kontrola('archiv si nese rozdělení na dny', () =>
  archivCest().then((c) => Array.isArray(c[0].dny) && c[0].dny.length > 0))
await kontrola('profilový achievement za první cestu', () =>
  page.evaluate(() => !!JSON.parse(localStorage.getItem('vandrbuch:v1')).achievementy['prvni-cesta']))

// Ukončené cesty mají od srpna 2026 vlastní záložku „Za námi" – do teď to
// byla sekce dole v knihovně, kam se muselo doscrollovat přes všechny
// plánované výpravy. Ťuknutí cestu aktivuje na mapě jako výpravu,
// v Itineráři se pak ukáže zamčená s možností odemknout jen poznámky.
await page.click('#planSegment button[data-seg="archiv"]')
await page.waitForTimeout(400)
await kontrola('ukončená cesta je v Za námi po letech', () => page.locator('.archivradek').count(), 1)
// Jedno ťuknutí cestu rovnou otevře – vzpomínky se chodí prohlížet, ne
// aktivovat na mapě. (V knihovně Výprav ťuknutí naopak jen aktivuje, protože
// z výpravy se ještě pojede.)
await page.click('.archivradek')
await page.waitForTimeout(700)
await kontrola('Itinerář ukáže zamčenou cestu', () => page.locator('.cesta-zamek').count(), 1)
await kontrola('vyjet z ukončené cesty nejde', () => page.locator('#planVyjet').count(), 0)
await kontrola('fajfka zastávky je zamčená', () => page.locator('.cesta-zastavka.zamcena').count(), 1)
await page.click('#cestaOdemknout')
await page.waitForTimeout(400)
await kontrola('po odemčení jde upravit poznámku zastávky', () => page.locator('.cesta-zastavka .cesta-pozn').count(), 1)
await page.locator('.cesta-zastavka .cesta-pozn').fill('Bylo krásně')
await page.waitForTimeout(600)
await kontrola('poznámka zastávky ukončené cesty se uložila', () =>
  archivCest().then((c) => Object.values(c[0].poznamky || {}).includes('Bylo krásně')))
await page.locator('#cestaArchivPoznamka').fill('Skvělá výprava')
await page.waitForTimeout(600)
await kontrola('poznámka ukončené cesty se uložila', () =>
  archivCest().then((c) => c[0].poznamka), 'Skvělá výprava')
// Uklidit stav navštíveného místa po zkoušce cesty. Reload níž zahodí stav
// modulů, takže se musí vrátit i „první otevření Mapy" – karta výpravy po
// něm držela jen v paměti a kontroly na Mapě s prvním otevřením počítají.
await page.evaluate(() => {
  const v = JSON.parse(localStorage.getItem('vandrbuch:v1'))
  v.stav = {}
  v.achievementy = {}
  localStorage.setItem('vandrbuch:v1', JSON.stringify(v))
  const p = JSON.parse(localStorage.getItem('vandrbuch:prefs') || '{}')
  delete p.vypravaPredstavena
  localStorage.setItem('vandrbuch:prefs', JSON.stringify(p))
})
// Archiv už není ve `store` – vyprázdnit se musí ve vlastní databázi.
await page.evaluate(
  () =>
    new Promise((hotovo) => {
      const r = indexedDB.open('vandrbuch-cesty', 1)
      r.onsuccess = () => {
        const db = r.result
        if (!db.objectStoreNames.contains('cesty')) return hotovo(true)
        const tr = db.transaction('cesty', 'readwrite')
        tr.objectStore('cesty').clear()
        tr.oncomplete = () => hotovo(true)
        tr.onerror = () => hotovo(false)
      }
      r.onerror = () => hotovo(false)
    })
)
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
await page.click('.vyberbod-listka [data-act="hotovo"]')
await page.waitForTimeout(300)
// Předvyplněná hodnota „Výlet z mapy" se jen odklepne – jako dřív u promptu.
await page.click('#dialogAno')
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
await page.evaluate(() => document.getElementById('planSmaz').click())
await page.waitForTimeout(300)
await page.click('#dialogAno')
await page.waitForTimeout(500)

// uklidit po sobě, ať další kontroly počítají s prázdným plánem
await page.evaluate(() => document.getElementById('planVice').click())
await page.waitForTimeout(300)
await page.evaluate(() => document.getElementById('planClear').click())
await page.waitForTimeout(300)
await page.click('#dialogAno')
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
// filtrují „moje věci" (uložená, Musíme!, byli jsme), ne kategorie — kategorii
// už na mapě rozlišuje barva špendlíku, viz components/chip.js. „Na cestě"
// (mód mapy) bez aktivní cesty chybí, proto čtyři, ne pět.
await kontrola('nad mapou je pět rychlých pilulek', () => page.locator('#chips .pilulka').count(), 4)
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
await kontrola('dlaždice kolekcí', () => page.locator('#addBody [data-coll]').count(), 12)
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

/* ---------- reset aplikace (jen hostovaná varianta) ---------- */

// ÚPLNĚ NA KONCI SCHVÁLNĚ: reset odregistruje service worker a smaže jeho
// cache, takže by kontroly výš shodil.
//
// Tohle je ta část, která se nesmí odbýt. Tlačítko, které maže cache, musí
// mít doloženo, že NEMAŽE DATA. Kdo sem jednou připíše `localStorage.clear()`,
// zahodí jediné, co v téhle appce nejde ničím nahradit.
if (!SINGLE) {
  console.log('')
  console.log('  reset aplikace:')

  // Značka se píše do `vandrbuch:draft`, ne do `vandrbuch:v1`. Ten totiž
  // aplikace při odchodu ze stránky přepíše obsahem z paměti (pagehide →
  // save()), takže by značka zmizela i bez resetu a kontrola by lhala.
  // Přesně na tuhle past upozorňuje CLAUDE.md u úklidu ve smoke.
  await page.evaluate(() => {
    localStorage.setItem('vandrbuch:draft', JSON.stringify({ n: 'tohle nesmí reset smazat' }))
    // Značka v okně: po skutečném načtení znovu tam být nesmí. Bez ní by
    // kontrola prošla, i kdyby tlačítko neudělalo vůbec nic.
    window.__predResetem = true
  })

  await kontrola('před resetem cache existuje', () =>
    page.evaluate(() => caches.keys().then((k) => k.some((x) => x.startsWith('vandrbuch-')))), true)

  await page.click('#debugReset')
  await page.waitForTimeout(4000)

  // Online se reset nesmí odmítnout – dialog by znamenal, že se neprovedl.
  await kontrola('reset se online neodmítl', () => page.locator('#dialog.show').count(), 0)
  await kontrola('stránka se opravdu načetla znovu', () =>
    page.evaluate(() => !window.__predResetem), true)
  await kontrola('aplikace po resetu naběhla', () => page.locator('#totalN').innerText(), '580')

  // A teď to podstatné. Service worker se mezitím zaregistroval znovu a cache
  // si postavil taky – to je správně, appka má po resetu zase fungovat
  // offline. Kontroluje se proto, co zůstat MUSÍ, ne co zmizelo.
  await kontrola('DATA V localStorage RESET PŘEŽILA', () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:draft') || '{}').n),
    'tohle nesmí reset smazat')
  await kontrola('a předvolby taky', () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('vandrbuch:prefs')).debugRezim), true)
  await kontrola('poznámky v úložišti zůstaly', () =>
    page.evaluate(() => !!localStorage.getItem('vandrbuch:v1')), true)
  await kontrola('databáze s fotkami zůstala', () =>
    page.evaluate(() => indexedDB.databases().then((d) => d.some((x) => x.name === 'vandrbuch'))), true)

  await page.evaluate(() => localStorage.removeItem('vandrbuch:draft'))
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
  // s dlaždicí mapy. Napojení tlačítka se tím pádem neověřuje tady, ale
  // tím, že panel po kliknutí opravdu naskočí.
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

/* ---------- úklid ---------- */

// Vrátit rejstřík, který vyrobil build – kontrola si ho přepsala fixturou.
// Bez toho by `dist/` po smoke obsahoval cizí záznamy a příští běh
// `npm run preview` by je ukázal jako skutečné.
if (REJSTRIK_PUVODNI !== null) fs.writeFileSync(REJSTRIK_CESTA, REJSTRIK_PUVODNI)

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
