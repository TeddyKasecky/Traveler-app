# Vzhled — Golden Moss

Výklad vizuální identity aplikace. Podklady jsou ve složce `grafika/` v nadřazeném
adresáři (do repozitáře se nekomitují, mají 89 MB): tři listy manuálu, čtyři mockupy
obrazovek, ilustrace na pozadí a deset akvarelů podle kategorií.

Do léta 2026 byl vzhled doslovným přepisem původního `index.html` — černé obrysy,
tvrdé offsetové stíny, Fraunces. Redesign ten stav vědomě opustil; co to udělalo
s kontrolami, je v [PARITA.md](PARITA.md) §10 Q14.

Redesign proběhl **ve dvou kolech**. První (srpen 2026) změnil barvy, písmo
a tvarosloví, ale rozvržení nechal být — aplikace byla přebarvená, ne přestavěná.
Druhé kolo přestavělo rozvržení všech obrazovek podle mockupů; co se kam přesunulo
a proč, je níž v části **Rozvržení podle předloh**.

---

## Paleta

Sedm barev z manuálu. **V komponentách se nepoužívají přímo** — jsou v `tokens.css`
jako `--zn-*`, aby bylo vidět, odkud se hodnoty vzaly.

| | | |
|---|---|---|
| Moss Green | `#5E6E4D` | primární akce |
| Fern Green | `#7E9A6E` | akcent v tmavém režimu |
| Ochre | `#E1B152` | zvýraznění, aktivní záložka |
| Muted Orange | `#E38A5C` | upozornění v tmavém režimu |
| Sienna | `#C86A43` | kategorie Ferraty |
| Ivory | `#FAF5EC` | papír stránky |
| Forest Ink | `#2F3D2C` | text |

## Tři vrstvy tokenů

```
1. paleta značky   --zn-*          v komponentách se nepoužívá
2. sémantická      --bg, --plocha, --text, --akcent, --stin-*, --r-*
                                   tohle používají komponenty
3. aliasy staré    --paper, --card, --ink, --ink2
                                   ukazují na sémantickou vrstvu
```

**Tmavý režim přepisuje jen druhou vrstvu.** Aliasy i komponenty ji sledují samy,
protože `var()` v proměnné se vyhodnocuje až při použití.

Aliasy existují schválně místo přejmenování: stará jména jsou ve třiceti CSS souborech
a navíc uvnitř SVG v `src/components/postcard.js`. Přejmenovat je znamená ruční průchod
repozitářem s jistotou, že se něco přehlédne — a přehlédnutá barva se **tiše nevykreslí**.

## Tmavý režim

Tři stavy: `system` (výchozí), `svetly`, `tmavy`. Volba je v `prefs.motiv`, přepínač
v Profilu, logika v `src/core/motiv.js`.

Tmavé hodnoty jsou v `tokens.css` **dvakrát**: v `@media (prefers-color-scheme:dark)`
s výjimkou pro `[data-motiv="svetly"]`, a v `:root[data-motiv="tmavy"]`. Kdyby existoval
jen atribut, na telefonu s tmavým systémem by při startu bliklo světlé téma. Kdyby jen
`@media`, nešel by režim přepnout ručně. Že se ty dva bloky nikdy nerozejdou, hlídá
`npm run check-tokeny`.

**Co se po přepnutí musí překreslit ručně:** Leaflet zapisuje barvy do atributů SVG
a do plátna, ty se změnou proměnné nepřepočítají. Událost `motivZmenen` proto překreslí
podklad zjednodušené mapy, puntík polohy a čáru plánu.

## Barvy kategorií

Jména jsou závazná — odkazuje na ně `data/categories.js`, `collections.js`, `moods.js`
a pět inline stylů v `index.html`. Mění se jen hodnoty. Používají se jako **grafika**
(ikona, pruh karty, špendlík), ne jako text, takže stačí 3:1 proti ploše.

| | světlý | tmavý | | světlý | tmavý |
|---|---|---|---|---|---|
| `--rust` Ferraty | `#C86A43` | `#E09068` | `--lake` Jezera | `#4E7F94` | `#7FAFC4` |
| `--moss` Bikeparky | `#5E7A4C` | `#9DBC8A` | `--plum` Jeskyně | `#7E6F92` | `#B0A0C2` |
| `--pine` Soutěsky | `#4F7A6B` | `#79AD9B` | `--sun` Města | `#A87C24` | `#E1B152` |
| `--sky` Vodopády | `#6E93A8` | `#8FB8C9` | `--night` Spaní | `#2F3D2C` | `#A9BBA1` |
| `--clay` Hory | `#A6714B` | `#D0A075` | `--sand` Ostatní | `#A8863F` | `#D4B978` |

`--night` se v tmavém režimu obrací na světle šalvějovou — jinak by ikona „Spaní"
na tmavém pozadí zmizela.

## Pravidla, na která se naráží

- **Ochre nikdy jako text.** `#E1B152` na Ivory má 1,8:1. Je to nejhezčí barva v paletě
  a člověk ji tam dá; proto to hlídá `check-tokeny`.
- **Barvy kategorií nejsou podklad pod text.** `.tag.free/.paid/.kid` mají vlastní
  tónované plochy (`--plocha-zelena` a spol.). Kategorie jsou laděné na roli grafiky
  a v tmavém režimu se převracejí, takže by text na nich zmizel.
- **`--upozorneni` je tmavší Sienna** `#A8522F`, ne `#C86A43` z palety. Na odznaku je
  drobný tučný text, kde je potřeba 4,5:1.
- **Špendlík nemá rozostřený stín.** Je jich ve výřezu přes pět set a Leaflet při posunu
  mapy přepočítá styly všech najednou.
- **Písmo:** Playfair Display 600/700 na nadpisy, Inter 400/600/800 na text. Váhy jsou
  jednotlivé hodnoty, ne rozsah — s plným variabilním fontem by `font-weight:700`
  (v CSS osmnáctkrát) zhublo. Podrobně v hlavičce `scripts/fetch-fonts.mjs`.

## Ilustrace

318 z 580 míst nemá vlastní fotku. Dostávají akvarel podle kategorie
(`src/assets/kategorie/`), výřez se odvozuje z `hash(id)`, takže dvě místa téže
kategorie nevypadají stejně. Kreslená pohlednice ze `src/components/postcard.js`
**zůstává** — leží pod akvarelem a prosvitne, když se obrázek nenačte.

Dvě velikosti: 320 px do karty seznamu, 720 px do hlavičky detailu. Do single-file
varianty jde jen malá sada; ověřuje se počtem `data:image/webp` v `dist-single/index.html`.

Obrázky se vyrábějí ručně ze složky `grafika/`:

```bash
node scripts/make-kat-fota.mjs     # zástupné ilustrace kategorií
node scripts/make-onboarding.mjs   # obrázky do uvítání
node scripts/make-icons.mjs        # ikony PWA z src/assets/icon.svg
```

## Co hlídá `npm run check-tokeny`

Nahradilo `check-css`, které porovnávalo CSS s původní aplikací.

1. žádná barva natvrdo mimo `tokens.css` (jediná výjimka je generovaný `fonts.css`;
   `offlinemap.css` výjimku míval, ale barvy malované mapy se přestěhovaly
   do `tokens.css` jako `--mapa-*`)
2. žádná barva natvrdo v JavaScriptu (výjimka: záložní hodnota v `token('--x', '#hex')`)
3. tmavý režim nezapomněl na barvu, kterou světlý má
4. oba tmavé bloky jsou shodné
5. každé `var(--x)` má definici
6. kontrast devatenácti dvojic, v obou režimech

---

## Rozvržení podle předloh

Druhé kolo redesignu. Mockupy ve složce `grafika/` nesou jinou představu o tom, jak
se s aplikací pracuje, než jakou měla původní aplikace. Vodítko je jednoduché:
**každá obrazovka odpovídá na jednu otázku** a to určuje, co na ní smí být.

| Obrazovka | Otázka | Co tam patří |
|---|---|---|
| Domů | *Co dnes?* | pozdrav, karta výpravy, tipy, rozkoukaná místa, čísla |
| Mapa | *Kde to je?* | mapa, hledání, rychlé filtry, poloha, trasa, uložená místa |
| Objevuj | *Nevím, kam chci* | kolekce, nálady, doporučení, rychlá inspirace, oblasti |
| Seznam | *Vím, co chci* | hledání, filtry, řazení, počet, řádky míst |
| Plán | *Jak to pojedeme?* | výpravy, trasa, dny, zastávky, navigace |
| Profil | *Kdo jsem a moje data* | jméno, čísla, vzhled, zálohy, vlastní data |

### Společné díly

Předlohy stojí na jedenácti opakujících se dílech. Jsou v `src/components/vzory.js`
a `src/styles/components/vzory.css` a obrazovky je jen skládají — kdyby si je psala
každá zvlášť, do měsíce by se rozešly:

`heroPas()` · `sekce()` · `radek()` · `karusel()` · `dlazdice()` · `pilulky()` ·
`segment()` · `statpanel()` · `cislaRada()` · `stavPill()` · `ikonBtn()`

Vědomě **nesahají** na `.card`, `.hdr`, `.meta` a `.tag` z `panel.css` ani na `.btn`,
`.btnrow` a `.sec` ze `sheet.css` — ty používá víc obrazovek a změna by je přestavěla
naráz.

Karta výpravy je zvlášť (`components/vypravaKarta.js`), protože je na Domů i na Mapě
a nesmí se rozejít.

### Co se kam přestěhovalo

| Co | Odkud | Kam | Proč |
|---|---|---|---|
| Hledání | hlavička | lišta na Mapě a Seznamu | předloha ho má na obrazovce; na Domů a Objevuj se nehledá |
| Filtry | plovoucí knoflík | tlačítko ve vyhledávací liště | předloha ho má u hledání |
| Poloha | pilulka na Domů | kolečko vpravo nahoře v mapě | jedno místo, ne dvě |
| Deset chipů kategorií | hlavička | pět rychlých pilulek nad mapou + všech deset v panelu Filtry | deset se na telefon nevešlo, lišta se posouvala |
| Nálady | Domů | Objevuj | „jakou máte náladu" je otázka Objevuj |
| Přehled bikeparků (32 karet) | Domů | kolekce „Na kolo"; ceny do detailu místa | jedna kategorie z deseti zabírala většinu obrazovky |
| Ilustrace dodávky | hero na Domů | na trasu plánu v mapě | tak ji má předloha |
| Přidat místo | panel Filtry | nabídka pod „+" na mapě | v panelu ho nikdo nenašel |
| Zálohy, obnova, CSV, vzhled | panel Filtry | Profil | Filtry = „co chci vidět", Profil = „moje data" |
| Počet nalezených | pilulka na mapě | řádek výsledků na Seznamu | předloha pilulku nemá; změnu filtru hlásí toast |
| Kopírovat, vyprázdnit plán | řádek tlačítek | nabídka pod „…" na Plánu | manuál má jednu primární akci |
| Počasí, Mapy.com, fotky, porovnání | řádek tlačítek v detailu | nabídka pod „…" | totéž |

### Co přibylo

- **Řazení** na Seznamu (doporučené, abecedně, hodnocení, doba) — předloha ho má,
  aplikace řadila natvrdo.
- **Pojmenované výpravy** (`store.vypravy`) — předloha má panel „Moje výlety".
- **Karta výpravy** se čtyřmi čísly na Domů i Mapě.
- **Vybírátko míst** pro „Přidat zastávku" — zastávka šla přidat jen z detailu.
- **Krátký popis `sh`** v detailu (má ho všech 580 míst, nikde se neukazoval)
  a **Instagram jako karta** (454 z 580 míst, byl to řádek úplně dole).
- **Malovaná offline mapa** — papír, plochy zemí, malované stromy a hory z předloh,
  názvy zemí v Playfair. Přepíná se pilulkou vlevo nahoře; výchozí zůstává
  online mapa z OpenStreetMap, protože má silnice.

### Čemu se předloha nepodřídila

- **Datum výpravy.** Předloha má „23. kvě – 18. čvc • 56 dní". V datech žádné datum
  není a odhad by lhal, takže karta ukazuje začátek a konec trasy.
- **„12 kempů"** jako čtvrté číslo karty. Kategorii Spaní má 11 míst z 580, takže by
  tam skoro pořád svítila nula; nahradily ho **dny**, které se počítají z `planDny`.
- **★ 4,8 u každého místa.** Hvězdičky se ukazují jen tam, kde hodnocení opravdu je;
  jinde nastoupí doba, vyplněná u všech 580.
- **Zvonek** vpravo nahoře. Aplikace nemá žádná oznámení a vymýšlet je nebudu —
  na jeho místě je kolečko Profilu.
- **Fakta v detailu** zůstala v mřížce `.facts`, ne ve svislém `statpanel()`. Svislý
  seznam by detail protáhl o dvě obrazovky a předlohu detailu mezi mockupy nemám.
