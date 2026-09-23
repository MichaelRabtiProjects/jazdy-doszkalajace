-- Nowy domyślny szablon dostępności: poniedziałek–piątek 10:00–22:00.
--
-- Zastępuje szablon z migracji 0001 (pn–pt 10–20, sob–nd 10–17).
-- Weekendy znikają z szablonu; pojedyncze soboty czy niedziele można
-- dodawać wyjątkiem 'dodatkowa_godzina' z panelu, bez zmiany szablonu.
--
-- Przypomnienie o konwencji z 0001: zakres to [start, koniec), więc
-- 10–22 oznacza godziny startowe 10…21, a ostatnia 2-godzinna jazda
-- zaczyna się o 20:00 i kończy o 22:00.
--
-- UWAGA: ta migracja czyści całą tabelę, więc nadpisze też szablon
-- zmieniony ręcznie z panelu. Uruchamiać tylko raz, przy wdrożeniu.

DELETE FROM szablon_tygodniowy;

INSERT INTO szablon_tygodniowy (dzien_tygodnia, godzina_start, godzina_koniec) VALUES
  (1, 10, 22),
  (2, 10, 22),
  (3, 10, 22),
  (4, 10, 22),
  (5, 10, 22);
