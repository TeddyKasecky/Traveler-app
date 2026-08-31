# Nedodělky a zjištěné závady

Na rozdíl od [`NAPADY.md`](NAPADY.md) (nápady a vylepšení, čeká se na dohodu,
*jestli* se má něco dělat) je tohle pro věci, které appka měla dělat správně,
ale nedělá — hlavně takové, na které narazí druhý člověk při mergi nebo
vlastním testu appky a nemůže je hned sám dořešit (např. rozdělaná práce na
stejném místě, na kterou druhá osoba přijde nehotovou). Zapisuje se sem i
rozdělaná práce, co zůstala nehotová, ať to při dalším mergi nezapadne.

Vyřešené záznamy zůstávají v souboru s `~~VYŘEŠENO~~` — je to i doklad, že
se to prošetřilo a proč (nebo že se v kódu nakonec nic neopravovalo).

---

**B1 — Na mapě zdánlivě chybí čára trasy — ~~VYŘEŠENO~~**
Zjištěno: 20. 8. 2026, uživatel při testu tlačítka Přepočítat.
Stav: vyřešeno diagnostikou, nebyla to chyba v kódu.

Appka se zdánlivě chovala, že po založení výpravy a Přepočítání se na mapě
nezobrazí žádná čára trasy — ani dnešní výchozí fallback (vzdušná spojnice
bodů), natožpak skutečná trasa z Mapy.com Routing API. Diagnostikováno jako
zdokumentovaný záměr, ne chyba: `src/map/planLine.js:132-136` — když existuje
aktivní cesta (`store.cesta`, po stisku Vyjet), `drawPlanLine()` kreslí
**otisk té cesty** (`store.cesta.zastavky`, pořízený v okamžiku vyjetí), ne
živý `store.plan`, se kterým se právě pracuje v Itineráři. Uživatel měl
v okamžiku testu aktivní „Na cestě" ze dřívějška, takže editace/přepočet
živého plánu se na mapě neprojevily — appka pořád kreslila starý otisk.

Ověřeno reprodukcí: appka bez aktivní cesty vykreslila trasu (vzdušnou i po
přepočtu) správně napoprvé.

Řešeno tím, že appka dostala mód mapy „Na cestě" (`NAPADY.md` N13,
`S.mapaMod`), který uživateli jasně ukáže, na co se dívá — dokud appka
nerozlišovala vizuálně „živý plán" od „aktivní cesta", bylo snadné se
splést. V `map/planLine.js` se nic neopravovalo, chování je správné.

---

**B2 — Mini-mapa na dashboardu ignorovala skutečnou trasu — ~~VYŘEŠENO~~**
Zjištěno: 21. 8. 2026, uživatel po mergi Aniččina dashboardu (košík/termín).
Stav: opraveno.

Po sloučení `tadeas/work` (mód mapy, routing) do `main` zůstala mini-mapa na
dashboardu výpravy (`src/views/plan/plan.js#vykresliMapuDashboardu()`,
`<div id="dashMapa">` v `dashboard.js`) u vzdušné spojnice zastávek natvrdo
— tlačítko Přepočítat sice uložilo skutečnou trasu z Mapy.com Routing API do
`store.aktivniPrepocet` a hlavní mapa (`map/planLine.js`) ji správně
vykreslila, ale dashboard mini-mapu nikdo neaktualizoval, protože vznikla
nezávisle na routingu a nikdy s `aktivniPrepocet` nepočítala.

Opraveno stejným vzorem jako `map/planLine.js:196-201`: `plan.js` teď
importuje `otiskBodu` z `routing.js` a před vykreslením čáry porovná otisk
zastávek s `store.aktivniPrepocet.otisk` — když sedí, kreslí se skutečná
`polyline`, jinak fallback (vzdušná spojnice, jak dřív).

**Dovětek** (21. 8. 2026): první verze opravy počítala otisk jen ze
`store.plan` zastávek (`body`), takže u výprav s vlastními body trasy
(start/nocleh/cíl z `store.bloky`) se otisk nikdy neshodoval se skutečným
přepočtem — `views/plan/routing.js#sberBoduProRouting()` totiž posílá do
Mapy.com API množinu bodů ze `serazenaTrasa()` (`views/plan/body.js`), NE
jen zastávky. Opraveno importem `serazenaTrasa` přímo do `plan.js` (views/
smí importovat views/, na rozdíl od `map/`, které `serazenaTrasa()` proto
duplikuje jako `vlastniMista()` v `planLine.js`) a počítáním otisku z ní
místo z `body`. Markery (špendlíky) na dashboardu dál kreslí jen `body`
(`store.plan` zastávky) beze změny — ty vlastní body jako špendlíky
nekreslily ani předtím, mění se jen zdroj pro čáru/otisk. Ověřeno E2E
(Playwright, mock API): výprava s vlastním bodem trasy má
`store.aktivniPrepocet.otisk === otiskBodu(serazenaTrasa())` po přepočtu,
dashboard vykreslí skutečnou `polyline`.

---

**B3 — Přepočet otisku cesty se nikdy nezobrazil s vlastními body v plánu — ~~VYŘEŠENO~~, ale řešení se v srpnu 2026 obrátilo (viz dovětek)**
Zjištěno: 21. 8. 2026, uživatel po zavedení `prepocitejOtiskCesty()` –
appka hlásila „Trasa přepočítána", ale na mapě v módu „Na cestě" zůstávala
vzdušná čára.

Opačná chyba než B2: `prepocitejOtiskCesty()` počítala otisk přes
`serazenaTrasa(c.zastavky, c.dny)` **se** zapnutými vlastními body
(`zahrnoutVlastniBody` výchozí `true`), ale `map/planLine.js#drawPlanLine()`
u otisku cesty vlastní body do `body` NEZAHRNUJE (`mista = otisk ? [] :
vlastniMista()`, řádek 144) — takže `otiskBodu(body)` počítaný při kreslení
nikdy neodpovídal uloženému `otisk` v `store.cesta.prepocet`, `platny` bylo
vždy `false` a appka tiše spadla na fallback. Projevilo se jen u výprav
s aspoň jedním vlastním bodem (start/nocleh/cíl/vlastní) — bez nich měl
`serazenaTrasa()` v obou variantách stejný výsledek, takže první ruční test
(bez vlastních bodů) chybu neodhalil.

Opraveno přidáním parametru `zahrnoutVlastniBody` do
`views/plan/body.js#serazenaTrasa()` (výchozí `true`, beze změny pro živý
plán) a voláním `serazenaTrasa(c.zastavky, c.dny, false)` v
`prepocitejOtiskCesty()` — stejná množina bodů, jakou `planLine.js` používá
pro otisk. Ověřeno E2E (Playwright, mock API): výprava s vlastním bodem
(`druh: 'start'`) má po přepočtu `store.cesta.prepocet.otisk` shodný s
`otiskBodu(serazenaTrasa(c.zastavky, c.dny, false))`, na mapě se v módu
„Na cestě" vykreslí skutečná polyline (ne fallback).

---

**B4 — Přetažení zastávky do jiného dne se projevilo jako prohození — ~~VYŘEŠENO~~**
Zjištěno: 24. 8. 2026, uživatel při přípravě přestavby Plánů — „stále je
problém házet více událostí do jednoho dne, pokud je tam jedna událost;
v tuto chvíli se pouze prohodí události".

Tažení v itineráři (`views/plan/plan.js#napojTahani()`) při puštění zastávky
přeskládalo `store.plan`, ale **`store.planDny` nechalo beze změny**:

```js
store.plan.splice(kde, 1)
if (kam > kde) kam--
store.plan.splice(kam, 0, id)
save()          // ← planDny se nikdy nezapisovaly
```

`dnyPlanu()` pak plán rozřezal podle STARÝCH délek. U dnů s jednou zastávkou
(délky `[1,1]`) byl efekt nejvýraznější: přesun A za B dal `plan = [B,A]`,
délky pořád `[1,1]`, tedy den 1 = B, den 2 = A — vypadalo to, že se zastávky
prohodily, místo aby se jedna přestěhovala.

Druhá, tišší část téže chyby: cíl puštění se hledal jako **nejbližší zastávka
nad novou polohou**, takže do prázdného dne se nedalo pustit nic (prázdný den
žádnou zastávku nemá a kotva spadla do dne nad ním). A bod trasy puštěný bez
kotvy dostal natvrdo `den: 1`, takže z pátého dne skočil na začátek prvního.

Opraveno vytažením zápisu do datové vrstvy: nová `presunZastavku(id, doDne,
poId)` ve `views/plan/dny.js` pracuje nad `dnyPlanu()` (pole polí) a výsledek
zapisuje přes `nastavDny()`, které odmítne rozdělení s nesedícím součtem —
takže se zastávka nemůže ztratit. Cílový den určuje nová `denPodPrstem(y)`
v `plan.js` z **hlaviček dnů** (`.denhd[data-den]`), ne ze sousední zastávky;
hlavičky se při tažení zastávky neposouvají, takže jejich změřená poloha
odpovídá tomu, co je vidět na obrazovce. `poDrop` se navíc volá i při
`cil === start` — poslední zastávka dne puštěná do prázdného dne pod ním
v seznamu nikoho nepřeskočí, a dřívější `if (cil !== start)` ji zahodilo.

Ověřeno `npm run check-dny` (10 nových bodů, 167/167): přesun do dne
s jedinou zastávkou, do prázdného dne, přes dva dny zpět, bez kotvy, s kotvou
z cizího dne, puštění na místě (nezapisuje), den mimo rozsah, neznámé id.


---

**B5 — Trasa rozjeté cesty vedla mimo nocleh, start i cíl — ~~VYŘEŠENO~~**
Zjištěno: 24. 8. 2026, uživatel po zavedení mini-mapy na kartě Na cestě —
„stále dashboard v Na cestě ukazuje trasu jen mezi uloženými lokacemi;
co vlastní body, start, cíl, nocleh a podobně".

Vlastní body se u OTISKU cesty ignorovaly na všech třech místech naráz:

1. `map/planLine.js:144` — `const mista = otisk ? [] : vlastniMista()`,
   takže hlavní mapa je u rozjeté i ukončené cesty nekreslila vůbec;
2. `views/plan/routing.js#prepocitejOtiskCesty()` posílala do Mapy.com
   `serazenaTrasa(c.zastavky, c.dny, false)`, tedy jen zastávky z databáze —
   skutečná trasa tedy vedla mimo nocleh, i když se přes něj jede;
3. mini-mapa (`views/plan/dashMapa.js`) skládala vzdušný fallback z `mista`,
   tedy zase jen ze zastávek.

Body 1 a 2 se držely navzájem: bod 2 byl **oprava B3** a stál na tom, že
mapa vlastní body u otisku nekreslí. Bylo to konzistentní, ale konzistentně
špatně — cesta jede přes start, nocleh i cíl, takže na trase být mají.

Opraveno obrácením původního rozhodnutí: `planLine.js` kreslí vlastní body
i u otisku (pod `otisk.nazev`, ne pod aktivní výpravou — za jízdy se dá
výprava přepnout a připletly by se cizí body), `prepocitejOtiskCesty()` je
posílá do routingu a mini-mapa staví vzdušný fallback z `proOtisk`, tedy
z přesně té množiny bodů, která šla do Mapy.com. Otisky se tak pořád
shodují — jen na vyšší, správnější množině.

Třetí parametr `serazenaTrasa()` se přitom změnil z booleanu na **seznam
bodů**: karta Na cestě potřebuje bloky pod `store.cesta.nazev`, ne pod
aktivní výpravou, a přepínač „ano/ne" na to nestačil.

Ověřeno `npm run check-dny` (5 nových bodů, 187/187): trasa cesty
s noclehem má tři body a nocleh stojí za svou zastávkou; s prázdným
seznamem bodů zůstanou jen zastávky; bod odložený do košíku (`vKosiku`)
se do trasy nepočítá.

---

## Rozdělaný vícenásobný filtr a nálady (srpen 2026)

**Stav: rozpracované na větvi `tadeas/work`, NENÍ na `main`.** Ze čtyř hlášení,
která se dělala v jedné dávce, jsou dvě hotová a nasazená (`tadeas-f32-018`
dlaždice v Itineráři, `tadeas-f32-015` řazení od nejbližšího), zbylá dvě ne.

### `tadeas-f32-014` — vícenásobný filtr v Seznamu (napsané, NEDOVĚŘENÉ)

Kód hotový: `F.reg`, `F.zeme` a `F.typ` jsou množiny jako `F.kat`, čtyři
`<select>` nahradila mřížka 2×2 tlačítek otevírajících `vyberVice()`,
přibylo rušítko filtrů (`#listZrusFiltry`, ikona `i-filtr-ne`) a hledání
v dialogu od třinácti položek výš.

Ověřeno: `check-filters` 134 kombinací sedí proti **nedotčené** opsané funkci
z původní aplikace, plus nové kombinace se dvěma a třemi hodnotami měřené
proti sjednocení jednohodnotových běhů. Obojí prověřeno dvěma mutacemi jádra
(chybějící `.size`, porovnání špatného pole) — kontrola je hlasitě chytila.
`npm run smoke` 480/480. V prohlížeči: Rakousko 77 míst, Rakousko + Itálie
217, oblastí se nabídne 24 místo 117 a „tyr" je zúží na jednu.

**Dověřeno a nasazeno.** Návratový kód 4, kvůli kterému to tu leželo jako
blokované, **nebyl skutečné selhání** — přišel z řetězeného příkazu, ne ze
smoke. Samotné `smoke:single` dává 432/432. Doběhlo i `check-debug` 199/199,
`check-regrese` 26/26, `check-dny` 203/203, `check-uloziste` 36/36,
`check-tokeny` 7/7, `check-ikony` 8/8 a `smoke` 480/480.

Snímky proti `main`: jediný rozdíl je `4-seznam-svetly` (7 %), protože mřížka
2×2 je vyšší než původní posouvací pruh a obsah pod ní se posunul. Ostatních
sedm obrazovek na nule — `7-filtry-svetly` se nehnul, panel Filtry se neměnil.

**Poučení:** řetězit `build && smoke && build && for …` do jednoho příkazu se
nevyplácí. Návratový kód pak nepatří tomu, co si člověk myslí, a vypadá to
jako selhání kontroly.

Pozor na jednu past, která je už opravená, ale stálo to hledání: `F` se čte
i dynamicky přes `F[klic]`, což grep na `F.zeme` nenajde. Tak se skoro
propašovalo „země [object Set]" do kontextu **každého** debug záznamu
(`core/debugKontext.js`) — množina je vždycky pravdivá a `${Set}` vypíše
`[object Set]`. Opraveno, ale `check-debug` na to pořád nemá bod; ten měl
podle plánu přibýt a nepřibyl.

### `tadeas-f32-011` — nálady (NEZAČATO)

Nesaháno vůbec. Podle domluvy celé: `HOME_MOODS` z šesti na šestnáct
(nepovinné pole `f` pro filtry mimo kategorie — `free`, `kids`, `wow`),
výběr v Profilu jako čtvrtá sbalitelná skupina nad `prefs.nalady`
s výchozími dnešními šesti, a pilulky v Objevuj zalomit místo posouvání
do strany. „Se psem" schválně vynechat — filtr vrací pět míst (N6).
`smoke` má natvrdo `#panelProfil .sbalka` = 3, po přidání skupiny se to
musí zvednout na 4.

---

## Jednosouborová varianta má jít pryč (srpen 2026, k rozhodnutí)

**Nasazuje se jedině `dist/`.** `wrangler.jsonc` míří na `./dist`, Cloudflare
staví z GitHubu a `dist-single/` nebylo v gitu nikdy. Jediný důvod, proč
existuje, je zapsaný v `src/data/kategorieFoto.js`: *„ten soubor se nosí na
flashce a posílá mailem"* — tedy cesta, kterou dnes nahradila beta na
`traveler-app-beta.teddykasecky.workers.dev` a offline režim PWA.

Co to stojí:

- **osm zdrojáků** větví přes `import.meta.env.SINGLE_FILE` (`intro.js`,
  `kategorieFoto.js`, `podklad.js` 2×, `vektory.js`, `register.js`,
  `debugExportUI.js`),
- **`smoke.mjs` má celou druhou větev** (`--single`, dnes 417 kontrol),
  kterou je nutné projet u každé změny,
- `kategorieFoto.js` kvůli tomu drží **dvě sady ilustrací** (malé a velké),
- **79 zmínek v dokumentaci**.

Konkrétní cena: rozdělaný vícenásobný filtr výš neblokuje nic jiného než
`smoke:single` — tedy kontrola varianty, která nemá kam být nasazená.

Návrh: `build:single` a `smoke:single` zrušit, větve `SINGLE_FILE` vyhodit
(zůstane vždy ta „normální" cesta), `kategorieFoto.js` sjednotit na jednu
sadu a projít dokumentaci. **Je to na rozhodnutí, ne na tichý úklid** —
smazáním se ztratí možnost poslat appku mailem někomu, kdo si ji nechce
instalovat.

---

## B6 — smazání výpravy nechá člověka v Itineráři, který už neexistuje

**Doloženo pokusem v prohlížeči, ne čtením kódu.** Ve zdroji to poznat nejde:
`plan.js:1700` výpravu smaže, ale `dil` nechává na `'itinerar'`, a co se stane
s obrazovkou, se dá zjistit jedině tím, že si to člověk zkusí.

Postup: plán o třech zastávkách, otevřít Itinerář ťuknutím na výpravu
v knihovně, „…" → Smazat výpravu → potvrdit.

Co se stane:

| | před | po |
|---|---|---|
| drobečky `#planZpet` | ano | **ano** |
| zastávek v `#planWrap` | 3 | **0** |
| nadpis | `ITINERÁŘ Testovací` | **`ITINERÁŘ Náš plán`** |

Člověk tedy zůstane stát v Itineráři výpravy, kterou právě smazal. Prázdný
stav se navíc **převlékne za „Náš plán"** — to je fantomová prázdná bezejmenná
výprava, kterou `CLAUDE.md` popisuje v sekci „Plán, cesty a bloky". Je to
zamýšlený mechanismus, ale tady vypadá, jako by se smazáním jedné výpravy
objevila jiná.

Pro srovnání: **„Smazat cestu" v zamčeném Itineráři to dělá správně**
(`cesta.js:406`) — drobečky zmizí a appka se vrátí do knihovny „V plánu".
Dvě sousední mazací akce ve stejné obrazovce se tedy chovají opačně.

**Opraveno** (commit `2f7efa4`): `plan.js` v obsluze `#planSmaz` nastaví
`dil = 'vypravy'` před `draw()`, tedy přesně to, co u ukončené cesty dělá
`poSmazani`. Ověřeno v prohlížeči — drobečky po smazání zmizí a knihovna
napíše „Zatím tu není žádná výprava". `smoke` 481/481, `check-dny` 203/203.
Vedeno v `NAVIGACE.md` jako Z01.

**Oprava odhalila B7**, který je o testech, ne o Plánu — viz níž.

---

## B7 — smoke tuhle chybu nehlídalo, ale kódovalo

Když jsem opravil B6, `smoke` spadlo. Ne proto, že by oprava něco rozbila:
úklid po smazání výpravy sahal rovnou na `#planVice`, tedy na tlačítko, které
existuje **jen v Itineráři**. Test se tím spolehl na to, že člověk po smazání
v Itineráři zůstane — a to je právě ta vada.

```js
// scripts/smoke.mjs, před opravou (dnes ř. 1958–1962)
await page.evaluate(() => document.getElementById('planVice').click())
await page.evaluate(() => document.getElementById('planSmaz').click())
await page.click('#dialogAno')
// …a hned nato zase #planVice, bez jediné kontroly, kde vlastně jsme
```

481 kontrol tedy neprošlo **navzdory** vadě, ale **díky** ní. Prošly by i po
opravě druhým směrem — kdyby se appka po smazání začala chovat jakkoli jinak,
jen když by v tom stavu zůstalo tlačítko „…".

### Proč to nechytila ani prázdná pojistka

Zkusil jsem mutaci: vyhodit ze `smoke` řádek, který nabídku „…" otevírá, aby
se na `#planClear` klikalo do zavřené nabídky. Test spadl — ale takhle:

```
page.evaluate: TypeError: Cannot read properties of null (reading 'click')
```

To není kontrola, to je pád. Nikde nezazní, co se čekalo. **Chytne se tím jen
„prvek chybí", nikdy „prvek je tam, ale jsme ve špatném stavu"** — a B6 byl
přesně ten druhý případ: `#planVice` v Itineráři smazané výpravy pořád byl.

### Kde jinde v tom souboru je totéž

Změřeno, ne odhadnuto.

**a) Klik, který obchází prst.** `smoke.mjs` má **15** míst ve tvaru
`page.evaluate(() => document.getElementById('x').click())` proti **214**
poctivým `page.click(…)`. Ta první forma zavolá obsluhu napřímo a přeskočí
všechno, co Playwright jinak ověřuje: že je prvek vidět, povolený, nezakrytý
a stojí v klidu.

Nahradil jsem všech 15 poctivým `page.click()` a nechal doběhnout celý smoke:

| Výsledek | Kolik | Které |
|---|---|---|
| poctivý klik projde | **12** | `dKosik` ×3, `dVice` ×2, `planVice` ×2, `planSmaz`, `planClear`, `addClose`, `podkladBtn` ×2 |
| poctivý klik selže | **3** | `backdrop` ×1, `dPorovnat` ×2 |

U dvanácti je tedy `evaluate` jen zbytečná forma, která zadarmo zahazuje čtyři
kontroly. Zbylé tři jsou zajímavé:

**`#dPorovnat` je 0 × 0 pixelů a leží v `#dViceMenu`**, tedy v zavřené nabídce
„…" v detailu místa. Změřeno:

```
ramecek: { x: 0, y: 0, w: 0, h: 0 }     naVrchu: "top"     jeToOno: false
element is not visible
```

Obě kontroly porovnání („jedno místo porovnání neotevře", „druhé místo otevře
porovnání") tedy klikají na tlačítko, na které se v tu chvíli **nedá dosáhnout
prstem**. Ověřují, že obsluha funguje; neověřují, že se k ní člověk dostane.
Kdyby se nabídka „…" rozbila a Porovnat byl navždycky nedostupný, obě kontroly
projdou dál.

**`#backdrop`** selže jinak a je to obhajitelné: střed závěsu je pod kartou
dialogu, takže `page.click` narazí na `#dialogHlavni`. Člověk ťuká vedle karty,
ne doprostřed. Poctivá podoba je klik do rohu (`{ position: { x: 10, y: 10 } }`),
ne `evaluate`.

**b) Potvrzení bez následné kontroly.** Z 25 klepnutí na `#dialogAno` nemá
**4** do pěti řádků žádnou `kontrola(…)` (ř. 1506, 1608, 1962, 2540). Prošel
jsem je ručně: 2540 je zkontrolované jen o kousek dál, 1506 a 1608 chrání
jenom to, že další prvek musí existovat — tedy zase pád, ne kontrola. 1962 byl
B6 a ten už kontrolu má.

### Co z toho plyne

Ne „testy jsou k ničemu" — 481 kontrol drží spoustu věcí. Plyne z toho tohle:

- **Po nevratné akci a po každém přechodu obrazovky patří jedna `kontrola`,
  kde vlastně jsme**, dřív než se klikne dál. Bez ní test popisuje jen sled
  kliknutí, ne chování.
- **`page.click()` je výchozí; `evaluate().click()` potřebuje důvod v komentáři.**
  Ve dvanácti z patnácti míst žádný důvod není a `page.click()` tam projde.
  U `#dPorovnat` důvod je — jen je to důvod, který nález schovává.

Neopravuju to teď: je to zásah do 15 míst testu a patří k němu rozhodnutí,
jestli se u porovnání má napřed otevírat nabídka „…" (což by kontrola
zpřísnila) nebo ne. Zapsáno, aby se na to nezapomnělo.
