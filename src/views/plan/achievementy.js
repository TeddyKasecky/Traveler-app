/**
 * Achievementy – dvě patra: profilové a plánové.
 *
 * PROFILOVÉ se vyhodnocují z celého úložiště (navštívená místa, archiv cest,
 * poznámky, fotky…), takže se dají získat i zpětně – kdo má navštíveno
 * padesát míst, dostane všechny stupně naráz.
 *
 * PLÁNOVÉ se generují automaticky z obsahu konkrétního plánu při vyjetí
 * a pokořují se během cesty. Generátor je psaný tak, aby z každého plánu
 * vypadlo aspoň dvacet kusů – u malých plánů doplní jemnější stupně.
 *
 * STAVĚNÉ NA BUDOUCÍ ÚPRAVY: definice je datová (id, název, popis, podmínka
 * jako čistá funkce, volitelný obrázek `obr`). Získané se ukládají podle id
 * (`store.achievementy`, `cesta.ziskane`), takže přepsání podmínek nebo
 * přidání vlastních obrázků nikdy nesmaže, co už je pokořené. Id se proto
 * NIKDY nemění – stejné pravidlo jako u id míst.
 *
 * Vyhodnocení je vždycky čistá funkce nad daty; nikde žádný zápis kromě
 * `pripisProfilove()` a `pripisPlanove()`, které volá kdo vykresluje.
 */

import { S, store, PHOTOS, save } from '../../core/store.js'
import { KAT } from '../../data/categories.js'

/* ================= profilové ================= */

/** Pomocníci nad úložištěm – ať se v podmínkách neopakuje totéž dokola. */
const navstivena = () => S.places.filter((p) => store.stav[p.id] === 'visited')
const pocetKategorie = (k) => navstivena().filter((p) => p.k === k).length
const zemeNavstivene = () => new Set(navstivena().map((p) => p.z))
const poznamek = () => Object.values(store.notes).filter((t) => (t || '').trim()).length

/** Stupně „kolik navštíveno“ – páteř profilového patra. */
const STUPNE_MIST = [10, 25, 50, 100, 250]
/** Stupně zemí. */
const STUPNE_ZEMI = [3, 5, 10]

/**
 * Profilové achievementy. Pořadí = pořadí v Profilu.
 * @type {Array<{id: string, nazev: string, popis: string, obr?: string, splneno: () => boolean, prubeh?: () => [number, number]}>}
 */
export const PROFILOVE = [
  {
    id: 'prvni-misto',
    nazev: 'První razítko',
    popis: 'Navštívit první místo',
    splneno: () => navstivena().length >= 1,
    prubeh: () => [Math.min(1, navstivena().length), 1],
  },
  ...STUPNE_MIST.map((n) => ({
    id: `mist-${n}`,
    nazev: `${n} míst`,
    popis: `Navštívit ${n} míst`,
    splneno: () => navstivena().length >= n,
    prubeh: () => [Math.min(n, navstivena().length), n],
  })),
  ...STUPNE_ZEMI.map((n) => ({
    id: `zeme-${n}`,
    nazev: n === 3 ? 'Přeshraniční' : n === 5 ? 'Půl Evropy' : 'Sběratel zemí',
    popis: `Navštívit místa v ${n} zemích`,
    splneno: () => zemeNavstivene().size >= n,
    prubeh: () => [Math.min(n, zemeNavstivene().size), n],
  })),
  // Kategorie: deset a pak dvacet pět míst z každé. Jména podle číselníku,
  // ne natvrdo – kategorie jsou dané datovým souborem a tam se i mění.
  ...Object.keys(KAT).map((k) => ({
    id: `kat-${k.toLowerCase().replace(/[^a-z]+/g, '-')}`,
    nazev: `${k}: sběratel`,
    popis: `Navštívit 10 míst z kategorie ${k}`,
    splneno: () => pocetKategorie(k) >= 10,
    prubeh: () => [Math.min(10, pocetKategorie(k)), 10],
  })),
  ...Object.keys(KAT).map((k) => ({
    id: `kat25-${k.toLowerCase().replace(/[^a-z]+/g, '-')}`,
    nazev: `${k}: znalec`,
    popis: `Navštívit 25 míst z kategorie ${k}`,
    splneno: () => pocetKategorie(k) >= 25,
    prubeh: () => [Math.min(25, pocetKategorie(k)), 25],
  })),
  {
    id: 'vsech-deset-kategorii',
    nazev: 'Od vodopádu po jeskyni',
    popis: 'Navštívit místo z každé kategorie',
    splneno: () => Object.keys(KAT).every((k) => pocetKategorie(k) >= 1),
    prubeh: () => [Object.keys(KAT).filter((k) => pocetKategorie(k) >= 1).length, Object.keys(KAT).length],
  },
  {
    id: 'kraju-10',
    nazev: 'Krajánek',
    popis: 'Navštívit místa v 10 různých krajích',
    splneno: () => new Set(navstivena().map((p) => p.r).filter(Boolean)).size >= 10,
    prubeh: () => [Math.min(10, new Set(navstivena().map((p) => p.r).filter(Boolean)).size), 10],
  },
  {
    id: 'prvni-cesta',
    nazev: 'Poprvé na cestě',
    popis: 'Dokončit první cestu',
    splneno: () => store.cesty.length >= 1,
  },
  {
    id: 'tri-cesty',
    nazev: 'Vyjetí nezastavíš',
    popis: 'Dokončit tři cesty',
    splneno: () => store.cesty.length >= 3,
    prubeh: () => [Math.min(3, store.cesty.length), 3],
  },
  {
    id: 'pet-cest',
    nazev: 'Ostřílená posádka',
    popis: 'Dokončit pět cest',
    splneno: () => store.cesty.length >= 5,
    prubeh: () => [Math.min(5, store.cesty.length), 5],
  },
  {
    id: 'deset-cest',
    nazev: 'Stálí cestovatelé',
    popis: 'Dokončit deset cest',
    splneno: () => store.cesty.length >= 10,
    prubeh: () => [Math.min(10, store.cesty.length), 10],
  },
  {
    id: 'cesta-tyden',
    nazev: 'Týden na kolech',
    popis: 'Cesta trvající aspoň 7 dní',
    splneno: () => store.cesty.some((c) => c.konec - c.zacatek >= 7 * 86400000),
  },
  {
    id: 'cesta-dva-tydny',
    nazev: 'Velká výprava',
    popis: 'Cesta trvající aspoň 14 dní',
    splneno: () => store.cesty.some((c) => c.konec - c.zacatek >= 14 * 86400000),
  },
  {
    id: 'vikendovka',
    nazev: 'Bleskový víkend',
    popis: 'Dokončit cestu do tří dnů bez vynechané zastávky',
    splneno: () => store.cesty.some((c) => c.konec - c.zacatek <= 3 * 86400000 && c.zastavek >= 2 && c.vynechano === 0),
  },
  {
    id: 'cesta-bez-vynechani',
    nazev: 'Do posledního místa',
    popis: 'Dokončit cestu bez vynechané zastávky',
    splneno: () => store.cesty.some((c) => c.zastavek >= 3 && c.vynechano === 0),
  },
  {
    id: 'zapisovatel',
    nazev: 'Zapisovatel',
    popis: 'Napsat 10 poznámek k místům',
    splneno: () => poznamek() >= 10,
    prubeh: () => [Math.min(10, poznamek()), 10],
  },
  {
    id: 'kronika',
    nazev: 'Rodinná kronika',
    popis: 'Napsat 50 poznámek k místům',
    splneno: () => poznamek() >= 50,
    prubeh: () => [Math.min(50, poznamek()), 50],
  },
  {
    id: 'fotograf',
    nazev: 'Palubní fotograf',
    popis: 'Vyfotit 10 vlastních fotek',
    splneno: () => Object.keys(PHOTOS).length >= 10,
    prubeh: () => [Math.min(10, Object.keys(PHOTOS).length), 10],
  },
  {
    id: 'fotoalbum',
    nazev: 'Fotoalbum',
    popis: 'Vyfotit 25 vlastních fotek',
    splneno: () => Object.keys(PHOTOS).length >= 25,
    prubeh: () => [Math.min(25, Object.keys(PHOTOS).length), 25],
  },
  {
    id: 'kritik',
    nazev: 'Přísný metr',
    popis: 'Ohodnotit 25 míst',
    splneno: () => Object.keys(store.rating).length >= 25,
    prubeh: () => [Math.min(25, Object.keys(store.rating).length), 25],
  },
  {
    id: 'porota',
    nazev: 'Porota',
    popis: 'Ohodnotit 50 míst',
    splneno: () => Object.keys(store.rating).length >= 50,
    prubeh: () => [Math.min(50, Object.keys(store.rating).length), 50],
  },
  {
    id: 'pet-hvezd',
    nazev: 'Tohle bylo ono',
    popis: 'Dát některému místu pět hvězd',
    splneno: () => Object.values(store.rating).some((r) => r >= 5),
  },
  {
    id: 'zimni',
    nazev: 'Zimní výprava',
    popis: 'Dokončit cestu v prosinci až únoru',
    splneno: () => store.cesty.some((c) => [11, 0, 1].includes(new Date(c.zacatek).getMonth())),
  },
  {
    id: 'ctyri-obdobi',
    nazev: 'Celý rok v terénu',
    popis: 'Cesty ve všech čtyřech ročních obdobích',
    splneno: () => {
      const obdobi = new Set(store.cesty.map((c) => Math.floor(((new Date(c.zacatek).getMonth() + 1) % 12) / 3)))
      return obdobi.size >= 4
    },
    prubeh: () => [
      new Set(store.cesty.map((c) => Math.floor(((new Date(c.zacatek).getMonth() + 1) % 12) / 3))).size,
      4,
    ],
  },
  {
    id: 'planovac',
    nazev: 'Plánovač',
    popis: 'Rozdělit plán na dny',
    splneno: () => (store.planDny || []).length > 1 || store.cesty.some((c) => (c.dny || []).length > 1),
  },
  {
    id: 'navratilec',
    nazev: 'Návratilec',
    popis: 'Mít místo navštívené ve dvou různých cestách',
    splneno: () => {
      const videno = new Set()
      for (const c of store.cesty)
        for (const id of Object.keys(c.odznacene || {})) {
          if (videno.has(id)) return true
          videno.add(id)
        }
      return false
    },
  },
]

/**
 * Připíše nově splněné profilové achievementy. Vrací kolik přibylo.
 * Zapisuje jen při změně – žádný zápis při startu.
 */
export function pripisProfilove() {
  let pribylo = 0
  for (const a of PROFILOVE) {
    if (store.achievementy[a.id]) continue
    let splneno = false
    try {
      splneno = a.splneno()
    } catch {
      // Rozbitá podmínka nesmí shodit Profil – achievement prostě nesvítí.
    }
    if (splneno) {
      store.achievementy[a.id] = Date.now()
      pribylo++
    }
  }
  if (pribylo) save()
  return pribylo
}

/* ================= plánové ================= */

/**
 * Vygeneruje achievementy pro konkrétní plán.
 *
 * Čistá funkce: seznam id zastávek → definice. Volá se při každém vykreslení
 * karty Cesta, NEUKLÁDÁ SE – uložené jsou jen `ziskane` (id splněných).
 * Díky tomu se generátor smí kdykoli přepsat a nikomu nic nezmizí.
 *
 * @param {string[]} zastavky
 * @param {number[]} dny  délky dnů
 * @returns {Array<{id: string, nazev: string, popis: string, splneno: (c: any) => boolean}>}
 */
export function planoveAchievementy(zastavky, dny) {
  const mista = zastavky.map((id) => S.byId[id]).filter(Boolean)
  const out = []
  const hotovoIds = (c) => Object.keys(c.odznacene || {})
  const hotovo = (c) => hotovoIds(c).length

  /* -- průběh po kusech: vždycky aspoň čtyři stupně -- */
  const n = mista.length
  const stupne = [...new Set([1, Math.ceil(n / 4), Math.ceil(n / 2), Math.ceil((3 * n) / 4), n])].filter((x) => x >= 1)
  const jmenaStupnu = { [1]: 'První zastávka', [n]: 'Úplně všechno' }
  for (const st of stupne) {
    out.push({
      id: `zastavky-${st}`,
      nazev: jmenaStupnu[st] || (st === Math.ceil(n / 2) ? 'V polovině' : `${st} zastávek`),
      popis: st === n ? 'Odznačit všechny zastávky' : `Odznačit ${st} ${st === 1 ? 'zastávku' : st < 5 ? 'zastávky' : 'zastávek'}`,
      splneno: (c) => hotovo(c) >= st,
    })
  }

  /* -- dny -- */
  const delky = dny && dny.length ? dny : [n]
  let od = 0
  delky.forEach((delka, i) => {
    const kus = mista.slice(od, od + delka).map((p) => p.id)
    od += delka
    if (!kus.length) return
    out.push({
      id: `den-${i + 1}`,
      nazev: `${i + 1}. den v celku`,
      popis: `Odznačit všechny zastávky ${i + 1}. dne`,
      splneno: (c) => kus.every((id) => c.odznacene[id]),
    })
  })

  /* -- kategorie: první místo každé kategorie v plánu -- */
  const kategorie = [...new Set(mista.map((p) => p.k))]
  for (const k of kategorie) {
    const ids = mista.filter((p) => p.k === k).map((p) => p.id)
    out.push({
      id: `kat-${k.toLowerCase().replace(/[^a-z]+/g, '-')}`,
      nazev: `První: ${k}`,
      popis: `Odznačit první místo z kategorie ${k}`,
      splneno: (c) => ids.some((id) => c.odznacene[id]),
    })
  }

  /* -- země -- */
  const zeme = [...new Set(mista.map((p) => p.z))]
  for (const z of zeme) {
    const ids = mista.filter((p) => p.z === z).map((p) => p.id)
    out.push({
      id: `zeme-${z.toLowerCase().replace(/[^a-z]+/g, '-')}`,
      nazev: z,
      popis: `Odznačit první zastávku v zemi ${z}`,
      splneno: (c) => ids.some((id) => c.odznacene[id]),
    })
  }

  /* -- jednotlivosti -- */
  const nejsever = mista.reduce((a, p) => (!a || p.lat > a.lat ? p : a), null)
  if (nejsever)
    out.push({
      id: 'nejsevernejsi',
      nazev: 'Nejsevernější bod',
      popis: `Dojet na ${nejsever.n}`,
      splneno: (c) => !!c.odznacene[nejsever.id],
    })
  const nejjih = mista.reduce((a, p) => (!a || p.lat < a.lat ? p : a), null)
  if (nejjih && nejjih !== nejsever)
    out.push({
      id: 'nejjiznejsi',
      nazev: 'Nejjižnější bod',
      popis: `Dojet na ${nejjih.n}`,
      splneno: (c) => !!c.odznacene[nejjih.id],
    })
  /* -- univerzální: platí pro každý plán, ať je jakkoli malý -- */
  out.push({ id: 'vyjeto', nazev: 'A jedeme', popis: 'Vyjet na cestu', splneno: () => true })
  out.push({
    id: 'ranni-start',
    nazev: 'Brzy na nohou',
    popis: 'Vyjet před desátou ráno',
    splneno: (c) => new Date(c.zacatek).getHours() < 10,
  })
  out.push({
    id: 'dve-za-den',
    nazev: 'Plná nádrž',
    popis: 'Odznačit dvě zastávky v jednom dni',
    splneno: (c) => {
      const poDnech = {}
      for (const ts of Object.values(c.odznacene || {})) {
        const den = new Date(ts).toDateString()
        poDnech[den] = (poDnech[den] || 0) + 1
        if (poDnech[den] >= 2) return true
      }
      return false
    },
  })
  out.push({
    id: 'den-na-ceste',
    nazev: 'Den na cestě',
    popis: 'Být na cestě aspoň 24 hodin',
    splneno: (c) => Date.now() - c.zacatek >= 86400000,
  })
  out.push({
    id: 'dva-dny-na-ceste',
    nazev: 'Druhé ráno',
    popis: 'Být na cestě aspoň 48 hodin',
    splneno: (c) => Date.now() - c.zacatek >= 2 * 86400000,
  })
  out.push({
    id: 'pauza-mistri',
    nazev: 'Umění pauzy',
    popis: 'Dát si na cestě pauzu',
    splneno: (c) => (c.pauzy || []).length >= 1 || !!c.pauzaOd,
  })
  out.push({
    id: 'sprint-48',
    nazev: 'Sprint',
    popis: 'Tři odznačení během 48 hodin',
    splneno: (c) => {
      const casy = Object.values(c.odznacene || {}).sort((a, b) => a - b)
      for (let i = 0; i + 2 < casy.length; i++) if (casy[i + 2] - casy[i] <= 2 * 86400000) return true
      return false
    },
  })
  out.push({
    id: 'poznamka-z-cesty',
    nazev: 'Palubní deník',
    popis: 'Napsat poznámku z cesty',
    splneno: (c) => !!(c.poznamka || '').trim() || Object.values(c.poznamky || {}).some((t) => (t || '').trim()),
  })
  out.push({
    id: 'poznamky-3',
    nazev: 'Kronikář',
    popis: 'Poznámka u tří zastávek',
    splneno: (c) => Object.values(c.poznamky || {}).filter((t) => (t || '').trim()).length >= 3,
  })
  out.push({
    id: 'fotka-z-cesty',
    nazev: 'Momentka',
    popis: 'Vyfotit fotku u odznačené zastávky',
    splneno: (c) => hotovoIds(c).some((id) => PHOTOS[id]),
  })
  out.push({
    id: 'hodnoceni-z-cesty',
    nazev: 'Hvězdy z cesty',
    popis: 'Ohodnotit odznačenou zastávku',
    splneno: (c) => hotovoIds(c).some((id) => store.rating[id]),
  })
  out.push({
    id: 'bez-pauzy-den',
    nazev: 'Jedním dechem',
    popis: 'Odznačit tři zastávky v jednom dni',
    splneno: (c) => {
      const poDnech = {}
      for (const [, ts] of Object.entries(c.odznacene || {})) {
        const den = new Date(ts).toDateString()
        poDnech[den] = (poDnech[den] || 0) + 1
        if (poDnech[den] >= 3) return true
      }
      return false
    },
  })
  out.push({
    id: 'ranni-ptace',
    nazev: 'Ranní ptáče',
    popis: 'Odznačit zastávku před devátou ráno',
    splneno: (c) => Object.values(c.odznacene || {}).some((ts) => new Date(ts).getHours() < 9),
  })
  out.push({
    id: 'nocni-sova',
    nazev: 'Noční sova',
    popis: 'Odznačit zastávku po deváté večer',
    splneno: (c) => Object.values(c.odznacene || {}).some((ts) => new Date(ts).getHours() >= 21),
  })

  return out
}

/**
 * Připíše nově splněné plánové achievementy do `cesta.ziskane`.
 * Vrací seznam čerstvě získaných definic (na toast).
 */
export function pripisPlanove(cesta) {
  if (!cesta) return []
  const definice = planoveAchievementy(cesta.zastavky, cesta.dny)
  const nove = []
  cesta.ziskane = cesta.ziskane || []
  for (const a of definice) {
    if (cesta.ziskane.includes(a.id)) continue
    let splneno = false
    try {
      splneno = a.splneno(cesta)
    } catch {
      /* rozbitá podmínka nesmí shodit kartu */
    }
    if (splneno) {
      cesta.ziskane.push(a.id)
      nove.push(a)
    }
  }
  if (nove.length) save()
  return nove
}
