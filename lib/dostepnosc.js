/**
 * Liczenie wolnych terminów.
 *
 * Wolne = (szablon tygodniowy + dodatkowe godziny) − blokady − aktywne rezerwacje,
 * ograniczone do przyszłości i do horyzontu (maks. 3 tygodnie).
 */

import { dataPL, godzinaPL, dzienTygodnia, zakresDat, nazwaDnia } from './czas.js';
import { wczytajUstawienia, horyzontTygodni, platnosciOnline, kwotaZadatku } from './ustawienia.js';

/** Dopuszczalne długości jazdy (godziny) — zgodnie z cennikiem. */
export const DLUGOSCI = [2, 3, 4];

/** Stawka za godzinę w złotych — używana do policzenia reszty płatnej gotówką. */
export const STAWKA_GODZINOWA = 160;

/** Ile minut trzyma się blokada terminu w trakcie płatności. */
export const MINUT_BLOKADY = 15;

/**
 * Wygasza rezerwacje 'oczekuje' starsze niż 15 minut i zwalnia zajmowane przez
 * nie godziny. Wołane przy każdym odczycie dostępności — Pages Functions nie
 * mają cronów, więc sprzątanie musi dziać się "przy okazji".
 *
 * Zwraca liczbę wygaszonych rezerwacji (przydatne w logach i testach).
 */
export async function wygasStareBlokady(db) {
  const warunek = `status = 'oczekuje' AND datetime(utworzono_o) <= datetime('now', '-${MINUT_BLOKADY} minutes')`;

  const { results } = await db.prepare(`SELECT id FROM rezerwacje WHERE ${warunek}`).all();
  if (results.length === 0) return 0;

  // Batch = jedna transakcja: albo obie operacje, albo żadna.
  await db.batch([
    db.prepare(
      `DELETE FROM rezerwacje_godziny
       WHERE rezerwacja_id IN (SELECT id FROM rezerwacje WHERE ${warunek})`
    ),
    db.prepare(`UPDATE rezerwacje SET status = 'wygasle' WHERE ${warunek}`),
  ]);

  return results.length;
}

/** Zamienia zakres [start, koniec) na listę pojedynczych godzin. */
function godzinyZZakresu(start, koniec) {
  const lista = [];
  for (let g = start; g < koniec; g++) lista.push(g);
  return lista;
}

/**
 * Główna funkcja: zwraca dostępność dla całego horyzontu.
 * `db` to binding D1.
 */
export async function policzDostepnosc(db) {
  await wygasStareBlokady(db);

  const ustawienia = await wczytajUstawienia(db);
  const tygodnie = horyzontTygodni(ustawienia);
  const dniDoPrzodu = tygodnie * 7;

  const dzisiaj = dataPL();
  const terazGodzina = godzinaPL();
  const daty = zakresDat(dzisiaj, dniDoPrzodu);
  const ostatniaData = daty[daty.length - 1];

  // Jedno zapytanie na tabelę, zamiast po jednym na każdy dzień
  const [szablon, wyjatki, zajete] = await Promise.all([
    db.prepare('SELECT dzien_tygodnia, godzina_start, godzina_koniec FROM szablon_tygodniowy').all(),
    db
      .prepare(
        'SELECT data, typ, godzina_start, godzina_koniec FROM wyjatki WHERE data BETWEEN ? AND ?'
      )
      .bind(dzisiaj, ostatniaData)
      .all(),
    db
      .prepare(
        `SELECT rg.data, rg.godzina
         FROM rezerwacje_godziny rg
         JOIN rezerwacje r ON r.id = rg.rezerwacja_id
         WHERE rg.data BETWEEN ? AND ?
           AND r.status IN ('oplacone', 'oczekuje')`
      )
      .bind(dzisiaj, ostatniaData)
      .all(),
  ]);

  // Grupowanie po dacie / dniu tygodnia, żeby nie przeszukiwać list w pętli
  const szablonWgDnia = new Map();
  for (const w of szablon.results) {
    if (!szablonWgDnia.has(w.dzien_tygodnia)) szablonWgDnia.set(w.dzien_tygodnia, []);
    szablonWgDnia.get(w.dzien_tygodnia).push(w);
  }

  const wyjatkiWgDaty = new Map();
  for (const w of wyjatki.results) {
    if (!wyjatkiWgDaty.has(w.data)) wyjatkiWgDaty.set(w.data, []);
    wyjatkiWgDaty.get(w.data).push(w);
  }

  const zajeteWgDaty = new Map();
  for (const z of zajete.results) {
    if (!zajeteWgDaty.has(z.data)) zajeteWgDaty.set(z.data, new Set());
    zajeteWgDaty.get(z.data).add(z.godzina);
  }

  const dni = [];

  for (const data of daty) {
    const dt = dzienTygodnia(data);
    const wyjatkiDnia = wyjatkiWgDaty.get(data) || [];
    const wpisySzablonu = szablonWgDnia.get(dt) || [];
    const dodatkowe = wyjatkiDnia.filter((w) => w.typ === 'dodatkowa_godzina');
    const weekend = dt === 0 || dt === 6;

    /*
     * Rozróżniamy dwa różne "nic tu nie ma", bo z punktu widzenia klienta
     * znaczą co innego:
     *
     *   aktywny = false  → "tu nie pracuję" (dzień poza szablonem albo cały
     *                      dzień zablokowany z panelu). Grafik wyszarza taki
     *                      dzień, żeby było widać wzorzec tygodnia.
     *   aktywny = true, sloty = []  → "pracuję, ale już zajęte".
     *
     * Pojedyncze zablokowane godziny nadal pozostają niewidoczne — wypadają
     * ze zbioru `wolne` i nigdzie się nie pojawiają.
     */
    const zablokowanyDzien = wyjatkiDnia.some((w) => w.typ === 'blokada_dnia');
    const aktywny = !zablokowanyDzien && (wpisySzablonu.length > 0 || dodatkowe.length > 0);

    if (!aktywny) {
      dni.push({ data, nazwa_dnia: nazwaDnia(data), weekend, aktywny: false, sloty: [] });
      continue;
    }

    const wolne = new Set();

    for (const w of wpisySzablonu) {
      for (const g of godzinyZZakresu(w.godzina_start, w.godzina_koniec)) wolne.add(g);
    }

    for (const w of dodatkowe) {
      for (const g of godzinyZZakresu(w.godzina_start, w.godzina_koniec)) wolne.add(g);
    }

    // Blokady godzinowe mają pierwszeństwo nad szablonem i dodatkowymi godzinami
    for (const w of wyjatkiDnia) {
      if (w.typ !== 'blokada_godziny') continue;
      for (const g of godzinyZZakresu(w.godzina_start, w.godzina_koniec)) wolne.delete(g);
    }

    for (const g of zajeteWgDaty.get(data) || []) wolne.delete(g);

    // Przeszłość: dzisiaj pokazujemy tylko godziny jeszcze przed nami
    if (data === dzisiaj) {
      for (const g of [...wolne]) {
        if (g <= terazGodzina) wolne.delete(g);
      }
    }

    // Start ma sens tylko wtedy, gdy CAŁY ciąg godzin danej długości jest wolny
    const sloty = [];
    for (const godzina of [...wolne].sort((a, b) => a - b)) {
      const dlugosci = DLUGOSCI.filter((dl) => {
        if (godzina + dl > 24) return false;
        for (let i = 0; i < dl; i++) {
          if (!wolne.has(godzina + i)) return false;
        }
        return true;
      });

      if (dlugosci.length > 0) sloty.push({ godzina, dlugosci });
    }

    dni.push({ data, nazwa_dnia: nazwaDnia(data), weekend, aktywny: true, sloty });
  }

  return {
    platnosci_online: platnosciOnline(ustawienia),
    kwota_zadatku: kwotaZadatku(ustawienia),
    stawka_godzinowa: STAWKA_GODZINOWA,
    horyzont_tygodni: tygodnie,
    minut_blokady: MINUT_BLOKADY,
    dni,
  };
}
