---
paths:
  - debug/**
  - src/core/debug*.js
  - src/core/chyby.js
  - src/views/debug/**
  - src/components/debugZapis.js
  - scripts/debug-rejstrik.mjs
---

# Složka `debug/` a práce se záznamy

_Vzniklo se srpnovým debug poznámkovačem (2026). Tohle je postup pro AI —
návod pro člověka je v `README.md`, výklad návrhu ve `VZHLED.md`._

## Co ta složka je

Exporty z appky, ne ručně psané soubory. Uživatel zapíše nápad, bug nebo
poznámku přímo za běhu (kolečko s broukem v hlavičce), appka k tomu přibalí
technický kontext a jednou za čas se to vyexportuje do jednoho `.md`, uloží
sem, commitne a pushne.

```
debug/
  2026-08-24-1602-tadeas.md     ← jeden soubor na export, uvnitř sekce oddělené ---
  2026-09-01-0930-anicka.md
  VYRESENO.md                    ← jednořádkový zápis na každý uzavřený záznam
```

Datum na začátku názvu řadí složku chronologicky samo, čas brání přepsání dvou
exportů za den, jméno autora řeší kolizi mezi zařízeními. Konflikt v gitu
nehrozí — každý export je nový soubor.

## Čtyři pravidla, která se neporušují

1. **`id` záznamu (`tadeas-a7f-014`) se nikdy nemění a nikdy nerecykluje.**
   Odkazuje se na něj v konverzaci, v commitech i v rejstříku, který appka čte
   zpátky. Stejné pravidlo jako u `id` místa a `id` achievementu.

   Tvar je `<jméno>-<zařízení>-<číslo>`. Ta tři písmena uprostřed jsou **podpis
   zařízení** (`prefs.debugZarizeni`, srpen 2026). Bez nich vyrobil telefon
   i počítač téhož člověka `tadeas-001` pro dva různé záznamy — a protože
   rejstřík páruje podle `id`, cizí záznam pak zmizel z „Od ostatních" a stav
   toho cizího se nalepil na můj vlastní. Nikde to neblikalo. Starší krátká
   `id` (`tadeas-001`) platí dál a nikdy se nepřepisují.

   **Jediná výjimka:** `prejmenujNeodeslane()` v `src/core/debug.js` smí změnit
   prefix u záznamů, které **nikdy neopustily zařízení** (`!exportovanoDo`).
   Nabízí se to při přejmenování přezdívky v Nastavení. Na takové `id` nemůže
   odkazovat commit ani rejstřík, protože mimo ten telefon neexistuje.
   Odeslaný záznam se nepřejmenuje ani na přání.
2. **Záznamy nezakládej.** Číslování drží appka (`dalsiCislo` v IndexedDB
   `vandrbuch-debug`, do srpna 2026 v klíči `vandrbuch:debug`),
   takže ručně dopsaný záznam by dřív nebo později dostal `id`, které už existuje.
   AI záznamy jen **zavírá**.
3. **`Kontext` se needituje.** Sbírá ho appka automaticky a je to jediná část,
   která není něčí dojem.
4. **Cizí text nepřepisuj.** Na záznam se odpovídá opravou, ne editací zadání.

## Jak číst záznam

| Sekce | Co to je |
|---|---|
| **Popis** | pozorování uživatele |
| **Čekal jsem** · **Kroky** · **Jak často** | jen u bugu |
| **K čemu to je** · **Hotovo když** | jen u nápadu |
| **Návrh řešení** | **hypotéza uživatele, ne ověřený fakt** — ověř ji dřív, než se podle ní vydáš |
| **Kontext** | sebrala appka: čas, obrazovka, filtry, verze buildu, verze cache, online/offline, rozměr okna, zařízení, zaplnění úložiště |

`Zachycené chyby` jsou z kruhového bufferu posledních dvaceti (`src/core/chyby.js`).
Buffer běží celou dobu běhu appky, takže **nemusí souviset s popisovanou chybou** —
klidně jsou z jiné části sezení. Je to stopa, ne důkaz.

Triáž: nejdřív zkus reprodukovat podle `Kroky`. Když chybí, řiď se `Kontextem` —
u téhle appky je nejčastější tichou příčinou **plná paměť** (localStorage má
strop ~5 MB) a hned po ní **stará verze v cache** (`build` a `sw-cache`
v kontextu proti dnešnímu stavu).

## Když se záznam uzavře

**Jedním příkazem, ne rukou.** Ve stejném commitu, který nese opravu:

```bash
npm run debug-zavri -- tadeas-014 hotovo "mapa se po obnovení ze zálohy překreslí"
npm run debug-zavri -- anicka-003 zahozeno "duplicita k tadeas-014"
```

Skript udělá všechny tři kroky, nebo neudělá nic: vyhodí sekci z `.md`, přidá
řádek do `debug/VYRESENO.md` a smaže soubor, ze kterého zmizel poslední záznam.
Odmítne neznámé `id`, už zavřený záznam i jiný stav než `hotovo`/`zahozeno`.

**Ručně to nedělej.** Řádek ve `VYRESENO.md` má přesný tvar a ten, který mu
neodpovídá, parser **tiše přeskočí** — záznam pak z rejstříku zmizí, autor
u něj v appce uvidí „nedorazilo" a nikdy se nedozví, že je hotovo. Právě kvůli
tomu poznámkovač vznikl, takže je to ta nejhorší možná tichá chyba.

Hash commitu v řádku není: vzniká v tomtéž commitu, takže v okamžiku psaní
ještě neexistuje. Dohledá se `git log -S tadeas-014`.

**`VYRESENO.md` se nikdy nemaže ani nepřepisuje**, jen se do něj přidává. Je to
jediná stopa po záznamu, který už ve složce není, a appka z něj bere stav
zpátky. Je to zároveň jediný soubor ve složce, na kterém může vzniknout
konflikt v gitu — řeší se ponecháním obou řádků.

**Uzavřené záznamy stárnou z rejstříku ven** po 180 dnech
(`PLATNOST_UZAVRENYCH` v `scripts/debug-rejstrik.mjs`). Bez toho by každý kdy
zavřený záznam jel v `debug-stav.json` napořád, a ten se stahuje sítí napřed
při každém startu appky. Řádek ve `VYRESENO.md` zůstává; appka si uzavření
navíc pamatuje sama, takže se nikomu nepřepne na „zmizelo".

## Úklid složky

```bash
npm run debug-uklid              # uklidí
npm run debug-uklid -- --kontrola   # jen nahlásí, nic nemění
```

Když je totéž `id` ve víc souborech, platí ten **nejnovější** a starší kopie se
odstraní. Vyhodí se i záznamy, které jsou už ve `VYRESENO.md`. Prázdný soubor
se smaže.

Kontrolu pouští **pre-commit hook**, kdykoli se ve složce `debug/` něco mění,
a `npm run check-debug`. Duplicity totiž appce nevadí — rejstřík si vybere
nejnovější — takže se bez kontroly tiše nahromadí: v srpnu 2026 skončilo pět
záznamů ve dvanácti kopiích ve čtyřech souborech za dva dny.

**Soubory ve složce se nepřejmenovávají.** Pravidlo „platí nejnovější" stojí na
abecedním pořadí názvů, které začínají datem a časem — přejmenování by tiše
změnilo, co platí.

## Co je veřejné

Repozitář i beta jsou veřejné. **Co je v záznamu, si po commitnutí může
přečíst kdokoli** — na GitHubu i na webu bety, kam se nadpisy, popisy a návrhy
řešení nasazují v `debug-stav.json`. Kontext, kroky ani zachycené chyby se
tam nenasazují a názvy výprav a cest se do exportu vůbec neposílají, jen
jejich velikost (`src/core/debugKontext.js`).

## Když se záznam v appce po odeslání změní

Autor smí odeslaný záznam dál upravovat — appka se ho na to zeptá a označí ho
v seznamu terakotovým rámečkem („změněné"). Pozná to podle `otiskExportu`,
osmiznakového otisku podoby, která odešla (`otiskZaznamu()` v
`src/core/debug.js`). **V repozitáři tím pádem může ležet starší text, než
má autor v telefonu.** Řeší se to tak, že autor záznam vyexportuje znovu;
`id` zůstává, takže nový export ten starý v rejstříku nahradí.

Pro AI z toho plyne jedno: než se pustíš do řešení podle staršího exportu,
**stojí za to se zeptat, jestli k tomu autor nemá novější znění** — hlavně
u záznamu, který leží ve složce déle.

## Vztah k `BUGS.md` a `NAPADY.md`

`debug/` je průběžný proud z terénu. `BUGS.md` je pro věci, které jsou na
odstavce — rozbor, dovětky, důkazy. Když záznam takový rozbor potřebuje,
přestěhuj ho do `BUGS.md` jako `B<n>` a v řádku ve `VYRESENO.md` na to odkaž:

```markdown
- `tadeas-021` · 2026-09-05 · hotovo · viz BUGS.md B6 (delší rozbor)
```

`NAPADY.md` zůstává pro N1–N10, tedy pro vědomě neimplementované věci z doby
přestavby. Nový nápad z poznámkovače se tam **nepřepisuje** — má vlastní `id`
a vlastní životní cyklus.

## Commit zpráva

```
debug: tadeas-014 – mapa se po importu ze zálohy překreslí
```

Id v předmětu, aby šel záznam dohledat `git log -S tadeas-014`.

## Přehled otevřených

```bash
npm run debug-rejstrik -- --vypis
```

Vypíše, co ve složce leží. Tentýž skript skládá při buildu `debug-stav.json`,
ze kterého si appka bere stav zpátky — proto se **formát `.md` nemění bez
`scripts/check-debug.mjs`**: ten hlídá, že co `mdExport()` napíše, umí
`postavRejstrik()` přečíst.

Ověření po zásahu do poznámkovače: `npm run check-debug`, pak `npm run smoke`.
