/**
 * GET /api/konto/ja — kto jest zalogowany (menu "Zaloguj się / Moje konto",
 * strona konta, grafik).
 */

import { kontoZSesji, widokKonta } from '../../../lib/konto.js';
import { json, blad, wymagajBazy } from '../../../lib/http.js';

export async function onRequestGet({ request, env }) {
  try {
    const u = await kontoZSesji(wymagajBazy(env), request);
    return json(u ? { zalogowany: true, konto: widokKonta(u) } : { zalogowany: false });
  } catch (err) {
    console.error('Błąd /api/konto/ja:', err);
    return blad('Nie udało się sprawdzić logowania.', 500);
  }
}
