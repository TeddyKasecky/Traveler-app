# Traveler-app

Produkce: https://traveler-app.teddykasecky.workers.dev
Beta (vývoj, aktualizuje se automaticky): https://traveler-app-beta.teddykasecky.workers.dev

**Vandrbuch** – cestovatelská databáze a wishlist míst po Evropě. 580 míst, mapa,
plánovač trasy, poznámky a hodnocení. Funguje i bez signálu.

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
4. V **nainstalované** aplikaci: ozubené kolečko vpravo nahoře → **Nastavení** →
   **Obnovit ze zálohy** → vybrat ten soubor
5. Zkontrolovat, že sedí poznámky, hvězdičky, plamínky, plán i fotky

**Na iPhonu pozor:** aplikace přidaná na plochu má vlastní úložiště, oddělené od
Safari. Obnovu proto dělejte **až v nainstalované aplikaci**, ne v Safari.

---

## 2. Publikování na internet

Jednorázové nastavení, potom už se o nic starat nemusíte.

Kód je na <https://github.com/TeddyKasecky/Traveler-app>.

### Jak je to nastavené

Od srpna 2026 na Cloudflare běží **dva** projekty napojené na tenhle repozitář,
každý na jinou větev:

| Projekt | Větev | Doména | Aktualizace |
|---|---|---|---|
| `traveler-app` | `production` | traveler-app.teddykasecky.workers.dev | jen ruční, zřídka |
| `traveler-app-beta` | `main` | traveler-app-beta.teddykasecky.workers.dev | automaticky, každý push |

Oba mají stejné nastavení buildu:

| Položka | Hodnota |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

Node se nenastavuje, verzi si Cloudflare přečte ze souboru `.node-version`.

Co se nasadí, říká [`wrangler.jsonc`](wrangler.jsonc): žádný kód, jen rozdávání
hotových souborů ze složky `dist`. Cloudflare dnes zakládá všechno jako Worker,
i když jde o obyčejnou statickou stránku – bez toho souboru `wrangler deploy`
neví, co má nahrát, a spadne. Stejný soubor slouží oběma projektům – rozlišuje
je jen to, na kterou větev je Cloudflare projekt napojený, ne obsah repozitáře.

Appka na ploše telefonu pozná betu podle jména – `traveler-app-beta` má build
proměnnou `VANDRBUCH_BETA=1` (Settings → Environment variables v Cloudflare
dashboardu), která přepíše `short_name` v manifestu na „Vandrbuch beta"
(`vite.config.js#pluginBetaManifest`). Stejná proměnná v hlavičce appky
rozsvítí i červený štítek „BETA" vedle nápisu Vandrbuch, ať je to vidět
hned po otevření, ne až po instalaci na plochu (`main.js`, `#betaZnacka`
v `index.html`). Na produkci (`traveler-app`) proměnná nikdy není nastavená,
takže se štítek nemůže objevit, ani kdyby se `production` omylem smergovala
se stejným kódem jako `main`.

### Potom

Push na `main` web sám přestaví a nasadí na betu. Produkce (`production`) se
neaktualizuje sama – posouvá se jen ručně, viz `CLAUDE.md` sekce „Nasazení na
produkci".

> **Repozitář je veřejný.** Kód i seznam míst si může přečíst kdokoli. Poznámky,
> hodnocení a vlastní fotky v něm nejsou – ty zůstávají jen v telefonu. Kdyby měl
> být neveřejný, dá se přepnout v *Settings → General → Change visibility*;
> Cloudflare umí nasazovat i ze soukromého repozitáře a web zůstane veřejný.

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

> **Bez signálu se mapa přepne na zjednodušenou.** Místo šedi uvidíte pobřeží,
> hranice států, jezera, řeky a města – na „kde zhruba jsme" to stačí. Podrobné
> dlaždice se neukládají: zabraly by v telefonu stovky megabajtů a hromadně
> stahovat je z OpenStreetMap se navíc nesmí. Co jste si nedávno prohlédli, vám
> ale prohlížeč sám podrží ve své paměti, takže tam bývá vidět i normální mapa.

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

Všechny se pouštějí ze složky s projektem – tam, kde leží `package.json`.
Poprvé je potřeba jednou `npm install`.

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
| `npm run smoke` | proklikání v prohlížeči, 56 kontrol |
| `npm run check-uloziste` | že se poznámky neztratí, když dojde místo |
| `npm run smoke:single` | totéž pro variantu z disku, 45 kontrol |
| `npm run check-regrese` | PWA, zálohy, fotky, poloha, service worker — 26 bodů |
| `npm run check-form` | že formulář vyrábí platná místa |
| `npm run check-tokeny` | barvy natvrdo, párování světlý/tmavý, kontrast |
| `npm run check-dny` | že se dělení plánu na dny neztratí |
| `npm run check-filters` | 134 kombinací filtrů |
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
  core/            čistá logika: stav, hledání, filtry, směrování, geo, CSV, úložiště
  map/             Leaflet: mapa, špendlíky, čára plánu, mini-mapa, offline podklad
  components/      díly použité na víc obrazovkách
  views/           obrazovky – Domů, Objevuj, Seznam, Plán, Detail
  styles/          CSS rozdělené po dílech; pořadí určuje index.css
  icons/           sada 45 symbolů
  pwa/             service worker a jeho registrace
  assets/          ikona aplikace a ilustrace dodávky
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

### Mapa bez signálu

Offline mapa umí dvě podoby a přepíná se mezi nimi v **Nastavení**.

**Zjednodušená** je rovnou v aplikaci a funguje hned: obrysy zemí, jezera, řeky,
985 měst a **stínování terénu**, takže hory mají tvar. Leží pod dlaždicemi
z OpenStreetMap, takže se nic nepřepíná – kde dlaždice jsou, překryjí ji; kde
chybí, prosvítá, a díra uprostřed jinak funkční mapy se tím vyplní taky.

**Malovaná** se musí jednou stáhnout (3,7 MB, Nastavení → Offline mapa →
Stáhnout mapu) a uloží se do telefonu. K obrysům přidá lesy, louky, pole, řeky,
silnice a kreslenou krajinu – stromy stojí na skutečných lesích a hory na
skutečných horách. Bez signálu pak funguje úplně stejně jako s ním.

Data: obrysy z Natural Earth (public domain, `src/data/basemap.json`), zbytek
z OpenStreetMap přes Protomaps (ODbL) a výškopis z `elevation-tiles-prod`.
Přegenerovat je jde skripty `make-basemap.mjs`, `make-mapa.mjs` a
`make-relief.mjs`; běžně to není potřeba.

### Dvě varianty jednoho zdroje

`npm run build` dělá web pro hosting. `npm run build:single` dělá jeden soubor,
který funguje i z flashky – všechno včetně fontů a ikon je v něm zabalené.
Rozdíl je jen v tom, co se vkládá dovnitř a jestli vzniká service worker; kód je
stejný a na variantu se ptá přes `import.meta.env.SINGLE_FILE`.

---

## 9. Na co si dát pozor

- **Neměnit klíče v úložišti** (`vandrbuch:v1`, `vandrbuch:prefs`, `vandrbuch:data`).
  Jsou v nich všechny poznámky a hodnocení. Fotky se přestěhovaly do IndexedDB,
  protože localStorage má strop 5 MB a fotky v něm dusily poznámky; starý klíč
  `vandrbuch:photos` se při prvním otevření sám vyprázdní.
- **Nepřepisovat odkazy na fotky.** Kódování diakritiky v adresách z Wikimedia
  Commons je citlivé a chyba se pozná až tím, že se obrázek tiše nenačte.
- `id` místa se **nikdy nemění**. Jsou na něj navázané poznámky, hodnocení i plán.

Odložené nápady a známé drobnosti mimo rozsah přestavby jsou v
[`NAPADY.md`](NAPADY.md). Doklad o shodě s původní aplikací je v
[`PARITA.md`](PARITA.md). Kde se skončilo a co je na řadě, shrnuje
[`STAV.md`](STAV.md).
