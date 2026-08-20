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
