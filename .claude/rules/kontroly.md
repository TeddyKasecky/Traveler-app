---
paths:
  - scripts/**
---

# Ověřovací skripty

_Zjištěno auditem: `scripts/`, `package.json`, `.githooks/pre-commit`._

**Není tu žádný test framework** — chybí Jest, Vitest, `tests/` i `npm test`. Nezaváděj je
bez vyžádání. Místo nich je 37 samostatných spustitelných `.mjs` skriptů; každý vypíše
`X / Y` a skončí kódem 1 při chybě.

## Co který skript ověřuje

| Skript | Příkaz | Co dělá |
|---|---|---|
| `validate-data.mjs` | `npm run validate` | schéma dat; obal nad `src/data/validate.js` |
| `check-uloziste.mjs` | `npm run check-uloziste` | stěhování dat mezi úložišti (fotky, CSV, geometrie tras, archiv cest, debug záznamy), chování při plné paměti, odložený zápis poznámky, 36 kontrol |
| `check-worker.mjs` | `npm run check-worker` | že Cloudflare Worker nepustí dál, co nemá — název souboru, obsah, kolize, heslo, 64 bodů |
| `check-debug.mjs` | `npm run check-debug` | debug poznámkovač: identita záznamu, podpis zařízení, přejmenování autora, otisk a změna od exportu, `.md` export, záloha, čtení rejstříku zpátky, porovnání s rejstříkem, složka `debug/`, úklid a zavírání, čerstvost proti mainu, čistota zdrojáků, 199 bodů |
| `check-vrstvy.mjs` | `npm run check-vrstvy` | že `map/` neimportuje z `views/`, `core/` ani z jednoho, a že si nikdo neopisuje sdílené výpočty, 4 body |
| `check-tokeny.mjs` | `npm run check-tokeny` | barvy natvrdo, párování světlý/tmavý, kontrast, 7 bodů |
| `check-dny.mjs` | `npm run check-dny` | dny, výpravy, složky, záloha, body trasy, přesun tažením, úpravy cesty, okno dnů pro počasí, dělení dlouhé trasy na úseky a otisk z uloženého zápisu, 253 bodů |
| `check-projekce.mjs` | `npm run check-projekce` | throttle a projekce polohy na trasu (živé sledování, srpen 2026), 13 bodů |
| `check-filtry.mjs` | `npm run check-filters` | 134 kombinací filtrů proti druhé implementaci |
| `check-form.mjs` | `npm run check-form` | že formulář vyrábí platná místa, 18/18 |
| `check-ikony.mjs` | `npm run check-ikony` | jedna věc = jedno jméno = jedna ikona, 8 bodů |
| `check-images.mjs` | `npm run check-images` | existenci odkazů na fotky — **chodí na síť** |
| `smoke.mjs` | `npm run smoke` | proklikání v prohlížeči, 549 kontrol |
| `check-regrese.mjs` | `npm run check-regrese` | PWA, zálohy, fotky, poloha, service worker — 26 bodů v prohlížeči |
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

`debug-uklid.mjs` a `debug-zavri.mjs` nejsou kontroly, ale nástroje na složku `debug/`:
první odstraní duplicitní kopie záznamů a to, co je už ve `VYRESENO.md`, druhý uzavře
záznam jedním příkazem (`npm run debug-zavri -- <id> <hotovo|zahozeno> "důvod"`) místo tří
ručních editací. Společnou práci se soubory má `debug-slozka.mjs`. Kontrolu složky pouští
`check-debug` i pre-commit hook — duplicity appce nevadí, takže se bez ní tiše nahromadí.

`debug-cerstvost.mjs` je k nim třetí a jako jediný z nich **chodí na síť**:
`git fetch` a porovnání složky proti `origin/main`. Poznámky commituje Worker rovnou
na `main`, takže se složka mění i bez pushe a zastaralý checkout jinak není poznat —
výpis rejstříku a úklid proto varují a `debug-zavri` odmítne (zapisuje jako jediný
nevratně). Selhání kontroly (offline, timeout, chybějící `origin`) nikdy neblokuje.
Rozhodnutí nese čistá `rozborDiffu()`, aby šlo testovat bez gitu a bez sítě.

`debug-rejstrik.mjs` není jen kontrola: skládá rejstřík složky `debug/` (co je otevřené,
co se vyřešilo) a `vite.config.js` ho tímtéž kódem přibaluje do `dist/debug-stav.json`.
`npm run debug-rejstrik -- --vypis` vypíše přehled do konzole. Formát `.md` exportu je
proto **dohoda dvou souborů** (`src/core/debugExport.js` a tenhle) — mění se v obou naráz
a hlídá to `check-debug`.

`nove-styly.mjs` není kontrola, ale seznam CSS souborů, které vznikly až redesignem.
Používá ho `check-regrese.mjs`, aby jejich `env(safe-area-inset-*)` nepočítal do sumy,
která má sedět na pevné číslo. **Nový CSS soubor přidej tam**, ne do skriptu — jinak
tiše shodí kontrolu bezpečných okrajů.

`smoke.mjs`, `check-regrese.mjs`, `screenshots.mjs` a `perf.mjs` řídí **skutečný prohlížeč**:
`playwright-core` + Edge z `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`.
Chromium se schválně nestahuje. Skripty proti `dist/` potřebují napřed `npm run build`,

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
| `debug/**` | `npm run debug-uklid -- --kontrola` (hook to udělá sám) |
| `src/core/storage.js`, `store.js`, `fotoDb.js`, `trasyDb.js`, `trasy.js`, `cesty.js`, `debugDb.js` | `npm run check-uloziste` |
| `src/core/debug*.js`, `chyby.js`, `src/views/debug/**` | `npm run check-debug` |
| `src/map/**`, nový CSS soubor | `npm run smoke`, `npm run check-tokeny`, `npm run check-regrese` |
| `src/map/vektory.js`, `vbm.js` | k tomu `node scripts/perf-mapa.mjs` — bez měření je „zrychlili jsme to" jen dojem |
| CSS, `tokens.css` | `npm run check-tokeny` |
| `store.plan`, dny v plánu, výpravy, záloha | `npm run check-dny` |
| filtry, hledání | `npm run check-filters` |
| obsluha tlačítek, nová obrazovka | `npm run smoke` |
| formulář „Přidat místo" | `npm run check-form` |
| build, service worker | `npm run build && npm run smoke` |

Před `git push` (= nasazení do produkce) projeď aspoň `npm run validate` a `npm run smoke`.

## Porovnání snímků

Přestavba do modulů skončila a od té doby se appka od původní aplikace **záměrně
rozchází**. V srpnu 2026 proto zmizel `reference/index-original.html` i všechno, co
sloužilo jen jemu: `check-data`, `check-handlers` a `check-css:original`. `parity.mjs`
se přejmenoval na `check-regrese.mjs` — jeho 23 z 26 bodů na originálu nikdy nezáviselo
a tři zbylé mají očekávanou hodnotu zapsanou natvrdo. `check-filters` přežil beze změny:
původní filtrovací funkci má opsanou přímo v sobě, takže je to dnes **druhá nezávislá
implementace filtrů**, ne důkaz shody s originálem.

`PARITA.md` zůstává jako **uzavřený záznam** té přestavby. Cituje se z něj dodnes —
třeba §8, kde je měřením zamítnuté dělení dat míst. Není to zadání, je to historie:
nepřepisuj ho a neřiď se jím jako pravidlem.

Porovnání snímků se dělá proti **poslední odsouhlasené základně**:

```bash
node scripts/screenshots.mjs --baseline   # před zásahem
node scripts/screenshots.mjs              # po zásahu
node scripts/compare-screens.mjs
```

Měření snímků kolísá, pokud se nepočká na síť a fonty; `screenshots.mjs` proto blokuje
dlaždice mapy a fotky z Wikimedia a čeká na `document.fonts.ready`. Bez toho hlásí
`compare-screens.mjs` rozdíly, které způsobil jen pomalejší běh.
