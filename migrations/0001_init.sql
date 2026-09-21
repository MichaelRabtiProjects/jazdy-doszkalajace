-- Schemat bazy D1 dla grafiku i rezerwacji.
--
-- Konwencja godzin: liczba całkowita 0-23 oznacza POCZĄTEK godzinnego bloku
-- (14 = blok 14:00-15:00). Zakresy są domknięte z lewej, otwarte z prawej:
-- start=10, koniec=20 to bloki 10, 11, ... 19 (ostatnia jazda startuje o 19:00).
--
-- Konwencja dni tygodnia: 0 = niedziela, 1 = poniedziałek ... 6 = sobota,
-- czyli tak samo jak JavaScriptowe Date.getDay() — dzięki temu nie trzeba
-- niczego przeliczać między frontem a bazą.

CREATE TABLE szablon_tygodniowy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dzien_tygodnia INTEGER NOT NULL CHECK (dzien_tygodnia BETWEEN 0 AND 6),
  godzina_start INTEGER NOT NULL CHECK (godzina_start BETWEEN 0 AND 23),
  godzina_koniec INTEGER NOT NULL CHECK (godzina_koniec BETWEEN 1 AND 24),
  CHECK (godzina_koniec > godzina_start)
);

CREATE TABLE wyjatki (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,                       -- YYYY-MM-DD
  typ TEXT NOT NULL CHECK (typ IN ('blokada_dnia', 'blokada_godziny', 'dodatkowa_godzina')),
  -- przy 'blokada_dnia' godziny są puste (NULL) — blokuje cały dzień
  godzina_start INTEGER CHECK (godzina_start IS NULL OR godzina_start BETWEEN 0 AND 23),
  godzina_koniec INTEGER CHECK (godzina_koniec IS NULL OR godzina_koniec BETWEEN 1 AND 24)
);

CREATE INDEX idx_wyjatki_data ON wyjatki (data);

CREATE TABLE ustawienia (
  klucz TEXT PRIMARY KEY,
  wartosc TEXT NOT NULL
);

CREATE TABLE rezerwacje (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,                       -- YYYY-MM-DD
  godzina_start INTEGER NOT NULL CHECK (godzina_start BETWEEN 0 AND 23),
  godzina_koniec INTEGER NOT NULL CHECK (godzina_koniec BETWEEN 1 AND 24),
  imie TEXT NOT NULL,
  telefon TEXT NOT NULL,
  email TEXT NOT NULL,
  kod_rezerwacji TEXT NOT NULL UNIQUE,      -- format JD-DDMM-GG
  kwota_zadatku INTEGER NOT NULL,           -- w pełnych złotych
  status TEXT NOT NULL DEFAULT 'oczekuje'
    CHECK (status IN ('oczekuje', 'oplacone', 'wygasle', 'anulowane')),
  autopay_order_id TEXT,
  autopay_transaction_id TEXT,
  zgoda_zadatek INTEGER NOT NULL DEFAULT 0, -- 0/1, SQLite nie ma typu boolean
  -- Ustawiane w Etapie 3, gdy wpłata dotrze po wygaśnięciu blokady na termin,
  -- który zdążył zająć ktoś inny. Takie rezerwacje panel pokaże na czerwono.
  do_wyjasnienia INTEGER NOT NULL DEFAULT 0,
  utworzono_o TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (godzina_koniec > godzina_start)
);

CREATE INDEX idx_rezerwacje_data ON rezerwacje (data);
CREATE INDEX idx_rezerwacje_status ON rezerwacje (status, utworzono_o);

-- Rozbicie rezerwacji na pojedyncze zajęte godziny.
--
-- To jest mechanizm, który fizycznie uniemożliwia podwójną rezerwację:
-- PRIMARY KEY (data, godzina) sprawia, że baza nie przyjmie drugiego wiersza
-- dla tej samej godziny tego samego dnia. Gdy dwie osoby klikną ten sam
-- termin w tej samej sekundzie, batch D1 drugiej z nich wywróci się na tym
-- ograniczeniu i całość zostanie wycofana — bez zgadywania po stronie kodu.
--
-- Wiersze istnieją tylko dla rezerwacji ŻYWYCH ('oplacone' albo 'oczekuje'
-- w ciągu 15 minut). Wygaszanie i anulowanie je usuwa, zwalniając termin.
CREATE TABLE rezerwacje_godziny (
  data TEXT NOT NULL,
  godzina INTEGER NOT NULL,
  rezerwacja_id INTEGER NOT NULL REFERENCES rezerwacje (id) ON DELETE CASCADE,
  PRIMARY KEY (data, godzina)
);

CREATE INDEX idx_rezerwacje_godziny_rezerwacja ON rezerwacje_godziny (rezerwacja_id);

-- ---------------------------------------------------------------------------
-- Wartości domyślne
-- ---------------------------------------------------------------------------

INSERT INTO ustawienia (klucz, wartosc) VALUES
  ('horyzont_tygodni', '3'),
  ('platnosci_online', 'false'),
  ('kwota_zadatku', '80');

-- Startowy szablon: pon-pt 10:00-20:00, sob-nd 10:00-17:00.
-- Wszystko do zmiany z panelu admina, to tylko sensowny punkt wyjścia.
INSERT INTO szablon_tygodniowy (dzien_tygodnia, godzina_start, godzina_koniec) VALUES
  (1, 10, 20),
  (2, 10, 20),
  (3, 10, 20),
  (4, 10, 20),
  (5, 10, 20),
  (6, 10, 17),
  (0, 10, 17);
