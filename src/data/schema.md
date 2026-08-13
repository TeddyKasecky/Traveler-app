# Schéma dat míst

Popis souboru `places.json`. Podle tohohle dokumentu jde přidat místo, aniž bys
otevíral kód aplikace.

`places.json` je **jediný zdroj pravdy** o místech. Je to pole objektů, každý objekt
je jedno místo a má **přesně 29 polí ve stejném pořadí**. Žádné pole se nevynechává —
když se nehodí, nechá se prázdné (`""`, `[]`, nebo `null`).

---

## Jak přidat místo

1. Otevři `src/data/places.json` a přidej objekt na konec pole.
2. Zkopíruj si šablonu níž a vyplň ji. Pořadí polí zachovej.
3. Spusť kontrolu:
   ```
   npm run validate
   ```
4. Když projde, commitni. Kontrola se pustí i sama před commitem.

Kategorii nebo kolekci mimo povolený seznam kontrola odmítne. Když chceš novou,
přidej ji nejdřív do `categories.js`, respektive `collections.js`.

### Šablona

```json
{
  "id": "nazev-mista-123",
  "n": "Název místa",
  "k": "Vodopády",
  "t": "Vodopád",
  "z": "Rakousko",
  "r": "Tyrolsko",
  "c": "Zdarma",
  "d": "1-2 h",
  "ch": "Ano",
  "ps": "",
  "s": "květen-říjen",
  "p": "Praktické info k návštěvě.",
  "f": "",
  "sh": "Jedna věta do seznamu.",
  "av": "",
  "bs": "",
  "pdf": "",
  "price": "",
  "pv": false,
  "pn": "",
  "parking": null,
  "g": ["pohorky", "voda"],
  "col": ["rychlovka", "zdarma", "deti"],
  "w": "",
  "ig": "",
  "lat": 47.12345,
  "lon": 11.12345,
  "nb": [],
  "img": ""
}
```

---

## Pole

Sloupec „nutné“ znamená, že hodnota nesmí být prázdná. Klíč musí být přítomný vždy.

| Pole | Typ | Nutné | Význam |
|---|---|---|---|
| `id` | text | ano | Jednoznačný klíč místa. Nikdy neměnit — viz níž. |
| `n` | text | ano | Název, jak se zobrazí v nadpisu. |
| `k` | text | ano | Kategorie. Určuje barvu a ikonu. Jen z povoleného seznamu. |
| `t` | text | ano | Typ. Volný text, ukazuje se pod názvem a v seznamu. |
| `z` | text | ano | Země. |
| `r` | text | ano | Oblast. Používá se ve filtrech a v „Objevuj“. |
| `c` | text | ano | Cena/vstup. Text začínající `Zdarma` propadne filtrem „Zdarma“. |
| `d` | text | ano | Délka návštěvy, třeba `1-2 h`. |
| `ch` | text | ano | S dětmi. Přesně `Ano` propadne filtrem „S dětmi“. |
| `ps` | text | ne | Psi. Přesně `Ano` propadne filtrem „Se psem“. |
| `s` | text | ano | Sezóna. Koncové ` *` znamená orientační údaj a v seznamu se skrývá. |
| `p` | text | ne | Praktické info. Odstavec v detailu. |
| `f` | text | ne | Zajímavost. V detailu jako „Z deníku“. |
| `sh` | text | ano | Krátký popis, dvě řádky v seznamu, plánu a „Objevuj“. |
| `av` | URL | ne | Odkaz na alpskyvudce.cz. Jen u ferrat. |
| `bs` | URL | ne | Odkaz na bergsteigen.com. Jen u ferrat. |
| `pdf` | URL | ne | Topo ke stažení. Jen u ferrat. |
| `price` | text | ne | Cena denní jízdenky. Jen u bikeparků, ukazuje se na Domů. |
| `pv` | true/false | ano | Je cena ověřená na oficiálním webu? U ostatních míst `false`. |
| `pn` | text | ne | Poznámka k ceně. |
| `parking` | objekt / `null` | ano | Ověřené parkoviště, nebo `null`. Struktura níž. |
| `g` | seznam textů | ano | Co vzít s sebou. Prázdný seznam je v pořádku. |
| `col` | seznam textů | ano | Kolekce. Jen z povoleného seznamu. |
| `w` | text | ne | Web. Víc adres se odděluje `" \| "`. |
| `ig` | text | ne | Instagram. Víc adres se odděluje `" \| "`. |
| `lat` | číslo | ano | Zeměpisná šířka, −90 až 90. |
| `lon` | číslo | ano | Zeměpisná délka, −180 až 180. |
| `nb` | seznam objektů | ano | Místa poblíž. Prázdný seznam je v pořádku. Struktura níž. |
| `img` | URL | ne | Fotka z Wikimedia Commons. |

---

## Číselníky

### `k` — kategorie (jen těchto 10)

`Ferraty` · `Bikeparky` · `Soutěsky` · `Vodopády` · `Hory a túry` · `Jezera` ·
`Jeskyně a podzemí` · `Města a památky` · `Spaní` · `Ostatní zajímavosti`

Definice včetně barvy a ikony je v [`categories.js`](categories.js).

### `col` — kolekce (jen těchto 12)

`rychlovka` · `dest` · `koupacka` · `zdarma` · `ferrata` · `bike` · `spani` ·
`deti` · `zima` · `sunset` · `paddleboard` · `psi`

Definice je v [`collections.js`](collections.js). Pozor: `psi` je v datech u sedmi
míst, ale dlaždici v „Objevuj“ nemá — chybí jí definice v `COLL`.

### `t` — typ (volný text, dnes 26 hodnot)

`Túra` · `Vodopád` · `Město/památka` · `Ferrata` · `Jezero` · `Soutěska` · `Zajímavost` ·
`Bikepark` · `Vyhlídka` · `Jeskyně/podzemí` · `Město/region` · `Hrad/pevnost` · `Přespání` ·
`Most/lávky` · `Zábava/park` · `Horská chata` · `Muzeum/památka` · `Sakrální památka` ·
`Gastro` · `Skalní útvar` · `Památka` · `Cyklostezka` · `Průsmyk` · `Čokoládovna` ·
`Zřícenina` · `Vesnice/region`

Nová hodnota projde kontrolou, ale zvaž, jestli se nehodí některá stávající — typ
je v nabídce filtru, a čím víc podobných hodnot, tím delší seznam.

### `z` — země (dnes 26 hodnot)

`Itálie` · `Švýcarsko` · `Rakousko` · `Německo` · `Španělsko` · `Francie` · `Česko` ·
`Bosna a Herc.` · `Irsko` · `Portugalsko` · `Albánie` · `Velká Británie` · `Polsko` ·
`Maďarsko` · `Slovinsko` · `Norsko` · `Gruzie` · `Chorvatsko` · `Rumunsko` · `Island` ·
`Turecko` · `Kanada` · `Lucembursko` · `Faerské ostrovy` · `Nizozemsko` · `Pákistán`

### `c` — cena/vstup (dnes 18 hodnot)

Nejčastější: `Zdarma` · `Placené` · `Většinou placené` · `Zdarma (lanovka placená)` · `Ověřit`

Filtr „Zdarma“ funguje tak, že hodnota **začíná** slovem `Zdarma`. Text v závorce se
v seznamu odřezává, na kartě se ukáže jen `Zdarma`.

### `ch` — s dětmi (jen těchto 5)

`Ano` · `Dle zdatnosti` · `Ne` · `Starší děti` · `Starší děti s dozorem`

Filtr „S dětmi“ bere jen přesně `Ano`.

### `s` — sezóna (dnes 11 hodnot)

`celoročně` · `květen-říjen` · `červen-říjen` · `červen-září` · `duben-říjen` ·
`červenec-září` · `duben-listopad` · `květen-září` · `celoročně (top v zimě) *` ·
`květen-říjen *` · `duben-červen *`

### `d` — délka návštěvy (dnes 47 hodnot)

Nejčastější: `1-2 h` · `půl dne - den` · `3-6 h` · `celý den` · `1-3 h` · `3-5 h` ·
`0,5-1 h` · `2-3 h` · `1 h` · `do 1 h` · `noc`

Desetinná čísla se píšou s čárkou (`0,5-1 h`), ne s tečkou. Koncové ` *` značí odhad.

### `g` — co vzít s sebou (dnes 25 hodnot)

`pohorky` · `voda` · `větrovka` · `plavky` · `ručník` · `teplá vrstva` · `nesmeky` ·
`helma` · `ferrata set` · `rukavice` · `pevné boty` · `peníze na lanovku` · `čelovka` ·
`chrániče` · `kolo + full-face` · `servis kit` · `zakládací klíny` · `voda na dopl.` ·
`rezervace předem` · `spacák` · `kolo` · `hotovost` · `brusle` · `paddleboard/kajak` ·
`peníze na vláček`

---

## `parking` — objekt, nebo `null`

Vyplněný je jen u míst, kde je parkoviště opravdu ověřené. Když objekt je,
musí mít **všech deset** klíčů.

```json
"parking": {
  "name": "Parkplatz Rheinfall (Neuhausen)",
  "lat": 47.67774,
  "lon": 8.60949,
  "type": "outdoor",
  "heightLimit": null,
  "transitStatus": "verified",
  "walk": "7–10 min pěšky",
  "price": "5 CHF první hodina",
  "note": "Venkovní plocha vhodná pro dodávku.",
  "source": "manual"
}
```

| Klíč | Typ | Význam |
|---|---|---|
| `name` | text | Název parkoviště, ukáže se na tlačítku navigace. |
| `lat`, `lon` | číslo | Souřadnice parkoviště, ne místa. |
| `type` | text | Zatím vždy `outdoor`. |
| `heightLimit` | číslo / `null` | Výškové omezení v metrech. `null` = není, nebo se neví. |
| `transitStatus` | text | `verified` · `likely` · `unknown` · `no` — vhodnost pro Transit 2,6 m. |
| `walk` | text | Jak daleko je to pěšky. Může být prázdné. |
| `price` | text | Cena parkování. |
| `note` | text | Poznámka. Tady patří varování o výšce a zákazech. |
| `source` | text | Odkud údaj je. Zatím vždy `manual`. |

V datech mají zatím všechna parkoviště `transitStatus: "verified"`. Zbylé tři stavy
aplikace umí zobrazit, jen se zatím nepoužily.

---

## `nb` — místa poblíž

Seznam objektů `{ id, d }`, seřazený od nejbližšího. V detailu se z nich vykreslí
pruh „Poblíž“, na mini-mapě se ukážou první čtyři.

```json
"nb": [
  { "id": "bachalpsee-444", "d": 10 },
  { "id": "kuhniversum-traumhaftes-cafe-mezi-kravami-356", "d": 7.9 }
]
```

- `id` musí odkazovat na **existující** místo, jinak kontrola zahlásí chybu.
  (Aplikace by takový záznam tiše přeskočila, ale je to skrytá chyba.)
- `d` je **vzdušná** vzdálenost v kilometrech na jedno desetinné místo.
  Nepočítá se za běhu, bere se odsud.
- V současných datech je maximálně 6 sousedů na místo a nejdál 44,9 km.
  Není to pravidlo, jen to, jak byla data vygenerovaná.
- Nechat `[]` je v pořádku. Sedmdesát sedm míst sousedy nemá.

Vazby jsou jednosměrné — když přidáš `A → B`, `B → A` samo nevznikne.

---

## `id` — konvence a proč se nesmí měnit

Tvar je **slug názvu + pomlčka + tři číslice**, třeba `rynske-vodopady-nejvetsi-v-evrope-090`.
Slug je název bez diakritiky, malými písmeny, mezery a interpunkce nahrazené pomlčkou.

Osm id má před číslicemi **dvě** pomlčky (`…-to-je--057`). Vzniklo to tím, že se slug
uřízl zrovna na pomlčce. Je to v pořádku, kontrola to připouští.

Změna `id` u existujícího místa **rozbije uživatelská data**, protože se pod ním ukládají:

- poznámka, hodnocení, priorita a příznak „navštíveno“,
- pozice v plánu výletu,
- vlastní vyfocená fotka,
- vazby `nb` z ostatních míst,
- kresba pohlednice, když místo nemá fotku — generuje se z `id`, takže se změní i obrázek.

Když se překlepneš v názvu, oprav `n` a `id` nech být.

---

## Na co si dát pozor

**Adresy fotek.** Musí být procentně zakódované. `ö` se píše `%C3%B6`, apostrof `%27`,
čárka `%2C`, závorky `%28` a `%29`. Nezakódovaný znak s diakritikou kontrola odmítne,
protože obrázek by se tiše nenačetl. Tvar adresy je:

```
https://commons.wikimedia.org/wiki/Special:FilePath/Nazev_Souboru.jpg?width=800
```

**Víc adres v jednom poli.** U `w` a `ig` se oddělují svislítkem **s mezerami kolem**:
`https://a.cz | https://b.cz`. Bez mezer se adresy nerozdělí.

**Desetinná čísla.** V JSON vždy s tečkou (`47.12345`). V textech pro člověka
(`d`, `price`) naopak s čárkou, protože se zobrazují tak, jak jsou.

**Prázdné hodnoty.** Text `""`, seznam `[]`, parkoviště `null`. Nikdy `undefined`
a nikdy vynechaný klíč.

**Fotky nedoplňuj náhodně.** 318 míst `img` nemá a zobrazuje se u nich kreslená
pohlednice. Je to záměr, ne nedodělek.

---

## Kontrola

```
npm run validate
```

Vypíše chyby a varování u konkrétních míst a polí. Chyba znamená, že by se něco
rozbilo. Varování je upozornění, commit nezastaví.

Stejná pravidla používá i formulář na přidání místa — jsou v [`validate.js`](validate.js),
schválně na jednom místě, aby se nemohla rozejít.

Že `places.json` pořád přesně odpovídá původní aplikaci, se dá kdykoli doložit:

```
node scripts/extract-places.mjs --check
```
