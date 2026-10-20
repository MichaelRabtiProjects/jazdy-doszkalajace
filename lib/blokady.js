/**
 * Blokady kalendarza z panelu ("Blokada kalendarza" jak w Calendesku),
 * np. "Prywatne doszkalanie" śr 19:00–21:00.
 *
 * Zablokowany czas znika z grafiku kursantów (lib/dostepnosc.js) i nie da
 * się na niego zapisać (warunek w INSERT w lib/rezerwacje.js). Blokada nie
 * może nachodzić na żywą jazdę ani na inną blokadę — sprawdzamy to w tej
 * samej instrukcji co zapis, więc nic nie wciśnie się w międzyczasie.
 */

import { BladRezerwacji } from './rezerwacje.js';
import { ZYWE_SQL } from './dostepnosc.js';

const OPIS_MAKS = 120;

function godz(m) {
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

function sprawdz(dane) {
  const d = dane || {};
  if (typeof d.data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.data)) {
    throw new BladRezerwacji('WALIDACJA', 'Nieprawidłowa data blokady.');
  }
  const ok = (m) => Number.isInteger(m) && m >= 0 && m <= 24 * 60 && m % 5 === 0;
  if (!ok(d.start) || !ok(d.koniec) || d.koniec <= d.start) {
    throw new BladRezerwacji('WALIDACJA', 'Blokada: godzina końca musi być po godzinie początku (co 5 minut).');
  }
  const opis = typeof d.opis === 'string' ? d.opis.trim().replace(/\s+/g, ' ').slice(0, OPIS_MAKS) : '';
  return { data: d.data, start: d.start, koniec: d.koniec, opis: opis || null };
}

/** Z czym koliduje dany czas — do czytelnego komunikatu w panelu. */
async function opisKolizji(db, data, start, koniec, bezBlokadyId = null) {
  const jazda = await db
    .prepare(
      `SELECT imie, start_min, koniec_min FROM rezerwacje
       WHERE data = ? AND status IN (${ZYWE_SQL}) AND start_min < ? AND koniec_min > ?
       ORDER BY start_min LIMIT 1`
    )
    .bind(data, koniec, start)
    .first();
  if (jazda) {
    return 'Ten czas nachodzi na jazdę ' + godz(jazda.start_min) + '–' + godz(jazda.koniec_min) + ' (' + jazda.imie +
      '). Najpierw przenieś albo odwołaj jazdę.';
  }
  const blokada = await db
    .prepare(
      `SELECT start_min, koniec_min FROM blokady
       WHERE data = ? AND start_min < ? AND koniec_min > ? AND id != ?
       ORDER BY start_min LIMIT 1`
    )
    .bind(data, koniec, start, bezBlokadyId == null ? -1 : bezBlokadyId)
    .first();
  if (blokada) return 'Ten czas nachodzi na inną blokadę ' + godz(blokada.start_min) + '–' + godz(blokada.koniec_min) + '.';
  return 'Nie udało się zapisać blokady — odśwież kalendarz i spróbuj ponownie.';
}

export async function utworzBlokade(db, dane) {
  const b = sprawdz(dane);
  const { meta } = await db
    .prepare(
      `INSERT INTO blokady (data, start_min, koniec_min, opis)
       SELECT ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM rezerwacje WHERE data = ? AND status IN (${ZYWE_SQL}) AND start_min < ? AND koniec_min > ?
       ) AND NOT EXISTS (
         SELECT 1 FROM blokady WHERE data = ? AND start_min < ? AND koniec_min > ?
       )`
    )
    .bind(b.data, b.start, b.koniec, b.opis, b.data, b.koniec, b.start, b.data, b.koniec, b.start)
    .run();
  if (!meta || meta.changes !== 1) {
    throw new BladRezerwacji('KOLIZJA', await opisKolizji(db, b.data, b.start, b.koniec), 409);
  }
  return db.prepare('SELECT * FROM blokady WHERE id = ?').bind(meta.last_row_id).first();
}

/** Przesunięcie (przeciąganie w kalendarzu) albo zmiana godzin / opisu. */
export async function zmienBlokade(db, id, dane) {
  if (!Number.isInteger(id)) throw new BladRezerwacji('WALIDACJA', 'Brak identyfikatora blokady.');
  const stara = await db.prepare('SELECT * FROM blokady WHERE id = ?').bind(id).first();
  if (!stara) throw new BladRezerwacji('BRAK', 'Tej blokady już nie ma — odśwież kalendarz.', 404);
  const b = sprawdz({
    data: dane.data !== undefined ? dane.data : stara.data,
    start: dane.start !== undefined ? dane.start : stara.start_min,
    koniec: dane.koniec !== undefined ? dane.koniec : stara.koniec_min,
    opis: dane.opis !== undefined ? dane.opis : stara.opis,
  });
  const { meta } = await db
    .prepare(
      `UPDATE blokady SET data = ?, start_min = ?, koniec_min = ?, opis = ?
       WHERE id = ? AND NOT EXISTS (
         SELECT 1 FROM rezerwacje WHERE data = ? AND status IN (${ZYWE_SQL}) AND start_min < ? AND koniec_min > ?
       ) AND NOT EXISTS (
         SELECT 1 FROM blokady WHERE data = ? AND id != ? AND start_min < ? AND koniec_min > ?
       )`
    )
    .bind(b.data, b.start, b.koniec, b.opis, id, b.data, b.koniec, b.start, b.data, id, b.koniec, b.start)
    .run();
  if (!meta || meta.changes !== 1) {
    throw new BladRezerwacji('KOLIZJA', await opisKolizji(db, b.data, b.start, b.koniec, id), 409);
  }
  return db.prepare('SELECT * FROM blokady WHERE id = ?').bind(id).first();
}

export async function usunBlokade(db, id) {
  if (!Number.isInteger(id)) throw new BladRezerwacji('WALIDACJA', 'Brak identyfikatora blokady.');
  await db.prepare('DELETE FROM blokady WHERE id = ?').bind(id).run();
}
