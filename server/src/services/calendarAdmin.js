import db from '../db/database.js';
import { getDayOfWeek, computeAvailableHours } from './availability.js';

// Zablokuj jedną godzinę: zawsze można to zrobić prostym insertem, bo
// 'block' i tak wygrywa z czymkolwiek innym dla tej godziny (patrz
// availability.js). Przy okazji sprzątamy identyczny co do zakresu wyjątek
// 'add', gdyby istniał — czysto kosmetycznie, żeby nie zaśmiecać listy
// wyjątków redundantnym wierszem.
function blockHour(date, hour) {
  db.prepare(
    "DELETE FROM availability_exceptions WHERE date = ? AND kind = 'add' AND start_hour = ? AND end_hour = ?"
  ).run(date, hour, hour + 1);

  db.prepare(
    "INSERT INTO availability_exceptions (date, start_hour, end_hour, kind) VALUES (?, ?, ?, 'block')"
  ).run(date, hour, hour + 1);
}

// Odblokuj jedną godzinę. To jest trudniejszy kierunek: jeśli godzina jest
// zablokowana przez wyjątek obejmujący SZERSZY zakres (np. cały urlopowy
// dzień 8-18 dodany ręcznie w formularzu), a admin klika tylko jedną
// godzinę w środku tego zakresu, trzeba "przeciąć" ten wyjątek na dwa
// kawałki (przed klikniętą godziną i po niej), a nie odblokować całego dnia.
function unblockHour(date, hour) {
  const overlapping = db
    .prepare(
      "SELECT * FROM availability_exceptions WHERE date = ? AND kind = 'block' AND start_hour <= ? AND end_hour > ?"
    )
    .all(date, hour, hour);

  for (const row of overlapping) {
    db.prepare('DELETE FROM availability_exceptions WHERE id = ?').run(row.id);

    if (row.start_hour < hour) {
      db.prepare(
        "INSERT INTO availability_exceptions (date, start_hour, end_hour, kind, note) VALUES (?, ?, ?, 'block', ?)"
      ).run(date, row.start_hour, hour, row.note);
    }
    if (hour + 1 < row.end_hour) {
      db.prepare(
        "INSERT INTO availability_exceptions (date, start_hour, end_hour, kind, note) VALUES (?, ?, ?, 'block', ?)"
      ).run(date, hour + 1, row.end_hour, row.note);
    }
  }

  // Po usunięciu blokad godzina może dalej nie być dostępna, jeśli szablon
  // tygodniowy jej w ogóle nie przewiduje (np. próbujesz odblokować
  // niedzielę, a szablon obejmuje tylko pon-pt) — wtedy trzeba dodać
  // jednogodzinny wyjątek typu 'add', żeby faktycznie stała się wolna.
  const dayOfWeek = getDayOfWeek(date);
  const inTemplate = db
    .prepare('SELECT 1 FROM weekly_template WHERE day_of_week = ? AND start_hour <= ? AND end_hour > ?')
    .get(dayOfWeek, hour, hour);

  if (!inTemplate) {
    db.prepare(
      "INSERT INTO availability_exceptions (date, start_hour, end_hour, kind) VALUES (?, ?, ?, 'add')"
    ).run(date, hour, hour + 1);
  }
}

// Przełącza jedną godzinę: wolna -> zablokowana, zablokowana -> wolna.
// Wywołujące miejsce (routes/admin.js) opakowuje to w runInTransaction.
export function toggleHour(date, hour) {
  const isCurrentlyAvailable = computeAvailableHours(date).includes(hour);
  if (isCurrentlyAvailable) {
    blockHour(date, hour);
  } else {
    unblockHour(date, hour);
  }
}
