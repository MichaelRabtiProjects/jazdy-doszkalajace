/**
 * /api/admin/kalendarz  (chronione przez _middleware.js)
 *
 * Dane dla kalendarza w panelu (widok dnia / tygodnia / miesiąca jak
 * w Calendesku).
 *
 * GET ?od=YYYY-MM-DD&do=YYYY-MM-DD  (najwyżej 62 dni)
 *   → żywe rezerwacje (z flagą "pierwsza rezerwacja" tej osoby), blokady,
 *     godziny pracy i zamknięte dni w tym zakresie.
 *
 * POST { akcja, ... }:
 *   blokada        { data, start, koniec, opis }   nowa blokada (minuty od północy)
 *   blokada-zmien  { id, data?, start?, koniec?, opis? }  przesunięcie / zmiana
 *   blokada-usun   { id }
 *
 * Przenoszenie jazd (przeciąganie) idzie przez /api/admin/rezerwacje
 * (akcja "edytuj" z polem data), a zamykanie całego dnia przez
 * /api/admin/grafik (akcja "dzien").
 */

import { otwarteGodziny, przedzialyMinut, blokadyWZakresie, ZYWE_SQL } from '../../../lib/dostepnosc.js';
import { utworzBlokade, zmienBlokade, usunBlokade } from '../../../lib/blokady.js';
import { pierwszeRezerwacje, wszystkieDoPierwszych } from '../../../lib/kursanci.js';
import { BladRezerwacji } from '../../../lib/rezerwacje.js';
import { MIEJSCA } from '../../../lib/miejsca.js';
import { dataPL, minutyPL, dzienTygodnia, zakresDat } from '../../../lib/czas.js';
import { json, blad, wymagajBazy } from '../../../lib/http.js';

const MAKS_DNI = 62;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const od = url.searchParams.get('od');
  const do_ = url.searchParams.get('do');
  if (!DATA_RE.test(od || '') || !DATA_RE.test(do_ || '') || do_ < od) return blad('Nieprawidłowy zakres dat.', 400);
  const ileDni = Math.round((Date.parse(do_) - Date.parse(od)) / 86400000) + 1;
  if (ileDni > MAKS_DNI) return blad('Za długi zakres dat.', 400);

  try {
    const db = wymagajBazy(env);
    const [rezerwacje, blokady, szablon, wyjatki, wszystkie] = await Promise.all([
      db
        .prepare(
          `SELECT id, data, start_min, koniec_min, miejsce, doplata_h, imie, telefon, email, kod_rezerwacji,
                  kwota_zadatku, status, jezyk, zrodlo, utworzono_o, potwierdzono_o, zadatek_zgloszony_o,
                  zadatek_otrzymany_o, przypomnienie_o, sms_przypomnienie_o, sms_proby, sms_blad, notatka
           FROM rezerwacje WHERE data BETWEEN ? AND ? AND status IN (${ZYWE_SQL})
           ORDER BY data, start_min`
        )
        .bind(od, do_)
        .all(),
      blokadyWZakresie(db, od, do_),
      db.prepare('SELECT dzien_tygodnia, godzina_start, godzina_koniec FROM szablon_tygodniowy').all(),
      db.prepare('SELECT data, typ, godzina_start, godzina_koniec FROM wyjatki WHERE data BETWEEN ? AND ?').bind(od, do_).all(),
      wszystkieDoPierwszych(db),
    ]);

    const pierwsze = pierwszeRezerwacje(wszystkie);
    const dni = zakresDat(od, ileDni).map((data) => {
      const dt = dzienTygodnia(data);
      const { aktywny, zablokowanyDzien, otwarte } = otwarteGodziny(
        szablon.results.filter((w) => w.dzien_tygodnia === dt),
        wyjatki.results.filter((w) => w.data === data)
      );
      // Godziny pracy w minutach — kalendarz przyciemnia czas poza nimi.
      return { data, zamkniety: zablokowanyDzien, praca: aktywny ? przedzialyMinut(otwarte) : [] };
    });

    return json({
      dzisiaj: dataPL(),
      teraz: minutyPL(),
      od,
      do: do_,
      rezerwacje: rezerwacje.results.map((r) => ({ ...r, pierwsza: pierwsze.has(r.id) })),
      blokady,
      dni,
      miejsca: MIEJSCA.map((m) => ({ id: m.id, nazwa: m.nazwa, wawer: m.wawer })),
    });
  } catch (err) {
    console.error('Błąd GET /api/admin/kalendarz:', err);
    return blad('Nie udało się wczytać kalendarza.', 500);
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
    switch (dane && dane.akcja) {
      case 'blokada':
        return json({ ok: true, blokada: await utworzBlokade(db, dane) });
      case 'blokada-zmien':
        return json({ ok: true, blokada: await zmienBlokade(db, dane.id, dane) });
      case 'blokada-usun':
        await usunBlokade(db, dane.id);
        return json({ ok: true });
      default:
        return blad('Nieznana akcja.', 400);
    }
  } catch (err) {
    if (err instanceof BladRezerwacji) return blad(err.message, err.status, err.kod);
    console.error('Błąd POST /api/admin/kalendarz:', err);
    return blad('Nie udało się zapisać zmiany.', 500);
  }
}
