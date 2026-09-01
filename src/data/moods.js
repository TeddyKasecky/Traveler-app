/**
 * Nálady na Objevuj – „Na co máte náladu?"
 *
 * NÁLADA JE KATEGORIE, RYCHLÁ INSPIRACE JE STAV (`tadeas-f32-011`, září 2026).
 * Ta dělba je to hlavní, co tenhle soubor drží: nálada odpovídá na „jaké místo
 * chci" (hory, voda, jeskyně), rychlá inspirace v témže Objevuj na „co teď
 * dává smysl" (uložená, slíbili, hodnocená, byli jsme). Bez ní by tam stály
 * dvě velké mřížky dělající totéž pod jinými názvy.
 *
 * Do září 2026 jich bylo šest a posouvaly se do strany. Dnes je jich čtrnáct,
 * zalamují se do řádků a v Profilu se dají po jedné vypínat
 * (`prefs.nalady`) – výchozí zůstává těch původních šest, takže se nikomu nic
 * nezmění, dokud si sám nesáhne.
 *
 * Dvě z nich se chovají jinak než ostatní a nemají proto `kat`:
 *   near … přepne na Objevuj a zeptá se na polohu
 *   tip  … zavolá „Překvap mě"
 * Ostatní nastaví filtr kategorií a přepnou na mapu.
 *
 * BARVY A IKONY SE BEROU Z `categories.js`, ne vymýšlejí znovu – kdyby si je
 * tenhle soubor psal sám, do měsíce by se rozešly s tím, čím jsou kategorie
 * kreslené všude jinde. `check-ikony` na to má vlastní kontrolu.
 *
 * @typedef {Object} Nalada
 * @property {string} id  klíč, ukládá se do prefs.lastMood a prefs.moodUse
 * @property {string} l   popisek na dlaždici
 * @property {string} ic  id symbolu ve sprite
 * @property {string} c   barva – `var(--…)` z tokens.css
 * @property {string[]} [kat]  kategorie, na které nálada přepne filtr
 */

import { KAT } from './categories.js'

/** Nálada postavená na jediné kategorii – ikonu i barvu si vezme z ní. */
const zKategorie = (id, l, kat) => ({ id, l, ic: KAT[kat].i, c: KAT[kat].c, kat: [kat] })

/** @type {Nalada[]} */
export const HOME_MOODS = [
  { id: 'near', l: 'Něco blízko', ic: 'i-pinme', c: 'var(--sky)' },
  { id: 'hory', l: 'Hory a výhledy', ic: 'i-mount', c: 'var(--clay)', kat: ['Hory a túry'] },
  // KOMBINACE, protože „mám náladu na vodu" nerozlišuje jezero od vodopádu.
  // Jednotlivé kategorie jsou k dispozici taky, kdo chce jen jedno.
  { id: 'voda', l: 'Voda', ic: 'i-swim', c: 'var(--lake)', kat: ['Jezera', 'Vodopády', 'Soutěsky'] },
  { id: 'kolo', l: 'Kolo', ic: 'i-bike', c: 'var(--moss)', kat: ['Bikeparky'] },
  { id: 'dobro', l: 'Dobrodružství', ic: 'i-ferrata', c: 'var(--rust)', kat: ['Ferraty', 'Jeskyně a podzemí'] },
  { id: 'tip', l: 'Překvap mě', ic: 'i-sparkles', c: 'var(--sun)' },
  // Od září 2026: samostatné kategorie, které se přes šest výchozích nálad
  // nedaly vybrat vůbec – hlavně „Města a památky" s devadesáti devíti místy.
  zKategorie('mesta', 'Města a památky', 'Města a památky'),
  zKategorie('jezera', 'Jezera', 'Jezera'),
  zKategorie('vodopady', 'Vodopády', 'Vodopády'),
  zKategorie('soutesky', 'Soutěsky', 'Soutěsky'),
  zKategorie('ferraty', 'Ferraty', 'Ferraty'),
  zKategorie('jeskyne', 'Jeskyně', 'Jeskyně a podzemí'),
  zKategorie('spani', 'Kde přespat', 'Spaní'),
  zKategorie('ostatni', 'Zajímavosti', 'Ostatní zajímavosti'),
]

/**
 * Které nálady jsou zapnuté, když si člověk nevybral.
 *
 * Je to přesně těch šest, které tu byly do září 2026 – rozšíření na čtrnáct
 * nesmí nikomu přeskládat Objevuj bez ptaní.
 */
export const VYCHOZI_NALADY = ['near', 'hory', 'voda', 'kolo', 'dobro', 'tip']
