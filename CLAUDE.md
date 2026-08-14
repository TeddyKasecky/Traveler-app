# Vandrbuch (Traveler-app)

Cestovatelská databáze a wishlist míst po Evropě: 580 míst, mapa, plánovač trasy, poznámky
a hodnocení. **Statická PWA — žádný server, žádná databáze, žádný backend.** Data míst jsou
v repozitáři jako JSON, uživatelská data jen v localStorage prohlížeče.

Vzniklo přestavbou jednoho 718 kB souboru `index.html` do modulů. Přestavba je **hotová**
a doložená v [PARITA.md](PARITA.md); parita už není zákon, ale kontrolní skripty zůstávají
jako regresní síť.

**Uživatelské texty, dokumentace, komentáře i identifikátory v kódu jsou česky.** Anglicky
zůstávají jen datové zkratky (`p`, `k`, `S`, `F`), názvy z DOM a API Leafletu. Nepřejmenovávej
české identifikátory na anglické.

## Kritická pravidla

- **`id` místa se nikdy nemění.** Jsou na něj navázané poznámky, hodnocení, priority, plán,
  vyfocené fotky, vazby `nb` z jiných míst i generovaná pohlednice. Překlep v názvu se opravuje
  v poli `n`, `id` zůstává. Viz [.claude/rules/database.md](.claude/rules/database.md).
- **Klíče v úložišti se nemění**: `vandrbuch:v1` (poznámky, hodnocení, plán, priority),
  `vandrbuch:prefs`, `vandrbuch:data` (import CSV) a sklad `fotky` v IndexedDB
  (`src/core/storage.js`, `src/core/fotoDb.js`). Jsou v nich všechna uživatelská data
  a nikde jinde neexistují — změna klíče je tichá ztráta dat. Starý `vandrbuch:photos`
  se při prvním otevření sám přestěhuje do IndexedDB a vyprázdní.
- **Nikdy nezahazuj výsledek ukládání.** `save()`, `savePrefs()`, `ulozFotku()` vracejí
  `false`, když se nepovedlo zapsat, a `store.js` z toho posílá `ulozeniSelhalo`. Právě
  zahozený výsledek dřív způsoboval, že poznámky při plné paměti mizely beze slova.
- **`reference/index-original.html` se needituje.** Je to bajtově shodná kopie původní aplikace
  a měřítko pro `npm run check-css`, `check-data`, `check-handlers` a porovnání snímků.
  V `.gitattributes` má `-text`, aby ji Git nepřepsal na CRLF.
- **`src/pwa/sw.js` je šablona, ne hotový soubor.** Seznam souborů k uložení do cache a číslo
  verze do ní doplní až `vite.config.js` při buildu (`__PRECACHE__`, `__VERSION__`).
  `dist/sw.js` je generovaný — nikdy ho needituj.
- **`git push` na `main` = nasazení do produkce.** Cloudflare projekt `traveler-app` staví
  a nasazuje každý push automaticky. Commituj volně, **před pushem se vždy zeptej.**
- **Žádný linter ani formatter není nastavený** — `.eslintrc`, `.prettierrc`, `.editorconfig`
  ani tsconfig v repu nejsou. Styl níž vynucuje jen review. Nevymýšlej `npm run lint`,
  `npm run format` ani `npm test`, neexistují.
- **Adresy fotek z Wikimedia Commons musí být procentně zakódované** (`ö` → `%C3%B6`,
  `'` → `%27`, `,` → `%2C`). Nezakódovaný znak kontrola odmítne — obrázek by se tiše nenačetl.
- Nápady N1–N10 v [NAPADY.md](NAPADY.md) jsou **vědomě neimplementované**. Přestavba skončila,
  takže se implementovat smějí, ale **každý až po výslovné dohodě** — všechny mění chování
  nebo data.

## Příkazy

Vše ze složky `vandrbuch/`, kde leží `package.json`. Poprvé jednou `npm install`.

```bash
npm run dev              # vývojový server, dostupný i z mobilu na stejné wifi
npm run build            # → dist/ ; tohle nasazuje Cloudflare
npm run build:single     # → dist-single/index.html ; jeden offline soubor
npm run preview          # prohlédnutí sestaveného webu

npm run validate         # kontrola dat míst; běží i sama v pre-commit hooku
npm run slouc            # vysype places-nova.json do places.json a přepočítá okolí
npm run check-uloziste   # že se poznámky neztratí, když dojde místo, 13 kontrol

npm run smoke            # proklikání v prohlížeči, 55 kontrol
npm run smoke:single     # totéž pro single-file variantu, 45 kontrol
npm run parity           # kontrolní seznam z PARITA.md, 25 bodů
npm run check-data       # data 1:1 s původní aplikací
npm run check-css        # 338 CSS pravidel proti originálu
npm run check-filters    # 134 kombinací filtrů
npm run check-handlers   # napojení tlačítek, 61/61
npm run check-form       # že formulář vyrábí platná místa, 18/18
npm run check-images     # existence odkazů na fotky (síť)
npm run perf             # rychlost startu při zpomaleném procesoru

node scripts/screenshots.mjs && node scripts/compare-screens.mjs   # porovnání po pixelech
node scripts/make-basemap.mjs   # přegeneruje podklad offline mapy (ručně, zřídka)
```

Pre-commit hook (`.githooks/pre-commit`) pustí `validate-data.mjs`, ale jen když se změnilo
něco v `src/data/`. Vyžaduje jednorázové `git config core.hooksPath .githooks` — je nastavené.

## Architektura

Jeden soubor = jedna zodpovědnost. Žádný framework, žádná knihovna na vzhled.
Jediná runtime závislost je Leaflet 1.9.4 (přišpendlená přesná verze, bez `^`).

| Kde | Co |
|---|---|
| `src/main.js` | vstupní bod — jen poskládá díly a zaregistruje odběry událostí, žádná logika |
| `src/core/` | čistá logika bez DOM: `store.js` (stav + pub/sub), `router.js`, `filters.js`, `search.js`, `geo.js`, `csv.js`, `storage.js` (localStorage), `fotoDb.js` (IndexedDB), `html.js` |
| `src/data/` | `places.json` (580 míst), `places-nova.json` (přihrádka), číselníky `categories.js`/`collections.js`/`moods.js`, `validate.js`, `schema.md`, `basemap.json` (podklad offline mapy) |
| `src/views/` | obrazovky Domů, Objevuj, Seznam, Plán, Detail + registr `index.js` |
| `src/components/` | díly použité na víc obrazovkách (karta, filtry, sheet, wizard, formulář, toast) |
| `src/map/` | Leaflet: `map.js`, `markers.js`, `planLine.js`, `detailMap.js`, `offlineMap.js` (podklad bez signálu) |
| `src/styles/` | CSS po dílech, pořadí určuje `index.css`; barvy a rozměry jen z `tokens.css` |
| `src/pwa/` | `sw.js` (šablona service workeru) a `register.js` |
| `scripts/` | 17 ověřovacích skriptů, viz [.claude/rules/kontroly.md](.claude/rules/kontroly.md) |
| `reference/` | bajtově shodná kopie původní aplikace — jen ke čtení |

**Moduly se nevolají napřímo — oznamují si změny událostmi** přes `on()`/`emit()` ze
`src/core/store.js`. Mapa nesmí volat views a naopak; bez toho by přidání obrazovky znamenalo
sahat do mapy. Události dnes: `prekresleno`, `otevriDetail`, `skoc`, `poloha`.

**Žádné globální proměnné mimo `src/core/store.js`** (`S`, `F`, `store`, `prefs`, `PHOTOS`).

**Přidání obrazovky:** složka ve `src/views/`, záznam v `src/views/index.js`, tlačítko
`<button data-tab="…">` v `index.html`. Nic jiného.

## Konvence

_Odvozeno ze skutečného kódu — žádný linter to nevynucuje._

- **Bez středníků**, jednoduché uvozovky, odsazení 2 mezerami, LF (`.gitattributes: eol=lf`).
- Každý soubor začíná JSDoc blokem, který vysvětluje **proč**, ne co. Netriviální rozhodnutí
  má u sebe odůvodnění, často i s odkazem na řádek v originálu.
- HTML se skládá jako řetězce v template literals, ne přes `document.createElement`.
  Text uživatele vždy přes `esc()` z `src/core/html.js`.
- Parametry typované JSDoc anotacemi (`@param {Record<string, any>} p`), ne TypeScriptem.
- CSS: barvy a rozměry výhradně přes proměnné z `tokens.css`, nikdy natvrdo.
- Ikony jsou symboly v `src/icons/sprite.svg`, jmenují se `i-neco`, vkládají se `IC('i-van')`.

Podrobná pravidla podle oblasti (auto-scoped podle cesty):
[.claude/rules/database.md](.claude/rules/database.md) ·
[.claude/rules/kod.md](.claude/rules/kod.md) ·
[.claude/rules/kontroly.md](.claude/rules/kontroly.md) ·
[.claude/rules/nasazeni.md](.claude/rules/nasazeni.md).

Návody pro člověka: [README.md](README.md), schéma dat [src/data/schema.md](src/data/schema.md).

## Známé vlastnosti (neopravovat bez vyžádání)

- **`esc()` v `src/core/html.js` ošetřuje jen `&` a `<`**, ne `>` ani uvozovky, přestože se
  používá i uvnitř atributů. Je to doslovný přepis původní funkce. „Oprava" na plné ošetření
  by změnila výstup na obrazovce a shodila paritu.
- **Kolekce `psi` nemá dlaždici** v Objevuj — 7 míst ji v `col` má, ale `COLL` v
  `collections.js` má jen 11 definic (N5).
- **Osm `id` má před číslicemi dvě pomlčky** (`…-to-je--057`). Slug se uřízl na pomlčce,
  kontrola to připouští, není to chyba.
- **318 míst nemá `img`** a zobrazuje se u nich kreslená pohlednice generovaná z `id`.
  Je to záměr, ne nedodělek — fotky nedoplňuj náhodně.
- **Záloha poznámek neukládá priority**, ale obnova je umí načíst (N2). Plamínky se zálohou
  ztratí.
- **Badge u filtrů nepočítá filtr `fire`** („Musíme!") (N1).
- Všech 8 parkovišť má `transitStatus: "verified"`; zbylé tři stavy aplikace umí zobrazit,
  jen se zatím nepoužily.
- `renderList()` kreslí maximálně 250 karet a vypíše „Zobrazeno prvních 250". Není to
  virtualizace (N10).

> Tenhle soubor má dvojče v `../CLAUDE.md` (Claude Code se často spouští z nadřazené složky).
> **Každá změna pravidel musí do obou.** Tenhle je ten commitovaný a závazný pro tým.
