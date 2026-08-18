/**
 * Profil – čísla o tom, co má člověk za sebou, a nastavení.
 *
 * Obrazovka, kterou původní aplikace neměla. Vznikla podle grafického manuálu
 * (mockupy ve složce `grafika/`).
 *
 * PROČ NENÍ ŠESTOU ZÁLOŽKOU: spodní pilulka má pět položek roztažených na
 * stejnou šířku a šestá se na úzkém telefonu nevejde čitelně. Profil se proto
 * otevírá kolečkem v hlavičce (`#profilOpen`). Zaregistrovaný je ale jako
 * normální záložka, takže funguje adresa `#profil` i tlačítko zpět —
 * `core/router.js` snese záložku bez tlačítka v liště, protože si třídu `on`
 * jen zkouší nasadit a nikde nesedne.
 *
 * Nic si nepamatuje sám: všechno je ze `store` a `prefs`.
 */

import { S, store, PHOTOS, prefs, savePrefs } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { IC } from '../../icons/sprite.js'
import { toast } from '../../components/toast.js'
import { vyberAutaHtml, napojVyberAuta } from '../../components/vyberAuta.js'
import { zobrazPolohu } from '../../map/map.js'

/** Spočítá, co se dá říct o uživatelských datech. */
function cisla() {
  const stavy = Object.values(store.stav)
  return {
    mist: S.places.length,
    navstiveno: stavy.filter((x) => x === 'visited').length,
    chci: stavy.filter((x) => x === 'wish').length,
    vplanu: store.plan.length,
    poznamek: Object.values(store.notes).filter((t) => (t || '').trim()).length,
    hodnoceno: Object.keys(store.rating).length,
    fotek: Object.keys(PHOTOS).length,
    plaminku: Object.keys(store.prio).length,
    zemi: new Set(S.places.filter((p) => store.stav[p.id] === 'visited').map((p) => p.z)).size,
  }
}

/** Jedna dlaždice s číslem. */
const dlazdice = (hodnota, popis) => `<div class="pstat"><b>${hodnota}</b><span>${esc(popis)}</span></div>`

export function renderProfil() {
  const wrap = document.getElementById('profilInner')
  if (!wrap) return
  const c = cisla()

  // Kolik z navštívených míst tvoří celek – jen jako pruh, ne jako procento
  // do textu: u 580 míst by to bylo pořád „0 %“ a působilo by to nemile.
  const podil = c.mist ? Math.min(100, Math.round((c.navstiveno / c.mist) * 100)) : 0

  wrap.innerHTML = `
    <div class="phead">
      <div class="pavatar">${IC('i-profil')}</div>
      <div>
        <h2>${prefs.userName ? esc(prefs.userName) : 'Tvůj vandrbuch'}</h2>
        <div class="meta">${c.navstiveno} navštíveno · ${c.zemi} ${c.zemi === 1 ? 'země' : c.zemi >= 2 && c.zemi <= 4 ? 'země' : 'zemí'}</div>
      </div>
    </div>

    <div class="ppruh"><span style="width:${podil}%"></span></div>

    <div class="sechd">${IC('i-flag')}Co máš za sebou</div>
    <div class="pstats">
      ${dlazdice(c.navstiveno, 'navštíveno')}
      ${dlazdice(c.chci, 'uložených')}
      ${dlazdice(c.vplanu, 'v plánu')}
      ${dlazdice(c.poznamek, 'poznámek')}
      ${dlazdice(c.hodnoceno, 'hodnocení')}
      ${dlazdice(c.fotek, 'vlastních fotek')}
    </div>

    <div class="sechd">${IC('i-quill')}Jméno</div>
    <div class="pradek">
      <input id="profilJmeno" type="text" placeholder="Jak ti máme říkat?" value="${esc(prefs.userName || '')}" maxlength="24">
    </div>
    <div class="meta" style="margin:6px 2px 0">Použije se v pozdravu na Domů. Nikam se neposílá.</div>

    <div class="sechd">${IC('i-van')}Čím jezdíme</div>
    <div class="meta" style="margin:0 2px 10px">Vybrané auto jezdí po mapě na místě tvé polohy.</div>
    ${vyberAutaHtml()}
  `

  // Jméno se ukládá při odchodu z políčka, ne při každém písmenu: savePrefs()
  // převádí celé předvolby na text a při psaní by to na mobilu sekalo. Stejný
  // důvod má saveOdlozene() u poznámek.
  // Po změně auta se hned přestaví značka polohy – ať je změna vidět bez
  // přepnutí na mapu a zpátky.
  napojVyberAuta(wrap, () => {
    zobrazPolohu()
    toast('Auto vybráno')
  })

  document.getElementById('profilJmeno').onblur = (e) => {
    const nove = e.target.value.trim()
    if (nove === (prefs.userName || '')) return
    prefs.userName = nove
    savePrefs()
    toast(nove ? `Budeme ti říkat ${nove}` : 'Jméno smazáno')
  }
}
