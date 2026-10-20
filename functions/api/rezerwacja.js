/**
 * /api/rezerwacja
 *
 * POST — wstępna rezerwacja z formularza przy grafiku. Termin od razu
 *        znika z wolnych godzin i pokazuje się jako "wstępna rezerwacja".
 *        Wysyła dwa maile: do instruktora i do kursanta.
 *        Gdy konta są włączone, rezerwować może tylko zalogowany kursant
 *        z uzupełnionym profilem (401 BRAK_SESJI / 409 PROFIL); e-mail
 *        rezerwacji to wtedy zawsze e-mail konta, a imię i telefon mogą
 *        należeć do innej osoby jadącej (np. rodzic zapisuje dziecko).
 *
 * GET ?t=TOKEN — dane jednej rezerwacji dla strony "Twoja rezerwacja"
 *        (link z maila). Token jest losowy i niezgadywalny, a odpowiedź
 *        i tak nie zawiera telefonu ani e-maila.
 */

import { utworzWstepna, widokPubliczny, BladRezerwacji } from '../../lib/rezerwacje.js';
import { wyslijEmail } from '../../lib/email.js';
import { mailNowaRezerwacja, mailWstepnaDoKursanta } from '../../lib/maile.js';
import { json, blad, wymagajBazy } from '../../lib/http.js';
import { kontaWlaczone, kontoZSesji, profilKompletny } from '../../lib/konto.js';

const KOMUNIKATY = {
  sesja: { pl: 'Zaloguj się, żeby zobaczyć wolne terminy.', en: 'Please sign in to see available times.' },
  profil: {
    pl: 'Uzupełnij imię i nazwisko oraz telefon w swoim koncie, żeby zarezerwować jazdę.',
    en: 'Please complete your name and phone number in your account to book a lesson.',
  },
};

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
    const jezyk = dane && dane.jezyk === 'en' ? 'en' : 'pl';
    let konto = null;
    if (kontaWlaczone(env)) {
      // Zalogowany kursant — rezerwacja zapisuje się na jego koncie
      konto = await kontoZSesji(db, request);
      if (!konto) return blad(KOMUNIKATY.sesja[jezyk], 401, 'BRAK_SESJI');
      if (!profilKompletny(konto)) return blad(KOMUNIKATY.profil[jezyk], 409, 'PROFIL');
      // Potwierdzenie i link do rezerwacji idą zawsze na adres konta
      // (sprawdzony kodem), nie na adres wpisany w przeglądarce.
      dane = { ...dane, email: konto.email };
    }
    const r = await utworzWstepna(db, dane, { uzytkownikId: konto ? konto.id : null });
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
