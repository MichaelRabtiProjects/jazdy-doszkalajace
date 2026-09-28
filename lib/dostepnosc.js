/**
 * Liczenie wolnych terminów.
 *
 * Wolne = (szablon tygodniowy + dodatkowe godziny) − blokady − aktywne rezerwacje,
 * ograniczone do przyszłości i do horyzontu (maks. 3 tygodnie).
 *
 * Od migracji 0008 terminy liczone są co do minuty i zależą od miejsca
 * spotkania: między jazdami w różnych miejscach potrzebny jest czas na
 * dojazd (tabela `dojazdy`, dłużej w szczycie 15-18), a jazda poza Wawrem
 * kosztuje +15 zł/h, chyba że tego dnia i tak jestem w pobliżu
 * (szczegóły zasady: lib/miejsca.js → doplataZaGodzine).
 */

import { dataPL, dzienTygodnia, zakresDat, nazwaDnia } from './czas.js';
import { wczytajUstawienia, horyzontTygodni, platnosciOnline, kwotaZadatku } from './ustawienia.js';
import { MIEJSCA, miejsce, najblizsze, doplataZaGodzine, wczytajDojazdy, DOPLATA_ZA_GODZINE } from './miejsca.js';

/** Dopuszczalne długości jazdy (godziny) — zgodnie z cennikiem. */
export const DLUGOSCI = [2, 3, 4];

/** Stawka za godzinę w złotych (bez dopłaty za dojazd). */
export const STAWKA_GODZINOWA = 160;

/** Ile minut trzyma się blokada terminu w trakcie płatności (tryb Autopay). */
export const MINUT_BLOKADY = 15;

/** Co ile minut proponujemy godziny startu (poza startem tuż po dojeździe). */
const SIATKA_MIN = 30;

/**
 * Statusy, przy których rezerwacja zajmuje termin. 'oczekuje' i 'oplacone'
 * pochodzą z zaparkowanego trybu Autopay — zostają, bo w bazie mogą być
 * takie wiersze (np. dane testowe).
 */
export const ZYWE_STATUSY = ['wstepna', 'potwierdzona', 'oczekuje', 'oplacone'];
export const ZYWE_SQL = ZYWE_STATUSY.map((s) => `'${s}'`).join(', ');

/**
 * Wygasza rezerwacje 'oczekuje' (tryb Autopay) starsze niż 15 minut.
 * Wołane przy każdym odczycie dostępności — Pages Functions nie mają
 * cronów, więc sprzątanie dzieje się "przy okazji".
 */
export async function wygasStareBlokady(db) {
  const { meta } = await db
    .prepare(
      `UPDATE rezerwacje SET status = 'wygasle'
       WHERE status = 'oczekuje' AND datetime(utworzono_o) <= datetime('now', '-${MINUT_BLOKADY} minutes')`
    )
    .run();
  return meta ? meta.changes : 0;
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

/** Zbiór otwartych godzin → posortowane przedziały w minutach [od, do). */
export function przedzialyMinut(otwarte) {
  const godziny = [...otwarte].sort((a, b) => a - b);
  const wynik = [];
  for (const g of godziny) {
    const ost = wynik[wynik.length - 1];
    if (ost && ost[1] === g * 60) ost[1] = (g + 1) * 60;
    else wynik.push([g * 60, (g + 1) * 60]);
  }
  return wynik;
}

/**
 * Serce grafiku: możliwe godziny startu jazdy o danej długości w danym
 * miejscu, jednego dnia.
 *
 *   przedzialy  — otwarte godziny pracy w minutach (przedzialyMinut)
 *   rezerwacje  — żywe rezerwacje tego dnia: { start_min, koniec_min, miejsce }
 *   miejsceId   — wybrane miejsce spotkania (null = bez buforów i ceny)
 *   dojazd      — funkcja z wczytajDojazdy()
 *
 * Start s jest możliwy, gdy:
 *   - cała jazda [s, s + dlugosc) mieści się w jednym otwartym przedziale,
 *   - nie nachodzi na żadną inną jazdę,
 *   - po poprzedniej jeździe zdążę dojechać: s ≥ jej koniec + dojazd,
 *   - na następną jazdę też zdążę: jej start ≥ koniec tej + dojazd.
 *
 * Kandydaci: pełne i wpół do (co 30 min) oraz najwcześniejszy start tuż po
 * dojeździe z każdej jazdy (np. 13:25). Starty bliżej niż 30 min od
 * poprzedniego pokazanego odrzucamy, żeby nie zaśmiecać grafiku
 * (13:25 i 13:30 obok siebie nic kursantowi nie dają).
 *
 * Zwraca [{ start, doplata }] — doplata w zł/h (0 albo 15), null gdy
 * nie podano miejsca.
 */
export function terminyDnia({ przedzialy, rezerwacje, miejsceId, dojazd, dlugosc }) {
  const L = dlugosc * 60;
  const posortowane = [...rezerwacje].sort((a, b) => a.start_min - b.start_min);

  const kandydaci = new Set();
  for (const [od, do_] of przedzialy) {
    for (let s = od; s + L <= do_; s += SIATKA_MIN) kandydaci.add(s);
  }
  for (const r of posortowane) {
    const s = r.koniec_min + dojazd(r.miejsce, miejsceId, r.koniec_min);
    kandydaci.add(Math.ceil(s / 5) * 5);
  }

  const mozliwe = [];
  for (const s of [...kandydaci].sort((a, b) => a - b)) {
    const e = s + L;
    if (!przedzialy.some(([od, do_]) => s >= od && e <= do_)) continue;
    if (posortowane.some((r) => r.start_min < e && r.koniec_min > s)) continue;

    let poprzednia = null;
    let nastepna = null;
    for (const r of posortowane) {
      if (r.koniec_min <= s) poprzednia = r;
      else if (r.start_min >= e && !nastepna) nastepna = r;
    }
    if (poprzednia && s < poprzednia.koniec_min + dojazd(poprzednia.miejsce, miejsceId, poprzednia.koniec_min)) continue;
    if (nastepna && nastepna.start_min < e + dojazd(miejsceId, nastepna.miejsce, e)) continue;

    // Cena zależy od tego, skąd dojeżdżam: od poprzedniej jazdy tego dnia,
    // a jeśli to pierwsza jazda dnia — od następnej.
    const sasiad = (poprzednia || nastepna || {}).miejsce || null;
    mozliwe.push({ start: s, doplata: miejsceId ? doplataZaGodzine(miejsceId, sasiad) : null });
  }

  const wynik = [];
  for (const t of mozliwe) {
    const ost = wynik[wynik.length - 1];
    if (ost && t.start - ost.start < SIATKA_MIN) continue;
    wynik.push(t);
  }
  return wynik;
}

/** Żywe rezerwacje w zakresie dat — tylko to, czego potrzebuje grafik. */
export async function rezerwacjeWZakresie(db, od, do_) {
  const { results } = await db
    .prepare(
      `SELECT id, data, start_min, koniec_min, miejsce, status FROM rezerwacje
       WHERE data BETWEEN ? AND ? AND status IN (${ZYWE_SQL})
       ORDER BY data, start_min`
    )
    .bind(od, do_)
    .all();
  return results;
}

/** Lista miejsc dla przeglądarki (bez współrzędnych — nie są potrzebne). */
export function miejscaDlaStrony() {
  return MIEJSCA.map((m) => ({
    id: m.id,
    nazwa: m.nazwa,
    nazwa_en: m.nazwa_en,
    wawer: m.wawer,
    najblizsze: najblizsze(m.id),
  }));
}

/**
 * Główna funkcja: dostępność dla całego horyzontu, dla wybranego miejsca.
 * `miejsceId` może być null (wtedy terminy bez buforów na dojazd i bez ceny —
 * np. zanim kursant wybierze miejsce).
 */
export async function policzDostepnosc(db, miejsceId = null) {
  await wygasStareBlokady(db);
  if (miejsceId && !miejsce(miejsceId)) miejsceId = null;

  const ustawienia = await wczytajUstawienia(db);
  const tygodnie = horyzontTygodni(ustawienia);
  const dzisiaj = dataPL();
  const daty = zakresDat(dzisiaj, tygodnie * 7);
  const ostatniaData = daty[daty.length - 1];

  // Jedno zapytanie na tabelę, zamiast po jednym na każdy dzień
  const [szablon, wyjatki, rezerwacje, dojazd] = await Promise.all([
    db.prepare('SELECT dzien_tygodnia, godzina_start, godzina_koniec FROM szablon_tygodniowy').all(),
    db
      .prepare('SELECT data, typ, godzina_start, godzina_koniec FROM wyjatki WHERE data BETWEEN ? AND ?')
      .bind(dzisiaj, ostatniaData)
      .all(),
    rezerwacjeWZakresie(db, dzisiaj, ostatniaData),
    wczytajDojazdy(db),
  ]);

  const grupuj = (lista, klucz) => {
    const m = new Map();
    for (const w of lista) {
      if (!m.has(w[klucz])) m.set(w[klucz], []);
      m.get(w[klucz]).push(w);
    }
    return m;
  };
  const szablonWgDnia = grupuj(szablon.results, 'dzien_tygodnia');
  const wyjatkiWgDaty = grupuj(wyjatki.results, 'data');
  const rezerwacjeWgDaty = grupuj(rezerwacje, 'data');

  const dni = daty.map((data) => {
    const dt = dzienTygodnia(data);
    const weekend = dt === 0 || dt === 6;
    const { aktywny, otwarte } = otwarteGodziny(szablonWgDnia.get(dt) || [], wyjatkiWgDaty.get(data) || []);
    const rezDnia = rezerwacjeWgDaty.get(data) || [];
    const terminy = { 2: [], 3: [], 4: [] };

    // Dzisiaj nigdy nie pokazujemy wolnych godzin — najwcześniej jutro.
    if (aktywny && data !== dzisiaj) {
      const przedzialy = przedzialyMinut(otwarte);
      for (const dlugosc of DLUGOSCI) {
        terminy[dlugosc] = terminyDnia({ przedzialy, rezerwacje: rezDnia, miejsceId, dojazd, dlugosc });
      }
    }

    // Wstępne rezerwacje pokazujemy w grafiku ("czeka na potwierdzenie").
    // Tylko godziny — bez żadnych danych osobowych ani miejsca.
    const wstepne = aktywny
      ? rezDnia.filter((r) => r.status === 'wstepna').map((r) => ({ start: r.start_min, koniec: r.koniec_min }))
      : [];

    return { data, nazwa_dnia: nazwaDnia(data), weekend, aktywny, terminy, wstepne };
  });

  return {
    platnosci_online: platnosciOnline(ustawienia),
    kwota_zadatku: kwotaZadatku(ustawienia),
    stawka_godzinowa: STAWKA_GODZINOWA,
    doplata_za_godzine: DOPLATA_ZA_GODZINE,
    horyzont_tygodni: tygodnie,
    miejsce: miejsceId,
    miejsca: miejscaDlaStrony(),
    dni,
  };
}
