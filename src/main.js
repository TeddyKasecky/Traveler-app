/**
 * Vstupní bod aplikace.
 *
 * DOČASNÝ OBSAH – probíhá fáze 3, migrace kódu po krocích.
 * Hotové zatím: styly, fonty, ikony, core (stav, filtry, hledání, geo, CSV, router).
 */

import './styles/index.css'
import { vlozSprite, IC } from './icons/sprite.js'
import { S } from './core/store.js'
import { visible } from './core/filters.js'

vlozSprite()

document.getElementById('app').innerHTML =
  `<p style="padding:20px;font-weight:700">${IC('i-van', 'font-size:24px')} ` +
  `Vandrbuch – migrace kódu probíhá (fáze 3). Načteno ${S.places.length} míst, ` +
  `filtrem prochází ${visible().length}.</p>`
