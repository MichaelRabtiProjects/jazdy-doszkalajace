/**
 * POST /api/zadatek  { token }
 *
 * Kursant klika "Zadatek wysłany" — zapisujemy godzinę zgłoszenia i wysyłamy
 * maila do instruktora. To TYLKO deklaracja kursanta: pieniądze trzeba
 * sprawdzić na koncie i zaznaczyć "Zadatek otrzymany" w panelu.
 *
 * W publicznym grafiku nic się przez to nie zmienia — dalej widać tylko
 * "wstępna rezerwacja".
 */

import { widokPubliczny } from '../../lib/rezerwacje.js';
import { wyslijEmail } from '../../lib/email.js';
import { mailZadatekZgloszony } from '../../lib/maile.js';
import { json, blad, wymagajBazy } from '../../lib/http.js';

export async function onRequestPost({ request, env }) {
  let dane;
  try {
    dane = await request.json();
  } catch {
    return blad('Nieprawidłowe dane.', 400);
  }
  const token = dane && typeof dane.token === 'string' ? dane.token : '';
  if (!/^[0-9a-f]{32}$/.test(token)) return blad('Nieprawidłowy link.', 400);

  try {
    const db = wymagajBazy(env);
    const r = await db.prepare('SELECT * FROM rezerwacje WHERE token = ?').bind(token).first();
    if (!r) return blad('Nie znaleziono rezerwacji.', 404);

    if (!['wstepna', 'potwierdzona'].includes(r.status)) {
      return blad('Ta rezerwacja nie jest już aktywna.', 409, 'NIEAKTYWNA');
    }

    // Drugie kliknięcie nie wysyła drugiego maila — instruktor dostaje
    // jedno powiadomienie na rezerwację.
    if (!r.zadatek_zgloszony_o) {
      const teraz = new Date().toISOString();
      await db
        .prepare('UPDATE rezerwacje SET zadatek_zgloszony_o = ? WHERE id = ? AND zadatek_zgloszony_o IS NULL')
        .bind(teraz, r.id)
        .run();
      r.zadatek_zgloszony_o = teraz;
      await wyslijEmail(env, mailZadatekZgloszony(r, new URL(request.url).origin, env));
    }

    return json(widokPubliczny(r));
  } catch (err) {
    console.error('Błąd /api/zadatek:', err);
    return blad('Nie udało się zapisać zgłoszenia. Spróbuj ponownie.', 500);
  }
}
