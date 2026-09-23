-- Szablon dostępności: pon/śr/pt 10:00–22:00, sob/nd 10:00–18:00,
-- wtorki i czwartki zamknięte.
--
-- Zastępuje szablon z migracji 0003 (pn–pt 10–22). Osobna migracja,
-- bo 0003 została już uruchomiona na lokalnej bazie — poprawianie
-- wdrożonej migracji "w miejscu" sprawia, że bazy przestają się zgadzać
-- (jedna ma stary szablon, druga nowy, a plik wygląda tak samo).
--
-- Konwencja z 0001: zakres to [start, koniec), a dzien_tygodnia liczy się
-- jak w JS getDay() — 0 = niedziela, 1 = poniedziałek, … 6 = sobota.
-- Wtorek (2) i czwartek (4) po prostu nie mają wierszy: dzień bez wpisu
-- w szablonie jest dniem wolnym.
--
-- 10–22 oznacza godziny startowe 10…21, więc ostatnia 2-godzinna jazda
-- zaczyna się o 20:00. Przy 10–18 ostatni start 2-godzinny to 16:00.
--
-- UWAGA: czyści całą tabelę, więc nadpisze też szablon zmieniony ręcznie
-- z panelu. Uruchamiać raz, przy wdrożeniu.

DELETE FROM szablon_tygodniowy;

INSERT INTO szablon_tygodniowy (dzien_tygodnia, godzina_start, godzina_koniec) VALUES
  (1, 10, 22),  -- poniedziałek
  (3, 10, 22),  -- środa
  (5, 10, 22),  -- piątek
  (6, 10, 18),  -- sobota
  (0, 10, 18);  -- niedziela
