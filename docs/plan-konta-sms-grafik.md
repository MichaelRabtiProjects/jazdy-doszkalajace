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

### Grafik (wygląd jak Calendesk)
- Kroki: **1 Miejsce → 2 Długość → 3 Termin → 4 Podsumowanie.**
- Termin: **kalendarz miesiąca** (dni bez wolnych terminów szare) + **godziny
  wybranego dnia** w grupach Rano / Popołudnie / Wieczór. Skrót „Najbliższy
  wolny termin”. Na telefonie: kalendarz, a po kliknięciu dnia lista godzin.
- Miejsca jako **kafelki** z ceną (Wawer 160 zł/h, pozostałe 160–175 zł/h),
  znaczek „+15 zł/h” przy godzinach z dopłatą, **pasek z podsumowaniem i ceną**
  na dole z przyciskiem DALEJ.
- **PL i EN od razu** (ekrany, e-maile z kodem, SMS-y).

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
2. **Konta i logowanie kodem** za wyłącznikiem `KONTA_WLACZONE` (domyślnie
   wyłączone), Turnstile, uwierzytelnienie domeny lajtelka.pl w Brevo.
3. **Moje rezerwacje**, odwoływanie przez kursanta, zakładka Kursanci w panelu.
4. **Nowy grafik** w stylu Calendesk + rozmyty grafik dla gości + bramka API.
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
