# Nápady a odložené nálezy

Odložené nálezy a nápady. **Nic z toho neimplementuju, dokud to výslovně
neodsouhlasíš** — každý bod mění chování nebo data.

N1–N10 vznikly během přestavby, kdy byla cílem parita. Ta je hotová (`PARITA.md`),
takže se dnes smějí implementovat; pořád ale až po dohodě. N11 a dál jsou nápady
k věcem, které v původní aplikaci vůbec nebyly.

---

## Vypadá to jako chyba v původní aplikaci

Nechávám 1:1, ale stojí za rozhodnutí.

**N1 — Badge u filtrů nepočítá „Musíme!"**
`index-original.html:838` sčítá `reg, zeme, typ, coll, free, kids, dogs, wow, stav`.
Filtr `fire` chybí, takže když je zapnutý jen on, na tlačítku filtrů se nic neukáže,
přestože se výsledky filtrují. Oprava = přidat `'fire'` do seznamu.

Pozor: nové filtry `ulozene` a `vPlanu` (rychlé pilulky nad mapou, srpen 2026)
se do odznaku **počítají** — žádné dědictví nedrží. Nesrovnalost je tedy jen
u `fire`.

**N2 — Záloha neukládá priority, ale obnova je čte — ~~HOTOVO~~**
Export posílal jen `notes, stav, rating, plan`, takže se plamínky zálohou ztrácely.
`zalohaData()` v `src/core/csv.js` dnes posílá i `prio`, `planDny`, `vypravy`
a `vypravaNazev`. Zpětná kompatibilita drží: staré zálohy tyhle klíče nemají
a obnova je prostě přeskočí.

**N3 — Import CSV vypne „Objevuj"**
Import nastaví u všech míst `col: []`. Kolekce i dlaždice v Objevuj pak zmizí
a nejde je vrátit jinak než přes „Vrátit vestavěná data". Řešení by bylo
kolekce dopočítat z ostatních polí, nebo je u známých id zachovat.

**N4 — „Zrušit vše" nesmaže hledání**
`#fReset` vynuluje `F` kromě `F.q`, a políčko `#q` zůstane vyplněné.

---

## Data

**N5 — Kolekce „Se psem" nemá dlaždici**
7 míst má v `col` hodnotu `psi`, ale `COLL` má jen 11 definic a `psi` mezi nimi není.
V Objevuj se proto nikdy nezobrazí. Přidat 12. definici = jednořádková změna.

**N6 — Filtr „Se psem" má skoro prázdný výsledek**
Pole `ps` je vyplněné jen u 8 z 580 míst (5× „Ano", 3× „Ne"). Filtr tedy vrací 5 míst,
i když psi jsou vítaní na spoustě dalších. Doplnění je ruční práce nad daty.

**N6b — Pět míst má v `col` stejnou kolekci dvakrát**
`polle-di-malbacco-…-863`, `cascata-di-giumaglio-…-500`, `cascata-cai-d-alto-…-594`
a `jettegrytene-nissedal-norsko-358` mají dvakrát `koupacka`,
`leiternweide-suspension-bridge-trail-274` má dvakrát `zdarma`.
Na chování to nemá vliv (filtr používá `includes`), `npm run validate` to hlásí jako
varování. Oprava = smazat duplicitu, ale je to zásah do dat, tak nechávám na tobě.

**N7 — Hledání neprohledává krátký popis (`sh`)**
Fulltext bere `n + z + r + t + p + f`. Pole `sh` má vyplněných všech 580 míst
a v seznamu se zobrazuje, ale hledat se v něm nedá.

---

## Plán a trasa

**N12 — Uložené pozice, přepočet trasy přes Mapy.com Routing API, živé sledování**

Rozpracováno, nasazeno na `main` a **vráceno revert commitem** (main dnes tuhle
funkci nemá). Celá implementace (10 commitů) zůstává nedotčená na větvi
`tadeas/work`, commity `ac8d947`..`bc567bb`. Mezitím se přestavěla záložka Plán,
takže se to nedá jen znovu mergnout — je potřeba to **přestavět podle nové podoby
Plánu**, ne zopakovat 1:1. Tenhle zápis je proto podrobný: aby šlo z hotové větve
brát kus po kuse (data, UI, routing, živé sledování jsou oddělené vrstvy), ne
všechno najednou.

*Co to bylo:* čtyři propojené funkce — (1) neomezený vlastní seznam pojmenovaných
pozic v Profilu (Domov, Práce…) s vlastním `id`, (2) start a cíl trasy šly vybrat
z uložené pozice nebo z jednorázově zjištěné aktuální GPS polohy (ne živé sledování
— to je jiná věc, viz níž), (3) tlačítko „Přepočítat" na kartě Itinerář volalo
Mapy.com Routing API pro skutečnou trasu (polyline/vzdálenost/čas) místo dosavadního
odhadu vzdušnou čarou × `KLIKATOST`, (4) živé sledování zbývající vzdálenosti/času
na kartě Na cestě a značka na mapě, striktně jen na popředí appky.

*Proč je to odložené:* API klíč od Mapy.com (typ „Vanderbuch API") má v administraci
(`developer.mapy.com`) nastavené **omezení na Referery** — jen produkční doména
`traveler-app.teddykasecky.workers.dev`. To znamená, že tvar API (přesná cesta,
formát parametru `points`, pořadí `lat`/`lon`, tvar JSON odpovědi) **nejde ověřit
přes `curl`** — Mapy.com vrací identické `{"detail":[{"msg":"Forbidden"}]}` / HTTP 403
i na zcela neplatný klíč (ověřeno srovnáním), takže 403 nerozliší „špatný request"
od „chybí prohlížečový kontext". Zkoušelo se: holý dotaz, `Referer` hlavička na
povolenou doménu, `Origin` hlavička, reálný `User-Agent`, jiné endpointy
(`geocode`, `rgeocode`, `suggest`) — všude stejná odpověď. Jediná cesta k ověření
tvaru API je reálné kliknutí v prohlížeči na doméně, kterou klíč povoluje (produkce,
nebo `localhost` po přidání do Aktivních omezení v administraci Mapy.com — na tom se
přestalo, protože se zjistilo, že tohle je potřeba udělat **předtím**, ne až po
nasazení). Klíč samotný (`BgblIMF4M6fhAqmBAEMFcKSZy6xw2O7PlZ9l4DPoXpE`) uživatel má
a appka ho zatím nikde nemá zapsaný (byl smazaný revertem).

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
10. **Zápis do dokumentace** — `STAV.md` měl sekci „čeká na váš krok" s týmiž
    třemi TODO co níž; smazána revertem, proto je teď tady.

*Co zůstalo nedořešené (tři TODO v `routing.js`, `zavolejRouting`/`zpracujOdpoved`):*
přesná cesta API (zkoušeno `/v1/routing/route`, nepodařilo se ověřit), formát/pořadí
souřadnic v parametru `points` (zkoušeno `lon,lat` podle všeobecné konvence, nepodařilo
se ověřit), tvar JSON odpovědi (`zpracujOdpoved()` je prázdná skořápka). Než se klíč
ověří naostro v prohlížeči, tohle jsou jen odhady.

*Co při přestavbě zachovat (funguje, otestované, konzistentní se zbytkem appky):*
- Duplicitní `souradniceBodu()`/`otiskBodu()`/výčet druhů v `map/planLine.js` — mapa
  nesmí importovat `views/`, appka tenhle vzor už měla (výčet `start/nocleh/cíl`).
- Živé sledování v samostatném souboru, ne v `cesta.js` — architektonicky důležité,
  ať se nesplete „trvalá ujetá trasa bez GPS" s „dočasný displej s GPS na popředí".
- `MAPY_API_KLIC` jako prázdný placeholder v kódu (appka nemá backend) — appka MUSÍ
  fungovat i bez něj (chyba, fallback na vzdušný odhad), nikdy nesmí spadnout.
- Referer omezení klíče: **až se bude znovu implementovat, nejdřív přidat
  `localhost`/`localhost:5173` do Aktivních omezení na `developer.mapy.com`**,
  než se začne cokoli testovat lokálně — jinak se celé ověřování zase zasekne na
  stejném místě.
- `main` má u sebe GitHub branch protection proti force-push — vracení už nasazené
  věci jde jen přes revert commit, ne přepsání historie.
- `scripts/smoke.mjs` má natvrdo zapsaná čísla (počet ikon ve sprite, počet položek
  v průvodci výběru polohy pro start/cíl) — při přestavbě je nutné je zase
  aktualizovat, jinak testy nahlásí falešnou chybu.

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

**N10 — Seznam se renderuje najednou**
`renderList()` má strop 250 karet a hlášku „Zobrazeno prvních 250". Není to virtualizace.
Kdyby se strop zvedal, chtělo by to lazy render. Měření přijde ve fázi 3;
bez souhlasu neměním, je to změna chování.
