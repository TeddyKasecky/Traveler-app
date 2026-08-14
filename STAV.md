# Kde jsme skončili

Stav k **14. 8. 2026**. Tenhle soubor je předávka mezi sezeními: co je hotové, co
musíte udělat vy, co se rozhodlo a proč, a co je na řadě. Důkazy a čísla jsou
v [`PARITA.md`](PARITA.md), odložené nápady v [`NAPADY.md`](NAPADY.md).

---

## 1. Co musíte udělat vy

**Na obou telefonech, v tomhle pořadí.** Dokud to neuděláte, běží vám tam stará verze.

1. **Záloha jako první.** Filtry → **Záloha poznámek**. Stěhování dat je navržené
   bezpečně, ale záloha stojí deset vteřin a je to jediná pojistka.
2. **Zavřít aplikaci úplně a otevřít dvakrát.** Napoprvé se nová verze stáhne na
   pozadí, napodruhé naběhne. Potřebuje signál.
3. **Zkontrolovat, že sedí** poznámky, hvězdičky, plamínky, plán a vlastní fotky.
   Přesun fotek do IndexedDB proběhne sám a pozná se jen tím, že se nic neztratilo.
4. **Letadlový režim** → Mapa → posunout tam, kam jste se nedívali. Má naskočit
   zjednodušená mapa a vlevo dole štítek „Offline".

Kdyby v bodě 3 něco chybělo, řekněte to hned — jde vrátit commit i obnovit ze zálohy.

Tohle byla poslední aktualizace, která stáhne celou aplikaci znovu (měnil se
`sw.js`). Od příště se stahuje jen to, co se opravdu změnilo — viz `PARITA.md` §2c.

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

Kontroly: `validate` · `check-uloziste` 13/13 · `smoke` 56/56 · `smoke:single` 45/45 ·
`check-css` · `check-handlers` 61/61 · `parity` 26/26 · `check-form`.

---

## 3. Co se rozhodlo nedělat — ať se to neřeší znovu

| Co | Proč ne |
|---|---|
| **Stahování dlaždic OSM pro offline** | hromadné stahování [zakazují podmínky OSM](https://operations.osmfoundation.org/policies/tiles/) a hrozí zablokování IP. Řeší to zjednodušená mapa. |
| **Stahování fotek z Wikimedie do telefonu** | zrušeno na vaše přání. Navíc změřeno: **63 MB** při šířce 800 px, 26 MB při 400 px — ne „~4 MB", jak sliboval plán. Wikimedia k tomu vrací 429 už po pár rychlých požadavcích. |
| **Dělení dat míst kvůli rychlejšímu startu** | změřeno: `JSON.parse` všech 745 kB stojí 21 ms na 4× zpomaleném procesoru. Jednotky procent startu. Čas žere vykreslování, ne data. Podrobně v `PARITA.md` §8. |
| **Špendlíky do plátna** | zamítnuto, vzhled mapy zůstává |
| **Doplňování chybějících fotek u 318 míst** | kreslená pohlednice zůstává |
| **Tmavý režim, průchod přístupnosti** | mimo rozsah |
| **Fáze 2: parkoviště z OSM a výška vozu** | vynecháno na vaše přání |

---

## 4. Co je na řadě

Seřazeno podle poměru užitek/riziko.

### a) Odložení hledání o 150 ms — doporučuju začít tímhle

Políčko hledání volá `draw()` při každém stisku klávesy a ten překreslí i celý seznam.
Na mobilu je to **~700 ms na každé písmeno** — podle měření nejnepříjemnější zbylá věc
v aplikaci. Stejný princip jako už použitý odložený zápis poznámky.

Práce na desítky minut, žádná závislost na vás. Mění chování o desetinu vteřiny.

### b) Fáze 5 — šest rychlých oprav z `NAPADY.md`

N1 (odznak filtrů nepočítá „Musíme!"), N3 (import CSV maže kolekce), N4 („Zrušit vše"
nemaže hledání), N5 (kolekce „Se psem" nemá dlaždici), N6b (pět míst má kolekci
dvakrát), N7 (hledání nezahrnuje krátký popis).

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

Fáze 6 (plánování: víc výletů, dny, co je po cestě, GPX), fáze 7 (deník, datum
návštěvy, víc fotek na místo), fáze 8 (doplnit pole „psi"). Plný plán je
v `~/.claude/plans/jak-dal-v-ci-p-idat-ancient-hopper.md`.

---

## 5. Dvě věci o prostředí, které stojí za zapamatování

- **`git` přes PowerShell na tomhle stroji nefunguje** („Přístup byl odepřen"), jde jen
  přes Bash. Binárka existuje, blokuje to nejspíš antivirus.
- **Push je nasazení do produkce.** Cloudflare sleduje repozitář a při každém pushi do
  `main` si sám spustí build. Commit sám o sobě neudělá nic. Jak ověřit, že nasazení
  opravdu proběhlo, je v [`.claude/rules/nasazeni.md`](.claude/rules/nasazeni.md).
