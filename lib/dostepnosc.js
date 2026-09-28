/**
 * Liczenie wolnych terminów.
 *
 * Wolne = (szablon tygodniowy + dodatkowe godziny) − blokady − aktywne rezerwacje,
 * ograniczone do przyszłości i do horyzontu (maks. 3 tygodnie).
 */

import { dataPL, dzienTygodnia, zakresDat, nazwaDnia } from './czas.js';
import { wczytajUstawienia, horyzontTygodni, platnosciOnline, kwotaZadatku } from './ustawienia.js';

/** Dopuszczalne długości jazdy (godziny) — zgodnie z cennikiem. */
export const DLUGOSCI = [2, 3, 4];

/** Stawka za godzinę w złotych — używana do policzenia reszty płatnej gotówką. */
export const STAWKA_GODZINOWA = 160;

/** Ile minut trzyma się blokada terminu w trakcie płatności (tryb Autopay). */
export const MINUT_BLOKADY = 15;

/**
 * Statusy, przy których rezerwacja zajmuje termin. 'oczekuje' i 'oplacone'
 * pochodzą z zaparkowanego trybu Autopay — zostają, bo w bazie mogą być
 * takie wiersze (np. dane testowe).
 */
export const ZYWE_STATUSY = ['wstepna', 'potwierdzona', 'oczekuje', 'oplacone'];
const ZYWE_SQL = ZYWE_STATUSY.map((s) => `'${s}'`).join(', ');

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
 * Otwarte godziny jednego dnia — sam grafik, BEZ uwzględniania rezerwacji.
 *
 *   aktywny = false  → "tu nie pracuję" (dzień poza szablonem albo cały
 *                      dzień zablokowany). Grafik wyszarza taki dzień.
 *   aktywny = true   → dzień pracujący; `otwarte` to zbiór godzin z szablonu
 *                      i dodatkowych godzin, minus zablokowane godziny.
 *
 * Wspólne dla grafiku publicznego, sprawdzania formularza i panelu admina,
 * żeby wszystkie trzy zawsze liczyły tak samo.
 */
export function otwarteGodziny(wpisySzablonu, wyjatkiDnia) {
  const zablokowanyDzien = wyjatkiDnia.some((w) => w.typ === 'blokada_dnia');
  const dodatkowe = wyjatkiDnia.filter((w) => w.typ === 'dodatkowa_godzina');
  const aktywny = !zablokowanyDzien && (wpisySzablonu.length > 0 || dodatkowe.length > 0);
  const otwarte = new Set();
  if (!aktywny) return { aktywny, zablokowanyDzien, otwarte };

  for (const w of wpisySzablonu) {
    for (const g of godzinyZZakresu(w.godzina_start, w.godzina_koniec)) otwarte.add(g);
  }
  for (const w of dodatkowe) {
    for (const g of godzinyZZakresu(w.godzina_start, w.godzina_koniec)) otwarte.add(g);
  }
  // Blokady godzinowe mają pierwszeństwo nad szablonem i dodatkowymi godzinami
  for (const w of wyjatkiDnia) {
    if (w.typ !== 'blokada_godziny') continue;
    for (const g of godzinyZZakresu(w.godzina_start, w.godzina_koniec)) otwarte.delete(g);
  }
  return { aktywny, zablokowanyDzien, otwarte };
}

/** Wczytuje szablon i wyjątki jednego dnia i zwraca wynik otwarteGodziny(). */
export async function otwarteGodzinyDnia(db, data) {
  const [szablon, wyjatki] = await Promise.all([
    db
      .prepare('SELECT godzina_start, godzina_koniec FROM szablon_tygodniowy WHERE dzien_tygodnia = ?')
      .bind(dzienTygodnia(data))
      .all(),
    db
      .prepare('SELECT typ, godzina_start, godzina_koniec FROM wyjatki WHERE data = ?')
      .bind(data)
      .all(),
  ]);
  return otwarteGodziny(szablon.results, wyjatki.results);
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
  const daty = zakresDat(dzisiaj, dniDoPrzodu);
  const ostatniaData = daty[daty.length - 1];

  // Jedno zapytanie na tabelę, zamiast po jednym na każdy dzień
  const [szablon, wyjatki, zajete, wstepne] = await Promise.all([
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
           AND r.status IN (${ZYWE_SQL})`
      )
      .bind(dzisiaj, ostatniaData)
      .all(),
    // Wstępne rezerwacje pokazujemy w grafiku osobno ("czeka na potwierdzenie").
    // Tylko godziny — bez żadnych danych osobowych.
    db
      .prepare(
        `SELECT data, godzina_start, godzina_koniec FROM rezerwacje
         WHERE status = 'wstepna' AND data BETWEEN ? AND ?
         ORDER BY godzina_start`
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

  const wstepneWgDaty = new Map();
  for (const w of wstepne.results) {
    if (!wstepneWgDaty.has(w.data)) wstepneWgDaty.set(w.data, []);
    wstepneWgDaty.get(w.data).push({ godzina_start: w.godzina_start, godzina_koniec: w.godzina_koniec });
  }

  const dni = [];

  for (const data of daty) {
    const dt = dzienTygodnia(data);
    const wyjatkiDnia = wyjatkiWgDaty.get(data) || [];
    const wpisySzablonu = szablonWgDnia.get(dt) || [];
    const weekend = dt === 0 || dt === 6;
    const { aktywny, otwarte } = otwarteGodziny(wpisySzablonu, wyjatkiDnia);
    const wstepneDnia = wstepneWgDaty.get(data) || [];

    if (!aktywny) {
      dni.push({ data, nazwa_dnia: nazwaDnia(data), weekend, aktywny: false, sloty: [], wstepne: [] });
      continue;
    }

    const wolne = new Set(otwarte);
    for (const g of zajeteWgDaty.get(data) || []) wolne.delete(g);

    // Dzisiaj nigdy nie pokazujemy wolnych godzin — kursant potrzebuje
    // czasu na dojazd i przygotowanie, a instruktor na zaplanowanie dnia.
    // Najwcześniejszy termin do rezerwacji to zawsze jutro.
    if (data === dzisiaj) {
      wolne.clear();
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

    dni.push({ data, nazwa_dnia: nazwaDnia(data), weekend, aktywny: true, sloty, wstepne: wstepneDnia });
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
