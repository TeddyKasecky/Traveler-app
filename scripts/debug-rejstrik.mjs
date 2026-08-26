/**
 * Rejstřík složky `debug/` – co je otevřené a co už se vyřešilo.
 *
 *   npm run debug-rejstrik -- --vypis    přehled do konzole (pro člověka i pro AI)
 *
 * PROČ TO EXISTUJE: appka se nasazuje z TÉHOŽ repozitáře, do kterého se
 * commitují exporty. Build si tedy může složku přečíst a přibalit z ní rejstřík
 * (`dist/debug-stav.json`) – a autor pak v appce vidí, že jeho hlášení někdo
 * řeší nebo vyřešil, plus záznamy toho druhého. Žádný backend, žádný token.
 *
 * ÚKLID A REJSTŘÍK SE DRŽÍ NAVZÁJEM. Vyřešený záznam z `.md` mizí (jinak by
 * složka zarostla), ale kdyby zmizel beze stopy, appka by o něm ztratila
 * povědomí a autor by se nikdy nedozvěděl, že je hotovo. Proto `VYRESENO.md`
 * – jednořádkový zápis, který se nikdy nemaže. Postup je v `.claude/rules/debug.md`.
 *
 * Parsování je bezpečné, protože `.md` skládá naše vlastní
 * `src/core/debugExport.js#mdExport()`. Že se ty dva nerozejdou, hlídá
 * `scripts/check-debug.mjs` – vyrobí export a hned ho tímhle parserem přečte.
 *
 * DO REJSTŘÍKU NEJDE `Kontext`. Nasazuje se spolu s appkou, takže by user agent,
 * zaplnění úložiště a zachycené chyby skončily veřejně na webu. Nadpisy a popisy
 * ano – ty jsou stejně commitnuté ve veřejném repozitáři.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath, ne ruční ořezávání – cesta obsahuje diakritiku („Anička“).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const { PRIORITY, STAVY, TYPY, MODULY } = await import('../src/core/debug.js')
const { VERZE_FORMATU } = await import('../src/core/debugExport.js')

/** Popisek → id. V `.md` jsou popisky, v appce se pracuje s id. */
const podlePopisku = (seznam) => new Map(seznam.map((x) => [x.popisek.toLowerCase(), x.id]))
const TYP_PODLE = podlePopisku(TYPY)
const PRIO_PODLE = podlePopisku(PRIORITY)
const STAV_PODLE = podlePopisku(STAVY)
const MODUL_PODLE = podlePopisku(MODULY)

/** Autor z `id`: `tadeas-z-014` → `tadeas-z`. Číslo je vždy poslední skupina. */
const autorZId = (id) => String(id).replace(/-\d+$/, '')

/** Ořízne na rozumnou délku – rejstřík se nasazuje s appkou a nemá bobtnat. */
const zkrat = (s, n = 400) => {
  const t = String(s || '').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

/** Obsah sekce `**Nadpis**` až po další `**Nadpis**` nebo konec. */
function sekce(text, nadpis) {
  const i = text.indexOf(`**${nadpis}**\n`)
  if (i < 0) return ''
  const zbytek = text.slice(i + nadpis.length + 5)
  const konec = zbytek.search(/\n\*\*[^*]+\*\*/)
  return (konec < 0 ? zbytek : zbytek.slice(0, konec)).trim()
}

/** Jedna sekce `.md` → záznam rejstříku, nebo null když hlavička nesedí. */
function zaznamZeSekce(kus, soubor) {
  const hlavicka = /^##\s+(\S+)\s+·\s+\S+\s+(.+?)\s+·\s+priorita:\s*(.+?)\s+·\s+stav:\s*(.+?)\s*$/m.exec(kus)
  if (!hlavicka) return null
  const [, id, typ, priorita, stav] = hlavicka

  const nadpis = (/^###\s+(.*)$/m.exec(kus) || [, ''])[1].trim()
  const moduly = (/^\*\*Moduly:\*\*\s*(.*)$/m.exec(kus) || [, ''])[1]
    .split(',')
    .map((m) => MODUL_PODLE.get(m.trim().toLowerCase()) || '')
    .filter(Boolean)

  return {
    id,
    autor: autorZId(id),
    typ: TYP_PODLE.get(typ.toLowerCase()) || 'poznamka',
    nadpis,
    moduly,
    priorita: PRIO_PODLE.get(priorita.toLowerCase()) || 'stredni',
    stav: STAV_PODLE.get(stav.toLowerCase()) || 'nove',
    soubor,
    popis: zkrat(sekce(kus, 'Popis')),
    navrh: zkrat(sekce(kus, 'Návrh řešení')),
    zdroj: 'export',
  }
}

/** Rozebere jeden exportovaný `.md`. První kus je hlavička souboru, ne záznam. */
export function zaznamyZeSouboru(text, soubor) {
  // VERZE FORMÁTU z hlavičky. Chybějící řádek znamená verzi 1 – tak vypadaly
  // soubory před srpnem 2026 a musí jít číst dál. Vyšší neznámá verze se
  // NESMÍ tiše přeskočit: záznamy by z rejstříku zmizely a autor by u nich
  // v appce viděl „nedorazilo“, což by byla lež o něčem, co v repozitáři leží.
  const hlavicka = text.split(/\n---\n/)[0]
  const verze = Number((/^Form[áa]t:\s*(\d+)\s*$/m.exec(hlavicka) || [, 1])[1])
  if (verze > VERZE_FORMATU) {
    throw new Error(
      `${soubor}: formát ${verze}, ale tenhle skript umí nejvýš ${VERZE_FORMATU}. ` +
        'Aktualizuj repozitář, jinak ten soubor nikdo nepřečte.'
    )
  }
  return text
    .split(/\n---\n/)
    .slice(1)
    .map((kus) => zaznamZeSekce(kus, soubor))
    .filter(Boolean)
}

/** Rozebere `VYRESENO.md`. Řádky, které tvaru neodpovídají, se tiše přeskočí. */
export function vyreseneZeSouboru(text) {
  const ven = []
  for (const radek of String(text || '').split('\n')) {
    const m = /^-\s+`([^`]+)`\s+·\s+(\d{4}-\d{2}-\d{2})\s+·\s+(\S+)\s*(?:·\s*(.*))?$/.exec(radek.trim())
    if (!m) continue
    const [, id, dne, stav, poznamka] = m
    ven.push({
      id,
      autor: autorZId(id),
      stav: STAV_PODLE.get(stav.toLowerCase()) || 'hotovo',
      vyresenoDne: dne,
      poznamka: zkrat(poznamka || '', 200),
      zdroj: 'vyreseno',
    })
  }
  return ven
}

/**
 * Jak dlouho se uzavřený záznam ještě nasazuje s aplikací. Půl roku je
 * s rezervou dost na to, aby ho autor uviděl i po dlouhé pauze – a přitom
 * rejstřík neroste donekonečna.
 */
export const PLATNOST_UZAVRENYCH = 180 * 24 * 3600 * 1000

/** Stáří data `2026-09-02` v ms. Neplatné datum se bere jako čerstvé. */
function stari(iso, ted) {
  const kdy = Date.parse(`${iso}T00:00:00Z`)
  return Number.isFinite(kdy) ? ted - kdy : 0
}

/**
 * Postaví rejstřík z celé složky.
 *
 * Chybějící složka je platný stav – na čerstvém klonu ještě neexistuje a build
 * se kvůli tomu nesmí zastavit.
 *
 * `vygenerovano` je tam kvůli jedinému, ale důležitému rozlišení: záznam, který
 * odešel z telefonu, ale v rejstříku není, může být buď **ještě nenasazený**
 * (export se zatím nedostal do gitu), nebo **odstraněný bez řádku ve
 * `VYRESENO.md`** (porušená konvence). Bez času vzniku rejstříku by appka
 * musela hádat a v prvním případě by strašila.
 *
 * @param {string} [korenDebug]
 * @param {number} [ted]  čas vzniku rejstříku (ms); parametr kvůli testovatelnosti
 * @returns {{vygenerovano: string, zaznamy: Array<Record<string, any>>}}
 */
export function postavRejstrik(korenDebug = path.join(ROOT, 'debug'), ted = Date.now()) {
  const vygenerovano = new Date(ted).toISOString()
  if (!fs.existsSync(korenDebug)) return { vygenerovano, zaznamy: [] }

  const soubory = fs
    .readdirSync(korenDebug, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.md') && d.name !== 'VYRESENO.md')
    .map((d) => d.name)
    .sort()

  const podleId = new Map()
  for (const jmeno of soubory) {
    const text = fs.readFileSync(path.join(korenDebug, jmeno), 'utf8')
    for (const z of zaznamyZeSouboru(text, jmeno)) podleId.set(z.id, z)
  }

  // Uzavřené přepisují otevřené: záznam může být omylem v obou (někdo zapsal
  // řádek do VYRESENO.md, ale zapomněl ho z `.md` vyhodit) a v takovém sporu
  // je pravdivější „vyřešeno" – k tomu je potřeba vědomá akce.
  const vyresenyPath = path.join(korenDebug, 'VYRESENO.md')
  if (fs.existsSync(vyresenyPath)) {
    for (const v of vyreseneZeSouboru(fs.readFileSync(vyresenyPath, 'utf8'))) {
      // STARÉ UZAVŘENÉ SE DO REJSTŘÍKU NEBEROU. `VYRESENO.md` se nikdy
      // nezkracuje, takže by každý kdy zavřený záznam jel v `debug-stav.json`
      // napořád – a ten se stahuje SÍTÍ NAPŘED při každém startu appky.
      // Po roce by si každý při každém otevření tahal seznam všeho, co kdy
      // bylo hotové. Řádek v souboru zůstává jako historie, jen se nenasazuje.
      //
      // Že se tím nikomu nepřepne zavřený záznam na „zmizelo": appka si
      // uzavření pamatuje sama (`zavreno` v `src/core/debug.js`), jakmile ho
      // jednou v rejstříku uvidí.
      if (stari(v.vyresenoDne, ted) > PLATNOST_UZAVRENYCH) continue
      const puvodni = podleId.get(v.id)
      podleId.set(v.id, puvodni ? { ...puvodni, ...v } : v)
    }
  }

  return { vygenerovano, zaznamy: [...podleId.values()] }
}

/* ---------- spuštění z příkazové řádky ---------- */

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const barvy = process.stdout.isTTY && !process.env.NO_COLOR
  const zeleny = (s) => (barvy ? `\x1b[32m${s}\x1b[0m` : s)
  const cerveny = (s) => (barvy ? `\x1b[31m${s}\x1b[0m` : s)
  const seda = (s) => (barvy ? `\x1b[2m${s}\x1b[0m` : s)

  const { zaznamy } = postavRejstrik()
  const otevrene = zaznamy.filter((z) => z.zdroj === 'export' && z.stav !== 'hotovo' && z.stav !== 'zahozeno')
  const uzavrene = zaznamy.filter((z) => z.zdroj === 'vyreseno')

  if (process.argv.includes('--vypis')) {
    // KONTROLA ČERSTVOSTI PATŘÍ JEN SEM, nikdy do `postavRejstrik()`. Tu volá
    // `pluginDebugRejstrik` ve `vite.config.js` při každém buildu – síťové
    // volání uvnitř by znamenalo build závislý na síti.
    //
    // Dynamický import ze stejného důvodu: takhle se modul se `child_process`
    // do buildu ani nenačte. Výpis je vstupní bod triáže, takže je to zároveň
    // to nejdůležitější místo, kde má být vidět, že složka není aktuální –
    // poznámky commituje Worker rovnou na `main`, i bez cizího pushe.
    const { varovani, zkontrolujCerstvost } = await import('./debug-cerstvost.mjs')
    const c = zkontrolujCerstvost()
    if (c.stav === 'pozadu') console.log(`\n${cerveny(varovani(c))}`)
    else if (c.stav === 'nezname') console.log(`\n${seda(varovani(c))}`)

    console.log(`\nOtevřené záznamy (${otevrene.length})\n`)
    for (const z of otevrene) {
      console.log(`  ${z.id.padEnd(16)} ${z.typ.padEnd(9)} ${z.priorita.padEnd(8)} ${z.nadpis}`)
      console.log(seda(`  ${' '.repeat(16)} ${z.soubor}${z.popis ? ` · ${z.popis.split('\n')[0].slice(0, 70)}` : ''}`))
    }
    if (!otevrene.length) console.log(seda('  nic – složka debug/ je prázdná nebo je všechno vyřešené'))
    console.log(`\nUzavřené (${uzavrene.length})\n`)
    for (const z of uzavrene) {
      console.log(seda(`  ${z.id.padEnd(16)} ${z.vyresenoDne} ${z.stav.padEnd(9)} ${z.poznamka}`))
    }
    console.log('')
  }

  console.log(zeleny(`${zaznamy.length} záznamů v rejstříku (${otevrene.length} otevřených, ${uzavrene.length} uzavřených)`))
}
