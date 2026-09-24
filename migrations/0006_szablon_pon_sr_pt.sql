-- Szablon dostępności: tylko poniedziałek, środa (10:00–20:00)
-- i piątek (10:00–18:00). Wtorek, czwartek, sobota i niedziela zamknięte
-- — dla tych dni front pokazuje teraz zachętę do kontaktu telefonicznego
-- zamiast osobnych godzin weekendowych (patrz grafik.js).
--
-- Zastępuje szablon z migracji 0005. Osobna migracja z tego samego
-- powodu co poprzednio: 0005 była już uruchomiona lokalnie.
--
-- Konwencja z 0001: zakres to [start, koniec), dzien_tygodnia jak w JS
-- getDay() (0 = niedziela). Piątek kończy się o 18, więc ostatni
-- 2-godzinny start to 16:00 (nie 16-18-tylko wynik z 2h, dłuższe jazdy
-- kończą się wcześniej — policzone automatycznie przez lib/dostepnosc.js).

DELETE FROM szablon_tygodniowy;

INSERT INTO szablon_tygodniowy (dzien_tygodnia, godzina_start, godzina_koniec) VALUES
  (1, 10, 20),  -- poniedziałek
  (3, 10, 20),  -- środa
  (5, 10, 18);  -- piątek
