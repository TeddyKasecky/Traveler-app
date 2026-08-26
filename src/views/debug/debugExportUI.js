/**
 * Export debug záznamů – ovládání nad čistým `core/debugExport.js`.
 *
 * DVĚ CESTY VEDLE SEBE, obě musí fungovat:
 *   1. **Do repozitáře** – `.md` se stáhne, ručně uloží do složky `debug/`,
 *      commitne a pushne. Tím se dostane k oběma lidem i k AI, která si repo
 *      čte. Jeden soubor na export, ne na záznam: ukládat z telefonu třicet
 *      souborů zvlášť je nepoužitelné a AI přečte slepený soubor stejně dobře.
 *   2. **Odeslat** – jedno tlačítko předá hotový soubor systémovému sdílecímu
 *      menu. Tím se pokryje mail, Messenger, WhatsApp i uložení do souborů,
 *      aniž by appka cokoli z toho integrovala.
 *
 * PROČ JE ROZSAH SEGMENT NA OBRAZOVCE, A NE DIALOG: `navigator.share()` se
 * musí zavolat SYNCHRONNĚ v obsluze kliknutí, jinak ho prohlížeč zablokuje
 * jako akci mimo gesto uživatele (tatáž past, kvůli které `plan.js` otevírá
 * navigaci rovnou v handleru). Kdyby se rozsah vybíral dialogem, bylo by
 * před sdílením `await` a tlačítko by přestalo fungovat.
 *
 * PEVNÝ CÍL SE NEDĚLÁ. Zakládat rovnou GitHub issue by znamenalo token
 * v klientském kódu a repozitář je veřejný.
 */

import { prefs } from '../../core/store.js'
import { IC } from '../../icons/sprite.js'
import { stahniJson, stahniSoubor } from '../../core/csv.js'
import { segment } from '../../components/vzory.js'
import { oznam, potvrd } from '../../components/dialog.js'
import { toast } from '../../components/toast.js'
import {
  jsonZaloha,
  mdExport,
  nazevExportu,
  nazevZalohy,
  zalohaZeSouboru,
} from '../../core/debugExport.js'
import {
  VERZE_OTISKU,
  debugData,
  otiskZaznamu,
  slucZaznamy,
  ulozDebug,
  upravZaznam,
  zmenenoOdExportu,
} from '../../core/debug.js'
import { sediSRepem } from '../../core/debugExport.js'
import { stavZRepa } from '../../core/debugRejstrik.js'

const ROZSAHY = [
  { id: 'kodeslani', popisek: 'Nové a změněné' },
  { id: 'vybrane', popisek: 'Vybrané' },
  { id: 'vse', popisek: 'Vše' },
]

/** Zvolený rozsah. Jen v paměti – volba na deset vteřin, ne nastavení. */
let rozsah = 'kodeslani'

/**
 * Co repozitář ještě nemá: nikdy neodeslané a to, co se od odeslání změnilo.
 *
 * PROČ NE „nevyřešené“ (do srpna 2026): zavírá se až v repozitáři, takže
 * lokální `stav` skoro nikdy na „hotovo“ nepřejde – a rozsah tím pádem
 * posílal pokaždé znovu celý seznam. Pět záznamů skončilo ve dvanácti
 * kopiích ve čtyřech souborech za dva dny.
 *
 * ZÁZNAM ODESLANÝ, ALE ZATÍM NENASAZENÝ SE ZNOVU NEPOSÍLÁ. Appka nepozná
 * „necommitnuté“ od „nenasazené“ a soubor už jednou vznikl. Když se ztratí,
 * pozná se to podle stadia „nedorazilo“ a je od toho tlačítko Poslat znovu;
 * hrubá záchrana je rozsah „Vše“.
 */
export const kOdeslani = () =>
  debugData.zaznamy.filter((z) => !z.exportovanoDo || zmenenoOdExportu(z) || sediSRepem(z, stavZRepa(z.id)) === false)

/** Které záznamy zvolený rozsah pokrývá. */
function kExportu(vybrane) {
  if (rozsah === 'vse') return debugData.zaznamy.slice()
  if (rozsah === 'vybrane') return debugData.zaznamy.filter((z) => vybrane.has(z.id))
  return kOdeslani()
}

const popisekRozsahu = () => (ROZSAHY.find((r) => r.id === rozsah) || ROZSAHY[0]).popisek.toLowerCase()

/** Blok exportu do `renderDebug()`. Obsluhu věší `napojExport()`. */
export function exportHtml(vybrane) {
  const kolik = kExportu(vybrane).length
  return `
    <div class="sechd">${IC('i-sdilet')}Export</div>
    <div class="meta dz-uvod">
      Vznikne jeden soubor <code>.md</code>. <b>Stažením ani sdílením se nikam neodešle</b> –
      teprve když ho někdo uloží do složky <code>debug/</code> v repozitáři a <b>commitne
      a pushne</b>, dostane se k druhému člověku i k AI. Do appky se stav vrátí až s dalším
      nasazením: na betě po pushi na <code>main</code>, na produkci až vydáním.
      Postup je v <code>.claude/rules/debug.md</code>.
    </div>
    <div class="meta dz-uvod">
      <b>Repozitář i beta jsou veřejné.</b> Co do poznámky napíšeš, bude po
      commitnutí čitelné komukoli na GitHubu i na webu bety. Názvy výprav
      a cest se do exportu schválně neposílají — jen jejich velikost.
    </div>
    ${segment(
      ROZSAHY.map((r) => ({ ...r, popisek: r.id === 'vybrane' ? `Vybrané (${vybrane.size})` : r.popisek })),
      rozsah,
      'dzRozsah'
    )}
    <div class="meta" style="margin:8px 2px 8px">${
      kolik
        ? `K odeslání <b>${kolik}</b>. Po stažení se rovnou označí jako odeslané – bez toho se po týdnu nepozná, co už v repozitáři je.`
        : rozsah === 'kodeslani'
          ? 'Není co poslat: <b>repozitář má všechno</b>, co je v telefonu. Kdyby se soubor cestou ztratil, vezmi rozsah Vše.'
          : 'Není nic k odeslání – zkus jiný rozsah.'
    }</div>
    <div class="btnrow" style="margin:0">
      <button class="btn" id="dzMd"${kolik ? '' : ' disabled'}>${IC('i-save')}Stáhnout .md</button>
      <button class="btn primary" id="dzSdilet"${kolik ? '' : ' disabled'}>${IC('i-sdilet')}Sdílet</button>
    </div>

    <div class="sechd">${IC('i-save')}Záloha záznamů</div>
    <div class="meta dz-uvod">
      Aby se poznámky neztratily při přeinstalaci appky nebo změně adresy. Do běžné zálohy
      Vandrbuchu <b>nepatří</b> – ta je o cestách, tohle o vývoji. Načtení zálohy záznamy
      <b>slučuje, nepřepisuje</b>: co už v telefonu je, zůstane, jak je.
    </div>
    <div class="btnrow" style="margin:0">
      <button class="btn small" id="dzZaloha"${debugData.zaznamy.length ? '' : ' disabled'}>Stáhnout .json</button>
      <label class="btn small" style="cursor:pointer">${IC('i-up')}Načíst zálohu<input id="dzImport" type="file" accept=".json" hidden></label>
    </div>`
}

/**
 * Složí `.md` a jeho název. Synchronní schválně – volá se uvnitř obsluhy
 * kliknutí, ze které se sdílí.
 */
function pripravMd(zaznamy) {
  const ted = Date.now()
  const autor = prefs.debugAutor || 'autor'
  const nazev = nazevExportu(ted, autor)
  const text = mdExport(zaznamy, {
    autor,
    build: import.meta.env.VANDRBUCH_VERZE || 'dev',
    filtr: popisekRozsahu(),
    cas: ted,
  })
  return { text, nazev }
}

/**
 * Nabídne označení odeslaných záznamů.
 *
 * U záznamu se drží název souboru, ve kterém odešel – bez toho by se po
 * týdnu nedalo poznat, co už v repozitáři je a co ne. Označení je nabídka,
 * ne automatika: sdílení se dá na půl cesty zrušit a appka o tom neví.
 */
async function poExportu(nazev, zaznamy, prekresli) {
  // OZNAČUJE SE AUTOMATICKY, bez dotazu. Do srpna 2026 se ptal dialog
  // a odpověď „Teď ne“ byla druhá cesta, jak si vyrobit duplicitu: záznam
  // zůstal neoznačený a příští export ho poslal znovu. Zrušené sdílení se
  // pozná jinak – `navigator.share()` odmítne slib a sem se vůbec nedojde.
  // Čas odeslání se pamatuje kvůli rejstříku: záznam, který v něm chybí, může
  // být buď ještě nenasazený, nebo odstraněný bez řádku ve VYRESENO.md.
  const ted = Date.now()
  // Otisk podoby, která odešla. Bez něj by se pozdější úprava nedala poznat –
  // rejstřík na porovnání nestačí, viz `core/debug.js#otiskZaznamu()`.
  for (const z of zaznamy)
    upravZaznam(z.id, {
      exportovanoDo: nazev,
      exportovanoV: ted,
      // S verzí: až se změní, co se do otisku počítá, pozná se, který už
      // neplatí, a neobarví se všechny záznamy naráz jako změněné.
      otiskExportu: `${VERZE_OTISKU}:${otiskZaznamu(z)}`,
    })
  if (!(await ulozDebug())) return toast('Označení se neuložilo – v telefonu došlo místo')
  toast(`Označeno jako odeslané (${zaznamy.length})`)
  // Bez překreslení by štítek „odesláno" u řádku naskočil až při příštím
  // otevření obrazovky – vypadalo by to, že se označení neuložilo.
  prekresli()
}

/**
 * @param {Set<string>} vybrane  zaškrtnuté záznamy z prohlížeče
 * @param {() => void} prekresli
 */
export function napojExport(vybrane, prekresli) {
  for (const b of document.querySelectorAll('#dzRozsah button')) {
    b.onclick = () => {
      rozsah = b.dataset.seg
      prekresli()
    }
  }

  const md = document.getElementById('dzMd')
  if (md && !md.disabled) {
    md.onclick = () => {
      const zaznamy = kExportu(vybrane)
      const { text, nazev } = pripravMd(zaznamy)
      stahniSoubor(text, nazev, 'text/markdown')
      poExportu(nazev, zaznamy, prekresli)
    }
  }

  const sdil = document.getElementById('dzSdilet')
  if (sdil && !sdil.disabled) {
    // ŽÁDNÉ `await` před `navigator.share()` – viz hlavička souboru.
    sdil.onclick = () => {
      const zaznamy = kExportu(vybrane)
      const { text, nazev } = pripravMd(zaznamy)
      const soubor = new File([text], nazev, { type: 'text/markdown' })

      if (!navigator.canShare || !navigator.canShare({ files: [soubor] })) {
        // Desktopový prohlížeč ani jednosouborová varianta sdílení souborů
        // neumějí. Tiše spadnout na stažení je lepší než tlačítko, které nic
        // neudělá – výsledek je tentýž soubor, jen jinou cestou.
        stahniSoubor(text, nazev, 'text/markdown')
        toast('Sdílení tenhle prohlížeč neumí – soubor se stáhl')
        poExportu(nazev, zaznamy, prekresli)
        return
      }

      navigator
        .share({ files: [soubor], title: nazev })
        .then(() => poExportu(nazev, zaznamy, prekresli))
        // Zrušené sdílení je AbortError, ne chyba – mlčet je správná odpověď.
        .catch(() => {})
    }
  }

  const zaloha = document.getElementById('dzZaloha')
  if (zaloha && !zaloha.disabled) {
    zaloha.onclick = () => {
      const ted = Date.now()
      stahniJson(jsonZaloha(debugData.zaznamy, ted), nazevZalohy(ted))
      toast('Záloha stažená')
    }
  }

  const imp = document.getElementById('dzImport')
  if (imp) {
    imp.onchange = (e) => {
      const f = e.target.files[0]
      if (!f) return
      const rd = new FileReader()
      rd.onload = async () => {
        let zaznamy = null
        try {
          zaznamy = zalohaZeSouboru(JSON.parse(rd.result))
        } catch {
          zaznamy = null
        }
        if (!zaznamy) {
          oznam({
            nadpis: 'Tohle není záloha poznámkovače',
            text: 'Soubor nemá značku vandrbuch-debug. Záloha Vandrbuchu (vandrbuch-zaloha-….json) se obnovuje v Nastavení, ne tady.',
          })
          return
        }
        const { pridano, preskoceno, vadne } = slucZaznamy(zaznamy)
        if (!(await ulozDebug())) return toast('Import se neuložil – v telefonu došlo místo')
        // Vadné se hlásí schválně: spolknutý poškozený záznam by se v seznamu
        // ukázal jako „undefined“ a v exportu vyrobil polámanou hlavičku.
        const dovetek =
          (preskoceno ? `, ${preskoceno} už tu ${preskoceno === 1 ? 'byl' : 'bylo'}` : '') +
          (vadne ? `, ${vadne} ${vadne === 1 ? 'poškozený' : 'poškozených'} přeskočeno` : '')
        toast(pridano ? `Načteno ${pridano}${dovetek}` : `Nic nového${dovetek}`)
        prekresli()
      }
      rd.readAsText(f, 'utf-8')
      // Vynulovat, ať jde tentýž soubor načíst dvakrát za sebou – `onchange`
      // se jinak podruhé nespustí.
      e.target.value = ''
    }
  }
}
