/**
 * Detail místa ve vysouvacím panelu.
 *
 * Vykresluje se celý znovu při každé změně (hvězdička, priorita, fotka).
 * Je to hloupé, ale je to tak od začátku a při jednom místě to nic nestojí.
 */

import { S, store, save, saveOdlozene, PHOTOS } from '../../core/store.js'
import { esc } from '../../core/html.js'
import { dkm, fmtKm } from '../../core/geo.js'
import { KAT } from '../../data/categories.js'
import { IC } from '../../icons/sprite.js'
import { otevriSheet, teloSheetu, jeOtevreny } from '../../components/sheet.js'
import { flames, setPrio, PRIO_LBL } from '../../components/prio.js'
import { scene } from '../../components/postcard.js'
import { priceChip, bpWeb } from '../../components/priceChip.js'
import { fotoKategorie, vyrez } from '../../data/kategorieFoto.js'
import { pridejDoPorovnani } from '../porovnani/porovnani.js'
import { addPhoto, smazFotku } from '../../components/photos.js'
import { toast } from '../../components/toast.js'
import { zadej } from '../../components/dialog.js'
import { vytvorMiniMapu, zavriMiniMapu } from '../../map/detailMap.js'
import { goTo, draw } from '../../map/map.js'
import { togglePlan } from '../plan/plan.js'
import { vKosiku, prepniKosik } from '../plan/kosik.js'
import { renderHome } from '../home/home.js'

/** Popisky stavu parkoviště pro Transit vysoký 2,6 m. */
const TRANSIT = {
  verified: 'Ověřeno pro Transit 2,6 m',
  likely: 'Pravděpodobně vhodné pro vysokou dodávku',
  unknown: 'Výška a příjezd nejsou ověřené',
  no: 'Nevhodné pro Transit 2,6 m',
}

/** Pořadové číslo mini-mapy, ať má každé otevření vlastní id prvku. */
let mmSeq = 0

/** Které místo je v panelu právě vykreslené. Viz posun níž. */
let vykreslene = null

/**
 * Otevře detail místa.
 * @param {Record<string, any>} p
 * @param {boolean} [focus]  false = nezvýrazňovat špendlík (překreslení na místě)
 */
export function openDetail(p, focus) {
  const k = KAT[p.k] || { c: 'var(--rust)', i: 'i-spark' }
  const r = store.rating[p.id] || 0
  const visited = store.stav[p.id] === 'visited'
  const inPlan = store.plan.includes(p.id)

  const gmView = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`
  const gmNav = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=driving`
  const pk = p.parking || null
  const pkNav = pk ? `https://www.google.com/maps/dir/?api=1&destination=${pk.lat},${pk.lon}&travelmode=driving` : ''
  const pkView = pk ? `https://www.google.com/maps/search/?api=1&query=${pk.lat},${pk.lon}` : ''
  const pkFind = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('parking near ')}${p.lat},${p.lon}`
  const imgQ = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
    [p.n.split(/\s[–(]/)[0].trim(), p.r || '', p.z || ''].filter(Boolean).join(' ')
  )}`
  const mc = `https://mapy.com/turisticka?x=${p.lon}&y=${p.lat}&z=15`
  const wx = `https://www.windy.com/?${p.lat},${p.lon},10`
  const mmid = `mm${++mmSeq}`

  // Víc adres se odděluje " | " včetně mezer – jiný oddělovač by se nerozdělil.
  const links = [
    ...(p.w
      ? p.w
          .split(' | ')
          .filter(Boolean)
          .map(
            (u) =>
              `<a href="${u}" target="_blank" rel="noopener">${IC('i-globe', 'font-size:14px')} ${esc(
                u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
              )}</a>`
          )
      : []),
  ].join('<br>')

  /**
   * Instagram jako karta, ne řádek na konci seznamu odkazů.
   *
   * Pole `ig` má vyplněných 454 z 580 míst – nejvíc nevyužitá data v aplikaci.
   * Do teď to byl textový odkaz úplně dole, kam nikdo nedoscrolloval.
   */
  const instagram = (p.ig || '')
    .split(' | ')
    .filter((u) => u.startsWith('http'))
    .map(
      (u) => `<a class="igkarta" href="${u}" target="_blank" rel="noopener noreferrer">
        <span class="igico">${IC('i-cam')}</span>
        <span class="igtxt"><b>Instagram</b><small>${esc(u.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, ''))}</small></span>
        ${IC('i-sipka', 'font-size:15px;opacity:.55')}</a>`
    )
    .join('')

  // Sousedi, kteří v datech opravdu jsou. Vzdálenost se bere z dat, nepočítá se.
  const nb = (p.nb || []).map((x) => ({ q: S.byId[x.id], d: x.d })).filter((x) => x.q)
  const photo = PHOTOS[p.id] || p.img || ''
  // Bez vlastní fotky nastoupí akvarel podle kategorie; kreslená pohlednice
  // zůstává jako záchrana, když se obrázek nenačte (a v single-file variantě,
  // kam se velká sada schválně nebalí).
  const ilustrace = photo ? '' : fotoKategorie(p, 'velke')

  zavriMiniMapu()

  // Kam byl panel posunutý, se musí přečíst dřív, než se obsah přepíše.
  // Vrací se to na konci funkce, a jen když jde o překreslení téhož místa
  // v už otevřeném panelu.
  //
  // Posouvá se `#sheetBody` sám (`#sheet .body{overflow-y:auto}`), ne jeho
  // rodič. Do teď tu stálo `telo.parentElement.scrollTop = 0`, což psalo do
  // `#sheet`, který se neposouvá – ten řádek nikdy nic nedělal.
  const kde = teloSheetu().scrollTop
  const prekresleniNaMiste = jeOtevreny() && vykreslene === p.id

  teloSheetu().innerHTML = `
    <div class="hero" style="--pc:${k.c}">
      ${photo ? `<img src="${photo}" alt="">` : ilustrace
        ? `${scene(p)}<img class="heroilu" src="${ilustrace}" alt="" style="object-position:${vyrez(p)}">`
        : scene(p)}
      <div class="herobar">
        <span class="hchip">${IC(k.i)}${esc(p.t)}</span>
        <label class="hbtn" title="Přidat fotku">${IC(photo ? 'i-cam' : 'i-plus')}${photo ? 'Změnit' : 'Fotka'}<input type="file" accept="image/*" id="photoIn" hidden></label>
        ${photo ? `<button class="hbtn" id="photoDel">${IC('i-trash')}</button>` : ''}
      </div>
      ${!photo ? '<span class="heronote">ilustrace</span>' : ''}
    </div>
    <div class="sh-head" style="--pc:${k.c}">
      <div class="sh-badge">${IC(k.i)}</div>
      <div><div class="kat">${esc(p.k)} · ${esc(p.t)}</div>
        <h2>${esc(p.n)}</h2>
        <div class="meta">${esc(p.r || p.z)}${p.r && p.r !== p.z ? ` · ${esc(p.z)}` : ''}${S.userPos ? ` · ${fmtKm(dkm(S.userPos, p))} od tebe` : ''}</div></div>
    </div>
    ${
      // Krátký popis má vyplněných všech 580 míst, ale do teď se v detailu
      // nikde neukazoval – jediné, co o místě řekne jednou větou.
      //
      // U části míst je ale `sh` jen začátek dlouhého popisu `p`. Ukázat obojí
      // by znamenalo přečíst tutéž větu dvakrát pod sebou, tak se v tom případě
      // vynechá – text z `p` je delší a stejně tam je.
      p.sh && !(p.p || '').startsWith(p.sh.slice(0, 40)) ? `<div class="sh-kratky">${esc(p.sh)}</div>` : ''
    }
    <div class="ikonrada">
      <button class="ikonbtn${store.stav[p.id] === 'wish' ? ' on' : ''}" id="dWish" title="Uložit místo">${IC('i-zalozka')}</button>
      <button class="ikonbtn${visited ? ' on' : ''}" id="dVisit" title="Byli jsme tu">${IC('i-check')}</button>
      <button class="ikonbtn${inPlan ? ' on' : ''}" id="dPlan" title="Do plánu">${IC('i-route')}</button>
      <button class="ikonbtn${vKosiku(p.id) ? ' on' : ''}" id="dKosik"
        title="${vKosiku(p.id) ? 'V košíku výpravy' : 'Do košíku – chci vidět, zatím nevím kdy'}">${IC('i-star')}</button>
      <button class="ikonbtn" id="dVice" title="Další akce">${IC('i-vice')}</button>
    </div>
    <div id="dViceMenu" hidden>
      <a href="${wx}" target="_blank" rel="noopener noreferrer">${IC('i-rain')}Počasí na místě</a>
      <a href="${mc}" target="_blank" rel="noopener noreferrer">${IC('i-boot')}Otevřít v Mapy.com</a>
      <a href="${imgQ}" target="_blank" rel="noopener noreferrer">${IC('i-cam')}Fotky ve vyhledávání</a>
      <button id="dPorovnat">${IC('i-sdilet')}Porovnat s jiným místem</button>
    </div>
    <div class="maincta">
      ${pk ? `<a class="gbtn park" href="${pkNav}" target="_blank" rel="noopener noreferrer">${IC('i-van')}<span><b>Navigovat na parkoviště</b><small>${esc(pk.name)}${pk.walk ? ` · ${esc(pk.walk)}` : ''}</small></span>${IC('i-nav', 'font-size:16px;opacity:.6')}</a>` : ''}
      <div class="gbtnrow">
        <a class="gbtn half" href="${gmNav}" target="_blank" rel="noopener noreferrer">${IC('i-nav')}Navigovat k místu</a>
        <a class="gbtn half ghost" href="${gmView}" target="_blank" rel="noopener noreferrer">${IC('i-map')}Ukázat v mapě</a>
      </div>
    </div>
    <div class="facts">
      <div class="fact">${IC('i-euro')}<div><b>Vstup</b><span>${esc(p.c) || '—'}</span></div></div>
      <div class="fact">${IC('i-clock')}<div><b>Doba</b><span>${esc(p.d) || '—'}</span></div></div>
      <div class="fact">${IC('i-kid')}<div><b>Děti</b><span>${esc(p.ch) || '—'}</span></div></div>
      <div class="fact">${IC('i-leaf')}<div><b>Sezóna</b><span>${esc(p.s) || '—'}</span></div></div>
      ${p.ps ? `<div class="fact">${IC('i-paw')}<div><b>Psi</b><span>${esc(p.ps)}</span></div></div>` : ''}
    </div>
    ${
      // Ceny bikeparků bývaly na Domů jako 32 karet přes celou obrazovku.
      // Přestavba je odtamtud odstranila (jedna kategorie z deseti), ale údaje
      // se nesměly ztratit – patří k místu, tak jsou tady.
      p.pv || p.pn || bpWeb(p)
        ? `<div class="cenabox">
      <div class="cenalab">${IC('i-euro')}Denní pass<span class="cenachip">${priceChip(p)}</span></div>
      ${p.pn ? `<div class="cenanote">${esc(p.pn)}</div>` : ''}
      ${
        bpWeb(p)
          ? `<a class="gbtn half ghost" href="${bpWeb(p)}" target="_blank" rel="noopener noreferrer">${IC('i-globe')}Oficiální web a ceník</a>`
          : ''
      }
    </div>`
        : ''
    }
    ${p.p ? `<div class="desc">${esc(p.p)}</div>` : ''}
    <div class="minimap" id="${mmid}"></div>
    <div class="mmbar">${IC('i-pinme', 'font-size:14px')}<span>${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</span>
      <button class="mmcopy" id="copyGps">${IC('i-copy', 'font-size:13px')}GPS</button></div>
    ${
      pk
        ? `<div class="parkbox">
      <div class="pklab">${IC('i-van')}Doporučené parkování</div>
      <div class="pkname">${esc(pk.name)}</div>
      <div class="pkmeta">${pk.price ? `<span>${IC('i-euro', 'font-size:12px')}${esc(pk.price)}</span>` : ''}${pk.walk ? `<span>${IC('i-boot', 'font-size:12px')}${esc(pk.walk)}</span>` : ''}${pk.heightLimit ? `<span>⚠ výška ${esc(String(pk.heightLimit))} m</span>` : ''}</div>
      ${pk.note ? `<div class="pknote">${esc(pk.note)}</div>` : ''}
      <div class="pkstatus s-${pk.transitStatus}">${TRANSIT[pk.transitStatus] || TRANSIT.unknown}</div>
      <div class="gbtnrow">
        <a class="gbtn half" href="${pkNav}" target="_blank" rel="noopener noreferrer">${IC('i-nav')}Navigovat na parkoviště</a>
        <a class="gbtn half ghost" href="${pkView}" target="_blank" rel="noopener noreferrer">${IC('i-map')}Otevřít parkoviště</a>
      </div>
      <div class="pkwarn">Výšku vjezdu si před příjezdem ověřte. Transit má 2,6 m.</div>
    </div>`
        : `<div class="parkbox none">
      <div class="pklab">${IC('i-van')}Parkoviště zatím nemáme ověřené.</div>
      <a class="gbtn half ghost" href="${pkFind}" target="_blank" rel="noopener noreferrer">${IC('i-map')}Vyhledat parkoviště poblíž</a>
      <div class="pkwarn">Výšku vjezdu si před příjezdem ověřte. Transit má 2,6 m.</div>
    </div>`
    }
    ${p.f ? `<div class="lore"><div class="lab">${IC('i-quill')}Z deníku</div><p>${esc(p.f)}</p></div>` : ''}

    ${
      p.av || p.bs
        ? `<div class="sec">${IC('i-ferrata', 'font-size:16px')}Topo a podrobnosti</div><div class="ferbtns">
      ${
        p.bs
          ? `<a class="fbtn bs" href="${p.bs}" target="_blank" rel="noopener">
        <span class="fico">${IC('i-mount')}</span>
        <span class="ftxt"><b>Topo a popis trasy</b><small>${p.pdf ? 'bergsteigen.com · obtížnosti úseků, fotky, GPX' : 'bergsteigen.com · vyhledat ferratu'}</small></span>
        ${IC('i-nav', 'font-size:16px;opacity:.6')}</a>`
          : ''
      }
      ${
        p.pdf
          ? `<a class="fbtn pdf" href="${p.pdf}" target="_blank" rel="noopener">
        <span class="fico">${IC('i-save')}</span>
        <span class="ftxt"><b>Topo ke stažení (PDF)</b><small>vytiskni nebo ulož do mobilu na offline</small></span>
        ${IC('i-nav', 'font-size:16px;opacity:.6')}</a>`
          : ''
      }
      ${
        p.av
          ? `<a class="fbtn av small" href="${p.av}" target="_blank" rel="noopener">
        <span class="fico">${IC('i-book')}</span>
        <span class="ftxt"><b>České info a hodnocení</b><small>Alpský vůdce · web občas nedostupný</small></span>
        ${IC('i-nav', 'font-size:16px;opacity:.6')}</a>`
          : ''
      }
    </div>`
        : ''
    }
    ${
      p.g && p.g.length
        ? `<div class="sec">${IC('i-flag', 'font-size:16px')}Co vzít s sebou</div>
      <div class="gearrow">${p.g.map((g) => `<span class="gear">${IC('i-check')}${esc(g)}</span>`).join('')}</div>`
        : ''
    }
    ${
      nb.length
        ? `<div class="sec">${IC('i-route', 'font-size:16px')}Poblíž</div>
      <div class="nbrow">${nb
        .map((x) => {
          const kk = KAT[x.q.k] || {}
          return `<button class="nbcard" data-nb="${x.q.id}" style="--pc:${kk.c}">${IC(kk.i)}<b>${esc(x.q.n)}</b><span>${fmtKm(x.d)} · ${esc(x.q.t)}</span></button>`
        })
        .join('')}</div>`
        : ''
    }
    <div class="sec">${IC('i-fire', 'font-size:16px')}Jak moc tam chceme?</div>
    <div class="priorow" id="dPrio">${[1, 2, 3]
      .map(
        (v) =>
          `<button data-v="${v}" class="priobtn ${(store.prio[p.id] || 0) === v ? 'on' : ''}">${flames(v, v, 14)}<span>${PRIO_LBL[v]}</span></button>`
      )
      .join('')}</div>
    <div class="sec">${IC('i-star', 'font-size:16px')}Naše hodnocení</div>
    <div class="stars" id="dStars">${[1, 2, 3, 4, 5]
      .map((i) => `<button data-i="${i}" class="${i <= r ? '' : 'off'}" aria-label="${i}">${IC('i-star')}</button>`)
      .join('')}</div>
    <div class="sec">${IC('i-quill', 'font-size:16px')}Poznámka</div>
    <textarea id="noteBox" placeholder="parkál za kostelem · brát hotovost · jet brzy ráno…">${esc(store.notes[p.id] || '')}</textarea>
    ${instagram ? `<div class="sec">${IC('i-cam', 'font-size:16px')}Jak to tam vypadá</div>${instagram}` : ''}
    ${links ? `<div class="sec">${IC('i-globe', 'font-size:16px')}Odkazy</div><div class="links">${links}</div>` : ''}
    <div style="height:10px"></div>`

  otevriSheet()

  /* ---- obsluha ---- */

  const telo = teloSheetu()

  document.getElementById('dPorovnat').onclick = () => pridejDoPorovnani(p)

  // Záložka: „uložit místo". Do teď se dalo nastavit jen ze Seznamu, přestože
  // detail je místo, kde se člověk rozhoduje.
  document.getElementById('dWish').onclick = () => {
    if (store.stav[p.id] === 'wish') delete store.stav[p.id]
    else store.stav[p.id] = 'wish'
    save()
    draw()
    openDetail(p)
  }

  // Vedlejší akce (počasí, Mapy.com, fotky, porovnání) jsou pod „…", ne v řádku
  // pěti tlačítek – manuál má jednu primární akci a zbytek schovaný.
  const vice = document.getElementById('dVice')
  const viceMenu = document.getElementById('dViceMenu')
  vice.onclick = () => {
    viceMenu.hidden = !viceMenu.hidden
    vice.classList.toggle('on', !viceMenu.hidden)
  }

  document.getElementById('dPlan').onclick = () => {
    togglePlan(p.id)
    openDetail(p)
  }
  // Košík je „chci vidět, zatím nevím kdy" – proti plánu, který je závazek
  // s pořadím a dnem. Viz views/plan/kosik.js.
  document.getElementById('dKosik').onclick = () => {
    toast(prepniKosik(p.id) ? 'Uloženo do košíku výpravy' : 'Vyhozeno z košíku')
    openDetail(p)
  }
  document.getElementById('dVisit').onclick = () => {
    store.stav[p.id] = visited ? '' : 'visited'
    save()
    draw()
    if (!visited) toast('Zapsáno do deníku ✓')
    openDetail(p)
  }
  document.getElementById('dStars').onclick = (e) => {
    const b = e.target.closest('button')
    if (!b) return
    const i = +b.dataset.i
    store.rating[p.id] = store.rating[p.id] === i ? 0 : i
    save()
    openDetail(p)
  }
  document.getElementById('dPrio').onclick = (e) => {
    const b = e.target.closest('button')
    if (!b) return
    setPrio(p.id, +b.dataset.v)
    openDetail(p, false)
    if (S.activeTab === 'home') renderHome()
  }
  // Odložené uložení: každý stisk klávesy by jinak převedl na text celý store.
  document.getElementById('noteBox').oninput = (e) => {
    store.notes[p.id] = e.target.value
    saveOdlozene()
  }
  for (const b of telo.querySelectorAll('[data-nb]')) {
    b.onclick = () => {
      const q = S.byId[b.dataset.nb]
      if (q) goTo(q)
    }
  }

  const pin = document.getElementById('photoIn')
  if (pin)
    pin.onchange = (e) => {
      const f = e.target.files[0]
      if (f) addPhoto(p.id, f, () => openDetail(p, false))
    }
  const pdel = document.getElementById('photoDel')
  if (pdel)
    pdel.onclick = () => {
      smazFotku(p.id)
      openDetail(p, false)
    }

  document.getElementById('copyGps').onclick = async () => {
    const t = `${p.lat}, ${p.lon}`
    try {
      await navigator.clipboard.writeText(t)
      toast('Souřadnice zkopírovány')
    } catch {
      zadej({ nadpis: 'Souřadnice', text: 'Zkopíruj ručně:', vychozi: t, ano: 'Zavřít' })
    }
  }

  // Mini-mapa až po vykreslení: dřív má prvek nulovou velikost.
  requestAnimationFrame(() => setTimeout(() => vytvorMiniMapu({ elId: mmid, p, pk, gmView, pkNav }), 180))

  if (focus !== false) S.hiId = p.id

  // Na začátek se odjede jen u JINÉHO místa. Skoro každé tlačítko v detailu
  // (srdce, fajfka, plán, hvězdičky, plamínky, fotky) překresluje panel přes
  // openDetail(), a bezpodmínečná nula znamenala, že po ťuknutí na hvězdičku
  // dole panel odskočil na hero obrázek – ať se sem člověk musel prorolovat
  // znovu, aby viděl, co vlastně nastavil.
  telo.scrollTop = prekresleniNaMiste ? kde : 0
  vykreslene = p.id
}
