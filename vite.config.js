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
      // Filtruje se ze tří důvodů, každý z nich by shodil celé offline:
      //   - složky: `cache.addAll` na složce selže a s ním instalace workeru,
      //   - tečkové soubory: nejsou k ničemu,
      //   - podtržítko: `_headers` a `_redirects` si hostingy berou jako svoji
      //     konfiguraci a z nasazeného webu je mažou, takže by vrátily 404.
      const publicDir = path.join(ROOT, 'public')
      const zPublic = fs
        .readdirSync(publicDir, { withFileTypes: true })
        .filter((d) => d.isFile() && !d.name.startsWith('.') && !d.name.startsWith('_'))
        .map((d) => `./${d.name}`)

      // Seřazeno schválně. `Object.keys(bundle)` nevrací pokaždé stejné pořadí –
      // stačilo, aby si dva fonty prohodily místo, a verze cache vyšla jiná, i když
      // se v aplikaci nezměnil jediný bajt. Telefon si pak celou aplikaci stáhl
      // znovu pro nic za nic. Řazení dělá verzi závislou na obsahu, ne na náhodě.
      const seznam = ['./', ...Object.keys(bundle).map((f) => `./${f}`), ...zPublic].sort()
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

export default defineConfig(({ mode }) => {
  const single = mode === 'single'

  return {
    // Relativní cesty jsou nutné pro obě varianty: hosting v podadresáři i file://
    base: './',

    plugins: single ? [viteSingleFile(), pluginSingleFilePwa()] : [pluginServiceWorker()],

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
