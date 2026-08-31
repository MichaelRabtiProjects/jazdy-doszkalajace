import db, { runInTransaction } from '../db/database.js';

// Sprząta rezerwacje, których 15-minutowa blokada minęła, a klient nie
// dokończył płatności.
//
// Ważne: to zadanie NIE jest potrzebne do poprawności grafiku — dostępność
// terminów (services/availability.js) już wcześniej poprawnie ignoruje takie
// "wiszące" rezerwacje same z siebie, sprawdzając na bieżąco, czy blokada
// jeszcze trwa. Bez tego zadania grafik i tak działałby dobrze.
//
// To zadanie robi coś innego: fizycznie oznacza takie rezerwacje jako
// "wygasła" i zwalnia zajmowane przez nie godziny. Bez tego zalegałyby w
// bazie i w panelu admina wyglądałyby jak wciąż czekające na płatność,
// mimo że klient dawno zrezygnował (albo po prostu zamknął kartę).
export function expireStaleHolds() {
  return runInTransaction(() => {
    const stale = db
      .prepare(
        `SELECT id FROM bookings
         WHERE status = 'pending_payment' AND datetime(hold_expires_at) <= datetime('now')`
      )
      .all();

    if (stale.length === 0) return 0;

    const deleteHours = db.prepare('DELETE FROM booking_hours WHERE booking_id = ?');
    const markExpired = db.prepare("UPDATE bookings SET status = 'expired' WHERE id = ?");

    for (const { id } of stale) {
      deleteHours.run(id);
      markExpired.run(id);
    }

    return stale.length;
  });
}

const INTERVAL_MS = 60 * 1000; // co minutę - blokady trwają 15 minut, więc to więcej niż wystarczająca częstotliwość

export function startExpiredHoldsJob() {
  const run = () => {
    try {
      const count = expireStaleHolds();
      if (count > 0) {
        console.log(`Zwolniono ${count} wygasłych blokad terminów.`);
      }
    } catch (err) {
      console.error('Błąd podczas sprzątania wygasłych blokad:', err);
    }
  };

  run(); // od razu przy starcie - gdyby serwer był wyłączony, gdy jakieś blokady wygasały
  return setInterval(run, INTERVAL_MS);
}
