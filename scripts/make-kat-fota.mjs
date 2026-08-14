/**
 * Připraví zástupné ilustrace kategorií z podkladů ve složce `grafika/`.
 *
 *   node scripts/make-kat-fota.mjs
 *
 * Spouští se ručně, jen když se změní podklady. Výsledek je v gitu.
 *
 * CO TO ŘEŠÍ: 318 z 580 míst nemá vlastní fotku. Do teď se jim kreslila
 * pohlednice generovaná z `id` (`src/components/postcard.js`). Grafický manuál
 * k tomu dodal deset akvarelů, přesně po jednom na každou kategorii.
 *
 * DVĚ VELIKOSTI, PROTOŽE MAJÍ RŮZNOU PRÁCI:
 *   320 px  náhled v kartě seznamu – vejde se jich tam 250 najednou
 *   720 px  hlavička detailu přes celou šířku
 * Změřeno: 320 px stojí 130 kB za všech deset, 720 px 540 kB. Jedna společná
 * velikost by buď byla v detailu měkká, nebo by se do karty tahalo šestkrát
 * víc dat, než potřebuje.
 *
 * PROČ NE DO public/: odtamtud by se soubor nedostal do single-file varianty
 * jako data URI a odkaz by z disku vedl do prázdna. Stejný důvod má
 * `scripts/make-icons.mjs` u loga.
 *
 * Zdrojová PNG (27 MB) se do repozitáře nekomitují – táhla by se každému.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { KAT_KEYS } from '../src/data/categories.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ZDROJ = path.join(ROOT, '..', 'grafika', 'zástupná foto podle kategorií')
const CIL = path.join(ROOT, 'src', 'assets', 'kategorie')

/**
 * Kategorie → název souboru v podkladech a název u nás.
 *
 * Podklady mají česká jména s diakritikou a v jednom je překlep („jezkyně“).
 * U nás jsou názvy bez diakritiky: procházejí Vite, service workerem
 * i adresou v CSS a diakritika by se cestou musela kódovat.
 */
const MAPA = {
  'Ferraty': ['ferraty', 'ferraty'],
  'Bikeparky': ['bikeparky', 'bikeparky'],
  'Soutěsky': ['soutěsky', 'soutesky'],
  'Vodopády': ['vodopády', 'vodopady'],
  'Hory a túry': ['hory a túry', 'hory'],
  'Jezera': ['jezera', 'jezera'],
  'Jeskyně a podzemí': ['jezkyně', 'jeskyne'],
  'Města a památky': ['města a památky', 'mesta'],
  'Spaní': ['spaní', 'spani'],
  'Ostatní zajímavosti': ['ostatní zajímavosti', 'ostatni'],
}

/** Šířka v px → kvalita WebP. Čím menší obrázek, tím agresivněji jde jít. */
const VELIKOSTI = [
  [320, 68],
  [720, 65],
]

/* Kdyby někdo přidal kategorii a zapomněl na ilustraci, ať se to pozná tady,
   a ne až tím, že se u nových míst nic nezobrazí. */
const chybi = KAT_KEYS.filter((k) => !MAPA[k])
if (chybi.length) {
  console.error(`Kategorie bez ilustrace: ${chybi.join(', ')}`)
  process.exit(1)
}

if (!fs.existsSync(ZDROJ)) {
  console.error(`Nenašel jsem podklady: ${ZDROJ}`)
  console.error('Složka grafika/ není v repozitáři – bez ní se skript pustit nedá.')
  process.exit(1)
}

fs.mkdirSync(CIL, { recursive: true })

let celkem = 0
for (const [kategorie, [zdroj, nas]] of Object.entries(MAPA)) {
  const vstup = path.join(ZDROJ, `${zdroj}.png`)
  if (!fs.existsSync(vstup)) {
    console.error(`Chybí podklad pro ${kategorie}: ${vstup}`)
    process.exit(1)
  }
  const casti = []
  for (const [sirka, kvalita] of VELIKOSTI) {
    const buf = await sharp(vstup).resize(sirka).webp({ quality: kvalita }).toBuffer()
    fs.writeFileSync(path.join(CIL, `${nas}-${sirka}.webp`), buf)
    celkem += buf.length
    casti.push(`${sirka}px ${String(Math.round(buf.length / 1024)).padStart(3)} kB`)
  }
  console.log(`  ${nas.padEnd(10)} ${casti.join(' · ')}`)
}

console.log(`\nCelkem ${Math.round(celkem / 1024)} kB do ${path.relative(ROOT, CIL)}`)
