/**
 * GET /api/status/:kod
 *
 * Status rezerwacji po kodzie — używany przez stronę potwierdzenia po
 * powrocie z płatności.
 *
 * ŚWIADOMIE nie zwraca imienia, telefonu ani e-maila. Kod ma przewidywalny
 * format (JD-DDMM-GG), więc ktoś mógłby zgadywać kolejne — a to, że dany
 * termin jest zajęty, i tak widać w publicznym grafiku. Dane osobowe
 * klienta nie mogą zależeć od zgadnięcia kodu.
 */

import { wygasStareBlokady, STAWKA_GODZINOWA } from '../../../lib/dostepnosc.js';
import { json, blad, wymagajBazy } from '../../../lib/http.js';

export async function onRequestGet({ params, env }) {
  try {
    const db = wymagajBazy(env);
    const kod = String(params.kod || '').toUpperCase();

    if (!/^JD-\d{4}-\d{2}(-\d+)?$/.test(kod)) {
      return blad('Nieprawidłowy kod rezerwacji.', 400);
    }

    // Żeby status nie pokazywał 'oczekuje' dla blokady, która już wygasła
    await wygasStareBlokady(db);

    const r = await db
      .prepare(
        `SELECT kod_rezerwacji, data, godzina_start, godzina_koniec,
                kwota_zadatku, status, utworzono_o
         FROM rezerwacje WHERE kod_rezerwacji = ?`
      )
      .bind(kod)
      .first();

    if (!r) return blad('Nie znaleziono rezerwacji o tym kodzie.', 404);

    const dlugosc = r.godzina_koniec - r.godzina_start;

    return json({
      kod_rezerwacji: r.kod_rezerwacji,
      data: r.data,
      godzina_start: r.godzina_start,
      godzina_koniec: r.godzina_koniec,
      dlugosc,
      status: r.status,
      kwota_zadatku: r.kwota_zadatku,
      do_zaplaty_na_miejscu: dlugosc * STAWKA_GODZINOWA - r.kwota_zadatku,
    });
  } catch (err) {
    console.error('Błąd /api/status:', err);
    return blad('Nie udało się sprawdzić rezerwacji.', 500);
  }
}
