/**
 * Košík a „Co dál?" – vykreslení a obsluha.
 *
 * ODDĚLENO OD `kosik.js` ze stejného důvodu jako `body.js` od `bloky.js`:
 * datová vrstva nesmí importovat `IC`, který čte `sprite.svg?raw` (Vite
 * syntaxe, kterou čistý Node neumí). Díky tomu jde `kosik.js` testovat
 * v `check-dny.mjs` bez prohlížeče.
 *
 * DVĚ VĚCI, JEDEN SOUBOR, a je to schválně: „Co dál?" je čtečka košíku –
 * tipy z něj berou přednost. Kdyby bydlely zvlášť, musely by si navzájem
 * importovat vykreslovací pomocníky.
 */

import { S, store, PHOTOS, save } from '../../core/store.js'
import { dkm, fmtKm, zjistiPolohu } from '../../core/geo.js'
import { esc } from '../../core/html.js'
import { IC } from '../../icons/sprite.js'
import { KAT } from '../../data/categories.js'
import { HOME_MOODS } from '../../data/moods.js'
import { obrazekMista } from '../../data/kategorieFoto.js'
import { sekce } from '../../components/vzory.js'
import { toast } from '../../components/toast.js'
import { potvrd } from '../../components/dialog.js'
import {
  kosik, pridejDoKosiku, vyhodZKosiku, vKosiku,
  kosikSeZajizdkou, hlavniKotva, nastavKotvu, zrusKotvu, bodyBezPolohy,
} from './kosik.js'
import { zahodKosikVrstvu } from '../../map/kosikVrstva.js'
import { zadej, vyberZeSeznamu } from '../../components/dialog.js'
import { vychoziBod, jedeSe, pridejDoCesty, kolikatyDenCesty } from './cesta.js'
import { sklonuj } from './plan.js'
import { dnyPlanu, nastavDny } from './dny.js'
import { DRUHY, bodyVKosiku, prehodBod, pridejBod, rozpoznejSouradnice, hledejAdresu } from './body.js'
import { vyberBod } from '../../map/map.js'

/** Silnice bývá delší než vzdušná čára – týž koeficient jako v plan.js. */
const KLIKATOST = 1.35

/** Průměrná rychlost na roadtripu včetně zastávek, km/h. */
const RYCHLOST = 60

/**
 * Kam až se hledají tipy „Co dál?".
 *
 * `nb` v datech má strop 45 km a jen 6 sousedů, což je na „kam zítra" málo –
 * zítřejší přejezd bývá delší. Tipy se proto počítají z celé databáze; 580
 * míst je na jeden průchod polem zanedbatelné a odpadá tím závislost na tom,
 * jestli má místo `nb` spočítané.
 */
const TIPY_KM = 150

/** Kolik tipů se ukáže. Tři, ne seznam – seznam je Objevuj. */
const TIPY_POCET = 3

/** Odhad času přejezdu podle vzdušné čáry. */
const dobaJizdy = (km) => {
  const hodin = (km * KLIKATOST) / RYCHLOST
  return hodin < 1 ? `~${Math.round(hodin * 60)} min` : `~${hodin.toFixed(1).replace('.', ',')} h`
}

/* ================= košík ================= */

/**
 * Jedno místo v košíku. Bez pořadí a bez dne – to je celý smysl.
 * Zajížďka je hlavní číslo: „kolik mě to stojí navíc" je otázka, kterou si
 * u večeře klademe, ne „jak je to daleko vzdušnou čarou".
 */
function kosikRadek({ p, km, zajizdka: z, vKoridoru, kotva }, odkud) {
  // Vlastní bod nemá fotku ani kategorii – místo náhledu dostane ikonu svého
  // druhu, ať je na první pohled poznat, že to není místo z databáze.
  const bod = p.vlastni || null
  const kat = KAT[p.k] || {}
  const o = bod ? null : obrazekMista(p, PHOTOS)
  const druh = bod ? DRUHY[bod.druh] || DRUHY.vlastni : null

  return `<div class="kosik-radek${kotva ? ' je-kotva' : ''}${z != null && !vKoridoru && !kotva ? ' daleko' : ''}"
    data-kos="${p.id}">
    ${bod
      ? `<span class="kosik-znak">${IC(druh.ikona)}</span>`
      : `<img class="kosik-obr" src="${o.src}" alt="" loading="lazy" decoding="async" width="56" height="56"
          style="object-position:${o.vyrez}"
          ${o.zaloha ? `data-zaloha="${o.zaloha}" onerror="this.onerror=null;this.src=this.dataset.zaloha"` : ''}>`}
    <div class="kosik-text">
      <h3>${esc(p.n)}${kotva ? ` <span class="kosik-kotva-znak">${IC('i-flag')}</span>` : ''}</h3>
      <div class="kosik-meta">
        ${bod
          ? `<span style="color:var(--rust)">${IC(druh.ikona)}${esc(druh.popisek)}</span>`
          : `<span style="color:${kat.c || 'var(--text2)'}">${IC(kat.i || 'i-spark')}${esc(p.k || '')}</span>`}
        ${
          kotva
            ? `<span class="tecka">•</span><b>${kotva.odeDne}.–${kotva.doDne}. den</b>`
            : z != null
              ? `<span class="tecka">•</span><b class="${vKoridoru ? 'zaj-blizko' : 'zaj-daleko'}">${
                  z < 1 ? 'po cestě' : `+${Math.round(z)} km`
                }</b>`
              : km != null
                ? `<span class="tecka">•</span>${fmtKm(km)}`
                : ''
        }
      </div>
    </div>
    ${
      kotva
        ? ''
        : `<button class="ikonbtn kosik-kotva" data-kos-kotva="${p.id}" title="Udělat z toho kotvu">${IC('i-star')}</button>`
    }
    <button class="ikonbtn kosik-do-planu" data-kos-plan="${p.id}" title="Přidat do itineráře">${IC('i-plus')}</button>
    <button class="ikonbtn kosik-ven" data-kos-ven="${p.id}" title="Vyhodit z košíku">${IC('i-x')}</button>
  </div>`
}

/**
 * Vlastní bod v košíku, který ještě nemá polohu.
 *
 * Bez souřadnic se nedá spočítat zajížďka ani vykreslit na mapu, takže ho
 * `polozkyKosiku()` přeskakuje – ale zmizet nesmí. „Polohu doplním, až budu
 * vědět" je platný stav a bod bez ní je pořád nápad, na který se nemá
 * zapomenout.
 */
function radekBezPolohy(b) {
  const druh = DRUHY[b.druh] || DRUHY.vlastni
  return `<div class="kosik-radek bezpolohy" data-kos="${b.id}">
    <span class="kosik-znak">${IC(druh.ikona)}</span>
    <div class="kosik-text">
      <h3>${esc(b.nazev || druh.popisek)}</h3>
      <div class="kosik-meta"><span>${IC('i-clock')}zatím bez polohy</span></div>
    </div>
    <button class="ikonbtn kosik-do-planu" data-kos-plan="${b.id}" title="Přidat do itineráře">${IC('i-plus')}</button>
    <button class="ikonbtn kosik-ven" data-kos-ven="${b.id}" title="Vyhodit z košíku">${IC('i-x')}</button>
  </div>`
}

/**
 * Obsah karty Košík.
 * @param {{lat:number, lon:number}|null} odkud  odkud se měří vzdálenosti
 * @returns {string}
 */
export function kosikHtml(odkud = null) {
  const polozky = kosikSeZajizdkou(odkud)
  const bezPolohy = bodyBezPolohy()
  const celkem = polozky.length + bezPolohy.length
  if (!celkem) return prazdnyKosik() + pridatVlastniHtml()

  const kotva = hlavniKotva()
  const cil = kotva ? (polozky.find((x) => x.p.id === kotva.id) || {}).p || null : null

  // ŽÁDNÁ MAPA ANI LEGENDA (srpen 2026). Košík je od přestavby plát vytažený
  // zdola, tedy nejvýš 72 % obrazovky – a mini-mapa v něm zabírala 290 px,
  // takže na seznam, kvůli kterému se otevírá, zbyly dva řádky. Kde místa
  // jsou, ukazuje mapa Itineráře i hlavní mapa; košík odpovídá na „co ještě
  // chci", což je seznam.
  return `
    <!-- Vpravo v hlavičce nic není schválně: tam dosedne plovoucí kolečko,
         které plát otevřelo. „Vysypat" tu bývalo, ale hromadné mazání
         wishlistu jedním ťuknutím je destruktivní akce, kterou nikdo denně
         nepotřebuje – místa se vyhazují po jednom křížkem na řádku. -->
    <div class="kosik-hlava">
      <div>
        <h3>Košík výpravy</h3>
        <div class="meta">${celkem} ${sklonuj(celkem, 'místo', 'místa', 'míst')} ·
          bez pořadí a bez dnů</div>
      </div>
    </div>

    ${kotvaPruh(cil, kotva, odkud)}
    ${
      odkud
        ? ''
        : `<div class="meta kosik-legenda">
             <span>Bez polohy se zajížďka spočítat nedá.</span>
             <button class="btn small" id="kosikPoloha">${IC('i-pinme')}Zapnout polohu</button>
           </div>`
    }

    ${sekce(cil ? 'Po cestě ke kotvě' : 'Místa v košíku', {
      pozn: cil ? 'seřazeno podle zajížďky' : '',
    })}
    ${polozky.map((x) => kosikRadek(x, odkud)).join('')}
    ${bezPolohy.length
      ? sekce('Bez polohy', { pozn: 'doplň ji, až budeš vědět' }) + bezPolohy.map(radekBezPolohy).join('')
      : ''}

    ${pridatVlastniHtml()}

    <div class="meta kosik-napoveda">${IC('i-plus')} přesune místo do itineráře,
      ${IC('i-star')} z něj udělá kotvu, ${IC('i-x')} ho vyhodí.</div>`
}

/**
 * Jediné tlačítko, kterým se do košíku dostane vlastní místo.
 *
 * Do srpna 2026 šlo vlastní místo založit jen v itineráři, tedy rovnou do
 * konkrétního dne – plánovalo se tím dřív, než bylo co plánovat. Přitom
 * „kemp u známých" je přesně ten druh bodu, u kterého člověk nejdřív neví kdy.
 */
function pridatVlastniHtml() {
  return `<button class="pridatzastavku napotom" id="kosikPridatVlastni">${IC('i-pinme')}Přidat vlastní místo</button>`
}

/** Pruh s kotvou, nebo výzva ji nastavit. */
function kotvaPruh(cil, kotva, odkud) {
  if (!cil || !kotva) {
    return `<div class="kotva-pruh prazdna">${IC('i-flag')}
      <div><b>Zatím bez kotvy</b>
        <span class="meta">Označ místo, kam se chceš dostat – třeba bikepark mezi 3. a 5. dnem.
          Podle něj se spočítá, co máš po cestě.</span></div>
    </div>`
  }
  const km = odkud ? dkm(odkud, cil) : null
  return `<div class="kotva-pruh">${IC('i-flag')}
    <div>
      <b>${esc(cil.n)}</b>
      <span class="meta">chceme tam ${kotva.odeDne}.–${kotva.doDne}. den${
        km != null ? ` · odsud zhruba ${fmtKm(km * KLIKATOST)}` : ''
      }</span>
    </div>
    <button class="ikonbtn" data-kotva-zrus="${cil.id}" title="Zrušit kotvu">${IC('i-x')}</button>
  </div>`
}

/** Prázdný košík: vysvětlit, k čemu je – jinak vypadá jako rozbitá obrazovka. */
function prazdnyKosik() {
  return `
    <div class="cesta-prazdno">
      ${IC('i-star')}
      <h3>Košík je prázdný</h3>
      <p>Sem patří místa, která na týhle výpravě chceš vidět, ale ještě nevíš kdy.
         Naházej jich klidně padesát – pořadí ani dny řešit nemusíš.</p>
      <p class="meta">Naplníš ho tlačítkem <b>Uložit na potom</b> dole v itineráři,
         nebo hvězdičkou v detailu kteréhokoli místa.</p>
    </div>`
}

/**
 * Uklidí, co po košíku zbylo na mapě.
 *
 * Vlastní mini-mapa v košíku (`#kosikMapa`, instance Leafletu) zanikla
 * v srpnu 2026 spolu s přestavbou košíku na plát – 290 px mapy v plátu
 * vysokém nejvýš 72 % obrazovky nenechalo místo na seznam, kvůli kterému
 * se otevírá. Vrstva `map/kosikVrstva.js` ale zůstává: kreslí se na HLAVNÍ
 * mapu a odsud se jen zahazuje, aby po zavření košíku nezůstala viset.
 */
export function zavriMapuKosiku() {
  zahodKosikVrstvu()
}

/**
 * Naváže obsluhu košíku.
 * @param {HTMLElement} wrap
 * @param {() => void} prekresli
 */
export function napojKosik(wrap, prekresli) {
  // Poloha se nikde nezjišťuje sama a je to správně – ptát se na ni bez
  // vyžádání je otravné. Košík ji ale potřebuje, tak si o ni řekne tady.
  const poloha = wrap.querySelector('#kosikPoloha')
  if (poloha) poloha.onclick = () => zjistiPolohu()

  for (const b of wrap.querySelectorAll('[data-kos-kotva]')) {
    b.onclick = async (e) => {
      e.stopPropagation()
      const id = b.dataset.kosKotva
      // Okno ve dnech, ne datum: cesta se počítá od vyjetí a datum by nutilo
      // rozhodnout se dřív, než je jasné, kdy se vůbec vyráží.
      const odpoved = await zadej({
        nadpis: 'Kdy tam chceme být?',
        text: 'Napiš rozsah dnů od vyjetí, třeba „3-5". Jeden den stačí taky.',
        vychozi: '3-5',
        placeholder: '3-5',
      })
      if (odpoved === null) return
      const shoda = /^\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*$/.exec(odpoved)
      if (!shoda) return toast('Nerozumím – zkus třeba „3-5"')
      const od = Number(shoda[1])
      const doD = shoda[2] ? Number(shoda[2]) : od
      if (!nastavKotvu(id, od, doD)) return
      toast('Kotva nastavená')
      prekresli()
    }
  }

  for (const b of wrap.querySelectorAll('[data-kotva-zrus]')) {
    b.onclick = (e) => {
      e.stopPropagation()
      if (!zrusKotvu(b.dataset.kotvaZrus)) return
      prekresli()
    }
  }

  for (const b of wrap.querySelectorAll('[data-kos-ven]')) {
    b.onclick = (e) => {
      e.stopPropagation()
      if (!vyhodZKosiku(b.dataset.kosVen)) return
      prekresli()
    }
  }

  for (const b of wrap.querySelectorAll('[data-kos-plan]')) {
    b.onclick = async (e) => {
      e.stopPropagation()
      const id = b.dataset.kosPlan

      // ZA JÍZDY SE PŘIDÁVÁ DO CESTY, NE DO PLÁNU. Košík na kartě Na cestě
      // odpovídá na „kam teď", ne „jak to naplánujeme" – zapsat to do plánu
      // výpravy by znamenalo, že se změna na trase, kterou zrovna jedeme,
      // neprojeví vůbec.
      if (jedeSe() && S.activeTab === 'plan') {
        const kam = await vyberZeSeznamu({
          nadpis: 'Kam to zařadit?',
          polozky: [
            { id: 'dalsi', popisek: 'Jako další cíl', ikona: 'i-nav', meta: 'hned teď' },
            { id: 'konecDne', popisek: 'Na konec dnešního dne', ikona: 'i-clock' },
            { id: 'den', popisek: 'Do konkrétního dne…', ikona: 'i-kalendar' },
          ],
        })
        if (kam === null) return
        let cil = kam
        if (kam === 'den') {
          const dnyCesty = store.cesta.dny && store.cesta.dny.length ? store.cesta.dny : [store.cesta.zastavky.length]
          const vybrany = await vyberZeSeznamu({
            nadpis: 'Do kterého dne?',
            polozky: dnyCesty.map((d, i) => ({
              id: String(i + 1),
              popisek: `Den ${i + 1}`,
              ikona: 'i-kalendar',
              meta: d ? `${d} ${sklonuj(d, 'zastávka', 'zastávky', 'zastávek')}` : 'volno',
            })),
          })
          if (vybrany === null) return
          cil = Number(vybrany)
        }
        // Vlastní bod v cestě nefunguje – otisk klíčuje id míst z databáze.
        // Nejdřív se tedy vrátí do trasy jako bod a pak se ukáže na mapě.
        const bodVKosiku = bodyVKosiku().find((x) => x.id === id)
        if (bodVKosiku) {
          if (!prehodBod(id, { den: kolikatyDenCesty(store.cesta) })) return
        } else if (!pridejDoCesty(id, cil)) {
          return toast('Tohle místo na cestě už je')
        }
        vyhodZKosiku(id)
        toast(cil === 'dalsi' ? 'Jedeme tam – je to další cíl' : 'Přidáno na cestu')
        prekresli()
        return
      }

      // Do kterého dne? U jednodenního plánu je odpověď jediná, u víc dnů
      // se musí zeptat – bez toho by všechno padalo do posledního dne.
      const dny = dnyPlanu()
      let den = 1
      if (dny.length > 1) {
        const vybrany = await vyberZeSeznamu({
          nadpis: 'Do kterého dne?',
          polozky: dny.map((d, i) => ({
            id: String(i + 1),
            popisek: `Den ${i + 1}`,
            ikona: 'i-kalendar',
            meta: d.length ? `${d.length} ${sklonuj(d.length, 'zastávka', 'zastávky', 'zastávek')}` : 'volno',
          })),
        })
        if (vybrany === null) return
        den = Number(vybrany)
      }

      // Vlastní bod není v `store.plan` – je to blok, kterému se jen sundá
      // `vKosiku` a nastaví den. Místo z databáze jde do plánu jako dřív.
      const bod = bodyVKosiku().find((x) => x.id === id)
      if (bod) {
        if (!prehodBod(id, { den })) return
      } else {
        if (store.plan.includes(id)) return toast('Tohle místo už v itineráři je')
        // Nová zastávka patří na konec zvoleného dne, ne na konec plánu –
        // jinak by výběr dne nic neznamenal.
        const cil = Math.min(den, dny.length) - 1
        dny[cil].push(id)
        store.plan = dny.flat()
        if (!nastavDny(dny.map((d) => d.length))) return
      }
      // Z košíku ven: místo je teď v trase a na dvou místech naráz by mátlo.
      vyhodZKosiku(id)
      toast(`Přidáno do ${den}. dne`)
      prekresli()
    }
  }

  const pridatVlastni = wrap.querySelector('#kosikPridatVlastni')
  if (pridatVlastni) pridatVlastni.onclick = () => pruvodceVlastnihoMista(prekresli)
}

/**
 * Průvodce vlastním místem DO KOŠÍKU: druh → název → poloha.
 *
 * Proti průvodci v Itineráři (`plan.js#pridejBodPruvodce`) chybí dvě věci
 * a obojí schválně: **den** (v košíku pořadí ani dny nejsou, to je celý jeho
 * smysl) a **start/cíl** (ty mají pevné místo na krajích plánu, do hromádky
 * nápadů nepatří).
 *
 * @param {() => void} prekresli
 */
async function pruvodceVlastnihoMista(prekresli) {
  const druhy = ['nocleh', 'vlastni']
  const druh = await vyberZeSeznamu({
    nadpis: 'Jaké místo přidat?',
    polozky: druhy.map((id) => ({ id, popisek: DRUHY[id].popisek, ikona: DRUHY[id].ikona })),
  })
  if (druh === null) return

  const nazev = await zadej({
    nadpis: 'Jak se to jmenuje?',
    vychozi: DRUHY[druh].popisek,
    placeholder: 'třeba Kemp u splavu',
  })
  if (nazev === null) return

  const zaloz = (lat, lon) => {
    const id = pridejBod({ druh, nazev: nazev.trim(), lat, lon, vKosiku: true })
    if (!pridejDoKosiku(id)) return
    toast(lat != null ? 'Přidáno do košíku' : 'Přidáno do košíku – polohu doplň, až budeš vědět')
    prekresli()
  }

  const zpusob = await vyberZeSeznamu({
    nadpis: 'Kde to je?',
    polozky: [
      { id: 'odkaz', popisek: 'Vložit odkaz nebo souřadnice', ikona: 'i-copy', meta: 'Google, Mapy.cz, GPS' },
      { id: 'adresa', popisek: 'Najít adresu', ikona: 'i-hledat', meta: 'jen online' },
      { id: 'mapa', popisek: 'Ťuknout do mapy', ikona: 'i-map' },
      { id: 'pozdeji', popisek: 'Zatím bez polohy', ikona: 'i-clock' },
    ],
  })
  if (zpusob === null) return
  if (zpusob === 'pozdeji') return zaloz(null, null)

  if (zpusob === 'odkaz') {
    const text = await zadej({ nadpis: 'Odkaz nebo souřadnice', placeholder: 'https://maps.app… nebo 46.138, 12.435' })
    if (text === null) return
    const gps = rozpoznejSouradnice(text)
    if (!gps) {
      toast('Souřadnice se nepodařilo rozpoznat – doplníš je později')
      return zaloz(null, null)
    }
    return zaloz(gps.lat, gps.lon)
  }

  if (zpusob === 'adresa') {
    const dotaz = await zadej({ nadpis: 'Hledat adresu', placeholder: 'Riva del Garda, kemp…' })
    if (dotaz === null || !dotaz.trim()) return
    let vysledky
    try {
      vysledky = await hledejAdresu(dotaz)
    } catch {
      toast('Hledání adresy potřebuje internet')
      return zaloz(null, null)
    }
    if (!vysledky.length) {
      toast('Adresa se nenašla – zkus to jinak, nebo ťukni do mapy')
      return zaloz(null, null)
    }
    const vyber = await vyberZeSeznamu({
      nadpis: 'Který z nich?',
      polozky: vysledky.map((v, i) => ({ id: String(i), popisek: v.popisek, ikona: 'i-pinme' })),
    })
    if (vyber === null) return zaloz(null, null)
    const v = vysledky[Number(vyber)]
    return zaloz(v.lat, v.lon)
  }

  // Ťuknutí do mapy odvede pryč z Plánu; plát se schová sám (CSS podle
  // body[data-tab]) a po návratu se zase ukáže s novým místem uvnitř.
  if (zpusob === 'mapa') return vyberBod((lat, lon) => zaloz(lat, lon))
}

/* ================= Co dál? ================= */

/**
 * Nálady jako filtr tipů. Bere se z `HOME_MOODS`, aby „chuť na hory" znamenala
 * na Domů i na cestě totéž – dvě různé definice by se rozešly.
 * `near` a `tip` se vynechávají: nemají `kat` a chovají se jinak.
 */
const CHUTE = HOME_MOODS.filter((m) => Array.isArray(m.kat) && m.kat.length)

/** Která chuť je zrovna vybraná. Jen v paměti – je to rozhodnutí na pět minut. */
let chut = ''

/**
 * Tipy na pokračování: nejbližší místa od `odkud`, případně zúžená chutí.
 *
 * Vynechává, co je v itineráři (tam už jedeš) a co je odznačené jako
 * navštívené. Místa z košíku dostávají přednost – „tohle sis chtěl vidět
 * a je to kousek" je lepší tip než cokoli náhodného.
 *
 * @param {{lat:number, lon:number}} odkud
 * @returns {Array<{p: Record<string, any>, km: number, vKosiku: boolean}>}
 */
export function tipyOdsud(odkud) {
  if (!odkud || !Number.isFinite(odkud.lat)) return []
  const kategorie = chut ? new Set((CHUTE.find((c) => c.id === chut) || {}).kat || []) : null
  const vPlanu = new Set(store.plan)

  return (S.places || [])
    .filter((p) => !vPlanu.has(p.id))
    .filter((p) => store.stav[p.id] !== 'visited')
    .filter((p) => !kategorie || kategorie.has(p.k))
    .map((p) => ({ p, km: dkm(odkud, p), vKosiku: vKosiku(p.id) }))
    .filter((x) => x.km <= TIPY_KM)
    .sort((a, b) => (a.vKosiku === b.vKosiku ? a.km - b.km : a.vKosiku ? -1 : 1))
    .slice(0, TIPY_POCET)
}

/** Jeden tip. */
function tipRadek({ p, km, vKosiku: vKos }) {
  const kat = KAT[p.k] || {}
  const o = obrazekMista(p, PHOTOS)
  return `<div class="tip-radek" data-tip="${p.id}">
    <img class="tip-obr" src="${o.src}" alt="" loading="lazy" decoding="async" width="52" height="52"
      style="object-position:${o.vyrez}"
      ${o.zaloha ? `data-zaloha="${o.zaloha}" onerror="this.onerror=null;this.src=this.dataset.zaloha"` : ''}>
    <div class="tip-text">
      <h3>${esc(p.n)}${vKos ? ` <span class="tip-znak" title="Máš ho v košíku">${IC('i-star')}</span>` : ''}</h3>
      <div class="tip-meta">
        <span style="color:${kat.c || 'var(--text2)'}">${IC(kat.i || 'i-spark')}${esc(p.k || '')}</span>
        <span class="tecka">•</span>${fmtKm(km)}
        <span class="tecka">•</span>${dobaJizdy(km)}
      </div>
    </div>
    <div class="tip-akce">
      <button class="btn small primary" data-tip-plan="${p.id}">Do itineráře</button>
      ${vKos ? '' : `<button class="btn small" data-tip-kos="${p.id}">Do košíku</button>`}
    </div>
  </div>`
}

/**
 * Karta „Co dál?" – ukazuje se pod dnešní zastávkou na kartě Na cestě.
 *
 * `odkud` je poloha z GPS, nebo poslední odznačená zastávka jako záloha
 * (viz `vychoziBod()` v cesta.js). Bez obojího se karta nekreslí – tipy
 * odnikud nedávají smysl.
 *
 * `tipy` počítá volající (`cesta.js#coDal()`) přes `tipyOdsud(odkud)` – ne
 * tahle funkce sama, protože stejný výsledek potřebuje i zapsat do
 * `S.coDalId` (map/map.js#draw() ho čte pro mód „oko"), a počítat tipy
 * dvakrát by bylo zbytečné.
 *
 * @param {{lat:number, lon:number}|null} odkud
 * @param {Array<{p: Record<string, any>, km: number, vKosiku: boolean}>} tipy
 * @param {string} popisOdkud  odkud se měří, do popisku
 * @returns {string}
 */
export function coDalHtml(odkud, tipy, popisOdkud = '') {
  if (!odkud) return ''

  const pilulky = CHUTE.map(
    (c) => `<button class="chut-pill${chut === c.id ? ' on' : ''}" data-chut="${c.id}"
      style="--pc:${c.c}">${IC(c.ic)}${esc(c.l)}</button>`
  ).join('')

  return `
    <div class="sekce"><span class="sekce-text">Co dál?</span>
      ${popisOdkud ? `<span class="sekce-pozn">${esc(popisOdkud)}</span>` : ''}</div>
    <div class="chute">${chut ? `<button class="chut-pill zrus" data-chut="">${IC('i-x')}</button>` : ''}${pilulky}</div>
    ${
      tipy.length
        ? tipy.map(tipRadek).join('')
        : `<div class="meta tip-prazdno">${
            chut ? 'Na tuhle chuť tu nic poblíž není. Zkus jinou.' : 'Do 150 km odsud nic dalšího nemáme.'
          }</div>`
    }`
}

/**
 * Naváže obsluhu „Co dál?".
 * @param {HTMLElement} wrap
 * @param {() => void} prekresli
 */
export function napojCoDal(wrap, prekresli) {
  for (const b of wrap.querySelectorAll('[data-chut]')) {
    b.onclick = () => {
      // Druhé ťuknutí na tutéž chuť ji zruší – filtr má jít vypnout stejnou
      // cestou, jakou se zapnul.
      const nova = b.dataset.chut
      chut = chut === nova ? '' : nova
      prekresli()
    }
  }

  for (const b of wrap.querySelectorAll('[data-tip-plan]')) {
    b.onclick = () => {
      const id = b.dataset.tipPlan
      if (store.plan.includes(id)) return toast('Tohle místo už v itineráři je')
      store.plan.push(id)
      vyhodZKosiku(id)
      if (!save()) return
      toast('Přidáno do itineráře')
      prekresli()
    }
  }

  for (const b of wrap.querySelectorAll('[data-tip-kos]')) {
    b.onclick = () => {
      if (!pridejDoKosiku(b.dataset.tipKos)) return
      toast('Uloženo do košíku')
      prekresli()
    }
  }
}
