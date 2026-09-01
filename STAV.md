# Kde jsme skončili

Stav k **25. 8. 2026**. Tenhle soubor je předávka mezi sezeními: co je hotové, co
musíte udělat vy, co se rozhodlo a proč, a co je na řadě. Důkazy a čísla jsou
v [`PARITA.md`](PARITA.md), odložené nápady v [`NAPADY.md`](NAPADY.md),
výklad vzhledu ve [`VZHLED.md`](VZHLED.md).

> **Pozor na jména kontrol ve starších záznamech níž.** V srpnu 2026 zmizely
> `check-handlers`, `check-data` a `check-css:original` spolu s předlohou, proti které
> porovnávaly, a `parity` se přejmenoval na `check-regrese`. V září 2026 zmizel
> `smoke:single` spolu s celou jednosouborovou variantou. Záznamy o proběhlých
> kontrolách se **nepřepisují** — byly pravdivé, když vznikly.

---

## 1. Co musíte udělat vy

**Na obou telefonech, v tomhle pořadí.** Dokud to neuděláte, běží vám tam stará verze.

1. **Záloha jako první.** Profil (kolečko vpravo nahoře) → **Stáhnout zálohu**.
   Nasazení se uložených dat nedotýká, ale záloha stojí deset vteřin a je to
   jediná pojistka. *(Do srpna 2026 to bylo ve Filtrech, přestěhovalo se.)*
2. **Zavřít aplikaci úplně a otevřít dvakrát.** Napoprvé se nová verze stáhne na
   pozadí, napodruhé naběhne. Potřebuje signál.
3. **Zkontrolovat, že sedí** poznámky, hvězdičky, plamínky, plán a vlastní fotky.
4. **Vyzkoušet tmavý režim.** Profil → **Vzhled** → Světlý / Tmavý / Podle systému.
5. **Letadlový režim** → Mapa → pilulka vlevo nahoře přepne na malovanou mapu.
   Má fungovat bez signálu. **V tmavém režimu má být tmavá** — to skripty neuvidí.

Kdyby v bodě 3 něco chybělo, řekněte to hned — jde vrátit commit i obnovit ze zálohy.

Čtyři věci, které si zaslouží pohled, protože je skripty posoudit neumějí:

- **Hero obrázek v tmavém režimu.** Zabírá polovinu displeje a akvarely jsou
  světlé v obou režimech, takže je to v tmavu velká jasná plocha. Ztlumit ho jde
  jedním řádkem (stejně jako kresby na offline mapě), ale je to změna vzhledu —
  rozhodnout to jde jen podle telefonu.
- **Magnetické přisátí listu.** Testováno v Edge; iOS Safari se v posouvání
  chová jinak a skripty na něj nedosáhnou.
- **Dlaždice mapy v tmavém režimu.** Jsou z OpenStreetMap a zůstávají světlé.
- **Zástupné ilustrace v seznamu.** Míst bez vlastní fotky je 318 a všechna
  z jedné kategorie sdílejí jeden akvarel, jen s jiným výřezem.

---

## 2. Co je nasazené a živé

Od srpna 2026 dvě prostředí (viz `CLAUDE.md` sekce „Nasazení na produkci"):

- **Produkce** (stabilní, ruční nasazení z větve `production`):
  <https://traveler-app.teddykasecky.workers.dev>
- **Beta** (průběžná, automaticky z `main` při každém pushi):
  <https://traveler-app-beta.teddykasecky.workers.dev>

| Co | Proč to bylo potřeba |
|---|---|
| **Ochrana dat** | `save()` zahazoval návratovou hodnotu, takže při plné paměti mizely poznámky beze slova. Teď se to hlásí trvalým pruhem s tlačítkem na zálohu. |
| **Fotky do IndexedDB** | localStorage má strop 5 MB a fotky v něm dusily poznámky. Pořád jen v telefonu, nikam se neposílají. |
| **Data z CSV do vlastního klíče** | po importu ~565 kB v témž záznamu jako poznámky, přepisovalo se to při každé změně |
| **Odložený zápis poznámky** | dřív zápis celého úložiště při každém stisku klávesy |
| **Offline mapa** | podklad z Natural Earth pod dlaždicemi; kde dlaždice chybí, prosvítá |
| **Špendlíky jen ve výřezu** | 580 kusů v stránce stálo ~850 ms přepočtu stylů při každém posunu mapy |
| **Stabilní verze cache** | telefon si při každém nasazení stahoval celou aplikaci znovu, i když se nic nezměnilo |

**Vizuální redesign (17. 8. 2026)** podle grafického manuálu „Golden Moss" — výklad
je ve [`VZHLED.md`](VZHLED.md), 16 commitů:

| Co | |
|---|---|
| **Nový vzhled** | paleta Golden Moss, Playfair Display, měkké karty místo černých obrysů a tvrdých stínů, tmavě zelená spodní pilulka |
| **Tmavý režim** | podle systému, nebo ručně v Profilu; volba se pamatuje |
| **Zástupné ilustrace** | 318 míst bez fotky má akvarel podle kategorie, kreslená pohlednice zůstává jako záchrana |
| **Profil** | čísla o cestách a jméno; otevírá se kolečkem v hlavičce |
| **Dny v plánu** | zastávky se dají rozdělit po dnech, kilometry se počítají zvlášť i celkem |
| **Apple Maps a Waze** | vedle Google Maps; umějí jen jeden cíl a aplikace to řekne |
| **Porovnání dvou míst** | tlačítko v detailu |
| **Uvítání** | tři kroky s akvarely místo jednoho boxu |
| **Rychlejší seznam** | vykreslení 250 karet je rychlejší než před redesignem, a to s obrázky navíc |

**Rozvržení podle předloh (17. 8. 2026)** — druhé kolo redesignu, 10 commitů.
Přestavělo rozvržení všech šesti obrazovek podle mockupů ve složce `grafika/`;
každá obrazovka odpovídá na jednu otázku. Podrobně ve [`VZHLED.md`](VZHLED.md).

| Co | |
|---|---|
| **Malovaná mapa** | papír, akvarelové stromy a hory, názvy zemí; je to offline varianta, online mapa z OSM zůstává výchozí a přepíná se pilulkou vlevo nahoře |
| **Pojmenované výpravy** | víc plánů vedle sebe, přepínají se v Přehledu |
| **Kapkovité špendlíky a dodávka na trase** | podle předlohy |
| **Seznam** | řazení, pilulky Oblast/Země/Typ/Stav, počet nalezených |
| **Detail** | krátký popis pod názvem, Instagram jako karta, ikonová řada místo tlačítek |
| **Profil** | přebral zálohy, data a přepínač vzhledu z panelu Filtry |

**Opravy a doladění (17. 8. 2026)** — 8 commitů, tohle kolo:

| Co | |
|---|---|
| **Detail se zavíral při ťuknutí na cokoli** | a hodnocení nešlo vidět. Dvě chyby, kvůli kterým se detail místa prakticky nedal používat — obojí opraveno, viz commit `d811e5a` |
| **Popisky záložek ve světlém režimu** | byly tmavé na tmavě zelené pilulce; opraveno na sedmi místech |
| **Poznámka v tmavém režimu** | černý text na tmavém poli; opraveno u pěti formulářových polí |
| **Hero obrázek na půl displeje** | s magnetickým přisátím listu obsahu |
| **Sbalení spodku Mapy** | karta výpravy a uložená místa se schovají do bubliny, získá se 259 px mapy |
| **Rychlé filtry na „moje věci"** | Uložená · Musíme! · V plánu · Byli jsme, místo kategorií |
| **Počty ve filtrech Seznamu** | u každé volby a prázdné zašedlé |
| **Plán za jízdy** | odškrtávání zastávek, pruh průběhu, automatické dělení na dny, export GPX |
| **Domů** | průběh výpravy, nejblíž odsud, naše nejlepší, zemí místo oblastí |

Kontroly: `validate` · `check-uloziste` 13/13 · `smoke` 133/133 · `smoke:single` 121/121 ·
`check-tokeny` 7/7 · `check-dny` 46/46 · `check-filters` 134 kombinací ·
`check-handlers` 61/61 · `parity` 26/26 · `check-form`.

---

## 3. Co se rozhodlo nedělat — ať se to neřeší znovu

| Co | Proč ne |
|---|---|
| **Stahování dlaždic OSM pro offline** | hromadné stahování [zakazují podmínky OSM](https://operations.osmfoundation.org/policies/tiles/) a hrozí zablokování IP. Řeší to zjednodušená mapa. |
| **Stahování fotek z Wikimedie do telefonu** | zrušeno na vaše přání. Navíc změřeno: **63 MB** při šířce 800 px, 26 MB při 400 px — ne „~4 MB", jak sliboval plán. Wikimedia k tomu vrací 429 už po pár rychlých požadavcích. |
| **Dělení dat míst kvůli rychlejšímu startu** | změřeno: `JSON.parse` všech 745 kB stojí 21 ms na 4× zpomaleném procesoru. Jednotky procent startu. Čas žere vykreslování, ne data. Podrobně v `PARITA.md` §8. |
| **Špendlíky do plátna** | zamítnuto, vzhled mapy zůstává |
| **Doplňování chybějících fotek u 318 míst** | kreslená pohlednice zůstává |
| ~~Tmavý režim~~ | **hotovo** (srpen 2026, viz `VZHLED.md`) — přepínač Světlý / Tmavý / Podle systému |
| **Fáze 2: parkoviště z OSM a výška vozu** | vynecháno na vaše přání |

---

## 3a. Uložené pozice, přepočet trasy a živé sledování

Hotovo a otestováno (11 commitů na `tadeas/work`): uložené pozice v Profilu
(přidat/upravit/smazat, ručně nebo výběrem na mapě), start a cíl trasy jdou
vybrat z uložené pozice nebo z aktuální GPS polohy (nejvýš jeden na plán,
pevně na začátku/konci, nejde přetáhnout jinam), tlačítko „Přepočítat" na
kartě Itinerář, vykreslení skutečné trasy na mapě místo vzdušné čáry, živé
sledování zbývající vzdálenosti na kartě Na cestě a značka polohy na mapě
(jen na popředí appky, watchPosition se zastaví při zhasnutí displeje nebo
přepnutí jinam — žádná pozadí, žádné wake locky).

**Mapy.com Routing API je zapojené a ověřené naostro.** `src/views/plan/routing.js`
má API klíč (`MAPY_API_KLIC`, veřejný — omezený referery v administraci
Mapy.com, ne tajemství) a `zavolejRouting()`/`zpracujOdpoved()` odpovídají
skutečnému tvaru API (parametry `start`/`end`/`waypoints` jako `"lon,lat"`,
odpověď má `length` v metrech, `duration` v sekundách, `geometry.geometry.coordinates`
jako `[lon,lat]` páry, appka je otáčí na `[lat,lon]` pro Leaflet). Ověřeno
reálným voláním v `npm run dev` — appka dostala HTTP 200, uložila skutečnou
trasu (7183 bodů polyline) a vykreslila ji na mapě. Appka bez klíče/offline
pořád funguje – chyba se ukáže jako toast, poslední známý přepočet (nebo
odhad vzdušnou čarou) zůstává jako fallback.

Živé sledování stojí za vyzkoušení naostro na mobilu (ne jen v Edge
s mockovanou polohou) — `enableHighAccuracy: true` může znatelně zatěžovat
GPS čip/baterii, konstanty v `views/plan/cesta-zivot.js` jsou vhodný start,
ne nutně finální.

Kontroly: `check-dny` 113/113 (nové testy pro start/cíl, otisk trasy,
seřazenou trasu), `check-projekce` 13/13 (nový skript, throttle a projekce
polohy na trasu), `smoke` 203/203, `check-tokeny` 7/7, `parity` 26/26,
ruční E2E test reálného volání Routing API.

## 3b. Debug poznámkovač (25. 8. 2026)

Hotovo a na betě, 6 commitů. Nápady, bugy a poznámky se zapisují **přímo
v appce za běhu** — kolečko s broukem v hlavičce vedle profilu a nastavení.
Vždycky vidět jsou jen čtyři věci (typ, nadpis, text, čeho se to týká), aby
šel zápis udělat za deset vteřin jednou rukou v autě; zbytek je pod „Víc
podrobností". Detail nedodává člověk psaním, ale appka sběrem: obrazovka,
filtry, verze buildu i cache, online/offline, zaplnění úložiště po klíčích
a posledních 20 zachycených chyb (buffer běží pořád, ne až po zapnutí
debug režimu — chyba zachycená později je chyba, která už jednou utekla).

Prohlížeč záznamů (Nastavení → Otevřít poznámkovač) je malý tracker: stavy,
priority, filtry, hromadný výběr a mazání. Export dělá **jeden `.md` soubor
na export**, který se uloží do složky `debug/`, commitne a pushne — tím se
dostane k oběma i k AI, která si repo čte. Vedle toho tlačítko **Sdílet**,
které soubor předá systémovému menu telefonu (mail, Messenger, WhatsApp,
uložení do souborů).

**Kolečko se uzavírá.** Appka se nasazuje z téhož repozitáře, do kterého se
exporty commitují, takže build složku `debug/` přečte a přibalí z ní rejstřík
(`debug-stav.json`). V archivu je pak u každého mého záznamu vidět, jestli se
v repozitáři řeší nebo vyřešil, plus oddíl **„Od ostatních"** se záznamy toho
druhého — aby se totéž nehlásilo dvakrát. Žádný backend, žádný token; obnovuje
se nasazením, na betě tedy každým pushem na `main`.

Postup, jak má AI se záznamy pracovat (a hlavně že **vyřešený záznam se
v jednom commitu odstraní z `.md` a přidá se řádek do `debug/VYRESENO.md`**,
jinak by se autor nikdy nedozvěděl, že je hotovo), je v
[`.claude/rules/debug.md`](.claude/rules/debug.md).

**Na produkci to vidět není** a je to schválně: `prefs.debugRezim` má výchozí
hodnotu podle prostředí — na betě a v `npm run dev` zapnuto, na ostré appce
vypnuto. Přepínač je v Nastavení a řídí jen viditelnost, nikdy sběr dat.

Dvě věci, které se cestou rozhodly jinak, než zněl původní návrh:

- **Na přezdívku se ptá první zápis, ne první export.** `id` záznamu
  (`tadeas-014`) vzniká při zápisu a nikdy se nemění; doplnit autora později
  by znamenalo přejmenovat všechna dosud zapsaná `id`.
- **Verze buildu se odvozuje z commitu, ne ze dne buildu.** První verze brala
  dnešní datum, čímž se rozbilo ověření nasazení podle otisku v názvu balíku —
  dva buildy téhož commitu nevyšly stejně.

Kontroly: `check-debug` 108/108 (nový skript; nejdůležitější je round-trip
`mdExport()` → `postavRejstrik()`, na kterém stojí celá zpětná vazba),
`smoke` 304/304, `smoke:single` 286/286, `check-handlers` 61/61, `parity`
26/26, `check-tokeny` 7/7, `check-uloziste` 13/13, `check-dny` 187/187,
`check-ikony` 8/8 (64 ikon), `check-form`, `validate`.

**Za vyzkoušení stojí:** napsat na telefonu bug, vyexportovat, uložit do
`debug/`, pushnout a po nasazení bety zkontrolovat, že se u záznamu objevilo
„v repozitáři". To je jediná zkouška, která ověří celé kolečko naráz.

---

## 4. Co je na řadě

Seřazeno podle poměru užitek/riziko.

### a) Odložení hledání o 150 ms — doporučuju začít tímhle

`filterPanel.js` volá `draw()` při každém stisku klávesy a ten překreslí celý seznam.
Od přestavby je hledání na dvou obrazovkách, takže na Mapě se při psaní navíc
přestavují špendlíky. Odhad ~700 ms na písmeno je z dřívějška a **žádný skript ho
neměří** — než se bude tvrdit zlepšení, musí se to nejdřív změřit.

Přidat se k tomu má i druhá věc: `main.js` volá `renderPlan()` při každém překreslení,
i když Plán není vidět. Přestavuje se tedy celá obrazovka jen kvůli číslu na záložce,
které hledání změnit nemůže.

Práce na desítky minut, žádná závislost na vás.

### b) Fáze 5 — čtyři zbylé rychlé opravy z `NAPADY.md`

N3 (import CSV maže kolekce), N4 („Zrušit vše" nemaže hledání), N5 (kolekce
„Se psem" nemá dlaždici), N24 (pět míst má kolekci dvakrát), N7 (hledání nezahrnuje
krátký popis).

N1 (odznak nepočítá „Musíme!") **zůstává schválně** — je to 1:1 s originálem.
Nové filtry „Uložená" a „V plánu" se do odznaku počítají, protože žádné dědictví
nedrží.

Dohromady pár řádků, ale **každá mění chování** — chtěl bych je odsouhlasit jednu
po druhé, ne hromadně.

### c) Fáze 4 — sdílení mezi telefony

Největší užitek na cestě a zároveň největší riziko. **Bez vás to nezačne:**

- **V Cloudflare je potřeba založit KV úložiště a dát mi jeho ID.** Kód Workeru
  i konfiguraci napíšu, nasadí se stejnou cestou jako teď, ale úložiště musí vzniknout
  ve vašem účtu — k tomu se nepřihlašuju.
- **Pozor:** přidáním Workeru přestane být vstupním bodem statika a stane se jím ten
  Worker. Když se to zpacká, spadne celý web, ne jen synchronizace. Chtěl bych to
  nejdřív vyzkoušet lokálně přes `wrangler dev`.

Dohodnutý model sdílení (z plánování):

| Věc | Sdílí se | Jak |
|---|---|---|
| Poznámky | ano | společné, řádky podepsané jménem, slučuje se po řádcích |
| Hvězdičky, plamínky | ano | poslední zápis vyhrává |
| Aktuální plán | ano | poslední vyhrává, při souběžné změně upozornění |
| Uložené trasy | ano | podle názvu |
| Kde kdo byl (`stav`) | **ne** | osobní |
| Fotky | **ne** | zůstávají v telefonu, na roamingu by to bylo drahé |
| Nastavení | **ne** | osobní |

Šifrování v telefonu (WebCrypto, klíč z vaší společné fráze), Cloudflare vidí jen
nesmysly.

### d) Zbytek plánu

Z fáze 6 (plánování) je **hotovo**: víc výletů (pojmenované výpravy), dny včetně
automatického dělení, GPX. Zbývá z ní **„co je po cestě"** — návrhy zastávek podél
už vytvořené trasy. V srpnu 2026 jste ji zamítl, ale data i výpočet vzdáleností
na ni jsou, takže se dá kdykoli vrátit.

Fáze 7 (deník, datum návštěvy, víc fotek na místo) a fáze 8 (doplnit pole „psi",
viz N6) zůstávají celé.

> Tahle stručná verze je teď jediný zápis fází 6–8 — podrobný plán bydlel
> v `~/.claude/plans/jak-dal-v-ci-p-idat-ancient-hopper.md`, ale ten soubor je
> pracovní a přepisuje se pokaždé, když se plánuje něco jiného (naposled 14. 8. 2026
> nastavení spolupráce s kolegyní, viz níž). Než se do fází 6–8 pustíte, tenhle
> odstavec bude potřeba rozepsat znovu.

---

## 5. Spolupráce s kolegyní (14. 8. 2026)

Na projektu bude nově pracovat i kolegyně, ve VS Code s Claude Code, na stejném
repozitáři. Rozhodnuto:

- **Přístup:** GitHub Collaborator (přímý zápis), ne fork+PR.
- **Kdo pushuje do `main`:** oba, ale vždy po vzájemné domluvě mimo git —
  push je okamžité nasazení bez staging kroku.

Pravidla pro dva lidi (větve, řešení konfliktů, `places.json`) jsou zapsaná přímo
v `CLAUDE.md`, sekce „Spolupráce ve dvou" — kolegyně je dostane automaticky
klonováním repozitáře, není potřeba nic dalšího sdílet.

Mezitím se našla a opravila mezera: `.claude/settings.local.json` nebylo pokryté
vzorem `*.local` v `.gitignore` (ten chytá jména končící na `.local`, ne `.json`).
U tohohle stroje to kryl jen osobní globální gitignore, který kolegyně mít nebude —
bez opravy by se jí mohlo osobní nastavení oprávnění omylem commitnout do
veřejného repa. Opraveno explicitním řádkem v `.gitignore`.

**Zbývá udělat (mimo dosah tohodle nástroje):**

1. GitHub → repozitář `Traveler-app` → **Settings → Collaborators → Add people**
   → pozvat kolegyni. Ona pozvání musí přijmout.
2. Poslat jí odkaz na repo + že potřebuje Git, Node 22 (`.node-version`), VS Code
   s Claude Code a vlastní přihlášení k Anthropicu.
3. Ona: `git clone https://github.com/TeddyKasecky/Traveler-app.git`, `npm install`,
   otevřít složku ve VS Code — `CLAUDE.md` a pravidla načte Claude Code sám.
   Kořenová složka `Traveler/` na tomhle stroji (s druhým `CLAUDE.md`) se jí netýká,
   není v gitu.

---

## 6. Dvě věci o prostředí, které stojí za zapamatování

- **`git` přes PowerShell na tomhle stroji nefunguje** („Přístup byl odepřen"), jde jen
  přes Bash. Binárka existuje, blokuje to nejspíš antivirus.
- **Push na `main` nasazuje na betu, ne na produkci.** Cloudflare sleduje repozitář
  a při každém pushi do `main` si sám spustí build pro `traveler-app-beta`. Produkce
  (`traveler-app`) se aktualizuje jen ručně z větve `production`, viz `CLAUDE.md`
  sekce „Nasazení na produkci". Commit sám o sobě neudělá nic. Jak ověřit, že
  nasazení opravdu proběhlo, je v [`.claude/rules/nasazeni.md`](.claude/rules/nasazeni.md).
