# Nápady a odložené nálezy

Odložené nálezy a nápady. **Nic z toho neimplementuju, dokud to výslovně
neodsouhlasíš** — každý bod mění chování nebo data.

N1–N10 vznikly během přestavby, kdy byla cílem parita. Ta skončila (`PARITA.md`),
takže se dnes smějí implementovat; pořád ale až po dohodě. N11 a dál jsou nápady
k věcem, které v původní aplikaci vůbec nebyly.

**N21–N23 jsou zbytek po auditu navigace** (srpen 2026). Zbylá zjištění z něj
jsou hotová nebo vyvrácená, takže po auditu zůstaly jen tyhle tři — a všechny
tři čekají na totéž: na číslo, jak často se kudy chodí. Bez něj je hloubka
i hustota jen tvrzení. U každého proto stojí, jaké měření by ho rozhodlo.

---

## Vypadá to jako chyba v původní aplikaci

Nechávám 1:1, ale stojí za rozhodnutí.

**N1 — Badge u filtrů nepočítá „Musíme!" — ~~HOTOVO~~**
Původní aplikace sčítala `reg, zeme, typ, coll, free, kids, dogs, wow, stav`
bez `fire`. `pocetAktivnich()` v `src/core/filters.js` teď `'fire'` počítá spolu
s ostatními přepínači — zapnutí jen „Musíme!" ukáže odznak na tlačítku Filtry.

**N2 — Záloha neukládá priority, ale obnova je čte — ~~HOTOVO~~**
Export posílal jen `notes, stav, rating, plan`, takže se plamínky zálohou ztrácely.
`zalohaData()` v `src/core/csv.js` dnes posílá i `prio`, `planDny`, `vypravy`
a `vypravaNazev`. Zpětná kompatibilita drží: staré zálohy tyhle klíče nemají
a obnova je prostě přeskočí.

**N3 — Import CSV vypne „Objevuj"**
Import nastaví u všech míst `col: []`. Kolekce i dlaždice v Objevuj pak zmizí
a nejde je vrátit jinak než přes „Vrátit vestavěná data". Řešení by bylo
kolekce dopočítat z ostatních polí, nebo je u známých id zachovat.

**N4 — „Zrušit vše" nesmaže hledání — ~~HOTOVO~~**
`resetFiltru()` v `src/core/filters.js` teď nuluje i `F.q`. `syncFiltersUI()`
v `src/components/chip.js` navíc srovnává inputy `#q`/`#qMapa` se stavem —
bez toho by pole vizuálně zůstalo vyplněné, i když `F.q` už bylo prázdné.

---

## Data

**N5 — Kolekce „Se psem" nemá dlaždici — ~~HOTOVO~~**
`COLL` v `src/data/collections.js` má 12. definici (`k: 'psi'`, ikona `i-paw` —
appka ji už používala pro pole `ps`). Dlaždice „Se psem – 7 míst" se v Objevuj
zobrazuje, žádný vykreslovací kód se měnit nemusel (`COLL.map()` je obecné).

**N6 — Filtr „Se psem" má skoro prázdný výsledek**
Pole `ps` je vyplněné jen u 8 z 580 míst (5× „Ano", 3× „Ne"). Filtr tedy vrací 5 míst,
i když psi jsou vítaní na spoustě dalších. Doplnění je ruční práce nad daty.

**N24 — Pět míst má v `col` stejnou kolekci dvakrát — ~~HOTOVO~~** (dřív vedeno jako „N6b")
`polle-di-malbacco-…-863`, `cascata-di-giumaglio-…-500`, `cascata-cai-d-alto-…-594`
a `jettegrytene-nissedal-norsko-358` mají dvakrát `koupacka`,
`leiternweide-suspension-bridge-trail-274` má dvakrát `zdarma`.
Na chování to nemělo vliv (filtr používá `includes`), ale `validate` to hlásil při
**každém** commitu do dat, takže to šumělo v každém výpisu. Smazáno v září 2026 —
pět řádků, `validate` hlásí „V pořádku" bez varování, `check-filters` 134 kombinací
a `smoke` 493/493 beze změny.

**N7 — Hledání neprohledává krátký popis (`sh`) — ~~HOTOVO~~**
`postavIndex()` v `src/core/search.js` teď zahrnuje i `sh` do indexovaného
textu. Ověřeno: hledání textu, který je jen v `sh`, teď místo najde.

---

## Plán a trasa

**N12 — Uložené pozice, přepočet trasy přes Mapy.com Routing API, živé sledování — ~~HOTOVO~~**

Implementováno a nasazené na `main`, včetně skutečného volání Mapy.com Routing
API (11 commitů na `tadeas/work`). Appka má zapsaný API klíč a `zavolejRouting()`/
`zpracujOdpoved()` odpovídají skutečnému tvaru API — ověřeno reálným voláním
v `npm run dev` (appka dostala HTTP 200, uložila skutečnou trasu a vykreslila
ji na mapě). Tenhle zápis zůstává jako referenční přehled pro budoucí zásahy
do stejné oblasti kódu (data, UI, routing, živé sledování jsou oddělené
vrstvy, viz níž).

*Co to bylo:* čtyři propojené funkce — (1) neomezený vlastní seznam pojmenovaných
pozic v Profilu (Domov, Práce…) s vlastním `id`, (2) start a cíl trasy šly vybrat
z uložené pozice nebo z jednorázově zjištěné aktuální GPS polohy (ne živé sledování
— to je jiná věc, viz níž), (3) tlačítko „Přepočítat" na kartě Itinerář volalo
Mapy.com Routing API pro skutečnou trasu (polyline/vzdálenost/čas) místo dosavadního
odhadu vzdušnou čarou × `KLIKATOST`, (4) živé sledování zbývající vzdálenosti/času
na kartě Na cestě a značka na mapě, striktně jen na popředí appky.

*Jak se API nakonec ověřilo (pro příště, kdyby se klíč měnil nebo appka
sahala na jiný Mapy.com endpoint):* klíč má v administraci
(`developer.mapy.com`) omezení na Referery. `curl` ho nešel ověřit přímo —
Mapy.com vrací identické `{"detail":[{"msg":"Forbidden"}]}` / HTTP 403 i na
zcela neplatný klíč (ověřeno srovnáním), takže 403 nerozliší „špatný request"
od „chybí prohlížečový kontext". Fungovalo ale poslat `curl` s hlavičkou
`Referer: http://localhost:5173/` (nebo produkční doména) — tenhle trik
oklame kontrolu refereru i mimo prohlížeč a jde tak zjistit skutečný tvar
API bez psaní appky naslepo. Zjištěný tvar: parametry `start`/`end`/
volitelně `waypoints` (víc bodů `;`-oddělených), všechny jako `"lon,lat"`
(ne `lat,lon`); odpověď má `length` v metrech, `duration` v sekundách,
`geometry.geometry.coordinates` jako pole `[lon,lat]` (appka je otáčí na
`[lat,lon]` pro Leaflet).

*Co bylo hotové a otestované (podle kroků, dá se brát postupně):*
1. **Datový model** — `store.ulozenePozice: []` a `store.aktivniPrepocet: null`
   v `core/store.js`, `S.zivaPoloha: null` (runtime, ne store — jiný životní
   cyklus než `S.userPos`). CRUD v `core/pozice.js` (`pridejPozici`,
   `upravPozici`, `smazPozici`, `pozice(id)`) podle vzoru `views/plan/body.js`.
   Rozšíření zálohy v `core/csv.js` (`zalohaData`/`obnovZalohu`).
2. **UI v Profilu** — nová sekce `views/profil/pozice.js` (`pozicHtml`,
   `napojPozice`), přidat/upravit/smazat, souřadnice ručně (přes
   `rozpoznejSouradnice()` z `body.js`) nebo výběrem na mapě (`vyberBod()` z
   `map/map.js`). Nová ikona `i-dum` ve `sprite.svg`.
3. **Pravidla start/cíl** — appka dřív neměla pojem „trasa má jeden start a jeden
   cíl", jen štítek `druh` na libovolném bodu. Nové: `maBod(druh)` a
   `pridejStartCil(druh, {...})` v `body.js` vynucují nejvýš jeden start a jeden
   cíl na plán, založené vždy na pevné pozici (`den:1,po:null` pro start,
   `po:null,den:null` pro cíl) — **nejde je přetáhnout jinam** (zákaz v
   drag-and-drop handleru `plan.js`, funkce uvnitř `napojTahani`). Pole `zdroj`
   na bodu (`{typ:'pozice',id}` nebo `{typ:'gps'}`) a `souradniceBodu(b)`
   dotahuje živou hodnotu pozice, ne zastaralou kopii — smazání pozice v
   profilu se tak projeví všude, kde je použitá. **Žádná migrace starých dat**
   — staré vícenásobné/neuspořádané `druh:'start'` zůstávají beze změny
   (ověřeno ručně, appka nespadne). Druhé přidání Start/Cíl se v průvodci
   zašedne — nová podpora `disabled` ve `vyberZeSeznamu()` (`components/dialog.js`).
4. **Přesun přepočtu mezi výpravami** — `aktivniZaznam()` ve `views/plan/vypravy.js`
   nese pole `prepocet`, `prepniVypravu()`/`novaVyprava()`/`smaz()` ho stěhují
   stejným vzorem jako `plan`/`planDny`.
5. **`routing.js`** (`views/plan/routing.js`, nový soubor) — `otiskBodu(body)`
   (levný hash pořadí+polohy pro poznání zastaralosti), `pocetOdkazuNaPozici(id)`
   (varování při mazání použité pozice, počítá napříč `store.bloky` všech
   výprav), `sberBoduProRouting()` (zjišťuje GPS znovu pro body se
   `zdroj.typ==='gps'`), `prepocitejTrasu()` (nikdy nehodí appku, vrací
   `{ok,chyba}`). `serazenaTrasa()` v `body.js` sesbírá zastávky+body ve
   stejném pořadí jako mapa kreslí (ověřeno testem) — **zvážit sdílet s
   `map/planLine.js#drawPlanLine`, aby se řazení nepsalo potřetí** (dřív
   zamýšleno, neudělalo se, mapa dnes řadí nezávisle).
6. **Vykreslení na mapě** — `drawPlanLine()` v `map/planLine.js` kreslí
   `store.aktivniPrepocet.polyline` místo rovné čáry, když otisk sedí; jinak
   fallback. **Ověřeno E2E** (Playwright + `page.route` mock Mapy.com API):
   po přepočtu se skutečně vykreslí zaslaná polyline (ne fallback), potvrzeno
   na SVG `d` atributu.
7. **`core/throttle.js`** a **`core/projekce.js`** (point-to-line projekce,
   rovinná aproximace s korekcí zeměpisné šířky jako `dkm()`) — čisté funkce,
   `scripts/check-projekce.mjs` 13/13, dá se převzít beze změny.
8. **Živé sledování** — `views/plan/cesta-zivot.js` (nový soubor,
   `spustSledovani`/`zastavSledovani`/`aktualniProjekce`), `watchPosition`
   throttlovaně (2 s) emituje `zivaProjekce`. **Životní cyklus ověřen
   instrumentovaným `watchPosition`/`clearWatch`**: spustí se na kartě Na cestě
   (jen když `S.activeTab==='plan'`), zastaví se při přepnutí na jinou hlavní
   záložku (nový event `zalozkaZmenena` z `core/router.js` — router nesmí
   importovat views, takže si to poslouchá `main.js`), zastaví/spustí podle
   `visibilitychange` (zhasnutí displeje). **Striktně oddělené od `cesta.js`**
   („ujetá trasa" zůstává beze GPS, viz její hlavička — živé sledování je jiná
   věc s jinými zárukami, jen v paměti, nic se neukládá).
9. **Značka na mapě** — `zivaZnacka` v `planLine.js`, `L.circleMarker` na
   `projektujNaTrasu(S.zivaPoloha, ...)`, jen za jízdy a s platným přepočtem.
   Ověřeno E2E stejně jako bod 6.
10. **Doladění API** — `MAPY_API_KLIC` zapsaný, `zavolejRouting()`/
    `zpracujOdpoved()` odpovídají skutečnému tvaru API (viz výš). Ověřeno
    reálným voláním v `npm run dev`, appka dostala HTTP 200 a vykreslila
    skutečnou trasu. `STAV.md` sekce „3a." aktualizovaná.

*Co při dalších zásazích do stejné oblasti zachovat/dodržet (funguje, otestované,
konzistentní se zbytkem appky):*
- Duplicitní `souradniceBodu()`/`otiskBodu()`/výčet druhů v `map/planLine.js` — mapa
  nesmí importovat `views/`, appka tenhle vzor už měla (výčet `start/nocleh/cíl`).
- Živé sledování v samostatném souboru, ne v `cesta.js` — architektonicky důležité,
  ať se nesplete „trvalá ujetá trasa bez GPS" s „dočasný displej s GPS na popředí".
- `MAPY_API_KLIC` je veřejná konstanta v kódu (appka nemá backend), chráněná
  referer omezením na straně Mapy.com, ne tajemstvím v appce. I tak appka
  MUSÍ fungovat i při chybě volání (offline, vypršelý timeout, budoucí
  zneplatnění klíče) — chyba se ukáže jako toast, fallback na vzdušný odhad,
  appka nikdy nesmí kvůli tomu spadnout.
- `main` má u sebe GitHub branch protection proti force-push — jakékoli vracení
  už nasazené věci jde jen přes revert commit, ne přepsání historie.
- `scripts/smoke.mjs` má natvrdo zapsaná čísla (počet ikon ve sprite, počet položek
  v průvodci výběru polohy pro start/cíl) — při dalších úpravách kolem toho je
  nutné je zase aktualizovat, jinak testy nahlásí falešnou chybu.

**N13 — Mód mapy „Na cestě", volba typu dopravy, srozumitelnější chyba 404 — ~~HOTOVO~~**

Tři menší věci z jedné dávky (srpen 2026), navazující na N12:

1. **Mód mapy „Na cestě"** (`S.mapaMod`, `core/store.js`) nahradil rychlý filtr
   „V plánu" (`F.vPlanu`, smazaný). `core/filters.js` už `F.vPlanu` nezná
   (`visible()`, `pocetAktivnich()`, `resetFiltru()` upravené). `map/map.js#draw()`
   v módu `'nacesta'` pošle `srovnejVyrez()` prázdné pole místo `visible()`,
   takže zmizí běžné špendlíky. `views/plan/cesta.js` (`zrusCestu()`,
   `ukonciCestu()`) mód vrací na `'plna'`, jakmile cesta zanikne.

   **Dovětek** (21. 8. 2026, po zpětné vazbě že přepínač „vůbec nefunguje" –
   ve skutečnosti fungoval, ale byl schovaný jako další pilulka v řadě
   rychlých filtrů `#chips` a neměnil zdroj trasy, jen viditelnost špendlíků):
   přepínač se přesunul z `#chips` do samostatné dvoustavové bubliny
   `#modMapy` pod `#podkladBtn` (online/offline), popisky „Itinerář"/„Na
   cestě" (`components/chip.js#vykresliModMapy`/`initModMapy`/`obnovModMapy`).
   Zásadní změna: `S.mapaMod` teď řídí i **zdroj trasy**, ne jen viditelnost
   špendlíků – `map/planLine.js#kresliOtiskCesty` (`jedeSe && S.mapaMod ===
   'nacesta'`) rozhoduje, jestli `drawPlanLine()` kreslí otisk `store.cesta`
   (mód „Na cestě") nebo živý `store.plan` (mód „Itinerář", i za jízdy –
   dřív appka za jízdy vždy kreslila jen otisk, živý upravovaný plán nešlo
   na mapě vůbec vidět). Prohlížení ukončené cesty z knihovny
   (`S.otevrenaCesta`) zůstává nezávislé na `S.mapaMod` – jiný stav, appka
   tou dobou nejede. Tlačítko **Přepočítat** přibylo i na kartu Na cestě
   (`views/plan/cesta.js`, `#cestaPrepocitat`, vedle „Navigovat") – počítá
   pořád `store.plan` přes stávající `prepocitejTrasu()` (`views/plan/routing.js`,
   beze změny), jen bylo dřív dosažitelné jen z karty Itinerář.

   **Druhý dovětek** (21. 8. 2026, na přání sloučit s tlačítkem online/offline):
   `#modMapy` už není samostatná dvoustavová bublina, ale jedno tlačítko
   ve stylu `#podkladBtn` se dvěma klikacími zónami. Levá obdélníková
   (`#modMapyText`) cykluje `S.mapaMod` přesně jako dřív – dostupná jen se
   `store.cesta`, jinak zašedlá (`.nejde`, stejná třída jako
   `.volbakresby.nejde`) a ukazuje natvrdo „Itinerář". Pravá čtvercová
   (`#modMapyOko`, nová ikona `i-oko-ne` ve `sprite.svg`) je **nový nezávislý
   stav `S.mistaSkryta`** (`core/store.js`) – schovává/ukazuje běžná místa
   (580 špendlíků) a funguje VŽDY, i bez cesty, nezávisle na `S.mapaMod`.
   Dřív `S.mapaMod==='nacesta'` řídilo obojí najednou (zdroj trasy
   i viditelnost špendlíků); teď `map/map.js#draw()` čte jen `S.mistaSkryta`
   pro viditelnost, `map/planLine.js#kresliOtiskCesty` dál jen `S.mapaMod`
   pro zdroj – dají se kombinovat libovolně (např. „Itinerář" se
   schovanými špendlíky).

   **Třetí dovětek** (21. 8. 2026, na přání nechat vidět „to podstatné" i po
   zapnutí oka): mód `S.mistaSkryta` dřív schoval úplně všechna běžná místa.
   Teď `map/map.js#draw()` v tomhle módu nechá vidět i **místa z košíku
   aktivní výpravy** (`store.kosik`, `views/plan/kosik.js`) a **aktuální tipy
   „Co dál?"** (`S.coDalId`, nový runtime stav v `core/store.js`) – appka
   schová jen to, co si člověk sám nevybral. `S.coDalId` zapisuje
   `views/plan/cesta.js#coDal()` při každém vykreslení karty Na cestě
   (`tipyOdsud()` z `views/plan/kosikView.js` se počítá jednou, výsledek jde
   do HTML i do `S.coDalId` zároveň) a nuluje se při Ukončit/Zrušit cestu.
   `map.js` čte `store.kosik` přímo (duplikuje malou čtecí logiku z
   `views/plan/kosik.js#kosik()`, stejný důvod jako `'Náš plán'` duplikované
   v `map/planLine.js#vlastniMista()` – mapa nesmí importovat views).
   Košíková místa a tipy se vykreslí úplně stejně jako běžné špendlíky
   (kapka, barva podle kategorie) – appka je nemá důvod vizuálně odlišovat.
   **Doplněno hned poté**: první verze zapomněla na **zastávky živého
   itineráře samotné** (`store.plan`) – uživatel je logicky čekal ve stejné
   kategorii „co sis sám vybral" jako košík/tipy. `draw()` teď skládá
   `navic` ze všech tří zdrojů najednou (`store.plan`, `store.kosik`,
   `S.coDalId`).

   **Čtvrtý dovětek** (21. 8. 2026, na přání přepočítat OTISK cesty, ne živý
   plán): tlačítko `#cestaPrepocitat` na kartě Na cestě do teď volalo stejnou
   `prepocitejTrasu()` jako Itinerář – počítalo `store.plan`, i když appka
   jela podle otisku (`store.cesta.zastavky`), který se za jízdy nemění.
   Nová funkce `prepocitejOtiskCesty()` (`views/plan/routing.js`) počítá
   `serazenaTrasa(store.cesta.zastavky, store.cesta.dny)` (funkce teď bere
   volitelné parametry, výchozí `store.plan`/`store.planDny` beze změny pro
   Itinerář) a zapisuje do **nového pole `store.cesta.prepocet`** – oddělené
   od `store.aktivniPrepocet`, který patří aktivní VÝPRAVĚ (živému plánu), ne
   rozjeté CESTĚ. `ukonciCestu()` kopíruje `prepocet` do archivu, ať o
   spočítanou trasu nepřijde ani ukončená cesta. `map/planLine.js` dřív navíc
   nikdy nepoužil skutečnou trasu pro čáru v módu „Na cestě" (`prepocet` byl
   vždy `false`, protože `otisk` je tam vždy pravdivé) – teď čte
   `otisk.prepocet` místo `store.aktivniPrepocet`, když se kreslí otisk.
   Ověřeno E2E (mock Mapy.com API): úprava živého plánu za jízdy nemá vliv
   na přepočet cesty, otisky se shodují se zastávkami cesty, ne s upraveným
   plánem, a skutečná trasa se v módu „Na cestě" vykreslí na mapě.
2. **`prefs.routeType`** (`core/store.js`) — globální předvolba typu dopravy
   pro přepočet trasy (auto/kolo/pěšky), segment v Nastavení, čte ji
   `zavolejRouting()` v `views/plan/routing.js` místo natvrdo `'car_fast'`.
3. **Srozumitelnější chyba při HTTP 404** z Routing API — `zavolejRouting()`
   čte `errorCode` z těla odpovědi (7/9 = bod mimo síť dopravy, typicky
   ostrov/moře) a ukáže vysvětlující hlášku místo holého čísla stavu.
   API nemá parametr pro „povolit trajekty" — přes otevřený oceán trasa
   prostě neexistuje.

Připraveno i needitovatelné místo pro budoucí vlastní API klíč Mapy.com
v Nastavení (`.volbaapiklic.nejde`) — appka zatím používá jeden sdílený
klíč pro všechny, žádná zapisovací logika zatím neexistuje.

Zdánlivý bug „na mapě se po přepočtu nic nezobrazí", který tuhle dávku
vyvolal, nebyl chyba v kódu — appka kreslila otisk aktivní cesty
(`store.cesta.zastavky`) místo živého plánu, a bez vizuálního rozlišení to
splynulo. Podrobně v `BUGS.md` B1.

**N16 — Smazat ukončenou cestu — ~~HOTOVO~~**
Archiv „Za námi" šel jen prohlížet. Dnes jde ukončenou cestu smazat, a **jen
z Itineráře** — tlačítko vedle „Odemknout poznámky" v zamčené kartě,
s potvrzením. Řádek v archivu nabídku nemá, stejně jako řádek výpravy
v knihovně: akce patří dovnitř, ne do seznamu. Smazání nuluje
`S.otevrenaCesta` a pouští `uklidTrasy()`; **získané achievementy zůstávají**
– smazání cesty není popření, že se jela.

> Tenhle záznam byl v srpnu 2026 z `NAPADY.md` **smazán** místo označení za
> hotový (commit `0405ec4`), takže odkaz „N16" v `CLAUDE.md` půl roku visel do
> prázdna. Proto se hotové položky **nemažou** — dostanou `~~HOTOVO~~`.

**N14 — „Co dál?" na kartě Na cestě počítá jen vzdušnou vzdálenost**

Tipy na pokračování (`src/views/plan/kosikView.js#tipyOdsud()`/`coDalHtml()`,
řádky 375-444) ukazují tři nejbližší místa mimo itinerář, seřazená a popsaná
podle vzdušné vzdálenosti (`dkm()` × `KLIKATOST` / `RYCHLOST`, funkce
`dobaJizdy()` na řádku 54) — ne podle skutečné trasy po silnici.

Není to nedodělek: appka pro tyhle body nikdy nevolala Mapy.com Routing API.
`store.aktivniPrepocet` je trasa jen **mezi zastávkami itineráře**
(start→waypoints→cíl, `views/plan/routing.js`), ne k libovolnému bodu mimo
plán — tipy jsou právě takové body, takže žádná uložená trasa pro ně
neexistuje. Vzdušný odhad je navíc konzistentní se zbytkem appky (dashboard,
`views/plan/plan.js` dělají totéž).

Aby se u tipů ukázala skutečná vzdálenost po silnici, musela by appka poslat
**samostatné volání `zavolejRouting()`** pro dvojici odkud→tip, u každého ze
tří tipů zvlášť — tedy až tři nová síťová volání na Mapy.com při každém
otevření karty Na cestě. Než se do toho půjde, zvážit dopad na limity API
a zpoždění vykreslení karty (dnes se tipy počítají synchronně, bez čekání
na síť).

---

**N15 — Počasí v plánu: dnes a zítra na kartě Na cestě — ~~SPLYNULO S N19~~**

Napsáno v době, kdy se předpověď nevykreslovala vůbec. **Ta premisa už
neplatí:** `nactiPocasi()` volá `components/pocasi.js:75` a na Domů je celý
pruh hodin i dnů. To, co z N15 zbývalo — počasí na kartě Na cestě — je
doslova druhá odrážka N19, takže by to tu leželo dvakrát.

Zůstává jediné, co N19 neneslo, a je to přeneseno k němu: **uložená předpověď
u dne by lhala**, proto byla `pocasiDne` v `dashboard.js` jen v paměti.

---

## Vzhled a UX

**N8 — Kreslená scéna s dodávkou (`vanScene`) — ~~ZAHOZENO~~**
Není to nápad, je to rozhodnutí: ve fázi 3 zahozena — oživit ji nešlo, hero na Domů
by vypadal jinak, a to je zakázané.
Kód byl v původní aplikaci na řádcích 1378–1494 včetně svých šesti animací
(`vanbob`, `roadmove`, `clouddrift`, `flick`, `smokeup`, `twk`). Předloha se v srpnu
2026 smazala, ale zůstává v historii repozitáře — `git show 75d976c:reference/index-original.html`
ji vypíše, kdyby se scéna někdy hodila jako alternativa k `VAN_IMG`.

**N21 — Mezi ťuknutím na místo a jeho detailem je 450 ms**
Ťuknutí na kartu místa na Domů, v Objevuj, v Seznamu ani v plátu uložených
pod mapou detail neotevře. Přepne se na Mapu, `goTo()` k místu přiletí
(`flyTo`, 0,8 s) a detail otevře až `setTimeout` na **450 ms**
(`src/map/map.js:231`). Vedle toho existuje druhá cesta, okamžitá: ťuknutí
na špendlík emituje `otevriDetail` rovnou (`src/map/map.js:207`).

Jsou to tedy dvě různě rychlé cesty ke stejnému výsledku a ta pomalejší je
ta, kterou nabízejí čtyři obrazovky z pěti. Detail místa je přitom nejspíš
nejotevíranější věc v celé appce, takže se těch 450 ms nesčítá jednou,
ale stokrát.

**Jaké měření by to rozhodlo:** poměr otevření detailu přes kartu proti
otevření přes špendlík. Když přes kartu chodí většina, platí většina daň za
animaci, o kterou nestála. Nesbírá se to — nejlevnější je čítač v `goTo()`
a v obsluze špendlíku, oba do `prefs` ve stejném tvaru jako `moodUse` (N9).

**N22 — Itinerář má osmnáct různých ovládacích prvků naráz**
Změřeno v prohlížeči na 390 × 844 na nerolovaném přehledu výpravy: **20 prvků
viditelných současně, z toho 18 navzájem odlišných** (zbytek jsou opakující se
položky seznamu). Stálý chrome — spodní lišta a hlavička — se do toho
nepočítá. Je to nejhustší obraz v appce; remízu s ním má jen panel Filtry.
Není to délkou seznamu, ale počtem různých věcí: `plan.js` sám nese 22 výskytů
`data-act` v jedenácti různých akcích a `src/views/plan/` má 18 souborů.

Otázka, na kterou zatím nemám odpověď: dělá Itinerář opravdu šestkrát víc
práce než ostatní obrazovky, nebo je jen šestkrát nepřehlednější? Bez čísla
je obojí stejně pravděpodobné.

**Jaké měření by to rozhodlo:** kolik z těch osmnácti prvků se za jednu
výpravu opravdu použije. Při pěti je zbylých třináct nepřehlednost, při
patnácti je ta hustota zasloužená. Sebralo by se čítačem na `data-act`
v `plan.js` — jedno místo, jeden objekt v `prefs`, opět tvar `moodUse`.

**N23 — Košík se možná otevírá v každém úkolu, ne občas**
Plát košíku je na dva dotyky (Plán → kolečko vpravo dole) a v přehledu to
vypadá nenápadně. Jenže jestli se na cestě otvírá pokaždé, když se přidává
zastávka, je to nejpoužívanější překryv v appce a druhý dotyk je o jeden moc.

**Jaké měření by to rozhodlo:** kolikrát za jednu cestu se otevře plát košíku
proti tomu, kolikrát se otevře Itinerář. Čítač patří do `otevriKosikPlat()`
(`src/components/kosikFab.js:75`).

**N9 — Nálady na Domů podle četnosti použití**
`prefs.moodUse` počítá, kolikrát jsi kterou náladu použila. Nikdy se to nečte.
Data se sbírají už teď, takže by šlo nálady řadit podle oblíbenosti — ale změnilo by to
pořadí dlaždic, tedy vzhled.

---

## Offline mapa

**N11 — Tlačítko „přepnout na zjednodušenou mapu" — ~~HOTOVO~~**
Pilulka vlevo nahoře nad mapou (`#podkladBtn`) přepíná mezi online mapou z OpenStreetMap
a malovanou offline mapou. Volba se pamatuje v `prefs.podklad`, výchozí je online.
Řeší to i původní důvod: při slabém signálu už mapa nevypadá roztrhaně, protože se
dlaždice dají vypnout úplně.

---

## Výkon

**N10 — Seznam se renderuje najednou — ~~ČÁSTEČNĚ HOTOVO~~**
`renderList()` v `src/views/list/list.js` má pořád strop 250 karet a pořád
kreslí najednou (žádná virtualizace) — ale místo statické hlášky „Zobrazeno
prvních 250" je teď tlačítko „Zobrazit dalších 50", které limit zvedá po
kliknutí (proměnná `zobrazeno`, resetuje se na 250 při každé změně sady
filtrovaných míst). U celého seznamu (580 míst bez filtru) to znamená dvě
kliknutí navíc, ne skok na plný výpis. Skutečná virtualizace/lazy render
zůstává neřešená — pořád stojí za měření, kdyby strop rostl výš.

---

## Nástroje a workflow

Nápady k tomu, jak se na projektu pracuje, ne k tomu, co appka umí.

**N17 — Worker nehlídá, jestli `id` ve složce `debug/` už je**
Když se táž poznámka odešle dvakrát, vzniknou dva soubory s týmž záznamem —
stalo se to hned první den provozu (`tadeas-f32-008` v `2026-08-26-1835`
i `-1836`). Appce to nevadí (rejstřík si vybere nejnovější), a právě proto se to
tiše hromadí. `debug-cerstvost.mjs` duplicitu **odhalí**, ale nezabrání jí,
a commity z Workeru navíc obcházejí pre-commit hook, takže se na ně
`debug-uklid --kontrola` nikdy nespustí.

**Pozor na past:** appka **schválně posílá znovu záznam, který se od odeslání
změnil** (`views/debug/debugExportUI.js:71`). Pravidlo „id už ve složce je →
odmítnout" by tenhle tok rozbilo. Porovnávat se proto musí **obsah sekcí**, ne
`id`. Bajtové porovnání celého souboru nestačí taky — hlavička nese čas
generování, takže dva odeslané exporty nikdy nejsou shodné.

Dvě cesty, dají se i zkombinovat:
- **Kontrola ve Workeru** — před zápisem se zeptat GitHubu, jestli některý soubor
  ve složce ten záznam nenese, a odpovědět „už tam je". Přesnější: duplicita
  vůbec nevznikne. Znamená to ale číst obsah složky při každém odeslání.
- **GitHub Action** — po commitu do `debug/` pustit `debug-uklid` a výsledek
  commitnout. Pokryje i to, na co Worker nedosáhne (třeba ručně uložený export),
  ale uklízí až po sobě, ne před.

**N18 — nepotvrzeno: ukládá se „odesláno" spolehlivě? — ~~PROVĚŘENO~~**
Podezření znělo: kdyby se `otiskExportu` po úspěšném odeslání neuložil (plná
paměť, chyba v `ulozDebug`), hlásila by appka záznam pořád jako neodeslaný
a člověk by ho posílal donekonečna.

**Ten mechanismus je ošetřený.** `views/debug/debugExportUI.js:177` dělá
`if (!(await ulozDebug())) return toast('Označení se neuložilo – v telefonu
došlo místo')`. Výsledek zápisu se nezahazuje a člověk se to dozví, takže
tichá varianta, které se podezření bálo, nastat nemůže.

Zbývá tedy to obyčejné vysvětlení — nebylo vidět potvrzení, tak to člověk
zkusil znovu. Aby z toho nevznikly dvě kopie, je N17.

**N19 — Počasí i u dnů v Itineráři, u míst a na kartě Na cestě**
Hlášení `pc-tadeas-001` chtělo počasí na čtyřech místech. První etapa (srpen
2026) udělala jen **předpověď u tvé polohy na Domů**; datová vrstva
(`components/pocasi.js`, `core/pocasiDb.js`) je psaná tak, aby ji zbylé tři
obrazovky jen použily. Co je z rozpravy už rozhodnuté, ať se příště nezačíná
od dotazů:

- **Dny v Itineráři** — počasí u každého dne. Souřadnice **z každé zastávky
  zvlášť**, ne z první nebo z těžiště; Open-Meteo umí víc bodů v jednom
  dotazu (`latitude=a,b,c`), takže dvacet zastávek není dvacet volání.
  Datum dne dá hotová `datumDne()` v `views/plan/termin.js`.
- **Karta Na cestě** — nejbližší hodiny u dalšího cíle („za dvě hodiny tam
  začne pršet").
- **Detail místa** — předpověď pro jeho souřadnice.

**Uložená předpověď u dne by lhala** (přeneseno z N15): `pocasiDne` byla
v `dashboard.js` schválně jen v paměti. To pravidlo platí dál — v IndexedDB
leží předpověď u *polohy*, ne u dne výpravy.

**N20 — Klimatický normál za obzorem předpovědi**
Předpověď dosahuje 16 dní dopředu, takže výprava plánovaná na příští léto
počasí mít nemůže. Open-Meteo má i historická data zdarma, takže by šlo
ukázat dlouhodobý průměr: „v půlce srpna tam bývá 24 °C". **Odlišit
popiskem, ne barvou** — normál není předpověď a nesmí se s ní splést.
Rozhodnuto v téže rozpravě jako N19.
