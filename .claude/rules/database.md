---
paths:
  - src/data/**
  - scripts/validate-data.mjs
  - scripts/slouc.mjs
  - scripts/extract-places.mjs
  - import/**
---

# Data míst (JSON, žádná databáze)

_Zjištěno auditem: `src/data/validate.js`, `src/data/schema.md`, `src/core/store.js:97`,
`scripts/validate-data.mjs`._

Projekt nemá databázi ani backend. Zdroj pravdy o místech jsou dva JSON soubory v repozitáři;
uživatelská data (poznámky, hodnocení, plán, fotky) jsou **jen v localStorage prohlížeče**
a v repu nikdy nejsou.

## Entity a vztahy

| Entita | Kde | Klíč | Vztahy |
|---|---|---|---|
| **Místo** | `src/data/places.json` (580 záznamů) | `id`, unikátní napříč oběma soubory | `k` → `categories.js` (10 hodnot) · `col[]` → `collections.js` (12) · `nb[].id` → jiné `Místo` |
| **Místo (nová)** | `src/data/places-nova.json` (dnes 0) | totéž | přihrádka na čerstvě přidaná místa |
| **Parkoviště** | vnořené v `Místo.parking` | — | 1:1, nebo `null`; 8 vyplněných |
| **Soused** | vnořené v `Místo.nb[]` | `{id, d}` | N:1 na `Místo`, **jednosměrné** — `A → B` nevytvoří `B → A` |
| **Nálada** | `src/data/moods.js` | — | odkazuje na kategorie, jen pro dlaždice na Domů |

Oba soubory s místy se za běhu spojují do jednoho pole (`store.js:97: VESTAVENA_DATA`).
Kontrola i `npm run slouc` je zpracovávají **dohromady** — jinak by neprošly duplicitní `id`
přes hranici souborů ani vazby v `nb`.

## Klíčová omezení

- **29 klíčů, vždy všechny, v závazném pořadí** (`validate.js:22-26: KLICE`). Chybějící nebo
  přebývající klíč = chyba. Zpřeházené pořadí = varování (kvůli čitelnosti diffů).
- **Neprázdných musí být 11 polí** (`validate.js:29: POVINNA`): `id, n, k, t, z, r, c, d, ch, s, sh`.
  Ostatní klíče musí existovat, ale smějí být `""`, `[]` nebo `null`. **Nikdy `undefined`
  a nikdy vynechaný klíč.**
- **`id` se nikdy nemění** — viz kritická pravidla v [CLAUDE.md](../../CLAUDE.md). Tvar
  `slug-NNN` (`validate.js:54: ID_REGEX`); odchylka je jen varování, protože osm existujících
  id má dvě pomlčky (`…-to-je--057`).
- `id` nesmí být uvedené jako vlastní soused a `nb[].id` musí existovat v datech.
- `lat` −90…90, `lon` −180…180, `0,0` je chyba (uprostřed Atlantiku = nevyplněno).
- `k` a `col[]` jen z číselníku — neznámá hodnota je chyba, ne varování. **Novou kategorii
  nebo kolekci přidej nejdřív do `categories.js`/`collections.js`,** teprve pak do dat.
- `parking` je buď `null`, nebo objekt se **všemi deseti** klíči; `transitStatus` jen
  `verified | likely | unknown | no`; `heightLimit` číslo v metrech, nebo `null`.
- `img` musí být `https://commons.wikimedia.org/…` (jinak varování) a **nesmí obsahovat
  neASCII znak** — diakritika procentně zakódovaná, jinak chyba.
- `w` a `ig`: víc adres se odděluje `" | "` **včetně mezer**. Bez mezer aplikace adresy
  nerozdělí, kontrola to hlásí jako chybu.
- Desetinná čísla: v JSON tečka (`47.12345`), v textech pro člověka (`d`, `price`) čárka
  (`0,5-1 h`) — zobrazují se, jak jsou.

## Jak přidat místo

1. Objekt na konec pole v `src/data/places-nova.json` (přihrádka), nebo přes formulář
   „Přidat místo" v aplikaci → **Zkopírovat JSON**.
2. `npm run validate` — kontroluje oba soubory dohromady, kód 1 při chybě, varování kód nemění.
3. Commit. Pre-commit hook pustí kontrolu sám, protože se sáhlo do `src/data/`.
4. Občas `npm run slouc` — přesune přihrádku do hlavního souboru a přepočítá `nb`.

Hromadný import: `import/sablona.csv` (19 sloupců s českými hlavičkami, oddělovač čárka).

## Pravidla se nesmějí rozejít

`src/data/validate.js` je **čistý JavaScript bez Node API** schválně: pouští ho jak
`scripts/validate-data.mjs` (CLI a pre-commit hook), tak formulář v prohlížeči. Nová kontrola
patří **jen sem** — nikdy ne zvlášť do skriptu a zvlášť do formuláře.

Změna `KLICE`, `POVINNA` nebo číselníků se musí promítnout i do `src/data/schema.md`, který
je psaný tak, aby šlo místo přidat bez čtení kódu.

## Vlastnosti dat (neopravovat bez vyžádání)

- 318 z 580 míst nemá `img` — záměr, kreslí se pohlednice generovaná z `id`.
- `ps` (psi) je vyplněné jen u 8 míst, takže filtr „Se psem" vrací 5 výsledků (N6).
- Pět míst má v `col` stejnou kolekci dvakrát → varování, ne chyba (N6b).
- Kolekce `psi` je v datech, ale nemá definici v `COLL`, takže dlaždici v Objevuj nemá (N5).
- Všech 8 parkovišť má `transitStatus: "verified"`.
