-- Przesunięcie godzin szablonu: start o 12:00 zamiast 10:00.
-- Dni tygodnia (pon/śr/pt otwarte, wt/czw zamknięte, sob/nd inne godziny)
-- zostają takie, jak w migracji 0004 — zmieniają się tylko godziny.
--
-- Osobna migracja zamiast poprawiania 0004, bo 0004 była już uruchomiona
-- lokalnie — patrz uzasadnienie w komentarzu na górze 0004_*.sql.
--
-- Poniedziałek, środa, piątek: 12:00–20:00
-- Sobota, niedziela:            12:00–18:00
-- Wtorek, czwartek:              bez zmian, zamknięte (brak wiersza)

DELETE FROM szablon_tygodniowy;

INSERT INTO szablon_tygodniowy (dzien_tygodnia, godzina_start, godzina_koniec) VALUES
  (1, 12, 20),  -- poniedziałek
  (3, 12, 20),  -- środa
  (5, 12, 20),  -- piątek
  (6, 12, 18),  -- sobota
  (0, 12, 18);  -- niedziela
