# Vandrbuch

Cestovatelská databáze a wishlist míst po Evropě. 580 míst, mapa, plánovač trasy,
poznámky a hodnocení. Funguje i bez signálu.

Nepotřebuje žádný server ani databázi. Je to jeden web, který se v telefonu chová
jako aplikace.

---

## 1. Nejdřív ze všeho: přenos dat ze staré aplikace

> **Tohle nejde přeskočit ani udělat později.**

Poznámky, hodnocení, plamínky, plán i vlastní vyfocené fotky jsou uložené
**v prohlížeči**, ne v souboru s aplikací. A prohlížeč je drží zvlášť pro každou
adresu. Nová adresa je pro něj úplně jiný web, takže si data sám nepřenese.

1. Otevřít **starou** aplikaci (dnešní `index.html`)
2. Filtry → **Záloha poznámek** → uloží se soubor `vandrbuch-zaloha-….json`
3. Nainstalovat novou aplikaci do telefonu (kapitola 3)
4. V **nainstalované** aplikaci: Filtry → **Obnovit zálohu** → vybrat ten soubor
5. Zkontrolovat, že sedí poznámky, hvězdičky, plamínky, plán i fotky

**Na iPhonu pozor:** aplikace přidaná na plochu má vlastní úložiště, oddělené od
Safari. Obnovu proto dělejte **až v nainstalované aplikaci**, ne v Safari.

---

## 2. Publikování na internet

Jednorázové nastavení, potom už se o nic starat nemusíte.

### Jednou

1. Založit na GitHubu prázdný **soukromý** repozitář `vandrbuch`, nic nezaškrtávat
2. Nahrát projekt:
   ```
   git remote add origin https://github.com/UZIVATEL/vandrbuch.git
   git push -u origin main
   ```
3. Na [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** →
   Create → Pages → **Connect to Git** → vybrat `vandrbuch`
4. Nastavit:

   | Položka | Hodnota |
   |---|---|
   | Framework preset | **None** |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

5. **Save and Deploy.** Za dvě minuty je web na `https://vandrbuch.pages.dev`

### Potom

Každý `git push` web sám přestaví a nasadí. Nic dalšího se nedělá.

---

## 3. Instalace do telefonu

Aplikace musí být na adrese s **https** – z disku ani z vývojového serveru ji
prohlížeč nainstalovat nenechá.

**Android:** otevřít adresu v Chrome. Sám nabídne *Nainstalovat aplikaci*.
Kdyby ne: nabídka ⋮ → *Přidat na plochu*.

**iPhone:** otevřít adresu **v Safari** (v jiném prohlížeči to nejde) →
tlačítko Sdílet → *Přidat na plochu*.

Po instalaci se aplikace chová jako každá jiná: vlastní ikona, žádný prohlížeč
kolem, funguje bez signálu.

> **Mapové dlaždice se offline neukládají.** Aplikace i všech 580 míst fungují,
> ale mapa zůstane šedá – stejně jako dosud. Ukládat dlaždice by znamenalo zabrat
> v telefonu stovky megabajtů.

---

## 4. Přidání místa

### Z telefonu, bez počítače

1. V aplikaci: Filtry → **Přidat místo**, vyplnit, **Zkopírovat JSON**
2. Na GitHubu otevřít `src/data/places-nova.json` → tužka → vložit → **Commit**
3. Za minutu aplikaci otevřít znovu

### Z počítače

1. `npm run dev`, formulář, **Zkopírovat JSON**
2. Vložit do `src/data/places-nova.json`
3. `npm run validate` → `git commit` → `git push`

### Ručně, bez formuláře

Popis všech 29 polí i s číselníky je v [`src/data/schema.md`](src/data/schema.md).
Je psaný tak, aby se místo dalo přidat bez čtení kódu.

### Proč dva soubory s místy

`src/data/places.json` je hlavní soubor. Má 780 kB a 26 tisíc řádků – vkládat do
něj text na mobilu je utrpení. `src/data/places-nova.json` je malá přihrádka na
nová místa; aplikace si obojí spojí a kontrola hlídá obojí dohromady.

Občas, když se to hodí, se přihrádka vysype do hlavního souboru:

```
npm run slouc
```

Přesune místa, přepočítá okolí a malý soubor vyprázdní. Není to povinné, nic se
nerozbije, když se to nedělá.

---

## 5. Přidání kategorie nebo kolekce

Kontrola odmítne kategorii i kolekci, která není v číselníku. Nová se přidává
na jednom místě:

| Co | Kam | Co vyplnit |
|---|---|---|
| Kategorie (`k`) | [`src/data/categories.js`](src/data/categories.js) | název, barva, ikona |
| Kolekce (`col`) | [`src/data/collections.js`](src/data/collections.js) | klíč, popisek, ikona |
| Nálada na Domů | [`src/data/moods.js`](src/data/moods.js) | popisek, ikona, kategorie |

Ikony jsou v [`src/icons/sprite.svg`](src/icons/sprite.svg), je jich 45 a jmenují
se `i-neco`. Používá se jméno symbolu bez mřížky, třeba `i-van`.

---

## 6. Aplikace ukazuje staré. Co s tím?

1. **Počkat minutu.** Cloudflare musí web přestavět.
2. **Zavřít a znovu otevřít.** Nová verze se stahuje na pozadí; aplikace se
   překreslí sama, pokud se to stihne během prvních tří vteřin.
3. **Pořád staré?** Zkontrolovat na Cloudflare v *Deployments*, jestli build
   proběhl. Když svítí červeně, otevřít log – skoro vždy je to překlep v JSONu.
   `npm run validate` na počítači ho najde dřív.

---

## 7. Příkazy

Všechny se pouštějí ze složky `vandrbuch`.

### Běžná práce

| Příkaz | Co dělá |
|---|---|
| `npm run dev` | vývojový server, dostupný i z mobilu na stejné wifi |
| `npm run validate` | kontrola dat míst – pustí se i sama před commitem |
| `npm run slouc` | vysype `places-nova.json` do hlavního souboru |

### Sestavení

| Příkaz | Co dělá |
|---|---|
| `npm run build` | web do `dist/` – tohle nasazuje Cloudflare |
| `npm run build:single` | jeden soubor `dist-single/index.html` na disk, offline |
| `npm run preview` | prohlédnutí sestaveného webu |

### Kontroly

| Příkaz | Co ověří |
|---|---|
| `npm run smoke` | proklikání v prohlížeči, 39 kontrol |
| `npm run smoke:single` | totéž pro variantu z disku, 34 kontrol |
| `npm run parity` | kontrolní seznam z [`PARITA.md`](PARITA.md), 25 bodů |
| `npm run check-handlers` | že žádnému tlačítku nechybí napojení |
| `npm run check-css` | že se CSS neliší od originálu |
| `npm run check-filters` | 134 kombinací filtrů |
| `npm run check-data` | že data sedí s původním souborem |
| `npm run check-images` | že odkazy na fotky na Wikimedia Commons existují |
| `npm run perf` | rychlost startu při zpomaleném procesoru |

Porovnání vzhledu po pixelech:

```
node scripts/screenshots.mjs && node scripts/compare-screens.mjs
```

---

## 8. Jak je to poskládané

Jeden soubor = jedna zodpovědnost. Žádný framework, žádná knihovna na vzhled.

```
src/
  main.js          spojení všeho dohromady, nic víc
  data/            místa, číselníky, kontrola dat, schema.md
  core/            čistá logika: stav, hledání, filtry, směrování, geo, CSV
  map/             Leaflet: mapa, špendlíky, čára plánu, mini-mapa
  components/      díly použité na víc obrazovkách
  views/           obrazovky – Domů, Objevuj, Seznam, Plán, Detail
  styles/          CSS rozdělené po dílech; pořadí určuje index.css
  icons/           sada 45 symbolů
  pwa/             service worker a jeho registrace
  assets/          ikona aplikace a ilustrace dodávky
reference/         bajtově shodná kopie původní aplikace, na porovnávání
scripts/           kontroly a pomocníci
```

**Přidání obrazovky:** složka ve `views/`, záznam v `src/views/index.js`,
tlačítko v `index.html`. Nic jiného.

Aplikace nemá žádné globální proměnné kromě těch v
[`src/core/store.js`](src/core/store.js). Mapa a obrazovky se navzájem nevolají
napřímo, oznamují si změny událostmi – jinak by přidání obrazovky znamenalo
sahat do mapy.

### Service worker

`src/pwa/sw.js` je **šablona**. Seznam souborů k uložení a číslo verze do ní
doplní až `vite.config.js` při sestavení, protože jména souborů obsahují otisk
obsahu. Nikdy se needituje `dist/sw.js`, vždycky ta šablona.

Verze cache se počítá ze seznamu souborů. Když se nic nezmění, service worker
zůstane stejný a prohlížeč ho zbytečně nepřeinstaluje.

### Dvě varianty jednoho zdroje

`npm run build` dělá web pro hosting. `npm run build:single` dělá jeden soubor,
který funguje i z flashky – všechno včetně fontů a ikon je v něm zabalené.
Rozdíl je jen v tom, co se vkládá dovnitř a jestli vzniká service worker; kód je
stejný a na variantu se ptá přes `import.meta.env.SINGLE_FILE`.

---

## 9. Na co si dát pozor

- **Neměnit klíče v localStorage** (`vandrbuch:v1`, `vandrbuch:photos`,
  `vandrbuch:prefs`). Jsou v nich všechny poznámky, hodnocení a fotky.
- **Nepřepisovat odkazy na fotky.** Kódování diakritiky v adresách z Wikimedia
  Commons je citlivé a chyba se pozná až tím, že se obrázek tiše nenačte.
- **Nesahat na `reference/index-original.html`.** Je to měřítko, proti kterému se
  porovnává parita.
- `id` místa se **nikdy nemění**. Jsou na něj navázané poznámky, hodnocení i plán.

Odložené nápady a známé drobnosti mimo rozsah přestavby jsou v
[`NAPADY.md`](NAPADY.md). Doklad o shodě s původní aplikací je v
[`PARITA.md`](PARITA.md).
