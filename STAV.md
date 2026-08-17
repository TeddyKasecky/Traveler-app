# Kde jsme skončili

Stav k **17. 8. 2026**. Tenhle soubor je předávka mezi sezeními: co je hotové, co
musíte udělat vy, co se rozhodlo a proč, a co je na řadě. Důkazy a čísla jsou
v [`PARITA.md`](PARITA.md), odložené nápady v [`NAPADY.md`](NAPADY.md),
výklad vzhledu ve [`VZHLED.md`](VZHLED.md).

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

<https://traveler-app.teddykasecky.workers.dev>

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

Kontroly: `validate` · `check-uloziste` 13/13 · `smoke` 121/121 · `smoke:single` 109/109 ·
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
„Se psem" nemá dlaždici), N6b (pět míst má kolekci dvakrát), N7 (hledání nezahrnuje
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
- **Push je nasazení do produkce.** Cloudflare sleduje repozitář a při každém pushi do
  `main` si sám spustí build. Commit sám o sobě neudělá nic. Jak ověřit, že nasazení
  opravdu proběhlo, je v [`.claude/rules/nasazeni.md`](.claude/rules/nasazeni.md).
