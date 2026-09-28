/**
 * Rezerwacje — wstępne z formularza przy grafiku oraz wpisywane ręcznie
 * z panelu administratora.
 *
 * Czas jazdy zapisujemy w minutach od północy (start_min, koniec_min),
 * bo po dojeździe z dalszego miejsca jazda może zacząć się np. o 13:25.
 *
 * Wersja z płatnością online (Autopay) jest zachowana w tagu `autopay-wersja`.
 */

import { dataPL, dodajDni } from './czas.js';
import { wczytajUstawienia, horyzontTygodni, kwotaZadatku } from './ustawienia.js';
import {
  DLUGOSCI,
  STAWKA_GODZINOWA,
  ZYWE_SQL,
  otwarteGodzinyDnia,
  przedzialyMinut,
  terminyDnia,
  rezerwacjeWZakresie,
} from './dostepnosc.js';
import { miejsce as znajdzMiejsce, wczytajDojazdy, DOPLATA_ZA_GODZINE } from './miejsca.js';
import { wygenerujKod } from './kod.js';
import { WERSJA_REGULAMINU } from './dokumenty.js';

export class BladRezerwacji extends Error {
  constructor(kod, komunikat, status = 400) {
    super(komunikat);
    this.kod = kod;
    this.status = status;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Ile wstępnych rezerwacji naraz może mieć jedna osoba (ten sam e-mail lub telefon). */
const LIMIT_NA_OSOBE = 2;

/** Ogólny bezpiecznik przeciw zalaniu grafiku przez bota: tyle formularzy na godzinę. */
const LIMIT_NA_GODZINE = 15;

/**
 * Komunikaty błędów w obu językach — formularz jest dwujęzyczny, więc
 * odpowiedź serwera też musi być (pokazujemy ją kursantowi wprost).
 */
const KOMUNIKATY = {
  data: { pl: 'Nieprawidłowa data.', en: 'Invalid date.' },
  godzina: { pl: 'Nieprawidłowa godzina rozpoczęcia.', en: 'Invalid start time.' },
  dlugosc: { pl: 'Jazda może trwać 2, 3 albo 4 godziny.', en: 'A lesson can last 2, 3 or 4 hours.' },
  miejsce: { pl: 'Wybierz miejsce spotkania z listy.', en: 'Please choose a meeting point from the list.' },
  imie: { pl: 'Podaj imię i nazwisko.', en: 'Please enter your first and last name.' },
  telefon: { pl: 'Podaj poprawny numer telefonu.', en: 'Please enter a valid phone number.' },
  email: { pl: 'Podaj poprawny adres e-mail.', en: 'Please enter a valid e-mail address.' },
  zgoda: {
    pl: 'Zaakceptuj Regulamin i Politykę prywatności.',
    en: 'Please accept the Terms of Service and Privacy Policy.',
  },
  horyzont: { pl: 'Ten termin jest poza dostępnym zakresem.', en: 'This time is outside the available range.' },
  zamkniete: {
    pl: 'Ten termin nie jest już dostępny dla wybranego miejsca — wybierz inny.',
    en: 'This time is no longer available for the chosen meeting point — please pick another.',
  },
  zajete: {
    pl: 'Ten termin właśnie został zajęty — wybierz inny.',
    en: 'This time has just been taken — please pick another.',
  },
  limitOsoba: {
    pl: 'Masz już wstępne rezerwacje czekające na potwierdzenie. Poczekaj na kontakt albo napisz bezpośrednio.',
    en: 'You already have provisional bookings waiting for confirmation. Please wait to be contacted or message me directly.',
  },
  limitOgolny: {
    pl: 'Chwilowo nie można przyjąć rezerwacji. Napisz SMS lub WhatsApp: 690 360 164.',
    en: 'Bookings can’t be accepted right now. Please send an SMS or WhatsApp message to +48 690 360 164.',
  },
};

function komunikat(klucz, jezyk) {
  return KOMUNIKATY[klucz][jezyk === 'en' ? 'en' : 'pl'];
}

/** Losowy, niezgadywalny token (128 bitów) do linku "Twoja rezerwacja". */
export function nowyToken() {
  const bajty = new Uint8Array(16);
  crypto.getRandomValues(bajty);
  return Array.from(bajty, (b) => b.toString(16).padStart(2, '0')).join('');
}

function sprawdzTermin(dane, jezyk) {
  const { data, start, dlugosc } = dane;
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new BladRezerwacji('WALIDACJA', komunikat('data', jezyk));
  }
  if (!Number.isInteger(start) || start < 0 || start % 5 !== 0) {
    throw new BladRezerwacji('WALIDACJA', komunikat('godzina', jezyk));
  }
  if (!Number.isInteger(dlugosc) || dlugosc < 1 || dlugosc > 8 || start + dlugosc * 60 > 24 * 60) {
    throw new BladRezerwacji('WALIDACJA', komunikat('dlugosc', jezyk));
  }
}

/** Czyści i sprawdza dane osobowe. Zwraca znormalizowane wartości. */
function sprawdzOsobe(dane, jezyk, { emailWymagany }) {
  const imie = typeof dane.imie === 'string' ? dane.imie.trim().replace(/\s+/g, ' ') : '';
  const telefon = typeof dane.telefon === 'string' ? dane.telefon.trim() : '';
  const email = typeof dane.email === 'string' ? dane.email.trim() : '';

  // Imię i nazwisko = co najmniej dwa słowa. Limit długości chroni bazę
  // i treść maili przed wklejeniem ściany tekstu.
  if (imie.length < 3 || imie.length > 80 || imie.split(' ').length < 2) {
    throw new BladRezerwacji('WALIDACJA', komunikat('imie', jezyk));
  }
  // Numer może być zapisany ze spacjami albo z prefiksem +48 — liczymy cyfry
  const cyfry = telefon.replace(/\D/g, '');
  if (cyfry.length < 9 || cyfry.length > 15 || telefon.length > 25) {
    throw new BladRezerwacji('WALIDACJA', komunikat('telefon', jezyk));
  }
  if (emailWymagany || email) {
    if (email.length > 120 || !EMAIL_RE.test(email)) {
      throw new BladRezerwacji('WALIDACJA', komunikat('email', jezyk));
    }
  }
  return { imie, telefon, email };
}

/**
 * "Odcisk" żywych rezerwacji dnia: liczba i najwyższe id. Formularz liczy
 * dostępne godziny na podstawie stanu dnia; jeśli między liczeniem a zapisem
 * ktoś inny coś zarezerwuje albo odwoła, odcisk się zmieni i zapis się nie
 * uda — zamiast zapisać jazdę z nieaktualnym buforem na dojazd.
 */
const ODCISK_SQL = `(SELECT COUNT(*) || ':' || COALESCE(MAX(id), 0) FROM rezerwacje
                     WHERE data = ? AND status IN (${ZYWE_SQL}))`;

async function odciskDnia(db, data) {
  const w = await db.prepare(`SELECT ${ODCISK_SQL} AS o`).bind(data).first();
  return w.o;
}

/**
 * Zapisuje rezerwację jedną instrukcją INSERT … SELECT … WHERE NOT EXISTS —
 * sprawdzenie "czy nic nie nachodzi" i zapis dzieją się atomowo, więc dwie
 * osoby klikające ten sam termin w tej samej sekundzie nie przejdą obie.
 */
async function zapisz(db, wiersz, odcisk = null) {
  const kod = await wygenerujKod(db, wiersz.data, Math.floor(wiersz.start_min / 60));

  const warunekOdcisku = odcisk === null ? '' : `AND ${ODCISK_SQL} = ?`;
  const zapytanie = db
    .prepare(
      `INSERT INTO rezerwacje
         (data, godzina_start, godzina_koniec, start_min, koniec_min, miejsce, doplata_h,
          imie, telefon, email, kod_rezerwacji, kwota_zadatku, status, zgoda_regulamin,
          wersja_regulaminu, token, jezyk, zrodlo, potwierdzono_o, notatka)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM rezerwacje
         WHERE data = ? AND status IN (${ZYWE_SQL}) AND start_min < ? AND koniec_min > ?
       ) ${warunekOdcisku}`
    )
    .bind(
      wiersz.data,
      Math.floor(wiersz.start_min / 60),
      Math.ceil(wiersz.koniec_min / 60),
      wiersz.start_min,
      wiersz.koniec_min,
      wiersz.miejsce || null,
      wiersz.doplata_h || 0,
      wiersz.imie,
      wiersz.telefon,
      wiersz.email,
      kod,
      wiersz.kwota_zadatku,
      wiersz.status,
      wiersz.zgoda_regulamin ? 1 : 0,
      wiersz.zgoda_regulamin ? WERSJA_REGULAMINU : null,
      wiersz.token,
      wiersz.jezyk,
      wiersz.zrodlo,
      wiersz.status === 'potwierdzona' ? new Date().toISOString() : null,
      wiersz.notatka || null,
      wiersz.data,
      wiersz.koniec_min,
      wiersz.start_min,
      ...(odcisk === null ? [] : [wiersz.data, odcisk])
    );

  const { meta } = await zapytanie.run();
  if (!meta || meta.changes !== 1) {
    throw new BladRezerwacji('TERMIN_ZAJETY', komunikat('zajete', wiersz.jezyk), 409);
  }
  return db.prepare('SELECT * FROM rezerwacje WHERE kod_rezerwacji = ?').bind(kod).first();
}

/**
 * Wstępna rezerwacja z publicznego formularza.
 * Serwer sam liczy, czy wybrany start jest nadal możliwy dla tego miejsca
 * (bufory na dojazd, godziny pracy, inne jazdy) i jaka jest dopłata —
 * cena z przeglądarki nie jest brana pod uwagę.
 */
export async function utworzWstepna(db, dane) {
  const jezyk = dane && dane.jezyk === 'en' ? 'en' : 'pl';
  sprawdzTermin(dane || {}, jezyk);
  if (!DLUGOSCI.includes(dane.dlugosc)) {
    throw new BladRezerwacji('WALIDACJA', komunikat('dlugosc', jezyk));
  }
  if (!znajdzMiejsce(dane.miejsce)) {
    throw new BladRezerwacji('WALIDACJA', komunikat('miejsce', jezyk));
  }
  const osoba = sprawdzOsobe(dane, jezyk, { emailWymagany: true });
  // Sprawdzamy to na serwerze, a nie tylko w przeglądarce — pole wyboru
  // w HTML można ominąć, wysyłając zapytanie bezpośrednio do API.
  if (dane.zgoda_regulamin !== true) {
    throw new BladRezerwacji('WALIDACJA', komunikat('zgoda', jezyk));
  }

  const { data, start, dlugosc, miejsce } = dane;
  const ustawienia = await wczytajUstawienia(db);

  // Dzisiaj nie da się zarezerwować — najwcześniej jutro.
  const dzisiaj = dataPL();
  const ostatniaData = dodajDni(dzisiaj, horyzontTygodni(ustawienia) * 7 - 1);
  if (data <= dzisiaj || data > ostatniaData) {
    throw new BladRezerwacji('POZA_HORYZONTEM', komunikat('horyzont', jezyk));
  }

  const [{ aktywny, otwarte }, rezDnia, dojazd, odcisk] = await Promise.all([
    otwarteGodzinyDnia(db, data),
    rezerwacjeWZakresie(db, data, data),
    wczytajDojazdy(db),
    odciskDnia(db, data),
  ]);
  const termin = aktywny
    ? terminyDnia({ przedzialy: przedzialyMinut(otwarte), rezerwacje: rezDnia, miejsceId: miejsce, dojazd, dlugosc })
        .find((t) => t.start === start)
    : null;
  if (!termin) throw new BladRezerwacji('ZAMKNIETE', komunikat('zamkniete', jezyk), 409);

  const [naOsobe, naGodzine] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM rezerwacje
         WHERE status = 'wstepna' AND (lower(email) = lower(?) OR telefon = ?)`
      )
      .bind(osoba.email, osoba.telefon)
      .first(),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM rezerwacje
         WHERE zrodlo = 'formularz' AND datetime(utworzono_o) > datetime('now', '-1 hour')`
      )
      .first(),
  ]);
  if (naOsobe.n >= LIMIT_NA_OSOBE) {
    throw new BladRezerwacji('LIMIT', komunikat('limitOsoba', jezyk), 429);
  }
  if (naGodzine.n >= LIMIT_NA_GODZINE) {
    throw new BladRezerwacji('LIMIT', komunikat('limitOgolny', jezyk), 429);
  }

  return zapisz(
    db,
    {
      data,
      start_min: start,
      koniec_min: start + dlugosc * 60,
      miejsce,
      doplata_h: termin.doplata,
      ...osoba,
      kwota_zadatku: kwotaZadatku(ustawienia),
      status: 'wstepna',
      zgoda_regulamin: true,
      token: nowyToken(),
      jezyk,
      zrodlo: 'formularz',
    },
    odcisk
  );
}

/** Wspólna walidacja pól, które instruktor może ustawić w panelu. */
function sprawdzPolaPanelu(dane) {
  if (dane.miejsce && !znajdzMiejsce(dane.miejsce)) {
    throw new BladRezerwacji('WALIDACJA', 'Nieznane miejsce spotkania.');
  }
  if (dane.doplata_h !== undefined && ![0, DOPLATA_ZA_GODZINE].includes(dane.doplata_h)) {
    throw new BladRezerwacji('WALIDACJA', `Dopłata może wynosić 0 albo ${DOPLATA_ZA_GODZINE} zł/h.`);
  }
}

/**
 * Rezerwacja wpisana ręcznie przez instruktora (np. po telefonie).
 * Od razu potwierdzona. Instruktor może wpisać dowolną godzinę — także
 * poza grafikiem i bez buforu na dojazd — ale dwie jazdy nie mogą na
 * siebie nachodzić.
 */
export async function utworzZPanelu(db, dane) {
  sprawdzTermin(dane || {}, 'pl');
  sprawdzPolaPanelu(dane);
  const osoba = sprawdzOsobe(dane, 'pl', { emailWymagany: false });
  const ustawienia = await wczytajUstawienia(db);
  return zapisz(db, {
    data: dane.data,
    start_min: dane.start,
    koniec_min: dane.start + dane.dlugosc * 60,
    miejsce: dane.miejsce || null,
    doplata_h: dane.doplata_h || 0,
    ...osoba,
    kwota_zadatku: kwotaZadatku(ustawienia),
    status: 'potwierdzona',
    zgoda_regulamin: false,
    token: osoba.email ? nowyToken() : null,
    jezyk: dane.jezyk === 'en' ? 'en' : 'pl',
    zrodlo: 'panel',
    notatka: typeof dane.notatka === 'string' ? dane.notatka.trim().slice(0, 500) : null,
  });
}

/**
 * Ręczna zmiana godziny, długości, miejsca albo dopłaty przez instruktora
 * (np. "dogadałem się z kursantem — zaczynamy 13:10 zamiast 13:25").
 * Grafik publiczny przelicza się sam przy następnym odczycie.
 */
export async function edytujZPanelu(db, id, dane) {
  const r = await db.prepare('SELECT * FROM rezerwacje WHERE id = ?').bind(id).first();
  if (!r) throw new BladRezerwacji('BRAK', 'Nie ma takiej rezerwacji.', 404);

  const start = dane.start !== undefined ? dane.start : r.start_min;
  const dlugosc = dane.dlugosc !== undefined ? dane.dlugosc : (r.koniec_min - r.start_min) / 60;
  sprawdzTermin({ data: r.data, start, dlugosc }, 'pl');
  sprawdzPolaPanelu(dane);

  const koniec = start + dlugosc * 60;
  const miejsce = dane.miejsce !== undefined ? dane.miejsce || null : r.miejsce;
  const doplata = dane.doplata_h !== undefined ? dane.doplata_h : r.doplata_h;

  const { meta } = await db
    .prepare(
      `UPDATE rezerwacje
       SET start_min = ?, koniec_min = ?, godzina_start = ?, godzina_koniec = ?, miejsce = ?, doplata_h = ?
       WHERE id = ? AND NOT EXISTS (
         SELECT 1 FROM rezerwacje
         WHERE data = ? AND id != ? AND status IN (${ZYWE_SQL}) AND start_min < ? AND koniec_min > ?
       )`
    )
    .bind(start, koniec, Math.floor(start / 60), Math.ceil(koniec / 60), miejsce, doplata, id, r.data, id, koniec, start)
    .run();
  if (!meta || meta.changes !== 1) {
    throw new BladRezerwacji('KOLIZJA', 'Ta godzina nachodzi na inną jazdę tego dnia.', 409);
  }
  return db.prepare('SELECT * FROM rezerwacje WHERE id = ?').bind(id).first();
}

/** Zwalnia termin rezerwacji (odrzucenie, anulowanie) — zmiana statusu wystarczy. */
export async function zwolnijTermin(db, id, status) {
  await db.prepare('UPDATE rezerwacje SET status = ? WHERE id = ?').bind(status, id).run();
}

/** Cena za godzinę danej rezerwacji (stawka + dopłata za dojazd). */
export function cenaZaGodzine(r) {
  return STAWKA_GODZINOWA + (r.doplata_h || 0);
}

/** Dane rezerwacji dla strony "Twoja rezerwacja" — BEZ telefonu i e-maila. */
export function widokPubliczny(r) {
  const dlugosc = (r.koniec_min - r.start_min) / 60;
  const m = znajdzMiejsce(r.miejsce);
  return {
    kod_rezerwacji: r.kod_rezerwacji,
    data: r.data,
    start: r.start_min,
    koniec: r.koniec_min,
    dlugosc,
    miejsce: m ? { id: m.id, nazwa: m.nazwa, nazwa_en: m.nazwa_en } : null,
    cena_za_godzine: cenaZaGodzine(r),
    doplata_h: r.doplata_h || 0,
    status: r.status,
    kwota_zadatku: r.kwota_zadatku,
    do_zaplaty_na_miejscu: dlugosc * cenaZaGodzine(r) - r.kwota_zadatku,
    zadatek_zgloszony: Boolean(r.zadatek_zgloszony_o),
    zadatek_otrzymany: Boolean(r.zadatek_otrzymany_o),
    jezyk: r.jezyk,
  };
}

/**
 * Usuwa dane osobowe starsze niż 180 dni od terminu jazdy — tak obiecuje
 * Polityka prywatności. Wołane przy wejściu do panelu (Pages Functions
 * nie mają harmonogramu zadań).
 */
export async function usunStareDane(db) {
  const granica = dodajDni(dataPL(), -180);
  await db.batch([
    db.prepare('DELETE FROM rezerwacje WHERE data < ?').bind(granica),
    db.prepare("DELETE FROM logowania_nieudane WHERE datetime(czas) < datetime('now', '-1 day')"),
  ]);
}
