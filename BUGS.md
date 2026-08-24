# Nedodělky a zjištěné závady

Na rozdíl od [`NAPADY.md`](NAPADY.md) (nápady a vylepšení, čeká se na dohodu,
*jestli* se má něco dělat) je tohle pro věci, které appka měla dělat správně,
ale nedělá — hlavně takové, na které narazí druhý člověk při mergi nebo
vlastním testu appky a nemůže je hned sám dořešit (např. rozdělaná práce na
stejném místě, na kterou druhá osoba přijde nehotovou). Zapisuje se sem i
rozdělaná práce, co zůstala nehotová, ať to při dalším mergi nezapadne.

Vyřešené záznamy zůstávají v souboru s `~~VYŘEŠENO~~` — je to i doklad, že
se to prošetřilo a proč (nebo že se v kódu nakonec nic neopravovalo).

---

**B1 — Na mapě zdánlivě chybí čára trasy — ~~VYŘEŠENO~~**
Zjištěno: 20. 8. 2026, uživatel při testu tlačítka Přepočítat.
Stav: vyřešeno diagnostikou, nebyla to chyba v kódu.

Appka se zdánlivě chovala, že po založení výpravy a Přepočítání se na mapě
nezobrazí žádná čára trasy — ani dnešní výchozí fallback (vzdušná spojnice
bodů), natožpak skutečná trasa z Mapy.com Routing API. Diagnostikováno jako
zdokumentovaný záměr, ne chyba: `src/map/planLine.js:132-136` — když existuje
aktivní cesta (`store.cesta`, po stisku Vyjet), `drawPlanLine()` kreslí
**otisk té cesty** (`store.cesta.zastavky`, pořízený v okamžiku vyjetí), ne
živý `store.plan`, se kterým se právě pracuje v Itineráři. Uživatel měl
v okamžiku testu aktivní „Na cestě" ze dřívějška, takže editace/přepočet
živého plánu se na mapě neprojevily — appka pořád kreslila starý otisk.

Ověřeno reprodukcí: appka bez aktivní cesty vykreslila trasu (vzdušnou i po
přepočtu) správně napoprvé.

Řešeno tím, že appka dostala mód mapy „Na cestě" (`NAPADY.md` N13,
`S.mapaMod`), který uživateli jasně ukáže, na co se dívá — dokud appka
nerozlišovala vizuálně „živý plán" od „aktivní cesta", bylo snadné se
splést. V `map/planLine.js` se nic neopravovalo, chování je správné.

---

**B2 — Mini-mapa na dashboardu ignorovala skutečnou trasu — ~~VYŘEŠENO~~**
Zjištěno: 21. 8. 2026, uživatel po mergi Aniččina dashboardu (košík/termín).
Stav: opraveno.

Po sloučení `tadeas/work` (mód mapy, routing) do `main` zůstala mini-mapa na
dashboardu výpravy (`src/views/plan/plan.js#vykresliMapuDashboardu()`,
`<div id="dashMapa">` v `dashboard.js`) u vzdušné spojnice zastávek natvrdo
— tlačítko Přepočítat sice uložilo skutečnou trasu z Mapy.com Routing API do
`store.aktivniPrepocet` a hlavní mapa (`map/planLine.js`) ji správně
vykreslila, ale dashboard mini-mapu nikdo neaktualizoval, protože vznikla
nezávisle na routingu a nikdy s `aktivniPrepocet` nepočítala.

Opraveno stejným vzorem jako `map/planLine.js:196-201`: `plan.js` teď
importuje `otiskBodu` z `routing.js` a před vykreslením čáry porovná otisk
zastávek s `store.aktivniPrepocet.otisk` — když sedí, kreslí se skutečná
`polyline`, jinak fallback (vzdušná spojnice, jak dřív).

**Dovětek** (21. 8. 2026): první verze opravy počítala otisk jen ze
`store.plan` zastávek (`body`), takže u výprav s vlastními body trasy
(start/nocleh/cíl z `store.bloky`) se otisk nikdy neshodoval se skutečným
přepočtem — `views/plan/routing.js#sberBoduProRouting()` totiž posílá do
Mapy.com API množinu bodů ze `serazenaTrasa()` (`views/plan/body.js`), NE
jen zastávky. Opraveno importem `serazenaTrasa` přímo do `plan.js` (views/
smí importovat views/, na rozdíl od `map/`, které `serazenaTrasa()` proto
duplikuje jako `vlastniMista()` v `planLine.js`) a počítáním otisku z ní
místo z `body`. Markery (špendlíky) na dashboardu dál kreslí jen `body`
(`store.plan` zastávky) beze změny — ty vlastní body jako špendlíky
nekreslily ani předtím, mění se jen zdroj pro čáru/otisk. Ověřeno E2E
(Playwright, mock API): výprava s vlastním bodem trasy má
`store.aktivniPrepocet.otisk === otiskBodu(serazenaTrasa())` po přepočtu,
dashboard vykreslí skutečnou `polyline`.

---

**B3 — Přepočet otisku cesty se nikdy nezobrazil s vlastními body v plánu — ~~VYŘEŠENO~~**
Zjištěno: 21. 8. 2026, uživatel po zavedení `prepocitejOtiskCesty()` –
appka hlásila „Trasa přepočítána", ale na mapě v módu „Na cestě" zůstávala
vzdušná čára.

Opačná chyba než B2: `prepocitejOtiskCesty()` počítala otisk přes
`serazenaTrasa(c.zastavky, c.dny)` **se** zapnutými vlastními body
(`zahrnoutVlastniBody` výchozí `true`), ale `map/planLine.js#drawPlanLine()`
u otisku cesty vlastní body do `body` NEZAHRNUJE (`mista = otisk ? [] :
vlastniMista()`, řádek 144) — takže `otiskBodu(body)` počítaný při kreslení
nikdy neodpovídal uloženému `otisk` v `store.cesta.prepocet`, `platny` bylo
vždy `false` a appka tiše spadla na fallback. Projevilo se jen u výprav
s aspoň jedním vlastním bodem (start/nocleh/cíl/vlastní) — bez nich měl
`serazenaTrasa()` v obou variantách stejný výsledek, takže první ruční test
(bez vlastních bodů) chybu neodhalil.

Opraveno přidáním parametru `zahrnoutVlastniBody` do
`views/plan/body.js#serazenaTrasa()` (výchozí `true`, beze změny pro živý
plán) a voláním `serazenaTrasa(c.zastavky, c.dny, false)` v
`prepocitejOtiskCesty()` — stejná množina bodů, jakou `planLine.js` používá
pro otisk. Ověřeno E2E (Playwright, mock API): výprava s vlastním bodem
(`druh: 'start'`) má po přepočtu `store.cesta.prepocet.otisk` shodný s
`otiskBodu(serazenaTrasa(c.zastavky, c.dny, false))`, na mapě se v módu
„Na cestě" vykreslí skutečná polyline (ne fallback).

---

**B4 — Přetažení zastávky do jiného dne se projevilo jako prohození — ~~VYŘEŠENO~~**
Zjištěno: 24. 8. 2026, uživatel při přípravě přestavby Plánů — „stále je
problém házet více událostí do jednoho dne, pokud je tam jedna událost;
v tuto chvíli se pouze prohodí události".

Tažení v itineráři (`views/plan/plan.js#napojTahani()`) při puštění zastávky
přeskládalo `store.plan`, ale **`store.planDny` nechalo beze změny**:

```js
store.plan.splice(kde, 1)
if (kam > kde) kam--
store.plan.splice(kam, 0, id)
save()          // ← planDny se nikdy nezapisovaly
```

`dnyPlanu()` pak plán rozřezal podle STARÝCH délek. U dnů s jednou zastávkou
(délky `[1,1]`) byl efekt nejvýraznější: přesun A za B dal `plan = [B,A]`,
délky pořád `[1,1]`, tedy den 1 = B, den 2 = A — vypadalo to, že se zastávky
prohodily, místo aby se jedna přestěhovala.

Druhá, tišší část téže chyby: cíl puštění se hledal jako **nejbližší zastávka
nad novou polohou**, takže do prázdného dne se nedalo pustit nic (prázdný den
žádnou zastávku nemá a kotva spadla do dne nad ním). A bod trasy puštěný bez
kotvy dostal natvrdo `den: 1`, takže z pátého dne skočil na začátek prvního.

Opraveno vytažením zápisu do datové vrstvy: nová `presunZastavku(id, doDne,
poId)` ve `views/plan/dny.js` pracuje nad `dnyPlanu()` (pole polí) a výsledek
zapisuje přes `nastavDny()`, které odmítne rozdělení s nesedícím součtem —
takže se zastávka nemůže ztratit. Cílový den určuje nová `denPodPrstem(y)`
v `plan.js` z **hlaviček dnů** (`.denhd[data-den]`), ne ze sousední zastávky;
hlavičky se při tažení zastávky neposouvají, takže jejich změřená poloha
odpovídá tomu, co je vidět na obrazovce. `poDrop` se navíc volá i při
`cil === start` — poslední zastávka dne puštěná do prázdného dne pod ním
v seznamu nikoho nepřeskočí, a dřívější `if (cil !== start)` ji zahodilo.

Ověřeno `npm run check-dny` (10 nových bodů, 167/167): přesun do dne
s jedinou zastávkou, do prázdného dne, přes dva dny zpět, bez kotvy, s kotvou
z cizího dne, puštění na místě (nezapisuje), den mimo rozsah, neznámé id.
