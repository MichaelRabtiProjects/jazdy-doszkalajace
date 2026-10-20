/**
 * /api/admin/rezerwacje (chronione przez _middleware.js)
 *
 * GET  — rezerwacje od 14 dni wstecz w przód (z ?wszystkie=1 — wszystkie).
 * POST { akcja, ... }:
 *   potwierdz  { id, powiadom }  wstępna → potwierdzona (+ mail do kursanta)
 *   odrzuc     { id, powiadom }  wstępna → odrzucona, termin wraca do grafiku
 *   anuluj     { id }            potwierdzona → anulowana, termin wraca
 *   zadatek    { id, otrzymany } zaznacza / odznacza wpłatę zadatku
 *   notatka    { id, notatka }   notatka widoczna tylko w panelu
 *   usun       { id }            trwałe usunięcie (np. prośba o usunięcie danych)
 *   edytuj     { id, data?, start?, dlugosc? | koniec?, miejsce?, doplata_h? }  ręczna zmiana
 *              (np. krótszy bufor na dojazd; przeciągnięcie jazdy w kalendarzu)
 *   dodaj      { data, start, dlugosc | koniec, miejsce?, doplata_h?, imie, telefon, email?,
 *                notatka?, status? ('potwierdzona' | 'wstepna'), jezyk?, powiadom }
 *
 * Godziny w minutach od północy (start: 805 = 13:25).
 */

import { utworzZPanelu, edytujZPanelu, zwolnijTermin, usunStareDane, BladRezerwacji } from '../../../lib/rezerwacje.js';
import { MIEJSCA } from '../../../lib/miejsca.js';
import { wyslijEmail } from '../../../lib/email.js';
import { mailPotwierdzonaDoKursanta, mailOdrzuconaDoKursanta } from '../../../lib/maile.js';
import { dataPL, dodajDni } from '../../../lib/czas.js';
import { wyslijPrzypomnienia } from '../../../lib/przypomnienia.js';
import { json, blad, wymagajBazy } from '../../../lib/http.js';

const ZAJMUJACE = ['wstepna', 'potwierdzona', 'oczekuje', 'oplacone'];

export async function onRequestGet({ request, env }) {
  try {
    const db = wymagajBazy(env);
    await usunStareDane(db);

    const wszystkie = new URL(request.url).searchParams.get('wszystkie') === '1';
    const od = wszystkie ? '0000-00-00' : dodajDni(dataPL(), -14);
    const { results } = await db
      .prepare(
        `SELECT id, data, start_min, koniec_min, miejsce, doplata_h, imie, telefon, email, kod_rezerwacji,
                kwota_zadatku, status, jezyk, zrodlo, utworzono_o, potwierdzono_o,
                zadatek_zgloszony_o, zadatek_otrzymany_o, przypomnienie_o, sms_przypomnienie_o, sms_proby, sms_blad, notatka
         FROM rezerwacje WHERE data >= ?
         ORDER BY data, start_min`
      )
      .bind(od)
      .all();
    const miejsca = MIEJSCA.map((m) => ({ id: m.id, nazwa: m.nazwa, wawer: m.wawer }));
    return json({ dzisiaj: dataPL(), rezerwacje: results, miejsca });
  } catch (err) {
    console.error('Błąd GET /api/admin/rezerwacje:', err);
    return blad('Nie udało się wczytać rezerwacji.', 500);
  }
}

async function pobierz(db, id) {
  if (!Number.isInteger(id)) throw new BladRezerwacji('WALIDACJA', 'Brak identyfikatora rezerwacji.');
  const r = await db.prepare('SELECT * FROM rezerwacje WHERE id = ?').bind(id).first();
  if (!r) throw new BladRezerwacji('BRAK', 'Nie ma takiej rezerwacji.', 404);
  return r;
}

export async function onRequestPost({ request, env, waitUntil }) {
  let dane;
  try {
    dane = await request.json();
  } catch {
    return blad('Nieprawidłowe dane.', 400);
  }

  const db = wymagajBazy(env);
  const origin = new URL(request.url).origin;
  let emailWyslany = null;
  // Rezerwacja, której przypomnienie może być już należne (np. potwierdzona
  // później niż 26 h przed jazdą) — wysyłamy je w tle, nie czekając na automat.
  let sprawdzPrzypomnienie = null;

  try {
    switch (dane && dane.akcja) {
      case 'potwierdz': {
        const r = await pobierz(db, dane.id);
        if (r.status !== 'wstepna') throw new BladRezerwacji('STATUS', 'Tę rezerwację już rozpatrzono.', 409);
        const teraz = new Date().toISOString();
        await db
          .prepare("UPDATE rezerwacje SET status = 'potwierdzona', potwierdzono_o = ? WHERE id = ?")
          .bind(teraz, r.id)
          .run();
        if (dane.powiadom && r.email) {
          emailWyslany = await wyslijEmail(env, mailPotwierdzonaDoKursanta(r, origin, env));
        }
        sprawdzPrzypomnienie = r.id;
        break;
      }
      case 'odrzuc': {
        const r = await pobierz(db, dane.id);
        if (r.status !== 'wstepna') throw new BladRezerwacji('STATUS', 'Tę rezerwację już rozpatrzono.', 409);
        await zwolnijTermin(db, r.id, 'odrzucona');
        if (dane.powiadom && r.email) {
          emailWyslany = await wyslijEmail(env, mailOdrzuconaDoKursanta(r, origin, env));
        }
        break;
      }
      case 'anuluj': {
        const r = await pobierz(db, dane.id);
        if (!ZAJMUJACE.includes(r.status)) throw new BladRezerwacji('STATUS', 'Ta rezerwacja nie jest aktywna.', 409);
        await zwolnijTermin(db, r.id, 'anulowane');
        break;
      }
      case 'zadatek': {
        const r = await pobierz(db, dane.id);
        await db
          .prepare('UPDATE rezerwacje SET zadatek_otrzymany_o = ? WHERE id = ?')
          .bind(dane.otrzymany ? new Date().toISOString() : null, r.id)
          .run();
        break;
      }
      case 'notatka': {
        const r = await pobierz(db, dane.id);
        const notatka = typeof dane.notatka === 'string' ? dane.notatka.trim().slice(0, 500) : '';
        await db.prepare('UPDATE rezerwacje SET notatka = ? WHERE id = ?').bind(notatka || null, r.id).run();
        break;
      }
      case 'usun': {
        // Trwałe usunięcie — np. na prośbę kursanta o usunięcie danych (RODO).
        const r = await pobierz(db, dane.id);
        await db.prepare('DELETE FROM rezerwacje WHERE id = ?').bind(r.id).run();
        break;
      }
      case 'edytuj': {
        const r = await pobierz(db, dane.id);
        const zmiany = {};
        for (const k of ['data', 'start', 'dlugosc', 'koniec', 'miejsce', 'doplata_h']) {
          if (dane[k] !== undefined) zmiany[k] = dane[k];
        }
        await edytujZPanelu(db, r.id, zmiany);
        // Jedno przypomnienie na jazdę (decyzja właściciela) — po zmianie
        // godziny nie wysyłamy nowego. Jeśli jeszcze żadne nie wyszło, a jazda
        // przesunęła się bliżej niż 26 h, wyjdzie teraz.
        sprawdzPrzypomnienie = r.id;
        break;
      }
      case 'dodaj': {
        const r = await utworzZPanelu(db, dane);
        if (dane.powiadom && r.email) {
          emailWyslany = await wyslijEmail(env, mailPotwierdzonaDoKursanta(r, origin, env));
        }
        sprawdzPrzypomnienie = r.id;
        break;
      }
      default:
        return blad('Nieznana akcja.', 400);
    }
    if (sprawdzPrzypomnienie != null) {
      const zadanie = wyslijPrzypomnienia(db, env, origin, { id: sprawdzPrzypomnienie }).catch((err) =>
        console.error('Przypomnienie po zmianie w panelu:', err)
      );
      if (waitUntil) waitUntil(zadanie);
    }
    return json({ ok: true, email_wyslany: emailWyslany });
  } catch (err) {
    if (err instanceof BladRezerwacji) return blad(err.message, err.status, err.kod);
    console.error('Błąd POST /api/admin/rezerwacje:', err);
    return blad('Nie udało się zapisać zmiany.', 500);
  }
}
