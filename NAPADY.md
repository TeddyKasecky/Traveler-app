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

**N11 — Tlačítko „přepnout na zjednodušenou mapu"**
Podklad leží pod dlaždicemi a nepřepíná se, takže nic neproblikává. Při slabém signálu
ale vzniká jiná nepříjemnost: prohlížeč část dlaždic vytáhne ze své cache a část ne, takže
kus mapy je podrobný a kus zjednodušený — a při posunu se to střídá. Mapa pak vypadá
roztrhaně.

Řešení by bylo tlačítko, kterým se dlaždice úplně vypnou a jede se jen na zjednodušené
mapě, dokud ho uživatel nevypne zpět. Mapa by byla jednotná a nic by se nedotahovalo.
Vyžaduje rozmyslet, kam tlačítko patří (dnes je vlevo dole jen štítek, který nic nedělá)
a jestli se stav má pamatovat mezi spuštěními.

---

## Výkon

**N10 — Seznam se renderuje najednou**
`renderList()` má strop 250 karet a hlášku „Zobrazeno prvních 250". Není to virtualizace.
Kdyby se strop zvedal, chtělo by to lazy render. Měření přijde ve fázi 3;
bez souhlasu neměním, je to změna chování.
