/**
 * Cloudflare Worker Vandrbuchu.
 *
 * PROČ JE V KOŘENI A NE V `src/`: `src/` bere Vite a zabalil by tenhle soubor
 * do aplikace. Sem naopak Vite nevidí a Wrangler si ho bere přímo
 * (`main` ve `wrangler.jsonc`).
 *
 * ZATÍM NEDĚLÁ NIC A JE TO ZÁMĚR. Do srpna 2026 Worker žádný kód neměl –
 * Cloudflare jen rozdávala hotové soubory z `dist/`. Přidání kódu mění, jak se
 * servíruje CELÁ aplikace, ne jen ta část, kvůli které vzniká; žádná místní
 * kontrola to nechytí, protože `smoke` si pouští vlastní statický server
 * a Worker nikdy nevidí. Ověřit to jde jedině na nasazené betě, a proto se
 * nejdřív nasazuje tahle prázdná verze: chová se do posledního bajtu stejně
 * jako dosavadní stav a dá se na ní ověřit, že se nasazením nic nerozbilo.
 *
 * Statické soubory se vyhodnocují DŘÍV než Worker (Workers Static Assets,
 * `run_worker_first` je ve výchozím stavu vypnuté), takže sem doputuje jen to,
 * co na žádný soubor nesedlo. A na to se dnes vrací 404, protože
 * `wrangler.jsonc` má `not_found_handling: "none"`.
 *
 * ÚNIKOVÝ VÝCHOD: smazat `main` ze `wrangler.jsonc` a nasadit. Tím je Worker
 * zase bez kódu a chování se vrací přesně tam, kde bylo.
 */

export default {
  async fetch() {
    return new Response(null, { status: 404 })
  },
}
