import { Router } from 'express';
import db, { runInTransaction } from '../db/database.js';
import { computeAvailableHours } from '../services/availability.js';
import { generateUniqueBookingCode } from '../services/bookingCode.js';

const router = Router();

const RATE_GROSZ_PER_HOUR = 16000; // 160 zł, w groszach (patrz komentarz o pieniądzach w migracji 0001_init.sql)
const HOLD_MINUTES = 15;
const VALID_DURATIONS = [2, 3, 4];

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateInput(body) {
  const { client_name, client_phone, client_email, date, start_hour, duration_hours } = body || {};

  if (typeof client_name !== 'string' || client_name.trim().length < 2) return 'Podaj imię i nazwisko.';
  if (typeof client_phone !== 'string' || client_phone.trim().length < 6) return 'Podaj poprawny numer telefonu.';
  if (!isValidEmail(client_email)) return 'Podaj poprawny adres e-mail.';
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Nieprawidłowa data.';
  if (!Number.isInteger(start_hour) || start_hour < 0 || start_hour > 23) return 'Nieprawidłowa godzina.';
  if (!VALID_DURATIONS.includes(duration_hours)) return 'Czas trwania musi wynosić 2, 3 lub 4 godziny.';
  if (start_hour + duration_hours > 24) return 'Wybrany czas trwania wykracza poza dobę.';

  const today = new Date().toISOString().slice(0, 10);
  if (date < today) return 'Nie można rezerwować terminu w przeszłości.';

  return null;
}

// POST /api/bookings — tworzy rezerwację ze statusem "pending_payment" i
// 15-minutową blokadą terminu na czas płatności (Etap 6 dołoży samą
// płatność; ten endpoint już teraz w pełni chroni przed podwójną
// rezerwacją tego samego terminu).
router.post('/', (req, res) => {
  const validationError = validateInput(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const { client_name, client_phone, client_email, date, start_hour, duration_hours } = req.body;
  const requestedHours = [];
  for (let h = start_hour; h < start_hour + duration_hours; h++) requestedHours.push(h);

  try {
    const booking = runInTransaction(() => {
      // computeAvailableHours czyta AKTUALNY stan bazy — a robimy to już
      // wewnątrz transakcji (BEGIN IMMEDIATE w runInTransaction), więc
      // żadna inna rezerwacja nie może się "wcisnąć" pomiędzy ten odczyt a
      // zapis kilka linijek niżej.
      const available = new Set(computeAvailableHours(date));
      const allFree = requestedHours.every((h) => available.has(h));
      if (!allFree) {
        const err = new Error('SLOT_TAKEN');
        err.code = 'SLOT_TAKEN';
        throw err;
      }

      const code = generateUniqueBookingCode();
      const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();
      const amountGrosz = duration_hours * RATE_GROSZ_PER_HOUR;

      const result = db
        .prepare(
          `INSERT INTO bookings
             (code, client_name, client_phone, client_email, date, start_hour, duration_hours, amount_grosz, status, hold_expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?)`
        )
        .run(
          code,
          client_name.trim(),
          client_phone.trim(),
          client_email.trim(),
          date,
          start_hour,
          duration_hours,
          amountGrosz,
          holdExpiresAt
        );

      const bookingId = result.lastInsertRowid;

      // To jest właściwa, twarda ochrona przed podwójną rezerwacją:
      // PRIMARY KEY (date, hour) w booking_hours fizycznie nie pozwala na
      // drugi wiersz dla tej samej godziny. Nawet gdyby powyższy check
      // "allFree" z jakiegoś powodu przepuścił kolizję, ten INSERT i tak
      // by ją odrzucił — więc to jest ochrona niezależna od poprawności
      // reszty kodu, wymuszona przez samą bazę danych.
      const insertHour = db.prepare('INSERT INTO booking_hours (date, hour, booking_id) VALUES (?, ?, ?)');
      for (const h of requestedHours) insertHour.run(date, h, bookingId);

      return { code, amountGrosz, holdExpiresAt };
    });

    res.status(201).json({
      code: booking.code,
      amountGrosz: booking.amountGrosz,
      holdExpiresAt: booking.holdExpiresAt,
    });
  } catch (err) {
    const isSlotTaken = err.code === 'SLOT_TAKEN' || /UNIQUE constraint failed: booking_hours/.test(err.message || '');
    if (isSlotTaken) {
      return res.status(409).json({ error: 'Ten termin właśnie został zajęty przez kogoś innego. Wybierz inny.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Nie udało się utworzyć rezerwacji. Spróbuj ponownie.' });
  }
});

export default router;
