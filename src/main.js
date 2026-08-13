/**
 * Vstupní bod aplikace – jen poskládá díly dohromady.
 *
 * Pořadí je stejné jako v původním souboru: nejdřív se postaví mapa a ovládání,
 * pak se naplní filtry, překreslí se a nakonec se zapne první záložka.
 * Kdo co překresluje, je vidět v odběrech událostí níž.
 */

import './styles/index.css'

import { S, on } from './core/store.js'
import { spustRouter, aktivujZalozku } from './core/router.js'
import { vlozSprite } from './icons/sprite.js'

import { initMapa, draw, goTo, zobrazPolohu, mapa } from './map/map.js'
import { initChipy } from './components/chip.js'
import { initFilterPanel, fillSelects } from './components/filterPanel.js'
import { initSheet } from './components/sheet.js'
import { initWizard } from './components/wizard.js'
import { initIntro } from './components/intro.js'

import { registrujZalozky } from './views/index.js'
import { openDetail } from './views/detail/detail.js'
import { renderHome } from './views/home/home.js'
import { renderDisc } from './views/discover/discover.js'
import { renderList } from './views/list/list.js'
import { renderPlan } from './views/plan/plan.js'

import { registrujServiceWorker } from './pwa/register.js'

/* ---------- statické části stránky ---------- */

vlozSprite()

/* ---------- mapa a ovládání ---------- */

initMapa()
initChipy()
initSheet()
initFilterPanel()
initWizard()

for (const b of document.querySelectorAll('#tabs button')) {
  b.onclick = () => aktivujZalozku(b.dataset.tab)
}

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

/** Klik na špendlík nebo skok z jiné obrazovky otevře detail. */
on('otevriDetail', ({ p, focus }) => openDetail(p, focus))

/** Klik na souseda na mini-mapě. */
on('skoc', (p) => goTo(p))

/** Po nalezení polohy: puntík, posun mapy, překreslení otevřené obrazovky. */
on('poloha', () => {
  zobrazPolohu()
  if (S.activeTab === 'map') mapa.setView([S.userPos.lat, S.userPos.lon], 9)
  if (S.activeTab === 'list') renderList()
  if (S.activeTab === 'disc') renderDisc()
  if (S.activeTab === 'home') renderHome()
})

/* ---------- start ---------- */

registrujZalozky()
initIntro()
fillSelects()
draw()
spustRouter()
registrujServiceWorker()
