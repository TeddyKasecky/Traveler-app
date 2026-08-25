/**
 * Prohlížeč debug poznámek – malý tracker, ne jen archiv.
 *
 * PROČ TRACKER: zapsaná poznámka je k něčemu jen tehdy, když se k ní někdo
 * vrátí. Bez stavu a priority by se z toho stal seznam, do kterého se přidává
 * a nikdy neubírá – přesně to, co se stalo `NAPADY.md`.
 *
 * PROČ NENÍ ŠESTOU ZÁLOŽKOU: spodní pilulka má pět položek roztažených na
 * stejnou šířku a šestá se na úzkém telefonu nevejde čitelně. Otevírá se
 * z Nastavení; zaregistrovaná je jako normální záložka, takže funguje adresa
 * `#debug` i tlačítko zpět – stejně jako Profil a Nastavení.
 *
 * ÚPRAVA ZÁZNAMU JE TÝŽ FORMULÁŘ jako zápis (`components/debugZapis.js`).
 * Dvě samostatné obrazovky by se do měsíce rozešly.
 *
 * Filtry drží tenhle modul v paměti, ne `prefs`: je to volba na deset vteřin,
 * ne nastavení. Po zavření obrazovky se zapomenou schválně.
 */

import { esc, sklonuj } from '../../core/html.js'
import { IC } from '../../icons/sprite.js'
import { cislaRada, pilulky, sekce } from '../../components/vzory.js'
import { potvrd } from '../../components/dialog.js'
import { toast } from '../../components/toast.js'
import { otevriDebugZapis } from '../../components/debugZapis.js'
import {
  MODULY,
  PRIORITY,
  STAVY,
  TYPY,
  debugData,
  filtrujZaznamy,
  popisekModulu,
  smazZaznamy,
  typZaznamu,
  ulozDebug,
} from '../../core/debug.js'

/** Aktivní filtry. Prázdná hodnota = neuplatní se. */
const F = { typ: '', modul: '', stav: '', priorita: '' }

/** Zaškrtnuté záznamy pro hromadné akce. Set, ne pole – testuje se členství. */
const vybrane = new Set()

/** Krátké datum „24. 8." – rok se dopisuje jen u starších záznamů. */
function datum(ms) {
  const d = new Date(ms)
  const letos = new Date().getFullYear()
  return `${d.getDate()}. ${d.getMonth() + 1}.${d.getFullYear() === letos ? '' : ` ${d.getFullYear()}`}`
}

/** Jednořádková ukázka textu. Delší v seznamu stejně nikdo nečte. */
const zkratka = (t, n = 90) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim()
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/**
 * Řádek seznamu.
 *
 * Nepoužívá `radek()` ze `vzory.js`: ten počítá s náhledem 76×76 vlevo
 * a pevnou výškou, což je díl pro místa s fotkou. Tady vlevo stojí
 * zaškrtávátko a řádek musí unést dva až tři řádky textu.
 */
function radekZaznamu(z) {
  const t = typZaznamu(z.typ)
  const zaskrtnuty = vybrane.has(z.id)
  const stitky = (z.moduly || []).map(popisekModulu).join(' · ')

  return `<div class="dzr${zaskrtnuty ? ' vybrany' : ''}" data-id="${z.id}">
    <button class="dzr-check" role="checkbox" aria-checked="${zaskrtnuty}" data-check="${z.id}"
      aria-label="Vybrat ${z.id}">${zaskrtnuty ? IC('i-check') : ''}</button>
    <button class="dzr-telo" data-otevri="${z.id}">
      <div class="dzr-hd">
        ${IC(t.ikona)}
        <span class="dz-id">${z.id}</span>
        <b>${esc(z.nadpis)}</b>
      </div>
      ${z.text ? `<div class="dzr-text">${esc(zkratka(z.text))}</div>` : ''}
      <div class="dzr-meta">
        <span class="dz-znacka ${z.stav}">${esc(stavPopisek(z.stav))}</span>
        <span class="dz-znacka ${z.priorita}">${esc(prioPopisek(z.priorita))}</span>
        ${stitky ? `<span class="dzr-moduly">${esc(stitky)}</span>` : ''}
        <span class="dzr-datum">${datum(z.vytvoreno)}</span>
      </div>
    </button>
  </div>`
}

const stavPopisek = (id) => (STAVY.find((s) => s.id === id) || { popisek: id }).popisek
const prioPopisek = (id) => `priorita ${(PRIORITY.find((p) => p.id === id) || { popisek: id }).popisek}`

/** Filtr jako řada pilulek. `vse` je první a znamená „bez omezení". */
function filtrRada(klic, polozky, popisekVse) {
  return pilulky(
    [
      { id: '', popisek: popisekVse, on: !F[klic] },
      ...polozky.map((p) => ({ id: p.id, popisek: p.popisek, on: F[klic] === p.id })),
    ],
    `vodorovne dzf-${klic}`
  )
}

export function renderDebug() {
  const wrap = document.getElementById('debugInner')
  if (!wrap) return

  const vse = debugData.zaznamy
  const videt = filtrujZaznamy(F)
  // Výběr se musí očistit o to, co je zrovna odfiltrované nebo smazané –
  // jinak by „smazat vybrané" sáhlo i na záznamy, které nejsou vidět.
  for (const id of [...vybrane]) if (!videt.some((z) => z.id === id)) vybrane.delete(id)

  const otevrenych = vse.filter((z) => z.stav !== 'hotovo' && z.stav !== 'zahozeno').length

  wrap.innerHTML = `
    <h2 class="nadpis-obrazovky">${IC('i-brouk')}Poznámkovač</h2>
    <div class="meta" style="margin:0 2px 12px">Nápady, bugy a poznámky zapsané za běhu appky. Zůstávají jen v tomhle telefonu, dokud je nevyexportuješ.</div>

    ${cislaRada([
      { ikona: 'i-quill', hodnota: String(vse.length), popisek: 'záznamů' },
      { ikona: 'i-clock', hodnota: String(otevrenych), popisek: 'otevřených' },
      { ikona: 'i-check', hodnota: String(vse.length - otevrenych), popisek: 'odbytých' },
    ])}

    ${sekce('Filtr', { pozn: `${videt.length} ${sklonuj(videt.length, 'záznam', 'záznamy', 'záznamů')}` })}
    ${filtrRada('typ', TYPY, 'Vše')}
    ${filtrRada('stav', STAVY, 'Každý stav')}
    ${filtrRada('priorita', PRIORITY, 'Každá priorita')}
    ${filtrRada('modul', MODULY, 'Všechny části')}

    <div class="dzr-lista">
      <button class="btn small" id="dzVse">${vybrane.size >= videt.length && videt.length ? 'Zrušit výběr' : 'Vybrat vše z filtru'}</button>
      <button class="btn small nebezpecne" id="dzSmaz"${vybrane.size ? '' : ' disabled'}>Smazat vybrané${vybrane.size ? ` (${vybrane.size})` : ''}</button>
    </div>

    ${
      videt.length
        ? `<div class="dzr-seznam">${videt.map(radekZaznamu).join('')}</div>`
        : `<div class="dzr-prazdno">${IC('i-brouk')}<div>${
            vse.length ? 'Tomuhle filtru nic neodpovídá.' : 'Zatím nic. Zapiš první poznámku kolečkem v hlavičce.'
          }</div></div>`
    }

    <div class="btnrow" style="margin-top:16px">
      <button class="btn primary" id="dzNovy">${IC('i-plus')}Zapsat poznámku</button>
    </div>
    <div style="height:20px"></div>`

  napoj(videt)
}

function napoj(videt) {
  for (const [klic] of Object.entries(F)) {
    for (const b of document.querySelectorAll(`.dzf-${klic} .pilulka`)) {
      b.onclick = () => {
        F[klic] = b.dataset.id
        renderDebug()
      }
    }
  }

  for (const b of document.querySelectorAll('[data-check]')) {
    b.onclick = () => {
      const id = b.dataset.check
      if (vybrane.has(id)) vybrane.delete(id)
      else vybrane.add(id)
      renderDebug()
    }
  }

  for (const b of document.querySelectorAll('[data-otevri]')) {
    b.onclick = () => otevriDebugZapis(b.dataset.otevri)
  }

  document.getElementById('dzVse').onclick = () => {
    // Jedno tlačítko pro obojí: „vybrat vše z aktuálního filtru" a „zrušit".
    // Dvě tlačítka vedle sebe by se pletla, protože jedno z nich je vždycky
    // bez efektu.
    if (vybrane.size >= videt.length && videt.length) vybrane.clear()
    else for (const z of videt) vybrane.add(z.id)
    renderDebug()
  }

  const smaz = document.getElementById('dzSmaz')
  if (!smaz.disabled) {
    smaz.onclick = async () => {
      const n = vybrane.size
      const dal = await potvrd({
        nadpis: `Smazat ${n} ${sklonuj(n, 'záznam', 'záznamy', 'záznamů')}?`,
        text: 'Z telefonu zmizí nadobro. Co už jsi vyexportoval do repozitáře, tam zůstává.',
        ano: 'Smazat',
        nebezpecne: true,
      })
      if (!dal) return
      smazZaznamy([...vybrane])
      vybrane.clear()
      if (!ulozDebug()) return toast('Smazání se neuložilo – v telefonu došlo místo')
      toast(`Smazáno ${n} ${sklonuj(n, 'záznam', 'záznamy', 'záznamů')}`)
      renderDebug()
    }
  }

  document.getElementById('dzNovy').onclick = () => otevriDebugZapis()
}
