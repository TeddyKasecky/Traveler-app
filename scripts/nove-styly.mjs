/**
 * CSS prvků, které v původní aplikaci protějšek nemají.
 *
 * Nemají se s čím porovnávat, takže se z porovnání s originálem vyjímají –
 * jinak by se do seznamu odsouhlasených výjimek musel vypsat každý jejich
 * selektor a kontrola by ztratila smysl. Že nepřepisují nic z originálu,
 * (Do srpna 2026 to hlídal `check-css-parity.mjs`; ten zmizel s předlohou,
 * proti které porovnával. Seznam zůstal, protože ho dál potřebuje
 * `check-regrese.mjs` na počítání bezpečných okrajů.)
 *
 * Seznam je tady jeden pro všechny. Když ho měl každý skript svůj, přidání
 * nového prvku tiše shodilo kontrolu bezpečných okrajů v `check-regrese.mjs`, protože
 * se aktualizoval jen ten druhý.
 */
export const NOVE_STYLY = ['addform.css', 'pruh.css', 'podklad.css', 'motiv.css', 'profil.css', 'plan-dny.css', 'plan.css', 'kosikFab.css', 'porovnani.css', 'vzory.css', 'mapa.css', 'dialog.css', 'debug.css', 'sbalka.css']

/** Cesty tak, jak se píšou v `src/styles/index.css`. */
export const NOVE_STYLY_CESTY = NOVE_STYLY.map((f) => `./components/${f}`)
