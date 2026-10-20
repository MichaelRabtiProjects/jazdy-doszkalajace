/**
 * GET /api/admin/kursanci?q=...  (chronione przez _middleware.js)
 *
 * Podpowiedzi do pola "Z kim odbędzie się spotkanie?" w formularzu
 * "Nowa rezerwacja": osoby z wcześniejszych rezerwacji, szukane po imieniu,
 * nazwisku, telefonie albo e-mailu (lib/kursanci.js).
 */

import { szukajKursantow } from '../../../lib/kursanci.js';
import { json, blad, wymagajBazy } from '../../../lib/http.js';

export async function onRequestGet({ request, env }) {
  try {
    const q = new URL(request.url).searchParams.get('q') || '';
    return json({ kursanci: await szukajKursantow(wymagajBazy(env), q) });
  } catch (err) {
    console.error('Błąd GET /api/admin/kursanci:', err);
    return blad('Nie udało się wyszukać kursantów.', 500);
  }
}
