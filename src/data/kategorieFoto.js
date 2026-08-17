/**
 * Zástupné ilustrace pro místa bez vlastní fotky.
 *
 * 318 z 580 míst nemá `img`. Do léta 2026 se jim kreslila pohlednice
 * generovaná z `id` (`src/components/postcard.js`); grafický manuál k tomu
 * dodal deset akvarelů, po jednom na kategorii.
 *
 * Pohlednice **zůstává** jako záchrana, když se obrázek nenačte, a v single-file
 * variantě jako jediná ilustrace v detailu (viz níž).
 *
 * PROČ SE STEJNÁ FOTKA NEOPAKUJE OKÁM DO OMRZENÍ: výřez se odvozuje z `hash(id)`,
 * takže každé místo ukazuje jinou část obrázku. `id` se nikdy nemění, takže
 * je výřez stabilní – místo vypadá pokaždé stejně.
 */

import { hash } from '../components/postcard.js'

import ferraty320 from '../assets/kategorie/ferraty-320.webp'
import bikeparky320 from '../assets/kategorie/bikeparky-320.webp'
import soutesky320 from '../assets/kategorie/soutesky-320.webp'
import vodopady320 from '../assets/kategorie/vodopady-320.webp'
import hory320 from '../assets/kategorie/hory-320.webp'
import jezera320 from '../assets/kategorie/jezera-320.webp'
import jeskyne320 from '../assets/kategorie/jeskyne-320.webp'
import mesta320 from '../assets/kategorie/mesta-320.webp'
import spani320 from '../assets/kategorie/spani-320.webp'
import ostatni320 from '../assets/kategorie/ostatni-320.webp'

const MALE = {
  'Ferraty': ferraty320,
  'Bikeparky': bikeparky320,
  'Soutěsky': soutesky320,
  'Vodopády': vodopady320,
  'Hory a túry': hory320,
  'Jezera': jezera320,
  'Jeskyně a podzemí': jeskyne320,
  'Města a památky': mesta320,
  'Spaní': spani320,
  'Ostatní zajímavosti': ostatni320,
}

/**
 * Velká sada jen pro hostovanou variantu.
 *
 * Single-file varianta inlinuje všechno jako data URI, takže by ji 540 kB
 * velkých ilustrací nafouklo skoro o tři čtvrtě megabajtu – a ten soubor se
 * nosí na flashce a posílá mailem. `import.meta.env.SINGLE_FILE` je konstanta
 * dosazená při buildu, takže Rollup celou větev i s importy vyhodí.
 *
 * Ověřuje se to počtem `data:image/webp` v `dist-single/index.html`:
 * musí jich být deset, ne dvacet.
 */
const VELKE = import.meta.env.SINGLE_FILE
  ? null
  : {
      'Ferraty': new URL('../assets/kategorie/ferraty-720.webp', import.meta.url).href,
      'Bikeparky': new URL('../assets/kategorie/bikeparky-720.webp', import.meta.url).href,
      'Soutěsky': new URL('../assets/kategorie/soutesky-720.webp', import.meta.url).href,
      'Vodopády': new URL('../assets/kategorie/vodopady-720.webp', import.meta.url).href,
      'Hory a túry': new URL('../assets/kategorie/hory-720.webp', import.meta.url).href,
      'Jezera': new URL('../assets/kategorie/jezera-720.webp', import.meta.url).href,
      'Jeskyně a podzemí': new URL('../assets/kategorie/jeskyne-720.webp', import.meta.url).href,
      'Města a památky': new URL('../assets/kategorie/mesta-720.webp', import.meta.url).href,
      'Spaní': new URL('../assets/kategorie/spani-720.webp', import.meta.url).href,
      'Ostatní zajímavosti': new URL('../assets/kategorie/ostatni-720.webp', import.meta.url).href,
    }

/**
 * Adresa zástupné ilustrace, nebo `''` když pro kategorii žádná není.
 * @param {Record<string, any>} p
 * @param {'male'|'velke'} [velikost]
 * @returns {string}
 */
export function fotoKategorie(p, velikost = 'male') {
  const sada = velikost === 'velke' ? VELKE || MALE : MALE
  return sada[p.k] || ''
}

/**
 * Obrázek místa i s náhradou, kdyby se nenačetl.
 *
 * Fotka z Wikimedie je cizí zdroj: bez signálu, po přejmenování souboru nebo
 * při blokovaném obsahu se prostě nenačte a v řádku zůstane prázdný rámeček
 * s ikonou rozbitého obrázku. Akvarel kategorie je náš, v balíčku, a načte
 * se vždycky – proto je záchranou.
 *
 * @param {Record<string, any>} p
 * @param {Record<string, string>} fotky  obsah PHOTOS
 * @returns {{src: string, zaloha: string, vyrez: string}}
 */
export function obrazekMista(p, fotky = {}) {
  const vlastni = fotky[p.id]
  const kategorie = fotoKategorie(p)
  return {
    src: vlastni || p.img || kategorie,
    // Vlastní vyfocená fotka je z IndexedDB, ta selhat nemůže – u ní záchrana
    // nedává smysl a jen by blikla.
    zaloha: vlastni ? '' : kategorie,
    vyrez: vyrez(p),
  }
}

/**
 * Svislý posun výřezu, aby dvě místa téže kategorie nevypadala stejně.
 * Vrací hodnotu pro `object-position`.
 * @param {Record<string, any>} p
 * @returns {string}
 */
export function vyrez(p) {
  return `50% ${20 + (hash(p.id) % 61)}%`
}
