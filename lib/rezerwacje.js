/**
 * Rezerwacje — wstępne z formularza przy grafiku oraz wpisywane ręcznie
 * z panelu administratora.
 *
 * Wersja z płatnością online (Autopay) jest zachowana w tagu `autopay-wersja`.
 */

import { dataPL, dodajDni } from './czas.js';
import { wczytajUstawienia, horyzontTygodni, kwotaZadatku } from './ustawienia.js';
import { DLUGOSCI, STAWKA_GODZINOWA, otwarteGodzinyDnia } from './dostepnosc.js';
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
  imie: { pl: 'Podaj imię i nazwisko.', en: 'Please enter your first and last name.' },
  telefon: { pl: 'Podaj poprawny numer telefonu.', en: 'Please enter a valid phone number.' },
  email: { pl: 'Podaj poprawny adres e-mail.', en: 'Please enter a valid e-mail address.' },
  zgoda: {
    pl: 'Zaakceptuj Regulamin i Politykę prywatności.',
    en: 'Please accept the Terms of Service and Privacy Policy.',
  },
  horyzont: { pl: 'Ten termin jest poza dostępnym zakresem.', en: 'This time is outside the available range.' },
  zamkniete: {
    pl: 'Ten termin nie jest dostępny w grafiku — wybierz inny.',
    en: 'This time isn’t available in the schedule — please pick another.',
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
  const { data, godzina_start, dlugosc } = dane;
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new BladRezerwacji('WALIDACJA', komunikat('data', jezyk));
  }
  if (!Number.isInteger(godzina_start) || godzina_start < 0 || godzina_start > 23) {
    throw new BladRezerwacji('WALIDACJA', komunikat('godzina', jezyk));
  }
  if (!Number.isInteger(dlugosc) || dlugosc < 1 || godzina_start + dlugosc > 24) {
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
 * Zapisuje rezerwację i atomowo zajmuje wszystkie jej godziny.
 * Wspólne dla formularza i panelu — różnią się tylko kontrole przed zapisem.
 */
async function zapisz(db, wiersz) {
  const kod = await wygenerujKod(db, wiersz.data, wiersz.godzina_start);

  const zapytania = [
    db
      .prepare(
        `INSERT INTO rezerwacje
           (data, godzina_start, godzina_koniec, imie, telefon, email,
            kod_rezerwacji, kwota_zadatku, status, zgoda_regulamin,
            wersja_regulaminu, token, jezyk, zrodlo, potwierdzono_o, notatka)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        wiersz.data,
        wiersz.godzina_start,
        wiersz.godzina_koniec,
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
        wiersz.notatka || null
      ),
  ];

  // Po jednym wierszu na każdą zajmowaną godzinę. PRIMARY KEY (data, godzina)
  // sprawia, że jeśli ktokolwiek zdążył zająć choć jedną z nich, cały batch
  // (czyli też wstawiona wyżej rezerwacja) zostanie wycofany.
  for (let g = wiersz.godzina_start; g < wiersz.godzina_koniec; g++) {
    zapytania.push(
      db
        .prepare(
          `INSERT INTO rezerwacje_godziny (data, godzina, rezerwacja_id)
           SELECT ?, ?, id FROM rezerwacje WHERE kod_rezerwacji = ?`
        )
        .bind(wiersz.data, g, kod)
    );
  }

  try {
    await db.batch(zapytania);
  } catch (err) {
    const tresc = String(err && err.message);
    if (tresc.includes('UNIQUE') || tresc.includes('PRIMARY KEY') || tresc.includes('constraint')) {
      throw new BladRezerwacji('TERMIN_ZAJETY', komunikat('zajete', wiersz.jezyk), 409);
    }
    throw err;
  }

  return db.prepare('SELECT * FROM rezerwacje WHERE kod_rezerwacji = ?').bind(kod).first();
}

/**
 * Wstępna rezerwacja z publicznego formularza.
 * Sprawdza wszystko, czego przeglądarka nie gwarantuje: czy godziny są
 * naprawdę otwarte w grafiku, horyzont, limity przeciw nadużyciom.
 */
export async function utworzWstepna(db, dane) {
  const jezyk = dane && dane.jezyk === 'en' ? 'en' : 'pl';
  sprawdzTermin(dane || {}, jezyk);
  if (!DLUGOSCI.includes(dane.dlugosc)) {
    throw new BladRezerwacji('WALIDACJA', komunikat('dlugosc', jezyk));
  }
  const osoba = sprawdzOsobe(dane, jezyk, { emailWymagany: true });
  // Sprawdzamy to na serwerze, a nie tylko w przeglądarce — pole wyboru
  // w HTML można ominąć, wysyłając zapytanie bezpośrednio do API.
  if (dane.zgoda_regulamin !== true) {
    throw new BladRezerwacji('WALIDACJA', komunikat('zgoda', jezyk));
  }

  const { data, godzina_start, dlugosc } = dane;
  const godzinaKoniec = godzina_start + dlugosc;
  const ustawienia = await wczytajUstawienia(db);

  const dzisiaj = dataPL();
  const ostatniaData = dodajDni(dzisiaj, horyzontTygodni(ustawienia) * 7 - 1);
  // Dzień dzisiejszy nigdy nie jest rezerwowalny (patrz policzDostepnosc) —
  // najwcześniejszy możliwy termin to jutro.
  if (data <= dzisiaj || data > ostatniaData) {
    throw new BladRezerwacji('POZA_HORYZONTEM', komunikat('horyzont', jezyk));
  }

  const { otwarte } = await otwarteGodzinyDnia(db, data);
  for (let g = godzina_start; g < godzinaKoniec; g++) {
    if (!otwarte.has(g)) throw new BladRezerwacji('ZAMKNIETE', komunikat('zamkniete', jezyk), 409);
  }

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

  return zapisz(db, {
    data,
    godzina_start,
    godzina_koniec: godzinaKoniec,
    ...osoba,
    kwota_zadatku: kwotaZadatku(ustawienia),
    status: 'wstepna',
    zgoda_regulamin: true,
    token: nowyToken(),
    jezyk,
    zrodlo: 'formularz',
  });
}

/**
 * Rezerwacja wpisana ręcznie przez instruktora (np. po telefonie).
 * Od razu potwierdzona. Instruktor może wpisać dowolne godziny — także
 * poza grafikiem — ale nadal nie da się nałożyć dwóch rezerwacji na siebie.
 */
export async function utworzZPanelu(db, dane) {
  sprawdzTermin(dane || {}, 'pl');
  const osoba = sprawdzOsobe(dane, 'pl', { emailWymagany: false });
  const ustawienia = await wczytajUstawienia(db);
  return zapisz(db, {
    data: dane.data,
    godzina_start: dane.godzina_start,
    godzina_koniec: dane.godzina_start + dane.dlugosc,
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

/** Zwalnia godziny rezerwacji i ustawia jej status (odrzucenie, anulowanie). */
export async function zwolnijTermin(db, id, status) {
  await db.batch([
    db.prepare('DELETE FROM rezerwacje_godziny WHERE rezerwacja_id = ?').bind(id),
    db.prepare('UPDATE rezerwacje SET status = ? WHERE id = ?').bind(status, id),
  ]);
}

/** Dane rezerwacji dla strony "Twoja rezerwacja" — BEZ telefonu i e-maila. */
export function widokPubliczny(r) {
  const dlugosc = r.godzina_koniec - r.godzina_start;
  return {
    kod_rezerwacji: r.kod_rezerwacji,
    data: r.data,
    godzina_start: r.godzina_start,
    godzina_koniec: r.godzina_koniec,
    dlugosc,
    status: r.status,
    kwota_zadatku: r.kwota_zadatku,
    do_zaplaty_na_miejscu: dlugosc * STAWKA_GODZINOWA - r.kwota_zadatku,
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
    db.prepare('DELETE FROM rezerwacje_godziny WHERE data < ?').bind(granica),
    db.prepare('DELETE FROM rezerwacje WHERE data < ?').bind(granica),
    db.prepare("DELETE FROM logowania_nieudane WHERE datetime(czas) < datetime('now', '-1 day')"),
  ]);
}
