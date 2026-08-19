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

**Vzhled se řídí grafickým manuálem „Golden Moss"** — paleta, Playfair Display, měkké
karty, světlý i tmavý režim. Výklad je ve [VZHLED.md](VZHLED.md), podklady ve složce
`grafika/` (není v repozitáři). Od srpna 2026 se vzhled od původní aplikace **rozchází
záměrně**; `check-css` je proto odstavené a nahradilo ho `check-tokeny`.

## Kritická pravidla

- **`id` místa se nikdy nemění.** Jsou na něj navázané poznámky, hodnocení, priority, plán,
  vyfocené fotky, vazby `nb` z jiných míst i generovaná pohlednice. Překlep v názvu se opravuje
  v poli `n`, `id` zůstává. Viz [.claude/rules/database.md](.claude/rules/database.md).
- **Klíče v úložišti se nemění**: `vandrbuch:v1` (poznámky, hodnocení, plán, dny plánu, priority),
  `vandrbuch:prefs`, `vandrbuch:data` (import CSV) a sklad `fotky` v IndexedDB
  (`src/core/storage.js`, `src/core/fotoDb.js`). Jsou v nich všechna uživatelská data
  a nikde jinde neexistují — změna klíče je tichá ztráta dat. Starý `vandrbuch:photos`
  se při prvním otevření sám přestěhuje do IndexedDB a vyprázdní.
- **Nikdy nezahazuj výsledek ukládání.** `save()`, `savePrefs()`, `ulozFotku()` vracejí
  `false`, když se nepovedlo zapsat, a `store.js` z toho posílá `ulozeniSelhalo`. Právě
  zahozený výsledek dřív způsoboval, že poznámky při plné paměti mizely beze slova.
- **`reference/index-original.html` se needituje.** Je to bajtově shodná kopie původní aplikace
  a měřítko pro `npm run check-data` a `check-handlers`.
  V `.gitattributes` má `-text`, aby ji Git nepřepsal na CRLF.
- **`src/pwa/sw.js` je šablona, ne hotový soubor.** Seznam souborů k uložení do cache a číslo
  verze do ní doplní až `vite.config.js` při buildu (`__PRECACHE__`, `__VERSION__`).
  `dist/sw.js` je generovaný — nikdy ho needituj.
- **`git push` na `main` = nasazení do produkce.** Cloudflare projekt `traveler-app` staví
  a nasazuje každý push automaticky. Commituj volně, **před pushem se vždy zeptej.**
  Na projektu pracují dva lidé — viz „Spolupráce ve dvou" níž, než pushneš do `main`.
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

npm run smoke            # proklikání v prohlížeči, 203 kontrol
npm run smoke:single     # totéž pro single-file variantu, 189 kontrol
npm run parity           # kontrolní seznam z PARITA.md, 26 bodů
npm run check-data       # data 1:1 s původní aplikací
npm run check-tokeny     # barvy natvrdo, párování světlý/tmavý, kontrast, 7 bodů
npm run check-dny        # dny, výpravy, složky, záloha a body trasy, 94 bodů
npm run check-filters    # 134 kombinací filtrů
npm run check-handlers   # napojení tlačítek, 61/61
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
| `reference/` | bajtově shodná kopie původní aplikace — jen ke čtení |

**Moduly se nevolají napřímo — oznamují si změny událostmi** přes `on()`/`emit()` ze
`src/core/store.js`. Mapa nesmí volat views a naopak; bez toho by přidání obrazovky znamenalo
sahat do mapy. Události dnes: `prekresleno`, `otevriDetail`, `skoc`, `poloha`, `fotkyNacteny`,
`ulozeniSelhalo`, `motivZmenen`.

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
- Ikony jsou symboly v `src/icons/sprite.svg` (61 kusů), jmenují se `i-neco`, vkládají se `IC('i-van')`.

Podrobná pravidla podle oblasti (auto-scoped podle cesty):
[.claude/rules/database.md](.claude/rules/database.md) ·
[.claude/rules/kod.md](.claude/rules/kod.md) ·
[.claude/rules/kontroly.md](.claude/rules/kontroly.md) ·
[.claude/rules/nasazeni.md](.claude/rules/nasazeni.md).

Návody pro člověka: [README.md](README.md), schéma dat [src/data/schema.md](src/data/schema.md),
výklad vzhledu [VZHLED.md](VZHLED.md).

## Spolupráce ve dvou

Na repozitáři pracují dva lidé, každý ve vlastní session Claude Code — pravidla platí
pro oba stejně.

- **Netriviální práci vždy na vlastní větvi**, ne rovnou do `main`. Před začátkem
  `git pull`/`fetch`, ať se nepracuje na zastaralém stavu.
- **Před pushem do `main` se domluvit s tou druhou osobou** mimo git (zpráva, hovor) —
  push je okamžité nasazení, dva push za sebou bez domluvy jsou zbytečné riziko.
- **Když push selže, protože mezitím pushnul někdo jiný: nikdy force-push.**
  `git pull --rebase origin main`, vyřešit konflikty, znovu spustit `npm run validate`
  a `npm run smoke`, teprve pak push.
- **`src/data/places.json` je nejpravděpodobnější místo konfliktu** — jeden 780kB soubor.
  Při souběžné práci přidávej nová místa přednostně do `src/data/places-nova.json`
  (přihrádka, viz [.claude/rules/database.md](.claude/rules/database.md)) a slučuj
  (`npm run slouc`) až když je jistota, že s daty zrovna nikdo jiný nepracuje.
- V konfliktu v JSON nikdy „vzít moje"/„vzít jeho" naslepo — ověřit, že se nesmazalo
  cizí místo nebo poznámka.

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

Plán má tři karty: **Na cestě** (probíhající cesta – odznačování, pauzy,
plánové achievementy, Další cíl + Navigovat + zbývá km), **Výpravy**
(knihovna: sbalitelné složky, akce na řádku, tažení dlouhým podržením,
nastavitelné řazení, ukončené cesty po letech) a **Itinerář** (všechno
o otevřené výpravě: tažení za prstem i celých dnů, prázdné dny, vlastní
body a bloky, Vyjet, dole čísla výpravy se srovnáním). Výběr je jedině
v knihovně; ťuknutí na výpravu ji jen AKTIVUJE NA MAPĚ (datově dnešní
aktivní výprava) – do Itineráře vede „Otevřít itinerář" v akcích řádku.

- **Dialogy místo `prompt()`/`confirm()`/`alert()`**: `components/dialog.js`
  (`potvrd`, `zadej`, `vyberZeSeznamu`, `oznam`) – jedna karta nad `#backdrop`,
  promise, zrušení vrací `null`/`false`. Smoke/parity na ně sahají přes
  `#dialog.show`, ne `page.once('dialog')`.
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
- **Cesta je otisk plánu** z okamžiku vyjetí (`zastavky`, `dny` jako délky) –
  plán se dá za jízdy upravovat a cesta se nerozbije.
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
  by změnila výstup na obrazovce a shodila paritu.
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
  i `cesta`, `cesty`, `bloky`, `achievementy`, `slozky` a `vypravaSlozka`**.
  Staré zálohy tyhle klíče nemají a obnova je přeskočí; rozjetou cestu
  v telefonu obnova nepřepíše a archiv slučuje podle času vyjetí.
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
