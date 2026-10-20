/**
 * GET /api/dostepnosc?miejsce=ID
 *
 * Wolne terminy w horyzoncie (maks. 3 tygodnie) dla wybranego miejsca
 * spotkania — z buforami na dojazd i dopłatą za dojazd. Bez parametru
 * `miejsce` terminy są liczone bez buforów i bez ceny (grafik pokazuje
 * wtedy tylko prośbę o wybór miejsca). Zawsze zwraca też listę miejsc.
 *
 * Gdy konta kursantów są włączone (lib/konto.js → kontaWlaczone), grafik
 * widzą tylko zalogowani (decyzja właściciela: gość widzi rozmyty obrazek).
 * Samo ukrycie w przeglądarce by nie wystarczyło — stąd 401 tutaj.
 */

import { policzDostepnosc } from '../../lib/dostepnosc.js';
import { json, blad, wymagajBazy } from '../../lib/http.js';
import { kontaWlaczone, kontoZSesji } from '../../lib/konto.js';

export async function onRequestGet({ request, env }) {
  try {
    const db = wymagajBazy(env);
    if (kontaWlaczone(env) && !(await kontoZSesji(db, request))) {
      return blad('Zaloguj się, żeby zobaczyć wolne terminy.', 401, 'BRAK_SESJI');
    }
    const miejsce = new URL(request.url).searchParams.get('miejsce') || null;
    const dane = await policzDostepnosc(db, miejsce);
    return json(dane);
  } catch (err) {
    console.error('Błąd /api/dostepnosc:', err);
    return blad('Nie udało się pobrać grafiku. Spróbuj odświeżyć stronę.', 500);
  }
}
