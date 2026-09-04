# Jazdy Doszkalające — strona internetowa

Strona-wizytówka z systemem rezerwacji terminów online dla jednoosobowej działalności
instruktora nauki jazdy (jazdy doszkalające, Warszawa Wawer).

## Stack

- Frontend: czysty HTML/CSS/JS (bez frameworka, bez bundlera)
- Backend: Node.js + Express
- Baza danych: SQLite przez wbudowany moduł `node:sqlite` (plikowa, bez
  osobnego serwera, bez kompilacji natywnej — ważne na tym komputerze, bo nie
  ma tu Pythona/Visual Studio Build Tools potrzebnych do skompilowania
  popularnej alternatywy `better-sqlite3`)

**WYMAGANY Node.js 24+** — moduł `node:sqlite` nie istnieje w starszych
wersjach (Node 18 wywala się z błędem `No such built-in module: node:sqlite`).
Wersja jest wymuszona w dwóch miejscach, bo różne systemy hostingowe czytają
różne źródła: `engines.node` w `server/package.json` oraz plik `server/.nvmrc`.

## Jak uruchomić (Etap 1)

```powershell
cd server
npm install
npm run migrate              # tworzy/aktualizuje plik server/data/app.db
npm run set-admin-password   # tylko za pierwszym razem (albo żeby zmienić hasło) — zapisuje .env
npm start
```

Otwórz http://localhost:3000 w przeglądarce.

Do developmentu (serwer sam się restartuje po zapisaniu pliku) użyj:

```powershell
npm run dev
```

`npm run migrate` uruchamia skrypty z `server/src/db/migrations/` w kolejności
numerów — bezpiecznie odpalać wielokrotnie, już zastosowane migracje są
pomijane. Uruchom go ponownie po każdej nowej migracji, którą dodamy.

## Struktura projektu

```
server/     — backend Express (API, baza danych, płatności, e-maile)
public/     — frontend serwowany statycznie przez Express
```

## Wysyłka e-maili (Gmail)

E-maile (potwierdzenie dla klienta, powiadomienie dla admina) wysyłane są
przez Twoje konto Gmail. Potrzebne jest tzw. "hasło aplikacji" — NIE
zwykłe hasło do konta Google (Google nie pozwala logować się zwykłym
hasłem z zewnętrznych programów, to jest zamierzone zabezpieczenie).

**Jak wygenerować hasło aplikacji:**
1. Włącz weryfikację dwuetapową na koncie Google, jeśli jeszcze nie jest
   włączona: https://myaccount.google.com/security
2. Wejdź na https://myaccount.google.com/apppasswords
3. Utwórz nowe hasło aplikacji (nazwa może być dowolna, np. "Jazdy Doszkalające")
4. Google pokaże 16-znakowe hasło (np. `abcd efgh ijkl mnop`) — skopiuj je
   **bez spacji**

**Gdzie je wpisać:** otwórz (albo utwórz, jeśli nie istnieje) plik
`server/.env` i uzupełnij dwie linijki:
```
GMAIL_USER=twoj.adres@gmail.com
GMAIL_APP_PASSWORD=wklejone16znakowehaslo
```
Zapisz plik i zrestartuj serwer (`npm run dev`/`npm start` — jeśli już
działa w trybie `dev`, wystarczy zapisać jakikolwiek plik w `src/`, żeby
się zrestartował, albo zrestartować ręcznie, bo zmiana `.env` sama w sobie
nie jest wykrywana).

## Podłączenie prawdziwej płatności (Autopay)

Kod integracji z Autopay jest gotowy (`server/src/payments/AutopayProvider.js`),
oparty na ich publicznej dokumentacji (https://developers.autopay.pl/online/dokumentacja)
i przetestowany lokalnie na sfabrykowanych, ale poprawnie podpisanych danych —
NIE był jeszcze przetestowany z prawdziwym kontem.

**Żeby go włączyć:**
1. Załóż konto w Autopay i poczekaj na weryfikację (to zewnętrzny proces,
   nie mam na niego wpływu — może wymagać dokumentów dot. działalności
   nierejestrowanej).
2. W panelu Autopay (panel.autopay.pl, zakładka "Sklepy") znajdziesz
   **ID Serwisu (SID)** i **klucz hash** — to dwie wartości do `.env`:
   ```
   PAYMENT_PROVIDER=autopay
   AUTOPAY_SERVICE_ID=twoje_SID
   AUTOPAY_SHARED_KEY=twoj_klucz_hash
   AUTOPAY_ENV=test
   ```
3. W panelu Autopay skonfiguruj adres URL powiadomień (ITN) na:
   `https://TWOJA-DOMENA/api/payments/webhook/autopay` — **to wymaga
   działającej publicznej domeny (Etap 11)**, Autopay nie może wysłać
   powiadomienia na `localhost`. Do testów lokalnych przed Etapem 11
   potrzebne byłoby narzędzie typu ngrok (tunel do localhost) — dam znać,
   jeśli zechcesz to zrobić wcześniej.
4. Zrób jedną prawdziwą płatność testową w środowisku sandbox
   (`AUTOPAY_ENV=test`, bramka `testpay.autopay.eu`) i sprawdźmy razem,
   czy wszystko się zgadza, zanim przełączysz `AUTOPAY_ENV=production`.

## Zdjęcia w galerii

Prawdziwe zdjęcia kursantów w `public/img/galeria/` (Etap 1, uzupełnione później).
Dwa pliki ze źródłowego folderu świadomie pominięto: jedno z czytelnym
imieniem i nazwiskiem kursanta na arkuszu egzaminacyjnym (ryzyko RODO) i
jedno z nieprzyzwoitym gestem. `szkola-jazdy-wawer-nauka-kat-b.jpg` pokazuje
trzymaną kartkę z arkuszem egzaminu — w pełnej rozdzielczości może być
częściowo czytelna, do rozważenia czy zostawić.

## Status

- [x] Etap 0+1: szkielet serwera + statyczna strona główna (Hero, Oferta, Cennik,
      Galeria-placeholder, Grafik-placeholder, Kontakt)
- [x] Etap 2: schemat bazy danych (weekly_template, availability_exceptions,
      bookings, booking_hours) + własny skrypt migracyjny
- [x] Etap 3: API dostępności (GET /api/availability?start=YYYY-MM-DD&days=N)
- [x] Etap 4: panel admina (logowanie hasłem, szablon tygodniowy, kalendarz z szybkim
      klikaniem godzin w stylu Calendesk, wyjątki, podgląd rezerwacji) — http://localhost:3000/panel.html
- [x] Etap 5: kalendarz rezerwacji (rezerwacja.html) + POST /api/bookings z blokadą slotu na 15 min
- [x] Etap 6: warstwa płatności — interfejs PaymentProvider, MockProvider,
      strony /platnosc-mock.html i /rezerwacja-potwierdzona.html, webhook
      finalizujący rezerwację (idempotentny)
- [x] Etap 7: e-maile — EmailProvider + NodemailerGmailProvider, skonfigurowane
      i przetestowane z prawdziwym kontem Gmail
- [x] Etap 8: sprzątanie wygasłych blokad (jobs/releaseExpiredHolds.js,
      uruchamia się co minutę + od razu przy starcie serwera)
- [x] Etap 9: SEO — schema.org (AutoDrivingSchool), Open Graph, canonical,
      robots.txt, sitemap.xml. UWAGA: adres "jazdy-doszkalajace.example"
      to placeholder do podmiany na prawdziwą domenę w Etapie 11
- [x] Etap 10: integracja Autopay — AutopayProvider.js + webhook ITN z
      weryfikacją podpisu, oparte na publicznej dokumentacji Autopay i
      przetestowane lokalnie (hash zgodny z przykładem z dokumentacji,
      symulowane ITN poprawne/sfałszowane). NIE przetestowane z prawdziwym
      kontem — patrz sekcja "Podłączenie prawdziwej płatności" wyżej
- [ ] Etap 11: domena i hosting
