# Do zrobienia przez Ciebie (tylko Ty masz dostęp)

Aktualizowane na bieżąco. Wszystko poniżej to rzeczy, których nie mogę zrobić
za Ciebie: hasła, klucze, zakupy, logowanie do Twoich kont.

## 1. Cloudflare — hasło do panelu na stronie testowej (1 min)
Baza testowa jest już podpięta. Brakuje tylko hasła:
dash.cloudflare.com → Workers & Pages → **jazdy-doszkalajace** → **Settings** →
u góry przełącznik **Preview** → **Variables and secrets** → **Add** →
Type **Secret**, nazwa `ADMIN_HASLO`, wartość: Twoje hasło → **Save**.

Przy okazji (w tym samym miejscu, też **Preview**, też **Secret**):
- `BREVO_API_KEY` — ten sam klucz co na produkcji (Brevo → menu konta →
  SMTP & API → API Keys). Bez niego strona testowa nie wysyła maili — także
  kodów logowania do kont kursantów.

Potem strona testowa: **https://test.jazdy-doszkalajace.pages.dev/admin**

## 2. Przypomnienia e-mail na lajtelka.pl NIE wychodzą (2 min) — ważne
Program przypomnień (Worker) nie ma klucza Brevo. W folderze projektu:

```bash
cd przypomnienia
npx wrangler secret put BREVO_API_KEY
```
i wklej klucz z Brevo. (Nowe przypomnienia 26 h przed jazdą wejdą razem
z etapem SMS — patrz plan; to polecenie warto wykonać od razu.)

## 3. Brevo — domena lajtelka.pl (ok. 10 min, raz)
Żeby maile (i kody logowania) nie trafiały do spamu:
1. app.brevo.com → menu konta → **Senders, Domains & Dedicated IPs** →
   **Domains** → **Add a domain** → `lajtelka.pl`.
2. Wybierz automatyczne uwierzytelnienie przez Cloudflare (jeśli Brevo je
   zaproponuje) albo skopiuj podane wpisy DNS (TXT / CNAME) do Cloudflare:
   dash.cloudflare.com → **lajtelka.pl** → **DNS** → **Records** → **Add record**.
3. Gdy Brevo pokaże „Authenticated”, dodaj nadawcę: **Senders** → **Add a
   sender** → nazwa `LajtELka`, e-mail `powiadomienia@lajtelka.pl`.
4. Daj mi znać — ustawię adres nadawcy w kodzie (zmienna `EMAIL_NADAWCA`).

## 4. Brevo — SMS (ok. 5 min)
1. **Nadawca „LajtELka” dla Polski:** menu konta → **Settings** → **Campaigns**
   → **SMS Sender ID** → **Request Sender ID** → kraj **Poland** → Sender ID
   `LajtELka`, strona `https://lajtelka.pl`, Content type **Transactional**,
   ok. 100 SMS/mies., przykład:
   `Przypomnienie: jazda jutro (czw 23.10) 14:00-16:00, Ferio Wawer. Wez prawo jazdy/Numer PKK. LajtELka, tel. 690 360 164`
2. **Kredyty:** menu konta → **My Plan** → **SMS & WhatsApp messages** →
   najmniejszy pakiet.

## 5. Obejrzyj i zaakceptuj (gdy punkt 1 gotowy)
- Kalendarz w panelu: **https://test.jazdy-doszkalajace.pages.dev/admin**
- Wersja angielska i FAQ: **https://test.jazdy-doszkalajace.pages.dev/en**
- Napisz, co zmienić. Po Twoim „OK” wypuszczę na lajtelka.pl
  (migracje bazy 0009 i 0010 robię ja).

## 6. Przeczytaj regulamin i politykę prywatności (ok. 10 min)
Dopisałem konta, przypomnienia SMS ok. 26 h przed jazdą, samodzielne
odwołanie i pliki cookie sesji (wersja z 20.10.2026). To wersja robocza —
przeczytaj na stronie testowej (`/regulamin`, `/polityka-prywatnosci`),
najlepiej daj do przejrzenia osobie znającej prawo. Data „obowiązuje od”
zmienię na dzień wejścia na lajtelka.pl.

## 7. Konta kursantów — jak sprawdzić na teście
Wymaga punktu 1 (`BREVO_API_KEY` w Preview), bo kod logowania przychodzi
e-mailem. Wejdź na **https://test.jazdy-doszkalajace.pages.dev/konto**, podaj
swój e-mail, wpisz kod, uzupełnij dane. W menu pojawi się „Moje konto”.
W panelu: zakładka **Kursanci**.

Na lajtelka.pl konta są wyłączone, dopóki nie zdecydujesz — włącza je zmienna
`KONTA_WLACZONE=tak` (Production) i zrobię to ja po Twoim „OK”.
