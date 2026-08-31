import { Router } from 'express';
import db, { runInTransaction } from '../db/database.js';
import { verifyPassword } from '../auth/password.js';
import { createSessionCookie, verifySessionCookie } from '../auth/session.js';
import { parseCookies } from '../middleware/cookies.js';
import { requireAdmin, ADMIN_COOKIE_NAME } from '../middleware/adminAuth.js';
import { computeAvailableHours } from '../services/availability.js';
import { toggleHour } from '../services/calendarAdmin.js';

const router = Router();

// Prosty licznik nieudanych prób logowania W PAMIĘCI PROCESU (nie w bazie).
// Znika przy restarcie serwera, ale to nam wystarcza — chodzi tylko o to,
// żeby zniechęcić automat próbujący zgadywać hasło (brute force), nie o
// wytrzymały system bezpieczeństwa dla wielu serwerów.
const loginAttempts = new Map(); // ip -> { count, resetAt }
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(ip) {
  const entry = loginAttempts.get(ip);
  return Boolean(entry) && Date.now() < entry.resetAt && entry.count >= MAX_ATTEMPTS;
}

function registerFailedAttempt(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry || Date.now() > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

router.post('/login', (req, res) => {
  const ip = req.ip;

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za 15 minut.' });
  }

  const { password } = req.body || {};
  const hash = process.env.ADMIN_PASSWORD_HASH;

  if (!hash || typeof password !== 'string' || !verifyPassword(password, hash)) {
    registerFailedAttempt(ip);
    return res.status(401).json({ error: 'Nieprawidłowe hasło.' });
  }

  loginAttempts.delete(ip);

  res.cookie(ADMIN_COOKIE_NAME, createSessionCookie(), {
    httpOnly: true, // niedostępne dla JS w przeglądarce — ochrona przed kradzieżą ciasteczka przez XSS
    sameSite: 'lax', // przeglądarka nie wyśle tego ciasteczka przy zapytaniach zainicjowanych z obcych stron
    secure: process.env.NODE_ENV === 'production', // wymóg HTTPS włączymy dopiero na produkcji (lokalnie działamy po http)
    maxAge: 12 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const cookies = parseCookies(req);
  res.json({ loggedIn: verifySessionCookie(cookies[ADMIN_COOKIE_NAME]) });
});

// Wszystko poniżej tej linii wymaga zalogowania — router.use bez ścieżki
// dokłada requireAdmin jako krok pośredni dla każdej trasy zarejestrowanej
// PO nim (na /login, /logout, /me nie ma wpływu, bo są zarejestrowane wyżej).
router.use(requireAdmin);

router.get('/weekly-template', (req, res) => {
  const template = db.prepare('SELECT * FROM weekly_template ORDER BY day_of_week, start_hour').all();
  res.json({ template });
});

function isValidHourRange(start_hour, end_hour) {
  return (
    Number.isInteger(start_hour) &&
    start_hour >= 0 &&
    start_hour <= 23 &&
    Number.isInteger(end_hour) &&
    end_hour >= 1 &&
    end_hour <= 24 &&
    end_hour > start_hour
  );
}

router.post('/weekly-template', (req, res) => {
  const { day_of_week, start_hour, end_hour } = req.body || {};

  if (!Number.isInteger(day_of_week) || day_of_week < 0 || day_of_week > 6 || !isValidHourRange(start_hour, end_hour)) {
    return res.status(400).json({ error: 'Nieprawidłowe dane. Dzień tygodnia 0-6, godziny 0-24, koniec po początku.' });
  }

  const result = db
    .prepare('INSERT INTO weekly_template (day_of_week, start_hour, end_hour) VALUES (?, ?, ?)')
    .run(day_of_week, start_hour, end_hour);

  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/weekly-template/:id', (req, res) => {
  db.prepare('DELETE FROM weekly_template WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/admin/calendar?start=YYYY-MM-DD&days=7
// Siatka godzina-po-godzinie do szybkiego klikania w panelu (styl
// Calendesk). W przeciwieństwie do publicznego /api/availability, tu
// dostajemy status KAŻDEJ godziny (nie tylko wolnych) oraz informację, czy
// dana godzina jest zajęta przez prawdziwą rezerwację (booked) — takiej
// komórki nie da się przełączyć klikiem, bo nie jest to wyjątek w grafiku,
// tylko czyjaś rezerwacja.
router.get('/calendar', (req, res) => {
  const { start } = req.query;
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return res.status(400).json({ error: 'Parametr "start" musi być datą w formacie YYYY-MM-DD.' });
  }

  const numDays = Math.min(Math.max(Number(req.query.days) || 7, 1), 31);
  const startDate = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime())) {
    return res.status(400).json({ error: 'Nieprawidłowa data w parametrze "start".' });
  }

  const days = [];
  for (let i = 0; i < numDays; i++) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);

    const available = new Set(computeAvailableHours(dateStr));

    const bookedRows = db
      .prepare(
        `SELECT bh.hour, b.code, b.client_name, b.status
         FROM booking_hours bh
         JOIN bookings b ON b.id = bh.booking_id
         WHERE bh.date = ?
           AND (b.status = 'paid' OR (b.status = 'pending_payment' AND datetime(b.hold_expires_at) > datetime('now')))`
      )
      .all(dateStr);
    const bookedByHour = new Map(bookedRows.map((r) => [r.hour, r]));

    const hours = [];
    for (let h = 0; h < 24; h++) {
      const booking = bookedByHour.get(h);
      if (booking) {
        hours.push({ hour: h, status: 'booked', code: booking.code, clientName: booking.client_name, bookingStatus: booking.status });
      } else {
        hours.push({ hour: h, status: available.has(h) ? 'available' : 'blocked' });
      }
    }

    days.push({ date: dateStr, hours });
  }

  res.json({ days });
});

// POST /api/admin/calendar/toggle { date, hour }
// Przełącza jedną godzinę: wolna <-> zablokowana. Kliknięcie w komórkę
// kalendarza w panelu wywołuje właśnie to.
router.post('/calendar/toggle', (req, res) => {
  const { date, hour } = req.body || {};

  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    return res.status(400).json({ error: 'Nieprawidłowe dane.' });
  }

  const today = new Date().toISOString().slice(0, 10);
  if (date < today) {
    return res.status(400).json({ error: 'Nie można edytować grafiku dla dat z przeszłości.' });
  }

  const booked = db
    .prepare(
      `SELECT 1 FROM booking_hours bh
       JOIN bookings b ON b.id = bh.booking_id
       WHERE bh.date = ? AND bh.hour = ?
         AND (b.status = 'paid' OR (b.status = 'pending_payment' AND datetime(b.hold_expires_at) > datetime('now')))`
    )
    .get(date, hour);

  if (booked) {
    return res.status(409).json({ error: 'Ta godzina jest zajęta przez rezerwację klienta — nie można jej stąd przełączyć.' });
  }

  runInTransaction(() => toggleHour(date, hour));

  res.json({ ok: true });
});

router.get('/exceptions', (req, res) => {
  const exceptions = db.prepare('SELECT * FROM availability_exceptions ORDER BY date, start_hour').all();
  res.json({ exceptions });
});

router.post('/exceptions', (req, res) => {
  const { date, start_hour, end_hour, kind, note } = req.body || {};

  if (
    typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !isValidHourRange(start_hour, end_hour) ||
    !['add', 'block'].includes(kind)
  ) {
    return res.status(400).json({ error: 'Nieprawidłowe dane wyjątku.' });
  }

  const result = db
    .prepare('INSERT INTO availability_exceptions (date, start_hour, end_hour, kind, note) VALUES (?, ?, ?, ?, ?)')
    .run(date, start_hour, end_hour, kind, note || null);

  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/exceptions/:id', (req, res) => {
  db.prepare('DELETE FROM availability_exceptions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/bookings', (req, res) => {
  const bookings = db
    .prepare(
      `SELECT id, code, client_name, client_phone, client_email, date, start_hour,
              duration_hours, amount_grosz, status, created_at
       FROM bookings
       ORDER BY date DESC, start_hour DESC`
    )
    .all();
  res.json({ bookings });
});

export default router;
