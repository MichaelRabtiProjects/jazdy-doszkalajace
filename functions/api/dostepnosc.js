/**
 * GET /api/dostepnosc?miejsce=ID
 *
 * Wolne terminy w horyzoncie (maks. 3 tygodnie) dla wybranego miejsca
 * spotkania — z buforami na dojazd i dopłatą za dojazd. Bez parametru
 * `miejsce` terminy są liczone bez buforów i bez ceny (grafik pokazuje
 * wtedy tylko prośbę o wybór miejsca). Zawsze zwraca też listę miejsc.
 */

import { policzDostepnosc } from '../../lib/dostepnosc.js';
import { json, blad, wymagajBazy } from '../../lib/http.js';

export async function onRequestGet({ request, env }) {
  try {
    const db = wymagajBazy(env);
    const miejsce = new URL(request.url).searchParams.get('miejsce') || null;
    const dane = await policzDostepnosc(db, miejsce);
    return json(dane);
  } catch (err) {
    console.error('Błąd /api/dostepnosc:', err);
    return blad('Nie udało się pobrać grafiku. Spróbuj odświeżyć stronę.', 500);
  }
}
