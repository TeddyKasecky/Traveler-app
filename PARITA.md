# Kontrolní seznam parity

Doklad, že přestavěná aplikace dělá totéž co původní `index.html`. Každý bod má
u sebe důkaz, ne tvrzení. Všechno jde spustit znovu příkazy uvedenými u kapitol.

Referenční kopie originálu je v `reference/index-original.html` a je bajt po bajtu
shodná s tím, co běží dnes.

---

## Souhrn

| Kontrola | Příkaz | Výsledek |
|---|---|---|
| Data 1:1 | `npm run check-data` | **DATA SEDÍ** |
| Schéma dat | `npm run validate` | **0 chyb**, 5 varování |
| CSS pravidlo po pravidle | `npm run check-css` | **338 pravidel sedí**, jediné rozdíly jsou odsouhlasené |
| Filtry, 134 kombinací | `npm run check-filters` | **všechny sedí** |
| Napojení tlačítek | `npm run check-handlers` | **61 / 61** |
| Proklikání, hostovaná | `npm run smoke` | **39 / 39** |
| Proklikání, single-file | `npm run smoke:single` | **34 / 34** |
| Kontrolní seznam níž | `npm run parity` | **25 / 25** |
| Odkazy na fotky | `npm run check-images` | **262 / 262 existuje** |
| Vzhled po pixelech | `node scripts/screenshots.mjs && node scripts/compare-screens.mjs` | viz níž |

---

## 1. Vzhled

Osm obrazovek vyfocených ve staré i nové verzi, 390 × 844 při dvojnásobné hustotě,
porovnáno po pixelech.

| Obrazovka | Rozdílných pixelů | Podíl | Co to je |
|---|---|---|---|
| Domů | 2 726 | 0,21 % | logo |
| Objevuj | 2 726 | 0,21 % | logo |
| Seznam | 2 726 | 0,21 % | logo |
| Plán | 2 726 | 0,21 % | logo |
| Detail | 2 726 | 0,21 % | logo |
| Mapa | 2 849 | 0,22 % | logo + dlaždice, které se pokaždé načtou jinak |
| Filtry | 3 571 | 0,27 % | logo pod ztmavením |
| Průvodce | 737 501 | 56,01 % | **odsouhlasená oprava** – dřív byl neviditelný |

Mimo logo a průvodce se nezměnil jediný pixel. Obojí je odsouhlasená změna, viz níž.

---

## 2. Instalace jako aplikace (PWA)

| Bod | Důkaz |
|---|---|
| manifest se načte a je platný | HTTP 200 · `display=standalone` · 2 ikony |
| obě ikony se opravdu stáhnou | 192×192 · 512×512 |
| logo v hlavičce není rozbité | `naturalWidth` 192 px |
| service worker běží a řídí stránku | `navigator.serviceWorker.controller` nastavený |
| `apple-touch-icon` pro iPhone | `icon-192.png` |

**Poznámka:** tohle je jediná oblast, kde je nová verze lepší než stará. Originál
manifest i ikonu v hlavičce **odkazoval, ale soubory nikdy neexistovaly**
(`index-original.html:8-10`) – proto dnes chybí logo a proto se appka nedá pořádně
nainstalovat. Odsouhlaseno jako Q1.

---

## 3. Uložená data přežijí aktualizaci

| Bod | Důkaz |
|---|---|
| klíče v localStorage se nezměnily | `vandrbuch:v1` · `vandrbuch:photos` · `vandrbuch:prefs`, doslova jako v originále |
| smazání celé cache o data nepřipraví | smazána 1 cache → `vandrbuch:v1` 260 B → 260 B, appka naběhla s 580 místy |

Service worker sahá jen na `caches`, nikdy na `localStorage`. Aktualizace aplikace
tedy o poznámky připravit nemůže.

---

## 4. Tlačítko zpět na Androidu

| Bod | Důkaz |
|---|---|
| přepnutí záložky zapíše historii | `#list` → `#disc` → zpět → `#list` |
| zpět zavře detail a nechá záložku být | otevřen → zpět → zavřen, záložka `#map` zůstala `#map` |
| zpět zavře panel filtrů a nechá záložku být | otevřen → zpět → zavřen, zůstalo `#map` |

Ťuknutí na kartu v seznamu přepíná na mapu – to dělá `goTo()` a **originál to dělá
taky** (`index-original.html:1015`), takže `#map` je správně.

Práce s historií je nové chování, odsouhlasené jako Q4. Dřív tlačítko zpět appku
na Androidu rovnou opustilo.

---

## 5. Bezpečné okraje na iPhonu

| Bod | Důkaz |
|---|---|
| `viewport-fit=cover` v hlavičce | v originále i u nás |
| `env(safe-area-inset-*)` | originál **11×**, naše **11×** |

Na opravdovém iPhonu to ověřte prosím sama – tohle je nejvíc, co jde změřit strojově.

---

## 6. Data: CSV, záloha, obnova, návrat k vestavěným

| Bod | Důkaz |
|---|---|
| import CSV vymění data | 1 místo · `id` složené jako dřív: `zkusebni-vodopad-234` |
| „Vrátit vestavěná data" | 580 míst · `dataOverride` zpět na `null` |
| záloha obsahuje všechno | `notes` · `rating` · `plan` · `prio` · `photos` · `prefs` |
| obnova vrátí všechno zpátky | poznámka s diakritikou ✓ · 4 hvězdy · 3 plamínky · 1 zastávka · 1 fotka |

**Záloha byla doplněna** (odsouhlaseno). Původní verze `prio`, `photos` ani `prefs`
neukládala, přestože obnova `prio` číst uměla (NAPADY.md N2). Dokud appka běžela na
jednom místě, nevadilo to. Při přechodu na vlastní adresu je ale záloha jediná cesta,
jak si data přenést – a s tou děravou by se **nenávratně ztratily vlastní fotky**.
Starší soubory záloh zůstávají čitelné.

---

## 7. Ostatní funkce

| Bod | Důkaz |
|---|---|
| vlastní fotka | uloží se pod `id` místa do `vandrbuch:photos` |
| poznámka, hvězdičky, plamínky | poznámka s diakritikou, 4 hvězdy, 3 plamínky |
| „Moje poloha" | 1× puntík na mapě · „Poloha nalezena ✓ · nejblíž 5,1 km" |
| „Něco blízko" | přepne na Objevuj |
| „Překvap mě" | vylosuje místo, zapíše `lastTip` |
| plán: přidání | 1 zastávka |
| plán: „Kopírovat" | „🚐 Plán Vandrbuch (0,0 km) …" ve schránce |
| plán: „Do navigace" | `https://www.google.com/maps/dir/?api=1&destination=…` |
| chyby v konzoli za celý průchod | **nula** |

### Chyba, kterou tenhle seznam odhalil

Při přestavbě se ztratil jediný řádek – `index-original.html:1240`, napojení tlačítka
**„Moje poloha"**. Aplikace vypadala úplně stejně, jen to tlačítko nic nedělalo.
Očima by se to nenašlo.

Proto vznikl `npm run check-handlers`: spustí obě verze vedle sebe, projde stejnou
cestu a porovná, na kterých prvcích visí obsluha. Přesně, ne odhadem ze zdrojáku.
Dnes hlásí **61 ku 61** a při každé další změně to ohlídá.

---

## 8. Výkon

`npm run perf`. Zpomalení procesoru napodobuje mobil: 4× odpovídá zhruba střední
třídě, 6× starším nebo přehřátým telefonům.

| Procesor | První obraz | DOM hotový | 580 špendlíků | Seznam 250 karet |
|---|---|---|---|---|
| 1× (počítač) | 216 ms | 190 ms | 211 ms | 76 ms |
| 4× (běžný mobil) | 260 ms | 852 ms | 997 ms | 323 ms |
| 6× (starší mobil) | 380 ms | 1 319 ms | 1 517 ms | 529 ms |

| Procesor | Běh JavaScriptu | Rozvržení a styly | Paměť |
|---|---|---|---|
| 1× | 79 ms | 264 ms | 8 MB |
| 4× | 365 ms | 1 224 ms | 8 MB |
| 6× | 617 ms | 1 784 ms | 8 MB |

**Závěr: rychlost řešit nepotřebujeme.** I na záměrně zmrzačeném procesoru je appka
kompletní do 1,5 sekundy a první obraz do 0,4 s.

Zajímavé je, kde čas opravdu je. Obava ze zadání mířila na 535 kB dat, která se
parsují při startu – jenže **veškerý JavaScript** včetně toho parsování zabere na
6× zpomaleném procesoru 617 ms. Dvakrát tolik spolykalo **rozvržení a styly**, tedy
kreslení 580 špendlíků jako prvků stránky.

Kdyby to jednou vadilo, opravovalo by se tohle, ne data – Leaflet umí špendlíky
kreslit do plátna místo do stránky. **Neimplementuju**, není proč.

Ke stažení je jednorázově **485 kB** (zabaleno). Po instalaci už appka nestahuje nic.

---

## 9. Odsouhlasené odchylky od originálu

Všechno ostatní je 1:1. Tohle je úplný seznam toho, co se liší.

| # | Změna | Proč | Kde |
|---|---|---|---|
| Q1 | přibyly `manifest.webmanifest`, `icon-192/512.png`, `sw.js` | originál je odkazoval, ale neexistovaly – proto chybí logo a nejde nainstalovat | `public/`, `src/pwa/` |
| Q2 | hledání ignoruje diakritiku | „soutesky" dřív nenašlo „Soutěsky" | `src/core/search.js` |
| Q3 | Leaflet a fonty zabalené z npm místo z CDN | bez toho single-file offline neexistuje | `package.json`, `src/styles/fonts.css` |
| Q4 | záložky v adrese, tlačítko zpět mezi nimi přepíná | dřív zpět na Androidu appku opustilo | `src/core/router.js` |
| Q5 | smazaná `vanScene()` a jejích 6 animací | mrtvý kód, nikdy se nevolal | – |
| Q6 | průvodce má `z-index: 1300` místo `60` | byl pod ztmavením, klik do něj ho zavřel | `src/styles/components/wizard.css` |
| — | zavřený průvodce má `visibility: hidden` | důsledek Q6: jeho stín kreslil linku přes lištu záložek (746 px) | tamtéž |
| — | záloha ukládá i `prio`, `photos`, `prefs` | jinak by se při přechodu na novou adresu ztratily vlastní fotky | `src/core/csv.js` |
| — | nová verze se projeví hned při prvním otevření | jinak by se po nasazení ukázala až napodruhé | `src/pwa/register.js` |
| — | ve vývojovém režimu se neregistruje service worker | `sw.js` vzniká až při buildu, jinak by v konzoli svítila chyba | tamtéž |

Nálezy mimo rozsah přestavby, které jsme se rozhodli **nechat být**, jsou v `NAPADY.md`.
