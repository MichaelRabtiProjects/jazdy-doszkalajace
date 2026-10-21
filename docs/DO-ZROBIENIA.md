# Do zrobienia przez Ciebie (tylko Ty masz dostęp)

Aktualizowane na bieżąco. Wszystko poniżej to rzeczy, których nie mogę zrobić
za Ciebie: hasła, klucze, zakupy, logowanie do Twoich kont.

**21.10.2026 — na lajtelka.pl działają już:** konta kursantów (logowanie kodem
z e-maila), nowy grafik, kalendarz w panelu, przypomnienia e-mail ok. 26 h
przed jazdą, nowe FAQ, zdjęcia i film. Zrobione też: hasło i klucz Brevo na
stronie testowej, klucz Brevo w programie przypomnień.

## 1. Brevo — SMS (żeby przypomnienia SMS ruszyły)
1. **Nadawca „LajtELka” dla Polski:** Settings → SMS Sender ID → kraj
   **Poland**, Sender ID `LajtELka`, strona `https://lajtelka.pl`, typ
   **Transactional**, ok. 100 SMS/mies., przykład:
   `Przypomnienie: jazda jutro (czw 23.10) 14:00-16:00, Ferio Wawer. Wez prawo jazdy/Numer PKK. LajtELka, tel. 690 360 164`
2. **Kredyty:** My Plan → SMS → najmniejszy pakiet (przedpłata).
3. Napisz mi, gdy Brevo zatwierdzi nazwę — włączę SMS-y (`SMS_WLACZONE`).

## 2. Brevo — domena lajtelka.pl (ok. 10 min, raz)
Żeby maile (i kody logowania) nie trafiały do spamu:
1. app.brevo.com → Senders, Domains & Dedicated IPs → **Domains** →
   **Add a domain** → `lajtelka.pl` (najlepiej automatycznie przez Cloudflare).
2. Gdy pokaże „Authenticated”: **Senders** → **Add a sender** → `LajtELka`,
   `powiadomienia@lajtelka.pl`.
3. Daj mi znać — ustawię adres nadawcy (`EMAIL_NADAWCA`).

## 3. Przeczytaj regulamin i politykę prywatności (ok. 10 min)
Dopisane: konta, przypomnienia SMS ok. 26 h przed jazdą, samodzielne
odwołanie, pliki cookie sesji (obowiązują od 21.10.2026). Najlepiej daj do
przejrzenia osobie znającej prawo: https://lajtelka.pl/regulamin,
https://lajtelka.pl/polityka-prywatnosci

## Awaryjnie
- Grafik bez logowania (jak dawniej): Cloudflare → jazdy-doszkalajace →
  Settings → Production → zmienna `KONTA_WLACZONE` = `nie`, potem nowa
  publikacja.
- Kopia bazy sprzed zmian z 21.10.2026 (bookmark Time Travel):
  `000000e5-00000000-0000510b-1204a5a3132a72715671fe63335d4862`
