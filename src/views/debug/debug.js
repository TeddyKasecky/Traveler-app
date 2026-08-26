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
 * ŘÁDEK NESE ČTYŘI ÚDAJE, NE ŠEST (srpen 2026). Nadpis, dvě řádky textu, stav
 * a prioritu – tedy to, podle čeho se v seznamu rozhoduje. `id`, datum vzniku,
 * moduly a štítek z repozitáře se ukážou až po rozbalení. Do té doby to bylo
 * všechno naráz a řádek se četl jako tabulka.
 *
 * ŤUKNUTÍ ROZBALUJE, NEOTEVÍRÁ ÚPRAVU. Devět z deseti ťuknutí je „co jsem to
 * tenkrát psal", ne „chci to přepsat" – a u cizích záznamů, které upravit
 * nejde, je rozbalení jediná smysluplná odpověď. Obě poloviny obrazovky se tak
 * chovají stejně.
 *
 * Filtry, rozbalené záznamy i vybraná půlka segmentu drží tenhle modul
 * v paměti, ne `prefs`: je to volba na deset vteřin, ne nastavení. Po zavření
 * obrazovky se zapomenou schválně.
 */

import { esc, sklonuj } from '../../core/html.js'
import { IC } from '../../icons/sprite.js'
import { cislaRada, pilulky, segment } from '../../components/vzory.js'
import { potvrd } from '../../components/dialog.js'
import { toast } from '../../components/toast.js'
import { otevriDebugZapis } from '../../components/debugZapis.js'
import { sediSRepem } from '../../core/debugExport.js'
import { exportHtml, napojExport } from './debugExportUI.js'
import { nactiRejstrik, odOstatnich, rejstrikVPameti, stavZRepa } from '../../core/debugRejstrik.js'
import {
  JAK_CASTO,
  PRIORITY,
  STAVY,
  TYPY,
  debugData,
  filtrujZaznamy,
  otiskZaznamu,
  zmenenoOdExportu,
  popisekModulu,
  smazZaznamy,
  typZaznamu,
  ulozDebug,
} from '../../core/debug.js'

/**
 * Aktivní filtry. Prázdná hodnota = neuplatní se.
 *
 * FILTRUJE SE PODLE STADIA, NE PODLE `stav` (srpen 2026). Vlastní `stav`
 * záznamu se dál edituje ve formuláři a jde do `.md`, ale procházet podle něj
 * seznam nedávalo smysl: „hotovo“ si nastavuje autor sám, kdežto o tom, jestli
 * je věc opravdu vyřešená, rozhoduje repozitář – a to říká stadium pravdivěji.
 *
 * Filtr podle části appky zmizel úplně. Moduly nejsou vidět ani v řádku, takže
 * filtrovat podle nich byla střelba naslepo; dvanáct pilulek na dva řádky byl
 * přitom největší kus panelu.
 */
const F = { typ: '', stadium: '', priorita: '' }

/** Zaškrtnuté záznamy pro hromadné akce. Set, ne pole – testuje se členství. */
const vybrane = new Set()

/** Rozbalené záznamy, moje i cizí dohromady – `id` jsou napříč jedinečná. */
const rozbalene = new Set()

/** Je panel filtrů vytažený? Sbalený je schválně: čtyři řady zabraly půl telefonu. */
let filtrOtevreny = false

/** Která půlka segmentu je vidět: `moje` | `cizi`. */
let castka = 'moje'

/**
 * Je blok EXPORT vytažený? Zavřený je schválně.
 *
 * Export a záloha jsou dohromady čtyři tlačítka, přepínač rozsahu a dva
 * odstavce vysvětlení – tedy víc obrazovky než samotný seznam poznámek.
 * Přitom se na ně sahá jednou za čas, ne při každém otevření. Rozbaluje se
 * to stejným způsobem jako složky v knihovně Výprav, jen zřetelněji:
 * šipka a velké písmo místo nenápadného řádku s třemi tečkami.
 */
let exportOtevreny = false

/** Krátké datum „24. 8." – rok se dopisuje jen u starších záznamů. */
function datum(ms) {
  const d = new Date(ms)
  const letos = new Date().getFullYear()
  return `${d.getDate()}. ${d.getMonth() + 1}.${d.getFullYear() === letos ? '' : ` ${d.getFullYear()}`}`
}

/**
 * Ukázka textu do řádku. Dva řádky ořízne CSS (`-webkit-line-clamp`), tohle
 * je jen strop, aby se do stránky nesypal odstavec na deset vět.
 */
const zkratka = (t, n = 160) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim()
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

const stavPopisek = (id) => (STAVY.find((s) => s.id === id) || { popisek: id }).popisek
const prioPopisek = (id) => `priorita ${(PRIORITY.find((p) => p.id === id) || { popisek: id }).popisek}`
const castoPopisek = (id) => (JAK_CASTO.find((j) => j.id === id) || { popisek: id }).popisek

/** `2026-09-02` → `2. 9.` */
function denZIso(iso) {
  const [, m, d] = String(iso || '').split('-')
  return d ? `${Number(d)}. ${Number(m)}.` : String(iso || '')
}

/** Hlásí repozitář tenhle záznam jako odbytý? Pro čtvrté číslo nahoře. */
const vyresenoVRepu = (z) => {
  const r = stavZRepa(z.id)
  return !!r && r.zdroj === 'vyreseno'
}

/**
 * Zmizel záznam z repozitáře, aniž by se uzavřel?
 *
 * Není to chyba appky, ale HLÍDAČ KONVENCE: někdo záznam z `.md` odstranil,
 * aniž by zapsal řádek do `debug/VYRESENO.md`. Nejčastější příčina je kolize
 * `id` mezi dvěma zařízeními, kterou někdo rozpletl přímo v souboru.
 */
function chybiVRepu(z) {
  if (stavZRepa(z.id) || !z.exportovanoDo) return false
  const rej = rejstrikVPameti()
  // Rejstřík se nenačetl (offline a nikdy nestažený, jednosouborová varianta) –
  // pak se nesmí tvrdit, že záznam zmizel. „Nevíme" je jiný stav než „není tam".
  if (!rej) return false
  // Rejstřík je starší než odeslání: export se prostě ještě nedostal do gitu
  // a na server. Strašit v tomhle případě by byl planý poplach při každém
  // exportu, dokud se nenasadí.
  if (z.exportovanoV && rej.vygenerovano && Date.parse(rej.vygenerovano) < z.exportovanoV) return false
  return true
}

/**
 * Stadium záznamu vůči repozitáři – jedna hodnota pro rámeček i pro legendu.
 *
 * PROČ TO VZNIKLO: v seznamu nebylo poznat, co už je na `main` a co je tedy
 * odbyté. Kdo hlášení procházel, musel každé rozkliknout, aby to zjistil –
 * přesně ta práce, kterou má tracker ušetřit.
 *
 * `null` z `rejstrikVPameti()` znamená **„nevíme"**, ne „není tam": offline
 * appka rejstřík nikdy nestáhla a jednosouborová varianta ho nemá vůbec.
 * Stadium pak nesmí tvrdit „na mainu" a zůstane na „odesláno".
 *
 * U VYŘEŠENÉHO SE ZMĚNA NEKONTROLUJE. Uzavřený záznam se znovu neexportuje,
 * takže by červený rámeček jen strašil kvůli něčemu, co nikdo řešit nebude.
 *
 * @param {Record<string, any>} z
 * @returns {'jentady'|'odeslano'|'namainu'|'zmeneno'|'vyreseno'|'chybi'}
 */
export function stadiumZaznamu(z) {
  const r = stavZRepa(z.id)
  if (r && r.zdroj === 'vyreseno') return 'vyreseno'
  if (!z.exportovanoDo) return 'jentady'
  // „Změněno" přebíjí „na mainu" i „odesláno": jakmile se text rozejde s tím,
  // co odešlo, je neaktuální i ten soubor ve složce `debug/`, ne až to, co je
  // nasazené. Rozlišovat to by znamenalo dvě červené, které se liší jen tím,
  // jak moc pospíchá další export.
  //
  // DVĚ CESTY, A OBĚ JSOU POTŘEBA. Přesná je otisk (`otiskExportu`), jenže ten
  // se ukládá až od srpna 2026 při označení odesláno – záznamy odeslané dřív ho
  // nemají a bez druhé cesty by se u nich změna nikdy nepoznala. To byly
  // v okamžiku vydání úplně všechny. Druhá cesta porovnává přímo s tím, co nese
  // rejstřík; jakmile jednou sedne, `dorovnejOtisky()` otisk dopočítá a dál
  // rozhoduje ten – vidí totiž i na kroky a na „čekal jsem", které rejstřík nemá.
  if (z.otiskExportu) {
    if (zmenenoOdExportu(z)) return 'zmeneno'
  } else if (sediSRepem(z, r) === false) {
    return 'zmeneno'
  }
  if (r) return 'namainu'
  if (chybiVRepu(z)) return 'chybi'
  return 'odeslano'
}

/**
 * Legenda pod tlačítky a zároveň hodnoty filtru. Pořadí je cesta záznamu,
 * ne abeceda.
 *
 * `chybi` je tu schválně, přestože se snad nikdy neukáže: legenda je klíč
 * k barvám, takže hliněný rámeček musí umět vysvětlit – a záznam v tom stavu
 * by jinak nešel vyfiltrovat žádnou hodnotou.
 */
const STADIA = [
  { id: 'jentady', popisek: 'jen tady' },
  { id: 'odeslano', popisek: 'odesláno' },
  { id: 'namainu', popisek: 'na mainu' },
  { id: 'zmeneno', popisek: 'změněné' },
  { id: 'vyreseno', popisek: 'vyřešené' },
  { id: 'chybi', popisek: 'zmizelo' },
]

/**
 * Štítek „co o tom ví repozitář" – oddělený od mého vlastního stavu.
 *
 * Repozitář je informace, ne autorita nad mým seznamem: můj `stav` se podle
 * něj nikdy nepřepisuje sám. Od srpna 2026 stojí až v rozbaleném záznamu,
 * ne v řádku – v seznamu se rozhoduje podle stavu a priority.
 */
function stitekZRepa(z) {
  const r = stavZRepa(z.id)
  if (r && r.zdroj === 'vyreseno') {
    const kdy = r.vyresenoDne ? ` · ${denZIso(r.vyresenoDne)}` : ''
    return r.stav === 'zahozeno'
      ? `<span class="dz-znacka repo zahozeno" title="${esc(r.poznamka || '')}">${IC('i-x')}zahozeno v repu${kdy}</span>`
      : `<span class="dz-znacka repo hotovo" title="${esc(r.poznamka || '')}">${IC('i-check')}vyřešeno${kdy}</span>`
  }
  if (r) {
    return r.stav === 'resim'
      ? `<span class="dz-znacka repo">${IC('i-clock')}řeší se</span>`
      : `<span class="dz-znacka repo">${IC('i-globe')}v repozitáři</span>`
  }
  if (!z.exportovanoDo) return `<span class="dz-znacka">${IC('i-pinme')}zatím jen tady</span>`
  if (chybiVRepu(z)) {
    return `<span class="dz-znacka repo chybi" title="${esc(z.exportovanoDo)}">${IC('i-oko-ne')}zmizelo z repozitáře</span>`
  }
  return `<span class="dz-znacka odeslano" title="${esc(z.exportovanoDo)}">${IC('i-sdilet')}odesláno</span>`
}

/* ================= řádky ================= */

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
  const otevreny = rozbalene.has(z.id)

  return `<div class="dzr st-${stadiumZaznamu(z)}${zaskrtnuty ? ' vybrany' : ''}${otevreny ? ' otevreny' : ''}" data-id="${z.id}">
    <div class="dzr-radek">
      <button class="dzr-check" role="checkbox" aria-checked="${zaskrtnuty}" data-check="${z.id}"
        aria-label="Vybrat ${z.id}">${zaskrtnuty ? IC('i-check') : ''}</button>
      <button class="dzr-telo" data-rozbal="${z.id}" aria-expanded="${otevreny}">
        <div class="dzr-hd">
          ${IC(t.ikona)}
          <b>${esc(z.nadpis)}</b>
        </div>
        ${z.text ? `<div class="dzr-text">${esc(zkratka(z.text))}</div>` : ''}
        <div class="dzr-meta">
          <span class="dz-znacka stav ${z.stav}">${esc(stavPopisek(z.stav))}</span>
          <span class="dz-znacka ${z.priorita}">${esc(prioPopisek(z.priorita))}</span>
        </div>
      </button>
    </div>
    ${otevreny ? rozbalenyZaznam(z) : ''}
  </div>`
}

/** Odstavec s popiskem uvnitř rozbaleného záznamu. Prázdné pole se nekreslí. */
const kus = (popisek, hodnota) =>
  hodnota ? `<div class="dzr-kus"><b>${esc(popisek)}</b><p>${esc(hodnota)}</p></div>` : ''

/** Celý vlastní záznam pod řádkem. Tady teprve stojí `id`, datum a repozitář. */
function rozbalenyZaznam(z) {
  const moduly = (z.moduly || []).map(popisekModulu).join(' · ')
  return `<div class="dzr-detail">
    ${z.text ? `<div class="dzr-kus"><p>${esc(z.text)}</p></div>` : ''}
    ${
      z.typ === 'bug'
        ? kus('Čekal jsem', z.cekal) + kus('Kroky', z.kroky) + kus('Jak často', z.jakCasto ? castoPopisek(z.jakCasto) : '')
        : ''
    }
    ${z.typ === 'napad' ? kus('K čemu to je', z.motivace) + kus('Hotovo když', z.hotovoKdyz) : ''}
    ${kus('Návrh řešení', z.navrh)}
    ${moduly ? `<div class="dzr-kus"><b>Čeho se to týká</b><p>${esc(moduly)}</p></div>` : ''}
    <div class="dzr-meta dzr-spodek">
      <span class="dz-id">${esc(z.id)}</span>
      <span class="dzr-datum">zapsáno ${datum(z.vytvoreno)}</span>
      ${stitekZRepa(z)}
    </div>
    ${
      chybiVRepu(z)
        ? `<div class="dzr-varovani">${IC('i-oko-ne')}<div>
            <b>V repozitáři už tenhle záznam není.</b>
            Buď se uzavřel bez řádku ve <code>VYRESENO.md</code>, nebo se jeho <code>id</code>
            srazilo s jiným zařízením a někdo ho v souboru přejmenoval. Smazáním z telefonu
            o něj nepřijdeš – v repozitáři zůstává a ukáže se v „Od ostatních" pod svým
            skutečným <code>id</code>.
            <button class="btn small nebezpecne" data-osirely="${z.id}">Smazat z telefonu</button>
          </div></div>`
        : ''
    }
    <div class="btnrow dzr-akce">
      <button class="btn small" data-upravit="${z.id}">${IC('i-quill')}Upravit</button>
    </div>
  </div>`
}

/**
 * Řádek cizího záznamu z repozitáře. Jen ke čtení – editovat cizí hlášení
 * nedává smysl, odpovídá se na ně opravou.
 */
function radekCizi(z) {
  const t = typZaznamu(z.typ)
  const vyreseno = z.zdroj === 'vyreseno'
  const otevreny = rozbalene.has(z.id)
  return `<div class="dzr cizi${otevreny ? ' otevreny' : ''}" data-id="${esc(z.id)}">
    <div class="dzr-radek">
      <button class="dzr-telo" data-rozbal="${esc(z.id)}" aria-expanded="${otevreny}">
        <div class="dzr-hd">
          ${IC(t.ikona)}
          <b>${esc(z.nadpis || z.poznamka || '(bez nadpisu)')}</b>
        </div>
        ${z.popis ? `<div class="dzr-text">${esc(zkratka(z.popis))}</div>` : ''}
        <div class="dzr-meta">
          <span class="dz-znacka repo${vyreseno ? ` ${z.stav}` : ''}">${
            vyreseno
              ? `${IC(z.stav === 'zahozeno' ? 'i-x' : 'i-check')}${esc(stavPopisek(z.stav))}${z.vyresenoDne ? ` · ${denZIso(z.vyresenoDne)}` : ''}`
              : `${IC('i-globe')}${esc(stavPopisek(z.stav))}`
          }</span>
          ${z.priorita ? `<span class="dz-znacka ${z.priorita}">${esc(prioPopisek(z.priorita))}</span>` : ''}
        </div>
      </button>
      <button class="dzr-kopie" data-plne="${esc(z.id)}" title="Plné znění">${IC('i-vice')}</button>
    </div>
    ${otevreny ? rozbalenyCizi(z) : ''}
  </div>`
}

/** Cizí záznam po rozbalení. Víc, než co má rejstřík, se stejně vzít nedá. */
function rozbalenyCizi(z) {
  const moduly = (z.moduly || []).map(popisekModulu).join(' · ')
  return `<div class="dzr-detail">
    ${z.popis ? `<div class="dzr-kus"><p>${esc(z.popis)}</p></div>` : ''}
    ${kus('Návrh řešení', z.navrh)}
    ${moduly ? `<div class="dzr-kus"><b>Čeho se to týká</b><p>${esc(moduly)}</p></div>` : ''}
    <div class="dzr-meta dzr-spodek">
      <span class="dz-id">${esc(z.id)}</span>
      ${z.soubor ? `<span class="dzr-datum">${esc(z.soubor)}</span>` : ''}
    </div>
    <div class="btnrow dzr-akce">
      <button class="btn small" data-plne="${esc(z.id)}">${IC('i-vice')}Plné znění</button>
    </div>
  </div>`
}

/* ================= filtr ================= */

/** Filtr jako řada pilulek. `vse` je první a znamená „bez omezení". */
function filtrRada(klic, polozky, popisekVse) {
  return pilulky(
    [
      { id: '', popisek: popisekVse, on: !F[klic] },
      ...polozky.map((p) => ({ id: p.id, popisek: p.popisek, on: F[klic] === p.id })),
    ],
    // Společná třída `dzf` nese zalamování. Do srpna 2026 vyjmenovávalo CSS
    // jednotlivé řady ručně a na přejmenovanou `stadium` se zapomnělo –
    // spadla na vodorovné posouvání z `.pilulky`. Se společnou třídou se na
    // novou řadu zapomenout nedá, protože žádný seznam neexistuje.
    `vodorovne dzf dzf-${klic}`
  )
}

/** Kolik filtrů je zapnutých – do popisku sbaleného panelu. */
const kolikFiltru = () => Object.values(F).filter(Boolean).length

/**
 * Panel filtrů, sbalený.
 *
 * Do srpna 2026 byly čtyři řady pilulek (z toho dvanáct modulů na dva řádky)
 * vidět pořád a zabraly půl telefonu dřív, než se čtenář dostal k prvnímu
 * záznamu. Filtr podle modulu zůstal – jen není vidět, dokud ho někdo nechce.
 */
function filtrHtml(pocet) {
  const n = kolikFiltru()
  return `<div class="dz-karta dzf-karta">
    <button class="dzf-prepinac${filtrOtevreny ? ' on' : ''}" id="dzfPrepinac">
      ${IC('i-filtr')}<span>Filtr${n ? ` (${n})` : ''}</span>
      <i>${pocet} ${sklonuj(pocet, 'záznam', 'záznamy', 'záznamů')}</i>
      ${IC('i-sipka')}
    </button>
    ${
      filtrOtevreny
        ? `<div class="dzf-telo">
            ${filtrRada('typ', TYPY, 'Vše')}
            ${filtrRada('stadium', STADIA, 'Každé stadium')}
            ${filtrRada('priorita', PRIORITY, 'Každá priorita')}
            <div class="dz-napoveda">
              <b>Stadium je cesta záznamu do repozitáře</b>, ne tvůj stav. Vlastní stav
              si dál nastavuješ ve formuláři a jde do exportu – jen se podle něj
              neprochází, protože o tom, co je opravdu vyřešené, rozhoduje repozitář.
            </div>
          </div>`
        : ''
    }
  </div>`
}

/**
 * Dopočítá `otiskExportu` u záznamů, které ho ještě nemají a s rejstříkem se
 * shodují.
 *
 * PROČ: otisk se ukládá až od srpna 2026 při označení „odesláno“. Všechno, co
 * odešlo dřív, ho nemá – a bez otisku se změna pozná jen tou hrubší cestou přes
 * rejstřík, která nevidí na kroky ani na „čekal jsem“. Tímhle se staré záznamy
 * jednorázově dorovnají a od té chvíle u nich funguje přesné porovnání.
 *
 * DOROVNÁVÁ SE JEN TO, CO S REJSTŘÍKEM SEDÍ. Kdyby se otisk doplnil i záznamu,
 * který je už teď rozejitý, zmrazila by se jako „odeslaná podoba“ ta upravená
 * a změna by se ztratila nadobro.
 *
 * @returns {Promise<number>} kolik jich přibylo
 */
async function dorovnejOtisky() {
  if (!rejstrikVPameti()) return 0
  let doplneno = 0
  for (const z of debugData.zaznamy) {
    if (!z.exportovanoDo || z.otiskExportu) continue
    if (sediSRepem(z, stavZRepa(z.id)) !== true) continue
    z.otiskExportu = otiskZaznamu(z)
    doplneno++
  }
  if (doplneno) await ulozDebug()
  return doplneno
}
/* ================= obrazovka ================= */

export function renderDebug() {
  const wrap = document.getElementById('debugInner')
  if (!wrap) return

  // Rejstřík je v samostatném souboru, který build přibalil ze složky `debug/`.
  // Načte se jednou a překreslí – vykreslování zůstává synchronní.
  if (!rejstrikVPameti()) nactiRejstrik().then((r) => r && dorovnejOtisky().then(renderDebug))
  else dorovnejOtisky()

  const vse = debugData.zaznamy
  // `filtrujZaznamy` umí jen to, co je ve `store` uložené. Stadium je odvozené
  // z rejstříku a otisku, takže se filtruje až tady.
  let videt = filtrujZaznamy({ typ: F.typ, priorita: F.priorita })
  if (F.stadium) videt = videt.filter((z) => stadiumZaznamu(z) === F.stadium)
  // Výběr se musí očistit o to, co je zrovna odfiltrované nebo smazané –
  // jinak by „smazat vybrané" sáhlo i na záznamy, které nejsou vidět.
  for (const id of [...vybrane]) if (!videt.some((z) => z.id === id)) vybrane.delete(id)

  const otevrenych = vse.filter((z) => z.stav !== 'hotovo' && z.stav !== 'zahozeno').length
  const odbytych = vse.filter(vyresenoVRepu).length
  // Co je v repozitáři a nemám to v telefonu – typicky hlášení toho druhého.
  const cizi = odOstatnich(new Set(vse.map((z) => z.id)))

  wrap.innerHTML = `
    <h2 class="nadpis-obrazovky">${IC('i-brouk')}Poznámkovač</h2>
    <div class="meta dz-uvod">
      Nápady, bugy a poznámky zapsané za běhu appky. <b>Zůstávají jen v tomhle telefonu</b>
      – k druhému člověku ani k AI se dostanou teprve tím, že je vyexportuješ do souboru,
      ten se uloží do složky <code>debug/</code> a <b>commitne do repozitáře</b>. Stav se
      vrací zpátky až s příštím nasazením, ne hned.
    </div>

    <div class="dz-karta dz-cisla">
      ${cislaRada([
        { ikona: 'i-quill', hodnota: String(vse.length), popisek: 'záznamů' },
        { ikona: 'i-clock', hodnota: String(otevrenych), popisek: 'otevřených' },
        { ikona: 'i-check', hodnota: String(vse.length - otevrenych), popisek: 'odbytých' },
        { ikona: 'i-globe', hodnota: String(odbytych), popisek: 'vyřešených v repu', klic: 'vyresene' },
      ])}
    </div>

    ${segment(
      [
        { id: 'moje', popisek: `Moje (${vse.length})` },
        { id: 'cizi', popisek: `Od ostatních (${cizi.length})` },
      ],
      castka,
      'dzSeg'
    )}

    ${castka === 'moje' ? mojeCast(videt, vse) : ciziCast(cizi)}
    <div style="height:20px"></div>`

  napoj(videt, cizi)
  // Obsluha exportu jen když je blok opravdu vytažený – zavřený v DOM není.
  if (castka === 'moje' && exportOtevreny) napojExport(vybrane, renderDebug)
}

/** Půlka „Moje": filtr, hromadné akce, seznam, zápis a export. */
function mojeCast(videt, vse) {
  return `
    ${filtrHtml(videt.length)}

    <div class="dzr-lista">
      <button class="btn small" id="dzVse">${vybrane.size >= videt.length && videt.length ? 'Zrušit výběr' : 'Vybrat vše z filtru'}</button>
      <button class="btn small nebezpecne" id="dzSmaz"${vybrane.size ? '' : ' disabled'}>Smazat vybrané${vybrane.size ? ` (${vybrane.size})` : ''}</button>
    </div>

    ${
      videt.length
        ? `<div class="dzr-legenda">${STADIA.map(
            (s) => `<span class="dzl st-${s.id}">${esc(s.popisek)}</span>`
          ).join('')}</div>`
        : ''
    }

    ${
      videt.length
        ? `<div class="dzr-seznam">${videt.map(radekZaznamu).join('')}</div>`
        : `<div class="dzr-prazdno">${IC('i-brouk')}<div>${
            vse.length
              ? F.stadium === 'vyreseno'
                ? 'Nic tvého zatím repozitář neuzavřel.'
                : 'Tomuhle filtru nic neodpovídá.'
              : 'Zatím nic. Zapiš první poznámku kolečkem v hlavičce.'
          }</div></div>`
    }

    <div class="btnrow" style="margin-top:16px">
      <button class="btn primary" id="dzNovy">${IC('i-plus')}Zapsat poznámku</button>
    </div>

    <div class="dz-karta dz-rozbal-karta">
      <button class="dz-rozbal${exportOtevreny ? ' on' : ''}" id="dzExportPrepinac" aria-expanded="${exportOtevreny}">
        <span>Export</span>${IC('i-sipka')}
      </button>
      ${exportOtevreny ? `<div class="dz-rozbal-telo">${exportHtml(vybrane)}</div>` : ''}
    </div>`
}

/** Půlka „Od ostatních": co přibalil build ze složky `debug/`. */
function ciziCast(cizi) {
  const rej = rejstrikVPameti()
  if (!rej) {
    // `null` znamená „nevíme", ne „nic tam není" – v jednosouborové variantě
    // rejstřík neexistuje vůbec a offline se nemusel nikdy stáhnout.
    return `<div class="dzr-prazdno">${IC('i-globe')}<div>
      Stav z repozitáře se nepodařilo načíst. Buď se appka ještě nikdy nespojila se sítí,
      nebo běží jako jeden offline soubor, do kterého se seznam nebalí.
      <b>Neznamená to, že tam nic není.</b>
    </div></div>`
  }
  if (!cizi.length) {
    return `<div class="dzr-prazdno">${IC('i-check')}<div>
      Repozitář nezná nic, co bys neměl v telefonu.
    </div></div>`
  }
  const otevrene = cizi.filter((z) => z.zdroj !== 'vyreseno')
  return `
    <div class="meta dz-uvod">
      Hlášení, která nemáš v telefonu – přišla ze složky <code>debug/</code> při posledním
      nasazení. Jen ke čtení; ${
        otevrene.length
          ? `<b>${otevrene.length}</b> ${sklonuj(otevrene.length, 'je otevřené', 'jsou otevřené', 'je otevřených')}`
          : 'všechna jsou odbytá'
      }. Appka o nich ví jen nadpis, popis a návrh řešení – kontext ani zachycené chyby
      se do repozitáře nenasazují, aby neskončily veřejně na webu.
    </div>
    <div class="dzr-seznam">${cizi.map(radekCizi).join('')}</div>`
}

/* ================= obsluha ================= */

function napoj(videt, cizi) {
  for (const b of document.querySelectorAll('#dzSeg button')) {
    b.onclick = () => {
      castka = b.dataset.seg
      renderDebug()
    }
  }

  // Číslo nahoře je zkratka do filtru, ne druhý nezávislý přepínač – dvě cesty
  // ke stejnému zúžení seznamu si dřív nebo později začnou odporovat.
  for (const b of document.querySelectorAll('[data-cislo]')) {
    b.onclick = () => {
      if (b.dataset.cislo !== 'vyresene') return
      F.stadium = F.stadium === 'vyreseno' ? '' : 'vyreseno'
      castka = 'moje'
      renderDebug()
    }
  }

  // Rozbalování je společné pro moje i cizí – `id` jsou napříč jedinečná.
  for (const b of document.querySelectorAll('[data-rozbal]')) {
    b.onclick = () => {
      const id = b.dataset.rozbal
      rozbalene.has(id) ? rozbalene.delete(id) : rozbalene.add(id)
      renderDebug()
    }
  }

  for (const b of document.querySelectorAll('[data-upravit]')) {
    b.onclick = () => otevriDebugZapis(b.dataset.upravit)
  }

  // Cizí záznam se needituje. „Plné znění" otevře týž plát v zamčeném režimu –
  // dvě obrazovky na totéž by se do měsíce rozešly.
  for (const b of document.querySelectorAll('[data-plne]')) {
    b.onclick = (e) => {
      e.stopPropagation()
      const z = cizi.find((x) => x.id === b.dataset.plne)
      if (z) otevriDebugZapis(null, z)
    }
  }

  for (const b of document.querySelectorAll('[data-osirely]')) {
    b.onclick = async (e) => {
      e.stopPropagation()
      const id = b.dataset.osirely
      const dal = await potvrd({
        nadpis: `Smazat ${id} z telefonu?`,
        text:
          'V repozitáři zůstává, takže o něj nepřijdeš – po smazání se ukáže v „Od ostatních", ' +
          'pokud tam pod nějakým id je. Tvoje kopie v telefonu zmizí nadobro.',
        ano: 'Smazat',
        nebezpecne: true,
      })
      if (!dal) return
      smazZaznamy([id])
      rozbalene.delete(id)
      vybrane.delete(id)
      if (!(await ulozDebug())) return toast('Smazání se neuložilo – v telefonu došlo místo')
      toast(`Smazáno ${id}`)
      renderDebug()
    }
  }

  if (castka !== 'moje') return

  const prepinac = document.getElementById('dzfPrepinac')
  if (prepinac)
    prepinac.onclick = () => {
      filtrOtevreny = !filtrOtevreny
      renderDebug()
    }

  const exp = document.getElementById('dzExportPrepinac')
  if (exp)
    exp.onclick = () => {
      exportOtevreny = !exportOtevreny
      renderDebug()
    }

  for (const [klic] of Object.entries(F)) {
    for (const b of document.querySelectorAll(`.dzf-${klic} .pilulka`)) {
      b.onclick = () => {
        F[klic] = b.dataset.id
        renderDebug()
      }
    }
  }

  for (const b of document.querySelectorAll('[data-check]')) {
    b.onclick = (e) => {
      e.stopPropagation()
      const id = b.dataset.check
      if (vybrane.has(id)) vybrane.delete(id)
      else vybrane.add(id)
      renderDebug()
    }
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
      if (!(await ulozDebug())) return toast('Smazání se neuložilo – v telefonu došlo místo')
      toast(`Smazáno ${n} ${sklonuj(n, 'záznam', 'záznamy', 'záznamů')}`)
      renderDebug()
    }
  }

  document.getElementById('dzNovy').onclick = () => otevriDebugZapis()
}
