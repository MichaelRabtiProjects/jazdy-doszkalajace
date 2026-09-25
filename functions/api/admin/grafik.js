/**
 * /api/admin/grafik (chronione przez _middleware.js)
 *
 * GET — 6 tygodni od dziś: dla każdego dnia stan każdej godziny
 *       (otwarta / zamknięta / zajęta przez rezerwację), stały szablon
 *       tygodnia i ustawienia.
 *
 * POST { akcja, ... }:
 *   godzina    { data, godzina, otwarta }  otwiera / zamyka jedną godzinę
 *   dzien      { data, zamkniety }         zamyka / otwiera cały dzień
 *   szablon    { dni: [{ dzien_tygodnia, godzina_start, godzina_koniec }] }
 *   ustawienia { kwota_zadatku, horyzont_tygodni }
 *
 * Panel myśli w kategoriach "ta godzina ma być otwarta albo zamknięta",
 * a baza przechowuje szablon + wyjątki. Tłumaczenie jednego na drugie
 * dzieje się tutaj, na serwerze, żeby panel nie musiał znać tych szczegółów.
 */

import { otwarteGodziny, ZYWE_STATUSY } from '../../../lib/dostepnosc.js';
import { dataPL, dzienTygodnia, zakresDat, nazwaDnia } from '../../../lib/czas.js';
import { wczytajUstawienia, zapiszUstawienie, kwotaZadatku, horyzontTygodni } from '../../../lib/ustawienia.js';
import { json, blad, wymagajBazy } from '../../../lib/http.js';

const DNI_W_PANELU = 42;
/** Zakres godzin rozpoczęcia pokazywany w panelu (6:00 – 21:00). */
const PIERWSZA_GODZINA = 6;
const OSTATNIA_GODZINA = 21;

export async function onRequestGet({ env }) {
  try {
    const db = wymagajBazy(env);
    const dzisiaj = dataPL();
    const daty = zakresDat(dzisiaj, DNI_W_PANELU);
    const koniec = daty[daty.length - 1];
    const zywe = ZYWE_STATUSY.map(() => '?').join(', ');

    const [szablon, wyjatki, rezerwacje, ustawienia] = await Promise.all([
      db.prepare('SELECT dzien_tygodnia, godzina_start, godzina_koniec FROM szablon_tygodniowy ORDER BY dzien_tygodnia, godzina_start').all(),
      db.prepare('SELECT data, typ, godzina_start, godzina_koniec FROM wyjatki WHERE data BETWEEN ? AND ?').bind(dzisiaj, koniec).all(),
      db
        .prepare(
          `SELECT id, data, godzina_start, godzina_koniec, imie, status FROM rezerwacje
           WHERE data BETWEEN ? AND ? AND status IN (${zywe})`
        )
        .bind(dzisiaj, koniec, ...ZYWE_STATUSY)
        .all(),
      wczytajUstawienia(db),
    ]);

    const dni = daty.map((data) => {
      const dt = dzienTygodnia(data);
      const wpisy = szablon.results.filter((w) => w.dzien_tygodnia === dt);
      const wyj = wyjatki.results.filter((w) => w.data === data);
      const { aktywny, zablokowanyDzien, otwarte } = otwarteGodziny(wpisy, wyj);
      const rezDnia = rezerwacje.results.filter((r) => r.data === data);

      const godziny = [];
      for (let g = PIERWSZA_GODZINA; g <= OSTATNIA_GODZINA; g++) {
        const rez = rezDnia.find((r) => g >= r.godzina_start && g < r.godzina_koniec);
        godziny.push({
          godzina: g,
          otwarta: otwarte.has(g),
          rezerwacja: rez ? { id: rez.id, imie: rez.imie, status: rez.status, poczatek: rez.godzina_start === g } : null,
        });
      }
      return { data, nazwa_dnia: nazwaDnia(data), aktywny, zablokowany: zablokowanyDzien, godziny };
    });

    return json({
      dzisiaj,
      dni,
      szablon: szablon.results,
      ustawienia: {
        kwota_zadatku: kwotaZadatku(ustawienia),
        horyzont_tygodni: horyzontTygodni(ustawienia),
      },
    });
  } catch (err) {
    console.error('Błąd GET /api/admin/grafik:', err);
    return blad('Nie udało się wczytać grafiku.', 500);
  }
}

function poprawnaData(data) {
  return typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data);
}

/**
 * Ustawia jedną godzinę jako otwartą albo zamkniętą.
 *
 * 1. Usuwa wszystkie wyjątki godzinowe obejmujące tę godzinę. Jeśli wyjątek
 *    był dłuższy (np. blokada 14–18), zostaje rozcięty: 14–15 i 16–18
 *    wracają, znika tylko ta jedna godzina.
 * 2. Porównuje z samym szablonem: jeśli szablon daje już żądany stan,
 *    nic więcej nie trzeba. Jeśli nie — dopisuje jednogodzinny wyjątek.
 */
async function ustawGodzine(db, data, godzina, otwarta) {
  const [szablon, wyjatki] = await Promise.all([
    db.prepare('SELECT godzina_start, godzina_koniec FROM szablon_tygodniowy WHERE dzien_tygodnia = ?').bind(dzienTygodnia(data)).all(),
    db.prepare('SELECT id, typ, godzina_start, godzina_koniec FROM wyjatki WHERE data = ?').bind(data).all(),
  ]);

  if (wyjatki.results.some((w) => w.typ === 'blokada_dnia')) {
    return 'Ten dzień jest zamknięty — najpierw otwórz cały dzień.';
  }

  const zapytania = [];
  for (const w of wyjatki.results) {
    if (w.typ === 'blokada_dnia') continue;
    if (godzina < w.godzina_start || godzina >= w.godzina_koniec) continue;
    zapytania.push(db.prepare('DELETE FROM wyjatki WHERE id = ?').bind(w.id));
    const kawalki = [
      [w.godzina_start, godzina],
      [godzina + 1, w.godzina_koniec],
    ];
    for (const [s, k] of kawalki) {
      if (k > s) {
        zapytania.push(
          db.prepare('INSERT INTO wyjatki (data, typ, godzina_start, godzina_koniec) VALUES (?, ?, ?, ?)').bind(data, w.typ, s, k)
        );
      }
    }
  }

  const wSzablonie = szablon.results.some((w) => godzina >= w.godzina_start && godzina < w.godzina_koniec);
  if (otwarta && !wSzablonie) {
    zapytania.push(
      db.prepare("INSERT INTO wyjatki (data, typ, godzina_start, godzina_koniec) VALUES (?, 'dodatkowa_godzina', ?, ?)").bind(data, godzina, godzina + 1)
    );
  } else if (!otwarta && wSzablonie) {
    zapytania.push(
      db.prepare("INSERT INTO wyjatki (data, typ, godzina_start, godzina_koniec) VALUES (?, 'blokada_godziny', ?, ?)").bind(data, godzina, godzina + 1)
    );
  }

  if (zapytania.length) await db.batch(zapytania);
  return null;
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
    const dzisiaj = dataPL();

    switch (dane && dane.akcja) {
      case 'godzina': {
        const { data, godzina, otwarta } = dane;
        if (!poprawnaData(data) || data < dzisiaj) return blad('Nieprawidłowa data.', 400);
        if (!Number.isInteger(godzina) || godzina < 0 || godzina > 23) return blad('Nieprawidłowa godzina.', 400);
        const problem = await ustawGodzine(db, data, godzina, Boolean(otwarta));
        if (problem) return blad(problem, 409);
        break;
      }
      case 'dzien': {
        const { data, zamkniety } = dane;
        if (!poprawnaData(data) || data < dzisiaj) return blad('Nieprawidłowa data.', 400);
        const zapytania = [db.prepare("DELETE FROM wyjatki WHERE data = ? AND typ = 'blokada_dnia'").bind(data)];
        if (zamkniety) {
          zapytania.push(db.prepare("INSERT INTO wyjatki (data, typ) VALUES (?, 'blokada_dnia')").bind(data));
        }
        await db.batch(zapytania);
        break;
      }
      case 'szablon': {
        const dni = Array.isArray(dane.dni) ? dane.dni : null;
        if (!dni) return blad('Brak szablonu.', 400);
        for (const d of dni) {
          const ok =
            Number.isInteger(d.dzien_tygodnia) && d.dzien_tygodnia >= 0 && d.dzien_tygodnia <= 6 &&
            Number.isInteger(d.godzina_start) && Number.isInteger(d.godzina_koniec) &&
            d.godzina_start >= 0 && d.godzina_koniec <= 24 && d.godzina_koniec > d.godzina_start;
          if (!ok) return blad('Nieprawidłowe godziny w szablonie.', 400);
        }
        // Batch = jedna transakcja: nie zostaniemy z pustym szablonem, jeśli coś pójdzie nie tak.
        await db.batch([
          db.prepare('DELETE FROM szablon_tygodniowy'),
          ...dni.map((d) =>
            db
              .prepare('INSERT INTO szablon_tygodniowy (dzien_tygodnia, godzina_start, godzina_koniec) VALUES (?, ?, ?)')
              .bind(d.dzien_tygodnia, d.godzina_start, d.godzina_koniec)
          ),
        ]);
        break;
      }
      case 'ustawienia': {
        const kwota = Number(dane.kwota_zadatku);
        const tygodnie = Number(dane.horyzont_tygodni);
        if (!Number.isInteger(kwota) || kwota < 1 || kwota > 1000) return blad('Zadatek: podaj kwotę 1–1000 zł.', 400);
        if (!Number.isInteger(tygodnie) || tygodnie < 1 || tygodnie > 3) return blad('Grafik: od 1 do 3 tygodni naprzód.', 400);
        await zapiszUstawienie(db, 'kwota_zadatku', kwota);
        await zapiszUstawienie(db, 'horyzont_tygodni', tygodnie);
        break;
      }
      default:
        return blad('Nieznana akcja.', 400);
    }
    return json({ ok: true });
  } catch (err) {
    console.error('Błąd POST /api/admin/grafik:', err);
    return blad('Nie udało się zapisać zmiany.', 500);
  }
}
