---
paths:
  - vite.config.js
  - wrangler.jsonc
  - package.json
  - .node-version
  - public/**
  - src/pwa/**
---

# Build, PWA a nasazení

_Zjištěno auditem: `vite.config.js`, `wrangler.jsonc`, `.node-version`, `src/pwa/sw.js`,
`README.md` kap. 2._

## Jeden build target

| Příkaz | Výstup | K čemu |
|---|---|---|
| `npm run build` | `dist/` | hostovaný web, plná PWA se service workerem — **tohle nasazuje Cloudflare** |

Do září 2026 tu byla ještě jednosouborová varianta (`build:single`, `dist-single/`,
konstanta `import.meta.env.SINGLE_FILE`). **Zrušila se** — nasazuje se jedině `dist/`,
`dist-single/` nebylo v gitu nikdy a jediný důvod, proč vznikla (nosit appku na flashce
a posílat mailem), nahradila veřejná beta a offline režim PWA. Stálo to osm větví
v kódu, druhou větev ve `smoke` a dvě sady ilustrací. Vytáhnout zpátky jde
`git revert` commitu, který ji odstranil.

`base: './'` zůstává — hosting může běžet v podadresáři. Neměň na `/`.

## Service worker

`src/pwa/sw.js` je **šablona**, ne hotový soubor. Zástupné značky `__VERSION__` a `__PRECACHE__`
doplní `pluginServiceWorker()` ve `vite.config.js` až při buildu, protože jména souborů obsahují
otisk obsahu a předem je nikdo nezná. **`dist/sw.js` se nikdy needituje.**

Verze cache se počítá jako SHA-1 ze seznamu souborů — když se nic nezmění, service worker
zůstane stejný a prohlížeč ho zbytečně nepřeinstaluje.

Ze seznamu k uložení se filtrují tři věci a **každá z nich by shodila celé offline**:

- složky — `cache.addAll` na složce selže a s ní instalace workeru,
- tečkové soubory — jsou k ničemu,
- soubory s podtržítkem — `_headers` a `_redirects` si hostingy berou jako svoji konfiguraci
  a z nasazeného webu je mažou, takže by vrátily 404.

Nové soubory v `public/` se do cache přidají samy, protože je Vite jen kopíruje a plugin je
dočítá z disku. Pojmenování s podtržítkem na začátku se ale vyfiltruje.

**Výjimka: všechno kolem stažené mapy.** Z předukládaného seznamu je schválně
vyřazený balík `public/mapa-evropa.vbm` (3,7 MB, stahuje se na vyžádání
z Nastavení do IndexedDB) **a k tomu z bundle všechno, co je jen pro něj**:
MapLibre i s jeho workerem, čtečka balíku, 120 kreseb a masky lesů a hor.
Dohromady přes čtyři megabajty, které jsou k ničemu každému, kdo si mapu
nestáhne. Filtr je v `vite.config.js` a pozná to podle jména souboru
(`assets/kresba*`, `kresby-*`, `vektory*`, `vbm*`, `maplibre-*`).

**Neztratí se to.** Service worker od srpna 2026 ukládá i to, co si aplikace
vyžádá až za běhu, takže se kresby uloží při prvním zapnutí malované mapy.
Stahovat mapu se stejně musí online, takže se to vždycky stihne dřív, než dojde
signál.

Je to křehké: přejmenovaný chunk by tiše vrátil čtyři megabajty do instalace.
Proto `vite.config.js` při buildu vypisuje, kolik se předukládá a kolik se
vynechalo, a `smoke` má na to kontrolu. Dnes: **35 souborů, 3,05 MB na disku,
~1,97 MB přes síť** (z toho megabajt je stínování terénu).

Od srpna 2026 vypadávají i **velké ilustrace kategorií** (`*-720`, 540 kB):
ukazují se jen v otevřeném detailu místa bez vlastní fotky, tedy až po ťuknutí.
Malá sada (`*-320`) se kreslí na kartách hned a v instalaci zůstává.

**Rejstřík debug poznámek** (`dist/debug-stav.json`) je v předukládaném seznamu taky,
ale je to **jediný soubor se stabilním jménem, jehož obsah se mezi nasazeními mění** —
skládá ho `pluginDebugRejstrik()` ze složky `debug/`. Verze cache se počítá ze SEZNAMU
JMEN, takže by se změnou jeho obsahu nezměnila a cache-first by servírovala starý stav
navždycky. Service worker ho proto bere **sítí napřed** a cache používá jen jako zálohu
pro offline. Je to jediná výjimka z „cache je vždycky správná".

**Stínování terénu** (`src/assets/relief-evropa.webp`) v předukládaném seznamu
naopak **je** — má ho i zjednodušená mapa, tedy i ten, kdo si nic nestáhl.

**Podklad offline mapy** (`src/data/basemap.json`) je samostatný kus, který se dotahuje až
při prvním selhání dlaždice. Do předukládaného seznamu se dostane sám, protože ten se skládá
ze všech souborů balíčku — a musí tam být, jinak by se bez signálu nedal stáhnout a celá
offline mapa by nebyla k ničemu.

## Cloudflare

Od srpna 2026 **dva** projekty (oba Worker, ne Pages) napojené na
`github.com/TeddyKasecky/Traveler-app`, každý na jinou větev:

| Projekt | Větev | Doména | Aktualizace |
|---|---|---|---|
| `traveler-app` | `production` | traveler-app.teddykasecky.workers.dev | jen ruční, zřídka |
| `traveler-app-beta` | `main` | traveler-app-beta.teddykasecky.workers.dev | automaticky, každý push |

Oba mají stejné nastavení buildu:

| Položka | Hodnota |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |
| Node | ze souboru `.node-version` (22) |

`traveler-app-beta` má navíc build proměnnou `VANDRBUCH_BETA=1` (Settings →
Environment variables) — `vite.config.js#pluginBetaManifest` podle ní přepíše
`short_name` v manifestu na „Vandrbuch beta", ať appka na ploše telefonu jde
poznat od produkce. Bez proměnné (produkce) manifest zůstává beze změny.

Stejná proměnná zapíná i **červený štítek „BETA"** v hlavičce (`#betaZnacka`
v `index.html`, obsluha v `main.js`) — na rozdíl od manifestu (post-processing
`dist/` po buildu) je tohle zapečené do JS buildu přes
`define: { 'import.meta.env.VANDRBUCH_BETA': ... }` ve `vite.config.js`.
Beze proměnné appka zkompiluje `false` natvrdo a mrtvý kód zmizí úplně — na
produkci tedy `VANDRBUCH_BETA` neexistuje v žádné podobě ve výsledném JS, ne jen
že je vypnutá.

Bez `wrangler.jsonc` `wrangler deploy` neví, co nasadit, začne hledat konfiguraci
sám a zakopne o `vite.config.js`. Stejný soubor (s `name: "traveler-app"`) slouží
oběma projektům — `name` v něm neurčuje, na kterou Cloudflare appku push jde,
to řídí výhradně větev, na kterou je projekt v dashboardu napojený.

**Worker má od srpna 2026 kód** (`main: "worker/index.js"`); do té doby žádný
neměl a Cloudflare jen rozdávala hotové soubory z `dist/`. Statické soubory se
ale vyhodnocují **dřív** než Worker (`run_worker_first` je ve výchozím stavu
vypnuté), takže se na servírování aplikace nic nemění — ke kódu doputuje jen to,
co na žádný soubor nesedlo, a na to se vrací 404 stejně jako dřív.

Kód je v **kořeni repa, ne v `src/`**: `src/` bere Vite a zabalil by ho do
aplikace.

**Kdyby se cokoli pokazilo, únikový východ je jeden řádek:** smazat `main`
ze `wrangler.jsonc` a nasadit. Tím je Worker zase bez kódu a chování se vrací
přesně tam, kde bylo.

Pozor: **žádná místní kontrola Worker neověří.** `smoke` si pouští vlastní
statický server, takže ho nikdy nevidí; jediné, co jde udělat předem, je
`npx --yes wrangler@4 deploy --dry-run`. Zbytek se pozná až na nasazené betě —
proto se každá změna Workeru nasazuje samostatně a hned se ověří, že appka
naběhne, service worker se zaregistruje a offline režim funguje.

**`not_found_handling: "none"` se nesmí přepnout na `single-page-application".** Aplikace si
při instalaci ukládá do cache soubory s otiskem obsahu v názvu; kdyby některý chyběl, dostal
by service worker místo něj HTML stránku, uložil by ji jako JavaScript a offline režim by se
tiše rozbil. Záložky jsou stejně v adrese za mřížkou (`#mapa`, `#seznam`), takže se serveru
nikdy neptají.

Suchý běh bez nasazení: `npx --yes wrangler@4 deploy --dry-run`.

## Jak ověřit, že nasazení opravdu proběhlo

Push jen spustí build; ten trvá desítky vteřin až minuty a **může selhat**. Ověřuje se
porovnáním otisku v názvu balíku — ne tím, že stránka nějak vypadá:

```bash
ocekavany=$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' dist/index.html | head -1)
curl -s https://traveler-app.teddykasecky.workers.dev/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1
```

Když se shodují, je venku přesně ten build, který jsi testoval. Stojí za to ověřit i to,
že jde stáhnout **podklad offline mapy** (`assets/basemap-*.js`) a že ho `sw.js` má
v předukládaném seznamu — bez něj by offline mapa tiše nefungovala.

## Push = beta, ne produkce

**Každý `git push` na `main` web sám přestaví a nasadí na betu**
(`traveler-app-beta`). Push do `main` jde jen podle postupu v `CLAUDE.md`
sekci „Git workflow (autonomní, bez PR)" — osobní větev, fetch, merge/rebase
`main` do ní, kontrolní skripty, bezpečnostní tag, teprve pak merge a push.
Napřed vždycky projeď aspoň `npm run validate` a `npm run smoke`; pokud něco
selže, do `main` se nepokračuje.

**Produkce (`traveler-app`) se aktualizuje jen ručně** z větve `production`,
a to jen na výslovné vyžádání uživatele — postup je v `CLAUDE.md` sekci
„Nasazení na produkci". Nikdy neposouvej `production` jako automatickou
součást běžného mergování do `main`.

Repozitář je **veřejný** — kód i seznam míst si může přečíst kdokoli. Poznámky, hodnocení
a vlastní fotky v něm nejsou, ty zůstávají v localStorage telefonu. Do repozitáře nepatří
žádné tokeny ani osobní data.

## Verze závislostí

`leaflet` je přišpendlený na přesné `1.9.4` bez `^` — nechávej tak, mapa je jádro aplikace
a tichý minor upgrade by se projevil až na produkci. `vite`, `sharp` a `playwright-core`
mají `^`, protože jsou jen nástroje.
