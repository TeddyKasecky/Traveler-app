/* Service worker – šablona.
 *
 * Nepřipojuje se přímo. Při buildu ho vezme plugin ve vite.config.js, doplní
 * seznam souborů a verzi a výsledek uloží jako dist/sw.js. Ručně se needituje
 * dist verze, ale tenhle soubor.
 *
 * Co dělá:
 *   - při instalaci uloží celou aplikaci do cache (HTML, JS, CSS, fonty, ikony),
 *   - potom ji servíruje z cache, takže offline naběhne okamžitě,
 *   - při nové verzi smaže starou cache.
 *
 * Co NEUKLÁDÁ: dlaždice mapy a fotky z Wikimedia. Jsou z cizí domény, je jich
 * neomezeně a zaplnily by telefon. Offline tedy funguje aplikace i data o místech,
 * ale mapa zůstane šedá – stejně jako dřív. (Nápad na ukládání dlaždic: NAPADY.md.)
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
  e.respondWith(caches.match(req).then((r) => r || fetch(req)))
})
