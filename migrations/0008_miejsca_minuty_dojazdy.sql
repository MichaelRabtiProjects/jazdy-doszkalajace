-- Miejsce spotkania, godziny co do minuty, bufory na dojazd, przypomnienia.
--
-- 1. Rezerwacje przechodzą z pełnych godzin na minuty od północy
--    (start_min, koniec_min) — po jeździe w dalszym miejscu kolejna może
--    zacząć się np. o 13:25, a nie tylko o pełnej godzinie.
--    Stare kolumny godzina_start/godzina_koniec zostają wypełniane
--    (zaokrąglone do godzin) dla zgodności, ale logika używa minut.
-- 2. miejsce — id z lib/miejsca.js; doplata_h — zł/h doliczone przy
--    rezerwacji (0 albo 15), zapisane na stałe, żeby późniejsze zmiany
--    w grafiku nie zmieniały ceny, którą kursant już zobaczył.
-- 3. przypomnienie_o — kiedy wysłano przypomnienie dzień przed jazdą.
-- 4. dojazdy — czasy dojazdu między miejscami (min), osobno w szczycie
--    15-18; wstępnie wyliczone z odległości, instruktor poprawia w panelu.
-- 5. rezerwacje_godziny przestaje być potrzebna: blokada po pełnych
--    godzinach nie pasuje do jazd 13:25-15:25 (zajęłaby 13, 14 i 15).
--    Nakładanie się jazd sprawdza teraz lib/rezerwacje.js w jednej,
--    atomowej instrukcji INSERT.

ALTER TABLE rezerwacje ADD COLUMN start_min INTEGER;
ALTER TABLE rezerwacje ADD COLUMN koniec_min INTEGER;
ALTER TABLE rezerwacje ADD COLUMN miejsce TEXT;
ALTER TABLE rezerwacje ADD COLUMN doplata_h INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rezerwacje ADD COLUMN przypomnienie_o TEXT;

UPDATE rezerwacje SET start_min = godzina_start * 60, koniec_min = godzina_koniec * 60;

CREATE INDEX idx_rezerwacje_dzien ON rezerwacje (data, start_min);

DROP TABLE rezerwacje_godziny;

CREATE TABLE dojazdy (
  z TEXT NOT NULL,
  do_miejsca TEXT NOT NULL,
  normalnie INTEGER NOT NULL CHECK (normalnie BETWEEN 0 AND 30),
  szczyt INTEGER NOT NULL CHECK (szczyt BETWEEN 0 AND 30),
  PRIMARY KEY (z, do_miejsca)
);

-- Wstępne czasy (min): wzór 4,1 + 1,21 x km w linii prostej, w szczycie x1,25,
-- zaokrąglone w górę do 5 min; do 5 km najwyżej 15 min, ogólnie najwyżej 30.
INSERT INTO dojazdy (z, do_miejsca, normalnie, szczyt) VALUES
  ('km', 'zerzen', 10, 15),
  ('km', 'ferio', 10, 10),
  ('km', 'bricoman', 15, 20),
  ('km', 'auchan', 20, 25),
  ('km', 'shell', 20, 25),
  ('km', 'cynamonowa', 20, 25),
  ('km', 'lopuszanska', 25, 30),
  ('km', 'niepodleglosci', 20, 25),
  ('zerzen', 'km', 10, 15),
  ('zerzen', 'ferio', 10, 10),
  ('zerzen', 'bricoman', 15, 15),
  ('zerzen', 'auchan', 20, 20),
  ('zerzen', 'shell', 20, 20),
  ('zerzen', 'cynamonowa', 15, 20),
  ('zerzen', 'lopuszanska', 20, 25),
  ('zerzen', 'niepodleglosci', 20, 25),
  ('ferio', 'km', 10, 10),
  ('ferio', 'zerzen', 10, 10),
  ('ferio', 'bricoman', 15, 20),
  ('ferio', 'auchan', 20, 25),
  ('ferio', 'shell', 20, 25),
  ('ferio', 'cynamonowa', 20, 25),
  ('ferio', 'lopuszanska', 25, 30),
  ('ferio', 'niepodleglosci', 20, 25),
  ('bricoman', 'km', 15, 20),
  ('bricoman', 'zerzen', 15, 15),
  ('bricoman', 'ferio', 15, 20),
  ('bricoman', 'auchan', 15, 15),
  ('bricoman', 'shell', 15, 15),
  ('bricoman', 'cynamonowa', 10, 10),
  ('bricoman', 'lopuszanska', 20, 25),
  ('bricoman', 'niepodleglosci', 20, 20),
  ('auchan', 'km', 20, 25),
  ('auchan', 'zerzen', 20, 20),
  ('auchan', 'ferio', 20, 25),
  ('auchan', 'bricoman', 15, 15),
  ('auchan', 'shell', 10, 15),
  ('auchan', 'cynamonowa', 10, 10),
  ('auchan', 'lopuszanska', 15, 20),
  ('auchan', 'niepodleglosci', 15, 20),
  ('shell', 'km', 20, 25),
  ('shell', 'zerzen', 20, 20),
  ('shell', 'ferio', 20, 25),
  ('shell', 'bricoman', 15, 15),
  ('shell', 'auchan', 10, 15),
  ('shell', 'cynamonowa', 10, 15),
  ('shell', 'lopuszanska', 10, 15),
  ('shell', 'niepodleglosci', 10, 15),
  ('cynamonowa', 'km', 20, 25),
  ('cynamonowa', 'zerzen', 15, 20),
  ('cynamonowa', 'ferio', 20, 25),
  ('cynamonowa', 'bricoman', 10, 10),
  ('cynamonowa', 'auchan', 10, 10),
  ('cynamonowa', 'shell', 10, 15),
  ('cynamonowa', 'lopuszanska', 15, 20),
  ('cynamonowa', 'niepodleglosci', 15, 20),
  ('lopuszanska', 'km', 25, 30),
  ('lopuszanska', 'zerzen', 20, 25),
  ('lopuszanska', 'ferio', 25, 30),
  ('lopuszanska', 'bricoman', 20, 25),
  ('lopuszanska', 'auchan', 15, 20),
  ('lopuszanska', 'shell', 10, 15),
  ('lopuszanska', 'cynamonowa', 15, 20),
  ('lopuszanska', 'niepodleglosci', 10, 15),
  ('niepodleglosci', 'km', 20, 25),
  ('niepodleglosci', 'zerzen', 20, 25),
  ('niepodleglosci', 'ferio', 20, 25),
  ('niepodleglosci', 'bricoman', 20, 20),
  ('niepodleglosci', 'auchan', 15, 20),
  ('niepodleglosci', 'shell', 10, 15),
  ('niepodleglosci', 'cynamonowa', 15, 20),
  ('niepodleglosci', 'lopuszanska', 10, 15);
