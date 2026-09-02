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
  `vandrbuch-trasy`, `vandrbuch-cesty`, `vandrbuch-debug` a `vandrbuch-pocasi`).
  Jsou v nich všechna uživatelská data
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
npm run preview          # prohlédnutí sestaveného webu

npm run validate         # kontrola dat míst; běží i sama v pre-commit hooku
npm run slouc            # vysype places-nova.json do places.json a přepočítá okolí
npm run check-uloziste   # že se poznámky neztratí, když dojde místo, 36 kontrol
npm run check-debug      # debug poznámkovač: identita, otisk, rejstřík, složka debug/, 199 bodů
npm run check-worker     # že Worker nepustí dál, co nemá, 48 bodů
npm run debug-uklid      # duplicity a zavřené záznamy ze složky debug/ ven
npm run debug-zavri      # uzavře záznam: -- <id> <hotovo|zahozeno> "důvod"

npm run smoke            # proklikání v prohlížeči, 546 kontrol
npm run check-regrese    # PWA, zálohy, fotky, poloha, service worker, 26 bodů
npm run check-tokeny     # barvy natvrdo, párování světlý/tmavý, kontrast, 7 bodů
npm run check-dny        # dny, výpravy, body trasy, okno dnů, úseky trasy, 250 bodů
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
  mapu do telefonu opravdu stáhne.

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
- Ikony jsou symboly v `src/icons/sprite.svg` (74 kusů), jmenují se `i-neco`, vkládají se `IC('i-van')`.

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

**Pilulka filtru je vypínač, ne přepínač** (`tadeas-f32-019`). Do srpna 2026 se
z každé řady vybírala právě jedna věc a řada začínala pilulkou „Vše", takže
nešlo říct „nápady a bugy, ale ne poznámky". Dnes svítí všechny a zhasnutá
schová své záznamy; pilulka „Vše" tím ztratila smysl, protože všechno
rozsvícené **je** výchozí stav. `F` ve `views/debug/debug.js` proto drží
**zhasnuté** volby: prázdná množina znamená „svítí všechno" a nový typ nebo
stadium se tak objeví samo od sebe, místo aby bylo tiše zhasnuté. Zhasnout jde
i celá řada — seznam pak zůstane prázdný a napíše proč. **Mazání se přestěhovalo
až za blok Export**, protože nejnebezpečnější tlačítko obrazovky nemá být první,
na co palec sáhne.

**Zavřený záznam se v „Moje" smrskne** na nadpis a štítek `✓ hotovo · 14. 8.`,
stejně jako odbytý řádek v „Od ostatních" — úryvek textu ani štítek priority se
nekreslí. Tam to nebylo rozhodnutí, ale náhoda: rejstřík u vyřešených nenese
text ani prioritu, takže cizí řádek nemá co kreslit. Tady se to dělá schválně.
Zavřené je to, co má `stav` hotovo/zahozeno **nebo** co zavřel repozitář;
**repozitář přebíjí vlastní stav**, protože je to jediná z těch dvou odpovědí,
která má datum. Ťuknutí řádek rozbalí a text je zase celý vidět. V rozbaleném
navíc stojí **proč se to zavřelo** — `zavreno.poznamka` se ukládala odjakživa,
ale ukazovala se jen v `title=`, tedy jako bublina, kterou na telefonu nikdo
neuvidí. Datum i důvod čte `uzavreni()` **z vlastní paměti napřed** a z rejstříku
až jako ze zálohy: uzavřené záznamy z rejstříku po 180 dnech vypadnou a
`stitekZRepa()`, která se do té doby ptala jen jeho, pak o vyřešeném záznamu
tvrdila „zmizelo z repozitáře", zatímco rámeček vedle říkal „vyřešené".

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
- **Dlouhá trasa se do jednoho dotazu nevejde a dělí se na úseky.** Routing
  API Mapy.com bere nejvýš **patnáct waypointů, tedy sedmnáct bodů**; osmnáctý
  vrátí 422 (`ensure this value has at most 15 items`). Jedenáctidenní výprava
  se sedmnácti místy a dvěma noclehy jich má devatenáct — trasa totiž vede
  i přes vlastní body — a přepočet se na tom lámal.
  `rozdelNaUseky()` ve `views/plan/routing.js` proto posílá **po devíti
  bodech**, sousední úseky **sdílejí hraniční bod** (jinak by mezi nimi
  zůstala díra) a `spojUseky()` je slepí a sečte kilometry i čas.
  **Devět, ne sedmnáct, a to kvůli spolehlivosti, ne rychlosti** — změřeno na
  trase o 18 166 km, kde je celkový čas skoro stejný, ať se dělí jakkoli
  (řídí ho délka trasy), ale jeden sedmnáctibodový kus přes půl Evropy API
  nezvládne a vrací 503. Vzdálenost sama strop nemá: Barcelona → Albánie →
  Praha na tři body projde.
- **Čára se před uložením zjednodušuje** (`zjednodusCaru()`, Douglas–Peucker,
  tolerance 0,0002° ≈ dvacet metrů). Bez toho měla ta trasa **304 504 bodů
  a 6 372 kB**, které by šly do IndexedDB a odtud do `L.polyline`, kterou
  prohlížeč promítá při každém posunu mapy. Se zjednodušením **32 851 bodů
  a 624 kB**. Vzdálenost ani čas se tím nemění — ty vrací API zvlášť.
- **Časový strop je na úsek, ne na celý přepočet** (20 s × počet úseků).
  Změřeno: nejdelší úsek té trasy odpovídal 12,9 s, takže deset vteřin
  nestačilo ani na jeden a přepočet hlásil „vypršel" dřív, než mohl doběhnout.
  Protože se u dlouhé výpravy čeká přes dvacet vteřin a toast zhasne po dvou,
  hlásí se **průběh** („Počítám trasu… (2/3)") — jen když se trasa dělí.
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
  zastávky. Poloha čtyřmi cestami – vložený text, adresa přes Nominatim,
  ruční GPS, ťuknutí do mapy.
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
- **Plát „Přidat zastávku" se po přidání NEZAVÍRÁ** (srpen 2026). Do té doby zmizel hned po prvním výběru, takže pět zastávek znamenalo
  pětkrát projít tutéž cestu. Přidané místo ze seznamu **nemizí, jen zšedne**
  a dostane pilulku „Přidáno" – kdyby se odfiltrovalo, seznam by se pod prstem
  posunul o řádek a druhé ťuknutí by trefilo něco jiného. Do počtu „míst mimo
  plán" se přidaná nepočítají a vedle stojí „2 přidaná". Druhé ťuknutí na
  přidané nedělá nic: pilulka říká „Přidáno", ne „Odebrat".
- **Na jméno bodu se ptá jen u vlastního** (srpen 2026).
  U start/nocleh/cíl byla předvolba použitelné slovo, takže se dialog ptal na
  něco, co appka právě dostala předchozím dotykem. U vlastního je předvolbou
  „Vlastní místo", což nikdo nenechá. Jméno jde kdykoli změnit v kartě bodu
  a nikde neslouží jako identita – body se kotví přes `id`.
- **Kolik bodů má která výprava, se dá přečíst v Nastavení → Vývoj**
  (`bodyNaVypravu()` ve `views/plan/body.js`). Je to **čisté čtení
  `store.bloky`** – žádný nový klíč, žádná migrace, nic do zálohy. Bydlí to
  v `body.js`, aby byl filtr týž jako u `vsechnyBody()`. **Medián se počítá
  jen z výprav, které aspoň jeden bod mají**, a vedle něj stojí jejich počet;
  ze všech výprav by ho pár prázdných stáhlo na nulu přesně tam, kde se ptáme,
  jestli bodů není moc.
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

## Počasí (srpen 2026)

**Předpověď u tvé polohy na Domů**, hned pod kartou výpravy: 24 hodin ve
vodorovném pruhu a 7 dní pod ním. Data z **Open-Meteo — bez účtu a bez API
klíče**, což je jediný důvod, proč to jde ve statické appce z veřejného
repozitáře. Je to **třetí síťové volání za běhu** vedle Nominatimu a přepočtu
trasy přes Mapy.com.

- **Appka si o polohu řekne sama hned při startu** (`prefs.polohaPriStartu`,
  výchozí zapnuto, přepínač v Nastavení → Mapa). Do srpna 2026 se neptala
  nikdy: bylo to psané pro cizího návštěvníka veřejné bety, pro kterého je
  systémový dotaz přepadení. Pro toho, kdo appku používá na cestách, platí
  opak — povolení se dá jednou a od té chvíle je dotaz neviditelný, kdežto
  ťukat na „Ukázat počasí u mě" se muselo po každém spuštění. **Napoprvé se
  čeká, až se zavře úvodní průvodce** (`uvodZavren`); dotaz nad uvítací
  obrazovkou by to přepadení byl. Je to **tiché v obou směrech**
  (`zjistiPolohuTise()` v `core/geo.js`): při odmítnutí se nic nestane a na
  Domů zůstane tlačítko „Ukázat počasí u mě", které si o polohu řekne samo
  a s vysvětlením. Vypnutá volba se **nezeptá vůbec** — hlídá to `smoke`
  počítáním volání `getCurrentPosition`.
- **Vypnuté počasí nesáhne na síť vůbec** (`prefs.pocasi`), ne že se jen
  neukáže. Na roamingu je to jediná jistota a hlídá to `smoke` počítáním
  dotazů na Open-Meteo.
- **Stažené leží v IndexedDB** (`src/core/pocasiDb.js`, databáze
  `vandrbuch-pocasi`) — je to dotažené z API, takže do `vandrbuch:v1` ani do
  zálohy nepatří. Klíč nese souřadnice **i jednotky**: uložená předpověď ve
  stupních Celsia se nesmí ukázat s popiskem ve Fahrenheitech.
- **Čerstvost je nastavitelná** (30 minut · hodina · 3 hodiny, výchozí hodina).
  Bez signálu se ukáže poslední stažená i s tím, kdy se stáhla — prázdno nikdy.
- Volba **„jen na wifi" pozná jen Android**; `navigator.connection` v Safari
  neexistuje, takže se tam chová jako vypnutá. Je to napsané u přepínače.
- **Odkud předpověď je, se počítá lokálně.** Vedle nadpisu stojí nejbližší
  město a vzdálenost („Bolzano · 44 km"), spočítané z 985 měst v
  `src/data/mesta.json`. Ten soubor je v předukládané cache, takže to funguje
  i bez signálu — reverzní geokódování by bylo čtvrté síťové volání za běhu
  a mlčelo by přesně tam, kde se člověk ptá nejčastěji.
- **Pruh hodin má předěl dne.** Zítřejší dlaždice mají tmavší plochu a na
  hranici stojí svislý popisek; pod pruhem je vlastní posouvač, protože
  systémový je na mobilu schovaný a bez něj není poznat, kde se člověk
  v těch 24 hodinách pohybuje.
- **Na každé hodině je procento i milimetry, včetně nul.** Do srpna 2026 se
  milimetry kreslily jen když opravdu něco spadlo, kdežto procento i nulové —
  a protože v běžné předpovědi prší dvě tři hodiny z dvaceti čtyř a bývají na
  konci pruhu, vypadalo množství srážek jako chybějící údaj. Nula je platná
  odpověď na „kolik naprší"; zvýrazněné (`.prsi`) jsou jen hodiny, kdy opravdu
  prší, takže barevné zůstává jen to, co má člověk hledat. Díky tomu mají
  navíc všechny dlaždice stejně řádků a pruh se nezubatí.
- Kódy počasí překládá `pocasiPodleKodu()` ve `views/plan/termin.js`. Do srpna
  2026 vracela za oblačno **list** (`i-leaf`), protože sprite mrak neměl —
  přibyly `i-mrak`, `i-polojasno`, `i-mlha` a `i-mrholeni`, odvozené z `i-rain`
  a `i-sun`, aby seděly do sady.

**Počasí „na cestě" je od září 2026** (`tadeas-f32-010`). Vedle nadpisu je
**jedno tlačítko** (`prefs.pocasiRezim`) a nese popisek **běžícího** režimu —
vedle nadpisu se to čte jako „Počasí · u tebe". Ikona není šipka doprava: ta
slibuje odchod jinam, kdežto tenhle knoflík přepne obsah na místě.

- **Hodinový pruh je v OBOU režimech** a je vždycky u tvé polohy. Odpovídá na
  „prší tady teď", což je otázka o tom, kde stojíš, ne kde budeš. Kreslí ho
  `pocasiHodinyHtml()` — vytažená z `pocasiHtml()` právě proto, aby ji volaly
  oba režimy a markup s předělem dne existoval jednou. **Při vydání v září
  2026 v režimu „na cestě" chyběl úplně**: „nemění se s režimem" jsem
  napsal jako „není tam".
- **Nejbližší město je pod pruhem hodin**, ne v nadpisu — tam sedí přepínač
  a město patří k hodinám, které popisuje.
- **Den je skupina s hlavičkou.** Nahoře stojí jednou datum, číslo dne výpravy
  („DNES · 2. DEN") a vpravo východ se západem slunce; pod tím karta za každou
  zastávku. Datum a číslo dne spolu schválně: počasí mluvilo v datech
  a itinerář v číslech dnů, takže se ty dvě obrazovky nedaly číst dohromady.
  **Dnešek má akcentní proužek** — ze všech dnů je jediný, kvůli kterému se
  člověk dívá hned teď.
- **Rámuje se jen skupina karet, ne hlavička** — datum je nadpis skupiny, ne
  její součást — a plocha je táž (`--plocha`) jako u dne s jedinou zastávkou.
  Že karty patří k sobě, drží společná plocha a vlasové linky mezi nimi, ne
  jiná barva.
- **Karta místa má tři sloupce**: vlevo ikona počasí přes obě řádky, uprostřed
  název místa nad drobným řádkem s počasím, vpravo teploty pod sebou. Do září
  2026 to byly dva široké řádky, z nichž horní byl z 93 % plný a spodní nesl
  jen název — u „Nocleh 1" tedy pětinu šířky. Karta je díky tomu 48 px místo 67.
- **Slunce je v hlavičce dne, ne v kartě.** Je to údaj o dni: tři body jednoho
  dne se v časech liší o minuty a pod sebou to byl jen šum. Bere se **rozsah** —
  nejdřívější východ a nejpozdější západ ze zastávek dne — takže pro jedinou
  zastávku je to přesně její hodnota. Uvolněné místo dostaly milimetry a vítr.
- **V kartě stojí i kolik naprší a jak fouká** (`precipitation_sum`,
  `wind_speed_10m_max`) — **týmž dotazem**, žádné volání navíc. Do té doby
  u dne stálo jen procento, tedy „jak pravděpodobně" bez „kolik", přesně ta
  asymetrie, kvůli které se do pruhu hodin doplňovaly milimetry.
  **Nula se kreslí** u obojího; chybějící údaj vypadá jako porucha a mizející
  prvek by rozhoupal šířku. Předpovědi uložené dřív ta pole nemají, takže se
  u nich prostě nenakreslí. **Jednotky nese odpověď** (`daily_units`), ne kód —
  s předvolbou Fahrenheita chodí palce a míle.
- **Řádek bez předpovědi nemá ikonu počasí** — do září 2026 tam svítila
  `i-mlha`, takže „bez předpovědi" vypadalo jako předpověď na mlhu.
- **Ukazují se jen dny, na které předpověď dosáhne** — dnešek až dnešek + 13.
  Dozadu proto, že `forecast_days` začíná dneškem: kdo vyjel včera, měl u prvního
  dne „Zatím bez předpovědi", což je lež (nepřijde nikdy), a po týdnu na cestě
  se jich nad dneškem nakupilo dvacet. Dopředu proto, že dál API nedohlédne
  a čtrnáct prázdných řádků nic neřekne. **Číslo dne zůstává původní**, takže
  z „3. DEN" se nestane „1. DEN". Kolik dnů zbylo za horizontem, stojí v jedné
  větě pod seznamem.
- **Do dne patří i vlastní body trasy** (nocleh, start, cíl) — nocleh je místo,
  kde budeš spát a ráno vstávat, takže je z celého dne nejužitečnější. Pořadí
  se bere ze `serazenePolozky()`, aby se trasa dál řadila na jednom místě;
  bod si veze ikonu svého druhu z registru `DRUHY`.
- **Prázdný seznam má čtyři různé příčiny a každá svou větu** v `title`
  přepínače: chybí termín · výprava nemá zastávky · dny už jsou za námi ·
  výprava začíná dál, než předpověď dohlédne. Jedna věta natvrdo („chybí
  termín") ve třech z nich lhala.
- **Co se nepovedlo, se řekne.** Stará předpověď ze schránky nese nad seznamem
  „Staženo …" stejně jako u tvé polohy — `pocasiProCestu()` na rozdíl od
  `pocasiProBod()` příznak `stare` nenastavovala, takže se včerejší data
  kreslila jako čerstvá. Utnutí stropem 60 bodů bylo do té doby tichý `break`
  a den nad stropem vypadal stejně jako den bez signálu.
- **Přepínač je vyplněná pilulka bez ikony.** Bez pilulky vypadal stejně jako
  „Zobrazit vše" a „Otevřít plán", což jsou odkazy **jinam** — kdežto tenhle
  knoflík mění obsah pod sebou. Ikonu nemá schválně: šipka slibuje odchod
  jinam a kolečko načtení znovu. Třídu dává `akceTrida` ve `vzory.js`,
  prázdná `akceIkona` znamená bez ikony.
- **Den se kopíruje pod sebe za každou zastávku**: tři zastávky = tři bloky
  pod jednou hlavičkou, každý s počasím své oblasti. Blízké se **neslučují**;
  že patří k sobě, ukáže **společné podbarvení skupiny**. Den bez zastávek se
  řídí tvojí polohou.
- **Za jízdy se bere rozjetá cesta** (`store.cesta.zastavky`), jinak plán.
  Ty dvě věci se záměrně liší a počasí má odpovídat na „bude tam, kam
  opravdu mířím, pršet".
- **Den výpravy se počítá KALENDÁŘNĚ a na jednom místě** — `denOdData()`
  v `views/plan/termin.js`. Do září 2026 na tutéž otázku odpovídaly tři různé
  kódy: `kolikatyDenDnes()` kalendářně, kdežto `kolikatyDenCesty()`
  v `cestaData.js` a ještě jednou ručně opsaný výpočet v `cesta.js` dělily
  uplynulý čas 24 hodinami. Kdo vyjel v devět večer, měl druhý den v poledne
  na kartě „NA CESTĚ · 1. DEN", zatímco počasí psalo „dnes" u druhého dne.
  Kalendář vyhrál, protože den výpravy má mít jedno datum — jinak se na něj
  nedá navázat předpověď ani kostra dnů. Opravilo to i „přidat na konec
  dnešního dne" a přehození bodu z košíku.
  **Datum vyjetí se bere z místního času** (`mistniDatum()`), ne přes
  `toISOString()` — ten převádí do UTC, takže odjezd po půlnoci u nás spadl
  na předchozí den a s ním celá výprava.
- **Jeden dotaz na celou výpravu.** `nactiPocasiProBody()` posílá
  `latitude=a,b,c` a dostane pole odpovědí; změřeno proti živému API, že
  40 bodů na 14 dní je 29,7 kB a 196 ms. Body, které schránka zná a jsou
  čerstvé, se do dotazu vůbec nedávají. Strop je 60 různých bodů.
- Ukazuje se **nejvýš 14 dní** — Open-Meteo umí šestnáct, ale poslední třetina
  je věštění.

Zbytek hlášení `pc-tadeas-001` (dny v Itineráři, detail místa, karta Na cestě
a klimatické normály) je zapsaný v [NAPADY.md](NAPADY.md) jako N19 a N20
i s tím, co je už rozhodnuté.

## Skládání obrazovky Domů (srpen 2026)

**Domů si každý poskládá sám** — Nastavení → Domů má tabulku sedmi sekcí
s šipkami a okem (hlášení `tadeas-f32-009`). Pořadí i zhasnuté sekce jsou
v `prefs.domuPoradi` a `prefs.domuSkryte`, takže jdou do zálohy.

- **Registr je JEDEN a čtou ho dva** — `src/views/home/sekce.js`. Domů z něj
  vykresluje, Nastavení bere názvy a důvody do tabulky. Kdyby si Nastavení
  psalo vlastní seznam, do měsíce by se rozešly.
- **`html()` je funkce, ne řetězec.** `renderHome()` dřív spočítala všechno
  napřed — šest průchodů přes 580 míst — a teprve pak skládala HTML. Takhle
  schovaná sekce nestojí ani ten výpočet.
- **Čtení pořadí musí unést tři věci**, jinak se appka rozbije potichu:
  chybějící předvolba → výchozí; `id`, které v uloženém pořadí není (přibyla
  nová sekce) → **na konec**, ne pryč; `id` dvakrát nebo neznámé → zahodit,
  protože dvakrát vykreslená sekce udělá dvě stejná `id` v DOM a obsluha se
  navěsí jen na první.
- **Pozdrav v hero pásu sekce není** a nezhasíná — je to hlavička obrazovky.
- **Počasí má dva vypínače a je to správně.** Oko v tabulce řídí jen rozvržení
  Domů, hlavní přepínač ve skupině Počasí rozhoduje i o síti. Kdyby oko psalo
  do `prefs.pocasi`, přišel by o počasí i Itinerář, až tam přibude (N19).
  Vypnuté počasí se z Domů **odstraní**, nezůstane po něm prázdný nadpis.
- **Zhasnout jde i všechno** — Domů pak ukáže nápovědu, kde se to zapíná. Bez
  ní vypadá appka rozbitě a je to stav na dvě ťuknutí.
- **Výchozí pořadí musí zůstat dnešní**: `smoke` ověřuje, že za jízdy je první
  sekce „Právě jedeme", a snímky obrazovek že se Domů nezměnila.

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
  a reliéf. Funguje vždycky — bez WebGL i bez stažené mapy. Rozcestník je
  v `map/podklad.js`.
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
  Natahuje se dynamickým importem, ať nezdrží start. Vyrábí ho
  `scripts/make-relief.mjs`.
- **Balík mapy má značku `VBM2`.** Starší `VBM1` aplikace odmítne a Nastavení
  napíše, že je zastaralá. Bez toho by mapa tiše spadla na obrysy.
- **Do předukládané cache nejde nic kolem stažené mapy.** Balík `.vbm` (3,7 MB) se
  stahuje na vyžádání z Nastavení do IndexedDB (`core/mapaDb.js`, vlastní databáze
  `vandrbuch-mapa`, ne ta s fotkami). Z bundle navíc vypadává MapLibre, 120 kreseb
  a souřadnice lesů a hor — přes 4 MB, které jsou k ničemu každému, kdo si mapu
  nestáhne. Neztratí se: service worker od srpna 2026 **ukládá i to, co se stáhne
  až za běhu**. Filtr je v `vite.config.js` podle jména souboru a hlídá ho `smoke`.
- **Mini-mapa se za jízdy nepřestavuje a má zámek.** Živé sledování polohy
  hlásí `zivaProjekce` každé dvě sekundy a `main.js` na to do srpna 2026 volal
  `renderPlan()` — přestavěla se tím celá obrazovka, mini-mapa se zbourala
  a `fitBounds()` vrátil výřez zpátky, takže blikala a posunout si ji nešlo
  (hlášení `tadeas-f32-016`). Mění se přitom jen dva údaje, a ty obnovuje
  `obnovZiveSledovani()` v `plan.js` → `obnovZiveUdaje()` v `cesta.js`:
  řádek „podle polohy zbývá" a značka polohy přes `posunZnackuPolohy()`
  v `dashMapa.js`. **Žádný `fitBounds` při obnově** — výřez se hnout nesmí.
  Změřeno přes `_leaflet_id` kontejneru: 3316 → 5563 za pět sekund před
  opravou, beze změny po ní. **Mapa je navíc zamčená** (`dragging` a spol.
  vypnuté), aby na telefonu nekradla tah místo rolování; odemyká ji zámek
  v pravém horním rohu jako `L.Control`. Odemčení je jen v paměti a `main.js`
  ho při odchodu ze záložky Plán ruší přes `zamkniMapy()` — po načtení je
  vždycky zamčeno (`tadeas-f32-020`).
- **Mapa se na tvoji polohu vycentruje jen jednou za spuštění**
  (`vycentrujPoprve()` v `map/map.js`). Do srpna 2026 se střed nastavil jedině
  tehdy, když poloha dorazila zrovna ve chvíli, kdy byla Mapa otevřená — což
  se s dotazem při startu skoro nikdy netrefí. Podruhé už nedělá nic: kdo si
  prohlíží Alpy a odskočí na Seznam, nemá se po návratu ocitnout doma.
- **318 míst nemá `img`** a zobrazuje se u nich akvarel podle kategorie
  (`src/assets/kategorie/`); kreslená pohlednice z `postcard.js` zůstává pod ním jako
  záchrana, když se obrázek nenačte. Je to záměr, ne nedodělek — fotky nedoplňuj náhodně.
- **Záloha nese `prio`, `planDny`, `vypravy`, `vypravaNazev` a od srpna 2026
  i `cesta`, `cesty`, `bloky`, `achievementy`, `slozky`, `vypravaSlozka`,
  `ulozenePozice` a `aktivniPrepocet`**. Staré zálohy tyhle klíče nemají
  a obnova je přeskočí; rozjetou cestu v telefonu obnova nepřepíše a archiv
  slučuje podle času vyjetí.
- **Nálady jsou kategorie, rychlá inspirace je stav** (`tadeas-f32-011`, září
  2026). Ta dělba je to hlavní: nálada odpovídá na „jaké místo chci" (čtrnáct
  kusů, deset kategorií z `categories.js` plus dvě kombinace a dvě zvláštní),
  inspirace na „co teď dává smysl". Bez ní by na Objevuj stály dvě velké
  mřížky dělající totéž. **Barvy a ikony nálad se berou z `categories.js`**,
  ne vymýšlejí znovu.
  **Které se ukážou, řídí `prefs.nalady`** – výběr je v Profilu ve čtvrté
  sbalitelné skupině. Výchozí je dnešních šest, takže rozšíření nikomu nic
  nepřeskládá; čtení unese chybějící předvolbu, neznámé `id` i `id` dvakrát,
  ale **novou náladu samo nezapíná**. Zhasnout jde všechny – sekce pak
  z Objevuj **zmizí celá**, nezůstane prázdný nadpis. Pilulky jsou mřížka
  o třech sloupcích, ne posouvací pás.
  **Týž výběr řídí i filtr tipů „Co dál?"** na kartě Na cestě
  (`kosikView.js`): se čtrnácti náladami tam bylo dvanáct pilulek v pěti
  řádcích, tedy pětina obrazovky nad samotnými tipy.
- **Rychlá inspirace v Objevuj je osm dlaždic ve mřížce 4×2** (`tadeas-f32-013`,
  září 2026). Dlaždice, na kterou nejsou data, **nezmizí – zašedne, řekne proč
  a je `disabled`**; schovaná by z mřížky udělala díru a na čerstvém profilu
  by svítila jediná. Každá je jen filtr: kolik míst vrátí, se počítá jedním
  způsobem (`visible()` po nastavení), protože dvojí počítání bylo přesně to,
  čím se dřívější tři vady schovaly. **Inspirace filtry NAHRAZUJE, nepřičítá
  se k nim** – stejně jako zkratka na oblast. Jediná výjimka je „Nejblíž
  odsud": ta nefiltruje, ale přepíná **řazení** Seznamu, protože filtr na
  vzdálenost v `F` neexistuje a kvůli jedné dlaždici se nezavádí.
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
