-- Blokady kalendarza z panelu (jak "Blokada kalendarza" w Calendesku),
-- np. "Prywatne doszkalanie" 19:00–21:00.
--
-- Zablokowany czas znika z grafiku kursantów (nie da się go zarezerwować —
-- pilnuje tego też sam zapis rezerwacji) i jest widoczny tylko w panelu.
--
-- Osobna tabela, a nie wyjatki 'blokada_godziny', bo:
--   - blokada może zaczynać się o dowolnej minucie (13:30–15:00),
--   - ma opis widoczny w panelu,
--   - w kalendarzu przeciąga się ją jak jazdę.
-- Zamknięcie całego dnia zostaje w tabeli wyjatki ('blokada_dnia').
--
-- Migracja tylko dodaje tabelę — obecny kod działa z nią bez zmian.

CREATE TABLE blokady (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,                       -- YYYY-MM-DD
  start_min INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1435),
  koniec_min INTEGER NOT NULL CHECK (koniec_min BETWEEN 5 AND 1440),
  opis TEXT,                                -- widoczny tylko w panelu
  utworzono_o TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (koniec_min > start_min)
);

CREATE INDEX idx_blokady_data ON blokady (data, start_min);
