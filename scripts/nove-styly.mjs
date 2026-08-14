/**
 * CSS prvků, které v původní aplikaci protějšek nemají.
 *
 * Nemají se s čím porovnávat, takže se z porovnání s originálem vyjímají –
 * jinak by se do seznamu odsouhlasených výjimek musel vypsat každý jejich
 * selektor a kontrola by ztratila smysl. Že nepřepisují nic z originálu,
 * se hlídá zvlášť v `check-css-parity.mjs`.
 *
 * Seznam je tady jeden pro všechny. Když ho měl každý skript svůj, přidání
 * nového prvku tiše shodilo kontrolu bezpečných okrajů v `parity.mjs`, protože
 * se aktualizoval jen ten druhý.
 */
export const NOVE_STYLY = ['addform.css', 'pruh.css', 'offlinemap.css', 'motiv.css', 'profil.css']

/** Cesty tak, jak se píšou v `src/styles/index.css`. */
export const NOVE_STYLY_CESTY = NOVE_STYLY.map((f) => `./components/${f}`)
