import crypto from 'node:crypto';
import db from '../db/database.js';

// Bez znaków łatwych do pomylenia przy ręcznym przepisywaniu: 0/O, 1/I.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function randomCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

// Szansa na kolizję dwóch losowych 8-znakowych kodów z 33-znakowego
// alfabetu jest astronomicznie mała (33^8 ≈ 1.1 bln kombinacji), ale
// sprawdzamy i tak — "prawie niemożliwe" to nie "niemożliwe", a sprawdzenie
// kosztuje nas jedno proste zapytanie do bazy.
export function generateUniqueBookingCode() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const exists = db.prepare('SELECT 1 FROM bookings WHERE code = ?').get(code);
    if (!exists) return code;
  }
  throw new Error('Nie udało się wygenerować unikalnego kodu rezerwacji.');
}
