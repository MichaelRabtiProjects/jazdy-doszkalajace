-- Wstępne rezerwacje z formularza przy grafiku + panel administratora.
--
-- Nowy przepływ:
--   wstepna       → kursant wysłał formularz; termin zajęty, w grafiku widać
--                   "wstępna rezerwacja — czeka na potwierdzenie"
--   potwierdzona  → instruktor potwierdził w panelu; termin po prostu znika
--   odrzucona     → instruktor odrzucił; termin wraca do grafiku
--   anulowane     → odwołana już po potwierdzeniu; termin wraca do grafiku
--
-- Stare statusy trybu Autopay ('oczekuje', 'oplacone', 'wygasle') zostają
-- dopuszczone, żeby wersja z tagu `autopay-wersja` dalej pasowała do bazy.
--
-- SQLite nie pozwala zmienić ograniczenia CHECK istniejącej kolumny, więc
-- tabelę trzeba przebudować: nowa tabela → kopia danych → podmiana nazw.
-- defer_foreign_keys odkłada sprawdzanie kluczy obcych do końca migracji —
-- bez tego usunięcie starej tabeli skasowałoby (ON DELETE CASCADE) wszystkie
-- zajęte godziny w rezerwacje_godziny.

PRAGMA defer_foreign_keys = true;

CREATE TABLE rezerwacje_nowa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,                       -- YYYY-MM-DD
  godzina_start INTEGER NOT NULL CHECK (godzina_start BETWEEN 0 AND 23),
  godzina_koniec INTEGER NOT NULL CHECK (godzina_koniec BETWEEN 1 AND 24),
  imie TEXT NOT NULL,                       -- imię i nazwisko w jednym polu
  telefon TEXT NOT NULL,
  email TEXT NOT NULL,                      -- pusty tekst przy wpisie ręcznym bez e-maila
  kod_rezerwacji TEXT NOT NULL UNIQUE,      -- format JD-DDMM-GG
  kwota_zadatku INTEGER NOT NULL,           -- w pełnych złotych
  status TEXT NOT NULL DEFAULT 'wstepna'
    CHECK (status IN ('wstepna', 'potwierdzona', 'odrzucona', 'anulowane',
                      'oczekuje', 'oplacone', 'wygasle')),
  autopay_order_id TEXT,
  autopay_transaction_id TEXT,
  zgoda_zadatek INTEGER NOT NULL DEFAULT 0,
  do_wyjasnienia INTEGER NOT NULL DEFAULT 0,
  utworzono_o TEXT NOT NULL DEFAULT (datetime('now')),
  zgoda_regulamin INTEGER NOT NULL DEFAULT 0,
  wersja_regulaminu TEXT,
  -- Losowy, niezgadywalny klucz do strony "Twoja rezerwacja" i przycisku
  -- "Wysłałem zadatek". Kod JD-DDMM-GG jest za łatwy do odgadnięcia, żeby
  -- samym nim otwierać cudzą rezerwację.
  token TEXT UNIQUE,
  jezyk TEXT NOT NULL DEFAULT 'pl' CHECK (jezyk IN ('pl', 'en')),
  zrodlo TEXT NOT NULL DEFAULT 'formularz' CHECK (zrodlo IN ('formularz', 'panel')),
  zadatek_zgloszony_o TEXT,                 -- kursant kliknął "Wysłałem zadatek"
  zadatek_otrzymany_o TEXT,                 -- instruktor zaznaczył wpłatę w panelu
  potwierdzono_o TEXT,
  notatka TEXT,                             -- notatka instruktora, widoczna tylko w panelu
  CHECK (godzina_koniec > godzina_start)
);

INSERT INTO rezerwacje_nowa
  (id, data, godzina_start, godzina_koniec, imie, telefon, email, kod_rezerwacji,
   kwota_zadatku, status, autopay_order_id, autopay_transaction_id, zgoda_zadatek,
   do_wyjasnienia, utworzono_o, zgoda_regulamin, wersja_regulaminu)
SELECT
   id, data, godzina_start, godzina_koniec, imie, telefon, email, kod_rezerwacji,
   kwota_zadatku, status, autopay_order_id, autopay_transaction_id, zgoda_zadatek,
   do_wyjasnienia, utworzono_o, zgoda_regulamin, wersja_regulaminu
FROM rezerwacje;

-- DROP TABLE wykonuje po cichu DELETE, a to uruchamia ON DELETE CASCADE
-- w rezerwacje_godziny (sam defer_foreign_keys tego nie zatrzymuje).
-- Dlatego zajęte godziny odkładamy na bok i wstawiamy z powrotem.
CREATE TABLE rezerwacje_godziny_kopia AS SELECT * FROM rezerwacje_godziny;

DROP TABLE rezerwacje;
ALTER TABLE rezerwacje_nowa RENAME TO rezerwacje;

DELETE FROM rezerwacje_godziny;
INSERT INTO rezerwacje_godziny (data, godzina, rezerwacja_id)
  SELECT data, godzina, rezerwacja_id FROM rezerwacje_godziny_kopia;
DROP TABLE rezerwacje_godziny_kopia;

CREATE INDEX idx_rezerwacje_data ON rezerwacje (data);
CREATE INDEX idx_rezerwacje_status ON rezerwacje (status, utworzono_o);

-- Nieudane logowania do panelu — ogranicznik prób zgadywania hasła.
-- Adres IP trzymamy jako skrót SHA-256, nie wprost, i czyścimy po dobie.
CREATE TABLE logowania_nieudane (
  ip_skrot TEXT NOT NULL,
  czas TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_logowania_ip ON logowania_nieudane (ip_skrot, czas);
