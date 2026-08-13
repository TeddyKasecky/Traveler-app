/**
 * Vstupní bod aplikace.
 *
 * DOČASNÝ OBSAH – probíhá fáze 3, migrace kódu po krocích.
 * Hotové zatím: styly, fonty, sada ikon.
 */

import './styles/index.css'
import { vlozSprite, IC } from './icons/sprite.js'

vlozSprite()

document.getElementById('app').innerHTML =
  `<p style="padding:20px;font-weight:700">${IC('i-van', 'font-size:24px')} ` +
  'Vandrbuch – migrace kódu probíhá (fáze 3).</p>'
