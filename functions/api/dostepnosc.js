/**
 * GET /api/dostepnosc
 *
 * Zwraca wolne terminy w horyzoncie (maks. 3 tygodnie) wraz z flagą trybu
 * płatności. Przy okazji wygasza blokady starsze niż 15 minut — Pages
 * Functions nie mają cronów, więc sprzątanie dzieje się przy odczycie.
 */

import { policzDostepnosc } from '../../lib/dostepnosc.js';
import { json, blad, wymagajBazy } from '../../lib/http.js';

export async function onRequestGet({ env }) {
  try {
    const db = wymagajBazy(env);
    const dane = await policzDostepnosc(db);
    return json(dane);
  } catch (err) {
    console.error('Błąd /api/dostepnosc:', err);
    return blad('Nie udało się pobrać grafiku. Spróbuj odświeżyć stronę.', 500);
  }
}
