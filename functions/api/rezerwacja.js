/**
 * POST /api/rezerwacja — ZAPARKOWANY (płatności online wyłączone).
 *
 * Grafik jest dziś wyłącznie informacyjny: klient klika wolny termin
 * i kontaktuje się bezpośrednio, a rezerwację wprowadza instruktor z panelu.
 * Ten endpoint odpowiada więc zawsze 403 i nie przyjmuje żadnych danych.
 *
 * Kod tworzenia rezerwacji zostaje pod spodem, bo panel administratora
 * będzie korzystał z tej samej funkcji `utworzRezerwacje`.
 */

import { utworzRezerwacje, BladRezerwacji } from '../../lib/rezerwacje.js';
import { json, blad, wymagajBazy } from '../../lib/http.js';
import { PLATNOSCI_ONLINE_DOSTEPNE } from '../../lib/ustawienia.js';

export async function onRequestPost({ request, env }) {
  // Odrzucamy PRZED odczytaniem treści żądania. Gdybyśmy najpierw sparsowali
  // JSON, imię, telefon i e-mail trafiłyby choćby na chwilę do pamięci
  // serwera — a umówiliśmy się, że strona nie zbiera danych osobowych.
  if (!PLATNOSCI_ONLINE_DOSTEPNE) {
    return blad(
      'Rezerwacja online jest wyłączona — wybierz termin w grafiku i skontaktuj się bezpośrednio.',
      403,
      'TRYB_WYLACZONY'
    );
  }

  let dane;
  try {
    dane = await request.json();
  } catch {
    return blad('Nieprawidłowe dane formularza.', 400);
  }

  try {
    const db = wymagajBazy(env);
    const rezerwacja = await utworzRezerwacje(db, dane);
    return json(rezerwacja, 201);
  } catch (err) {
    if (err instanceof BladRezerwacji) {
      return blad(err.message, err.status, err.kod);
    }
    console.error('Błąd /api/rezerwacja:', err);
    return blad('Nie udało się utworzyć rezerwacji. Spróbuj ponownie.', 500);
  }
}
