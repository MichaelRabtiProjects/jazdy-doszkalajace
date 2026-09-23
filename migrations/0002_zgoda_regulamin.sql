-- Zapis faktu akceptacji regulaminu przy rezerwacji.
--
-- Wersję trzymamy jako datę wejścia w życie dokumentu, a nie tylko flagę
-- 0/1 — gdy regulamin się zmieni, trzeba wiedzieć, NA CO dokładnie zgodził
-- się dany klient. Bez tego przy sporze nie da się odtworzyć treści, którą
-- widział w momencie rezerwacji.

ALTER TABLE rezerwacje ADD COLUMN zgoda_regulamin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rezerwacje ADD COLUMN wersja_regulaminu TEXT;
