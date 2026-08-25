/**
 * Rychlý zápis nápadu, bugu nebo poznámky za běhu appky.
 *
 * VŮDČÍ PRINCIP: zápis musí jít udělat za deset vteřin jednou rukou v autě.
 * Vždycky vidět jsou proto jen čtyři věci – typ, nadpis, text a moduly –
 * a všechno ostatní je pod „Víc podrobností". Detail nedodává uživatel psaním,
 * ale appka sběrem (`core/debugKontext.js`).
 *
 * PROČ SE AUTOR PTÁ TADY, A NE AŽ PŘI EXPORTU: `id` záznamu (`tadeas-014`)
 * vzniká v okamžiku zápisu a nikdy se nemění – odkazuje se na něj v konverzaci
 * s AI i v commitech. Kdyby se autor doplňoval až při exportu, musela by se
 * všechna dosud zapsaná id přejmenovat, a to je přesně to, co se nesmí.
 *
 * JEDEN FORMULÁŘ, DVĚ ROLE: `otevriDebugZapis()` bez id zakládá nový záznam,
 * s id upravuje existující (z prohlížeče v `views/debug/`). Dvě samostatné
 * obrazovky by se do měsíce rozešly – přesně jak se to stalo akcím výpravy,
 * které do srpna 2026 existovaly ve dvou nezávislých kódech.
 *
 * Panel je nad všemi ostatními (z-index 1370): zapisuje se i z otevřeného
 * detailu místa nebo z Plánu a nikoho nesmí nutit nejdřív něco zavírat.
 */

import { registrujOverlay } from '../core/router.js'
import { prefs, savePrefs, S, emit } from '../core/store.js'
import { esc } from '../core/html.js'
import { IC } from '../icons/sprite.js'
import { segment, pilulky } from './vzory.js'
import { napojTah, svih } from './tah.js'
import { toast } from './toast.js'
import { oznam, zadej } from './dialog.js'
import { jeOtevreny as jeOtevrenyDetail } from './sheet.js'
import {
  JAK_CASTO,
  MODULY,
  PRIORITY,
  STAVY,
  TYPY,
  debugData,
  najdiZaznam,
  pridejZaznam,
  sanitizujAutora,
  ulozDebug,
  upravZaznam,
} from '../core/debug.js'
import { pocetChyb } from '../core/chyby.js'
import { sberKontext } from '../core/debugKontext.js'

const el = () => document.getElementById('debugZapis')
const telo = () => document.getElementById('debugZapisBody')

export const jeOtevrenyDebugZapis = () => !!el() && el().classList.contains('show')

/** Rozepsaný stav formuláře. Jen v paměti – zavření je vědomé zahození. */
let koncept = null

/** Id upravovaného záznamu, nebo null pro nový. */
let upravujeSe = null

/** Prázdný záznam s předvyplněnými moduly podle toho, odkud se otevřelo. */
function prazdnyKoncept() {
  return {
    typ: 'napad',
    nadpis: '',
    text: '',
    moduly: predvyplneneModuly(),
    navrh: '',
    cekal: '',
    kroky: '',
    jakCasto: '',
    motivace: '',
    hotovoKdyz: '',
    priorita: 'stredni',
    stav: 'nove',
    podrobnosti: false,
    pripnoutChyby: false,
  }
}

/**
 * Které moduly zaškrtnout podle toho, kde uživatel zrovna je.
 *
 * Otevřený detail místa má přednost před záložkou pod ním – kdo píše hlášení
 * s otevřeným detailem, píše skoro vždycky o něm, ne o mapě za ním.
 */
function predvyplneneModuly() {
  if (jeOtevrenyDetail()) return ['detail']
  const podleTabu = MODULY.find((m) => m.zTabu === S.activeTab)
  return podleTabu ? [podleTabu.id] : []
}

/** Název obrazovky do kontextu – stejná úvaha jako u předvyplnění modulů. */
const obrazovkaProKontext = () => (jeOtevrenyDetail() ? 'Detail místa' : '')

/* ================= vykreslení ================= */

/** Textové pole s popiskem. `viceradkove` rozhoduje mezi input a textarea. */
function pole(klic, popisek, { viceradkove = false, radky = 3, napoveda = '' } = {}) {
  const v = esc(koncept[klic])
  return `<div class="fgroup">
    <label for="dz-${klic}">${esc(popisek)}</label>
    ${
      viceradkove
        ? `<textarea class="afarea" id="dz-${klic}" data-pole="${klic}" rows="${radky}">${v}</textarea>`
        : `<input class="wsel" id="dz-${klic}" data-pole="${klic}" type="text" value="${v.replace(/"/g, '&quot;')}" autocomplete="off">`
    }
    ${napoveda ? `<div class="dz-napoveda">${esc(napoveda)}</div>` : ''}
  </div>`
}

/** Doplňující pole podle typu. Poznámka žádná nemá – a je to tak správně. */
function podlaTypu() {
  if (koncept.typ === 'bug') {
    return (
      pole('cekal', 'Co jsem čekal', { viceradkove: true, radky: 2 }) +
      pole('kroky', 'Kroky k zopakování', { viceradkove: true, radky: 3, napoveda: 'Klidně po řádcích, 1. 2. 3.' }) +
      `<div class="fgroup"><label>Jak často</label>${segment(JAK_CASTO, koncept.jakCasto, 'dzCasto')}</div>`
    )
  }
  if (koncept.typ === 'napad') {
    return (
      pole('motivace', 'K čemu to je', { viceradkove: true, radky: 2, napoveda: 'Co tím získáme.' }) +
      pole('hotovoKdyz', 'Hotovo když…', { viceradkove: true, radky: 2, napoveda: 'Podle čeho se pozná, že je to hotové.' })
    )
  }
  return ''
}

/**
 * Sbalený přehled toho, co appka připne.
 *
 * Uživatel musí vidět, co odchází, a smět to odmítnout – proto přepínač
 * u zachycených chyb. Kontext se schválně nevypisuje celý: nesmí přebít
 * vlastní text záznamu, což je ta jediná věc, kterou nikdo jiný nedodá.
 */
function kontextBlok() {
  const n = pocetChyb()
  return `<div class="dz-kontext">
    <div class="dz-kontext-hd">${IC('i-sliders')}<span>Appka přibalí</span></div>
    <div class="dz-kontext-vypis">obrazovku a filtry · verzi buildu a cache · online/offline
      a typ mapy · rozměr okna a zařízení · zaplnění úložiště</div>
    <button class="toggle${koncept.pripnoutChyby ? ' on' : ''}" id="dzChyby"${n ? '' : ' disabled'}>
      ${IC('i-brouk')}<span>${n ? `Připnout ${n} zachycených chyb` : 'Žádné zachycené chyby'}</span>
    </button>
  </div>`
}

function vykresli() {
  const upravuje = !!upravujeSe
  telo().innerHTML = `
    <div class="dz-hlava">
      <h2>${IC('i-brouk')}${upravuje ? `Úprava ${esc(upravujeSe)}` : 'Zapsat poznámku'}</h2>
      <div class="dz-sub">${
        upravuje
          ? 'Text a stav jdou měnit, identita záznamu ne.'
          : 'Stačí typ, nadpis a pár slov. Zbytek si appka doplní sama.'
      }</div>
    </div>

    <div class="fgroup"><label>Typ</label>${segment(TYPY, koncept.typ, 'dzTyp')}</div>

    ${pole('nadpis', 'Nadpis')}
    ${pole('text', 'Co se stalo / co mě napadlo', { viceradkove: true, radky: 3 })}

    <div class="fgroup">
      <label>Čeho se to týká</label>
      ${pilulky(
        MODULY.map((m) => ({ id: m.id, popisek: m.popisek, on: koncept.moduly.includes(m.id) })),
        'vodorovne dz-moduly'
      )}
    </div>

    <button class="dz-vic${koncept.podrobnosti ? ' on' : ''}" id="dzVic">
      ${IC('i-sipka')}<span>Víc podrobností</span>
    </button>
    <div class="dz-podrobnosti"${koncept.podrobnosti ? '' : ' hidden'}>
      ${podlaTypu()}
      ${pole('navrh', 'Návrh řešení', {
        viceradkove: true,
        radky: 2,
        napoveda: 'Drží se v exportu odděleně od popisu, ať AI pozná odhad od pozorování.',
      })}
      <div class="fgroup"><label>Priorita</label>${segment(PRIORITY, koncept.priorita, 'dzPrio')}</div>
      ${upravuje ? `<div class="fgroup"><label>Stav</label>${segment(STAVY, koncept.stav, 'dzStav')}</div>` : ''}
    </div>

    ${kontextBlok()}

    <div class="btnrow dz-akce">
      <button class="btn" id="dzZrus">Zrušit</button>
      <button class="btn primary" id="dzUloz">${upravuje ? 'Uložit změny' : 'Zapsat'}</button>
    </div>`

  napoj()
}

/* ================= obsluha ================= */

/** Segmentový přepínač: zapíše do konceptu a překreslí, protože mění pole níž. */
function napojSegment(id, klic, prekreslit) {
  const obal = document.getElementById(id)
  if (!obal) return
  for (const b of obal.querySelectorAll('button')) {
    b.onclick = () => {
      // Druhé ťuknutí na tutéž volbu ji u „Jak často" zruší – je nepovinná.
      koncept[klic] = klic === 'jakCasto' && koncept[klic] === b.dataset.seg ? '' : b.dataset.seg
      if (prekreslit) return vykresli()
      for (const x of obal.querySelectorAll('button')) x.classList.toggle('on', x.dataset.seg === koncept[klic])
    }
  }
}

function napoj() {
  // Psaní zapisuje do konceptu, ale NEPŘEKRESLUJE – pod rukama by se měnil
  // text a kurzor by skákal na konec. Stejný důvod má `onblur` v addForm.js.
  for (const p of telo().querySelectorAll('[data-pole]')) {
    p.oninput = () => {
      koncept[p.dataset.pole] = p.value
    }
  }

  // Typ mění, která doplňující pole se ukazují – překreslit se musí.
  napojSegment('dzTyp', 'typ', true)
  napojSegment('dzPrio', 'priorita', false)
  napojSegment('dzStav', 'stav', false)
  napojSegment('dzCasto', 'jakCasto', false)

  for (const b of telo().querySelectorAll('.dz-moduly .pilulka')) {
    b.onclick = () => {
      const id = b.dataset.id
      koncept.moduly = koncept.moduly.includes(id) ? koncept.moduly.filter((x) => x !== id) : [...koncept.moduly, id]
      b.classList.toggle('on', koncept.moduly.includes(id))
    }
  }

  document.getElementById('dzVic').onclick = () => {
    koncept.podrobnosti = !koncept.podrobnosti
    vykresli()
  }

  const chyby = document.getElementById('dzChyby')
  if (chyby && !chyby.disabled) {
    chyby.onclick = () => {
      koncept.pripnoutChyby = !koncept.pripnoutChyby
      chyby.classList.toggle('on', koncept.pripnoutChyby)
    }
  }

  document.getElementById('dzZrus').onclick = () => zavriDebugZapis()
  document.getElementById('dzUloz').onclick = () => uloz()
}

/**
 * Zeptá se na identifikátor autora, když ještě žádný není.
 *
 * Předvyplní se ze jména v Profilu, protože ho tam většina lidí má – a je to
 * jediná chvíle, kdy se na tohle ptáme.
 *
 * @returns {Promise<string|null>} null = uživatel zrušil, zápis se nedokončí
 */
async function zajistiAutora() {
  if (prefs.debugAutor) return prefs.debugAutor
  const navrh = sanitizujAutora(prefs.userName || '')
  const zadane = await zadej({
    nadpis: 'Kdo píše?',
    text:
      'Krátká přezdívka bez diakritiky. Bude v identifikátoru každého záznamu ' +
      '(např. tadeas-014) i v názvu exportovaného souboru, takže se ptáme jen jednou.',
    vychozi: navrh === 'autor' ? '' : navrh,
    placeholder: 'tadeas',
    ano: 'Uložit',
  })
  if (zadane === null) return null
  prefs.debugAutor = sanitizujAutora(zadane)
  if (!savePrefs()) {
    await oznam({
      nadpis: 'Nastavení se neuložilo',
      text: 'Přezdívka se nedala zapsat – v telefonu nejspíš došlo místo. Zkus uvolnit paměť a napiš to znovu.',
    })
    return null
  }
  return prefs.debugAutor
}

async function uloz() {
  if (!koncept.nadpis.trim()) {
    await oznam({ nadpis: 'Chybí nadpis', text: 'Bez nadpisu se záznam v seznamu nedá poznat. Stačí pár slov.' })
    return
  }

  if (upravujeSe) {
    upravZaznam(upravujeSe, {
      typ: koncept.typ,
      nadpis: koncept.nadpis.trim(),
      text: koncept.text.trim(),
      moduly: [...koncept.moduly],
      navrh: koncept.navrh.trim(),
      cekal: koncept.cekal.trim(),
      kroky: koncept.kroky.trim(),
      jakCasto: koncept.jakCasto,
      motivace: koncept.motivace.trim(),
      hotovoKdyz: koncept.hotovoKdyz.trim(),
      priorita: koncept.priorita,
      stav: koncept.stav,
    })
    if (!ohlasZapis()) return
    const bylo = upravujeSe
    zavriDebugZapis()
    // Přes událost, ne přímým voláním: `components/` nemá vědět o obrazovkách.
    emit('debugZmena')
    toast(`Uloženo ${bylo}`)
    return
  }

  const autor = await zajistiAutora()
  if (!autor) return

  // Kontext se sbírá až tady: rozepsaná poznámka může ležet otevřená minuty
  // a zajímavý je stav v okamžiku odeslání, ne otevření formuláře.
  const kontext = await sberKontext({ obrazovka: obrazovkaProKontext(), chyby: koncept.pripnoutChyby })
  const zaznam = pridejZaznam({ ...koncept, kontext }, autor)

  if (!ohlasZapis()) {
    // Zápis do úložiště selhal – záznam se z paměti musí zase odebrat, jinak
    // by se při dalším pokusu uložil dvakrát a s ním i vyšší číslo.
    debugData.zaznamy.pop()
    debugData.dalsiCislo--
    return
  }
  zavriDebugZapis()
  emit('debugZmena')
  toast(`Zapsáno ${zaznam.id}`)
}

/**
 * Uloží a při neúspěchu to řekne. Vrací, jestli se to povedlo.
 *
 * Globální pruh `ulozeniSelhalo` se odsud schválně neposílá – ten nabízí
 * zálohu cestovních dat a u debug poznámky by mátl. Formulář místo toho
 * zůstane otevřený, takže se rozepsaný text neztratí.
 */
function ohlasZapis() {
  if (ulozDebug()) return true
  oznam({
    nadpis: 'Poznámka se neuložila',
    text:
      'V telefonu došlo místo. Formulář zůstává otevřený, takže o text nepřijdeš – ' +
      'uvolni paměť (Nastavení → Zálohy a data) a zkus to znovu.',
  })
  return false
}

/* ================= otevírání a zavírání ================= */

/**
 * Otevře formulář. Bez `id` zakládá nový záznam, s `id` upravuje existující.
 * @param {string|null} [id]
 */
export function otevriDebugZapis(id = null) {
  const panel = el()
  if (!panel) return

  upravujeSe = null
  koncept = prazdnyKoncept()

  if (id) {
    const z = najdiZaznam(id)
    if (!z) return
    upravujeSe = id
    koncept = {
      ...koncept,
      ...z,
      moduly: [...(z.moduly || [])],
      podrobnosti: true,
      // Chyby se u úpravy nepřipínají znovu – ty v záznamu jsou z okamžiku
      // zápisu a přepsat je dnešními by z kontextu udělalo lež.
      pripnoutChyby: false,
    }
  }

  vykresli()
  panel.classList.add('show')
  // Až po vysunutí: fokus během přechodu na mobilu panel poskočí.
  setTimeout(() => {
    const prvni = document.getElementById('dz-nadpis')
    if (prvni && !upravujeSe) prvni.focus()
  }, 260)
}

export function zavriDebugZapis() {
  const panel = el()
  if (!panel || !panel.classList.contains('show')) return false
  panel.classList.remove('show')
  koncept = null
  upravujeSe = null
  return true
}

/**
 * Naváže obsluhu. Volá se JEDNOU při startu z `main.js` – prvky jsou staticky
 * v `index.html`, takže překreslení obsahu obsluhu panelu nesmaže.
 */
export function initDebugZapis() {
  const panel = el()
  if (!panel) return

  document.getElementById('debugZapisZavri').onclick = () => zavriDebugZapis()

  // Stažení dolů zavírá, stejně jako u detailu místa. Táhne se za úchyt,
  // ne za tělo – to se roluje a tažení by se s rolováním pralo.
  const grip = panel.querySelector('.grip')
  napojTah(
    grip,
    (dy, rychlost) => {
      panel.classList.remove('tahne')
      panel.style.transform = ''
      if (svih(dy, rychlost, 1)) zavriDebugZapis()
    },
    (dy) => {
      panel.classList.toggle('tahne', dy > 0)
      panel.style.transform = dy > 0 ? `translateY(${dy}px)` : ''
    }
  )

  // Registruje se jako poslední z panelů, takže tlačítko zpět zavře nejdřív
  // jeho – otevírá se nad vším ostatním, tedy se musí i první zavřít.
  registrujOverlay({ jeOtevreny: jeOtevrenyDebugZapis, zavri: zavriDebugZapis })
}

/** Srovná viditelnost tlačítka v hlavičce podle přepínače v Nastavení. */
export function srovnejDebugTlacitko() {
  const b = document.getElementById('debugOpen')
  if (b) b.hidden = !prefs.debugRezim
}
