/**
 * Vstupní bod aplikace.
 *
 * DOČASNÝ OBSAH – fáze 1 (skelet projektu). Slouží jen k ověření, že build
 * projde v obou variantách. Skutečná logika se sem přesune ve fázi 3.
 */

document.getElementById('app').textContent =
  'Vandrbuch – skelet projektu. Migrace kódu probíhá ve fázi 3.'

console.info(
  'build:',
  import.meta.env.SINGLE_FILE ? 'single-file' : 'hostovaný web'
)
