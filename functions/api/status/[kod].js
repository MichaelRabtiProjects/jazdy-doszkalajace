/**
 * GET /api/status/:kod — ZAPARKOWANY razem z płatnościami online.
 *
 * Służył stronie potwierdzenia po powrocie z bramki płatniczej. Skoro
 * płatności online nie ma, nie prowadzi tu żaden link — a rezerwacje
 * wpisywane ręcznie z panelu też dostają kod w formacie JD-DDMM-GG.
 * Ten format jest łatwy do zgadnięcia, więc zamiast zostawiać otwarty
 * endpoint bez żadnego zastosowania, wyłączamy go tą samą flagą.
 *
 * Gdy wracał odpowiedź, ŚWIADOMIE nie zwracał imienia, telefonu ani
 * e-maila — dane osobowe nie mogą zależeć od zgadnięcia kodu.
 */

import { wygasStareBlokady, STAWKA_GODZINOWA } from '../../../lib/dostepnosc.js';
import { json, blad, wymagajBazy } from '../../../lib/http.js';
import { PLATNOSCI_ONLINE_DOSTEPNE } from '../../../lib/ustawienia.js';

export async function onRequestGet({ params, env }) {
  if (!PLATNOSCI_ONLINE_DOSTEPNE) {
    return blad('Sprawdzanie statusu rezerwacji jest wyłączone.', 403, 'TRYB_WYLACZONY');
  }

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
