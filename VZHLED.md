# Vzhled — Golden Moss

Výklad vizuální identity aplikace. Podklady jsou ve složce `grafika/` v nadřazeném
adresáři (do repozitáře se nekomitují, mají 89 MB): tři listy manuálu, čtyři mockupy
obrazovek, ilustrace na pozadí a deset akvarelů podle kategorií.

Do léta 2026 byl vzhled doslovným přepisem původního `index.html` — černé obrysy,
tvrdé offsetové stíny, Fraunces. Redesign ten stav vědomě opustil; co to udělalo
s kontrolami, je v [PARITA.md](PARITA.md) §10 Q14.

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
ve Filtrech, logika v `src/core/motiv.js`.

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

1. žádná barva natvrdo mimo `tokens.css` (výjimka `offlinemap.css` — kreslí do plátna)
2. žádná barva natvrdo v JavaScriptu (výjimka: záložní hodnota v `token('--x', '#hex')`)
3. tmavý režim nezapomněl na barvu, kterou světlý má
4. oba tmavé bloky jsou shodné
5. každé `var(--x)` má definici
6. kontrast devatenácti dvojic, v obou režimech
