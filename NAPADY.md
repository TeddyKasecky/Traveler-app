# Nápady a odložené nálezy

Odložené nálezy a nápady. **Nic z toho neimplementuju, dokud to výslovně
neodsouhlasíš** — každý bod mění chování nebo data.

N1–N10 vznikly během přestavby, kdy byla cílem parita. Ta je hotová (`PARITA.md`),
takže se dnes smějí implementovat; pořád ale až po dohodě. N11 a dál jsou nápady
k věcem, které v původní aplikaci vůbec nebyly.

---

## Vypadá to jako chyba v původní aplikaci

Nechávám 1:1, ale stojí za rozhodnutí.

**N1 — Badge u filtrů nepočítá „Musíme!" — ~~HOTOVO~~**
`index-original.html:838` sčítal `reg, zeme, typ, coll, free, kids, dogs, wow, stav`
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

**N6b — Pět míst má v `col` stejnou kolekci dvakrát**
`polle-di-malbacco-…-863`, `cascata-di-giumaglio-…-500`, `cascata-cai-d-alto-…-594`
a `jettegrytene-nissedal-norsko-358` mají dvakrát `koupacka`,
`leiternweide-suspension-bridge-trail-274` má dvakrát `zdarma`.
Na chování to nemá vliv (filtr používá `includes`), `npm run validate` to hlásí jako
varování. Oprava = smazat duplicitu, ale je to zásah do dat, tak nechávám na tobě.

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

**N15 — Počasí v plánu: dnes a zítra na kartě Na cestě**

Předpověď z Open-Meteo se od srpna 2026 nikde nevykresluje. `nactiPocasi()`
a `pocasiPodleKodu()` v `views/plan/termin.js:132-174` **zůstávají hotové
a funkční** — jen je nikdo nevolá.

*Proč to odešlo:* počasí bývalo v „Kostře cesty" nad itinerářem, kde měl
každý den svou ikonu a teplotu. Kostra zanikla (dva seznamy dnů pod sebou
nutily člověka spojovat obě půlky hlavou) a s ní i to počasí. Předpověď na
desátý den výpravy je navíc informace, podle které se nikdo nerozhoduje —
Open-Meteo dává 16 dní dopředu a poslední třetina je věštění.

*Kam patří:* na kartu **Na cestě**, kde se člověk ptá „prší dneska?" a „bude
zítra na tu ferratu počasí?". Tam je předpověď na dva až tři dny přesná
a rozhoduje se podle ní opravdu.

*Co je hotové a co ne:* volání i mapování kódů WMO na ikony (`i-sun`,
`i-rain`, `i-snow`, `i-bolt`) jsou napsané a otestované v `check-dny.mjs`.
Chybí jen vykreslení a rozhodnutí, pro který bod se předpověď tahá —
u rozjeté cesty se nabízí další cíl, ne první zastávka plánu jako dřív.
Pozor na cache: `pocasiDne` byla v `dashboard.js` jen v paměti, protože
uložená předpověď by lhala. To pravidlo platí dál.

---

## Vzhled a UX

**N8 — Kreslená scéna s dodávkou (`vanScene`)**
Ve fázi 3 zahozena — oživit ji nešlo, hero na Domů by vypadal jinak, a to je zakázané.
Kód zůstává v `reference/index-original.html:1378-1494` včetně svých šesti animací
(`vanbob`, `roadmove`, `clouddrift`, `flick`, `smokeup`, `twk`). Kdyby se někdy hodila
jako alternativa k `VAN_IMG`, dá se vytáhnout odtamtud.

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
