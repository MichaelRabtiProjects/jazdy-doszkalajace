/**
 * /api/admin/kursanci  (chronione przez _middleware.js)
 *
 * GET ?q=...        podpowiedzi do "Nowa rezerwacja" (osoby z rezerwacji)
 * GET ?konta=1&q=   zakładka "Kursanci": konta z liczbą jazd
 * GET ?id=N         konto z historią jazd
 * POST { akcja: 'zablokuj', id, zablokowany }  blokada / odblokowanie konta
 * POST { akcja: 'usun', id }                   usunięcie konta (RODO);
 *      rezerwacje zostają (rozliczenia) i kasują się po 180 dniach
 */

import { szukajKursantow, listaKont, kontoZHistoria, zablokujKonto } from '../../../lib/kursanci.js';
import { usunKonto } from '../../../lib/konto.js';
import { json, blad, wymagajBazy } from '../../../lib/http.js';

export async function onRequestGet({ request, env }) {
  try {
    const db = wymagajBazy(env);
    const p = new URL(request.url).searchParams;
    if (p.get('id')) {
      const k = await kontoZHistoria(db, Number(p.get('id')));
      return k ? json({ konto: k }) : blad('Nie ma takiego konta.', 404);
    }
    if (p.get('konta')) return json({ konta: await listaKont(db, p.get('q') || '') });
    return json({ kursanci: await szukajKursantow(db, p.get('q') || '') });
  } catch (err) {
    console.error('Błąd GET /api/admin/kursanci:', err);
    return blad('Nie udało się wczytać kursantów.', 500);
  }
}

export async function onRequestPost({ request, env }) {
  let dane;
  try {
    dane = await request.json();
  } catch {
    return blad('Nieprawidłowe dane.', 400);
  }
  try {
    const db = wymagajBazy(env);
    if (!dane || !Number.isInteger(dane.id)) return blad('Brak konta.', 400);
    if (dane.akcja === 'zablokuj') await zablokujKonto(db, dane.id, Boolean(dane.zablokowany));
    else if (dane.akcja === 'usun') await usunKonto(db, dane.id);
    else return blad('Nieznana akcja.', 400);
    return json({ ok: true });
  } catch (err) {
    console.error('Błąd POST /api/admin/kursanci:', err);
    return blad('Nie udało się zapisać zmiany.', 500);
  }
}
