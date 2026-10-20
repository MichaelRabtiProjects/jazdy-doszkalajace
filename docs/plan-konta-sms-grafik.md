# Plan: konta kursantów, SMS 24 h przed jazdą, grafik w stylu Calendesk

Decyzje właściciela z 20.10.2026. Ten plik jest punktem odniesienia dla każdej
kolejnej sesji pracy nad tymi zmianami — przed zmianą którejś decyzji dopisz
tu nową wersję z datą.

## Decyzje

### Konta i logowanie
- **Logowanie kodem z e-maila** (6 cyfr, ważny 10 min, maks. 5 prób). Ten sam
  ekran służy do rejestracji i logowania. Bez haseł. Sesja ok. 90 dni.
- **Dane przy rejestracji:** e-mail (sprawdzony kodem), imię i nazwisko,
  telefon (bez weryfikacji SMS, kursant może go poprawić w koncie).
- **Gość (bez konta) widzi rozmyty grafik** — sam obrazek, bez prawdziwych
  godzin — i przycisk „Zaloguj się, żeby zobaczyć terminy”. Pod spodem
  przyciski Zadzwoń / WhatsApp. API grafiku i rezerwacji wymaga sesji
  (ukrycie tylko w wyglądzie nie wystarczy).
- **Przy rezerwacji można wpisać inną osobę** (np. rodzic zapisuje dziecko):
  domyślnie dane z konta, ale imię i telefon osoby jadącej można zmienić.
  SMS idzie na numer wpisany przy tej jeździe. Rezerwacja zapisuje się na
  koncie, z którego ją zrobiono.
- **Moje rezerwacje:** nadchodzące i historia, status (wstępna / potwierdzona /
  odrzucona / odwołana), stan zadatku, przycisk „Zadatek wysłany”.
- **Kursant sam odwołuje:** wstępną zawsze, potwierdzoną najpóźniej 24 h przed
  jazdą (jak w regulaminie). Instruktor dostaje e-mail, termin wraca do
  grafiku. Zadatek nadal rozliczany ręcznie. Przełożenie = odwołanie + nowa
  rezerwacja.
- **Wstępna rezerwacja nie wygasa sama** (jak dotąd). Limit 2 wstępnych na osobę.
- **Panel admina — zakładka Kursanci:** lista z wyszukiwaniem, historia jazd
  osoby, Zablokuj, Usuń konto (RODO), wybór kursanta przy ręcznym dodawaniu.

### SMS i przypomnienia
- **Dostawca: Brevo** (to samo konto co e-maile). Właściciel prowadzi
  działalność nierejestrowaną — faktura nie jest potrzebna.
- **Nadawca:** `LajtELka` (zamiast `JazdyDosz`) — wymaga zgłoszenia nazwy
  nadawcy w Brevo dla Polski.
- **Kiedy:** ok. **26 h przed jazdą** (żeby kursant miał jeszcze ok. 2 h na
  bezpłatne odwołanie do 24 h przed).
- **Cisza nocna 22:00–6:00:** gdy moment „26 h przed” wypada w nocy, SMS idzie
  **wcześniej** — poprzedniego wieczoru przed 22:00.
- **Późne potwierdzenie** (jazda potwierdzona później niż 26 h przed):
  SMS **od razu**; jeśli potwierdzenie w nocy — o 6:00.
- **Komu:** **wszystkie potwierdzone jazdy** (także bez otrzymanego zadatku).
- **E-mail z przypomnieniem** wychodzi **razem z SMS-em** (zamiast dotychczasowego
  o 18:00 dzień wcześniej).
- Treść bez polskich znaków, maks. 160 znaków (1 SMS), bez treści reklamowych.
- **Treść SMS (ustalona 20.10.2026):**
  `Przypomnienie: jazda jutro (czw 23.10) 14:00-16:00, Ferio Wawer. Wez prawo jazdy/Numer PKK. LajtELka, tel. 690 360 164`
  — bez terminu odwołania, bez „Michael”; numer zostaje, bo na SMS od nazwy
  nadawcy nie da się odpisać. „jutro” zmienia się na „dziś”/„pojutrze”, gdy
  trzeba. E-mail z przypomnieniem zawiera termin bezpłatnego odwołania.
- **Jedno przypomnienie na jazdę** — po zmianie godziny/miejsca w panelu nowe
  nie wychodzi (o zmianie instruktor informuje sam).
- Nieudana wysyłka: do 5 prób co 10/30/60/120 min, potem ręcznie przyciskiem
  w panelu.

### Grafik (wygląd jak Calendesk)
- Kroki: **1 Miejsce → 2 Długość → 3 Termin → 4 Podsumowanie.**
- Termin: **kalendarz miesiąca** (dni bez wolnych terminów szare) + **godziny
  wybranego dnia** w grupach Rano / Popołudnie / Wieczór. Skrót „Najbliższy
  wolny termin”. Na telefonie: kalendarz, a po kliknięciu dnia lista godzin.
- Miejsca jako **kafelki** z ceną (Wawer 160 zł/h, pozostałe 160–175 zł/h),
  znaczek „+15 zł/h” przy godzinach z dopłatą, **pasek z podsumowaniem i ceną**
  na dole z przyciskiem DALEJ.
- **PL i EN od razu** (ekrany, e-maile z kodem, SMS-y).

### Kalendarz w panelu admina (decyzje z 20.10.2026, po zrzutach z Calendesk)
- **Widok tygodnia z osią godzin jak w panelu Calendesk** (Dzień / Tydzień /
  Miesiąc, „Dziś”, strzałki, linia „teraz”) — **tylko dla instruktora**.
  Kursanci wybierają termin w ustalonym układzie (kalendarz miesiąca + godziny).
- **Wygląd panelu:** ciemny, ale nie za ciemny — dobry kontrast, nie razi
  w oczy; kolorystyka marki LajtELka (bursztyn + grafit).
- **Funkcje:** klik w jazdę → szczegóły i akcje (potwierdź, odrzuć, zadatek,
  zmiana godziny/miejsca, notatka, telefon/SMS/WhatsApp); **blokada kalendarza**
  (zablokowane godziny znikają z grafiku kursantów — nie da się na nie zapisać);
  **„Nowa rezerwacja” jak w Calendesku**; **przeciąganie jazdy** na inną
  godzinę/dzień.
- **Kolejność:** kalendarz w panelu PRZED kontami (konta czekają na
  potwierdzenie domeny lajtelka.pl w Brevo).

### Nadawca e-maili, przycisk konta, stare rezerwacje (20.10.2026)
- Maile (w tym kody logowania) z domeny **lajtelka.pl** (np.
  powiadomienia@lajtelka.pl), odpowiedzi na Gmail instruktora — wymaga
  potwierdzenia domeny w Brevo (wpisy DNS w Cloudflare).
- **„Zaloguj się” / „Moje konto” w menu na każdej stronie** + logowanie
  w miejscu grafiku.
- **Dawne rezerwacje podpinane do konta po e-mailu** (po zalogowaniu kodem).

### Testowanie i wdrażanie
- **Etapami na adresie testowym** z osobną, pustą bazą testową. Na lajtelka.pl
  każda część trafia dopiero po akceptacji właściciela.
- Gałąź testowa: `test` → adres `https://test.jazdy-doszkalajace.pages.dev`
  (przekierowanie 301 na lajtelka.pl go nie obejmuje).
- Baza testowa: `jazdy-doszkalajace-db-test` (bez danych klientów), podpięta
  jako `DB` w środowisku Preview projektu Pages.
- Commit `f40288a` (wersja /en, FAQ, Jazdy po przerwie) — najpierw pokazać na
  teście, na lajtelka.pl po akceptacji.

## Etapy

0. **Środowisko testowe** — baza testowa, podpięcie pod Preview, gałąź `test`,
   sprawdzenie, czy przypomnienia e-mail dziś wychodzą.
1. **SMS ok. 26 h przed** (niezależne od kont, można wypuścić pierwsze):
   Worker co 10 min, nowe kolumny w bazie, nadawca LajtELka, znaczek „SMS
   wysłany” w panelu, polityka prywatności.
1b. **Kalendarz w panelu admina** (tydzień jak Calendesk, blokady, nowa
   rezerwacja, przeciąganie) — przed kontami. **Zrobione na gałęzi `test`
   (20.10.2026)**, migracja `0010_blokady.sql`.
2. **Konta i logowanie kodem** — **backend zrobiony 20.10.2026** (migracja 0011,
   lib/konto.js, functions/api/konto/*, testy/konto.test.mjs; konta włączone
   automatycznie na gałęziach ≠ master); strona /konto w toku. Turnstile — później.
   Konta i logowanie kodem za wyłącznikiem `KONTA_WLACZONE` (domyślnie
   wyłączone), Turnstile, uwierzytelnienie domeny lajtelka.pl w Brevo.
3. **Moje rezerwacje**, odwoływanie przez kursanta, zakładka Kursanci w panelu.
4. **Nowy grafik** w stylu Calendesk + rozmyty grafik dla gości + bramka API.
   **Zrobione na gałęzi `test` (20.10.2026):** `static/js/grafik.js` (kroki,
   kalendarz miesiąca, pasek z DALEJ, podsumowanie w karcie, „Jedzie inna
   osoba”), bramka w `/api/dostepnosc` i POST `/api/rezerwacja` (401
   BRAK_SESJI / 409 PROFIL; e-mail rezerwacji = e-mail konta),
   testy `testy/grafik-bramka.test.mjs`.
5. **Regulamin i polityka prywatności** (konta, SMS, retencja), FAQ, wersja EN.
6. **Uruchomienie na lajtelka.pl:** kopia bazy, merge, włączenie wyłącznika,
   usunięcie starych wdrożeń (stare adresy `<hash>.jazdy-doszkalajace.pages.dev`
   pozwalałyby rezerwować bez logowania).

## Do pamiętania
- Worker przypomnień (`przypomnienia/`) **nie** publikuje się z gita — po
  każdej zmianie w `lib/` trzeba go wdrożyć ręcznie (`npx wrangler deploy`).
- Lekcje na stronie: 2, 3 lub 4 h (`lib/dostepnosc.js`, `DLUGOSCI`).
- Dane rezerwacji kasują się 180 dni po jeździe — historia w koncie sięga pół
  roku, chyba że zmienimy politykę prywatności.

## Lista kontrolna: kalendarz w panelu na lajtelka.pl
1. Akceptacja właściciela na `test.jazdy-doszkalajace.pages.dev/admin`.
2. Migracja `0010_blokady.sql` na bazę produkcyjną (`--remote`) — PRZED merge
   (razem z `0009`, jeśli SMS wchodzi w tym samym wdrożeniu).
3. Merge `test` → `master`.

## Lista kontrolna: etap 1 (SMS) na lajtelka.pl
1. Brevo: zatwierdzony nadawca `LajtELka` dla Polski + kupione kredyty SMS.
2. Test na `test.jazdy-doszkalajace.pages.dev`: SMS tylko na numer instruktora
   (`SMS_TYLKO_NUMERY`), sprawdzić nadawcę i treść na telefonie.
3. Migracja `0009` na bazę produkcyjną (`--remote`) — PRZED merge.
4. W polityce prywatności zmienić datę „Wersja z dnia / obowiązuje od”.
5. Merge `test` → `master` (strona publikuje się sama).
6. Worker: `npx wrangler secret put BREVO_API_KEY` (brakuje go od początku!),
   `SMS_WLACZONE: "tak"` w `przypomnienia/wrangler.jsonc`, `npx wrangler deploy`.
7. Pages Production: `SMS_WLACZONE=tak` (żeby panel też wysyłał SMS-y).
8. Przez pierwsze dni: znaczki „SMS wysłany” w panelu, logi Workera.
