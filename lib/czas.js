/**
 * Obsługa czasu w strefie Europe/Warsaw.
 *
 * Cloudflare uruchamia kod w UTC, a grafik musi działać w polskim czasie —
 * inaczej latem (UTC+2) „dzisiaj” po 22:00 przeskakiwałoby na jutro i klient
 * widziałby złe terminy. Dlatego nigdzie nie używamy getFullYear()/getHours()
 * wprost, tylko przeliczamy przez Intl z jawnie podaną strefą.
 */

const STREFA = 'Europe/Warsaw';

/** Zwraca datę w formacie YYYY-MM-DD w polskiej strefie czasowej. */
export function dataPL(date = new Date()) {
  // 'sv-SE' daje format ISO (YYYY-MM-DD) bez kombinowania ze składaniem części
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: STREFA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Zwraca bieżącą godzinę (0-23) w polskiej strefie czasowej. */
export function godzinaPL(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat('pl-PL', {
      timeZone: STREFA,
      hour: '2-digit',
      hour12: false,
    }).format(date)
  );
}

/**
 * Dzień tygodnia (0 = niedziela ... 6 = sobota) dla daty YYYY-MM-DD.
 * Liczymy w UTC, bo sama data kalendarzowa nie zależy od strefy — chodzi
 * tylko o to, żeby nie przesunąć dnia przy zmianie czasu letni/zimowy.
 */
export function dzienTygodnia(dataStr) {
  const [rok, miesiac, dzien] = dataStr.split('-').map(Number);
  return new Date(Date.UTC(rok, miesiac - 1, dzien)).getUTCDay();
}

/** Dodaje `ile` dni do daty YYYY-MM-DD i zwraca nową datę w tym samym formacie. */
export function dodajDni(dataStr, ile) {
  const [rok, miesiac, dzien] = dataStr.split('-').map(Number);
  const d = new Date(Date.UTC(rok, miesiac - 1, dzien));
  d.setUTCDate(d.getUTCDate() + ile);
  return d.toISOString().slice(0, 10);
}

/** Lista kolejnych dat YYYY-MM-DD, od `od` włącznie, o długości `ile`. */
export function zakresDat(od, ile) {
  const dni = [];
  for (let i = 0; i < ile; i++) dni.push(dodajDni(od, i));
  return dni;
}

/** Nazwa dnia tygodnia po polsku, do wyświetlania w grafiku. */
export function nazwaDnia(dataStr) {
  const nazwy = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
  return nazwy[dzienTygodnia(dataStr)];
}
