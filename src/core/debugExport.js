/**
 * Skládání exportu debug záznamů – `.md` pro repozitář a AI, `.json` pro zálohu.
 *
 * PROČ JEDEN SOUBOR NA EXPORT, NE NA ZÁZNAM: ukládat z telefonu třicet souborů
 * zvlášť je nepoužitelné, a AI přečte slepený soubor stejně dobře. Konflikt
 * v gitu nehrozí, protože každý export je nový soubor s unikátním názvem.
 *
 * PROČ JE `Návrh řešení` VLASTNÍ SEKCE: je to hypotéza uživatele, ne
 * pozorování. Slepené s popisem ji AI bere jako fakt a jde slepou uličkou.
 * Ze stejného důvodu má hlavička odstavec, který ten rozdíl vysvětluje –
 * je to jediné místo, kde se to čtenáři exportu dá říct.
 *
 * ČISTÝ TEXT, ŽÁDNÝ DOM. Testuje se v Node (`scripts/check-debug.mjs`), a od
 * srpna 2026 na to visí ještě jedna věc: `scripts/debug-rejstrik.mjs` čte
 * hotové `.md` soubory zpátky, aby appka uměla ukázat stav z repozitáře.
 * Formát hlaviček (`## <id> · …`, `### <nadpis>`, `**Moduly:**`) je proto
 * dohoda mezi dvěma soubory, ne jen kosmetika – mění se v obou naráz.
 */

import { JAK_CASTO, popisekModulu, popisekPriority, popisekStavu, typZaznamu } from './debug.js'

const dv = (n) => String(n).padStart(2, '0')

/** `2026-08-24 16:02` v místním čase. Cesta se plánuje v místním čase, ne v UTC. */
export function casNaText(cas) {
  const d = cas instanceof Date ? cas : new Date(cas)
  return `${d.getFullYear()}-${dv(d.getMonth() + 1)}-${dv(d.getDate())} ${dv(d.getHours())}:${dv(d.getMinutes())}`
}

/** `2026-08-24` v místním čase. */
export function datumNaText(cas) {
  const d = cas instanceof Date ? cas : new Date(cas)
  return `${d.getFullYear()}-${dv(d.getMonth() + 1)}-${dv(d.getDate())}`
}

/** `2026-08-24-1602-tadeas.md` – datum řadí složku samo, čas brání přepsání. */
export const nazevExportu = (cas, autor) => {
  const d = cas instanceof Date ? cas : new Date(cas)
  return `${datumNaText(d)}-${dv(d.getHours())}${dv(d.getMinutes())}-${autor}.md`
}

/** Navazuje na `vandrbuch-zaloha-….json`, aby se to v Souborech našlo vedle sebe. */
export const nazevZalohy = (cas) => `vandrbuch-debug-zaloha-${datumNaText(cas)}.json`

/**
 * Zneškodní řádky uživatelského textu, které by rozbily strukturu souboru.
 *
 * `---` odděluje záznamy a `##` uvozuje jejich hlavičku – kdyby to někdo
 * napsal do popisu, `debug-rejstrik.mjs` by soubor rozřezal špatně a záznamy
 * by se v appce zobrazily rozsekané. Zpětné lomítko je obyčejné markdownové
 * escapování, takže se text čte pořád stejně.
 */
export function bezpecnyText(s) {
  return String(s || '')
    .split('\n')
    .map((r) => (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(r) || /^\s*#{1,6}\s/.test(r) ? `\\${r.trimStart()}` : r))
    .join('\n')
}

/** `**Nadpis**\ntext` – prázdná hodnota nevrací nic, ať v exportu nezůstávají prázdné sekce. */
function sekce(nadpis, text) {
  const t = bezpecnyText(text).trim()
  return t ? `\n**${nadpis}**\n${t}\n` : ''
}

/** „1× bug, 1× nápad" – v pořadí číselníku, nulové typy se vynechají. */
function souhrnTypu(zaznamy) {
  const pocty = new Map()
  for (const z of zaznamy) pocty.set(z.typ, (pocty.get(z.typ) || 0) + 1)
  return [...pocty]
    .map(([typ, n]) => `${n}× ${typZaznamu(typ).popisek.toLowerCase()}`)
    .join(', ')
}

/**
 * Technický kontext do exportu – hutně, na pár řádků.
 *
 * Kontext nesmí přebít vlastní text záznamu, takže se nevypisuje jako tabulka
 * polí, ale jako věty oddělené `·`. Prázdné údaje se vynechávají – řádek
 * „úložiště: null" nikomu nepomůže.
 */
function kontextNaText(k) {
  if (!k) return '\n**Kontext**\nNesebral se.\n'

  const radky = []

  const prvni = [casNaText(k.cas || Date.now())]
  if (k.obrazovka) prvni.push(`obrazovka: ${k.obrazovka}`)
  prvni.push(k.online === false ? 'offline' : 'online')
  if (k.viewport) prvni.push(`viewport ${k.viewport}${k.dpr ? ` @${k.dpr}×` : ''}`)
  radky.push(prvni.join(' · '))

  const druhy = []
  if (k.build) druhy.push(`build ${k.build}`)
  if (k.swCache) druhy.push(`sw-cache ${k.swCache}`)
  if (k.podklad) druhy.push(`podklad ${k.podklad}`)
  if (k.offlineMapa) druhy.push(`offline mapa ${k.offlineMapa}${k.mapaStazena ? ' (stažená)' : ''}`)
  if (druhy.length) radky.push(druhy.join(' · '))

  if (k.filtry) radky.push(`filtry: ${k.filtry}`)
  if (k.vyber) radky.push(k.vyber)
  if (k.uloziste) radky.push(`úložiště: ${k.uloziste}`)
  if (k.zarizeni) radky.push(`zařízení: ${k.zarizeni}`)

  const chyby = k.chyby || []
  radky.push(
    chyby.length
      ? `Zachycené chyby (${chyby.length}):\n` +
          chyby.map((c) => `- ${casNaText(c.cas)} · ${c.druh} · ${c.zprava}${c.zdroj ? ` · ${c.zdroj}` : ''}`).join('\n')
      : 'Zachycené chyby: žádné'
  )

  return `\n**Kontext**\n${radky.join('\n')}\n`
}

/** Jeden záznam jako sekce `.md`. */
export function zaznamNaMd(z) {
  const t = typZaznamu(z.typ)
  const moduly = (z.moduly || []).map(popisekModulu).join(', ')

  let s = `## ${z.id} · ${t.znak} ${t.popisek} · priorita: ${popisekPriority(z.priorita)} · stav: ${popisekStavu(z.stav)}\n`
  s += `### ${bezpecnyText(z.nadpis).replace(/\n/g, ' ')}\n`
  if (moduly) s += `**Moduly:** ${moduly}\n`

  s += sekce('Popis', z.text)

  if (z.typ === 'bug') {
    s += sekce('Čekal jsem', z.cekal)
    s += sekce('Kroky', z.kroky)
    if (z.jakCasto) {
      const jak = JAK_CASTO.find((j) => j.id === z.jakCasto)
      s += `\n**Jak často:** ${jak ? jak.popisek : z.jakCasto}\n`
    }
  }
  if (z.typ === 'napad') {
    s += sekce('K čemu to je', z.motivace)
    s += sekce('Hotovo když', z.hotovoKdyz)
  }

  s += sekce('Návrh řešení', z.navrh)
  s += kontextNaText(z.kontext)
  return s
}

/**
 * Celý `.md` export.
 *
 * @param {Array<Record<string, any>>} zaznamy
 * @param {{autor: string, build?: string, filtr?: string, cas?: number|Date}} o
 */
export function mdExport(zaznamy, { autor, build = '—', filtr = 'vše', cas = Date.now() }) {
  const hlavicka =
    `# Vandrbuch — Debug export\n` +
    `Vygenerováno: ${casNaText(cas)} · Záznamů: ${zaznamy.length}` +
    (zaznamy.length ? ` (${souhrnTypu(zaznamy)})` : '') +
    `\nBuild: ${build} · Autor: ${autor} · Filtr exportu: ${filtr}\n\n` +
    `Export poznámek z appky Vandrbuch. Každý záznam je nápad, bug nebo poznámka\n` +
    `zapsaná za běhu appky. Sekce "Popis" je pozorování uživatele, "Návrh řešení"\n` +
    `je jeho hypotéza — ne ověřený fakt. "Kontext" sbírá appka automaticky.\n\n` +
    `Jak se se záznamy pracuje, je v \`.claude/rules/debug.md\`.\n`

  return [hlavicka, ...zaznamy.map(zaznamNaMd)].join('\n---\n\n')
}

/**
 * Záloha do `.json` pro zpětný import.
 *
 * `format` a `verze` jsou tam schválně: import musí umět odmítnout cizí soubor
 * dřív, než se pokusí slučovat něco, co záznamy vůbec nejsou.
 */
export const jsonZaloha = (zaznamy, cas = Date.now()) => ({
  format: 'vandrbuch-debug',
  verze: 1,
  exported: new Date(cas).toISOString(),
  zaznamy,
})

/**
 * Vytáhne záznamy z importovaného souboru. Vrací `null`, když to není záloha
 * poznámkovače – volající to má ohlásit, ne tiše přejít.
 */
export function zalohaZeSouboru(data) {
  if (!data || data.format !== 'vandrbuch-debug' || !Array.isArray(data.zaznamy)) return null
  return data.zaznamy
}

/* ================= porovnání s tím, co je v repozitáři ================= */

/** Rejstřík krátí dlouhá pole na 400 znaků a poslední znak nahradí výpustkou. */
const STROP_REJSTRIKU = 400

/**
 * Sedí jedno textové pole s tím, co má rejstřík?
 *
 * Rejstřík nese zkrácenou podobu (`zkrat()` v `scripts/debug-rejstrik.mjs`),
 * takže u dlouhého textu se dá porovnat jen začátek. Kratší z obou stran
 * rozhoduje – jinak by každá delší poznámka vycházela jako změněná.
 */
function sediPole(mistni, zRepa) {
  const m = bezpecnyText(mistni || '').trim()
  const r = String(zRepa == null ? '' : zRepa)
  if (r.length === STROP_REJSTRIKU && r.endsWith('…')) {
    return m.slice(0, STROP_REJSTRIKU - 1) === r.slice(0, STROP_REJSTRIKU - 1)
  }
  return m === r
}

/**
 * Shoduje se záznam s podobou, kterou o něm ví repozitář?
 *
 * PROČ TO EXISTUJE: `otiskExportu` se ukládá až od srpna 2026 při označení
 * „odesláno". Záznamy odeslané dřív ho nemají, takže by se u nich změna
 * nikdy nepoznala – a to byly v okamžiku vydání úplně všechny. Tohle je
 * druhá cesta: porovnat přímo s tím, co rejstřík nese.
 *
 * NEVIDÍ NA VŠECHNO. `debug-stav.json` nese jen nadpis, popis, návrh, typ,
 * prioritu, stav a moduly – kroky, „čekal jsem" ani „hotovo když" v něm
 * nejsou, protože se nasazuje veřejně na web. Změna jen v nich se touhle
 * cestou nepozná; jakmile ale záznam jednou projde exportem s otiskem,
 * nastoupí přesné porovnání hashů a vidí všechno.
 *
 * @param {Record<string, any>} z  záznam z appky
 * @param {Record<string, any>|null} r  co o něm ví rejstřík
 * @returns {boolean|null} `null` = nedá se porovnat (uzavřený záznam nebo nic)
 */
export function sediSRepem(z, r) {
  // Uzavřený záznam (`VYRESENO.md`) nenese text vůbec – porovnávat není s čím.
  if (!z || !r || r.zdroj !== 'export') return null
  if (z.typ !== r.typ || z.priorita !== r.priorita || z.stav !== r.stav) return false
  if ((z.moduly || []).join(',') !== (r.moduly || []).join(',')) return false
  if (bezpecnyText(z.nadpis || '').replace(/\n/g, ' ').trim() !== String(r.nadpis || '')) return false
  return sediPole(z.text, r.popis) && sediPole(z.navrh, r.navrh)
}
