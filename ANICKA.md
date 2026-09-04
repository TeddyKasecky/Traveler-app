# Anička, tohle se stalo, když ses nedívala

Ahoj. Tenhle soubor je pro tebe a je to průvodce po všem, co se v appce
změnilo mezi tím, co vidíš na ostré adrese, a tím, co je teď na betě.

Píšu ho já — ta AI, co to všechno psala s Tadeášem. Budu psát v první osobě,
protože většinu těch věcí jsem opravdu psal já, a hlavně proto, že se pak dá
poctivě napsat i „tohle jsem třikrát pokazil, než to začalo dávat smysl".
Kdyby to psal někdo zvenčí, vyšla by z toho suchá tabulka a ty bys ji nedočetla.

---

## Než začneš

**Ostrá appka stojí na 24. srpnu. Beta je o deset dní dál.** Mezi tím je
**110 commitů** (89 skutečných změn a 21 dávek poznámek), **134 změněných
souborů**, **+19 986 řádků nového kódu a −4 936 vyhozeného**. Přibylo
35 nových modulů, sedm jsem smazal.

Kde se pracovalo nejvíc, měřeno řádky:

| kde | řádků |
|---|---|
| Plán | 3 803 |
| poznámkovač (nová vývojářská obrazovka) | 1 334 |
| Domů | 758 |
| Nastavení | 557 |
| Objevuj | 224 |
| Detail | 102 |
| Seznam | 91 |
| Profil | 81 |
| Mapa (obrazovka) | 8 |

K tomu 3 622 řádků v datové vrstvě, 2 041 ve společných dílech a 1 184 ve
stylech. Ta poslední řádka je tvoje.

### Jak to číst

Jdu po obrazovkách, jak je máš v appce dole v liště. U každé kapitoly píšu
tři věci:

- **co appka umí** — to je hotové a funguje,
- **jak jsem k tomu došel** — protože z toho je vidět, proč to vypadá tak,
  jak to vypadá, a co se rozbije, když se to změní zpátky,
- **co je na tobě** — barvy, rozestupy, formulace, pořadí. Tam já končím
  a začínáš ty.

Na konci jsou dvě kapitoly, které stojí za přečtení, i kdybys zbytek
přeskočila: **Čeho se nedotýkat** (věci, které vypadají jako chyba a jsou
záměr) a **Co je na tobě** (souhrn všeho, co čeká na tvoje oko).

### Jedna poctivá poznámka na úvod

Větve se trochu rozešly. `production` má dva commity, které na `main` nejsou —
obě dávky ikon VW Transporteru z 24. srpna. Obsahově je to totéž, co je na
`main` taky (jsou to cherry-picky), takže se při nasazení nic neztratí. Jen
kdyby ti někdo tvrdil, že produkce je čistá podmnožina bety, tak úplně přesně
to není.

---

## Domů

Domů byla obrazovka, která ti něco ukázala a ty jsi to musela vzít, jak to je.
Teď je to obrazovka, kterou si každý poskládá sám.

### Skládání sekcí

V **Nastavení → Domů** je tabulka sedmi sekcí. U každé máš šipky nahoru/dolů
a oko. Šipkami měníš pořadí, okem sekci zhasneš. Pořadí i zhasnuté sekce se
ukládají do předvoleb a **jdou do zálohy**, takže se ti to přenese i na jiný
telefon.

Vzniklo to z hlášení `tadeas-f32-009` a je na tom pár věcí, které vypadají
jako detail a nejsou:

**Registr sekcí je jeden a čtou ho dva.** Domů z něj vykresluje, Nastavení
z něj bere názvy a popisky do tabulky. Kdybych nechal Nastavení, ať si vypíše
vlastní seznam, do měsíce by se ty dva rozešly a v tabulce by chyběla sekce,
která na Domů je (nebo hůř: byla by tam sekce, která už neexistuje).

**Zhasnutá sekce nestojí ani ten výpočet.** Domů dřív spočítala všechno
napřed — šest průchodů přes všech 580 míst — a teprve pak z toho skládala
stránku. Teď se počítá až to, co se opravdu kreslí. Zhasneš-li čtyři sekce,
ušetříš čtyři průchody.

**Čtení uloženého pořadí unese tři nepříjemnosti**, a to schválně, protože
každá z nich by jinak appku rozbila potichu:

- předvolba chybí (poprvé) → použije se výchozí pořadí,
- v uloženém pořadí není `id`, které mezitím přibylo (nová sekce) → jde
  **na konec**, ne pryč. Kdyby šla pryč, přidal bych do appky sekci, kterou by
  nikdo, kdo si Domů někdy přeskládal, nikdy neuviděl.
- `id` je tam dvakrát nebo je neznámé → zahodí se. Dvakrát vykreslená sekce
  by udělala dvě stejná `id` v HTML a obsluha tlačítek by se navěsila jen na
  první z nich; klikala bys a nic by se nedělo.

**Pozdrav se zhasnout nedá** a v tabulce není. Je to hlavička obrazovky, ne
sekce.

**Zhasnout jde i úplně všechno.** Domů pak není prázdná — ukáže nápovědu, kde
se to zapíná zpátky. Bez ní by to vypadalo jako rozbitá appka a přitom je to
stav na dvě ťuknutí.

### Fotokarty: z posuvného pásu do mřížky

Fotky míst byly na Domů posuvný pás, který se táhl doprava mimo obrazovku.
Teď je to **mřížka 3×2**. Důvod je jednoduchý: fotky míst nemají pořadí.
U posuvného pásu ti appka říká „tohle je začátek a zbytek si najdi", u mřížky
říká „tady je šest, vyber si". Posun do strany navíc na telefonu není poznat —
vypadá to úplně stejně jako když se prostě nic dalšího nenabízí.

Vodorovný pás v appce zůstal na jednom místě, a to schválně: **pruh hodin
u počasí**. Tam totiž pořadí je, je to čas, a dvacet čtyři hodin pod sebou by
byl sloupec přes tři obrazovky.

### Karta výpravy se za jízdy ptá jinak

Když je rozjetá cesta, karta nahoře na Domů nekreslí plán, ale **cestu**:
další cíl, průběh, čas na cestě. Čísla se berou z odškrtaných zastávek téhle
cesty, ne z „byli jsme tam někdy" — to jsou dvě různé otázky a odpovědi se
liší, když jedeš někam podruhé.

### Počasí

Na Domů přibyla předpověď. Je toho tolik, že má vlastní kapitolu — najdeš ji
níž pod nadpisem **Počasí**.

### Co je na tobě

Mřížka fotokaret 3×2 je funkční, ale rozestupy a poměr stran dlaždic jsou
odhad, ne návrh. Tabulka sekcí v Nastavení je ryze užitková — šipky, oko,
název, popisek — a zaslouží si projít okem, hlavně jestli se v ní dá
orientovat na úzkém telefonu. A nápověda „všechno je zhasnuté" je jedna věta,
kterou jsem napsal já, takže je věcná a nudná.

---

## Objevuj

Tady je nejdůležitější věc celé kapitoly rozdíl mezi dvěma slovy, která
vypadají zaměnitelně: **nálada** a **inspirace**.

- **Nálada** odpovídá na *„jaké místo chci"*. Vodopád. Hrad. Koupačka.
- **Inspirace** odpovídá na *„co teď dává smysl"*. Máš tam uloženo dvanáct
  míst v Rakousku. Nedávno jsi přidala tři a nikam je nezařadila.

Bez té dělby by na Objevuj stály dvě velké mřížky, které dělají skoro totéž,
a nikdo by nevěděl, do které ťuknout.

### Nálady

Je jich **čtrnáct**: deset kategorií z číselníku plus dvě kombinace a dvě
zvláštní. **Barvy a ikony si neberou vlastní** — čtou se z číselníku kategorií,
takže když se někdy rozhodneš, že vodopády jsou modřejší, změní se to všude
naráz a ne jen na půlce obrazovek.

**Které se ukážou, si každý vybere sám** — je to v Profilu ve čtvrté
sbalitelné skupině. Výchozích je šest, tedy přesně ty, co tam byly dosud;
rozšíření na čtrnáct nikomu nic nepřeskládalo. Čtení výběru unese chybějící
předvolbu, neznámé `id` i `id` dvakrát, ale **novou náladu samo nezapne** —
kdo si vybral šest, má šest, dokud si sám neřekne jinak.

Zhasnout jde všechny. Sekce pak z Objevuj **zmizí celá**, nezůstane po ní
prázdný nadpis.

Pilulky jsou **mřížka o třech sloupcích**, ne posouvací pás — ze stejného
důvodu jako u fotokaret na Domů.

**Ten samý výběr řídí i tipy „Co dál?"** na kartě Na cestě. Bez toho tam po
rozšíření na čtrnáct nálad stálo dvanáct pilulek v pěti řádcích, tedy pětina
obrazovky nad samotnými tipy, kvůli kterým jsi tam přišla.

### Rychlá inspirace

**Osm dlaždic ve mřížce 4×2.** Každá je jen filtr — ťukneš a Seznam se
přefiltruje.

Nejzajímavější rozhodnutí je, co se stane s dlaždicí, na kterou nejsou data.
**Nezmizí — zašedne, řekne proč a nejde na ni ťuknout.** Kdyby mizela, udělala
by v mřížce díru a na čerstvém profilu by z osmi dlaždic svítila jediná, což
vypadá jako rozbitá appka. Takhle vidíš, co appka umí, a rovnou i proč to
zatím nejde.

Kolik míst která dlaždice vrátí, **se počítá jedním jediným způsobem**:
nastaví se filtr a spočítá se, co projde. Dřív se to počítalo dvakrát —
jednou pro číslo na dlaždici a jednou pro seznam — a tou dvojkolejností se
schovaly tři různé chyby, kdy dlaždice slibovala jiné číslo, než pak ukázala.

**Inspirace filtry nahrazuje, nepřičítá se k nim.** Ťuknutí na „V Rakousku"
neznamená „k tomu, co mám nastavené, přidej Rakousko", ale „ukaž mi Rakousko".
Stejně se chová i zkratka na oblast.

Jediná výjimka je **„Nejblíž odsud"**. Ta nefiltruje, ale přepíná **řazení**
Seznamu, protože filtr na vzdálenost v appce neexistuje a kvůli jedné dlaždici
se nezaváděl.

### Co je na tobě

Osm dlaždic 4×2 je hustá mřížka a texty na nich jsou krátké, protože se jinam
nevešly. Zašedlá dlaždice má důvod napsaný drobným písmem pod názvem a je to
kompromis, ne návrh. Fotky na Objevuj jsou teď **mřížka 3×3** — tam platí
totéž co u Domů, poměr stran a mezery jsou odhad.

---

## Seznam

Seznam vypadá skoro stejně, ale umí dvě věci, které předtím neuměl.

### Můžeš vybrat víc zemí najednou

Do teď nesly oblast, země i typ vždycky **jednu** hodnotu, takže „Rakousko
i Itálie" nešlo říct. Šlo říct Rakousko, nebo Itálie, nebo nic. Teď jde vybrat
kolik chceš.

Karta výběru navíc **u každé volby ukazuje počet**. Bez něj se dá zaškrtnout
něco, co v kombinaci s ostatními filtry nevrátí nic, a vypadá to jako
porouchaný filtr — přitom jsi jen vybrala Albánii a bikeparky.

**Filtry jsou ve dvou řádcích a nepřetékají do strany.** To zní jako
samozřejmost, ale nebylo: čtvrtý filtr byl mimo obrazovku a nedalo se poznat,
že tam je, protože posouvání do strany vypadá úplně stejně jako když už nic
dalšího není. Hlídá to teď kontrola, která měří, jestli obsah přesahuje.

**Rušítko filtrů** dělá totéž co tlačítko schované v panelu Filtry, jen se pro
něj nemusí chodit. Když není co rušit, je zašedlé.

### Řazení podle vzdálenosti

Přibylo **od nejbližšího** a **od nejvzdálenějšího**. To druhé zní jako vtip,
ale je to přesně to, co chceš, když plánuješ velkou cestu a hledáš, co je
nejdál od domova.

### Co je na tobě

Karta s vícenásobným výběrem je funkční seznam se zaškrtávátky a počty. Nikdy
jsem ji nedělal hezkou. Pilulky filtrů ve dvou řádcích jsou natěsno a text
v nich se u dlouhých názvů zemí krátí.

---

## Mapa

### Oko konečně nechá vidět to podstatné

Přepínač „oko" schová 580 běžných špendlíků, ať je na mapě vidět, co plánuješ.
Jenže do teď schoval **úplně všechno** včetně věcí, kvůli kterým sis ho
zapnula. Teď zůstávají vidět:

- místa v košíku,
- aktuální tipy „Co dál?",
- zastávky živého itineráře.

### Mapa se vycentruje jednou za spuštění

Do teď se střed mapy nastavil na tvou polohu jedině tehdy, když poloha
dorazila **zrovna ve chvíli**, kdy jsi měla otevřenou Mapu. To se skoro nikdy
netrefilo, takže mapa startovala nad střední Evropou.

Teď se vycentruje při prvním otevření. A **podruhé už nikdy** — kdo si
prohlíží Alpy a odskočí na Seznam, nemá se po návratu ocitnout doma.

### Přepočtená trasa se rok nekreslila

Tohle je moje největší ostuda z celého období a stojí za vyprávění, protože je
z ní vidět, jak taková chyba vypadá zevnitř.

Appka umí nechat si spočítat skutečnou trasu po silnicích (přes Mapy.com)
místo vzdušné čáry. Aby věděla, jestli je uložená trasa ještě platná, počítá
si z bodů plánu **otisk** — krátký řetězec, který se změní, když bod přibude,
ubude nebo se posune.

V srpnu jsem ten otisk zkrátil z dlouhého popisu na osmiznakový hash, protože
dlouhá verze zabírala ve vnitřní paměti 1,4 kB na trasu a bylo jich tam pět.
Jenže **stejná funkce existovala v appce dvakrát**: jednou v plánu, jednou
v mapě. Mapa si ji musela opsat, protože podle tehdejšího pravidla nesměla
sahat na kód obrazovek. Přepsal jsem jednu a na druhou zapomněl.

Od té chvíle mapa porovnávala osmiznakový hash s dlouhým řetězcem. To se
nemůže nikdy rovnat, takže mapa vždycky usoudila „uložená trasa je stará"
a nakreslila vzdušnou čáru. **Nic se nerozbilo hlasitě.** Žádná chyba, žádné
varování. Appka jen tiše kreslila rovné čáry a všichni jsme si mysleli, že se
přepočet nepovedl.

Zvlášť zákeřné bylo, že **mini-mapa v Itineráři fungovala** — ta si tu funkci
importovala, místo aby si ji opsala. Takže se to tvářilo jako „na dashboardu
to jde, na mapě ne", což vypadá jako chyba kreslení a je to chyba porovnání.

Opravil jsem to tak, že jsem tu funkci přestěhoval na jedno místo, kam
dosáhne mapa i obrazovky, a **pak jsem přidal kontrolu, která to hlídá**:
appka teď při každé kontrole ověří, že si mapa žádnou sdílenou funkci
neopisuje. Kdyby se to někdo pokusil udělat znovu, kontrola spadne.

Duplicit ze stejného důvodu bylo v mapě **šest**. Zmizely všechny.

### Malovaná offline mapa

Tahle část se nezměnila, ale možná ji neznáš, tak jen krátce: v Nastavení se
dá stáhnout balík mapy do telefonu (3,7 MB) a pak appka kreslí vlastní
malovanou mapu s lesy, loukami a poli — a s ručně kreslenými stromy a horami.
Bez staženého balíku kreslí zjednodušenou verzi z obrysů zemí. **Kresby
stromů a hor jsou jen se staženou mapou**, bez ní tam nejsou vůbec a je to
tak správně. Hustotu kreseb si jde v Nastavení přepnout (vypnuté, střídmé,
husté).

### Co je na tobě

Špendlíky a jejich barvy jsou z původní appky a nikdo se jich od redesignu
nedotkl. Značky vlastních bodů trasy (start, nocleh, cíl) jsou textové znaky
`▶ ⌂ ⚑ ★` v kolečku — funkční, ale je to to nejrychlejší řešení, ne to hezké.

---

## Plán

Největší kapitola, největší změna. Plán se z jedné obrazovky se seznamem stal
třemi kartami plus vnitřkem výpravy.

### Tři karty místo čtyř dílů

Dřív se Plán dělil na **Na cestě · Výpravy · Itinerář · Košík**, tedy podle
toho, *co s plánem děláš*. Člověk ale nepřemýšlí ve funkcích, přemýšlí v čase:
**jedu · chystám se · mám za sebou**. Proto jsou dnes karty tři:

- **Na cestě** — probíhající cesta: mini-mapa, odškrtávání zastávek, pauzy,
  další cíl, „Navigovat", zbývá km, achievementy.
- **V plánu** — knihovna výprav: sbalitelné složky, přetahování dlouhým
  podržením, nastavitelné řazení.
- **Za námi** — ukončené cesty seřazené po letech.

**Itinerář zmizel ze segmentu** a je to schválně: není to samostatná obrazovka,
je to *vnitřek jedné výpravy*. Otevře ho **ťuknutí na výpravu v knihovně**,
které ji zároveň aktivuje na mapě. Zpátky vedou drobečky nahoře.

### Košík je plovoucí plát

Košík taky zmizel ze segmentu. Je to **kolečko vpravo dole** (jen v Plánu, na
kartách Itinerář a Na cestě), které vytáhne plát přes spodek obrazovky. Při
zavření doletí zpátky do svého rohu.

Důvod: z košíku se **tahá do dnů**, takže dny nad ním musí zůstat vidět. Jako
samostatná obrazovka to znamenalo pamatovat si, co v košíku bylo, přepnout se
a doufat.

Z košíku cestou zmizely dvě věci: mini-mapa s legendou (plát je seznam, ne
mapa) a tlačítko „Vysypat" (nebezpečná akce, kterou nikdo nepotřeboval).

### Akce výpravy jsou jen v Itineráři

Přejmenovat, duplikovat, přesunout do složky, vyprázdnit, smazat — všechno je
pod „…" v Itineráři. **Řádek v knihovně žádnou nabídku nemá.**

Do srpna existovaly obě sady vedle sebe a byly napsané dvěma nezávislými kódy,
takže se lišily v drobnostech. Pravidlo je teď jednoduché: akce patří dovnitř
věci, ne do seznamu věcí.

### Itinerář neřeší, kde jsme byli

V Itineráři není fajfka „byli jsme tady" ani ztlumení odjeté zastávky.
Itinerář odpovídá na *„jak to pojedeme"*. Odškrtává se **na kartě Na cestě**,
protože to je otázka *„kde jsme"*.

### Cesta se za jízdy mění

Do teď byla rozjetá cesta zmrazený otisk z okamžiku vyjetí. Plán šlo upravovat,
cestu ne. Jenže právě to se na roadtripu dělá: večer se něco přidá z košíku
a něco vynechá.

Teď jde cesta měnit — a appka si přitom **pamatuje, jak to bylo naplánované**.
Při ukončení se tě zeptá, jestli změny promítnout zpátky do plánu; archiv
ukládá obojí. Vynechaná zastávka se vrací do košíku.

**Plán se za jízdy nemění.** Plán je „jak jsme to chtěli", cesta „jak to fakt
bylo".

### Vlastní body trasy

Do plánu se dají přidat body, které nejsou místa z databáze: **start, nocleh,
cíl, vlastní**. Jsou to plnohodnotné body itineráře, ne poznámka se
souřadnicemi — dají se přetahovat mezi dny stejně jako zastávky a **trasa vede
přes ně**.

Polohu jim dáš čtyřmi způsoby: vložíš text se souřadnicemi, najdeš adresu,
napíšeš GPS ručně, nebo ťukneš do mapy.

Na jméno se appka ptá **jen u vlastního bodu**. U startu, noclehu a cíle je
předvolba použitelné slovo, takže se dřív ptala na něco, co právě dostala
předchozím dotykem. U vlastního je předvolba „Vlastní místo", což nikdo
nenechá. Jméno jde kdykoli změnit v kartě bodu.

### Ukončené cesty

Žijí v knihovně Výprav jako sekce po letech, každý řádek se zámkem. Ťuknutí
cestu **aktivuje na mapě** — přesně jako výpravu, jen z ní nejde vyjet.

Po přepnutí na Itinerář se ukáže v **zamčeném režimu**: trasa, dny a časy jsou
napořád zamčené, tlačítko „Odemknout poznámky" zpřístupní jen poznámku cesty
a poznámky zastávek. Cestu jde i smazat, ale **jen z Itineráře** a s potvrzením
— řádek v archivu nabídku nemá, ze stejného důvodu jako řádek výpravy
v knihovně.

**Získané achievementy po smazání cesty zůstávají.** Smazání záznamu není
popření, že se jelo.

### Přepočet trasy: co se do jednoho dotazu vejde

Tahle část je čerstvá a stojí za ni pěkná historka.

Tadeáš má výpravu o **17 místech a 15 574 kilometrech** vzdušnou čarou. Ťukl
na „Přepočítat" a Mapy.com odpověděly chybou 422.

Změřil jsem to na živém API místo hádání: **Routing API bere nejvýš patnáct
mezizastávek, tedy sedmnáct bodů celkem.** Osmnáctý vrátí přesně tu chybu.
Vzdálenost s tím nemá co dělat — Barcelona → Albánie → Praha na tři body
projde v pohodě.

Jenže ta trasa **nemá 17 bodů, ale 19**: vede i přes vlastní body, takže se
k sedmnácti místům přidají Nocleh 1 a Nocleh 2.

Trasa se teď proto dělí na úseky, které sdílejí hraniční bod (jinak by mezi
nimi zůstala díra), a výsledky se slepí. Posílají se **po devíti bodech**, a to
ne kvůli rychlosti, ale kvůli spolehlivosti — změřeno:

| úsek po | dotazů | celkem | nejdelší | jak dopadly |
|---|---|---|---|---|
| 17 bodech | 2 | 25,3 s | 21,6 s | **jeden selhal** |
| 9 bodech | 3 | 25,5 s | 12,5 s | všechny prošly |
| 4 bodech | 6 | 28,3 s | 7,2 s | všechny prošly |

Jeden sedmnáctibodový kus přes půl Evropy API neustojí.

**Ta oprava odkryla dvě další věci** a nechat je tam by znamenalo jen posunout
zeď o kus dál:

**Čára vážila 6 372 kB.** API vrací trasu v plné podrobnosti — u té trasy
304 504 souřadnic, které by šly do paměti telefonu a odtud do mapy, kterou
prohlížeč překresluje při každém posunu. Appce kdysi shodilo ukládání, když
měla trasy po 273 kB. Zjednodušení na přesnost zhruba dvaceti metrů z toho
udělá **32 851 bodů a 624 kB**; kilometry ani čas se tím nemění, ty vrací API
zvlášť.

**Časový strop byl kratší než odpověď.** Deset vteřin nestačilo ani na jeden
úsek (nejdelší 12,9 s), takže první pokus po rozdělení hlásil „vypršel".

A pak se Tadeáš zeptal, proč to trvá tak dlouho. Změřil jsem to: ťuknutí →
uloženo **23,5 s**, přepnutí na Mapu → vykreslení **0,5 s**. Kreslení tedy není
nic, celý čas je čekání na cizí server — a úseky se ptaly **za sebou**. To
odůvodnění („není to závod, souběžné dotazy na cizí API jsou drzost") jsem si
napsal sám a stálo dvě třetiny čekání. Teď se ptají souběžně, nejvýš tři
naráz: **13,4 s místo 23,5 s**.

U dlouhé výpravy se navíc hlásí průběh — „Počítám trasu… (2/3)" — protože
toast zhasne po dvou vteřinách a bez toho by to vypadalo, že se appka zasekla.

### Mini-mapa v Itineráři

**Přestala problikávat.** Živé sledování polohy hlásilo změnu každé dvě
sekundy a appka na to překreslovala celou obrazovku — mini-mapa se pokaždé
zbourala, postavila znovu a vrátila si výřez, takže s ní nešlo pohnout.
Změřeno přes vnitřní počítadlo Leafletu: **3 316 → 5 563 za pět sekund**.
Dnes se obnovují jen dva údaje: řádek „podle polohy zbývá" a značka polohy.

**Dostala zámek.** Mapa je zamčená, aby na telefonu nekradla tah místo
rolování stránky; odemyká ji zámek v pravém horním rohu. Odemčení je jen
v paměti — po odchodu z Plánu a návratu je zase zamčeno.

### Plát „Přidat zastávku" se nezavírá

Do té doby zmizel hned po prvním výběru, takže pět zastávek znamenalo pětkrát
projít tutéž cestu. Přidané místo ze seznamu **nemizí, jen zšedne** a dostane
pilulku „Přidáno" — kdyby se odfiltrovalo, seznam by se pod prstem posunul
o řádek a druhé ťuknutí by trefilo něco jiného, než jsi chtěla.

### Dialogy místo systémových oken

Prompt, confirm a alert jsou pryč. Appka má vlastní dialogy: potvrzení, zadání
textu, výběr ze seznamu, výběr více položek, výběr data, výběr počtu dní,
oznámení. **Datum se vybírá z kalendáře, nikdy se nepíše** — z mřížky se
neplatná hodnota vzít nedá.

### Co je na tobě

Tady je toho nejvíc. Karty Na cestě, V plánu a Za námi jsem skládal ze
společných dílů a fungují, ale nikdy neprošly grafickým okem. Konkrétně:

- **karta Na cestě** je nejhustší obrazovka v appce — štítek, název, čas,
  mini-mapa, další cíl, dvě tlačítka, seznam dnů, achievementy,
- **řádek výpravy v knihovně** a **řádek ukončené cesty** vypadají skoro
  stejně a liší se jen zámkem,
- **plovoucí kolečko košíku** a jeho animace doletu do rohu,
- **zamčený režim ukončené cesty** — dnes to pozná jen podle zámku a šedi,
- **dialogy** jsou funkční karty bez vlastního výtvarného řešení,
- **znaky vlastních bodů** `▶ ⌂ ⚑ ★`.

---

## Počasí

Největší novinka celého období a jediná věc, která do appky přinesla něco, co
tam do teď nebylo vůbec.

Data jsou z **Open-Meteo — bez účtu a bez API klíče**, což je jediný důvod,
proč to jde ve statické appce z veřejného repozitáře. Je to teprve třetí
síťové volání, které appka za běhu dělá.

Počasí má **dva režimy** a přepíná se mezi nimi jedním tlačítkem vedle nadpisu:

### „U tebe"

24 hodin ve vodorovném pruhu a pod ním sedm dní.

**Pruh hodin má předěl dne.** Zítřejší dlaždice mají tmavší plochu a na hranici
stojí svislý popisek. Pod pruhem je **vlastní posouvač**, protože systémový je
na mobilu schovaný a bez něj není poznat, kde se v těch čtyřiadvaceti hodinách
pohybuješ.

**Na každé hodině je procento i milimetry, včetně nul.** Chvíli se milimetry
kreslily jen tehdy, když opravdu něco spadlo, kdežto procento i nulové —
a protože v běžné předpovědi prší dvě tři hodiny z dvaceti čtyř a bývají na
konci pruhu, vypadalo množství srážek jako chybějící údaj. Nula je platná
odpověď na „kolik naprší". Barevně zvýrazněné jsou jen hodiny, kdy opravdu
prší, takže barva zůstává tam, kde ji máš hledat. Bonus: všechny dlaždice mají
stejně řádků a pruh se nezubatí.

**Odkud předpověď je, se počítá lokálně.** Pod pruhem stojí nejbližší město
a vzdálenost („Bolzano · 44 km"), spočítané z 985 evropských měst, která má
appka v sobě. Funguje to i bez signálu — dotaz na cizí službu by mlčel přesně
tam, kde se člověk ptá nejčastěji.

### „Na cestě"

Předpověď na dny tvojí výpravy, na místech, kde ten den máš být.

**Den je skupina s hlavičkou.** Nahoře stojí jednou datum, číslo dne výpravy
(„DNES · 2. DEN") a vpravo východ se západem slunce. Pod tím karta za každou
zastávku toho dne.

Datum a číslo dne spolu schválně: počasí mluvilo v datech a itinerář v číslech
dnů, takže se ty dvě obrazovky nedaly číst dohromady. **Dnešek má akcentní
proužek** — ze všech dnů je jediný, kvůli kterému se díváš hned teď.

**Karta místa má tři sloupce**: vlevo ikona počasí přes obě řádky, uprostřed
název místa nad drobným řádkem s počasím, vpravo teploty pod sebou. Karta je
**48 px místo 67**.

Ta karta je taky historka. Napsal jsem ji nejdřív jako dva široké řádky, kde
horní nesl počasí a spodní jen název místa. Vypadalo to prázdně a Tadeáš mi
napsal, ať to přerovnám. Změřil jsem to: **horní řádek byl z 93 % plný, spodní
u „Nocleh 1" z 24 %.** Prázdný nebyl celý blok, ale spodní řádek u krátkých
názvů — a protože se body trasy jmenují „Nocleh 1" nebo „Start", byl prázdný
skoro pořád.

Ještě předtím jsem to samé místo předělával třikrát, protože jsem si dvakrát
vyložil „dej název pod datum" jako „nacpi ho do levého sloupce". Název se tam
lámal na dva řádky, a abych na něj udělal místo, vyhodil jsem z řádku východ
a západ slunce. Napotřetí přišlo zadání verzálkami a bylo to.

**V kartě stojí i kolik naprší a jak fouká** — týmž dotazem, žádné volání
navíc. Do té doby u dne stálo jen procento, tedy „jak pravděpodobně" bez
„kolik", přesně ta asymetrie, kvůli které se do pruhu hodin doplňovaly
milimetry.

**Slunce je v hlavičce dne, ne v kartě.** Je to údaj o dni — tři body jednoho
dne se v časech liší o minuty a pod sebou to byl jen šum. Bere se rozsah:
nejdřívější východ a nejpozdější západ ze zastávek dne.

**Ukazují se jen dny, na které předpověď dosáhne** — dnešek až dnešek + 13.
Dozadu proto, že předpověď začíná dneškem: kdo vyjel včera, měl u prvního dne
„Zatím bez předpovědi", což je lež (nepřijde nikdy), a po týdnu na cestě se
jich nad dneškem nakupilo dvacet. Dopředu proto, že dál API nedohlédne
a čtrnáct prázdných řádků nic neřekne. **Číslo dne zůstává původní**, takže
z „3. DEN" se nestane „1. DEN".

**Do dne patří i vlastní body trasy.** Nocleh je místo, kde budeš spát a ráno
vstávat, takže je z celého dne nejužitečnější.

### Když se něco nepovede

Prázdný seznam má **čtyři různé příčiny a každá svou větu**: chybí termín ·
výprava nemá zastávky · dny už jsou za námi · výprava začíná dál, než
předpověď dohlédne. Jedna věta natvrdo („chybí termín") ve třech z nich lhala.

Stará předpověď ze schránky nese nad seznamem „Staženo …", aby se včerejší
data nekreslila jako čerstvá.

### Poloha a soukromí

**Appka si o polohu řekne sama hned při startu**, ale až po zavření úvodního
průvodce — dotaz nad uvítací obrazovkou by bylo přepadení. Je to **tiché
v obou směrech**: když povolení nedáš, nic se nestane a na Domů zůstane
tlačítko „Ukázat počasí u mě", které si o ni řekne samo a s vysvětlením.
V Nastavení se to dá vypnout a **vypnutá volba se nezeptá vůbec**.

**Vypnuté počasí nesáhne na síť vůbec**, ne že se jen neukáže. Na roamingu je
to jediná jistota a hlídá to kontrola, která počítá dotazy.

Stažené předpovědi leží v telefonu, ne v záloze — jsou to dotažená data, dají
se stáhnout znovu. Čerstvost se dá nastavit (30 minut · hodina · 3 hodiny).
Bez signálu se ukáže poslední stažená i s tím, kdy se stáhla — prázdno nikdy.

Volba **„jen na wifi" pozná jen Android**. V Safari ta věc, ze které se to
zjišťuje, prostě neexistuje, takže se tam chová jako vypnutá. Je to napsané
u přepínače.

### Co je na tobě

Počasí je nejmladší část appky a nejmíň prošlá okem:

- **dlaždice hodin** — čtyři řádky (čas, ikona, teplota, procento, milimetry),
  hodně informací na 52 px šířky,
- **předěl dne** — svislý popisek a linka, moje řešení, ne návrh,
- **karta místa** — tři sloupce, hustý meta řádek se čtyřmi údaji
  oddělenými mezerami,
- **ikony počasí** — přibyly čtyři nové (mrak, polojasno, mlha, mrholení)
  a jsou odvozené z deště a slunce, aby seděly do sady. Jsou to moje kresby.
- **přepínač režimu** — vyplněná pilulka, prošla třemi podobami.

---

## Profil a Nastavení

### Sbalitelné skupiny

Profil i Nastavení se rozpadly do skupin, které se dají sbalit. **Nadpis je
v každé** a rozestupy se řídí z jednoho místa, takže se nemůže stát, že bude
mezi dvěma skupinami jinde jiná mezera.

Nad první skupinou je mezera schválně — bez ní se lepila na to, co je nad ní.

### Profil

Přibyla **čtvrtá skupina: výběr nálad**. Vybíráš z čtrnácti, výchozích je šest.
Ten výběr řídí Objevuj i tipy „Co dál?" na kartě Na cestě.

### Nastavení

Přibylo toho hodně:

- **Domů** — tabulka sedmi sekcí s šipkami a okem,
- **Řazení výprav** — abecedně, nejnovější, největší, bez řazení. Řadí se až
  při zobrazení, data se nikdy nepřeskládávají,
- **Počasí** — hlavní vypínač, jednotky, jak často se stahuje, jen na wifi,
  smazat uložené předpovědi,
- **Mapa** — poloha při startu, hustota kreseb, offline mapa ke stažení,
- **Vývoj** — čítače používání a kolik bodů má která výprava.

**Počasí má dva vypínače a je to správně.** Oko v tabulce Domů řídí jen
rozvržení, hlavní přepínač ve skupině Počasí rozhoduje i o síti. Kdyby oko
psalo do hlavního přepínače, přišla bys o počasí i tam, kde teprve přibude.

**Čítače používání** jsou nové: appka si počítá, jak často se která věc
používá, aby se dalo poznat, co má smysl vylepšovat a co nikdo nepoužívá.
Čtou se v Nastavení → Vývoj a dají se vynulovat.

**Kolik bodů má která výprava** je taky ve Vývoji. Medián se počítá jen
z výprav, které aspoň jeden bod mají, a vedle něj stojí jejich počet — ze všech
výprav by ho pár prázdných stáhlo na nulu přesně tam, kde se ptáme, jestli
bodů není moc.

### Co je na tobě

Nastavení je dlouhá obrazovka s mnoha ovládacími prvky a její vzhled je čistě
užitkový. Sbalitelné skupiny mají jednotné rozestupy, ale samotné řádky
s přepínači, segmenty a tabulkami jsou to nejjednodušší, co fungovalo.
Skupina „Vývoj" je vyloženě servisní — kdyby ti tam vadila, dá se schovat za
stejný přepínač jako vývojářská kolečka v hlavičce.

---

## Co běží pod kapotou

Tahle kapitola není o tom, co uvidíš. Je o tom, co ti umožní pracovat dál —
a o tom, proč je appka po deseti dnech na několika místech úplně jinde, aniž
by to bylo vidět.

### Poznámkovač: můžeš hlásit nápady přímo z appky

Tohle je pro tebe nejužitečnější věc z celé kapitoly.

V hlavičce jsou **tři vývojářská kolečka** (vidíš je jen na betě, na ostré
appce nejsou):

- **brouk** — otevře formulář, do kterého napíšeš nápad, chybu nebo poznámku,
- **seznam** — zkratka do poznámkovače, kde vidíš svoje i cizí záznamy,
- **červené kolečko** — zahodí uloženou verzi appky a načte ji znovu. To
  potřebuješ, když se nasadí nová verze: prohlížeč jinak servíruje starou
  a obyčejné obnovení stránky s tím nehne. **Uživatelská data nemaže.**

Appka k záznamu **sama přibalí technický kontext**, který nepíšeš: kterou
obrazovku máš otevřenou, jaké filtry, verzi buildu, jestli jsi online, kolik
místa zbývá v telefonu a posledních dvacet zachycených chyb. Díky tomu se
z hlášení „tady je to divné" dá vyjít.

Záznamy se z appky **exportují do repozitáře**. Tlačítko pošle, co je nového,
a Cloudflare Worker to rovnou commitne — my dva to pak vidíme oba a vidí to
i AI, která si repozitář čte. Na ostré appce je ta cesta mrtvá, takže se
odtamtud nic odeslat nedá.

**Stav se vrací zpátky do appky.** Když se tvoje hlášení vyřeší, uvidíš to
v poznámkovači: rámeček záznamu změní barvu. Šedý = jen u tebe, okrový =
odesláno, mechový = víme o tom, ztlumený mechový = vyřešeno, terakotový = od
odeslání jsi to změnila. Legenda je pod tlačítky.

Filtr v poznámkovači **zhasíná, nevybírá**: všechny pilulky svítí a zhasnutá
schová své záznamy. Do srpna se z každé řady vybírala právě jedna věc, takže
nešlo říct „nápady a bugy, ale ne poznámky".

Uzavřený záznam se v seznamu **smrskne** na nadpis a štítek, a po ťuknutí se
rozbalí i s tím, **proč se to zavřelo**. Ten důvod se ukládal odjakživa, ale
ukazoval se jen jako bublina po najetí myší — tedy věc, kterou na telefonu
nikdo nikdy neuvidí.

### Data se přestěhovala tam, kam patří

V srpnu přišlo z poznámkovače hlášení, které ukázalo, že vnitřní úložiště
appky bylo **na 85 % kapacity** — 4 270 kB z ~5 MB. A 95 % z toho byly
spočítané trasy, které se nikdy nemazaly.

To je nebezpečnější, než to zní: appka při každém uložení poznámky přepisuje
celý obsah toho úložiště naráz. Jedna velká věc uvnitř zdraží každé uložení
a nakonec **shodí ukládání všeho** — poznámky by mizely beze slova.

Přestěhoval jsem proto do většího úložiště: **spočítané trasy, archiv
ukončených cest, stažené předpovědi počasí a debug záznamy**. Dělicí čára je
jednoduchá:

| zůstává v malém úložišti | jde do velkého |
|---|---|
| co jsi napsala nebo rozhodla | co si appka umí spočítat znovu |
| co je potřeba hned při vykreslení | vývojářská data |
| co nejde ničím nahradit | co se dá stáhnout znovu |
| co nepřibývá donekonečna | co se hromadí |
| kilobajty | megabajty |

**Do zálohy jde jen ten levý sloupec** — plus fotky, protože ty nahradit
nejdou. Trasy v záloze schválně nejsou: po obnově na jiném telefonu uvidíš
vzdušnou čáru a jedno ťuknutí na „Přepočítat" je dopočítá.

### Kontroly, které hlídají, aby se to nerozbilo

Appka nemá testovací framework. Místo něj má **dvanáct kontrolních skriptů**
(a k nim dalších pětadvacet pomocných — na přípravu mapy, ikon, reliéfu nebo
úklid poznámek). Aktuální stav, ověřený spuštěním, ne opsaný z dokumentace:

| kontrola | co hlídá | bodů |
|---|---|---|
| smoke | proklikání v opravdovém prohlížeči | **549** |
| check-dny | dny, výpravy, body trasy, dělení tras | **253** |
| check-debug | poznámkovač od zápisu po export | **205** |
| check-filters | kombinace filtrů proti druhé implementaci | **134** |
| check-worker | že Worker nepustí dál, co nemá | **64** |
| check-uloziste | že se poznámky neztratí, když dojde místo | **36** |
| check-regrese | PWA, zálohy, fotky, poloha | **26** |
| check-form | že formulář vyrábí platná místa | **18** |
| check-projekce | promítání polohy na trasu | **13** |
| check-ikony | jedna věc = jedno jméno = jedna ikona | **8** |
| check-tokeny | barvy natvrdo, světlý/tmavý, kontrast | **7** |
| check-vrstvy | že si mapa neopisuje sdílené výpočty | **4** |

K tomu porovnání snímků obrazovek: osm obrazovek se před zásahem vyfotí, po
zásahu znovu, a porovná se to po pixelech. Díky tomu se pozná, že se něco
pohnulo, i když to nikdo nezamýšlel.

**Pro tebe je nejzajímavější `check-tokeny`**: hlídá, že se v CSS nikde
nepíšou barvy natvrdo, že každá barva má svůj protějšek pro tmavý režim a že
kontrast textu vůči pozadí drží. Když přidáš barvu jen do světlého režimu,
kontrola spadne a řekne to.

### Beta a produkce

Od srpna appka běží **dvakrát**. To, co Tadeáš pushne, jde automaticky na
**betu**; ostrá appka sedí na samostatné větvi a posouvá se na ni jen na
výslovné vyžádání. Proto se stalo, že jsi deset dní viděla stav z 24. srpna.

Na betě je v hlavičce **červený štítek BETA**, aby se ty dvě nedaly splést.

### Úklid, který není vidět

- **Jednosouborová varianta appky zrušena.** Existoval build, který cpal celou
  appku do jednoho HTML souboru. Neměl kam být nasazený a stál údržbu.
- **Konec porovnávání s původní appkou.** Předloha, ze které se appka
  přepisovala, byla smazána — a s ní všechno, co sloužilo jen k porovnání
  s ní. Od srpna se appka od originálu **záměrně rozchází**, takže porovnání
  přestalo něco znamenat.
- **Pět duplicitních kolekcí z dat pryč.**
- **Datová vrstva plánu se přestěhovala** tak, aby na ni dosáhla mapa
  i obrazovky. Tím zmizelo šest opsaných funkcí a s nimi ta chyba
  s nekreslenou trasou.
- **Ve sprite je 74 ikon** (přibyly čtyři počasí a jedna vítr).

---

## Čeho se nedotýkat

Tohle je seznam věcí, které vypadají jako chyba a jsou to rozhodnutí.
Než něco z toho „opravíš", zeptej se — každá položka má za sebou důvod.

**`id` místa se nikdy nemění.** Jsou na něj navázané poznámky, hodnocení,
priority, plán, fotky, vazby na okolní místa i generovaná pohlednice. Překlep
v názvu se opravuje v názvu, `id` zůstává. Totéž platí pro `id` debug záznamů
a pro `id` achievementů.

**318 míst nemá fotku a je to záměr.** Kreslí se u nich akvarel podle
kategorie. Není to nedodělek, fotky tam nedoplňuj náhodně.

**Kolekce „psi" nemá dlaždici v Objevuj.** Sedm míst ji v datech má, ale
mezi definovanými kolekcemi není. Víme o tom.

**Osm míst má v `id` před číslem dvě pomlčky** (`…-to-je--057`). Slug se uřízl
na pomlčce. Není to chyba, kontrola to připouští.

**Výplně ikon nejdou přes CSS.** Ikony se vkládají tak, že na jejich vnitřek
selektor z dokumentu nedosáhne — výplň se musí psát jako atribut přímo do
sprite. Proto mají výplň jen dvě ikony (oheň a hvězda) a zbylých 43 kreslí jen
obrys. Pravidlo v CSS, které to zkoušelo řešit, se nikdy neuplatnilo.

**Barvu ikony na tmavé ploše určuje `stroke`, ne `color`.** `color` se u ikon
uplatní jen na vyplněné části. Kdo dá ikonu na mechovou nebo okrovou plochu,
musí napsat obojí — jinak si vezme základní barvu textu, která se s režimem
převrací, a ikona zmizí.

**Funkce, která ošetřuje text uživatele, řeší jen dva znaky.** Je to doslovný
přepis z původní appky. „Oprava" na plné ošetření by změnila výstup na
obrazovce.

**Badge u filtrů nepočítá filtr „Musíme!"**. Víme o tom.

**Seznam kreslí nejvýš 250 karet** a napíše „Zobrazeno prvních 250". Není to
chyba, jen to zatím není chytřejší.

**Klíče, pod kterými se ukládají data, se nikdy nemění.** Jsou v nich všechna
uživatelská data a nikde jinde neexistují — změna klíče je tichá ztráta dat.

**Kresby stromů a hor jsou jen se staženou mapou.** Bez ní tam nejsou vůbec
a je to tak správně.

**Barvy a rozměry se v CSS píšou jen přes proměnné**, nikdy natvrdo. Nová
barva patří do sémantické vrstvy **a do obou tmavých bloků**. Hlídá to
`check-tokeny`.

---

## Co je na tobě

Souhrn všeho, co je hotové technicky a čeká na tvoje oko. Seřazeno podle
toho, jak moc si o to říká.

**Počasí** — nejmladší a nejmíň prošlé okem. Dlaždice hodin nesou pět údajů na
52 px šířky, karta místa má hustý meta řádek se čtyřmi hodnotami, předěl dne
je moje improvizace a čtyři nové ikony počasí jsou moje kresby odvozené
z deště a slunce.

**Plán** — největší obrazovka a nejvíc nových dílů. Karta Na cestě je
nejhustší místo v appce. Řádek výpravy a řádek ukončené cesty se liší jen
zámkem. Plovoucí kolečko košíku, jeho animace a zamčený režim ukončené cesty
nikdy neprošly návrhem.

**Dialogy** — potvrzení, zadání, výběr, kalendář. Funkční karty bez vlastního
výtvarného řešení, a přitom je vidíš při každé druhé akci.

**Rychlá inspirace v Objevuj** — osm dlaždic 4×2, texty krátké proto, že se
jinam nevešly. Zašedlá dlaždice má důvod drobným písmem pod názvem.

**Vícenásobný filtr v Seznamu** — karta se zaškrtávátky a počty, ryze užitková.

**Mřížky fotek** — 3×2 na Domů, 3×3 v Objevuj. Poměr stran a mezery jsou odhad.

**Nastavení** — dlouhá obrazovka s mnoha ovládacími prvky, vzhled užitkový.

**Znaky vlastních bodů trasy** `▶ ⌂ ⚑ ★` — nejrychlejší řešení, ne nejhezčí.

**Tabulka sekcí na Domů** — šipky a oko, zaslouží si projít na úzkém telefonu.

---

## Kdyby něco

Když na něco narazíš, **napiš to rovnou z appky** — brouk v hlavičce, pár vět,
odeslat. Appka k tomu sama přibalí, co je potřeba, a my to uvidíme oba
i s tím, na které obrazovce jsi byla a co jsi měla nastavené. Je to výrazně
lepší než screenshot v chatu, protože z toho jde vyjít.

A kdyby appka ukazovala něco starého: **červené kolečko v hlavičce**. Uživatelská
data nemaže, jen zahodí uloženou verzi a stáhne novou.

---

*Psáno 3. září 2026 ke stavu větve `main`. Všechna čísla v tomhle dokumentu
jsou naměřená, ne odhadnutá — kde jsem číslo neměl, napsal jsem to slovy.*
