/** Tworzenie rezerwacji — z atomowym zajęciem wszystkich godzin naraz. */

import { dataPL, godzinaPL, dodajDni } from './czas.js';
import { wczytajUstawienia, horyzontTygodni, kwotaZadatku, platnosciOnline } from './ustawienia.js';
import { DLUGOSCI, STAWKA_GODZINOWA, wygasStareBlokady } from './dostepnosc.js';
import { wygenerujKod } from './kod.js';

export class BladRezerwacji extends Error {
  constructor(kod, komunikat, status = 400) {
    super(komunikat);
    this.kod = kod;
    this.status = status;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sprawdzDane(dane) {
  const { data, godzina_start, dlugosc, imie, telefon, email, zgoda_zadatek } = dane || {};

  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new BladRezerwacji('WALIDACJA', 'Nieprawidłowa data.');
  }
  if (!Number.isInteger(godzina_start) || godzina_start < 0 || godzina_start > 23) {
    throw new BladRezerwacji('WALIDACJA', 'Nieprawidłowa godzina rozpoczęcia.');
  }
  if (!DLUGOSCI.includes(dlugosc)) {
    throw new BladRezerwacji('WALIDACJA', 'Jazda może trwać 2, 3 albo 4 godziny.');
  }
  if (godzina_start + dlugosc > 24) {
    throw new BladRezerwacji('WALIDACJA', 'Wybrana długość nie mieści się w dobie.');
  }
  if (typeof imie !== 'string' || imie.trim().length < 2) {
    throw new BladRezerwacji('WALIDACJA', 'Podaj imię.');
  }
  // Numer może być zapisany ze spacjami albo z prefiksem +48 — liczymy cyfry
  if (typeof telefon !== 'string' || telefon.replace(/\D/g, '').length < 9) {
    throw new BladRezerwacji('WALIDACJA', 'Podaj poprawny numer telefonu.');
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    throw new BladRezerwacji('WALIDACJA', 'Podaj poprawny adres e-mail.');
  }
  if (zgoda_zadatek !== true) {
    throw new BladRezerwacji('WALIDACJA', 'Wymagana jest zgoda dotycząca zadatku.');
  }
}

/**
 * Tworzy rezerwację ze statusem 'oczekuje' i blokadą terminu na 15 minut.
 * Zwraca dane potrzebne do rozpoczęcia płatności.
 */
export async function utworzRezerwacje(db, dane) {
  sprawdzDane(dane);

  const { data, godzina_start, dlugosc, imie, telefon, email } = dane;
  const godzinaKoniec = godzina_start + dlugosc;

  const ustawienia = await wczytajUstawienia(db);

  if (!platnosciOnline(ustawienia)) {
    throw new BladRezerwacji(
      'TRYB_WYLACZONY',
      'Rezerwacja online jest chwilowo wyłączona — umów się telefonicznie.',
      403
    );
  }

  // Granice: nie w przeszłości i nie dalej niż horyzont
  const dzisiaj = dataPL();
  const ostatniaData = dodajDni(dzisiaj, horyzontTygodni(ustawienia) * 7 - 1);

  if (data < dzisiaj || data > ostatniaData) {
    throw new BladRezerwacji('POZA_HORYZONTEM', 'Ten termin jest poza dostępnym zakresem.');
  }
  if (data === dzisiaj && godzina_start <= godzinaPL()) {
    throw new BladRezerwacji('POZA_HORYZONTEM', 'Ta godzina już minęła.');
  }

  // Zwalniamy wygasłe blokady, żeby nie blokowały wolnych w rzeczywistości godzin
  await wygasStareBlokady(db);

  const zadatek = kwotaZadatku(ustawienia);
  const kod = await wygenerujKod(db, data, godzina_start);

  const zapytania = [
    db
      .prepare(
        `INSERT INTO rezerwacje
           (data, godzina_start, godzina_koniec, imie, telefon, email,
            kod_rezerwacji, kwota_zadatku, status, zgoda_zadatek)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'oczekuje', 1)`
      )
      .bind(
        data,
        godzina_start,
        godzinaKoniec,
        imie.trim(),
        telefon.trim(),
        email.trim(),
        kod,
        zadatek
      ),
  ];

  // Po jednym wierszu na każdą zajmowaną godzinę. PRIMARY KEY (data, godzina)
  // sprawia, że jeśli ktokolwiek zdążył zająć choć jedną z nich, cały batch
  // (czyli też wstawiona wyżej rezerwacja) zostanie wycofany.
  for (let g = godzina_start; g < godzinaKoniec; g++) {
    zapytania.push(
      db
        .prepare(
          `INSERT INTO rezerwacje_godziny (data, godzina, rezerwacja_id)
           SELECT ?, ?, id FROM rezerwacje WHERE kod_rezerwacji = ?`
        )
        .bind(data, g, kod)
    );
  }

  try {
    await db.batch(zapytania);
  } catch (err) {
    const tresc = String(err && err.message);
    if (tresc.includes('UNIQUE') || tresc.includes('PRIMARY KEY') || tresc.includes('constraint')) {
      throw new BladRezerwacji(
        'TERMIN_ZAJETY',
        'Ten termin właśnie został zajęty, wybierz inny.',
        409
      );
    }
    throw err;
  }

  const rezerwacja = await db
    .prepare('SELECT * FROM rezerwacje WHERE kod_rezerwacji = ?')
    .bind(kod)
    .first();

  return {
    kod_rezerwacji: kod,
    id: rezerwacja.id,
    data,
    godzina_start,
    godzina_koniec: godzinaKoniec,
    dlugosc,
    kwota_zadatku: zadatek,
    do_zaplaty_na_miejscu: dlugosc * STAWKA_GODZINOWA - zadatek,
    wygasa_o: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}
