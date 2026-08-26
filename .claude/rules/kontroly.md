---
paths:
  - scripts/**
  - PARITA.md
  - reference/**
---

# Ověřovací skripty

_Zjištěno auditem: 13 souborů v `scripts/`, `package.json:7-24`, `PARITA.md`,
`.githooks/pre-commit`._

**Není tu žádný test framework** — chybí Jest, Vitest, `tests/` i `npm test`. Nezaváděj je
bez vyžádání. Místo nich je 27 samostatných spustitelných `.mjs` skriptů; každý vypíše
`X / Y` a skončí kódem 1 při chybě.

## Co který skript ověřuje

| Skript | Příkaz | Co dělá |
|---|---|---|
| `validate-data.mjs` | `npm run validate` | schéma dat; obal nad `src/data/validate.js` |
| `check-uloziste.mjs` | `npm run check-uloziste` | stěhování dat mezi úložišti (fotky, CSV, geometrie tras, archiv cest, debug záznamy), chování při plné paměti, odložený zápis poznámky, 36 kontrol |
| `check-debug.mjs` | `npm run check-debug` | debug poznámkovač: identita záznamu, podpis zařízení, přejmenování autora, otisk a změna od exportu, `.md` export, záloha, čtení rejstříku zpátky, porovnání s rejstříkem, čistota zdrojáků, 151 bodů |
| `extract-places.mjs` | `npm run check-data` | že `places.json` je 1:1 s originálem |
| `check-css-parity.mjs` | `npm run check-css:original` | 338 CSS pravidel proti originálu — **odstaveno redesignem** |
| `check-tokeny.mjs` | `npm run check-tokeny` | barvy natvrdo, párování světlý/tmavý, kontrast, 7 bodů |
| `check-dny.mjs` | `npm run check-dny` | dny, výpravy, složky, záloha, body trasy, přesun tažením a úpravy cesty, 203 bodů |
| `check-projekce.mjs` | `npm run check-projekce` | throttle a projekce polohy na trasu (živé sledování, srpen 2026), 13 bodů |
| `check-filters-parity.mjs` | `npm run check-filters` | 134 kombinací filtrů |
| `check-handlers.mjs` | `npm run check-handlers` | napojení tlačítek za běhu, 61/61 |
| `check-form.mjs` | `npm run check-form` | že formulář vyrábí platná místa, 18/18 |
| `check-ikony.mjs` | `npm run check-ikony` | jedna věc = jedno jméno = jedna ikona, 8 bodů |
| `check-images.mjs` | `npm run check-images` | existenci odkazů na fotky — **chodí na síť** |
| `smoke.mjs` | `npm run smoke` / `smoke:single` | proklikání v prohlížeči, 347 / 323 kontrol |
| `parity.mjs` | `npm run parity` | kontrolní seznam z `PARITA.md`, 26 bodů |
| `perf.mjs` | `npm run perf` | rychlost startu při zpomaleném procesoru |
| `perf-mapa.mjs` | ručně | plynulost posunu a přiblížení **stažené** malované mapy |
| `screenshots.mjs` + `compare-screens.mjs` | ručně | 8 obrazovek proti základně, i v tmavém režimu |
| `slouc.mjs` | `npm run slouc` | přesune přihrádku do hlavního souboru |
| `make-icons.mjs`, `fetch-fonts.mjs` | ručně | jednorázoví pomocníci (ikony PWA, stažení fontů) |
| `make-basemap.mjs` | ručně | přegeneruje `src/data/basemap.json` z Natural Earth — **chodí na síť** |
| `make-kresba.mjs` | ručně | papír a 120 kreseb z pěti listů v `grafika/terén/` |
| `make-relief.mjs` | ručně | stínování terénu z výškopisu — **chodí na síť** |
| `mvt.mjs` | — | není kontrola: čtení a filtrování vektorových dlaždic pro `make-mapa.mjs` |
| `mrizka.mjs` | — | není kontrola: definice evropské mřížky, sdílená reliéfem a oběma maskami |

`debug-rejstrik.mjs` není jen kontrola: skládá rejstřík složky `debug/` (co je otevřené,
co se vyřešilo) a `vite.config.js` ho tímtéž kódem přibaluje do `dist/debug-stav.json`.
`npm run debug-rejstrik -- --vypis` vypíše přehled do konzole. Formát `.md` exportu je
proto **dohoda dvou souborů** (`src/core/debugExport.js` a tenhle) — mění se v obou naráz
a hlídá to `check-debug`.

`nove-styly.mjs` není kontrola, ale sdílený seznam CSS prvků, které v originále protějšek
nemají. Používá ho `check-css-parity.mjs` i `parity.mjs` — když měl každý svůj, přidání
nového prvku tiše shodilo kontrolu bezpečných okrajů. **Nový CSS soubor mimo originál
přidej tam**, ne do jednotlivých skriptů.

`smoke.mjs`, `check-handlers.mjs`, `screenshots.mjs` a `perf.mjs` řídí **skutečný prohlížeč**:
`playwright-core` + Edge z `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`.
Chromium se schválně nestahuje. Skripty proti `dist/` potřebují napřed `npm run build`,
`smoke:single` potřebuje `npm run build:single`.

## Konvence nového skriptu

- ESM, `import ... from 'node:fs'` s prefixem `node:`, bez závislostí navíc.
- `const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')` —
  **ne** ruční ořezávání cesty: cesta k projektu obsahuje diakritiku („Anička") a v URL
  je zakódovaná jako `%C4%8D`.
- Úvodní JSDoc blok s příkazem, kterým se skript pouští, a s tím, co ověřuje.
- Výstup česky, `X / Y` na konci, `process.exit(1)` při chybě. Barvy jen když
  `process.stdout.isTTY && !process.env.NO_COLOR`.
- Rozlišuj **chyba** (kód 1) a **varování** (kód se nemění) — stejně jako `validate-data.mjs`.
- **Žádné řídicí znaky ve zdrojáku.** Dvakrát se stalo, že se místo escape sekvence
  zapsal skutečný bajt (0x00, 0x1B) — kód fungoval, ale `grep` začal soubor
  považovat za binární a přestal v něm hledat. Hlídá to `check-debug` na konci;
  povolený je jen tabulátor a konec řádku.

## Kdy co pustit

| Sáhl jsi do | Pusť |
|---|---|
| `src/data/**` | `npm run validate` (hook to udělá sám) |
| `src/core/storage.js`, `store.js`, `fotoDb.js`, `trasyDb.js`, `trasy.js`, `cesty.js`, `debugDb.js` | `npm run check-uloziste` |
| `src/core/debug*.js`, `chyby.js`, `src/views/debug/**` | `npm run check-debug` |
| `src/map/**`, nový CSS soubor | `npm run smoke`, `npm run check-tokeny`, `npm run parity` |
| `src/map/vektory.js`, `vbm.js` | k tomu `node scripts/perf-mapa.mjs` — bez měření je „zrychlili jsme to" jen dojem |
| CSS, `tokens.css` | `npm run check-tokeny` |
| `store.plan`, dny v plánu, výpravy, záloha | `npm run check-dny` |
| filtry, hledání | `npm run check-filters` |
| obsluha tlačítek, nová obrazovka | `npm run check-handlers`, `npm run smoke` |
| formulář „Přidat místo" | `npm run check-form` |
| build, service worker | `npm run build && npm run smoke`, `build:single && smoke:single` |

Před `git push` (= nasazení do produkce) projeď aspoň `npm run validate` a `npm run smoke`.

## Parita

`reference/index-original.html` je bajtově shodná kopie původní aplikace a **needituje se**.
Je to vstup pro `check-data`, `check-handlers` a `check-css:original`.

Přestavba je hotová, takže parita už není zákon — je to **regresní síť**. Když vědomě měníš
vzhled nebo chování, je v pořádku, že se číslo v `PARITA.md` změní: přepiš ho a napiš do
commitu proč. Neměň skript tak, aby kontrola prošla.

**Vzhled se od originálu rozešel** vizuálním redesignem (srpen 2026, `PARITA.md` §10 Q14,
výklad ve `VZHLED.md`). `check-css` proto vypadlo z povinné sady a nahradilo ho
`check-tokeny`; porovnání snímků se dělá proti **poslední základně**, ne proti originálu:

```bash
node scripts/screenshots.mjs --baseline   # před zásahem
node scripts/screenshots.mjs              # po zásahu
node scripts/compare-screens.mjs
```

Měření snímků kolísá, pokud se nepočká na síť a fonty; `screenshots.mjs` proto blokuje
dlaždice mapy a fotky z Wikimedia v obou verzích a čeká na `document.fonts.ready`.
Fonty a Leaflet z CDN se blokovat **nesmějí** — stará verze je odtamtud bere.
