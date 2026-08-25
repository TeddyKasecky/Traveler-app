import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * Dva build targety z jednoho zdroje:
 *
 *   npm run build         → dist/         hostovaný web, plnohodnotná PWA se service workerem
 *   npm run build:single  → dist-single/  jeden self-contained index.html pro offline z disku
 *
 * Rozdíl je jen v tom, co se inlinuje a jestli vzniká service worker.
 * Zdrojový kód je stejný; ptá se na variantu přes import.meta.env.SINGLE_FILE.
 */

// fileURLToPath, ne ruční ořezávání – cesta obsahuje diakritiku („Anička“)
// a v URL je zakódovaná jako %C4%8D.
const ROOT = path.dirname(fileURLToPath(import.meta.url))

/**
 * Označení sestavení, `2026.08.24-a3f9`.
 *
 * PROČ NE VERZE CACHE SERVICE WORKERU: ta vzniká až v `generateBundle`, tedy
 * dlouho po vyhodnocení `define` – předat ji do aplikačního JS nejde. A hlavně
 * je to otisk seznamu souborů, ne bod v historii: z „vandrbuch-e307e823b0"
 * se nedá dohledat commit, ze kterého hlášení přišlo.
 *
 * Do aplikace to potřebuje debug poznámkovač (`core/debugKontext.js`) – bez
 * verze se u hlášení neví, jestli je z verze, kde je chyba už opravená.
 *
 * `git` v `try/catch`: build na Cloudflare i rozbalený ZIP bez historie musí
 * projít. Bez gitu zůstane samotné datum, což je pořád lepší než nic.
 */
function verzeBuildu() {
  const d = new Date()
  const datum = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  try {
    const hash = execSync('git rev-parse --short=4 HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    return hash ? `${datum}-${hash}` : datum
  } catch {
    return datum
  }
}

/**
 * Vygeneruje dist/sw.js ze šablony src/pwa/sw.js.
 *
 * Seznam souborů k uložení do cache se skládá až tady, protože jména obsahují
 * otisk obsahu a předem je nikdo nezná. Verze cache je odvozená z toho seznamu:
 * když se nic nezmění, service worker zůstane stejný a prohlížeč ho nepřeinstaluje.
 */
function pluginServiceWorker() {
  return {
    name: 'vandrbuch-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      // Soubory z public/ v bundle nejsou, Vite je jen kopíruje – doplnit ručně.
      //
      // Filtruje se ze čtyř důvodů, každý z nich by něco shodil:
      //   - složky: `cache.addAll` na složce selže a s ním instalace workeru,
      //   - tečkové soubory: nejsou k ničemu,
      //   - podtržítko: `_headers` a `_redirects` si hostingy berou jako svoji
      //     konfiguraci a z nasazeného webu je mažou, takže by vrátily 404,
      //   - `.vbm`: stažená mapa Evropy má několik megabajtů a stahuje se **na
      //     vyžádání** z Nastavení do IndexedDB. Kdyby byla v předukládaném
      //     seznamu, stáhla by se každému hned při instalaci – přesně to,
      //     čemu se vyhýbáme.
      const publicDir = path.join(ROOT, 'public')
      const zPublic = fs
        .readdirSync(publicDir, { withFileTypes: true })
        .filter(
          (d) => d.isFile() && !d.name.startsWith('.') && !d.name.startsWith('_') && !d.name.endsWith('.vbm')
        )
        .map((d) => `./${d.name}`)

      // Ze stejného důvodu vypadává **všechno kolem stažené malované mapy**:
      // MapLibre i s jeho workerem, čtečka balíku, souřadnice kreseb a sto
      // dvacet obrázků. Dohromady přes čtyři megabajty, které jsou k ničemu
      // každému, kdo si mapu nestáhne – a to je většina lidí.
      //
      // Neztratí se: service worker od srpna 2026 **ukládá i to, co si
      // aplikace vyžádá až za běhu** (`src/pwa/sw.js`), takže se kresby
      // uloží při prvním zapnutí vektorové mapy. Stahovat mapu se stejně
      // musí online, takže se to vždycky stihne dřív než signál dojde.
      //
      // Pozná se to podle jména souboru. Je to křehčí než příznak v kódu, ale
      // Vite jména odvozuje od zdrojů, takže je to jediné, co v `generateBundle`
      // je. Hlídá to `smoke` – jinak by přejmenování chunku tiše vrátilo
      // čtyři megabajty do instalace.
      // `auta-` sem patří taky: ikon je 64 a člověk používá jednu – stáhne se
      // při otevření výběru v Profilu a service worker si ji uloží za běhu.
      const JEN_SE_STAZENOU_MAPOU = /^assets\/(kresba|kresby-|vektory|vbm|maplibre-|auta-)/
      const zBundle = Object.keys(bundle).filter((f) => !JEN_SE_STAZENOU_MAPOU.test(f))

      // Seřazeno schválně. `Object.keys(bundle)` nevrací pokaždé stejné pořadí –
      // stačilo, aby si dva fonty prohodily místo, a verze cache vyšla jiná, i když
      // se v aplikaci nezměnil jediný bajt. Telefon si pak celou aplikaci stáhl
      // znovu pro nic za nic. Řazení dělá verzi závislou na obsahu, ne na náhodě.
      const seznam = ['./', ...zBundle.map((f) => `./${f}`), ...zPublic].sort()

      const vazi = zBundle.reduce((a, f) => a + (bundle[f].code || bundle[f].source || '').length, 0)
      this.warn(
        `předukládá se ${seznam.length} souborů, ~${(vazi / 1048576).toFixed(1)} MB ` +
          `(vynecháno ${Object.keys(bundle).length - zBundle.length} kolem stažené mapy)`
      )
      const verze = `vandrbuch-${crypto.createHash('sha1').update(seznam.join('|')).digest('hex').slice(0, 10)}`

      const sablona = fs.readFileSync(path.join(ROOT, 'src', 'pwa', 'sw.js'), 'utf8')
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: sablona.replace('__VERSION__', verze).replace('__PRECACHE__', JSON.stringify(seznam, null, 2)),
      })
    },
  }
}

/**
 * Přibalí rejstřík složky `debug/` jako `dist/debug-stav.json`.
 *
 * PROČ TO JDE BEZ BACKENDU: appka se nasazuje z téhož repozitáře, do kterého
 * se commitují exporty debug poznámek. Build si tedy složku přečte a autor
 * pak v appce vidí, že jeho hlášení někdo řeší nebo vyřešil – a vidí i záznamy
 * toho druhého, takže se totéž nehlásí dvakrát. Na betě se to obnoví každým
 * pushem na `main`, na produkci s vydáním.
 *
 * PROČ VLASTNÍ SOUBOR, A NE ZAPEČENÉ DO JS: rejstřík se mění při každém debug
 * commitu. Zapečený by měnil otisk hlavního chunku a telefony by stahovaly
 * celou aplikaci znovu – přesně to, co se v srpnu 2026 opravovalo.
 *
 * `buildStart`, ne `generateBundle`: `pluginServiceWorker` skládá seznam
 * k předuložení až v `generateBundle`, takže se sem soubor musí dostat dřív,
 * aby ho pobral a rejstřík fungoval i offline.
 *
 * Do jednosouborové varianty se nezapojuje (jako MapLibre a reliéf) – appka
 * z disku fetch neuspěje a oddíl se prostě neukáže.
 */
function pluginDebugRejstrik() {
  return {
    name: 'vandrbuch-debug-rejstrik',
    async buildStart() {
      const { postavRejstrik } = await import('./scripts/debug-rejstrik.mjs')
      const rejstrik = postavRejstrik(path.join(ROOT, 'debug'))
      this.emitFile({ type: 'asset', fileName: 'debug-stav.json', source: JSON.stringify(rejstrik) })
    },
    // V `npm run dev` se nic neemituje, takže se soubor musí naservírovat
    // ručně – jinak by se stav z repozitáře dal vyzkoušet až po buildu.
    configureServer(server) {
      server.middlewares.use('/debug-stav.json', async (_req, res) => {
        const { postavRejstrik } = await import('./scripts/debug-rejstrik.mjs')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(postavRejstrik(path.join(ROOT, 'debug'))))
      })
    },
  }
}

/**
 * V single-file variantě nahradí odkazy na manifest a ikonu za data URI.
 *
 * Soubor otevřený z disku nemá vedle sebe public/, takže by se ikona ani
 * manifest nenačetly a v konzoli by svítily dvě chyby. Ikony se vkládají
 * i dovnitř manifestu, jinak by odkazovaly na neexistující soubory.
 */
function pluginSingleFilePwa() {
  return {
    name: 'vandrbuch-single-pwa',
    apply: 'build',
    transformIndexHtml(html) {
      const pub = (f) => fs.readFileSync(path.join(ROOT, 'public', f))
      const ikona192 = `data:image/png;base64,${pub('icon-192.png').toString('base64')}`
      const ikona512 = `data:image/png;base64,${pub('icon-512.png').toString('base64')}`

      const manifest = JSON.parse(pub('manifest.webmanifest').toString('utf8'))
      manifest.icons = [
        { src: ikona192, sizes: '192x192', type: 'image/png' },
        { src: ikona512, sizes: '512x512', type: 'image/png' },
      ]
      const manifestUri = `data:application/manifest+json;base64,${Buffer.from(JSON.stringify(manifest)).toString('base64')}`

      return html
        .replace('href="./manifest.webmanifest"', `href="${manifestUri}"`)
        .replace(/href="\.\/icon-192\.png"/g, `href="${ikona192}"`)
    },
  }
}

/**
 * Na Cloudflare projektu `traveler-app-beta` appka na ploše (PWA `short_name`)
 * ukazuje „Vandrbuch beta“ místo „Vandrbuch“, ať jde na telefonu poznat, které
 * PWA je která – appka je jinak bajtově stejná jako produkce, jen se sleduje
 * `main` (kontinuálně) místo `production` (jen na ruční nasazení). Stejná
 * proměnná (`VANDRBUCH_BETA`, nastavená jako Build variable v Cloudflare)
 * zapíná i červený štítek „BETA“ v hlavičce – viz `import.meta.env.VANDRBUCH_BETA`
 * v `define` níž a `main.js`.
 *
 * `writeBundle` běží až po zápisu do `dist/`, protože Vite `public/*` jen
 * kopíruje beze zpracování – úprava manifestu tedy musí přijít jako
 * post-processing krok, ne transformace zdroje.
 */
function pluginBetaManifest(outDir) {
  return {
    name: 'vandrbuch-beta-manifest',
    apply: 'build',
    writeBundle() {
      if (!process.env.VANDRBUCH_BETA) return
      const cesta = path.join(ROOT, outDir, 'manifest.webmanifest')
      const manifest = JSON.parse(fs.readFileSync(cesta, 'utf8'))
      manifest.short_name = 'Vandrbuch beta'
      fs.writeFileSync(cesta, JSON.stringify(manifest, null, 2))
    },
  }
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single'

  return {
    // Relativní cesty jsou nutné pro obě varianty: hosting v podadresáři i file://
    base: './',

    plugins: single
      ? [viteSingleFile(), pluginSingleFilePwa()]
      : // Rejstřík PŘED service workerem: ten skládá seznam k předuložení
        // z bundle a musí v něm `debug-stav.json` už najít.
        [pluginDebugRejstrik(), pluginServiceWorker(), pluginBetaManifest('dist')],

    define: {
      'import.meta.env.SINGLE_FILE': JSON.stringify(single),
      // Zapečeno při buildu jako statická hodnota (ne runtime process.env,
      // který v prohlížeči neexistuje) – stejný vzor jako SINGLE_FILE výš.
      // Single-file appka nemá prostředí, ke kterému by se vztahovala, proto
      // `false` bez ohledu na proměnnou.
      'import.meta.env.VANDRBUCH_BETA': JSON.stringify(!single && !!process.env.VANDRBUCH_BETA),
      // Označení sestavení do kontextu debug hlášení (`core/debugKontext.js`).
      // Platí i pro `npm run dev` – vyhodnotí se při startu dev serveru, takže
      // hlášení z vývoje nese datum a commit, na kterém se zrovna pracuje.
      'import.meta.env.VANDRBUCH_VERZE': JSON.stringify(verzeBuildu()),
    },

    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      // V single-file variantě se musí do data URI vejít i ilustrace dodávky
      // (22 kB) a fonty (254 kB). V hostované zůstává výchozí chování Vite.
      assetsInlineLimit: single ? 100 * 1024 * 1024 : 4096,
      cssCodeSplit: !single,
      // Data míst jsou velká; varování u 500 kB by tu jen šumělo.
      chunkSizeWarningLimit: 1200,
      target: 'es2020',
    },

    server: {
      host: true, // ať jde dev server otevřít i z mobilu na stejné síti
    },
  }
})
