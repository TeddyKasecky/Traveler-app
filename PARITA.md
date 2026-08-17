# Kontrolní seznam parity

Doklad, že přestavěná aplikace dělá totéž co původní `index.html`. Každý bod má
u sebe důkaz, ne tvrzení. Všechno jde spustit znovu příkazy uvedenými u kapitol.

Referenční kopie originálu je v `reference/index-original.html` a je bajt po bajtu
shodná s tím, co běží dnes.

---

## Souhrn

| Kontrola | Příkaz | Výsledek |
|---|---|---|
| Data 1:1 | `npm run check-data` | **DATA SEDÍ** |
| Schéma dat | `npm run validate` | **0 chyb**, 5 varování |
| ~~CSS pravidlo po pravidle~~ | ~~`npm run check-css`~~ | **odstaveno redesignem**, viz §10 Q14 |
| Návrhové tokeny a kontrast | `npm run check-tokeny` | **7 / 7** |
| Dělení plánu na dny a výpravy | `npm run check-dny` | **34 / 34** |
| Filtry, 134 kombinací | `npm run check-filters` | **všechny sedí** |
| Napojení tlačítek | `npm run check-handlers` | **61 / 61** |
| Proklikání, hostovaná | `npm run smoke` | **107 / 107** |
| Proklikání, single-file | `npm run smoke:single` | **95 / 95** |
| Kontrolní seznam níž | `npm run parity` | **26 / 26** |
| Úložiště a plná paměť | `npm run check-uloziste` | **13 / 13** |
| Formulář vyrábí platná místa | `npm run check-form` | **18 / 18** |
| Odkazy na fotky | `npm run check-images` | **262 / 262 existuje** |
| Vzhled po pixelech | `node scripts/screenshots.mjs && node scripts/compare-screens.mjs` | viz níž |

---

## 1. Vzhled

> **Tahle sekce od srpna 2026 neplatí.** Aplikace prošla vizuálním redesignem podle
> grafického manuálu (viz [VZHLED.md](VZHLED.md)) a s původní aplikací se vzhledem
> **rozchází záměrně a ve všem**. Čísla rozdílných pixelů proti originálu tím ztratila
> smysl: dřív dokládala, že se přestavba do modulů obešla beze změny vzhledu, což je
> otázka, kterou už nikdo neklade.
>
> Co tu stálo dřív: čtyři obrazovky se lišily přesně o 2 726 pixelů (logo), Detail
> o 3 131, Filtry o 65 672 a Mapa s Průvodcem o víc než polovinu plochy kvůli
> zjednodušené offline mapě (Q11) a opravené viditelnosti průvodce (Q6).

Porovnání snímků **zůstává jako regresní síť**, jen se změnila reference: neporovnává se
s původní aplikací, ale s posledním odsouhlaseným stavem.

```bash
node scripts/screenshots.mjs --baseline    # jednou, před zásahem
node scripts/screenshots.mjs               # po zásahu
node scripts/compare-screens.mjs           # co se změnilo
node scripts/screenshots.mjs --tmavy       # totéž v tmavém režimu
```

Původní režim je pod `--vs-original` a `compare-screens.mjs --vs-original`.

U plošných zásahů do CSS je to jediná realistická obrana proti „na jedné obrazovce jsem
zapomněl `:active`". Ověřeno: proti sobě samému dává 0 px na šesti obrazovkách a 4 px
na dvou (animovaná tečkovaná silnice).

## 2. Instalace jako aplikace (PWA)

| Bod | Důkaz |
|---|---|
| manifest se načte a je platný | HTTP 200 · `display=standalone` · 2 ikony |
| obě ikony se opravdu stáhnou | 192×192 · 512×512 |
| logo v hlavičce není rozbité | `naturalWidth` 192 px |
| service worker běží a řídí stránku | `navigator.serviceWorker.controller` nastavený |
| `apple-touch-icon` pro iPhone | `icon-192.png` |

**Poznámka:** tohle je jediná oblast, kde je nová verze lepší než stará. Originál
manifest i ikonu v hlavičce **odkazoval, ale soubory nikdy neexistovaly**
(`index-original.html:8-10`) – proto dnes chybí logo a proto se appka nedá pořádně
nainstalovat. Odsouhlaseno jako Q1.

---

## 2b. Mapa bez signálu

Dlaždice z OpenStreetMap se do cache neukládají a hromadně stahovat se
[nesmějí](https://operations.osmfoundation.org/policies/tiles/), takže offline zbývala
šedá plocha. Nově se pod dlaždice vloží zjednodušený podklad z Natural Earth.

| Bod | Důkaz |
|---|---|
| podklad má vlastní vrstvu | `.leaflet-podklad-pane canvas` |
| opravdu se kreslí, ne prázdné plátno | v obrázku je aspoň jeden neprůhledný bod |
| názvy měst | `.mesto-popisek` |
| mapa má barvu moře, ne šeď | `#map.offline` |
| štítek to hlásí | „Offline · zjednodušená mapa" |

Ověřuje `npm run smoke`, oddíl „offline zkouška".

**Podklad se nepřepíná, jen leží pod dlaždicemi.** První verze se přepínala podle toho,
jestli dlaždice jdou – jenže prohlížeč offline servíruje nedávno prohlédnuté dlaždice
ze své cache, takže část jich dorazí a část ne, a přepínání pod rukama blikalo. Takhle
se díra v mapě vyplní i uprostřed jinak funkční mapy.

Zkouška proto přibližuje kolečkem do míst, kam se předtím nikdo nedíval – bez toho by
prohlížeč posloužil z cache a nic by neselhalo, takže by kontrola nic neověřila.

---

## 2c. Nainstalovaná aplikace se nepřeinstaluje pro nic za nic

Verze cache je otisk seznamu předukládaných souborů. Záměr byl, aby se při nezměněném
obsahu nezměnila ani verze a telefon si nic nestahoval znovu.

**Nefungovalo to.** `Object.keys(bundle)` nevrací pokaždé stejné pořadí — stačilo, aby si
dva soubory fontů prohodily místo, a verze vyšla jiná, přestože se v aplikaci nezměnil
jediný bajt. Zachyceno porovnáním nasazeného `sw.js` s lokálním buildem: stejných
11 souborů, jiné pořadí, jiná verze (`b138017f42` vs `f02112b00a`).

Seznam se proto před spočítáním otisku **řadí**. Tři buildy po sobě teď dají tutéž verzi.

| Bod | Důkaz |
|---|---|
| předukládaný seznam je seřazený | `npm run parity`, oddíl 2c |
| verze je stabilní mezi buildy | tři buildy po sobě → `vandrbuch-3a840e25bb` |

Dopad na telefon: aktualizace se stáhne jen tehdy, když se opravdu něco změnilo.

---

## 3. Uložená data přežijí aktualizaci

| Bod | Důkaz |
|---|---|
| klíče v localStorage se nezměnily | `vandrbuch:v1` · `vandrbuch:photos` · `vandrbuch:prefs`, doslova jako v originále |
| smazání celé cache o data nepřipraví | smazána 1 cache → `vandrbuch:v1` 260 B → 260 B, appka naběhla s 580 místy |

Service worker sahá jen na `caches`, nikdy na `localStorage`. Aktualizace aplikace
tedy o poznámky připravit nemůže.

### Co se změnilo po přestavbě: úložiště se přeskládalo

Původní rozvržení mělo tichou chybu. `uloz()` vracel `false`, když byl localStorage
plný, ale `save()` tu hodnotu **zahazoval** – u fotek se kontrolovala, u poznámek,
hodnocení, plánu a priorit ne. Poznámky tedy mizely beze slova. A protože se fotky
ukládaly jako base64 do téhož 5MB úložiště, stačilo k tomu zhruba čtyřicet fotek.

| Co | Kde bylo | Kde je | Proč |
|---|---|---|---|
| Fotky míst | `vandrbuch:photos` (localStorage) | IndexedDB `vandrbuch/fotky` | 5MB strop; fotky dusily poznámky. Pořád jen v telefonu, nikam se neposílají. |
| Data z importu CSV | `vandrbuch:v1` → `dataOverride` | `vandrbuch:data` | po importu ~565 kB v témž záznamu jako poznámky, přepisovalo se to při každé změně |
| Poznámky, hodnocení, plán, priority | `vandrbuch:v1` | **beze změny** | klíč se nesmí přejmenovat |
| Předvolby | `vandrbuch:prefs` | **beze změny** | tamtéž |

Stěhování proběhne samo při prvním otevření a **starý klíč se maže až po úspěšném
zápisu na nové místo** – kdyby se smazal dřív a zápis selhal, data by zmizela úplně.
Ověřeno v `npm run check-uloziste`, body 1 a 2.

Neúspěšný zápis se nově ohlásí **trvalým pruhem** přes hlavičku, ne toastem: toast
by po dvou vteřinách zmizel a uživatel by zavřel aplikaci v přesvědčení, že je vše
v pořádku. V pruhu je rovnou tlačítko na zálohu, protože to je jediná záchrana.

Psaní poznámky navíc volalo `save()` **při každém stisku klávesy** a ten pokaždé
převedl na text celý store. Nově se zapisuje 400 ms po dopsání a při odchodu ze
stránky se doplachne (`pagehide`, `visibilitychange`). Ověřeno body 4 a 5.

---

## 4. Tlačítko zpět na Androidu

| Bod | Důkaz |
|---|---|
| přepnutí záložky zapíše historii | `#list` → `#disc` → zpět → `#list` |
| zpět zavře detail a nechá záložku být | otevřen → zpět → zavřen, záložka `#map` zůstala `#map` |
| zpět zavře panel filtrů a nechá záložku být | otevřen → zpět → zavřen, zůstalo `#map` |

Ťuknutí na kartu v seznamu přepíná na mapu – to dělá `goTo()` a **originál to dělá
taky** (`index-original.html:1015`), takže `#map` je správně.

Práce s historií je nové chování, odsouhlasené jako Q4. Dřív tlačítko zpět appku
na Androidu rovnou opustilo.

---

## 5. Bezpečné okraje na iPhonu

| Bod | Důkaz |
|---|---|
| `viewport-fit=cover` v hlavičce | v originále i u nás |
| `env(safe-area-inset-*)` | originál **11×**, naše **11×** |

Na opravdovém iPhonu to ověřte prosím sama – tohle je nejvíc, co jde změřit strojově.

---

## 6. Data: CSV, záloha, obnova, návrat k vestavěným

| Bod | Důkaz |
|---|---|
| import CSV vymění data | 1 místo · `id` složené jako dřív: `zkusebni-vodopad-234` |
| „Vrátit vestavěná data" | 580 míst · `dataOverride` zpět na `null` |
| záloha obsahuje všechno | `notes` · `rating` · `plan` · `prio` · `photos` · `prefs` |
| obnova vrátí všechno zpátky | poznámka s diakritikou ✓ · 4 hvězdy · 3 plamínky · 1 zastávka · 1 fotka |

**Záloha byla doplněna** (odsouhlaseno). Původní verze `prio`, `photos` ani `prefs`
neukládala, přestože obnova `prio` číst uměla (NAPADY.md N2). Dokud appka běžela na
jednom místě, nevadilo to. Při přechodu na vlastní adresu je ale záloha jediná cesta,
jak si data přenést – a s tou děravou by se **nenávratně ztratily vlastní fotky**.
Starší soubory záloh zůstávají čitelné.

---

## 7. Ostatní funkce

| Bod | Důkaz |
|---|---|
| vlastní fotka | uloží se pod `id` místa do `vandrbuch:photos` |
| poznámka, hvězdičky, plamínky | poznámka s diakritikou, 4 hvězdy, 3 plamínky |
| „Moje poloha" | 1× puntík na mapě · „Poloha nalezena ✓ · nejblíž 5,1 km" |
| „Něco blízko" | přepne na Objevuj |
| „Překvap mě" | vylosuje místo, zapíše `lastTip` |
| plán: přidání | 1 zastávka |
| plán: „Kopírovat" | „🚐 Plán Vandrbuch (0,0 km) …" ve schránce |
| plán: „Do navigace" | `https://www.google.com/maps/dir/?api=1&destination=…` |
| chyby v konzoli za celý průchod | **nula** |

### Chyba, kterou tenhle seznam odhalil

Při přestavbě se ztratil jediný řádek – `index-original.html:1240`, napojení tlačítka
**„Moje poloha"**. Aplikace vypadala úplně stejně, jen to tlačítko nic nedělalo.
Očima by se to nenašlo.

Proto vznikl `npm run check-handlers`: spustí obě verze vedle sebe, projde stejnou
cestu a porovná, na kterých prvcích visí obsluha. Přesně, ne odhadem ze zdrojáku.
Dnes hlásí **61 ku 61** a při každé další změně to ohlídá.

---

## 8. Výkon

`npm run perf`. Zpomalení procesoru napodobuje mobil: 4× odpovídá zhruba střední
třídě, 6× starším nebo přehřátým telefonům.

**MĚŘENÍ KOLÍSÁ, ČTĚTE MEDIÁN.** Jeden běh `perf` se od druhého liší až o čtvrtinu.
Při přestavbě rozvržení jsem se na tom spálil: první běh po malované mapě ukázal
u špendlíků 4 792 ms proti 2 417 ms a vypadalo to jako osmdesátiprocentní regrese.
Po třech bězích na obou stranách se ukázalo, že rozdíl je v šumu. **Porovnávat se
smí jen medián aspoň ze tří běhů.**

Čísla po přestavbě rozvržení (medián ze tří běhů), v závorce stav před ní:

| Procesor | První obraz | DOM hotový | 580 špendlíků | Seznam 250 karet |
|---|---|---|---|---|
| 1× (počítač) | ~480 ms | ~400 ms | ~950 ms | ~250 ms |
| 4× (běžný mobil) | ~330 ms | 2 386 ms | 5 216 ms *(4 299)* | 1 164 ms *(1 166)* |
| 6× (starší mobil) | ~450 ms | ~2 900 ms | ~7 300 ms | ~1 900 ms |

Seznam se nezměnil vůbec. Špendlíky stojí asi **o pětinu víc** — přibylo CSS
(pět nových souborů dílů) a víc prvků na obrazovce. Je to cena za přestavbu
a je vidět; kdyby rostla dál, první na řadě je virtualizace seznamu (N10)
a prořídnutí špendlíků při oddálení.

**Závěr: rychlost dál řešit nepotřebujeme,** ale rezerva už není taková jako dřív.
Appka je i na zmrzačeném procesoru použitelná; hlídat to má smysl u každé další
etapy, ne až se to projeví na telefonu.

### Doplněno: co stojí ovládání, ne start

Tabulka výš měří **start**. Uživatel ale hlásil, že se na telefonu seká **posun mapy**.
Doměřeno při 4× zpomalení, součty blokujících úloh:

| Co | Před | Po (jen viditelné špendlíky) |
|---|---|---|
| Posun mapy, pohled na celou Evropu | 855 ms · z toho styly 608 ms | ~stejně (v tom pohledu je 544 z 580 špendlíků opravdu vidět) |
| Posun mapy, přiblíženo jako na cestě | 855 ms | **žádná blokující úloha** |
| Otevření seznamu s 250 kartami | 771 ms · z toho rozvržení 627 ms | beze změny, neřešeno |
| Rolování seznamu | žádná blokující úloha | beze změny |

Podstatné je, **z čeho se ten čas skládal**: ne ze skriptu a ne z rozvržení, ale
z **přepočtu stylů**. Leaflet při tažení přepíná třídy na kontejneru mapy a prohlížeč
musí přepočítat styly všech špendlíků pod ním; každý má `::after`, stín a proměnnou
`--pc`. Řešením je tedy mít jich v stránce méně, ne kreslit je jinak.

Rolování seznamu **neseká** – co je za sekání považované, je jednorázové zamrznutí
při otevření seznamu, a to zůstalo.

> Čísla jsou orientační. Měření na zatíženém počítači kolísá i o desítky procent, takže
> se dá věřit poměru a řádu, ne jednotlivým milisekundám. Údaje ze startovní tabulky výš
> pocházejí z jiného běhu a s těmihle se porovnávat nedají.

### Data míst nejsou to, co start zdržuje

Nabízelo se rozdělit `places.json` na lehkou část a zbytek dotahovat až v detailu.
Doměřeno, že to nemá smysl:

| Co | 1× | 4× | 6× |
|---|---|---|---|
| `JSON.parse` všech 745 kB | 5 ms | 21 ms | 36 ms |
| rejstřík podle id + index hledání | 5 ms | 26 ms | 50 ms |

Proti celkovému startu (na 4× kolem tří vteřin) jsou to **jednotky procent**. Vite navíc
data do balíku vkládá jako `JSON.parse('…')`, ne jako objektový literál v JavaScriptu –
tedy už tou rychlejší cestou. Čas žere **vykreslování**, ne data: rozvržení a styly stojí
podle tabulky výš třikrát tolik co veškerý JavaScript.

**Dělení dat se proto nedělá.** Byl by to největší zásah do jádra ze všech uvažovaných
a ušetřil by nejvýš pár desítek milisekund.

### Co po instalaci ještě chodí na síť

Proklikání celé aplikace po instalaci service workeru, počty požadavků ven:

| Kam | Kolik | Kdy |
|---|---|---|
| `*.tile.openstreetmap.org` | 94 | dlaždice mapy; bez nich naskočí zjednodušený podklad |
| `commons.wikimedia.org` | 0–1 na místo | fotka v detailu, jen u míst, která ji mají |

Nic jiného. Žádná analytika, žádné fonty z CDN, žádná knihovna zvenčí – všechno ostatní
je v balíku a v cache service workeru.

Zajímavé je, kde čas opravdu je. Obava ze zadání mířila na 535 kB dat, která se
parsují při startu – jenže **veškerý JavaScript** včetně toho parsování zabere na
6× zpomaleném procesoru 617 ms. Dvakrát tolik spolykalo **rozvržení a styly**, tedy
kreslení 580 špendlíků jako prvků stránky.

Kdyby to jednou vadilo, opravovalo by se tohle, ne data – Leaflet umí špendlíky
kreslit do plátna místo do stránky. **Neimplementuju**, není proč.

Ke stažení je jednorázově **485 kB** (zabaleno). Po instalaci už appka nestahuje nic.

---

## 9. Nová obrazovka: formulář „Přidat místo"

Jediná funkce, kterou původní aplikace neměla. Schovaná v panelu Filtry ve skupině
„Data a zálohy", mezi ostatními správcovskými tlačítky.

**Nezapisuje nikam do dat.** Vyrobí kus textu, který se vloží do
`src/data/places-nova.json`. Tím je vyloučené, že by rozbil 580 ověřených míst.

| Bod | Důkaz |
|---|---|
| kontroluje se stejným kódem jako `npm run validate` | `zkontrolujMisto()` z `src/data/validate.js` |
| chyby se ukazují u konkrétního políčka | nálezy nesou název pole, prázdný formulář hlásí 11 chyb |
| výstup má přesně 29 polí ve správném pořadí | `npm run check-form` |
| `id` odpovídá konvenci a je volné | `vodopad-u-tri-smrku-921` |
| `nb` se dopočítá | 6 sousedů, seřazených od nejbližšího |
| souřadnice: mapa, poloha, ruční zápis | ověřeno klikem do mapy i přetažením špendlíku |
| koncept přežije zavření | nový klíč `vandrbuch:draft`, tři původní se nedotýká |
| tlačítko zpět formulář zavře | přes `registrujOverlay()` |
| ~~nové CSS nepřepisuje nic z originálu~~ | platilo do redesignu, viz §10 Q14 |

**`nb` se dopočítává** – zadání se na to ptalo. Pravidlo v kódu už existovalo
(import CSV): všechna místa do **45 km**, seřazená podle vzdálenosti, **nejvýš 6**,
vzdálenost na jedno desetinné místo. Je teď ve sdílené funkci `spocitejOkoli()`.

Formulář spočítá okolí **novému místu**. Sousedi ho ve svém `nb` mít nebudou, dokud
se nepřepočítá všechno – to udělá `npm run slouc`. Je to nesymetrie, ale v praxi
nevadí: nové místo své sousedy ukáže.

**Ke konvenci `id`:** prověřil jsem ji v datech. Trojčíslí na konci **není pořadové**
– 580 míst má jen 374 různých čísel. U 311 míst se shoduje s posledními třemi
číslicemi zeměpisné šířky, což je přesně to, co dělá import CSV (`core/csv.js:91`).
Zbytek pochází ze starších zdrojů a přepsat ho nejde, protože `id` se nikdy nemění.
Formulář se drží toho, co dělá kód aplikace; při kolizi losuje.

---

## 10. Odsouhlasené odchylky od originálu

Všechno ostatní je 1:1. Tohle je úplný seznam toho, co se liší.

| # | Změna | Proč | Kde |
|---|---|---|---|
| Q1 | přibyly `manifest.webmanifest`, `icon-192/512.png`, `sw.js` | originál je odkazoval, ale neexistovaly – proto chybí logo a nejde nainstalovat | `public/`, `src/pwa/` |
| Q2 | hledání ignoruje diakritiku | „soutesky" dřív nenašlo „Soutěsky" | `src/core/search.js` |
| Q3 | Leaflet a fonty zabalené z npm místo z CDN | bez toho single-file offline neexistuje | `package.json`, `src/styles/fonts.css` |
| Q4 | záložky v adrese, tlačítko zpět mezi nimi přepíná | dřív zpět na Androidu appku opustilo | `src/core/router.js` |
| Q5 | smazaná `vanScene()` a jejích 6 animací | mrtvý kód, nikdy se nevolal | – |
| Q6 | průvodce má `z-index: 1300` místo `60` | byl pod ztmavením, klik do něj ho zavřel | `src/styles/components/wizard.css` |
| — | zavřený průvodce má `visibility: hidden` | důsledek Q6: jeho stín kreslil linku přes lištu záložek (746 px) | tamtéž |
| — | záloha ukládá i `prio`, `photos`, `prefs` | jinak by se při přechodu na novou adresu ztratily vlastní fotky | `src/core/csv.js` |
| — | nová verze se projeví hned při prvním otevření | jinak by se po nasazení ukázala až napodruhé | `src/pwa/register.js` |
| — | ve vývojovém režimu se neregistruje service worker | `sw.js` vzniká až při buildu, jinak by v konzoli svítila chyba | tamtéž |
| Q7 | neúspěšný zápis se ohlásí varovným pruhem | dřív se návratová hodnota `uloz()` zahazovala a poznámky mizely tiše | `src/core/store.js`, `src/components/pruh.js` |
| Q8 | fotky přesunuty do IndexedDB | localStorage má 5MB strop a fotky v něm dusily poznámky | `src/core/fotoDb.js` |
| Q9 | data z importu CSV mají vlastní klíč | ~565 kB v záznamu s poznámkami se přepisovalo při každé změně | `src/core/storage.js: DATAK` |
| Q10 | psaní poznámky se ukládá až po dopsání | dřív zápis celého store při každé klávese, na mobilu to sekalo | `src/core/store.js: saveOdlozene` |
| Q11 | bez signálu se pod dlaždicemi ukáže zjednodušená mapa | originál i naše první verze měly offline šedou plochu | `src/map/offlineMap.js`, `src/data/basemap.json` |
| Q12 | do stránky jdou jen špendlíky ve výřezu | 580 kusů naráz stálo skoro vteřinu přepočtu stylů při každém posunu mapy | `src/map/map.js: srovnejVyrez` |
| Q13 | předukládaný seznam se před otiskem řadí | bez toho se verze cache měnila i beze změny obsahu a telefon stahoval aplikaci znovu | `vite.config.js: pluginServiceWorker` |
| **Q14** | **vizuální redesign podle grafického manuálu** | **vzhled se od originálu rozchází ve všem — nová paleta, Playfair Display, měkké karty, tmavý režim, zástupné ilustrace, Profil, dny v plánu, porovnání míst, uvítání o třech krocích. Podrobně v [VZHLED.md](VZHLED.md).** | `src/styles/tokens.css` a dál |

Nálezy mimo rozsah přestavby, které jsme se rozhodli **nechat být**, jsou v `NAPADY.md`.
