import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
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
 * `main` (kontinuálně) místo `production` (jen na ruční nasazení).
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
      // DOČASNÁ DIAGNOSTIKA – uvidíme v Cloudflare build logu, co appka vidí.
      console.log('[vandrbuch-beta-manifest] VANDRBUCH_BETA =', JSON.stringify(process.env.VANDRBUCH_BETA))
      console.log('[vandrbuch-beta-manifest] klíče obsahující BETA:',
        Object.keys(process.env).filter((k) => k.includes('BETA')))
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
      : [pluginServiceWorker(), pluginBetaManifest('dist')],

    define: {
      'import.meta.env.SINGLE_FILE': JSON.stringify(single),
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
