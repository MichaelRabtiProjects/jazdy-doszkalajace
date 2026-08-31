-- 0001_init.sql
-- Pierwsza migracja: tabele pod grafik dostępności i rezerwacje.
--
-- Konwencja godzin: przechowujemy tylko liczbę całkowitą 0-23 oznaczającą
-- POCZĄTEK godzinnego slotu (8 = 8:00-9:00). Zakres [start_hour, end_hour)
-- jest "domknięty z lewej, otwarty z prawej": start_hour=8, end_hour=18
-- oznacza dostępne starty o 8, 9, 10 ... 17 (ostatnia jazda zaczyna się o
-- 17:00, żeby przy 1-godzinnym module dało się skończyć przed 18:00).

-- Szablon tygodniowy: powtarzalne godziny dostępności.
-- day_of_week używa tej samej konwencji co JavaScriptowe Date.getDay():
-- 0 = niedziela, 1 = poniedziałek, ..., 6 = sobota. Dzięki temu w kodzie
-- frontendowym nie trzeba niczego "tłumaczyć" między dniem tygodnia z
-- kalendarza a dniem tygodnia z bazy.
CREATE TABLE weekly_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_hour INTEGER NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
  end_hour INTEGER NOT NULL CHECK (end_hour BETWEEN 1 AND 24),
  CHECK (end_hour > start_hour)
);

-- Wyjątki od szablonu dla konkretnej daty (np. urlop, dodatkowa sobota).
-- kind='block' zabiera dostępność, która normalnie wynika z szablonu.
-- kind='add' dodaje dostępność, której szablon normalnie nie przewiduje.
CREATE TABLE availability_exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  start_hour INTEGER NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
  end_hour INTEGER NOT NULL CHECK (end_hour BETWEEN 1 AND 24),
  kind TEXT NOT NULL CHECK (kind IN ('add', 'block')),
  note TEXT,
  CHECK (end_hour > start_hour)
);

-- Rezerwacje. "code" to publiczny, unikalny kod, który klient dostaje
-- mailem jako dowód rezerwacji/płatności.
-- amount_grosz: kwota w GROSZACH (liczba całkowita), nie w złotówkach jako
-- ułamek — liczby zmiennoprzecinkowe (float) nie potrafią dokładnie zapisać
-- większości wartości dziesiętnych, więc np. 480.10 zł mogłoby się w
-- pewnych operacjach zamienić na 480.09999999998 zł. Przy pieniądzach
-- zawsze liczymy w najmniejszej jednostce (grosz) jako int.
CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  client_email TEXT NOT NULL,
  date TEXT NOT NULL,
  start_hour INTEGER NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
  duration_hours INTEGER NOT NULL CHECK (duration_hours IN (2, 3, 4)),
  amount_grosz INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_payment', 'paid', 'cancelled', 'expired')) DEFAULT 'pending_payment',
  hold_expires_at TEXT,
  payment_provider TEXT,
  payment_reference TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rozbicie każdej rezerwacji na pojedyncze zajęte godziny — to jest nasza
-- ochrona przed podwójną rezerwacją (patrz PRIMARY KEY (date, hour) niżej).
-- Rekord w tej tabeli istnieje tylko dla rezerwacji "żywych" (status
-- pending_payment lub paid). Gdy rezerwacja wygaśnie lub zostanie
-- anulowana, usuwamy jej wiersze stąd, co od razu zwalnia te godziny dla
-- innych klientów.
--
-- PRIMARY KEY (date, hour) to twarde ograniczenie na poziomie bazy danych:
-- SQLite fizycznie nie pozwoli wstawić drugiego wiersza dla tej samej pary
-- (data, godzina). Jeśli dwóch klientów spróbuje zarezerwować ten sam
-- termin w tym samym momencie, jedna z tych transakcji dostanie błąd z
-- bazy — to jest mechanizm, o który pytałeś (ochrona przed race condition).
CREATE TABLE booking_hours (
  date TEXT NOT NULL,
  hour INTEGER NOT NULL,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  PRIMARY KEY (date, hour)
);

CREATE INDEX idx_booking_hours_booking_id ON booking_hours(booking_id);
CREATE INDEX idx_bookings_status_hold ON bookings(status, hold_expires_at);
