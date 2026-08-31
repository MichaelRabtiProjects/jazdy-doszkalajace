import db from '../db/database.js';

// 'YYYY-MM-DD' -> dzień tygodnia 0-6 (niedziela-sobota), zgodnie z konwencją
// przyjętą w bazie (patrz komentarz w migracji 0001_init.sql). Liczymy w
// UTC, żeby zmiana czasu letni/zimowy nie przesunęła nam dnia o jeden.
export function getDayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Dla jednej daty łączy: szablon tygodniowy -> wyjątki -> zajęte już
// godziny, i zwraca posortowaną listę wolnych godzin startowych (0-23).
//
// Używana w dwóch miejscach: przy odczycie grafiku (routes/availability.js)
// ORAZ przy tworzeniu rezerwacji (routes/bookings.js) — to drugie miejsce
// wywołuje ją wewnątrz transakcji bazodanowej, dzięki czemu "co jest wolne"
// i "zapisz rezerwację" dzieją się jako jedna, niepodzielna operacja.
export function computeAvailableHours(dateStr) {
  const hours = new Array(24).fill(false);

  const dayOfWeek = getDayOfWeek(dateStr);
  const templateRows = db
    .prepare('SELECT start_hour, end_hour FROM weekly_template WHERE day_of_week = ?')
    .all(dayOfWeek);

  for (const { start_hour, end_hour } of templateRows) {
    for (let h = start_hour; h < end_hour; h++) hours[h] = true;
  }

  const exceptionRows = db
    .prepare('SELECT start_hour, end_hour, kind FROM availability_exceptions WHERE date = ?')
    .all(dateStr);

  // Dwa przebiegi zamiast jednego: najpierw wszystkie 'add', potem wszystkie
  // 'block'. Dzięki temu 'block' ZAWSZE wygrywa dla danej godziny, niezależnie
  // od kolejności, w jakiej wiersze wyjątków wróciły z bazy — "zablokuj" ma
  // być jednoznaczną, nadrzędną decyzją, a nie zależeć od przypadku.
  for (const { start_hour, end_hour, kind } of exceptionRows) {
    if (kind !== 'add') continue;
    for (let h = start_hour; h < end_hour; h++) hours[h] = true;
  }
  for (const { start_hour, end_hour, kind } of exceptionRows) {
    if (kind !== 'block') continue;
    for (let h = start_hour; h < end_hour; h++) hours[h] = false;
  }

  // datetime(b.hold_expires_at) — hold_expires_at zapisujemy z JS jako
  // "2026-08-31T20:00:49.449Z" (Date.toISOString()), a datetime('now')
  // w SQLite zwraca "2026-08-31 20:00:49" (spacja, bez strefy i milisekund).
  // Bez opakowania w datetime(...) to jest zwykłe porównanie tekstu, a "T"
  // ma wyższy kod znaku niż spacja — więc bez normalizacji blokada wyglądałaby
  // na wciąż aktywną przez resztę doby, niezależnie od faktycznej godziny.
  // datetime(...) parsuje oba formaty i porównuje je jako prawdziwe daty.
  const occupiedRows = db
    .prepare(
      `SELECT bh.hour
       FROM booking_hours bh
       JOIN bookings b ON b.id = bh.booking_id
       WHERE bh.date = ?
         AND (b.status = 'paid' OR (b.status = 'pending_payment' AND datetime(b.hold_expires_at) > datetime('now')))`
    )
    .all(dateStr);

  for (const { hour } of occupiedRows) hours[hour] = false;

  const available = [];
  for (let h = 0; h < 24; h++) {
    if (hours[h]) available.push(h);
  }
  return available;
}
