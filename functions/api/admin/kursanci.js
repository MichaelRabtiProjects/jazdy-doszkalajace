/**
 * /api/admin/kursanci  (chronione przez _middleware.js)
 *
 * GET ?q=...        podpowiedzi do "Nowa rezerwacja" (osoby z rezerwacji)
 * GET ?konta=1&q=   zakładka "Kursanci": konta i osoby bez konta (z rezerwacji) z liczbą jazd
 * GET ?id=N         konto z historią jazd
 * GET ?osoba=tel:…  osoba bez konta z historią jazd (klucz z listy)
 * POST { akcja: 'zablokuj', id, zablokowany }  blokada / odblokowanie konta
 * POST { akcja: 'usun', id }                   usunięcie konta (RODO);
 *      rezerwacje zostają (rozliczenia) i kasują się po 180 dniach
 * POST { akcja: 'zapros', osoba: 'tel:…' }     e-mail z zaproszeniem do konta
 *      dla osoby bez konta (na e-mail z jej rezerwacji). Konto zakłada się
 *      przy pierwszym logowaniu kodem, rezerwacje podpinają się po e-mailu.
 */

import { szukajKursantow, listaKont, kontoZHistoria, osobaZHistoria, zablokujKonto } from '../../../lib/kursanci.js';
import { usunKonto } from '../../../lib/konto.js';
import { wyslijEmail } from '../../../lib/email.js';
import { mailZaproszenieDoKonta } from '../../../lib/maile.js';
import { json, blad, wymagajBazy } from '../../../lib/http.js';

async function zapros(db, env, request, klucz) {
  const osoba = await osobaZHistoria(db, klucz);
  if (!osoba) return blad('Nie ma takiej osoby.', 404);
  if (!osoba.email) return blad('Ta osoba nie ma e-maila — nie da się wysłać zaproszenia.', 400);
  const konto = await db.prepare('SELECT id FROM uzytkownicy WHERE email = ?').bind(osoba.email.trim().toLowerCase()).first();
  if (konto) return blad('Ta osoba ma już konto na ten e-mail.', 409);
  const origin = new URL(request.url).origin;
  const wyslany = await wyslijEmail(env, mailZaproszenieDoKonta(osoba, origin, env));
  if (!wyslany) return blad('Nie udało się wysłać e-maila (sprawdź klucz Brevo).', 502);
  return json({ ok: true, email: osoba.email });
}

export async function onRequestGet({ request, env }) {
  try {
    const db = wymagajBazy(env);
    const p = new URL(request.url).searchParams;
    if (p.get('id')) {
      const k = await kontoZHistoria(db, Number(p.get('id')));
      return k ? json({ konto: k }) : blad('Nie ma takiego konta.', 404);
    }
    if (p.get('osoba')) {
      const o = await osobaZHistoria(db, p.get('osoba'));
      return o ? json({ konto: o }) : blad('Nie ma takiej osoby.', 404);
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
    if (dane && dane.akcja === 'zapros') return await zapros(db, env, request, dane.osoba);
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
