/**
 * POST /api/rezerwacja
 *
 * Tworzy rezerwację ze statusem 'oczekuje' i 15-minutową blokadą terminu.
 * Działa wyłącznie w trybie B (platnosci_online = true) — w trybie A grafik
 * jest tylko informacyjny, a termin umawia się telefonicznie.
 *
 * Właściwe przekierowanie do płatności dojdzie w Etapie 3 (Autopay).
 */

import { utworzRezerwacje, BladRezerwacji } from '../../lib/rezerwacje.js';
import { json, blad, wymagajBazy } from '../../lib/http.js';

export async function onRequestPost({ request, env }) {
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
