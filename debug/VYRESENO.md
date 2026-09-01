# Vyřešené debug záznamy

Jeden řádek na každý uzavřený záznam. **Nikdy se nemaže ani nepřepisuje** –
je to jediná stopa po záznamu, který už ve složce není, a appka z ní bere
stav zpátky. Řádky skládá `npm run debug-zavri`, ne ruka: ručně napsaný
řádek se špatným tvarem parser tiše přeskočí a záznam beze stopy zmizí.
- `tadeas-003` · 2026-08-27 · hotovo · klik v dialogu ani na závěsu už detail nezavře
- `tadeas-002` · 2026-08-27 · hotovo · výběr bodu z mapy vrací zpátky, po potvrzení i po zrušení
- `tadeas-f32-008` · 2026-08-27 · zahozeno · zkouška odesílání, ne hlášení
- `tadeas-001` · 2026-08-27 · hotovo · Nastavení i Profil poskládané do sbalitelných skupin
- `tadeas-f32-009` · 2026-08-27 · hotovo · Nastavení → Domů: tabulka sedmi sekcí, šipky nahoru/dolů a oko na vypnutí. Pořadí i zhasnuté jdou do zálohy. Zhasnutá sekce se ani nepočítá.
- `pc-tadeas-001` · 2026-08-27 · hotovo · Počasí u tebe je na Domů: 24 hodin, 7 dní, nejbližší město, nastavitelná čerstvost. Zbytek (Itinerář, detail místa, Na cestě, klimatické normály) žije v NAPADY.md jako N19 a N20 a v tadeas-f32-010.
- `tadeas-f32-019` · 2026-08-28 · hotovo · Pilulky filtru jsou vypínače: všechny svítí, zhasnutá schová své záznamy, tlačítka na vše zmizela. Mazání se přestěhovalo až za blok Export.
- `tadeas-f32-016` · 2026-08-28 · hotovo · Mini-mapa se za jízdy přestala přestavovat: živá projekce už nepřekresluje celý Plán, obnovuje jen řádek se zbývající vzdáleností a značku polohy.
- `tadeas-f32-020` · 2026-08-28 · hotovo · Mini-mapa je zamčená a nekrade tah; odemyká ji zámek v pravém horním rohu. Odemčení drží jen do odchodu z obrazovky.
- `tadeas-f32-018` · 2026-08-31 · hotovo · Dlaždice v Itineráři mají nadpis, Přidat den je mezi nimi a každá je široká podle svého popisku.
- `tadeas-f32-015` · 2026-08-31 · hotovo · Přibylo řazení od nejbližšího a od nejvzdálenějšího; nabídka je ve vzhledu appky místo systémového selectu.
- `tadeas-f32-014` · 2026-08-31 · hotovo · Filtry v Seznamu jsou mřížka 2x2 s vícenásobným výběrem, u dlouhých seznamů s hledáním, a vedle ikony filtru je rušítko.
- `tadeas-f32-013` · 2026-09-01 · hotovo · Rychlá inspirace je osm dlaždic 4x2. Tři ze čtyř původních byly vadné: Co je blízko nenastavovalo žádný filtr, Ještě jsme tam nebyli vracelo 575 z 580 míst a Co jsme si slíbili počítalo o jeden plamínek míň, než filtr schovává. Navíc se nevolalo syncFiltersUI, takže se nastavení neprojevilo v pilulkách, a nenulovaly se předchozí filtry.
