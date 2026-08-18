/* Service worker – šablona.
 *
 * Nepřipojuje se přímo. Při buildu ho vezme plugin ve vite.config.js, doplní
 * seznam souborů a verzi a výsledek uloží jako dist/sw.js. Ručně se needituje
 * dist verze, ale tenhle soubor.
 *
 * Co dělá:
 *   - při instalaci uloží celou aplikaci do cache (HTML, JS, CSS, fonty, ikony),
 *   - potom ji servíruje z cache, takže offline naběhne okamžitě,
 *   - **co se stáhne až za běhu, uloží taky**,
 *   - při nové verzi smaže starou cache.
 *
 * PROČ SE UKLÁDÁ I TO, CO SE STÁHNE ZA BĚHU: všechno kolem stažené malované
 * mapy (MapLibre, sto dvacet kreseb, souřadnice lesů a hor) je z předukládaného
 * seznamu vyřazené – přes čtyři megabajty, které jsou k ničemu každému, kdo si
 * mapu nestáhne. Kdyby se ale neuložilo ani při prvním použití, byla by
 * malovaná mapa bez signálu prázdná, což je přesně to, k čemu je. Stahovat
 * mapu se stejně musí online, takže se to vždycky stihne.
 *
 * Co NEUKLÁDÁ: dlaždice mapy a fotky z Wikimedia. Jsou z cizí domény, je jich
 * neomezeně a zaplnily by telefon. Offline tedy funguje aplikace i data o místech,
 * ale online mapa zůstane šedá – od toho je ta malovaná.
 */

const CACHE = '__VERSION__'
const PRECACHE = __PRECACHE__

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((klice) => Promise.all(klice.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // Cizí domény (dlaždice, fotky) necháváme na prohlížeči.
  if (url.origin !== location.origin) return

  // Navigace: zkus síť, offline vrať uloženou stránku.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./').then((r) => r || caches.match('./index.html'))))
    return
  }

  // Vlastní soubory mají v názvu otisk obsahu, takže cache je vždycky správná.
  // Co v ní není, se stáhne a rovnou uloží – viz úvodní komentář.
  e.respondWith(
    caches.match(req).then(
      (r) =>
        r ||
        fetch(req).then((odpoved) => {
          // Ukládá se jen to, co se opravdu povedlo. Uložená chybová odpověď
          // by se pak servírovala až do další verze aplikace.
          if (odpoved.ok && odpoved.type === 'basic') {
            const kopie = odpoved.clone()
            caches.open(CACHE).then((c) => c.put(req, kopie))
          }
          return odpoved
        })
    )
  )
})
