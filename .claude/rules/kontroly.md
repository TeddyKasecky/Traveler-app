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
bez vyžádání. Místo nich je 17 samostatných spustitelných `.mjs` skriptů; každý vypíše
`X / Y` a skončí kódem 1 při chybě.

## Co který skript ověřuje

| Skript | Příkaz | Co dělá |
|---|---|---|
| `validate-data.mjs` | `npm run validate` | schéma dat; obal nad `src/data/validate.js` |
| `check-uloziste.mjs` | `npm run check-uloziste` | stěhování dat mezi úložišti, chování při plné paměti, odložený zápis poznámky |
| `extract-places.mjs` | `npm run check-data` | že `places.json` je 1:1 s originálem |
| `check-css-parity.mjs` | `npm run check-css` | 338 CSS pravidel proti originálu |
| `check-filters-parity.mjs` | `npm run check-filters` | 134 kombinací filtrů |
| `check-handlers.mjs` | `npm run check-handlers` | napojení tlačítek za běhu, 61/61 |
| `check-form.mjs` | `npm run check-form` | že formulář vyrábí platná místa, 18/18 |
| `check-images.mjs` | `npm run check-images` | existenci odkazů na fotky — **chodí na síť** |
| `smoke.mjs` | `npm run smoke` / `smoke:single` | proklikání v prohlížeči, 55 / 45 kontrol |
| `parity.mjs` | `npm run parity` | kontrolní seznam z `PARITA.md`, 25 bodů |
| `perf.mjs` | `npm run perf` | rychlost startu při zpomaleném procesoru |
| `screenshots.mjs` + `compare-screens.mjs` | ručně | 8 obrazovek porovnaných po pixelech |
| `slouc.mjs` | `npm run slouc` | přesune přihrádku do hlavního souboru |
| `make-icons.mjs`, `fetch-fonts.mjs` | ručně | jednorázoví pomocníci (ikony PWA, stažení fontů) |
| `make-basemap.mjs` | ručně | přegeneruje `src/data/basemap.json` z Natural Earth — **chodí na síť** |

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

## Kdy co pustit

| Sáhl jsi do | Pusť |
|---|---|
| `src/data/**` | `npm run validate` (hook to udělá sám) |
| `src/core/storage.js`, `store.js`, `fotoDb.js` | `npm run check-uloziste` |
| `src/map/**`, nový CSS soubor | `npm run smoke`, `npm run check-css`, `npm run parity` |
| CSS | `npm run check-css` |
| filtry, hledání | `npm run check-filters` |
| obsluha tlačítek, nová obrazovka | `npm run check-handlers`, `npm run smoke` |
| formulář „Přidat místo" | `npm run check-form` |
| build, service worker | `npm run build && npm run smoke`, `build:single && smoke:single` |

Před `git push` (= nasazení do produkce) projeď aspoň `npm run validate` a `npm run smoke`.

## Parita

`reference/index-original.html` je bajtově shodná kopie původní aplikace a **needituje se**.
Je to vstup pro `check-data`, `check-css`, `check-handlers` a porovnání snímků.

Přestavba je hotová, takže parita už není zákon — je to **regresní síť**. Když vědomě měníš
vzhled nebo chování, je v pořádku, že se číslo v `PARITA.md` změní: přepiš ho a napiš do
commitu proč. Neměň skript tak, aby kontrola prošla.

Měření snímků kolísá, pokud se nepočká na síť a fonty; `screenshots.mjs` proto blokuje
dlaždice mapy a fotky z Wikimedia v obou verzích a čeká na `document.fonts.ready`.
Fonty a Leaflet z CDN se blokovat **nesmějí** — stará verze je odtamtud bere.
