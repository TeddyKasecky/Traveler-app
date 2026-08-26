/**
 * Kruhový buffer posledních zachycených chyb.
 *
 * PROČ TO VZNIKLO: chyba, kterou appka umí nahlásit až po ručním zapnutí debug
 * režimu, je chyba, která už jednou utekla. Sbírá se proto POŘÁD – od prvního
 * příkazu v `main.js`, nezávisle na `prefs.debugRezim`. Ten přepínač řídí jen
 * viditelnost tlačítka v hlavičce, nikdy sběr dat.
 *
 * JEN V PAMĚTI, nikam se to neukládá. K něčemu je to ve chvíli, kdy člověk
 * píše poznámku k chybě, která právě proběhla; trvalý zápis by navíc při plné
 * paměti dusil poznámky z cest, což je přesně to, čemu se v téhle appce
 * vyhýbáme. Do trvalých dat se buffer dostane teprve tím, že si ho někdo
 * vědomě připne ke konkrétnímu záznamu (`views/debug`).
 *
 * Věší se přes `window.onerror` a `window.onunhandledrejection`, ne přes
 * `addEventListener` — drží to konvenci repa (`prvek.onclick = …`).
 */

/** Kolik chyb se drží. Víc už nikdo nepřečte a jen by to nafouklo export. */
export const STROP = 20

/** @type {{cas: number, druh: string, zprava: string, zdroj: string}[]} */
const buffer = []

let zapnuto = false

/**
 * Zapíše jednu chybu do bufferu. Nejstarší vypadne, když je plno.
 *
 * Oddělené od navěšení schválně – takhle jde buffer otestovat v čistém Node
 * (`scripts/check-debug.mjs`), kde žádné `window` není.
 *
 * @param {string} druh   'chyba' | 'promise'
 * @param {unknown} zprava
 * @param {string} [zdroj]  soubor:řádek, nebo prázdné
 */
export function zapisChybu(druh, zprava, zdroj = '') {
  buffer.push({
    cas: Date.now(),
    druh,
    // Zprávy z minifikovaného kódu bývají dlouhé a v exportu by přebily
    // vlastní text záznamu.
    zprava: String(zprava ?? '').slice(0, 300),
    zdroj: String(zdroj || '').slice(0, 160),
  })
  if (buffer.length > STROP) buffer.shift()
}

/**
 * Navěsí zachytávání. Idempotentní – druhé volání nic nedělá.
 * V prostředí bez `window` (kontrolní skripty) se tiše přeskočí.
 */
export function zapniSberChyb() {
  if (zapnuto || typeof window === 'undefined') return
  zapnuto = true

  window.onerror = (zprava, soubor, radek, sloupec) => {
    zapisChybu('chyba', zprava, soubor ? `${soubor}:${radek}:${sloupec}` : '')
    // Nevracíme true: prohlížeč má chybu pořád vypsat do konzole. Spolknutá
    // chyba by při vývoji chyběla tam, kde se hledá první.
    return false
  }

  window.onunhandledrejection = (e) => {
    const d = e && e.reason
    zapisChybu('promise', (d && d.message) || d, (d && d.stack ? String(d.stack).split('\n')[1] : '') || '')
  }
}

/** Kopie bufferu, nejstarší první. Kopie proto, aby si ji volající mohl uložit. */
export const posledniChyby = () => buffer.map((c) => ({ ...c }))

/** Kolik chyb se zrovna drží. */
export const pocetChyb = () => buffer.length

/** Vyprázdní buffer. Používá se jen v kontrolách – v appce není proč. */
export function zapomenChyby() {
  buffer.length = 0
}
