/**
 * /api/konto/rezerwacje — "Moje rezerwacje" zalogowanego kursanta.
 *   GET                 lista (nadchodzące i historia)
 *   POST { id, jezyk }  odwołanie: wstępna zawsze, potwierdzona do 24 h przed
 */

import { kontoZSesji } from '../../../lib/konto.js';
import { rezerwacjeKonta, odwolajPrzezKursanta, BladRezerwacji } from '../../../lib/rezerwacje.js';
import { wyslijEmail } from '../../../lib/email.js';
import { mailOdwolanieOdKursanta } from '../../../lib/maile.js';
import { json, blad, wymagajBazy } from '../../../lib/http.js';

export async function onRequestGet({ request, env }) {
  try {
    const db = wymagajBazy(env);
    const u = await kontoZSesji(db, request);
    if (!u) return blad('Zaloguj się ponownie.', 401, 'BRAK_SESJI');
    return json({ rezerwacje: await rezerwacjeKonta(db, u.id) });
  } catch (err) {
    console.error('Błąd GET /api/konto/rezerwacje:', err);
    return blad('Nie udało się wczytać rezerwacji.', 500);
  }
}

export async function onRequestPost({ request, env }) {
  let dane;
  try {
    dane = await request.json();
  } catch {
    return blad('Nieprawidłowe dane.', 400);
  }
  try {
    const db = wymagajBazy(env);
    const u = await kontoZSesji(db, request);
    if (!u) return blad('Zaloguj się ponownie.', 401, 'BRAK_SESJI');
    const r = await odwolajPrzezKursanta(db, u.id, dane && dane.id, dane && dane.jezyk === 'en' ? 'en' : u.jezyk);
    await wyslijEmail(env, mailOdwolanieOdKursanta(r, new URL(request.url).origin, env));
    return json({ ok: true, rezerwacje: await rezerwacjeKonta(db, u.id) });
  } catch (err) {
    if (err instanceof BladRezerwacji) return blad(err.message, err.status, err.kod);
    console.error('Błąd POST /api/konto/rezerwacje:', err);
    return blad('Nie udało się odwołać jazdy.', 500);
  }
}
