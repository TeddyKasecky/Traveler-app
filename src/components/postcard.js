/**
 * Kreslená pohlednice pro místa bez fotky.
 *
 * Obrázek se generuje z `id` místa – stejné id dá vždycky stejnou scénu.
 * Proto se `id` nikdy nesmí měnit: změnilo by se i to, jak místo vypadá.
 * Kreslí se 318 místům, která nemají `img`. Není to nedodělek, je to záměr.
 */

/**
 * Jednoduchý hash řetězce. Používá se i pro tipy dne na Domů.
 * @param {string} s
 * @returns {number}
 */
export function hash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/**
 * Vykreslí pohlednici podle kategorie místa.
 * @param {Record<string, any>} p
 * @returns {string} SVG
 */
export function scene(p) {
  // (Původní kód si tu ještě bral barvu kategorie do proměnné `k`, ale nikdy ji
  // nepoužil – scéna se řídí jen podle `p.k` ve switchi níž. Vypuštěno.)
  const h = hash(p.id)
  const rnd = (i, m) => (h >> (i * 3)) % m
  const W = 400
  const H = 150
  const sunX = 60 + rnd(1, 260)
  const sunY = 26 + rnd(2, 16)

  const sky = `<rect width="${W}" height="${H}" fill="var(--paper)"/>
    <circle cx="${sunX}" cy="${sunY}" r="15" fill="var(--sun)" stroke="var(--ink)" stroke-width="2.5"/>`
  const cloud = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" fill="var(--card)" stroke="var(--ink)" stroke-width="3">
    <path d="M0 0h46a11 11 0 0 0 0-22 15 15 0 0 0-28-6A10 10 0 0 0 0 0z"/></g>`
  const clouds = cloud(20 + rnd(3, 40), 40 + rnd(4, 14), 0.8) + (rnd(5, 2) ? cloud(250 + rnd(6, 80), 34 + rnd(7, 10), 0.65) : '')
  const ground = `<path d="M0 ${H - 14}h${W}v14H0z" fill="var(--moss)" opacity=".35"/>`
  const road = `<path d="M0 ${H - 7}h${W}" stroke="var(--ink)" stroke-width="3" stroke-dasharray="3 12" stroke-linecap="round" opacity=".5"/>`
  const hill = (y, fill, op) =>
    `<path d="M0 ${H} L0 ${y + 30} Q${60 + rnd(8, 40)} ${y - 12} ${140 + rnd(9, 30)} ${y + 16} T${300} ${y + 4} T${W} ${y + 22} L${W} ${H}z" fill="${fill}" opacity="${op}" stroke="var(--ink)" stroke-width="2.5"/>`
  const peak = (cx, base, hgt, fill) =>
    `<path d="M${cx - hgt * 0.95} ${base} L${cx} ${base - hgt} L${cx + hgt * 0.95} ${base}z" fill="${fill}" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M${cx - hgt * 0.3} ${base - hgt * 0.68} L${cx} ${base - hgt} L${cx + hgt * 0.3} ${base - hgt * 0.68} L${cx + hgt * 0.12} ${base - hgt * 0.58} L${cx} ${base - hgt * 0.7} L${cx - hgt * 0.14} ${base - hgt * 0.56}z" fill="var(--card)" stroke="var(--ink)" stroke-width="1.6"/>`
  const water = (y) => `<path d="M0 ${y}h${W}v${H - y}H0z" fill="var(--lake)" opacity=".45" stroke="var(--ink)" stroke-width="2.5"/>
    <path d="M40 ${y + 16}q14-7 28 0t28 0M230 ${y + 26}q14-7 28 0t28 0M120 ${y + 34}q14-7 28 0t28 0" stroke="var(--ink)" fill="none" stroke-width="2.2" opacity=".55" stroke-linecap="round"/>`
  const wall = (x, w, dir) =>
    `<path d="M${x} 0 h${w} l${dir * -14} 40 l${dir * 10} 34 l${dir * -16} 46 L${x + (dir > 0 ? 0 : w)} ${H} z" fill="var(--clay)" opacity=".55" stroke="var(--ink)" stroke-width="2.5"/>`
  const trees = (n, y) =>
    Array.from({ length: n }, (_, i) => {
      const x = 24 + (i * (W - 40)) / n + rnd(i + 10, 14)
      return `<path d="M${x} ${y} l9 20h-18z" fill="var(--pine)" stroke="var(--ink)" stroke-width="2"/><path d="M${x} ${y + 9} l11 22h-22z" fill="var(--pine)" stroke="var(--ink)" stroke-width="2"/>`
    }).join('')

  let art = ''
  switch (p.k) {
    case 'Hory a túry':
    case 'Ferraty':
      art =
        hill(96, 'var(--clay)', 0.3) +
        peak(120, H - 14, 86, 'var(--card)') +
        peak(215, H - 14, 108, 'var(--plocha2)') +
        peak(300, H - 14, 72, 'var(--card)') +
        trees(6, H - 26)
      if (p.k === 'Ferraty')
        art += `<path d="M215 ${H - 120} l-6 26 6 24-7 26" stroke="var(--rust)" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <circle cx="209" cy="${H - 96}" r="4.5" fill="var(--card)" stroke="var(--ink)" stroke-width="2.2"/>`
      break
    case 'Jezera':
      art = peak(110, 88, 74, 'var(--card)') + peak(290, 88, 60, 'var(--plocha2)') + water(88) + trees(4, 80)
      break
    case 'Vodopády':
      art =
        hill(80, 'var(--clay)', 0.28) +
        `<path d="M118 26h84v${H - 26}h-84z" fill="var(--card)" stroke="var(--ink)" stroke-width="2.5"/>
        <path d="M136 30v${H - 40}M160 30v${H - 36}M184 30v${H - 44}" stroke="var(--sky)" stroke-width="7" stroke-linecap="round"/>
        <path d="M100 ${H - 26}q22-12 44 0t44 0 44 0" stroke="var(--sky)" stroke-width="4" fill="none" opacity=".8"/>` +
        trees(4, H - 34)
      break
    case 'Soutěsky':
      art =
        wall(0, 150, 1) +
        wall(250, 150, -1) +
        `<path d="M150 ${H}q26-46 50-96" stroke="var(--lake)" stroke-width="12" fill="none" opacity=".6" stroke-linecap="round"/>
        <path d="M120 96h160" stroke="var(--sand)" stroke-width="6" stroke-linecap="round" stroke-dasharray="9 7"/>`
      break
    case 'Jeskyně a podzemí':
      art = `<rect width="${W}" height="${H}" fill="var(--plum)" opacity=".18"/>
        <path d="M40 ${H} v-40a160 60 0 0 1 320 0v40z" fill="var(--night)" opacity=".82" stroke="var(--ink)" stroke-width="2.5"/>
        ${[70, 110, 150, 250, 300, 340].map((x, i) => `<path d="M${x} ${H - 84 + rnd(i, 10)} l7 26-14 0z" fill="var(--card)" opacity=".85"/>`).join('')}
        <circle cx="200" cy="${H - 30}" r="13" fill="var(--sun)" opacity=".9" stroke="var(--ink)" stroke-width="2"/>`
      break
    case 'Města a památky':
      art =
        hill(104, 'var(--sand)', 0.3) +
        `<g stroke="var(--ink)" stroke-width="2.5" fill="var(--card)">
        <path d="M60 ${H - 14}V70h44v${H - 84}z"/><path d="M116 ${H - 14}V54h30v${H - 68}z"/><path d="M158 ${H - 14}V84h52v${H - 98}z"/>
        <path d="M226 ${H - 14}V44h26v${H - 58}z"/><path d="M262 ${H - 14}V74h60v${H - 88}z"/></g>
        <path d="M239 44l-9 12h18z" fill="var(--rust)" stroke="var(--ink)" stroke-width="2.5"/>
        <path d="M131 54l-8 10h16z" fill="var(--rust)" stroke="var(--ink)" stroke-width="2.5"/>
        <g fill="var(--sky)" opacity=".7">${[70, 88, 168, 180, 192, 276, 292, 308].map((x) => `<rect x="${x}" y="${H - 52}" width="9" height="13" rx="2"/>`).join('')}</g>`
      break
    case 'Bikeparky':
      art =
        hill(84, 'var(--moss)', 0.45) +
        `<path d="M-10 ${H - 20}q60-34 110-10t110-22 130-16" stroke="var(--sand)" stroke-width="9" fill="none" stroke-linecap="round"/>
        <path d="M-10 ${H - 20}q60-34 110-10t110-22 130-16" stroke="var(--ink)" stroke-width="2" fill="none" stroke-dasharray="2 10"/>` +
        trees(5, H - 40)
      break
    case 'Spaní':
      art =
        `<rect width="${W}" height="${H}" fill="var(--night)" opacity=".12"/>` +
        hill(100, 'var(--night)', 0.3) +
        `${[40, 90, 150, 300, 350].map((x, i) => `<circle cx="${x}" cy="${24 + rnd(i, 26)}" r="2.4" fill="var(--ink)" opacity=".6"/>`).join('')}
        <g transform="translate(150 ${H - 72}) scale(3.6)"><path d="M4 14c0-3 1.2-6 3-6h7c2.4 0 6 2.5 6 5v3H4z" fill="var(--card)"/>
        <path d="M4 16v-2c0-3 1.2-6 3-6h7c2.4 0 6 2.5 6 5v3" fill="none" stroke="var(--ink)" stroke-width="1.6"/>
        <rect x="6.6" y="10" width="5" height="3.4" rx="1" fill="var(--sky)" stroke="var(--ink)" stroke-width="1.2"/>
        <path d="M2 16h20" stroke="var(--ink)" stroke-width="1.6"/><circle cx="8" cy="16" r="2" fill="var(--card)" stroke="var(--ink)" stroke-width="1.4"/>
        <circle cx="16.5" cy="16" r="2" fill="var(--card)" stroke="var(--ink)" stroke-width="1.4"/></g>` +
        trees(3, H - 34)
      break
    default:
      art =
        hill(92, 'var(--sand)', 0.4) +
        trees(5, H - 32) +
        `<path d="M200 40l7 19 19 7-19 7-7 19-7-19-19-7 19-7z" fill="var(--sun)" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round"/>`
  }

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" class="pcard">${sky}${clouds}${art}${ground}${road}</svg>`
}
