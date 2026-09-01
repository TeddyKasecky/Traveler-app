/**
 * Technický kontext, který si appka k debug záznamu přibalí sama.
 *
 * PROČ TO EXISTUJE: vůdčí princip poznámkovače je, že detail nedodává uživatel
 * psaním, ale appka sběrem. „Nefunguje mapa" napsané v autě je bez kontextu
 * k ničemu; s verzí buildu, stavem sítě, filtry a zaplněním úložiště už je
 * z toho hlášení, se kterým se dá pracovat.
 *
 * ZAPLNĚNÍ ÚLOŽIŠTĚ tu není náhodou – u téhle appky je to nejčastější příčina
 * tichých selhání (localStorage má strop ~5 MB a při jeho dosažení se zápis
 * neprovede). Proto se měří i po jednotlivých klíčích, ne jen celkem.
 *
 * CELÉ V `try/catch` A DOHROMADY. Sběr kontextu nesmí za žádnou cenu shodit
 * zápis poznámky – poznámka je to cenné, kontext je bonus.
 *
 * Nesahá na strukturu stránky, jen na běhové globály (`navigator`, `window`,
 * `caches`) a na `store.js`. Název obrazovky si nechává předat, protože
 * „je otevřený detail místa" pozná jen ten, kdo kreslí – a `core/` nesmí
 * vědět o `views/`.
 */

import { F, S, prefs, store } from './store.js'
import { zmerUloziste } from './storage.js'
import { jeMapaStazena } from './mapaDb.js'
import { posledniChyby } from './chyby.js'

/** Jak se která záložka jmenuje v hlášení. Musí sedět na `MODULY` v debug.js. */
const NAZVY_TABU = {
  home: 'Domů',
  map: 'Mapa',
  disc: 'Objevuj',
  list: 'Seznam',
  plan: 'Plán',
  profil: 'Profil',
  nastaveni: 'Nastavení',
  debug: 'Poznámkovač',
}

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`

/**
 * Aktivní filtry jako jedna čitelná věta. Vypisují se jen ty nevýchozí –
 * seznam dvanácti „false" by v exportu jen šuměl.
 *
 * `F.kat` je Set, takže se musí rozbalit; `JSON.stringify` by z něj udělal `{}`.
 *
 * EXPORTOVANÁ KVŮLI `check-debug.mjs`. Jediná druhá cesta k ní vede přes
 * `sberKontext()`, která je `async` a sahá na IndexedDB i na měření úložiště —
 * testovat ji tudy by znamenalo stubovat půlku prohlížeče. Stejný důvod, proč
 * je datová vrstva bloků oddělená od `bloky.js`.
 */
export function filtryNaText() {
  const kusy = []
  if (F.q) kusy.push(`hledání „${F.q}"`)
  if (F.kat.size) kusy.push(`kategorie ${[...F.kat].join('+')}`)
  // OBLAST, ZEMĚ A TYP JSOU OD SRPNA 2026 MNOŽINY (`tadeas-f32-014`) a musí se
  // rozbalit stejně jako kategorie. Množina je totiž VŽDYCKY pravdivá, takže
  // by se vypsala i prázdná – a `${Set}` dá „[object Set]". V kontextu každého
  // hlášení by pak stálo „země [object Set]" a nikdo by se nedozvěděl, podle
  // čeho se filtrovalo.
  for (const [k, popis] of [
    ['reg', 'oblast'],
    ['zeme', 'země'],
    ['typ', 'typ'],
  ]) {
    if (F[k].size) kusy.push(`${popis} ${[...F[k]].join('+')}`)
  }
  for (const [k, popis] of [
    ['coll', 'kolekce'],
    ['stav', 'stav'],
  ]) {
    if (F[k]) kusy.push(`${popis} ${F[k]}`)
  }
  for (const [k, popis] of [
    ['free', 'zdarma'],
    ['kids', 'pro děti'],
    ['dogs', 'se psem'],
    ['wow', 'nejlepší'],
    ['fire', 'musíme'],
    ['ulozene', 'uložené'],
  ]) {
    if (F[k]) kusy.push(popis)
  }
  return kusy.join(', ')
}

/** Co je zrovna vybrané – bez toho se u půlky hlášení neví, čeho se týkají. */
function vyberNaText() {
  const kusy = []
  // Id místa zůstává – je z veřejných dat `places.json`, takže o uživateli
  // nic neříká a při hledání chyby je to ta nejužitečnější informace.
  if (S.hiId) kusy.push(`místo ${S.hiId}`)
  // NÁZVY VÝPRAV A CEST SE NEPOSÍLAJÍ. Export jde do veřejného repozitáře
  // a rejstřík z něj se servíruje z webu komukoli – „Dovolená s Aničkou“
  // tam nemá co dělat. Diagnosticky stačí vědět, že výprava byla aktivní
  // a jak byla velká; jméno neřekne nic, co by pomohlo najít chybu.
  const vyprava = store.vypravaNazev || ''
  if (vyprava) {
    const zastavek = (store.vypravy || []).find((v) => v && v.nazev === vyprava)
    kusy.push(`výprava (${(zastavek && zastavek.zastavky ? zastavek.zastavky.length : store.plan.length) || 0} zastávek)`)
  }
  const kosik = (store.kosik && store.kosik[vyprava]) || []
  if (kosik.length) kusy.push(`v košíku ${kosik.length}`)
  if (store.cesta) kusy.push('jede se')
  return kusy.join(' · ')
}

/**
 * Prohlížeč a systém krátce.
 *
 * Celý `userAgent` je dvě stě znaků, ze kterých je v hlášení užitečné čtvrt
 * řádku. Když se z něj nic nepozná, vypíše se oříznutý originál – nepoznaný
 * prohlížeč je zrovna ten, u kterého na tom záleží.
 */
function zarizeniNaText() {
  const ua = navigator.userAgent || ''
  const prohlizec =
    /Edg\/([\d.]+)/.exec(ua) ||
    /Firefox\/([\d.]+)/.exec(ua) ||
    /CriOS\/([\d.]+)/.exec(ua) ||
    /Chrome\/([\d.]+)/.exec(ua) ||
    /Version\/([\d.]+).*Safari/.exec(ua)
  const jmeno = ua.includes('Edg/')
    ? 'Edge'
    : ua.includes('Firefox/')
      ? 'Firefox'
      : ua.includes('CriOS/')
        ? 'Chrome iOS'
        : ua.includes('Chrome/')
          ? 'Chrome'
          : ua.includes('Safari/')
            ? 'Safari'
            : ''
  const system = ['Android', 'iPhone', 'iPad', 'Windows', 'Macintosh', 'Linux'].find((s) => ua.includes(s)) || ''
  if (!jmeno && !system) return ua.slice(0, 160)
  return [jmeno && `${jmeno} ${prohlizec ? prohlizec[1].split('.')[0] : ''}`.trim(), system].filter(Boolean).join(' · ')
}

/**
 * Verze cache service workeru, `vandrbuch-<sha1>`.
 *
 * Čte se z `caches.keys()`, protože v aplikačním JS nikde není – `__VERSION__`
 * zná jen šablona workeru a doplňuje se až při buildu. V dev režimu
 * a v jednosouborové variantě žádný worker není a vrátí se prázdno.
 */
async function verzeCache() {
  try {
    if (!('caches' in window)) return ''
    return (await caches.keys()).find((k) => k.startsWith('vandrbuch-')) || ''
  } catch {
    return ''
  }
}

/**
 * Sebere celý kontext. Jednotlivé kusy padají samostatně, aby výpadek jednoho
 * (třeba zakázaná IndexedDB) nesebral i to ostatní.
 *
 * @param {{obrazovka?: string, chyby?: boolean}} [o]
 *        `obrazovka` přepíše název odvozený z `S.activeTab` (detail místa),
 *        `chyby` říká, jestli se má připnout buffer zachycených chyb.
 */
export async function sberKontext({ obrazovka = '', chyby = false } = {}) {
  const k = {
    cas: Date.now(),
    obrazovka: obrazovka || NAZVY_TABU[S.activeTab] || S.activeTab || '',
    build: import.meta.env.VANDRBUCH_VERZE || 'dev',
    online: navigator.onLine !== false,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    dpr: Math.round((window.devicePixelRatio || 1) * 10) / 10,
    podklad: prefs.podklad || '',
    offlineMapa: prefs.offlineMapa || '',
    mapaStazena: false,
    swCache: '',
    filtry: '',
    vyber: '',
    uloziste: '',
    zarizeni: '',
    chyby: chyby ? posledniChyby() : [],
  }

  try {
    k.filtry = filtryNaText()
  } catch {
    /* filtry se nepovedlo přečíst – kontext tím nekončí */
  }
  try {
    k.vyber = vyberNaText()
  } catch {
    /* stejně jako výš */
  }
  try {
    k.zarizeni = zarizeniNaText()
  } catch {
    /* prohlížeč se nepředstavil */
  }

  k.swCache = await verzeCache()

  try {
    const u = await zmerUloziste()
    const podleKlicu = Object.entries(u.klice)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([klic, n]) => `${klic} ${Math.round(n / 1024)} kB`)
      .join(' · ')
    const celkem = u.pouzito === null ? 'neznámé' : `${mb(u.pouzito)}${u.strop ? ` / ${mb(u.strop)}` : ''}`
    // I velké schránky. Bez nich je v hlášení vidět jen localStorage, tedy po
    // srpnu 2026 ta menší půlka – a hledalo by se stejně naslepo jako tenkrát,
    // kdy `vandrbuch:v1` nepozorovaně narostl na 4,3 MB.
    const s = u.sklady || {}
    const velke = [
      s.fotky ? `fotek ${s.fotky}` : '',
      s.cesty ? `cest ${s.cesty}` : '',
      s.trasy ? `tras ${s.trasy}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    k.uloziste = [podleKlicu ? `${celkem} (${podleKlicu})` : celkem, velke].filter(Boolean).join(' · idb: ')
  } catch {
    /* zakázané úložiště */
  }

  try {
    k.mapaStazena = await jeMapaStazena()
  } catch {
    /* IndexedDB nedostupná – stažená mapa se prostě nezapíše */
  }

  return k
}
