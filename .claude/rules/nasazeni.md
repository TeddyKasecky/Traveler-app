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

## Dvě varianty z jednoho zdroje

| Příkaz | Výstup | K čemu |
|---|---|---|
| `npm run build` | `dist/` | hostovaný web, plná PWA se service workerem — **tohle nasazuje Cloudflare** |
| `npm run build:single` | `dist-single/index.html` | jeden self-contained soubor, funguje z disku i z flashky |

Zdrojový kód je stejný, na variantu se ptá přes `import.meta.env.SINGLE_FILE`. Rozdíl je jen
v tom, co se inlinuje a jestli vzniká service worker. **Nepiš dvě větve kódu** — když něco
platí jen pro jednu variantu, řeš to tímhle přepínačem, ne kopií souboru.

`base: './'` je nutné pro obě varianty (hosting v podadresáři i `file://`). Neměň na `/`.

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
MapLibre i s jeho workerem, čtečka balíku, 120 kreseb a souřadnice lesů a hor.
Dohromady přes čtyři megabajty, které jsou k ničemu každému, kdo si mapu
nestáhne. Filtr je v `vite.config.js` a pozná to podle jména souboru
(`assets/kresba*`, `kresby-*`, `vektory*`, `vbm*`, `maplibre-*`).

**Neztratí se to.** Service worker od srpna 2026 ukládá i to, co si aplikace
vyžádá až za běhu, takže se kresby uloží při prvním zapnutí malované mapy.
Stahovat mapu se stejně musí online, takže se to vždycky stihne dřív, než dojde
signál.

Je to křehké: přejmenovaný chunk by tiše vrátil čtyři megabajty do instalace.
Proto `vite.config.js` při buildu vypisuje, kolik se předukládá a kolik se
vynechalo, a `smoke` má na to kontrolu. Dnes: **43 souborů, 3,3 MB na disku,
~2,4 MB přes síť** (z toho megabajt je stínování terénu).

**Stínování terénu** (`src/assets/relief-evropa.webp`) v předukládaném seznamu
naopak **je** — má ho i zjednodušená mapa, tedy i ten, kdo si nic nestáhl.

**Podklad offline mapy** (`src/data/basemap.json`) je samostatný kus, který se dotahuje až
při prvním selhání dlaždice. Do předukládaného seznamu se dostane sám, protože ten se skládá
ze všech souborů balíčku — a musí tam být, jinak by se bez signálu nedal stáhnout a celá
offline mapa by nebyla k ničemu.

## Cloudflare

Projekt `traveler-app` (Worker, ne Pages) napojený na `github.com/TeddyKasecky/Traveler-app`.

| Položka | Hodnota |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |
| Node | ze souboru `.node-version` (22) |

Worker nemá žádný kód — `wrangler.jsonc` nemá `main`, jen `assets.directory: "./dist"`.
Bez toho souboru `wrangler deploy` neví, co nasadit, začne hledat konfiguraci sám
a zakopne o `vite.config.js`.

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

## Push = produkce

**Každý `git push` na `main` web sám přestaví a nasadí.** Commituj volně, ale
**před pushem se vždy zeptej.** Napřed projeď aspoň `npm run validate` a `npm run smoke`.

Repozitář je **veřejný** — kód i seznam míst si může přečíst kdokoli. Poznámky, hodnocení
a vlastní fotky v něm nejsou, ty zůstávají v localStorage telefonu. Do repozitáře nepatří
žádné tokeny ani osobní data.

## Verze závislostí

`leaflet` je přišpendlený na přesné `1.9.4` bez `^` — nechávej tak, mapa je jádro aplikace
a tichý minor upgrade by se projevil až na produkci. `vite`, `sharp` a `playwright-core`
mají `^`, protože jsou jen nástroje.
