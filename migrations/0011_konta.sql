-- Konta kursantów: logowanie 6-cyfrowym kodem z e-maila, bez haseł
-- (decyzje właściciela: docs/plan-konta-sms-grafik.md, lib/konto.js).
--
-- Migracja tylko dodaje tabele i pustą kolumnę — obecny kod działa z nią bez
-- zmian, więc można ją wgrać na produkcję przed włączeniem kont.

CREATE TABLE uzytkownicy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,              -- małymi literami, sprawdzony kodem
  imie TEXT,                               -- imię i nazwisko (uzupełniane po 1. logowaniu)
  telefon TEXT,
  jezyk TEXT NOT NULL DEFAULT 'pl' CHECK (jezyk IN ('pl', 'en')),
  zgoda_regulamin INTEGER NOT NULL DEFAULT 0,
  wersja_regulaminu TEXT,
  zablokowany INTEGER NOT NULL DEFAULT 0,  -- blokada z panelu
  utworzono_o TEXT NOT NULL DEFAULT (datetime('now')),
  ostatnio_o TEXT
);

-- Sesja = ciasteczko "id.sekret"; w bazie tylko skrót SHA-256 sekretu, więc
-- wyciek bazy nie daje nikomu dostępu do kont.
CREATE TABLE sesje (
  id TEXT PRIMARY KEY,
  sekret_skrot TEXT NOT NULL,
  uzytkownik_id INTEGER NOT NULL REFERENCES uzytkownicy (id) ON DELETE CASCADE,
  utworzono_o TEXT NOT NULL,
  ostatnio_o TEXT NOT NULL,
  wygasa_o TEXT NOT NULL
);
CREATE INDEX idx_sesje_uzytkownik ON sesje (uzytkownik_id);

-- Jeden aktualny kod na adres; w bazie tylko skrót kodu.
CREATE TABLE kody_logowania (
  email TEXT PRIMARY KEY,
  kod_skrot TEXT NOT NULL,
  wygasa_o TEXT NOT NULL,
  proby INTEGER NOT NULL DEFAULT 0,
  wyslano_o TEXT NOT NULL
);

-- Ograniczniki (ile kodów na adres / IP w danym czasie). IP tylko jako skrót.
CREATE TABLE limity (
  rodzaj TEXT NOT NULL,
  klucz TEXT NOT NULL,
  czas TEXT NOT NULL
);
CREATE INDEX idx_limity ON limity (rodzaj, klucz, czas);

ALTER TABLE rezerwacje ADD COLUMN uzytkownik_id INTEGER REFERENCES uzytkownicy (id) ON DELETE SET NULL;
CREATE INDEX idx_rezerwacje_uzytkownik ON rezerwacje (uzytkownik_id, data);
