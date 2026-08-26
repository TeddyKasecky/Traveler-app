/**
 * Cloudflare Worker Vandrbuchu – přijímá debug poznámky a commitne je do `debug/`.
 *
 * PROČ JE V KOŘENI A NE V `src/`: `src/` bere Vite a zabalil by tenhle soubor
 * do aplikace. Sem naopak Vite nevidí a Wrangler si ho bere přímo
 * (`main` ve `wrangler.jsonc`).
 *
 * PROČ TO VŮBEC JE: poznámky se do teď dostávaly do repozitáře přes soubor –
 * stáhnout, přenést do počítače, uložit do složky, commitnout. Čtyři ruční
 * kroky u něčeho, co má trvat deset vteřin. Token na zápis do repozitáře leží
 * jako **secret v Cloudflare**, takže se do balíčku aplikace nikdy nedostane
 * a z veřejného repozitáře ho nejde vytáhnout.
 *
 * TENHLE SOUBOR MĚNÍ, JAK SE SERVÍRUJE CELÁ APLIKACE, ne jen poznámkovač.
 * Statické soubory se sice vyhodnocují DŘÍV než Worker (Workers Static Assets,
 * `run_worker_first` je ve výchozím stavu vypnuté), takže sem doputuje jen to,
 * co na žádný soubor nesedlo – ale i tak platí:
 *
 *   1. obsluhuje se **jediná kombinace metody a cesty**, `POST /api/debug`,
 *   2. cokoli jiného dostane 404, přesně jako dřív `not_found_handling: "none"`,
 *   3. celá obsluha je v `try/catch`, takže ani chyba v kódu nedosáhne dál než
 *      na tuhle jednu adresu.
 *
 * A co se tu NIKDY nedělá: nepřepisuje se existující soubor, nic se nemaže,
 * nesahá se mimo `debug/`, nesahá se na jinou větev než `main` a cesta se
 * nikdy nebere od klienta – skládá se tady z ověřeného jména.
 *
 * ÚNIKOVÝ VÝCHOD: smazat `main` ze `wrangler.jsonc` a nasadit. Tím je Worker
 * zase bez kódu a chování se vrací přesně tam, kde bylo.
 *
 * Ověřovací funkce jsou čisté a exportované, aby šly testovat v čistém Node
 * bez Cloudflare (`scripts/check-worker.mjs`).
 */

/** Repozitář natvrdo. Kdyby přišel od klienta, dal by se zápis přesměrovat. */
export const REPO = 'TeddyKasecky/Traveler-app'

/** Větev natvrdo, ze stejného důvodu. */
export const VETEV = 'main'

/** Složka natvrdo. Nikam jinam se nezapisuje. */
export const SLOZKA = 'debug'

/** Strop těla požadavku. Největší dosavadní export měl jednotky kilobajtů. */
export const STROP_BAJTU = 256 * 1024

/** Kolik pořadových čísel se zkusí, když jméno kolidoval. */
export const MAX_KOLIZI = 9

/** Hlavička, kterou musí mít každý platný export – jinak to není náš soubor. */
export const HLAVICKA = '# Vandrbuch — Debug export'

/**
 * Jméno souboru, jak ho vyrábí `nazevExportu()` v `src/core/debugExport.js`.
 *
 * Přísné schválně: tohle je jediná věc, kterou klient ovlivňuje a která se
 * dostane do cesty na disku. Tečka, lomítko ani `..` se sem nevejdou.
 */
export const VZOR_JMENA = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9][a-z0-9-]{0,30}\.md$/

/** @param {unknown} nazev */
export const jmenoSedi = (nazev) => typeof nazev === 'string' && VZOR_JMENA.test(nazev)

/**
 * Je to opravdu export z poznámkovače?
 *
 * Musí mít naši hlavičku a aspoň jeden záznam. Bez druhé podmínky by prošel
 * prázdný soubor, který by ve složce jen překážel.
 *
 * @param {unknown} text
 */
export const textSedi = (text) =>
  typeof text === 'string' && text.startsWith(HLAVICKA) && /\n## \S+ · /.test(text)

/**
 * Jméno pro druhý a další pokus, když to původní ve složce už je – dva exporty
 * ve stejné minutě dostanou od `nazevExportu()` shodné jméno.
 *
 * POSOUVÁ SE ČAS O MINUTU, NEPŘIDÁVÁ SE PŘÍPONA. Nabízelo se `-2` před `.md`,
 * jenže `-` je v abecedě PŘED `.`, takže by `tadeas-2.md` skončilo před
 * `tadeas.md`. A pořadí názvů je to, podle čeho `postavRejstrik()` i úklid
 * poznají, který záznam platí – novější soubor by tedy prohrál se starším.
 * Posunutá minuta se řadí správně, drží tvar `VZOR_JMENA` a je i pravdivější:
 * je to export, který by o minutu později vznikl sám.
 *
 * @param {string} nazev  `RRRR-MM-DD-HHMM-autor.md`
 * @param {number} poradi  2 pro první kolizi
 */
export function sPoradim(nazev, poradi) {
  const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})-(.+)$/.exec(nazev)
  if (!m) return nazev
  const [, rok, mesic, den, hodina, minuta, zbytek] = m
  const kdy = new Date(Date.UTC(+rok, +mesic - 1, +den, +hodina, +minuta) + (poradi - 1) * 60000)
  const dva = (n) => String(n).padStart(2, '0')
  const datum = `${kdy.getUTCFullYear()}-${dva(kdy.getUTCMonth() + 1)}-${dva(kdy.getUTCDate())}`
  return `${datum}-${dva(kdy.getUTCHours())}${dva(kdy.getUTCMinutes())}-${zbytek}`
}

/**
 * Porovnání hesla bez závislosti na tom, kde se řetězce rozejdou.
 * @param {string} a
 * @param {string} b
 */
export function shodneHeslo(a, b) {
  const x = String(a || '')
  const y = String(b || '')
  if (x.length !== y.length) return false
  let rozdil = 0
  for (let i = 0; i < x.length; i++) rozdil |= x.charCodeAt(i) ^ y.charCodeAt(i)
  return rozdil === 0
}

/**
 * UTF-8 text na base64 pro GitHub API.
 *
 * Po kouscích, ne přes rozprostření celého pole do `String.fromCharCode` –
 * u čtvrt megabajtu by to přeteklo zásobník.
 *
 * @param {string} text
 */
export function naBase64(text) {
  const bajty = new TextEncoder().encode(text)
  let s = ''
  for (let i = 0; i < bajty.length; i += 8192) {
    s += String.fromCharCode(...bajty.subarray(i, i + 8192))
  }
  return btoa(s)
}

/** Krátká odpověď ve tvaru, který aplikace čeká. */
const odpoved = (stav, telo) =>
  new Response(JSON.stringify(telo), {
    status: stav,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

/** Společné hlavičky pro GitHub. `User-Agent` API vyžaduje. */
const hlavickyGitHubu = (token) => ({
  authorization: `Bearer ${token}`,
  accept: 'application/vnd.github+json',
  'user-agent': 'vandrbuch-worker',
  'x-github-api-version': '2022-11-28',
})

/**
 * Existuje už soubor ve složce?
 *
 * Vrací `null`, když se to nedá zjistit – volající pak nesmí zapisovat, jinak
 * by mohl přepsat cizí soubor.
 *
 * @returns {Promise<boolean|null>}
 */
async function existuje(nazev, token) {
  const r = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${SLOZKA}/${encodeURIComponent(nazev)}?ref=${VETEV}`,
    { headers: hlavickyGitHubu(token) }
  )
  if (r.status === 404) return false
  if (r.ok) return true
  return null
}

/**
 * Zapíše soubor. **Bez `sha`**, takže GitHub odmítne přepis existujícího –
 * je to druhá pojistka k `existuje()` výš, pro případ, že mezi dotazem
 * a zápisem někdo stihl soubor založit.
 */
async function zapis(nazev, text, token) {
  return fetch(`https://api.github.com/repos/${REPO}/contents/${SLOZKA}/${encodeURIComponent(nazev)}`, {
    method: 'PUT',
    headers: { ...hlavickyGitHubu(token), 'content-type': 'application/json' },
    body: JSON.stringify({
      message: `debug: ${nazev}`,
      content: naBase64(text),
      branch: VETEV,
    }),
  })
}

/** Vlastní obsluha odesílání. Volá se jen pro `POST /api/debug`. */
async function prijmiPoznamky(request, env) {
  // 1. Bez nastavených secretů je endpoint mrtvý. Přesně tím je neškodný na
  //    produkci, kde se secret schválně nenastaví.
  if (!env.GITHUB_TOKEN || !env.DEBUG_HESLO) {
    return odpoved(503, { chyba: 'Odesílání není na tomhle prostředí nastavené.' })
  }

  // 2. Velikost napřed z hlavičky, ať se obří tělo vůbec nečte.
  const ohlasenaDelka = Number(request.headers.get('content-length') || 0)
  if (ohlasenaDelka > STROP_BAJTU) return odpoved(413, { chyba: 'Export je moc velký.' })

  let data
  try {
    data = await request.json()
  } catch {
    return odpoved(400, { chyba: 'Tělo požadavku není platný JSON.' })
  }

  const { nazev, text, heslo } = data || {}

  // 3. Heslo. Není v balíčku aplikace – zadává se jednou v Nastavení – takže
  //    se z veřejného repozitáře nedá vyčíst.
  //
  //    JDE V TĚLE, NE V HLAVIČCE. Hodnota HTTP hlavičky smí obsahovat jen znaky
  //    do 0xFF, takže heslo s diakritikou (`heslíčko`) shodí `fetch` ještě
  //    v prohlížeči – požadavek vůbec neodejde a aplikace hlásí „server
  //    neodpověděl“ u serveru, který nikdo neoslovil. V JSON těle projde
  //    cokoli. Kvůli tomu se tělo parsuje dřív, než se ověří heslo; strop
  //    velikosti výš zajišťuje, že se ani neověřenému požadavku nečte víc,
  //    než je únosné.
  if (!shodneHeslo(heslo, env.DEBUG_HESLO)) {
    return odpoved(401, { chyba: 'Heslo pro odesílání nesedí.' })
  }

  if (!jmenoSedi(nazev)) return odpoved(400, { chyba: 'Název souboru nesedí na očekávaný tvar.' })
  if (!textSedi(text)) return odpoved(400, { chyba: 'Obsah není export z poznámkovače.' })
  if (new TextEncoder().encode(text).length > STROP_BAJTU) {
    return odpoved(413, { chyba: 'Export je moc velký.' })
  }

  // 4. Volné jméno. Dva exporty ve stejné minutě dostanou shodné jméno, takže
  //    se přidá pořadové číslo – nikdy se nic nepřepíše.
  for (let i = 0; i <= MAX_KOLIZI; i++) {
    const jmeno = i === 0 ? nazev : sPoradim(nazev, i + 1)
    const je = await existuje(jmeno, env.GITHUB_TOKEN)
    if (je === null) return odpoved(502, { chyba: 'GitHub neodpověděl, jestli soubor existuje.' })
    if (je) continue

    const r = await zapis(jmeno, text, env.GITHUB_TOKEN)
    if (r.ok) return odpoved(200, { ok: true, nazev: jmeno })
    // 422 znamená, že soubor mezitím vznikl – zkusí se další pořadí.
    if (r.status === 422) continue
    return odpoved(502, { chyba: `GitHub odmítl zápis (${r.status}).` })
  }

  return odpoved(409, { chyba: 'Soubor s tímhle názvem už existuje. Zkus to za minutu.' })
}

export default {
  async fetch(request, env) {
    const cesta = new URL(request.url).pathname

    // JEDINÁ OBSLUHOVANÁ KOMBINACE. Všechno ostatní dostane 404 – tedy přesně
    // to, co vracelo `not_found_handling: "none"`, než Worker dostal kód.
    if (cesta !== '/api/debug' || request.method !== 'POST') {
      return new Response(null, { status: 404 })
    }

    try {
      return await prijmiPoznamky(request, env)
    } catch (e) {
      // Chyba v kódu nesmí sáhnout dál než na tuhle jednu adresu.
      return odpoved(500, { chyba: `Odesílání spadlo: ${e && e.message ? e.message : 'neznámá chyba'}` })
    }
  },
}
