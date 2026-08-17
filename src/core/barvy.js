/**
 * Čtení návrhových barev z CSS do JavaScriptu.
 *
 * PROČ TENHLE SOUBOR EXISTUJE: Leaflet zapisuje barvy jako atributy do SVG
 * a do plátna. Nejde je tedy nastylovat zvenčí a musí se mu předat hodnotou.
 * Když se ta hodnota napíše do kódu natvrdo, rozejde se s `tokens.css` –
 * a od zavedení tmavého režimu i s tím, co má být zrovna vidět.
 *
 * Vzorem je `src/map/podklad.js`, který to tak dělal odjakživa.
 *
 * Používá se jen tam, kde to jinak nejde. V CSS i v inline stylech v šablonách
 * se dál píše `var(--neco)` – to prohlížeč přepočítá sám a s přepnutím režimu
 * se to změní bez jediného řádku kódu.
 */

/**
 * Hodnota návrhové proměnné z kořene dokumentu.
 *
 * Čte se pokaždé znovu, ne do mezipaměti: po přepnutí režimu musí vrátit
 * novou hodnotu. Volá se jednotky kusů při překreslení, ne v cyklu.
 *
 * @param {string} nazev  včetně dvou pomlček, např. `--akcent`
 * @param {string} zaloha  když proměnná neexistuje (starý build v cache)
 * @returns {string}
 */
export function token(nazev, zaloha) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nazev).trim()
  return v || zaloha
}
