# Vandrbuch (Traveler-app)

Cestovatelská databáze a wishlist míst po Evropě: 580 míst, mapa, plánovač trasy, poznámky
a hodnocení. **Statická PWA — žádný server, žádná databáze, žádný backend.** Data míst jsou
v repozitáři jako JSON, uživatelská data jen v localStorage prohlížeče.

> **Jediná výjimka (srpen 2026):** Cloudflare Worker má od té doby kód
> (`worker/index.js`) a obsluhuje **jednu jedinou adresu** `POST /api/debug` —
> odeslání debug poznámky do složky `debug/`. Nesahá na uživatelská data,
> neovlivňuje offline běh, je vidět jen se zapnutým `prefs.debugRezim` a na
> produkci je mrtvý, protože se tam nenastavuje secret. Všechno ostatní
> dostane 404, tedy přesně to co dřív. Únikový východ je smazat `main`
> ze `wrangler.jsonc`. Nic dalšího na server nepatří.

Vzniklo přestavbou jednoho 718 kB souboru `index.html` do modulů. Přestavba je **hotová** a doložená
v [PARITA.md](PARITA.md). Ten soubor je dnes **uzavřený záznam**, ne zadání: od srpna
2026 se appka od původní aplikace záměrně rozchází, předloha `reference/index-original.html`
je smazaná a s ní i vše, co porovnávalo jen s ní. Kontrolní skripty zůstávají jako
regresní síť samy o sobě.

**Uživatelské texty, dokumentace, komentáře i identifikátory v kódu jsou česky.** Anglicky
zůstávají jen datové zkratky (`p`, `k`, `S`, `F`), názvy z DOM a API Leafletu. Nepřejmenovávej
české identifikátory na anglické.

**Vzhled se řídí grafickým manuálem „Golden Moss"** — paleta, Playfair Display, měkké
karty, světlý i tmavý režim. Výklad je ve [VZHLED.md](VZHLED.md), podklady ve složce
`grafika/` (není v repozitáři). Od srpna 2026 se vzhled od původní aplikace **rozchází
záměrně**; `check-css` proto zmizelo a nahradilo ho `check-tokeny`.

## Kritická pravidla

- **`id` místa se nikdy nemění.** Jsou na něj navázané poznámky, hodnocení, priority, plán,
  vyfocené fotky, vazby `nb` z jiných míst i generovaná pohlednice. Překlep v názvu se opravuje
  v poli `n`, `id` zůstává. Viz [.claude/rules/database.md](.claude/rules/database.md).
- **Klíče v úložišti se nemění**: `vandrbuch:v1` (poznámky, hodnocení, plán, dny plánu, priority),
  `vandrbuch:prefs`, `vandrbuch:data` (import CSV) a sklad `fotky` v IndexedDB
  (`src/core/storage.js`, `src/core/fotoDb.js`), sklady `trasy`, `cesty` a `debug`
  v IndexedDB (`src/core/trasyDb.js`, `cestyDb.js`, `debugDb.js`; databáze
  `vandrbuch-trasy`, `vandrbuch-cesty` a `vandrbuch-debug`). Jsou v nich všechna uživatelská data
  a nikde jinde neexistují — změna klíče je tichá ztráta dat. Starý `vandrbuch:photos`
  se při prvním otevření sám přestěhuje do IndexedDB a vyprázdní.
- **Nikdy nezahazuj výsledek ukládání.** `save()`, `savePrefs()`, `ulozFotku()` vracejí
  `false`, když se nepovedlo zapsat, a `store.js` z toho posílá `ulozeniSelhalo`. Právě
  zahozený výsledek dřív způsoboval, že poznámky při plné paměti mizely beze slova.
- **`src/pwa/sw.js` je šablona, ne hotový soubor.** Seznam souborů k uložení do cache a číslo
  verze do ní doplní až `vite.config.js` při buildu (`__PRECACHE__`, `__VERSION__`).
  `dist/sw.js` je generovaný — nikdy ho needituj.
- **`git push` na `main` nasazuje na betu** (`traveler-app-beta.teddykasecky.workers.dev`),
  **ne na ostrou appku.** Cloudflare projekt `traveler-app-beta` staví a nasazuje každý push
  na `main` automaticky. Pracuj a pushuj na `main` samostatně, bez ptaní — postup je
  v sekci „Git workflow (autonomní, bez PR)" níž. Na `main` se nikdy nepracuje přímo.
  **Produkce (`traveler-app.teddykasecky.workers.dev`) sleduje samostatnou větev
  `production`**, kterou se z `main` posouvá jen na výslovné vyžádání („nasaď na
  produkci", „pushni to do produkce") — postup je v sekci „Nasazení na produkci" níž.
  Nikdy nemerguj/nepushuj do `production` jako součást běžného „pushni to na main".
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
npm run build            # → dist/ ; tohle stejné buildy nasazuje Cloudflare (main → beta, production → ostrá appka)
npm run build:single     # → dist-single/index.html ; jeden offline soubor
npm run preview          # prohlédnutí sestaveného webu

npm run validate         # kontrola dat míst; běží i sama v pre-commit hooku
npm run slouc            # vysype places-nova.json do places.json a přepočítá okolí
npm run check-uloziste   # že se poznámky neztratí, když dojde místo, 36 kontrol
npm run check-debug      # debug poznámkovač: identita, otisk, rejstřík, složka debug/, 199 bodů
npm run check-worker     # že Worker nepustí dál, co nemá, 48 bodů
npm run debug-uklid      # duplicity a zavřené záznamy ze složky debug/ ven
npm run debug-zavri      # uzavře záznam: -- <id> <hotovo|zahozeno> "důvod"

npm run smoke            # proklikání v prohlížeči, 389 kontrol
npm run smoke:single     # totéž pro single-file variantu, 339 kontrol
npm run check-regrese    # PWA, zálohy, fotky, poloha, service worker, 26 bodů
npm run check-tokeny     # barvy natvrdo, párování světlý/tmavý, kontrast, 7 bodů
npm run check-dny        # dny, výpravy, body trasy, tažení a úpravy cesty, 203 bodů
npm run check-filters    # 134 kombinací filtrů
npm run check-form       # že formulář vyrábí platná místa, 18/18
npm run check-ikony      # jedna věc = jedno jméno = jedna ikona, 8 bodů
npm run check-images     # existence odkazů na fotky (síť)
npm run perf             # rychlost startu při zpomaleném procesoru
node scripts/perf-mapa.mjs  # plynulost posunu a přiblížení stažené mapy

node scripts/screenshots.mjs --baseline   # základna před zásahem
node scripts/screenshots.mjs && node scripts/compare-screens.mjs   # co se změnilo
node scripts/make-kat-fota.mjs     # zástupné ilustrace kategorií z grafika/
node scripts/make-basemap.mjs   # přegeneruje obrysy zemí z Natural Earth (ručně, zřídka)
node scripts/make-mapa.mjs      # změří výřez Evropy z planety Protomaps
node scripts/make-mapa.mjs --zapis   # …a zapíše ho do public/mapa-evropa.vbm
node scripts/make-kresba.mjs    # papír a 120 kreseb z pěti listů v grafika/terén/
node scripts/make-relief.mjs         # změří stínování terénu z výškopisu
node scripts/make-relief.mjs --zapis  # …a zapíše ho do src/assets/relief-evropa.webp
```

Pre-commit hook (`.githooks/pre-commit`) pustí `validate-data.mjs`, ale jen když se změnilo
něco v `src/data/`. Vyžaduje jednorázové `git config core.hooksPath .githooks` — je nastavené.

## Architektura

Jeden soubor = jedna zodpovědnost. Žádný framework, žádná knihovna na vzhled.
Runtime závislosti jsou **dvě** a obě vědomě:

- **Leaflet 1.9.4** (přišpendlená přesná verze, bez `^`) — nese celou mapu.
- **MapLibre GL** + `@maplibre/maplibre-gl-leaflet` — kreslí malovanou offline
  mapu z vektorových dlaždic. Je to **výjimka z pravidla „jen Leaflet"**,
  odsouhlasená v srpnu 2026: bez ní by v mapě nebyly lesy, louky ani pole,
  protože Natural Earth žádný pokryv krajiny nemá. Natahuje se **dynamickým
  importem**, takže skončí ve vlastním chunku a stáhne si ji jen ten, kdo si
  mapu do telefonu opravdu stáhne. Do jednosouborové varianty se nebalí vůbec
  (`import.meta.env.SINGLE_FILE` v `map/podklad.js`).

| Kde | Co |
|---|---|
| `src/main.js` | vstupní bod — jen poskládá díly a zaregistruje odběry událostí, žádná logika |
| `src/core/` | čistá logika bez DOM: `store.js` (stav + pub/sub), `router.js`, `filters.js`, `search.js`, `geo.js`, `csv.js`, `storage.js` (localStorage), `fotoDb.js` (IndexedDB), `html.js`, `motiv.js` (světlý/tmavý), `barvy.js` (čtení tokenů do JS) |
| `src/data/` | `places.json` (580 míst), `places-nova.json` (přihrádka), číselníky `categories.js`/`collections.js`/`moods.js`, `validate.js`, `schema.md`, `basemap.json` (obrysy zemí), `mesta.json` (985 měst), `relief.json` (meze evropské mřížky) |
| `src/views/` | obrazovky Domů, Mapa (spodní část), Objevuj, Seznam, Plán (`plan/` má i cestu, archiv, achievementy, čísla výpravy, bloky a `body.js` s daty bez `IC`), Detail, Profil, Nastavení, Porovnání + registr `index.js` |
| `src/components/` | díly použité na víc obrazovkách: `vzory.js` (11 stavebních dílů rozvržení), `dialog.js` (potvrzení/zadání/výběr místo prompt/confirm/alert), `vypravaKarta.js`, `vyberMista.js`, `plusMenu.js`, karta, filtry, sheet, wizard, formulář, toast |
| `src/map/` | Leaflet: `map.js`, `markers.js`, `planLine.js`, `detailMap.js`, `podklad.js` (offline mapa), `vektory.js` (plochy a kresby v MapLibre), `kresby.js` (kde kresby stojí — z masky), `vbm.js` + `vbmWorker.js` (čtení staženého balíku) |
| `src/styles/` | CSS po dílech, pořadí určuje `index.css`; barvy a rozměry jen z `tokens.css` |
| `src/pwa/` | `sw.js` (šablona service workeru) a `register.js` |
| `scripts/` | 24 ověřovacích a přípravných skriptů, viz [.claude/rules/kontroly.md](.claude/rules/kontroly.md) |

**Moduly se nevolají napřímo — oznamují si změny událostmi** přes `on()`/`emit()` ze
`src/core/store.js`. Mapa nesmí volat views a naopak; bez toho by přidání obrazovky znamenalo
sahat do mapy. Události dnes: `prekresleno`, `otevriDetail`, `skoc`, `poloha`, `fotkyNacteny`,
`ulozeniSelhalo`, `motivZmenen`, `zalozkaZmenena` (přepnutí hlavní záložky, `core/router.js`),
`zivaProjekce` (throttlovaně z `views/plan/cesta-zivot.js`).

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
- CSS: barvy a rozměry výhradně přes proměnné z `tokens.css`, nikdy natvrdo. Nová barva
  patří do sémantické vrstvy **a do obou tmavých bloků** — viz [VZHLED.md](VZHLED.md).
- Ikony jsou symboly v `src/icons/sprite.svg` (66 kusů), jmenují se `i-neco`, vkládají se `IC('i-van')`.

Podrobná pravidla podle oblasti (auto-scoped podle cesty):
[.claude/rules/database.md](.claude/rules/database.md) ·
[.claude/rules/kod.md](.claude/rules/kod.md) ·
[.claude/rules/kontroly.md](.claude/rules/kontroly.md) ·
[.claude/rules/nasazeni.md](.claude/rules/nasazeni.md) ·
[.claude/rules/debug.md](.claude/rules/debug.md).

## Co do `vandrbuch:v1` nepatří

**Nic, co se dá dopočítat.** localStorage má strop kolem 5 MB na všechna
uživatelská data dohromady a `save()` při každém zápisu serializuje celý
obsah naráz — takže jedna velká věc uvnitř zdraží každé uložení poznámky
a nakonec shodí ukládání všeho.

Odhalilo to v srpnu 2026 hlášení z debug poznámkovače: `vandrbuch:v1` měl
**4 270 kB**, tedy 85 % stropu, a 95 % z toho byla geometrie přepočtených
tras z Mapy.com — 273 kB na trasu, jedna na každou výpravu a na každou
archivovanou cestu, nikdy se nemazaly.

Geometrie se proto přestěhovala do IndexedDB (`src/core/trasyDb.js`,
databáze `vandrbuch-trasy`), klíčem je `otisk` z `views/plan/routing.js`.
Ve `store` zůstal jen ukazatel — `{ otisk, vzdalenostKm, casMin, spocitanoV }`.

Dělicí čára je jednoduchá:

| Patří do `vandrbuch:v1` | Patří do IndexedDB |
|---|---|
| co uživatel napsal nebo rozhodl (poznámky, hodnocení, plán, výpravy) | co si appka umí spočítat znovu (geometrie trasy) |
| co appka potřebuje hned při vykreslení | **vývojářská data** (debug záznamy) |
| co nejde ničím nahradit | co se dá dotáhnout z API nebo přegenerovat |
| co nepřibývá donekonečna | **co se hromadí** (archiv ukončených cest, fotky) |
| kilobajty | megabajty |

Poslední řádek je důvod, proč je v IndexedDB i **archiv ukončených cest**
(`src/core/cestyDb.js`), přestože se dopočítat nedá: rostl o 2–8 kB na každou
cestu a nikdy se nemazal. **V záloze proto zůstává** – na rozdíl od geometrie
je nenahraditelný.

**Do zálohy jde jen to první.** Trasy v ní schválně nejsou: po obnově na
jiném telefonu se ukáže vzdušná čára a jedno ťuknutí na „Přepočítat" je
dopočítá. Fotky v záloze naopak zůstávají — ty nahradit nejdou.

Než přidáš do `store` nové pole, zeptej se, jestli je to zápis uživatele,
nebo výsledek výpočtu. Druhé tam nepatří.

## Debug poznámkovač a složka `debug/`

Nápady, bugy a poznámky se zapisují **přímo v appce za běhu** (kolečko s broukem
v hlavičce, jen se zapnutým `prefs.debugRezim` — na betě a v `npm run dev` ano,
na produkci ne). **V hlavičce jsou tři vývojářská kolečka a řídí je týž
přepínač**: zápis (brouk), zkratka do poznámkovače a červený reset, který
zahodí cache service workeru a načte aplikaci znovu — po nasazení nové verze
totiž servíruje starou z cache a obyčejné obnovení stránky s tím nehne.
`resetujAppku()` v `src/pwa/register.js` **nemaže uživatelská data** a offline
se odmítne, protože by po smazání cache nebylo co načíst. S pěti kolečky se na
úzký telefon nevejde nápis v hlavičce, takže ho `body.debug-rezim` schová. Appka k záznamu přibalí technický kontext, který uživatel
nepíše: obrazovku, filtry, verzi buildu i cache, online/offline, zaplnění
úložiště a posledních 20 zachycených chyb. Záznamy leží v IndexedDB
(`src/core/debugDb.js`, databáze `vandrbuch-debug`; do srpna 2026 v klíči
`vandrbuch:debug`), **do běžné zálohy nepatří** a mají svou vlastní.

**`id` má tvar `tadeas-a7f-014`** — jméno, podpis zařízení, číslo. Ta tři
písmena uprostřed jsou `prefs.debugZarizeni` a vznikla proto, že číslování drží
každé zařízení zvlášť: telefon i počítač téhož člověka vyrobily `tadeas-001` pro
dva různé záznamy a rejstřík je spároval jako jeden. Přejmenování přezdívky
v Nastavení nabídne přečíslovat **jen neodeslané** záznamy — jediná výjimka
z pravidla „`id` se nikdy nemění".

**Barva rámečku říká, co je na mainu.** Šedý = jen tady, okrový = odesláno,
mechový = rejstřík ho zná, terakotový = od odeslání se změnil, ztlumený
mechový = vyřešeno, hliněný = zmizel z repozitáře. Legenda je pod tlačítky
seznamu. Změnu pozná `otiskZaznamu()` v `src/core/debug.js` — osmiznakový
FNV-1a přes všechno, co jde do `.md` **včetně stavu**; uloží se při označení
„odesláno" a porovnává se s dnešní podobou. Vyřešené a změněné jsou navíc
šrafované, každé opačným směrem. **Filtr se prochází podle stadia, ne podle
`stav`** — vlastní stav se dál edituje ve formuláři a jde do `.md`, ale
„hotovo" si nastavuje autor sám, kdežto o vyřešení rozhoduje repozitář.
Filtr podle části appky byl zrušen. Rejstřík by na porovnání nestačil:
`popis` a `navrh` se v něm krátí na 400 znaků a u vyřešených nenese text
vůbec žádný. Změna se pozná **dvěma cestami**. Přesná je otisk; jenže ten se ukládá až od
srpna 2026, takže záznamy odeslané dřív ho nemají — a to byly v okamžiku vydání
úplně všechny. Druhá cesta proto porovnává přímo s tím, co nese rejstřík
(`sediSRepem()` v `src/core/debugExport.js`), a jakmile obojí sedne,
`dorovnejOtisky()` otisk dopočítá a dál rozhoduje ten. Rejstřík nevidí na kroky
ani na „čekal jsem" — nasazuje se veřejně na web — takže tuhle mezeru zavírá až
otisk. Dorovnává se jen to, co s rejstříkem **sedí**: doplnit otisk už rozejitému
záznamu by zmrazilo upravenou podobu jako „odeslanou" a změna by zmizela nadobro.
Úprava odeslaného záznamu se ptá, ale jen když se otisk opravdu rozejde.

Exportují se do jednoho `.md` souboru na export (`debug/RRRR-MM-DD-HHMM-<autor>.md`),
který se commitne a pushne — tím se dostane k oběma lidem i k AI, která si repo čte.
`id` záznamu (`tadeas-014`) **se nikdy nemění a nerecykluje**, stejně jako `id` místa.

**Stav se vrací zpátky do appky.** Build přečte složku `debug/` a přibalí z ní
`dist/debug-stav.json` (`scripts/debug-rejstrik.mjs` + `pluginDebugRejstrik`
ve `vite.config.js`), takže autor v archivu vidí, jestli se jeho hlášení řeší
nebo vyřešilo, a vidí i záznamy toho druhého. Žádný backend, žádný token —
obnovuje se nasazením (na betě každý push na `main`). Je to **jediný soubor
se stabilním jménem, jehož obsah se mezi nasazeními mění**, takže ho service
worker bere sítí napřed; cache-first by servírovala starý stav navždycky.

**Záznam se zavírá příkazem, ne rukou**: `npm run debug-zavri -- <id> <hotovo|zahozeno>
"důvod"` udělá všechny tři kroky naráz (vyhodit z `.md`, přidat řádek do
`debug/VYRESENO.md`, smazat prázdný soubor). Ručně napsaný řádek se špatným tvarem
parser tiše přeskočí a záznam z appky beze stopy zmizí.

**Než na složce začneš pracovat, musí sedět s `main`.** Worker do ní commituje
rovnou přes GitHub API, takže hlášení přibývají i tehdy, když nikdo nic nepushnul,
a zastaralý checkout se pozná jedině dotazem na síť. Hlídají to samy nástroje
(`scripts/debug-cerstvost.mjs`): výpis rejstříku a úklid varují, `debug-zavri`
**odmítne** — je z nich jediný, který zapisuje nevratně. Offline to nikdy neblokuje.

**Export posílá jen nové a změněné.** Rozsah „nevyřešené" do srpna 2026 posílal pokaždé
skoro všechno, takže pět záznamů skončilo ve dvanácti kopiích ve čtyřech souborech.
Duplicity ve složce hlídá `npm run debug-uklid -- --kontrola` a pre-commit hook.
Uzavřené záznamy stárnou z rejstříku ven po 180 dnech — `debug-stav.json` se stahuje
sítí napřed při každém startu a nesmí růst donekonečna. Celý postup pro AI je
v [.claude/rules/debug.md](.claude/rules/debug.md).

Návody pro člověka: [README.md](README.md), schéma dat [src/data/schema.md](src/data/schema.md),
výklad vzhledu [VZHLED.md](VZHLED.md).

## Git workflow (autonomní, bez PR)

Na repozitáři pracují dva lidé, každý ve vlastní session Claude Code, oba přes AI
coding asistenta. **AI dělá commity, merge i push do `main` plně sama, bez ptaní
a bez Pull Requestů** — tahle sekce popisuje jak, aby to bylo bezpečné i bez lidské
kontroly každého kroku.

- Nikdy nepracuj přímo na `main`. Vždy na osobní trvalé větvi `<prefix>/work`, kde
  `<prefix>` načti z `CLAUDE.local.md`. Pokud `CLAUDE.local.md` nebo prefix chybí,
  zeptej se uživatele jednou a ulož ho tam.
- Commituj a pushuj na osobní větev průběžně, bez ptaní.
- **Před triáží hlášení a před zavíráním debug záznamů si dohoň `main`**
  (`git fetch origin && git merge origin/main`). Do složky `debug/` commituje
  poznámky Cloudflare Worker rovnou přes GitHub API, takže se mění i tehdy, když
  nikdo nic nepushnul. Nástroje nad `debug/` si to hlídají samy — viz
  [.claude/rules/debug.md](.claude/rules/debug.md).
- Než sloučíš svou větev do `main`, VŽDY v tomto pořadí:
  a) `git fetch origin`
  b) smerguj/rebase aktuální `main` do své osobní větve jako první (konflikty
     řeš tady, ne až v `main`)
  c) konflikty řeš podle nejlepšího úsudku; u `src/data/places.json` slučuj po
     jednotlivých záznamech (podle ID), nikdy jako čistý textový diff velkého
     JSON souboru; každé netriviální rozhodnutí u konfliktu popiš v commit zprávě
  d) spusť existující kontrolní skripty (`npm run smoke`, `check-filters`, `check-regrese`,
     `check-images`, `perf` – podle toho, co v repu existuje). Pokud cokoliv selže,
     NEPOKRAČUJ do `main`, oprav to nebo nahlas problém.
  e) vytvoř bezpečnostní tag na aktuálním `main` před mergem, formát:
     `backup/main-YYYYMMDD-HHmm`
  f) slouč osobní větev do `main` a rovnou pushni `main`. Bez Pull Requestu,
     bez čekání na potvrzení.
- Nikdy force-push do `main`, nikdy nepřepisuj historii `main`.
- Pokud si nejsi jistá/jistý správností mergů a testy neprochází, zastav se a jasně
  napiš, co selhalo — nepushuj rozbitý kód, i když jinak pracuješ bez ptaní.

Doplňkově, ať ke konfliktům dochází co nejméně:

- **`src/data/places.json` je nejpravděpodobnější místo konfliktu** — jeden 780kB
  soubor. Při souběžné práci přidávej nová místa přednostně do
  `src/data/places-nova.json` (přihrádka, viz
  [.claude/rules/database.md](.claude/rules/database.md)) a slučuj (`npm run slouc`)
  až když je jistota, že s daty zrovna nikdo jiný nepracuje.
- V konfliktu v JSON nikdy „vzít moje"/„vzít jeho" naslepo — ověřit, že se nesmazalo
  cizí místo nebo poznámka.

## Nasazení na produkci (`production`)

Od srpna 2026 appka běží na **dvou** Cloudflare projektech: `traveler-app-beta`
sleduje `main` kontinuálně (každý push nasadí novou verzi automaticky — proto
je `main` jen beta, ne ostrá appka), `traveler-app` sleduje samostatnou větev
**`production`**, kterou nikdo netlačí automaticky.

- **Nikdy neposouvej `production` jako součást běžného „pushni to na main".**
  Merge do `production` dělej JEN na výslovné vyžádání uživatele („nasaď na
  produkci", „pushni betu do produkce", „vydej to ostrým uživatelům" apod.).
- Postup, když je vyžádáno:
  a) `git fetch origin`
  b) `git checkout production && git merge origin/production` (pro jistotu,
     kdyby ho mezitím posunul někdo jiný)
  c) `git merge main` — konflikty řeš stejně opatrně jako při mergi do `main`
     (žádné „vzít moje/jeho" naslepo u `places.json`)
  d) spusť kontrolní skripty (`npm run smoke`, `check-filters`, `check-regrese`,
     `check-images`, `perf` – podle toho, co v repu existuje). Pokud cokoliv
     selže, NEPOKRAČUJ, oprav to nebo nahlas problém.
  e) vytvoř bezpečnostní tag na aktuálním `production` před mergem, formát:
     `backup/production-YYYYMMDD-HHmm`
  f) pushni `production`. Bez Pull Requestu, bez čekání na potvrzení (jakmile
     je vyžádáno, provádíš to samostatně jako u `main`).
- Nikdy force-push do `production`, nikdy nepřepisuj jeho historii.
- Repozitáři nechybí branch protection na `production` na GitHubu — spoléhá se
  čistě na tohle pravidlo v `CLAUDE.md` (stejně jako u `main`).

## Rozvržení podle předloh (srpen 2026)

Druhé kolo redesignu přestavělo rozvržení všech obrazovek podle mockupů ve složce
`grafika/`. **Každá obrazovka odpovídá na jednu otázku** a to určuje, co na ní smí být:
Domů „co dnes", Mapa „kde to je", Objevuj „nevím, kam chci", Seznam „vím, co chci",
Plán „jak to pojedeme" (karty Na cestě · Výpravy · Itinerář), Profil „kdo jsem a co mám
za sebou", Nastavení „jak to má fungovat".

Obrazovky se skládají z jedenácti společných dílů ve `src/components/vzory.js`
(hero pás, popisek sekce, řádek, karusel, dlaždice, pilulky, segment, panel statistik,
řada čísel, stavová pilulka, ikonové tlačítko). **Nové obrazovky skládej z nich**, ne
z vlastního HTML — kdyby si je psala každá zvlášť, do měsíce by se rozešly.

Co se kam přestěhovalo a proč, je v [VZHLED.md](VZHLED.md) v části
„Rozvržení podle předloh". Nejdůležitější pro práci s kódem:

- **Profil × Nastavení.** Profil odpovídá na „kdo jsem a co mám za sebou" — avatar,
  jméno, pruh a čísla. Nastavení na „jak to má fungovat" — vzhled, offline mapa,
  zálohy, CSV, místo v telefonu, zdroje dat. Otevírají se dvěma kolečky vpravo
  nahoře, zleva profil a nastavení. Obsah Nastavení je **staticky v `index.html`**,
  protože se na něj věší obsluha při startu; `renderNastaveni()` obnovuje jen
  živé části (`#nastaveniInner`, stav mapy, datum zálohy).
- **Statické lišty patří do `index.html`**, ne do `render*()`. Prvky s obsluhou navěšenou
  při startu (`#q`, `#qMapa`, `#fReg`, `#planNav`, `#expBtn`, `.motivbtn`, `#csvIn`)
  musí existovat od začátku — překreslení by obsluhu smazalo.
- **Chrome mapy se schovává přes `body[data-tab]`**, ne seznamem `hidden` v JavaScriptu.
- **Karta výpravy je na dvou obrazovkách naráz**, takže má třídy, ne `id`.
  Sbalit se dá jen na Mapě a šipku na to kreslí `views/mapa/mapa.js` až po
  vložení karty — kdyby ji kreslila sdílená `vypravaKarta()`, objevila by se
  i na Domů.
- **Spodek Mapy má dvě nezávislé věci.** Karta výpravy se ukáže jen při prvním
  otevření Mapy (`prefs.vypravaPredstavena`), pak je sbalená v bublině; uložená
  místa jsou vytahovací plát a dole po nich zůstane proužek s počtem. Obojí je
  během používání **jen v paměti** — mapa má po startu vždycky maximum místa.
- **Výpravy** (`store.vypravy`, `store.vypravaNazev`, složky `store.slozky`
  a `store.vypravaSlozka`) fungují stejně jako dny: přidat vedle, nikdy
  nepřepisovat, žádná migrace. Hlídá to `npm run check-dny`.
- **„Rozdělit na dny" (podle hodin/počtu) je smazané** (srpen 2026, na přání) – ruční
  dělení tažením a prázdné dny to pokrývají srozumitelněji. `nastavDny()` v `views/plan/dny.js`
  zůstává jedinou zapisovací cestou a odmítne rozdělení, jehož součet nesedí na počet
  zastávek. **Nula je platná délka dne** – prázdný den se dá založit a je cílem tažení
  i šipek; dřív se zahazoval, takže „Přidat den" bylo od druhého kliknutí tiché nic.

## Plán, cesty a bloky (srpen 2026)

Plán má tři karty: **Na cestě** (probíhající cesta – mini-mapa, odznačování,
pauzy, plánové achievementy, Další cíl + Navigovat + zbývá km), **V plánu**
(knihovna: sbalitelné složky, tažení dlouhým podržením, nastavitelné řazení)
a **Za námi** (ukončené cesty po letech). **Itinerář** není díl segmentu –
je to vnitřek jedné výpravy (dny, zastávky, vlastní body, bloky, Vyjet, dole
čísla výpravy se srovnáním) a **otevírá ho ŤUKNUTÍ na výpravu v knihovně**,
které ji zároveň aktivuje na mapě. Zpátky vedou drobečky nahoře.

**Košík je plovoucí plát, ne obrazovka** – kolečko vpravo dole (jen v Plánu,
na kartách Itinerář a Na cestě) vytáhne plát přes spodek obrazovky a při
otevření do jeho pravého horního rohu doletí. Dny nad ním zůstávají vidět,
protože se z košíku do nich tahá.

- **Akce výpravy jsou JEN v Itineráři** pod „…" (`prepniMenu()`) –
  přejmenovat, duplikovat, do složky, vyprázdnit, smazat. Řádek v knihovně
  žádnou nabídku nemá; do srpna 2026 existovaly obě sady vedle sebe dvěma
  nezávislými kódy.
- **Itinerář neřeší, kde jsme byli.** Fajfka „byli jsme tady" ani ztlumení
  odjeté zastávky tam nejsou – odpovídá na „jak to pojedeme". Odškrtává se
  na kartě Na cestě. `store.stav` se nemění, jen se v Itineráři nečte.
- **Dialogy místo `prompt()`/`confirm()`/`alert()`**: `components/dialog.js`
  (`potvrd`, `zadej`, `vyberZeSeznamu`, `vyberVice`, `vyberDatum`,
  `vyberPocetDni`, `oznam`) – jedna karta nad `#backdrop`, promise, zrušení
  vrací `null`/`false`. Smoke i check-regrese na ně sahají přes `#dialog.show`, ne
  `page.once('dialog')`. **Datum se vybírá z kalendáře, nikdy nepíše** –
  z mřížky se neplatná hodnota vzít nedá.
- **Nové klíče ve `store`**: `cesta` (probíhající, čas se počítá ze začátku
  a pauz, nikde se netiká), `cesty` (archiv, souhrn se počítá při ukončení),
  `bloky` (klíčované názvem výpravy), `achievementy` (získaná id), `slozky`
  (názvy složek v pořadí), `vypravaSlozka` a `vypravaVytvoreno`. Složka i čas
  vzniku jsou pole přímo na záznamu výpravy, ne mapa podle názvu – název je
  křehká identita. Platí „přidat vedle, nikdy nepřepisovat, žádný zápis při startu".
- **Řazení výprav je nastavitelné** (Nastavení → Řazení výprav, `prefs.razeniVyprav`:
  abecedně/nejnovější/největší/bez řazení) a řadí se až při zobrazení – data
  v `store.vypravy` se nikdy nepřeskládávají, `prepniVypravu()` dál dělá výměnu
  na místě. Výpravu jde **duplikovat** (`duplikuj()`, kopíruje i bloky pod nový
  unikátní název). Přejmenování stěhuje bloky (`prejmenuj` ve `vypravy.js`) –
  `store.bloky` klíčuje názvem a bez stěhování by osiřely. Fantomová prázdná
  bezejmenná výprava se v seznamech nevypisuje, dokud žádná jiná není;
  Itinerář ji ale dál edituje a první zastávkou se zhmotní.
- **Cesta se za jízdy MĚNÍ** (srpen 2026). `zastavky` byl do teď zmrazený
  otisk z okamžiku vyjetí – plán šlo upravovat, cestu ne. Jenže právě to se
  na roadtripu dělá: večer se něco přidá z košíku a něco vynechá. Nové pole
  `puvodni` drží, jak to bylo naplánované, takže se při ukončení dá zeptat,
  jestli změny promítnout zpátky do plánu; archiv ukládá obojí. **`store.plan`
  se za jízdy nemění** – plán je „jak jsme to chtěli", cesta „jak to fakt
  bylo". Vynechaná zastávka se vrací do košíku.
- **Trasa cesty vede i přes vlastní body** – start, nocleh, cíl. Do srpna
  2026 je otisk vynechával na třech místech naráz (mapa, routing, mini-mapa),
  takže čára vedla mimo místa, přes která se jede. Viz `BUGS.md` B5. Bloky
  cesty se čtou pod `store.cesta.nazev`, ne pod aktivní výpravou.
- **Domů a Mapa se za jízdy ptají jinak.** `vypravaKarta()` pozná `jedeSe()`
  a nakreslí kartu cesty (další cíl, průběh, čas), ne plán otevřený
  v Itineráři. Čísla jdou z `cesta.odznacene`, ne ze `store.stav` – to je
  „byli jsme tam někdy", ne „projeli jsme to na téhle cestě".
- **Achievementy**: definice je datová, uložená jsou jen id získaných.
  Id se NIKDY nemění – stejné pravidlo jako u id míst. Profilové v Profilu,
  plánové generuje `planoveAchievementy()` (vždy aspoň 20 na plán).
- **Body trasy** (blok typu `misto`, druh start/nocleh/cíl/vlastní) jsou
  plnohodnotné body itineráře, ne jen poznámka s GPS: kotví se polem `po`
  (id zastávky, hned ZA kterou stojí; `po: null` + `den: d` = začátek dne d;
  obojí null = konec plánu, historické chování) a táhnou se stejně jako
  zastávky. Poloha čtyřmi cestami – vložený text, adresa přes Nominatim
  (jediné síťové volání za běhu, jen online), ruční GPS, ťuknutí do mapy.
  `map/planLine.js` je řadí podle `po`/`den` a kreslí znakem podle druhu.
- **Datová logika bloků je v `views/plan/body.js`**, ne v `bloky.js` – ten
  neimportuje `IC`/`icons/sprite.js` (čte `sprite.svg?raw`, Vite syntaxe, kterou
  čistý Node neumí), takže `rozpoznejSouradnice()` a `pridejBod()` jde testovat
  v `check-dny.mjs` bez prohlížeče. `bloky.js` z něj čerpá a přidává vykreslení.
  **Stejně je rozdělená cesta**: `cestaData.js` (data) a `cesta.js` (vzhled,
  reexportuje datovou vrstvu). Ze stejného důvodu bydlí `sklonuj()`
  v `core/html.js`, ne v `plan.js` – ten veze obrázky kategorií (`.webp`).
- **Pořadí trasy se počítá na JEDNOM místě** – `serazenePolozky()` v `body.js`
  vrací zastávky i body s typem a dnem; `serazenaTrasa()` je jen její
  mapování na souřadnice pro routing. Třetí parametr je **seznam bodů**, ne
  přepínač: karta Na cestě potřebuje bloky pod názvem cesty.
- **Košík umí i vlastní body.** Blok typu `misto` smí mít `vKosiku: 1` a jeho
  `id` být ve `store.kosik`; pozná se tím, že ho `S.byId` nezná. Do trasy
  nepatří (`vsechnyBody()` ho filtruje), dokud se nepřesune do dne.
- **Ukončenou cestu jde smazat, a jen z Itineráře** (N16, srpen 2026) – tlačítko
  vedle „Odemknout poznámky" v zamčené kartě, s potvrzením. Řádek v archivu
  nabídku nemá, stejně jako řádek výpravy v knihovně: akce patří dovnitř, ne
  do seznamu. Smazání nuluje `S.otevrenaCesta` (index do `CESTY` se posunul)
  a pouští `uklidTrasy()`; **získané achievementy zůstávají** – smazání cesty
  není popření, že se jela.
- **Ukončené cesty žijí v knihovně Výprav**, ne na kartě Na cestě: sekce po
  letech (`archiv.js`), řádek se zámkem. Ťuknutí cestu AKTIVUJE NA MAPĚ přes
  `S.otevrenaCesta` (index do `store.cesty`, jen v paměti) – přesně jako
  výpravu, jen z ní nejde vyjet. Po přepnutí na Itinerář se ukáže v zamčeném
  režimu: trasa/dny/časy napořád zamčené, „Odemknout poznámky" zpřístupní
  jen poznámku cesty a poznámky zastávek. Aktivace jiné výpravy (nebo
  otevření jejího itineráře) `S.otevrenaCesta` zase nuluje.
- **Mapa umí dvě služby pro views**: `vyberBod(cb)` (ťuknutí → souřadnice)
  a `zapniVyberMist(cb)` (košík špendlíků → nová výprava přes „+" na mapě).
- **Testovací úklid ve smoke**: localStorage se nesmí čistit přepsáním –
  aplikace při odchodu ze stránky dopisuje store z paměti (pagehide → save())
  a přepsaný záznam vrátí. Uklízí se přes UI, nebo až po reloadu.

## Známé vlastnosti (neopravovat bez vyžádání)

- **`esc()` v `src/core/html.js` ošetřuje jen `&` a `<`**, ne `>` ani uvozovky, přestože se
  používá i uvnitř atributů. Je to doslovný přepis původní funkce. „Oprava" na plné ošetření
  by změnila výstup na obrazovce.
- **Kolekce `psi` nemá dlaždici** v Objevuj — 7 míst ji v `col` má, ale `COLL` v
  `collections.js` má jen 11 definic (N5).
- **Osm `id` má před číslicemi dvě pomlčky** (`…-to-je--057`). Slug se uřízl na pomlčce,
  kontrola to připouští, není to chyba.
- **Přepínač podkladu mapy**: výchozí je online mapa z OpenStreetMap, malovaná mapa
  je offline varianta (`prefs.podklad`, pilulka vlevo nahoře). Plochy zemí leží pod
  dlaždicemi i online, aby bez signálu nevznikla díra.
- **Offline mapa má dvě cesty kreslení a to je schválně.** Když je stažený balík
  `mapa-evropa.vbm`, prohlížeč umí WebGL a v Nastavení je zvolená malovaná, kreslí
  ji MapLibre z vektorových dlaždic (lesy, louky, pole, voda, silnice a kresby
  krajiny). Jinak nastoupí zjednodušená: plátno s obrysy z `basemap.json`, města
  a reliéf. Funguje vždycky — bez WebGL, bez stažené mapy i v jednosouborové
  variantě. Rozcestník je v `map/podklad.js`.
- **Kresby stromů a hor nejsou prvky stránky.** Do srpna 2026 to bylo sto deset
  Leafletových značek s CSS filtrem, které prohlížeč překresloval při každém posunu.
  Dnes je kreslí MapLibre jako symboly na GPU a **jen se staženou mapou**. Bez
  stažení tam kresby nejsou vůbec, a je to tak správně.
- **Kresby se mají překrývat.** `icon-allow-overlap: true` a
  `symbol-z-order: 'viewport-y'` v `map/vektory.js` — bez toho MapLibre zahazuje
  všechno, co se dotýká, a z lesa je řídká síť oddělených stromů. Vypnuté srážky
  jsou navíc levnější. `symbol-sort-key` se nesmí vrátit: přebil by `viewport-y`.
- **Kde kresby stojí, není seznam, ale maska.** `src/assets/kresby-lesy.png`
  a `kresby-hory.png` — obrázek, kde buňka (~3 km) nese druh porostu nebo hřebene.
  Body se z ní sypou až v prohlížeči podle přiblížení a volby v Nastavení
  (`map/kresby.js`), takže hustotu neurčují data. Seznam by při téhle hustotě
  vážil přes deset megabajtů, maska váží dvě stě kilobajtů.
- **Hustota kreseb je v Nastavení** (`prefs.kresby`: vypnuté, střídmé, husté;
  výchozí husté). Mění jen cílovou rozteč, takže je to okamžité.
- **Stínování terénu je jeden obrázek** (`src/assets/relief-evropa.webp`, ~1 MB)
  přes `L.ImageOverlay`, ne vrstva MapLibre — díky tomu ho má i zjednodušená mapa.
  Do jednosouborové varianty se nebalí. Vyrábí ho `scripts/make-relief.mjs`.
- **Balík mapy má značku `VBM2`.** Starší `VBM1` aplikace odmítne a Nastavení
  napíše, že je zastaralá. Bez toho by mapa tiše spadla na obrysy.
- **Do předukládané cache nejde nic kolem stažené mapy.** Balík `.vbm` (3,7 MB) se
  stahuje na vyžádání z Nastavení do IndexedDB (`core/mapaDb.js`, vlastní databáze
  `vandrbuch-mapa`, ne ta s fotkami). Z bundle navíc vypadává MapLibre, 120 kreseb
  a souřadnice lesů a hor — přes 4 MB, které jsou k ničemu každému, kdo si mapu
  nestáhne. Neztratí se: service worker od srpna 2026 **ukládá i to, co se stáhne
  až za běhu**. Filtr je v `vite.config.js` podle jména souboru a hlídá ho `smoke`.
- **318 míst nemá `img`** a zobrazuje se u nich akvarel podle kategorie
  (`src/assets/kategorie/`); kreslená pohlednice z `postcard.js` zůstává pod ním jako
  záchrana, když se obrázek nenačte. Je to záměr, ne nedodělek — fotky nedoplňuj náhodně.
- **Záloha nese `prio`, `planDny`, `vypravy`, `vypravaNazev` a od srpna 2026
  i `cesta`, `cesty`, `bloky`, `achievementy`, `slozky`, `vypravaSlozka`,
  `ulozenePozice` a `aktivniPrepocet`**. Staré zálohy tyhle klíče nemají
  a obnova je přeskočí; rozjetou cestu v telefonu obnova nepřepíše a archiv
  slučuje podle času vyjetí.
- **Badge u filtrů nepočítá filtr `fire`** („Musíme!") (N1). Nové filtry `ulozene`
  a `vPlanu` se do něj naopak počítají.
- **Výplně ikon nejdou přes CSS.** Ikony se vkládají jako `<use>` a do stromu instance
  selektor z dokumentu nedosáhne, takže `svg.ic .f{fill:currentColor}` v `base.css` se
  nikdy neuplatní. Výplň se musí psát jako **atribut** do `sprite.svg` — tak to má
  `i-fire` a `i-star`. Zbylých 43 ikon s třídou `.f` kreslí jen obrys, stejně jako
  v původní aplikaci. Podrobně ve `VZHLED.md`.
- **Barvu ikony na tmavé ploše určuje `stroke`, ne `color`.** `color` se u ikon
  uplatní jen na vyplněné části. Kdo dá ikonu na mechovou nebo okrovou plochu, musí
  napsat obojí — jinak si vezme `--ink`, který se s režimem převrací.
- Všech 8 parkovišť má `transitStatus: "verified"`; zbylé tři stavy aplikace umí zobrazit,
  jen se zatím nepoužily.
- `renderList()` kreslí maximálně 250 karet a vypíše „Zobrazeno prvních 250". Není to
  virtualizace (N10).

> Tenhle soubor má dvojče v `../CLAUDE.md` (Claude Code se často spouští z nadřazené složky).
> **Každá změna pravidel musí do obou.** Tenhle je ten commitovaný a závazný pro tým.
