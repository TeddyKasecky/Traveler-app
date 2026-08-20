/**
 * Porovná nové filtrování s původním, kombinaci po kombinaci.
 *
 *   node scripts/check-filters-parity.mjs
 *
 * Původní visible() je tu opsaná doslova z reference/index-original.html.
 * Skript ji pustí vedle naší filters.js na stejných datech a stejném stavu
 * a porovná nejen počty, ale i konkrétní seznamy id.
 *
 * Jediný očekávaný rozdíl je hledání bez diakritiky – to je odsouhlasená změna
 * a testuje se zvlášť na konci.
 */

/* localStorage v Node neexistuje; store.js ho potřebuje hned při načtení. */
const pamet = new Map()
globalThis.localStorage = {
  getItem: (k) => (pamet.has(k) ? pamet.get(k) : null),
  setItem: (k, v) => pamet.set(k, String(v)),
  removeItem: (k) => pamet.delete(k),
}

const { S, F, store } = await import('../src/core/store.js')
const { visible, pocetAktivnich } = await import('../src/core/filters.js')

/* ---------- původní implementace, opsaná 1:1 ---------- */

function visiblePuvodni(PLACES, F, store) {
  const q = F.q.toLowerCase()
  return PLACES.filter((p) => {
    if (F.kat.size && !F.kat.has(p.k)) return false
    if (F.reg && p.r !== F.reg) return false
    if (F.zeme && p.z !== F.zeme) return false
    if (F.typ && p.t !== F.typ) return false
    if (F.coll && !(p.col || []).includes(F.coll)) return false
    if (F.free && !p.c.startsWith('Zdarma')) return false
    if (F.kids && p.ch !== 'Ano') return false
    if (F.dogs && p.ps !== 'Ano') return false
    if (F.wow && !((store.rating[p.id] || 0) >= 4)) return false
    if (F.fire && (store.prio[p.id] || 0) < 3) return false
    if (F.stav === 'visited' && store.stav[p.id] !== 'visited') return false
    if (F.stav === 'wish' && store.stav[p.id] === 'visited') return false
    if (q && !(p.n + ' ' + p.z + ' ' + p.r + ' ' + p.t + ' ' + p.p + ' ' + (p.f || '')).toLowerCase().includes(q))
      return false
    return true
  })
}

/**
 * Původní funkce, ale s odstraněním diakritiky na obou stranách.
 * Slouží jako měřítko pro dotazy: ověřuje, že náš předpočítaný index dává
 * stejný výsledek jako přímočaré skládání textu za běhu.
 */
const slozit = (s) => (s || '').normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase()
function visibleSkladajici(PLACES, F, store) {
  const q = slozit(F.q)
  return visiblePuvodni(PLACES, { ...F, q: '' }, store).filter((p) => {
    if (!q) return true
    return slozit(`${p.n} ${p.z} ${p.r} ${p.t} ${p.p} ${p.f || ''}`).includes(q)
  })
}

/* ---------- umělá uživatelská data, ať se testují i filtry nad storem ---------- */

const vzorek = S.places.filter((_, i) => i % 7 === 0)
vzorek.forEach((p, i) => {
  if (i % 3 === 0) store.stav[p.id] = 'visited'
  if (i % 4 === 0) store.rating[p.id] = (i % 5) + 1
  if (i % 5 === 0) store.prio[p.id] = (i % 3) + 1
})
console.log(`Data: ${S.places.length} míst`)
console.log(`Umělý stav: ${Object.keys(store.stav).length} navštívených, ${Object.keys(store.rating).length} hodnocených, ${Object.keys(store.prio).length} s prioritou\n`)

/* ---------- kombinace k otestování ---------- */

const KATEGORIE = [...new Set(S.places.map((p) => p.k))]
const ZEME = [...new Set(S.places.map((p) => p.z))]
const OBLASTI = [...new Set(S.places.map((p) => p.r))]
const TYPY = [...new Set(S.places.map((p) => p.t))]
const KOLEKCE = [...new Set(S.places.flatMap((p) => p.col || []))]

const vychozi = () => ({
  kat: new Set(), q: '', reg: '', zeme: '', typ: '',
  free: false, kids: false, dogs: false, wow: false, fire: false, stav: '', coll: '',
})

const kombinace = []
/** @param {boolean} [sDiakritikou] true = porovnávat proti verzi, která taky skládá diakritiku */
const pridej = (popis, uprav, sDiakritikou = false) => kombinace.push({ popis, uprav, sDiakritikou })

pridej('bez filtrů', () => {})
for (const k of KATEGORIE) pridej(`kategorie ${k}`, (f) => f.kat.add(k))
pridej('dvě kategorie', (f) => { f.kat.add('Ferraty'); f.kat.add('Jezera') })
pridej('všechny kategorie', (f) => KATEGORIE.forEach((k) => f.kat.add(k)))
for (const z of ZEME) pridej(`země ${z}`, (f) => (f.zeme = z))
for (const r of OBLASTI.slice(0, 30)) pridej(`oblast ${r}`, (f) => (f.reg = r))
for (const t of TYPY) pridej(`typ ${t}`, (f) => (f.typ = t))
for (const c of KOLEKCE) pridej(`kolekce ${c}`, (f) => (f.coll = c))
for (const p of ['free', 'kids', 'dogs', 'wow', 'fire']) pridej(`přepínač ${p}`, (f) => (f[p] = true))
for (const s of ['visited', 'wish']) pridej(`stav ${s}`, (f) => (f.stav = s))
pridej('zdarma + děti', (f) => { f.free = true; f.kids = true })
pridej('zdarma + děti + pes', (f) => { f.free = true; f.kids = true; f.dogs = true })
pridej('hodnocené 4+ a musíme', (f) => { f.wow = true; f.fire = true })
pridej('kategorie + země + zdarma', (f) => { f.kat.add('Vodopády'); f.zeme = 'Itálie'; f.free = true })
pridej('všechno naráz', (f) => {
  f.kat.add('Hory a túry'); f.zeme = 'Švýcarsko'; f.typ = 'Túra'
  f.coll = 'rychlovka'; f.free = true; f.kids = true; f.stav = 'wish'
})
/* Dotazy se porovnávají proti verzi původní funkce, která taky odstraňuje
 * diakritiku – jinak by se hlásil jako chyba přesně ten rozdíl, kvůli kterému
 * se to dělalo. Dotaz „a“ je tam schválně: najde i místa, která mají jen „á“. */
const DOTAZY = ['vodopád', 'Ferrata', 'JEZERO', 'soutěska', 'itálie', 'dolomity',
  'xyzneexistuje', 'a', 'grotta', 'soutesky', 'vodopad', 'jeskyne', 'itAlie', 'PRUSMYK']
for (const q of DOTAZY) pridej(`hledání "${q}"`, (f) => (f.q = q), true)
pridej('hledání + kategorie', (f) => { f.q = 'vodopád'; f.kat.add('Vodopády') }, true)

/* ---------- porovnání ---------- */

/**
 * Nastaví globální F podle testovacího objektu.
 * Pozor: `Object.assign(F, t)` nestačí – přepsalo by F.kat referencí na tentýž
 * Set, takže by se pak čistil i testovací objekt a obě strany by testovaly nic.
 */
function nastavF(t) {
  F.q = t.q
  F.reg = t.reg
  F.zeme = t.zeme
  F.typ = t.typ
  F.free = t.free
  F.kids = t.kids
  F.dogs = t.dogs
  F.wow = t.wow
  F.fire = t.fire
  F.stav = t.stav
  F.coll = t.coll
  F.kat.clear()
  for (const k of t.kat) F.kat.add(k)
}

let selhalo = 0
for (const { popis, uprav, sDiakritikou } of kombinace) {
  const test = vychozi()
  uprav(test)
  nastavF(test)

  const nase = visible().map((p) => p.id)
  const porovnavac = sDiakritikou ? visibleSkladajici : visiblePuvodni
  const puvodni = porovnavac(S.places, test, store).map((p) => p.id)

  if (nase.length !== puvodni.length || nase.some((id, i) => id !== puvodni[i])) {
    selhalo++
    console.log(`ROZDÍL – ${popis}`)
    console.log(`   původní: ${puvodni.length} míst, naše: ${nase.length} míst`)
    const chybi = puvodni.filter((x) => !nase.includes(x))
    const navic = nase.filter((x) => !puvodni.includes(x))
    if (chybi.length) console.log(`   chybí:  ${chybi.slice(0, 5).join(', ')}`)
    if (navic.length) console.log(`   navíc:  ${navic.slice(0, 5).join(', ')}`)
  }
}

console.log(`Otestováno ${kombinace.length} kombinací filtrů: ${selhalo ? `${selhalo} ROZDÍLŮ` : 'všechny sedí'}\n`)

/* ---------- referenční počty z INVENTURY ---------- */

const ocekavane = [
  ['bez filtrů', (f) => {}, 580],
  ['zdarma', (f) => (f.free = true), 402],
  ['s dětmi', (f) => (f.kids = true), 395],
  ['se psem', (f) => (f.dogs = true), 5],
  ['Hory a túry', (f) => f.kat.add('Hory a túry'), 138],
  ['Města a památky', (f) => f.kat.add('Města a památky'), 99],
  ['Ferraty', (f) => f.kat.add('Ferraty'), 49],
  ['Spaní', (f) => f.kat.add('Spaní'), 11],
]
console.log('Kontrola proti číslům z inventury:')
let cisla = 0
for (const [popis, uprav, cekano] of ocekavane) {
  const test = vychozi()
  uprav(test)
  nastavF(test)
  const n = visible().length
  const ok = n === cekano
  if (!ok) cisla++
  console.log(`  ${ok ? 'ok  ' : 'CHYBA'} ${popis.padEnd(20)} ${n} (čekáno ${cekano})`)
}

/* ---------- odznak filtrů ---------- */

nastavF(vychozi())
F.fire = true
const odznakFire = pocetAktivnich()
F.fire = false
F.free = true
const odznakFree = pocetAktivnich()
console.log(`\nOdznak filtrů: jen "Musíme!" → ${odznakFire} (po N1 se počítá), jen "Zdarma" → ${odznakFree}`)

/* ---------- rychlé filtry „moje věci“ (v originále nebyly) ---------- */
/* Originál je nezná, takže se nedají porovnat – ověřuje se jejich význam.
 * Nejdůležitější je, že `ulozene` NENÍ totéž co `stav: 'wish'`: to druhé
 * z originálu znamená „všechno kromě navštíveného“, tedy skoro celá databáze. */

console.log('\nRychlé filtry „moje věci“ – originál je nezná, ověřuje se význam:')

// Umělý stav výš dal `visited` každému třetímu; pár míst se uloží a naplánuje.
const ulozeneId = S.places.filter((p) => store.stav[p.id] !== 'visited').slice(0, 7).map((p) => p.id)
for (const id of ulozeneId) store.stav[id] = 'wish'
store.plan = S.places.slice(10, 14).map((p) => p.id)

const zkus = (popis, uprav, cekano) => {
  nastavF(vychozi())
  // `vychozi()` je z doby před novými filtry a `nastavF` je proto nenuluje.
  F.ulozene = false
  uprav()
  const n = visible().length
  const ok = n === cekano
  if (!ok) cisla++
  console.log(`  ${ok ? 'ok  ' : 'CHYBA'} ${popis.padEnd(28)} ${n} (čekáno ${cekano})`)
}

zkus('uložená srdcem', () => (F.ulozene = true), ulozeneId.length)
zkus('navštíveno', () => (F.stav = 'visited'), Object.values(store.stav).filter((x) => x === 'visited').length)
zkus(
  'uložená ≠ stav „wish"',
  () => (F.stav = 'wish'),
  S.places.filter((p) => store.stav[p.id] !== 'visited').length
)

nastavF(vychozi())
F.ulozene = true
const odznakUloz = pocetAktivnich()
console.log(`  odznak filtrů: jen „Uložená" → ${odznakUloz} (nové filtry se do odznaku počítají)`)
if (odznakUloz !== 1) cisla++
// „V plánu“ přestalo být filtr v F – nahradil ho mód mapy „Na cestě“
// (S.mapaMod, components/chip.js, map/map.js#draw()), který visible() vůbec
// neprochází, takže tady už se netestuje.

// Uklidit po sobě, ať to neovlivní nic dalšího.
for (const id of ulozeneId) delete store.stav[id]
store.plan = []

/* ---------- hledání bez diakritiky (odsouhlasená změna) ---------- */

console.log('\nHledání bez diakritiky – tady se od originálu lišíme schválně:')
for (const q of ['soutesky', 'vodopad', 'jeskyne', 'itAlie']) {
  nastavF({ ...vychozi(), q })
  const nase = visible().length
  const puvodni = visiblePuvodni(S.places, { ...vychozi(), q }, store).length
  console.log(`  "${q}"`.padEnd(16) + `nově ${String(nase).padStart(3)} míst, dřív ${puvodni}`)
}

process.exit(selhalo || cisla ? 1 : 0)
