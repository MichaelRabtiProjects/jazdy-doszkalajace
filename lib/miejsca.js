/**
 * Miejsca spotkań, odległości między nimi i zasady dopłaty za dojazd.
 *
 * Jedno źródło prawdy dla serwera: lista miejsc trafia też do przeglądarki
 * (w odpowiedzi /api/dostepnosc), więc grafik i formularz nie mają
 * własnej, osobnej kopii, która mogłaby się rozjechać.
 *
 * Współrzędne takie same jak w narzedzia/generuj-mapki.mjs (mapki w Kontakcie).
 */

export const MIEJSCA = [
  { id: 'km', nazwa: 'Będzińska / K&M Park', nazwa_en: 'Będzińska / K&M Park', wawer: true, lat: 52.18149683839272, lng: 21.190286834215232 },
  { id: 'zerzen', nazwa: 'Zerzeń / DoubleTree by Hilton', nazwa_en: 'Zerzeń / DoubleTree by Hilton', wawer: true, lat: 52.185637864370754, lng: 21.142463683183966 },
  { id: 'ferio', nazwa: 'Ferio Wawer', nazwa_en: 'Ferio Wawer', wawer: true, lat: 52.20643961512142, lng: 21.16806456403142 },
  { id: 'bricoman', nazwa: 'Bricoman Warszawa Wilanów', nazwa_en: 'Bricoman Warszawa Wilanów', wawer: false, lat: 52.15297185146504, lng: 21.093351761354374 },
  { id: 'auchan', nazwa: 'Auchan Puławska 427', nazwa_en: 'Auchan Puławska 427', wawer: false, lat: 52.141826658341266, lng: 21.02387121970856 },
  { id: 'shell', nazwa: 'Stacja Shell koło Galerii Mokotów', nazwa_en: 'Shell station near Galeria Mokotów', wawer: false, lat: 52.17777456510009, lng: 21.006682123623765 },
  { id: 'cynamonowa', nazwa: 'Parking Cynamonowa 4 (koło dealera Mazdy)', nazwa_en: 'Car park at Cynamonowa 4 (by the Mazda dealer)', wawer: false, lat: 52.1489457, lng: 21.055811 },
  { id: 'lopuszanska', nazwa: 'Łopuszańska 22', nazwa_en: 'Łopuszańska 22', wawer: false, lat: 52.19257846238642, lng: 20.95163280598338 },
  { id: 'niepodleglosci', nazwa: 'al. Niepodległości 213 (parking pod Biblioteką Narodową)', nazwa_en: 'al. Niepodległości 213 (car park by the National Library)', wawer: false, lat: 52.21431110095896, lng: 21.005091288313384 },
];

const WG_ID = new Map(MIEJSCA.map((m) => [m.id, m]));

export function miejsce(id) {
  return WG_ID.get(id) || null;
}

/** Dopłata za godzinę jazdy w miejscu "z dojazdem" (175 zamiast 160 zł/h). */
export const DOPLATA_ZA_GODZINE = 15;

/** Tyle najbliższych miejsc (poza samym miejscem) liczy się jako "po drodze". */
const ILE_NAJBLIZSZYCH = 2;

/** Godziny szczytu, w których dojazd trwa dłużej: [od, do) w minutach od północy. */
export const SZCZYT = [15 * 60, 18 * 60];

/** Odległość w linii prostej, w km (wzór haversine). */
export function odlegloscKm(a, b) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Id dwóch najbliższych innych miejsc. */
export function najblizsze(id) {
  const m = miejsce(id);
  if (!m) return [];
  return MIEJSCA.filter((x) => x.id !== id)
    .map((x) => ({ id: x.id, km: odlegloscKm(m, x) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, ILE_NAJBLIZSZYCH)
    .map((x) => x.id);
}

/**
 * Czy jazda w miejscu `id` jest bez dopłaty, gdy sąsiednia jazda tego dnia
 * odbywa się w miejscu `sasiad` (null = brak innych jazd tego dnia).
 *
 *   - miejsca w Wawrze: zawsze bez dopłaty,
 *   - pozostałe: bez dopłaty, jeśli to samo miejsce co sąsiednia jazda
 *     albo jedno z 2 najbliższych jej miejsc — i tak tam jestem,
 *   - w przeciwnym razie +15 zł/h (dojazd z Wawra albo z dalszego miejsca).
 */
export function doplataZaGodzine(id, sasiad) {
  const m = miejsce(id);
  if (!m || m.wawer) return 0;
  if (sasiad && (sasiad === id || najblizsze(sasiad).includes(id))) return 0;
  return DOPLATA_ZA_GODZINE;
}

/**
 * Wstępne czasy dojazdu (minuty), zanim instruktor poprawi je w panelu.
 * Kalibracja na przykładach instruktora: Ferio → K&M (3,2 km) ok. 10 min
 * nawet w szczycie; Łopuszańska → Ferio (14,8 km) 20–25 min.
 * Zasady: do 5 km najwyżej 15 min, nigdy ponad 30 min, zaokrąglenie w górę
 * do 5 min.
 */
export function domyslnyDojazd(zId, doId) {
  if (zId === doId) return { normalnie: 0, szczyt: 0 };
  const km = odlegloscKm(miejsce(zId), miejsce(doId));
  const baza = 4.1 + 1.21 * km;
  const w5 = (x) => Math.ceil(x / 5) * 5;
  const limit = km <= 5 ? 15 : 30;
  return {
    normalnie: Math.min(w5(baza), limit),
    szczyt: Math.min(w5(baza * 1.25), limit),
  };
}

/** Czy odjazd o tej minucie wypada w godzinach szczytu. */
export function wSzczycie(minuta) {
  return minuta >= SZCZYT[0] && minuta < SZCZYT[1];
}

/**
 * Wczytuje tabelę czasów dojazdu z bazy i zwraca funkcję
 * dojazd(z, do, minutaOdjazdu) → minuty. Brakujące pary (np. nowe miejsce)
 * dostają wartość domyślną z domyslnyDojazd().
 */
export async function wczytajDojazdy(db) {
  const { results } = await db.prepare('SELECT z, do_miejsca, normalnie, szczyt FROM dojazdy').all();
  const mapa = new Map(results.map((r) => [r.z + '>' + r.do_miejsca, r]));
  return function dojazd(zId, doId, minutaOdjazdu) {
    if (!zId || !doId || zId === doId) return 0;
    const r = mapa.get(zId + '>' + doId) || domyslnyDojazd(zId, doId);
    return Math.min(wSzczycie(minutaOdjazdu) ? r.szczyt : r.normalnie, 30);
  };
}
