---
paths:
  - src/**
  - index.html
---

# Kód a architektura

_Zjištěno auditem: `src/main.js`, `src/core/store.js`, `src/views/index.js`,
`src/components/placeCard.js`, `src/core/html.js`. Žádný linter ani formatter v repu není —
všechno níž vynucuje jen review._

## Styl

- **Bez středníků na konci řádků** (ověřeno: 0 výskytů `;$` napříč `src/`).
- Jednoduché uvozovky, odsazení 2 mezerami, řádky do ~110 znaků, LF (`.gitattributes`).
- **Česky se píše všechno** — identifikátory (`kartaSeznam`, `zjistiPolohu`, `nactiMista`,
  `prekresleno`), komentáře, JSDoc i uživatelské texty. Anglicky zůstávají jen datové zkratky
  z `places.json` (`p`, `k`, `S`, `F`), názvy z DOM a API Leafletu. Nepřejmenovávej.
- Typování přes JSDoc anotace (`@param {Record<string, any>} p`), ne TypeScript.
- Uživatelské texty jdou přímo do kódu — žádný `strings.ts` ani i18n vrstva tu není a nezaváděj ji.

## Komentáře

Každý soubor začíná JSDoc blokem s **účelem a důvodem**, ne popisem toho, co kód dělá.
Netriviální rozhodnutí má u sebe odůvodnění, často i s odkazem na řádek v originálu
(`src/main.js:51-53`, `src/core/html.js:8-14`). Když píšeš nový soubor, drž tenhle vzor —
je to nejvýraznější konvence celého repozitáře.

## Architektura

**Jeden soubor = jedna zodpovědnost.** Žádný framework, žádná knihovna na vzhled.

```
src/main.js       jen poskládá díly a zaregistruje odběry událostí – žádná logika
src/core/         čistá logika, nesahá na DOM (výjimka: router.js přepíná panely)
src/data/         data + číselníky + kontrola  → viz database.md
src/views/        obrazovky, jedna složka na obrazovku
src/components/   díly použité na víc obrazovkách
src/map/          všechno kolem Leafletu
src/styles/       CSS po dílech, pořadí určuje index.css
src/icons/        sprite.svg (45 symbolů) + vkládání
src/pwa/          šablona service workeru + registrace  → viz nasazeni.md
```

**Moduly se nevolají napřímo.** Oznamují si změny přes `on()`/`emit()` ze `src/core/store.js`.
Mapa nesmí importovat views a naopak — jinak by přidání obrazovky znamenalo sáhnout do mapy.
Události: `prekresleno`, `otevriDetail`, `skoc`, `poloha`. Pořadí volání = pořadí přihlášení.

**Stav je jen v `src/core/store.js`**, nikde jinde nejsou globální proměnné:

| Export | Co drží | Uloženo |
|---|---|---|
| `store` | poznámky, stav, hodnocení, plán, priority | `vandrbuch:v1` |
| `PHOTOS` | vyfocené fotky `{ [id]: dataURL }` | **IndexedDB** `vandrbuch/fotky` |
| `prefs` | předvolby dashboardu | `vandrbuch:prefs` |
| — | data z importu CSV | `vandrbuch:data` |
| `F` | nastavení filtrů — **mění se na místě, nikdy se nenahrazuje** | jen v paměti |
| `S` | běhový stav: `places`, `byId`, `userPos`, `activeTab`, `hiId` | jen v paměti |

Po změně volej `save()` / `savePrefs()` / `ulozFotku(id)` / `zahodFotku(id)`.
**Nikdy nezahazuj jejich návratovou hodnotu** — vrací `false`, když se nepovedlo
uložit, a `store.js` z toho posílá `ulozeniSelhalo`, na které visí varovný pruh.
Přesně tenhle zahozený výsledek dřív způsoboval tiché mizení poznámek.

Psaní do textového pole ukládej přes **`saveOdlozene()`**, ne `save()` — každý
`save()` převede na text celý store a při psaní by to na mobilu sekalo. Doplach
při odchodu ze stránky je zařízený v `main.js`.

Fotky bydlí v IndexedDB (`src/core/fotoDb.js`), takže **zápis je asynchronní**.
V paměti jsou pořád v obyčejném objektu, aby je detail místa mohl číst rovnou při
vykreslování; načtou se při startu (`pripravFotky()` v `main.js`).

**Přidání obrazovky:** složka v `src/views/`, záznam v `src/views/index.js`, tlačítko
`<button data-tab="…">` v `index.html`. Registr je schválně ve `views/`, ne v routeru —
router nesmí znát obrazovky.

## HTML a vykreslování

- HTML se skládá jako řetězce v template literals a přiřazuje přes `innerHTML`,
  ne přes `document.createElement`. Drž to; míchání přístupů ztíží porovnání s originálem.
- **Text z dat vždy přes `esc()`** z `src/core/html.js`.
- `esc()` ošetřuje **jen `&` a `<`** — ne `>` ani uvozovky, přestože se používá i uvnitř
  atributů. Je to doslovný přepis původní funkce a „oprava" by změnila výstup na obrazovce.
  Neopravuj bez vyžádání.
- Obsluha událostí se věší jako `prvek.onclick = …` (ne `addEventListener`), v souladu
  s originálem. `scripts/check-handlers.mjs` porovnává napojení s originálem za běhu.

## Mapa

- **Do stránky jdou jen špendlíky ve výřezu** (`srovnejVyrez()` v `src/map/map.js`).
  Změřeno: 580 kusů naráz stálo při posunu mapy ~850 ms přepočtu stylů. Nešlo o skript
  ani o rozvržení — Leaflet přepíná třídy na kontejneru a prohlížeč přepočítá styly všech
  špendlíků pod ním. Vzhled se tím nemění, ověřeno na 0 rozdílných pixelů.
- `draw()` staví špendlíky znovu (stavy se mohly změnit), posun mapy jen doplňuje
  a odebírá. Špendlík přidaný posunem **nesmí nabíhat animací** — `pinIcon(p, i, true)`.
- **Počítadlo míst ukazuje všechna filtrovaná místa**, ne jen vykreslená.
- Malovaná offline mapa leží v samostatných pane pod dlaždicemi a nepřepíná se sama,
  viz `src/map/podklad.js`. Přepíná se pilulkou vlevo nahoře (`prefs.podklad`);
  plochy zemí jsou v mapě i online, aby bez signálu nevznikla díra.

## CSS

- Barvy, rozměry a stíny **výhradně přes proměnné z `src/styles/tokens.css`**, nikdy natvrdo.
  **Do `tokens.css` se přidávat smí a má** — je to jediný zdroj palety. (Do léta 2026 tu
  stálo, že se do něj nepřidává, protože se `:root` porovnával s originálem. Vizuální
  redesign to zrušil, viz [VZHLED.md](../../VZHLED.md).) Nová barva patří do sémantické
  vrstvy **a do obou tmavých bloků**; že se nerozejdou, hlídá `npm run check-tokeny`.
- Jeden soubor na komponentu v `src/styles/components/`, zapojení a **pořadí** v `index.css`.
- **Nový CSS soubor zapiš do `scripts/nove-styly.mjs`** — jinak `parity` započítá jeho
  `env(safe-area-inset-*)` jako nečekaný rozdíl.
- `npm run check-tokeny` hlídá barvy natvrdo, párování světlý/tmavý a kontrast —
  po zásahu do CSS ho pusť. `check-css` je odstavené, viz `PARITA.md` §10 Q14.
- Když kreslení potřebuje barvu v JavaScriptu (plátno), přečti si ji z CSS přes
  `getComputedStyle`, ne natvrdo — vzor je v `src/map/offlineMap.js`.

## Ikony

Symboly v `src/icons/sprite.svg`, 58 kusů, jména `i-neco`. Vkládají se `IC('i-van')`
nebo `<svg class="ic"><use href="#i-van"/></svg>`. Nová ikona = symbol do sprite.svg.
