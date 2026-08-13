import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * Dva build targety z jednoho zdroje:
 *
 *   npm run build         → dist/         statický web, plnohodnotná PWA se service workerem
 *   npm run build:single  → dist-single/  jeden self-contained index.html pro offline z disku
 *
 * Rozdíl je jen v tom, co se inlinuje. Zdrojový kód je stejný; kód se na variantu
 * ptá přes import.meta.env.SINGLE_FILE (viz define níže).
 */
export default defineConfig(({ mode }) => {
  const single = mode === 'single'

  return {
    // Relativní cesty jsou nutné pro obě varianty: hosting v podadresáři i otevření z file://
    base: './',

    plugins: single ? [viteSingleFile()] : [],

    define: {
      // Kód podle tohoto pozná, jestli běží v single-file variantě
      // (přeskočí registraci service workeru, který na file:// stejně nejde).
      'import.meta.env.SINGLE_FILE': JSON.stringify(single),
    },

    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      // V single-file variantě se musí do data URI vejít i ilustrace dodávky (~30 kB)
      // a fonty (~254 kB). V hostované variantě zůstává výchozí chování Vite.
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
