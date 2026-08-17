/**
 * Názvy zemí na malované mapě.
 *
 * Předloha `grafika/…11_09_49 (1).png` má přes mapu rozepsané názvy zemí
 * patkovým písmem – Norsko, Švédsko, Dánsko, Německo, Polsko, Francie,
 * Rakousko, Itálie, Slovinsko, Chorvatsko. Česky, ne anglicky.
 *
 * PROČ RUČNÍ SEZNAM: `basemap.json` má obrysy zemí, ale ne jejich jména –
 * `scripts/make-basemap.mjs` je při zjednodušování zahazuje, protože do té
 * doby k ničemu nebyly. Natural Earth by navíc dalo anglické názvy a bod
 * uprostřed obrysu, který u Norska nebo Chorvatska padne do moře. Ručně
 * umístěný popisek je krátký, český a sedí tam, kde ho člověk čeká.
 *
 * Souřadnice jsou [lat, lon] jako všude v mapě. Nejsou to hlavní města ani
 * těžiště – je to místo, kde nápis nepřekáží pobřeží ani sousedovi.
 *
 * Nejsou tu všechny země Evropy: velmi malé (Lucembursko, Černá Hora, Malta)
 * by se do popisku nevešly a mapa by z nich byla kaše.
 */

/** @type {Array<[number, number, string]>} lat, lon, název */
export const STATY = [
  [61.5, 9.5, 'Norsko'],
  [61.0, 15.5, 'Švédsko'],
  [63.5, 26.0, 'Finsko'],
  [56.1, 9.4, 'Dánsko'],
  [64.9, -18.6, 'Island'],
  [53.3, -8.0, 'Irsko'],
  [53.6, -1.9, 'Británie'],
  [52.2, 5.6, 'Nizozemsko'],
  [50.5, 4.5, 'Belgie'],
  [51.0, 10.2, 'Německo'],
  [52.2, 19.5, 'Polsko'],
  [49.8, 15.4, 'Česko'],
  [48.7, 19.5, 'Slovensko'],
  [47.5, 14.3, 'Rakousko'],
  [46.8, 8.2, 'Švýcarsko'],
  [46.8, 2.4, 'Francie'],
  [40.2, -3.7, 'Španělsko'],
  [39.6, -8.2, 'Portugalsko'],
  [43.0, 12.4, 'Itálie'],
  [46.1, 14.9, 'Slovinsko'],
  [45.3, 16.4, 'Chorvatsko'],
  [44.1, 17.8, 'Bosna'],
  [44.1, 20.9, 'Srbsko'],
  [47.0, 19.4, 'Maďarsko'],
  [45.9, 25.0, 'Rumunsko'],
  [42.7, 25.3, 'Bulharsko'],
  [39.4, 22.3, 'Řecko'],
  [41.0, 20.1, 'Albánie'],
  [49.2, 31.0, 'Ukrajina'],
  [53.7, 28.0, 'Bělorusko'],
  [55.3, 23.9, 'Litva'],
  [56.9, 24.9, 'Lotyšsko'],
  [58.7, 25.6, 'Estonsko'],
]
