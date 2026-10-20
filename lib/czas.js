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

/** Minuty od północy (0-1439) w polskiej strefie czasowej — np. 13:25 → 805. */
export function minutyPL(date = new Date()) {
  const p = czesciPL(date);
  return p.hour * 60 + p.minute;
}

function czesciPL(date) {
  const czesci = new Intl.DateTimeFormat('en-US', {
    timeZone: STREFA,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const p = {};
  for (const c of czesci) if (c.type !== 'literal') p[c.type] = Number(c.value);
  return p;
}

/** O ile minut polski czas wyprzedza UTC w danej chwili (60 zimą, 120 latem). */
function przesuniecieMin(date) {
  const p = czesciPL(date);
  const jakoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((jakoUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}

/**
 * Chwila (Date) odpowiadająca polskiej dacie i godzinie, np.
 * chwilaPL('2026-10-23', 805) → czwartek 23.10.2026, 13:25 w Warszawie.
 *
 * Przesunięcie względem UTC liczymy dwa razy: w dniu zmiany czasu pierwsze
 * przybliżenie może trafić po złej stronie zmiany.
 */
export function chwilaPL(dataStr, minuty) {
  const [rok, miesiac, dzien] = dataStr.split('-').map(Number);
  const jakoUtc = Date.UTC(rok, miesiac - 1, dzien, 0, minuty);
  let t = jakoUtc - przesuniecieMin(new Date(jakoUtc)) * 60000;
  t = jakoUtc - przesuniecieMin(new Date(t)) * 60000;
  return new Date(t);
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
