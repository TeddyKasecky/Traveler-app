/**
 * Vstupní bod aplikace – jen poskládá díly dohromady.
 *
 * Pořadí je stejné jako v původním souboru: nejdřív se postaví mapa a ovládání,
 * pak se naplní filtry, překreslí se a nakonec se zapne první záložka.
 * Kdo co překresluje, je vidět v odběrech událostí níž.
 */

import './styles/index.css'

import { S, on, save, pripravFotky } from './core/store.js'
import { spustRouter, aktivujZalozku } from './core/router.js'
import { zjistiPolohu } from './core/geo.js'
import { initMotiv } from './core/motiv.js'
import { vlozSprite } from './icons/sprite.js'

import { initMapa, draw, goTo, zobrazPolohu, mapa } from './map/map.js'
import { prebarviPodklad } from './map/offlineMap.js'
import { initChipy } from './components/chip.js'
import { initFilterPanel, fillSelects, stahniZalohu } from './components/filterPanel.js'
import { ukazPruh } from './components/pruh.js'
import { initSheet, jeOtevreny as jeOtevrenyDetail } from './components/sheet.js'
import { initWizard } from './components/wizard.js'
import { initIntro } from './components/intro.js'
import { initAddForm } from './components/addForm.js'
import { initPorovnani } from './views/porovnani/porovnani.js'

import { registrujZalozky } from './views/index.js'
import { openDetail } from './views/detail/detail.js'
import { renderHome } from './views/home/home.js'
import { renderDisc } from './views/discover/discover.js'
import { renderList } from './views/list/list.js'
import { renderPlan } from './views/plan/plan.js'

import { registrujServiceWorker } from './pwa/register.js'

/* ---------- statické části stránky ---------- */

vlozSprite()

// Před postavením mapy: Leaflet si barvy čte z CSS při stavbě vrstev.
initMotiv()

/* ---------- mapa a ovládání ---------- */

initMapa()
initChipy()
initSheet()
initFilterPanel()
initWizard()
// Až za panely: registrace overlaye určuje, co zavře tlačítko zpět jako první.
initAddForm()
// Porovnání se otevírá z detailu, takže musí být nad ním.
initPorovnani()

for (const b of document.querySelectorAll('#tabs button')) {
  b.onclick = () => aktivujZalozku(b.dataset.tab)
}

// Původně index-original.html:1240. Při rozdělení do modulů se tenhle řádek
// ztratil a tlačítko „Moje poloha“ přestalo cokoli dělat – odhalil to až
// scripts/check-handlers.mjs, který napojení porovnává s originálem za běhu.
document.getElementById('fabLoc').onclick = zjistiPolohu

// Profil nemá tlačítko ve spodní liště, otevírá se z hlavičky.
document.getElementById('profilOpen').onclick = () => aktivujZalozku('profil')

/* ---------- kdo na co reaguje ---------- */

/**
 * Po překreslení mapy se obnoví i otevřený panel.
 * Pořadí je stejné jako v původní funkci draw(): seznam, objevuj, plán.
 * Plán se překresluje vždycky – drží počítadlo na tlačítku záložky.
 */
on('prekresleno', () => {
  if (S.activeTab === 'list') renderList()
  if (S.activeTab === 'disc') renderDisc()
  renderPlan()
})

/**
 * Přepnul se vzhled.
 *
 * CSS se přebarví samo, ale Leaflet zapisuje barvy do atributů SVG a do
 * plátna – ty se změnou proměnné nepřepočítají. Překreslit se proto musí
 * ručně: podklad zjednodušené mapy, puntík polohy a čára plánu (tu obnoví
 * draw()).
 */
on('motivZmenen', () => {
  prebarviPodklad()
  zobrazPolohu()
  draw()
})

/** Klik na špendlík nebo skok z jiné obrazovky otevře detail. */
on('otevriDetail', ({ p, focus }) => openDetail(p, focus))

/** Klik na souseda na mini-mapě. */
on('skoc', (p) => goTo(p))

/**
 * Fotky se dočetly z IndexedDB.
 *
 * Trvá to jednotky milisekund, takže se skoro nikdy nestane, že by mezitím byl
 * otevřený detail. Kdyby ano, překreslí se – jinak by u místa chyběla fotka,
 * kterou uživatel má.
 */
on('fotkyNacteny', () => {
  if (jeOtevrenyDetail() && S.hiId && S.byId[S.hiId]) openDetail(S.byId[S.hiId], false)
})

/**
 * Zápis do úložiště selhal.
 *
 * Trvalý pruh, ne toast: kdo si toho nevšimne, přijde o poznámky. Jediná
 * záchrana je stáhnout zálohu, tak je tlačítko rovnou v něm.
 */
on('ulozeniSelhalo', ({ plno }) => {
  ukazPruh({
    text: plno
      ? 'Paměť je plná – změny se neukládají. Stáhni zálohu a smaž pár fotek.'
      : 'Změny se nedaří uložit. Stáhni zálohu, ať o nic nepřijdeš.',
    tlacitko: 'Záloha',
    akce: stahniZalohu,
  })
})

/** Po nalezení polohy: puntík, posun mapy, překreslení otevřené obrazovky. */
on('poloha', () => {
  zobrazPolohu()
  if (S.activeTab === 'map') mapa.setView([S.userPos.lat, S.userPos.lon], 9)
  if (S.activeTab === 'list') renderList()
  if (S.activeTab === 'disc') renderDisc()
  if (S.activeTab === 'home') renderHome()
})

/* ---------- rozepsaná poznámka se nesmí ztratit ---------- */

// Psaní poznámky ukládá až se přestane psát (store.saveOdlozene). Když se mezitím
// aplikace zavře nebo přepne na pozadí, musí se to dopsat hned – `save()` čekající
// zápis zruší a provede ho okamžitě. `pagehide` je jediná událost, na kterou se dá
// na mobilu spolehnout; `visibilitychange` chytí přepnutí do jiné aplikace.
window.addEventListener('pagehide', () => save())
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save()
})

/* ---------- start ---------- */

registrujZalozky()
initIntro()
fillSelects()
draw()
spustRouter()
registrujServiceWorker()

// Až za vykreslením: fotky se čtou z IndexedDB asynchronně a první obraz na ně
// nemá čekat. Součástí je i stěhování ze starého localStorage.
pripravFotky()
