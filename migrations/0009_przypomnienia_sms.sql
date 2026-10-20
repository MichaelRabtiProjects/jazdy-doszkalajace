-- Przypomnienia ok. 26 h przed jazdą — e-mail i SMS śledzone osobno
-- (lib/przypomnienia.js).
--
-- przypomnienie_o (z migracji 0008) znaczy od teraz: wysłano PRZYPOMNIENIE
-- E-MAILEM. SMS ma własny znacznik, żeby błąd jednego kanału nie blokował
-- drugiego.
--
-- Migracja tylko dodaje kolumny — obecny kod strony działa z nią bez zmian,
-- więc można ją wgrać na produkcję przed wdrożeniem nowego kodu.

ALTER TABLE rezerwacje ADD COLUMN mail_proby INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rezerwacje ADD COLUMN sms_przypomnienie_o TEXT;   -- kiedy wysłano SMS
ALTER TABLE rezerwacje ADD COLUMN sms_proby INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rezerwacje ADD COLUMN sms_blad TEXT;              -- ostatni błąd wysyłki (widać w panelu)
-- Kiedy była ostatnia próba — kolejne próby co 10/30/60/120 min, żeby krótka
-- awaria Brevo (albo brak kredytów SMS) nie zużyła wszystkich prób naraz.
ALTER TABLE rezerwacje ADD COLUMN mail_proba_o TEXT;
ALTER TABLE rezerwacje ADD COLUMN sms_proba_o TEXT;
