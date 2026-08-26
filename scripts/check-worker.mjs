/**
 * Že Worker nepustí dál, co nemá.
 *
 *   npm run check-worker
 *
 * PROČ ZVLÁŠŤ: `worker/index.js` mění, jak se servíruje CELÁ aplikace, a žádná
 * jiná kontrola na něj nedosáhne – `smoke` si pouští vlastní statický server,
 * takže Worker nikdy nevidí. Tohle je jediné, co jde ověřit bez nasazení.
 *
 * Testuje se přes **čisté exportované funkce**, ne přes běžící Worker: obsluha
 * potřebuje Cloudflare a síť, kdežto rozhodnutí „pustit / nepustit" je obyčejná
 * logika a testovat se má samostatně. Samotný `fetch` se ověří ručně na betě,
 * viz `.claude/rules/nasazeni.md`.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath, ne ruční ořezávání – cesta obsahuje diakritiku („Anička“).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const { jmenoSedi, textSedi, sPoradim, shodneHeslo, naBase64, HLAVICKA, STROP_BAJTU, MAX_KOLIZI, REPO, VETEV, SLOZKA } =
  await import(`file://${path.join(ROOT, 'worker', 'index.js').replace(/\\/g, '/')}`)

const zdrojWorkeru = (await import('node:fs')).readFileSync(path.join(ROOT, 'worker', 'index.js'), 'utf8')

const barvy = process.stdout.isTTY && !process.env.NO_COLOR
const zeleny = (s) => (barvy ? `\x1b[32m${s}\x1b[0m` : s)
const cerveny = (s) => (barvy ? `\x1b[31m${s}\x1b[0m` : s)

let ok = 0
let chyb = 0
const t = (popis, podminka) => {
  if (podminka) {
    ok++
    console.log(`  ${barvy ? '\x1b[32mok\x1b[0m' : 'ok'}    ${popis}`)
  } else {
    chyb++
    console.log(`  ${cerveny('CHYBA')} ${popis}`)
  }
}

console.log('')
console.log('Název souboru')
console.log('')

t('platný název projde', jmenoSedi('2026-08-26-1602-tadeas.md'))
t('a s podpisem zařízení taky', jmenoSedi('2026-08-26-1602-pc-tadeas.md'))

// Tohle je jediná věc, kterou klient ovlivňuje a která se dostane do cesty
// na disku. Musí to být těsné.
t('cesta o úroveň výš neprojde', !jmenoSedi('../tajne.md'))
t('podsložka neprojde', !jmenoSedi('jinam/2026-08-26-1602-tadeas.md'))
t('lomítko kdekoli neprojde', !jmenoSedi('2026-08-26-1602-tade/as.md'))
t('jiná přípona neprojde', !jmenoSedi('2026-08-26-1602-tadeas.js'))
t('bez přípony neprojde', !jmenoSedi('2026-08-26-1602-tadeas'))
t('bez data neprojde', !jmenoSedi('tadeas.md'))
t('velká písmena neprojdou', !jmenoSedi('2026-08-26-1602-Tadeas.md'))
t('diakritika neprojde', !jmenoSedi('2026-08-26-1602-tadeáš.md'))
t('dlouhý autor neprojde', !jmenoSedi(`2026-08-26-1602-${'a'.repeat(40)}.md`))
t('prázdno neprojde', !jmenoSedi(''))
t('číslo místo názvu neprojde', !jmenoSedi(123))

console.log('')
console.log('Obsah')
console.log('')

const platny = `${HLAVICKA}\nFormát: 1\n\n---\n\n## tadeas-001 · 🐞 Bug · priorita: střední · stav: nové\n### Něco\n`
t('platný export projde', textSedi(platny))
t('cizí soubor neprojde', !textSedi('# Nákupní seznam\n\n- mléko\n'))
t('export bez jediného záznamu neprojde', !textSedi(`${HLAVICKA}\nFormát: 1\n`))
t('prázdno neprojde', !textSedi(''))
t('objekt místo textu neprojde', !textSedi({ nadpis: 'x' }))

console.log('')
console.log('Kolize názvů')
console.log('')

// Dva exporty ve stejné minutě dostanou od `nazevExportu()` shodné jméno.
// Nikdy se nesmí nic přepsat.
const druhy = sPoradim('2026-08-26-1602-tadeas.md', 2)
t('druhý pokus posune minutu', druhy === '2026-08-26-1603-tadeas.md')
// Výsledek musí umět přečíst i úklid a rejstřík, jinak by ve složce osiřel.
t('a pořád sedí na vzoru názvu', jmenoSedi(druhy))
// TOHLE JE TA PODSTATNÁ. Nabízelo se `-2` před `.md`, jenže `-` je v abecedě
// PŘED `.`, takže by `tadeas-2.md` skončilo před `tadeas.md` – a pořadí názvů
// je to, podle čeho se pozná, který záznam platí. Novější soubor by prohrál
// se starším a nikdo by si toho nevšiml.
t('a řadí se ZA původní', druhy > '2026-08-26-1602-tadeas.md')
t('kdežto přípona -2 by se řadila před', !('2026-08-26-1602-tadeas-2.md' > '2026-08-26-1602-tadeas.md'))
t('devátý pokus taky sedí', jmenoSedi(sPoradim('2026-08-26-1602-tadeas.md', MAX_KOLIZI + 1)))
t('přes celou hodinu to sedí', sPoradim('2026-08-26-1659-tadeas.md', 2) === '2026-08-26-1700-tadeas.md')
t('přes půlnoc taky', sPoradim('2026-08-26-2359-tadeas.md', 2) === '2026-08-27-0000-tadeas.md')
t('a přes konec měsíce', sPoradim('2026-08-31-2359-tadeas.md', 2) === '2026-09-01-0000-tadeas.md')
t('nesmyslný název se nechá být', sPoradim('divny.md', 2) === 'divny.md')

console.log('')
console.log('Heslo')
console.log('')

t('shodné heslo projde', shodneHeslo('tajne-heslo', 'tajne-heslo'))
t('jiné heslo neprojde', !shodneHeslo('tajne-heslo', 'jine-heslo'))
t('kratší heslo neprojde', !shodneHeslo('tajne', 'tajne-heslo'))
t('prázdné heslo neprojde', !shodneHeslo('', 'tajne-heslo'))
t('chybějící hlavička neprojde', !shodneHeslo(null, 'tajne-heslo'))
// Kdyby prošlo prázdné proti prázdnému, stačilo by secret nenastavit
// a endpoint by byl otevřený. Obsluha to hlídá zvlášť (503), tohle je pojistka.
t('prázdné proti prázdnému je shoda, ale obsluha ho nepustí', shodneHeslo('', ''))

// HESLO S DIAKRITIKOU MUSÍ PROJÍT. Hodnota HTTP hlavičky smí obsahovat jen
// znaky do 0xFF, takže `heslíčko` v hlavičce shodí `fetch` ještě v prohlížeči –
// požadavek vůbec neodejde a aplikace hlásí „server neodpověděl" u serveru,
// který nikdo neoslovil. Proto se heslo posílá v JSON těle.
t('heslo s diakritikou se porovná', shodneHeslo('žluťoučké-heslíčko', 'žluťoučké-heslíčko'))
t('a s emoji taky', shodneHeslo('heslo🐞', 'heslo🐞'))
t('heslo se nesmí posílat v hlavičce', !/headers[\s\S]{0,120}heslo/i.test(zdrojWorkeru))

console.log('')
console.log('Kódování a meze')
console.log('')

t('diakritika se zakóduje a vrátí', Buffer.from(naBase64('Příliš žluťoučký kůň'), 'base64').toString('utf8') === 'Příliš žluťoučký kůň')
t('emoji taky', Buffer.from(naBase64('🐞 bug'), 'base64').toString('utf8') === '🐞 bug')
// Po kouscích, ne přes rozprostření celého pole – u čtvrt megabajtu by to
// přeteklo zásobník.
const dlouhy = 'á'.repeat(200000)
t('dvěstětisíc znaků nepřeteče zásobník', Buffer.from(naBase64(dlouhy), 'base64').toString('utf8') === dlouhy)
t('strop je čtvrt megabajtu', STROP_BAJTU === 262144)

console.log('')
console.log('Pevné hranice')
console.log('')

// Kdyby kterákoli z těchhle hodnot přišla od klienta, dal by se zápis
// přesměrovat jinam. Musí být natvrdo.
t('repozitář je natvrdo', REPO === 'TeddyKasecky/Traveler-app')
t('větev je natvrdo', VETEV === 'main')
t('složka je natvrdo', SLOZKA === 'debug')

const zdroj = zdrojWorkeru
t('obsluhuje se jediná cesta', (zdroj.match(/'\/api\/debug'/g) || []).length === 1)
t('všechno ostatní dostane 404', zdroj.includes("return new Response(null, { status: 404 })"))
t('obsluha je v try/catch', /try \{\s*return await prijmiPoznamky/.test(zdroj))
t('nikde se nemaže', !/method: 'DELETE'/.test(zdroj))
// Klíč `sha` v těle PUT požadavku by GitHubu řekl „přepiš tuhle verzi".
// Bez něj zápis do existujícího souboru odmítne sám – druhá pojistka
// k dotazu na existenci. Hledá se klíč, ne slovo, aby to nechytalo komentář.
t('zápis neposílá sha, takže nemůže přepsat', !/\bsha\s*:/.test(zdroj))

console.log(`\n${chyb ? cerveny(`${ok}/${ok + chyb}`) : zeleny(`${ok}/${ok + chyb}`)} kontrol prošlo`)
process.exit(chyb ? 1 : 0)
