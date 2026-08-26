/**
 * Že debug poznámkovač neztratí záznam a nerozbije jeho identitu.
 *
 *   npm run check-debug
 *
 * PROČ ZVLÁŠŤ A NE VE SMOKE: `id` záznamu (`tadeas-014`) je stejně
 * nedotknutelné jako `id` místa – odkazuje se na něj v konverzaci s AI,
 * v commit zprávách i v rejstříku složky `debug/`. Kdyby se dvěma různým
 * věcem přidělilo totéž číslo, poznalo by se to až u někoho jiného za týden.
 * Tohle je čistý Node bez prohlížeče, stejně jako `check-dny.mjs`, takže běží
 * za zlomek vteřiny a dá se pouštět po každé změně.
 *
 * Hlídá pět věcí, na kterých návrh stojí:
 *   1. číslování se nikdy nevrací – smazaný záznam své číslo nepůjčí dalšímu,
 *   2. úprava záznamu nesmí sáhnout na `id`, `cislo`, `autor` ani `vytvoreno`,
 *   3. `.md` export drží formát, na kterém stojí i čtení zpátky z repozitáře,
 *   4. uživatelský text nerozbije strukturu souboru (`---`, `##`),
 *   5. záloha do `.json` a import zpátky vrátí přesně tytéž záznamy.
 */

// storage.js sahá na localStorage hned při načtení modulu. Tenhle náhradník
// opravdu ukládá, aby šlo ověřit i to, že se zápis povedl.
const pamet = new Map()
globalThis.localStorage = {
  getItem: (k) => (pamet.has(k) ? pamet.get(k) : null),
  setItem: (k, v) => pamet.set(k, String(v)),
  removeItem: (k) => pamet.delete(k),
}

const {
  debugData,
  mojeZaznamy,
  novyPodpisZarizeni,
  otiskZaznamu,
  prefixId,
  prejmenujNeodeslane,
  pridejZaznam,
  upravZaznam,
  smazZaznamy,
  najdiZaznam,
  filtrujZaznamy,
  nevyresene,
  slucZaznamy,
  sanitizujAutora,
  zmenenoOdExportu,
  MODULY,
  TYPY,
} = await import('../src/core/debug.js')

const { mdExport, zaznamNaMd, bezpecnyText, nazevExportu, nazevZalohy, jsonZaloha, zalohaZeSouboru, casNaText } =
  await import('../src/core/debugExport.js')

const { zapisChybu, posledniChyby, pocetChyb, zapomenChyby, STROP } = await import('../src/core/chyby.js')

const barvy = process.stdout.isTTY && !process.env.NO_COLOR
const zeleny = (s) => (barvy ? `\x1b[32m${s}\x1b[0m` : s)
const cerveny = (s) => (barvy ? `\x1b[31m${s}\x1b[0m` : s)

let ok = 0
let chyb = 0

/** @param {string} popis @param {boolean} podminka */
function t(popis, podminka) {
  if (podminka) {
    ok++
    console.log(`  ${zeleny('ok   ')} ${popis}`)
  } else {
    chyb++
    console.log(`  ${cerveny('CHYBA')} ${popis}`)
  }
}

/** Vyprázdní data mezi zkouškami. Mutuje na místě – reference drží modul. */
function vycisti() {
  debugData.zaznamy.length = 0
  debugData.dalsiCislo = 1
}

/** Pevný okamžik, ať kontrola nezávisí na tom, kdy se pustí. */
const KDY = new Date(2026, 7, 24, 16, 2).getTime()

/** Porovnání struktur textem – stejný zkratkovitý pomocník jako v check-dny.mjs. */
const jako = (x) => JSON.stringify(x)

/* ================= identifikátor autora ================= */

console.log('Identifikátor autora\n')

t('diakritika se odstraní', sanitizujAutora('Tadeáš') === 'tadeas')
t('mezery a tečky se změní na pomlčku', sanitizujAutora('Tadeáš K.') === 'tadeas-k')
t('velká písmena se sníží', sanitizujAutora('ANIČKA') === 'anicka')
t('prázdný vstup má náhradu', sanitizujAutora('') === 'autor')
t('vstup bez písmen má náhradu', sanitizujAutora('!!!') === 'autor')
t('pomlčka na konci se ořízne', sanitizujAutora('tadeas--') === 'tadeas')
t('dlouhé jméno se zkrátí', sanitizujAutora('a'.repeat(50)).length === 20)
t('sanitizace je idempotentní', sanitizujAutora(sanitizujAutora('Tadeáš K.')) === 'tadeas-k')

/* ================= číslování a identita ================= */

console.log('\nČíslování a identita záznamu\n')

vycisti()
const z1 = pridejZaznam({ typ: 'bug', nadpis: 'První' }, 'Tadeáš', KDY)
const z2 = pridejZaznam({ typ: 'napad', nadpis: 'Druhý' }, 'Tadeáš', KDY + 1000)

t('id má tvar autor-000', z1.id === 'tadeas-001')
t('číslo se zvedá', z2.id === 'tadeas-002')
t('další číslo ukazuje za poslední', debugData.dalsiCislo === 3)

smazZaznamy([z2.id])
const z3 = pridejZaznam({ typ: 'poznamka', nadpis: 'Třetí' }, 'Tadeáš', KDY + 2000)
t('smazaný záznam své číslo nepůjčí', z3.id === 'tadeas-003')
t('a v seznamu po něm nic nezůstane', najdiZaznam('tadeas-002') === null)

upravZaznam(z1.id, { id: 'jine-999', cislo: 42, autor: 'nekdo', vytvoreno: 0, nadpis: 'Přepsaný' }, KDY + 3000)
t('úprava nesmí přepsat id', z1.id === 'tadeas-001')
t('úprava nesmí přepsat číslo', z1.cislo === 1)
t('úprava nesmí přepsat autora', z1.autor === 'tadeas')
t('úprava nesmí přepsat čas vzniku', z1.vytvoreno === KDY)
t('úprava zapíše obsah', z1.nadpis === 'Přepsaný')
t('úprava zaznamená kdy', z1.upraveno === KDY + 3000)
t('úprava neznámého id nic neudělá', upravZaznam('nikdo-001', { nadpis: 'x' }) === null)

/* ================= filtrování ================= */

console.log('\nFiltrování a rozsah exportu\n')

vycisti()
pridejZaznam({ typ: 'bug', nadpis: 'A', moduly: ['mapa'], priorita: 'vysoka', stav: 'nove' }, 'tadeas', KDY)
pridejZaznam({ typ: 'napad', nadpis: 'B', moduly: ['plan', 'mapa'], priorita: 'nizka', stav: 'hotovo' }, 'tadeas', KDY + 1)
pridejZaznam({ typ: 'poznamka', nadpis: 'C', moduly: ['jine'], priorita: 'stredni', stav: 'zahozeno' }, 'tadeas', KDY + 2)
pridejZaznam({ typ: 'bug', nadpis: 'D', moduly: ['mapa'], priorita: 'vysoka', stav: 'resim' }, 'tadeas', KDY + 3)

t('bez filtru se vrátí všechno', filtrujZaznamy().length === 4)
t('filtr podle typu', filtrujZaznamy({ typ: 'bug' }).length === 2)
t('filtr podle modulu bere i druhý štítek', filtrujZaznamy({ modul: 'mapa' }).length === 3)
t('filtr podle stavu', filtrujZaznamy({ stav: 'nove' }).length === 1)
t('filtr podle priority', filtrujZaznamy({ priorita: 'vysoka' }).length === 2)
t('filtry se sčítají', filtrujZaznamy({ typ: 'bug', stav: 'resim' }).length === 1)
t('nejnovější je nahoře', filtrujZaznamy()[0].nadpis === 'D')
t('nevyřešené vynechají hotovo i zahozeno', nevyresene().length === 2)
t('čtení nezapisuje', debugData.zaznamy.length === 4 && debugData.dalsiCislo === 5)

/* ================= buffer zachycených chyb ================= */

console.log('\nBuffer zachycených chyb\n')

zapomenChyby()
t('prázdný buffer nic nedrží', pocetChyb() === 0)
for (let i = 0; i < STROP + 5; i++) zapisChybu('chyba', `chyba ${i}`, 'soubor.js:1:1')
t(`buffer se drží na ${STROP}`, pocetChyb() === STROP)
t('nejstarší vypadly', posledniChyby()[0].zprava === 'chyba 5')
t('nejnovější zůstala', posledniChyby()[STROP - 1].zprava === `chyba ${STROP + 4}`)
zapomenChyby()
zapisChybu('promise', 'x'.repeat(500))
t('dlouhá zpráva se ořízne', posledniChyby()[0].zprava.length === 300)
t('kopie bufferu nejde upravit zvenčí', (posledniChyby()[0].zprava = 'jiná') && posledniChyby()[0].zprava !== 'jiná')
zapomenChyby()

/* ================= export do .md ================= */

console.log('\nExport do .md\n')

vycisti()
const bug = pridejZaznam(
  {
    typ: 'bug',
    nadpis: 'Mapa nezobrazuje špendlíky po obnovení ze zálohy',
    text: 'Po obnovení dat ze zálohy JSON se špendlíky na mapě nenačtou.',
    moduly: ['mapa', 'data'],
    cekal: 'Že se mapa překreslí hned po importu.',
    kroky: '1. Nastavení → Obnovit ze zálohy\n2. Přepnout na Mapu',
    jakCasto: 'vzdy',
    navrh: 'Podezření na chybějící re-render po importu.',
    priorita: 'vysoka',
    kontext: {
      cas: KDY,
      obrazovka: 'Detail místa',
      online: true,
      viewport: '412×915',
      build: '2026.08.24-a3f9',
      swCache: 'vandrbuch-e307e823b0',
      uloziste: '3,1 MB / 5,0 MB',
      chyby: [],
    },
  },
  'tadeas',
  KDY
)
const napad = pridejZaznam(
  {
    typ: 'napad',
    nadpis: 'Filtrovat plán podle nálady',
    text: 'Při plánování trasy by šel přidat filtr podle nálady.',
    moduly: ['plan', 'domu'],
    motivace: 'Vybírat místa podle nálady, ne jen podle kategorie.',
    hotovoKdyz: 'V Plánu jde vybrat nálada a seznam se podle ní zúží.',
    priorita: 'nizka',
  },
  'tadeas',
  KDY + 1
)

const md = mdExport([bug, napad], { autor: 'tadeas', build: '2026.08.24-a3f9', filtr: 'nevyřešené', cas: KDY })

t('hlavička je první řádek', md.startsWith('# Vandrbuch — Debug export\n'))
t('hlavička nese čas', md.includes(`Vygenerováno: ${casNaText(KDY)}`))
t('hlavička počítá záznamy', md.includes('Záznamů: 2 (1× bug, 1× nápad)'))
t('hlavička nese build, autora i filtr', md.includes('Build: 2026.08.24-a3f9 · Autor: tadeas · Filtr exportu: nevyřešené'))
t('hlavička vysvětlí, co je hypotéza', md.includes('je jeho hypotéza — ne ověřený fakt'))
t('hlavička odkáže na pravidlo pro AI', md.includes('.claude/rules/debug.md'))
t('záznamy odděluje ---', md.split('\n---\n').length === 3)
t('hlavička záznamu nese id, typ, prioritu i stav', md.includes('## tadeas-001 · 🐞 Bug · priorita: vysoká · stav: nové'))
t('nadpis je na vlastním řádku', md.includes('### Mapa nezobrazuje špendlíky po obnovení ze zálohy'))
t('moduly jsou popisky, ne id', md.includes('**Moduly:** Mapa, Data a zálohy'))
t('Popis je vlastní sekce', md.includes('**Popis**\nPo obnovení dat ze zálohy'))
t('Návrh řešení je oddělený od popisu', md.includes('**Návrh řešení**\nPodezření na chybějící re-render'))
t('bug má Čekal jsem', md.includes('**Čekal jsem**'))
t('bug má Kroky', md.includes('**Kroky**\n1. Nastavení'))
t('bug má Jak často', md.includes('**Jak často:** vždy'))
t('nápad má K čemu to je', md.includes('**K čemu to je**'))
t('nápad má Hotovo když', md.includes('**Hotovo když**'))
t('nápad nemá pole bugu', !zaznamNaMd(napad).includes('Čekal jsem') && !zaznamNaMd(napad).includes('Jak často'))
t('bug nemá pole nápadu', !zaznamNaMd(bug).includes('K čemu to je'))
t('kontext se vypíše', md.includes('**Kontext**') && md.includes('build 2026.08.24-a3f9'))
t('bez chyb se to řekne', md.includes('Zachycené chyby: žádné'))
t('nesebraný kontext se přizná', zaznamNaMd(napad).includes('**Kontext**\nNesebral se.'))
t('prázdná sekce v exportu nezůstane', !zaznamNaMd(napad).includes('**Kroky**'))
t('prázdný export projde', mdExport([], { autor: 'tadeas' }).includes('Záznamů: 0'))

const sChybami = zaznamNaMd({
  ...bug,
  kontext: { ...bug.kontext, chyby: [{ cas: KDY, druh: 'chyba', zprava: 'null is not an object', zdroj: 'index.js:1:1' }] },
})
t('připnuté chyby se vypíšou', sChybami.includes('Zachycené chyby (1):') && sChybami.includes('null is not an object'))

/* ================= uživatelský text nerozbije soubor ================= */

console.log('\nBezpečnost struktury souboru\n')

t('samotné --- se escapuje', bezpecnyText('a\n---\nb') === 'a\n\\---\nb')
t('nadpis ## se escapuje', bezpecnyText('## tadeas-001 · fake') === '\\## tadeas-001 · fake')
t('běžný text zůstane', bezpecnyText('normální --- uprostřed řádku') === 'normální --- uprostřed řádku')
t('pomlčka v seznamu zůstane', bezpecnyText('- položka') === '- položka')

const zakerny = pridejZaznam({ typ: 'poznamka', nadpis: 'X', text: 'a\n---\n## tadeas-999 · 🐞 Bug' }, 'tadeas', KDY)
const mdZakerny = mdExport([zakerny], { autor: 'tadeas', cas: KDY })
t('zákeřný text nepřidá oddělovač', mdZakerny.split('\n---\n').length === 2)
t('zákeřný text nepředstírá hlavičku', !/\n## tadeas-999/.test(mdZakerny))

/* ================= názvy souborů ================= */

console.log('\nNázvy souborů\n')

t('export nese datum, čas i autora', nazevExportu(KDY, 'tadeas') === '2026-08-24-1602-tadeas.md')
t('dva exporty za den se nepřepíšou', nazevExportu(KDY, 'tadeas') !== nazevExportu(KDY + 3600000, 'tadeas'))
t('záloha navazuje na konvenci appky', nazevZalohy(KDY) === 'vandrbuch-debug-zaloha-2026-08-24.json')

/* ================= záloha a import ================= */

console.log('\nZáloha do .json a import zpátky\n')

vycisti()
const a1 = pridejZaznam({ typ: 'bug', nadpis: 'A' }, 'tadeas', KDY)
const a2 = pridejZaznam({ typ: 'napad', nadpis: 'B' }, 'tadeas', KDY + 1)
const soubor = JSON.parse(JSON.stringify(jsonZaloha([a1, a2], KDY)))

t('záloha se představí formátem', soubor.format === 'vandrbuch-debug' && soubor.verze === 1)
t('cizí soubor se odmítne', zalohaZeSouboru({ neco: 1 }) === null)
t('záloha bez záznamů se odmítne', zalohaZeSouboru({ format: 'vandrbuch-debug', verze: 1 }) === null)

vycisti()
const vysledek = slucZaznamy(zalohaZeSouboru(soubor))
t('import vrátí oba záznamy', debugData.zaznamy.length === 2 && vysledek.pridano === 2)
t('import zachová id', najdiZaznam('tadeas-001') !== null && najdiZaznam('tadeas-002') !== null)
t('import posune číslování za importované', debugData.dalsiCislo === 3)

const znovu = slucZaznamy(zalohaZeSouboru(soubor))
t('druhý import nic nezduplikuje', debugData.zaznamy.length === 2 && znovu.preskoceno === 2)

const cizi = { id: 'anicka-007', cislo: 7, autor: 'anicka', typ: 'bug', nadpis: 'Cizí', moduly: [], vytvoreno: KDY }
slucZaznamy([cizi])
t('cizí záznam s vyšším číslem posune číslování', debugData.dalsiCislo === 8)
t('a další zápis se s ním nesrazí', pridejZaznam({ typ: 'poznamka', nadpis: 'Z' }, 'tadeas', KDY).id === 'tadeas-008')

/* ================= podpis zařízení ================= */

// Zápis do úložiště se odsud přestěhoval do `check-uloziste.mjs`: záznamy od
// srpna 2026 bydlí v IndexedDB (`core/debugDb.js`), kterou čistý Node nemá.
// Tady zůstává jen to, co na úložišti nezávisí.

console.log('')
console.log('Podpis zařízení')
console.log('')

const ZNAKY = /^[abcdefghjkmnpqrstuvwxyz23456789]{3}$/
const podpisy = Array.from({ length: 60 }, () => novyPodpisZarizeni())
t('podpis má tři znaky z bezpečné abecedy', podpisy.every((p) => ZNAKY.test(p)))
// Bez `i l o 0 1` – id se diktuje nahlas a čte z commit zprávy.
t('a nikdy nezaměnitelný tvar', podpisy.every((p) => !/[ilo01]/.test(p)))
t('šedesát podpisů není šedesátkrát totéž', new Set(podpisy).size > 1)

t('prefix bez podpisu zůstane jen jméno', prefixId('tadeas') === 'tadeas')
t('prefix s podpisem je jméno-podpis', prefixId('tadeas', 'a7f') === 'tadeas-a7f')
t('prefix jméno sanitizuje', prefixId('Tadeáš Novák', 'a7f') === 'tadeas-novak-a7f')

// Tohle je celý smysl podpisu: dvě zařízení téhož člověka si nesmí sáhnout
// do stejných čísel. Do srpna 2026 vyrobil telefon i počítač `tadeas-001`.
const zTelefonu = pridejZaznam({ typ: 'bug', nadpis: 'Z telefonu' }, 'tadeas', KDY, 'a7f')
t('id nese podpis zařízení', zTelefonu.id === 'tadeas-a7f-009')
t('a autor je prefix i s podpisem', zTelefonu.autor === 'tadeas-a7f')
t('dvě zařízení téhož člověka se nesrazí', prefixId('tadeas', 'a7f') !== prefixId('tadeas', 'b2k'))

/* ================= přejmenování autora ================= */

console.log('')
console.log('Přejmenování autora')
console.log('')

const odeslany = pridejZaznam({ typ: 'napad', nadpis: 'Už odešel' }, 'tadeas', KDY, 'a7f')
upravZaznam(odeslany.id, { exportovanoDo: '2026-08-25-1527-tadeas.md' })
const neodeslany = pridejZaznam({ typ: 'napad', nadpis: 'Ještě ne' }, 'tadeas', KDY, 'a7f')

const moje = mojeZaznamy('tadeas-a7f')
t('rozdělí odeslané a neodeslané', moje.odeslane.length === 1 && moje.neodeslane.length === 2)
t('cizí záznam mezi moje nepatří', !moje.odeslane.concat(moje.neodeslane).some((z) => z.id === 'anicka-007'))

const zmeneno = prejmenujNeodeslane('tadeas-a7f', 'pc-tadeas-a7f')
t('přejmenuje jen neodeslané', zmeneno === 2)
t('odeslanému id zůstane', najdiZaznam(odeslany.id) !== null)
t('neodeslaný dostal nové id', najdiZaznam('pc-tadeas-a7f-011') !== null)
t('a číslo si nechal', najdiZaznam('pc-tadeas-a7f-011').cislo === neodeslany.cislo)
t('cizího se to nedotklo', najdiZaznam('anicka-007') !== null)
t('stejný prefix nic nedělá', prejmenujNeodeslane('pc-tadeas-a7f', 'pc-tadeas-a7f') === 0)
t('prázdný nový prefix nic nedělá', prejmenujNeodeslane('pc-tadeas-a7f', '') === 0)

/* ================= otisk: co z toho je na mainu ================= */

console.log('')
console.log('Otisk záznamu')
console.log('')

// Rejstřík na tohle nestačí: `popis` a `navrh` se v něm krátí na 400 znaků
// a u záznamů uzavřených přes VYRESENO.md nenese text vůbec žádný.
const zaklad = {
  typ: 'bug',
  priorita: 'stredni',
  stav: 'nove',
  nadpis: 'Tlačítko zrušit',
  moduly: ['detail'],
  text: 'Vrátí mě to do mapy.',
  cekal: 'Zůstat v detailu.',
  kroky: '1. otevřít detail',
  jakCasto: 'vzdy',
  motivace: '',
  hotovoKdyz: '',
  navrh: 'Vrátit se odkud jsem přišel.',
}

const o = otiskZaznamu(zaklad)
t('otisk je osm hexa znaků', /^[0-9a-f]{8}$/.test(o))
t('a pro tentýž záznam vyjde stejný', otiskZaznamu({ ...zaklad }) === o)
t('prázdný záznam nespadne', otiskZaznamu(null) === '')

t('změna nadpisu otisk změní', otiskZaznamu({ ...zaklad, nadpis: 'Jiný' }) !== o)
t('změna popisu taky', otiskZaznamu({ ...zaklad, text: 'Něco jiného' }) !== o)
t('změna návrhu taky', otiskZaznamu({ ...zaklad, navrh: 'Jinak' }) !== o)
t('změna priority taky', otiskZaznamu({ ...zaklad, priorita: 'vysoka' }) !== o)
t('změna modulů taky', otiskZaznamu({ ...zaklad, moduly: ['mapa'] }) !== o)
// Stav se počítá schválně: v `.md` v repozitáři stojí `stav: nové`, takže
// lokální „hotovo" znamená, že tam opravdu leží něco jiného.
t('změna stavu taky', otiskZaznamu({ ...zaklad, stav: 'hotovo' }) !== o)
// Kontext se sbírá jednou při zápisu a nikdy nemění – v otisku nemá co dělat.
t('kontext otisk nemění', otiskZaznamu({ ...zaklad, kontext: { obrazovka: 'Mapa' } }) === o)
// Přesun slova mezi poli nesmí vyjít jako žádná změna (proto oddělovač  ).
t('přesun textu mezi poli je změna', otiskZaznamu({ ...zaklad, text: 'Vrátí mě to do mapy. Zůstat v detailu.', cekal: '' }) !== o)

console.log('')
console.log('Změna od exportu')
console.log('')

t('neodeslaný záznam není změněný', zmenenoOdExportu({ ...zaklad }) === false)
// Chybějící otisk znamená „nevíme", ne „nezměněno" – záznamy odeslané před
// srpnem 2026 ho nemají a nesmí se tvářit jako změněné.
t('odeslaný bez otisku se netváří jako změněný',
  zmenenoOdExportu({ ...zaklad, exportovanoDo: 'x.md' }) === false)
t('odeslaný se shodným otiskem není změněný',
  zmenenoOdExportu({ ...zaklad, exportovanoDo: 'x.md', otiskExportu: o }) === false)
t('odeslaný s jiným textem JE změněný',
  zmenenoOdExportu({ ...zaklad, nadpis: 'Přepsáno', exportovanoDo: 'x.md', otiskExportu: o }) === true)
t('a stačí i změna stavu',
  zmenenoOdExportu({ ...zaklad, stav: 'hotovo', exportovanoDo: 'x.md', otiskExportu: o }) === true)

/* ================= export → rejstřík a zpátky ================= */

console.log('\nRejstřík složky debug/\n')

// Nejdůležitější invarianta celé featury: co `mdExport()` napíše do souboru,
// musí `postavRejstrik()` přečíst zpátky. Kdyby se ty dva rozešly, appka by
// přestala ukazovat stav z repozitáře a nikdo by si toho nevšiml – rejstřík
// by prostě tiše zmizel.
const { zaznamyZeSouboru, vyreseneZeSouboru, postavRejstrik } = await import('./debug-rejstrik.mjs')

vycisti()
const rBug = pridejZaznam(
  {
    typ: 'bug',
    nadpis: 'Mapa nezobrazuje špendlíky',
    text: 'Po obnovení ze zálohy se nenačtou.',
    moduly: ['mapa', 'data'],
    navrh: 'Chybí re-render po importu.',
    priorita: 'vysoka',
  },
  'tadeas',
  KDY
)
const rNapad = pridejZaznam(
  { typ: 'napad', nadpis: 'Filtrovat plán podle nálady', text: 'Šlo by to.', moduly: ['plan'], priorita: 'nizka' },
  'tadeas',
  KDY + 1
)
const rSoubor = mdExport([rBug, rNapad], { autor: 'tadeas', build: 'x', filtr: 'vše', cas: KDY })
const zpet = zaznamyZeSouboru(rSoubor, '2026-08-24-1602-tadeas.md')

t('parser najde oba záznamy', zpet.length === 2)
t('hlavička souboru se nepočítá jako záznam', !zpet.some((z) => /Debug export/.test(z.nadpis)))
t('id přežije cestu tam a zpět', zpet[0].id === rBug.id && zpet[1].id === rNapad.id)
t('autor se pozná z id', zpet[0].autor === 'tadeas')
t('typ se převede zpátky na id', zpet[0].typ === 'bug' && zpet[1].typ === 'napad')
t('priorita se převede zpátky na id', zpet[0].priorita === 'vysoka' && zpet[1].priorita === 'nizka')
t('stav se převede zpátky na id', zpet[0].stav === 'nove')
t('nadpis sedí', zpet[0].nadpis === rBug.nadpis)
t('moduly se převedou zpátky na id', jako(zpet[0].moduly) === jako(['mapa', 'data']))
t('popis se přečte', zpet[0].popis === rBug.text)
t('návrh se přečte odděleně od popisu', zpet[0].navrh === rBug.navrh && !zpet[0].popis.includes('re-render'))
t('kontext se do rejstříku nedostane', !('kontext' in zpet[0]) && !JSON.stringify(zpet).includes('viewport'))
t('soubor se u záznamu pamatuje', zpet[0].soubor === '2026-08-24-1602-tadeas.md')

// Zákeřný text se v exportu escapuje, takže parser nesmí spolknout falešnou
// hlavičku ani falešný oddělovač.
vycisti()
const rZakerny = pridejZaznam(
  { typ: 'poznamka', nadpis: 'X', text: 'a\n---\n## tadeas-999 · 🐞 Bug · priorita: vysoká · stav: nové' },
  'tadeas',
  KDY
)
const zpetZakerny = zaznamyZeSouboru(mdExport([rZakerny], { autor: 'tadeas', cas: KDY }), 's.md')
t('zákeřný text nevyrobí druhý záznam', zpetZakerny.length === 1)
t('a ani cizí id', zpetZakerny[0].id === rZakerny.id)

const vyresene = vyreseneZeSouboru(
  '# Vyřešené\n\n' +
    '- `tadeas-014` · 2026-09-02 · hotovo · Mapa nezobrazuje špendlíky\n' +
    '- `anicka-003` · 2026-09-02 · zahozeno · duplicita k tadeas-014\n' +
    'tohle není řádek rejstříku\n'
)
t('VYRESENO.md se přečte', vyresene.length === 2)
t('řádek nese datum uzavření', vyresene[0].vyresenoDne === '2026-09-02')
t('řádek nese stav', vyresene[0].stav === 'hotovo' && vyresene[1].stav === 'zahozeno')
t('řádek nese důvod', vyresene[1].poznamka === 'duplicita k tadeas-014')
t('autor se pozná i tady', vyresene[1].autor === 'anicka')
t('cizí řádky se přeskočí', !vyresene.some((v) => /tohle není/.test(v.id)))

const prazdny = postavRejstrik('/takova/cesta/neexistuje', KDY)
t('chybějící složka debug/ nespadne', jako(prazdny.zaznamy) === jako([]))
// Bez času vzniku by appka nerozeznala „export se ještě nenasadil" od
// „někdo záznam smazal bez řádku ve VYRESENO.md" a strašila by po každém exportu.
t('rejstřík nese čas svého vzniku', prazdny.vygenerovano === new Date(KDY).toISOString())

/* ================= číselníky ================= */

console.log('\nČíselníky\n')

t('modulů je jedenáct plus Jiné', MODULY.length === 12 && MODULY[MODULY.length - 1].id === 'jine')
t('žádný modul se neopakuje', new Set(MODULY.map((m) => m.id)).size === MODULY.length)
t('každý typ má znak do exportu i ikonu do appky', TYPY.every((x) => x.znak && /^i-[a-z0-9-]+$/.test(x.ikona)))

console.log(`\n${ok}/${ok + chyb} kontrol prošlo`)
process.exit(chyb ? 1 : 0)
