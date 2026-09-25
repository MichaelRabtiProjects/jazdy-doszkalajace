/**
 * /api/rezerwacja
 *
 * POST — wstępna rezerwacja z formularza przy grafiku. Termin od razu
 *        znika z wolnych godzin i pokazuje się jako "wstępna rezerwacja".
 *        Wysyła dwa maile: do instruktora i do kursanta.
 *
 * GET ?t=TOKEN — dane jednej rezerwacji dla strony "Twoja rezerwacja"
 *        (link z maila). Token jest losowy i niezgadywalny, a odpowiedź
 *        i tak nie zawiera telefonu ani e-maila.
 */

import { utworzWstepna, widokPubliczny, BladRezerwacji } from '../../lib/rezerwacje.js';
import { wyslijEmail } from '../../lib/email.js';
import { mailNowaRezerwacja, mailWstepnaDoKursanta } from '../../lib/maile.js';
import { json, blad, wymagajBazy } from '../../lib/http.js';

export async function onRequestPost({ request, env }) {
  let dane;
  try {
    dane = await request.json();
  } catch {
    return blad('Nieprawidłowe dane formularza.', 400);
  }

  // Pułapka na boty: pole "strona" jest w formularzu ukryte przed ludźmi,
  // więc wypełnia je tylko automat, który wpisuje coś w każde pole.
  if (dane && typeof dane.strona === 'string' && dane.strona.trim() !== '') {
    return blad('Nieprawidłowe dane formularza.', 400);
  }

  try {
    const db = wymagajBazy(env);
    const r = await utworzWstepna(db, dane);
    const origin = new URL(request.url).origin;

    // Oba maile równolegle. wyslijEmail nigdy nie rzuca wyjątku — nieudany
    // mail nie może cofnąć zapisanej już rezerwacji.
    const [, doKursanta] = await Promise.all([
      wyslijEmail(env, mailNowaRezerwacja(r, origin, env)),
      wyslijEmail(env, mailWstepnaDoKursanta(r, origin, env)),
    ]);

    return json(
      { ...widokPubliczny(r), token: r.token, email_wyslany: doKursanta },
      201
    );
  } catch (err) {
    if (err instanceof BladRezerwacji) return blad(err.message, err.status, err.kod);
    console.error('Błąd POST /api/rezerwacja:', err);
    return blad('Nie udało się zapisać rezerwacji. Spróbuj ponownie.', 500);
  }
}

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('t') || '';
  if (!/^[0-9a-f]{32}$/.test(token)) return blad('Nieprawidłowy link.', 400);

  try {
    const db = wymagajBazy(env);
    const r = await db.prepare('SELECT * FROM rezerwacje WHERE token = ?').bind(token).first();
    if (!r) return blad('Nie znaleziono rezerwacji.', 404);
    return json(widokPubliczny(r));
  } catch (err) {
    console.error('Błąd GET /api/rezerwacja:', err);
    return blad('Nie udało się wczytać rezerwacji.', 500);
  }
}
