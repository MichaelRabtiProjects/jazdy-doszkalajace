/* Grafik wolnych terminów + wstępna rezerwacja — w 4 krokach, jak w widżecie
   Calendesk (decyzje właściciela: docs/plan-konta-sms-grafik.md):

     1 Miejsce spotkania → 2 Długość jazdy → 3 Termin → 4 Podsumowanie

   Miejsce musi być pierwsze, bo od niego zależą godziny (czas dojazdu
   instruktora między jazdami) i cena (+15 zł/h, gdy trzeba dojechać
   z dalszego miejsca). Wszystko to liczy serwer (/api/dostepnosc) — tutaj
   niczego nie wyliczamy sami, tylko pokazujemy.

   Termin po wysłaniu formularza zajmuje się jako "wstępna rezerwacja — czeka
   na potwierdzenie", a instruktor potwierdza go albo odrzuca w panelu.
   Zamiast formularza można nadal napisać SMS / WhatsApp / e-mail.

   Konta kursantów: gdy serwer odpowiada na /api/konto/ja (konta włączone),
   gość widzi tylko rozmyty obrazek grafiku i zaproszenie do logowania —
   serwer i tak nie poda mu terminów (401). Gdy konta są wyłączone (404
   KONTA_WYLACZONE, produkcja) albo /api/konto/ja nie odpowiada, grafik
   działa jak dawniej: dla każdego, z imieniem, telefonem i e-mailem
   w formularzu.

   Całą kartę rysuje rysuj() od nowa przy każdej zmianie (stan → HTML);
   kliknięcia obsługuje jeden nasłuch na karcie (data-akcja).

   Wersja z płatnością online (Autopay) jest zachowana w tagu `autopay-wersja`. */

(function () {
  'use strict';

  var TELEFON = '+48690360164';
  var TELEFON_ZAPIS = '690 360 164';
  /* wa.me wymaga samych cyfr, bez znaku '+' i bez spacji */
  var TELEFON_WA = '48690360164';
  var EMAIL = 'michaelrabti@gmail.com';
  /* Strona logowania; ?powrot=grafik — po zalogowaniu js/konto.js wraca tutaj */
  var KONTO_URL = 'konto.html?powrot=grafik';
  /* Ostatnio wybrane miejsce spotkania (tylko wygoda — brak zapisu niczego nie psuje) */
  var KLUCZ_MIEJSCA = 'jd_miejsce';
  /* Od tej szerokości kalendarz i godziny stoją obok siebie (jak w style.css) */
  var SZEROKI = window.matchMedia ? window.matchMedia('(min-width: 760px)') : null;
  var MALO_RUCHU = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  /* ------------------------------------------------------------------ */
  /* Dwujęzyczność — cała treść tej sekcji jest generowana w JS, więc nie */
  /* da się jej przetłumaczyć przez zwykłe data-i18n z i18n.js. Sprawdzamy */
  /* język tak samo jak reszta strony (window.jdJezyk z i18n.js) i po      */
  /* zdarzeniu 'jd:jezyk' rysujemy kartę od nowa.                          */
  /* ------------------------------------------------------------------ */

  function jezyk() {
    return typeof window.jdJezyk === 'function' ? window.jdJezyk() : 'pl';
  }

  var TXT = {
    wczytywanie: { pl: 'Wczytywanie wolnych terminów…', en: 'Loading available times…' },
    grafikNiedostepny: { pl: 'Grafik jest chwilowo niedostępny.', en: 'The schedule is temporarily unavailable.' },
    sprobujPonownie: { pl: 'Spróbuj ponownie', en: 'Try again' },
    zadzwonPrefiks: { pl: 'Zadzwoń: ', en: 'Call: ' },

    /* --- Kroki --- */
    krokiAria: { pl: 'Kroki rezerwacji', en: 'Booking steps' },
    krok1: { pl: 'Miejsce spotkania', en: 'Meeting point' },
    krok2: { pl: 'Długość jazdy', en: 'Lesson length' },
    krok3: { pl: 'Termin', en: 'Date & time' },
    krok4: { pl: 'Podsumowanie', en: 'Summary' },
    krokNr: {
      pl: function (n) { return 'Krok ' + n + ' z 4: '; },
      en: function (n) { return 'Step ' + n + ' of 4: '; },
    },
    krokZmien: { pl: ' (zmień)', en: ' (change)' },

    /* --- Pasek z podsumowaniem --- */
    pasekAria: { pl: 'Twój wybór', en: 'Your selection' },
    pasekPusty: { pl: 'Wybierz miejsce spotkania', en: 'Choose a meeting point' },
    dalej: { pl: 'Dalej', en: 'Next' },
    od: { pl: 'od ', en: 'from ' },
    wybrano: { pl: 'Wybrano: ', en: 'Selected: ' },

    /* --- Krok 1: miejsce --- */
    tytul1: { pl: 'Gdzie się spotykamy?', en: 'Where shall we meet?' },
    podtytul1: {
      pl: 'Od miejsca spotkania zależą wolne godziny i cena.',
      en: 'The available times and the price depend on the meeting point.',
    },
    grupaWawer: { pl: 'Wawer', en: 'Wawer' },
    grupaDalej: { pl: 'Pozostałe', en: 'Other points' },
    zaGodzine: { pl: ' zł/h', en: ' zł/h' },
    infoDalej: {
      pl: function (stawka, doplata) {
        return 'W pozostałych miejscach godziny oznaczone „+' + doplata + ' zł/h” kosztują ' + (stawka + doplata) +
          ' zł/h — muszę tam dojechać z dalszego miejsca. Bez dopłaty (' + stawka +
          ' zł/h) są godziny, kiedy tego dnia i tak jestem w pobliżu.';
      },
      en: function (stawka, doplata) {
        return 'At the other points, times marked “+' + doplata + ' zł/h” cost ' + (stawka + doplata) +
          ' zł/h — I have to drive there from further away. Times without a surcharge (' + stawka +
          ' zł/h) are when I’m already nearby that day.';
      },
    },

    /* --- Krok 2: długość --- */
    tytul2: { pl: 'Jak długa jazda?', en: 'How long a lesson?' },
    godzinyOpis: {
      pl: function (h) { return h + ' godziny'; },
      en: function (h) { return h + ' hours'; },
    },
    brakWHoryzoncie: { pl: 'brak wolnych terminów', en: 'no available times' },

    /* --- Krok 3: termin --- */
    tytul3: { pl: 'Wybierz dzień i godzinę', en: 'Pick a day and time' },
    najblizszy: { pl: 'Najbliższy wolny termin: ', en: 'Next available: ' },
    brakWszystkich: {
      pl: function (h) {
        return 'Brak wolnych terminów na ' + h + ' h w tym miejscu w najbliższych tygodniach — spróbuj krótszej jazdy, innego miejsca albo napisz do mnie.';
      },
      en: function (h) {
        return 'No available times for ' + h + ' h at this meeting point in the coming weeks — try a shorter lesson, another meeting point, or message me.';
      },
    },
    poprzedniMiesiac: { pl: 'Poprzedni miesiąc', en: 'Previous month' },
    nastepnyMiesiac: { pl: 'Następny miesiąc', en: 'Next month' },
    labelDzis: { pl: ', dziś', en: ', today' },
    labelZamkniete: { pl: ', nie pracuję — napisz lub zadzwoń', en: ', not working — message or call me' },
    labelBrak: { pl: ', brak terminów', en: ', no available times' },
    labelWolne: {
      pl: function (n) { return ', wolne terminy: ' + n; },
      en: function (n) { return ', available times: ' + n; },
    },
    wybierzDzien: { pl: 'Wybierz dzień w kalendarzu.', en: 'Choose a day in the calendar.' },
    wrocKalendarz: { pl: 'Kalendarz', en: 'Calendar' },
    rano: { pl: 'Rano', en: 'Morning' },
    popoludnie: { pl: 'Popołudnie', en: 'Afternoon' },
    wieczor: { pl: 'Wieczór', en: 'Evening' },
    brakTerminow: { pl: 'Brak wolnych terminów tego dnia.', en: 'No available times on this day.' },
    dzisInfo: {
      pl: 'Na dziś nie da się już zarezerwować przez stronę — najwcześniej na jutro. W pilnej sprawie zadzwoń: ',
      en: 'Today can’t be booked online any more — tomorrow at the earliest. If it’s urgent, call: ',
    },
    dzienOgloszenie: {
      pl: function (opis, n) { return opis + (n ? ': wolne godziny: ' + n : ': brak wolnych godzin'); },
      en: function (opis, n) { return opis + (n ? ': available times: ' + n : ': no available times'); },
    },
    terminAria: { pl: 'Termin ', en: 'Time slot ' },
    doplataAria: {
      pl: function (zl) { return ', dopłata ' + zl + ' zł za godzinę'; },
      en: function (zl) { return ', ' + zl + ' zł per hour surcharge'; },
    },
    legendaDoplata: {
      pl: function (stawka, doplata) {
        return '„+' + doplata + ' zł/h” — ' + (stawka + doplata) + ' zł/h, bo dojeżdżam z dalszego miejsca. Chcesz taniej? Wybierz miejsce w Wawrze albo bliżej innej jazdy tego dnia.';
      },
      en: function (stawka, doplata) {
        return '“+' + doplata + ' zł/h” — ' + (stawka + doplata) + ' zł/h, because I’m driving over from further away. Want it cheaper? Choose a Wawer meeting point or one closer to another lesson that day.';
      },
    },
    wstepnaEtykieta: { pl: 'wstępna', en: 'provisional' },
    wstepnaLegenda: {
      pl: 'Przekreślone „wstępna” — termin wstępnie zarezerwowany przez kogoś innego, czeka na potwierdzenie instruktora.',
      en: 'Crossed out “provisional” — someone else’s provisional booking, waiting for the instructor to confirm.',
    },
    wstepnaAria: {
      pl: ': wstępna rezerwacja, czeka na potwierdzenie',
      en: ': provisional booking, waiting for confirmation',
    },

    /* --- Dzień, w którym nie pracuję --- */
    kontaktZachetaTekst: {
      pl: 'O terminy pytaj e-mailem, SMS-em lub przez WhatsApp — odpiszę, jak tylko będę mógł. ' +
        'Telefonicznie tylko w ostateczności, bo mogę akurat prowadzić jazdę.',
      en: 'For availability, message me by e-mail, SMS or WhatsApp — I’ll reply as soon as I can. ' +
        'Phone only as a last resort, since I might be teaching a lesson.',
    },
    przyciskEmail: { pl: 'E-mail', en: 'E-mail' },
    przyciskSms: { pl: 'SMS', en: 'SMS' },
    przyciskWhatsapp: { pl: 'WhatsApp', en: 'WhatsApp' },
    przyciskTelefon: { pl: 'Telefon', en: 'Phone' },
    zadzwon: { pl: 'Zadzwoń', en: 'Call' },

    /* --- Krok 4: podsumowanie i formularz --- */
    tytul4: { pl: 'Podsumowanie', en: 'Summary' },
    dtMiejsce: { pl: 'Miejsce spotkania', en: 'Meeting point' },
    dtTermin: { pl: 'Termin', en: 'Date & time' },
    cenaZaGodzine: { pl: 'Cena za godzinę', en: 'Price per hour' },
    cenaDojazd: {
      pl: function (zl) { return ' (w tym ' + zl + ' zł/h za dojazd)'; },
      en: function (zl) { return ' (incl. ' + zl + ' zł/h travel surcharge)'; },
    },
    razem: {
      pl: function (h) { return 'Razem za ' + h + ' h'; },
      en: function (h) { return 'Total for ' + h + ' h'; },
    },
    zadatekBlik: { pl: 'Zadatek BLIK-iem na nr ', en: 'Deposit via BLIK (Polish mobile payment) to ' },
    zadatekPrzelew: { pl: ' — na życzenie możliwy zwykły przelew', en: ' — a bank transfer is available on request' },
    resztaGotowka: { pl: 'Reszta — przed lub po jeździe', en: 'The rest — before or after the lesson' },
    kontoJako: { pl: 'Rezerwujesz jako', en: 'Booking as' },
    kontoEmailInfo: {
      pl: 'Potwierdzenie przyjdzie na adres e-mail konta.',
      en: 'The confirmation will be sent to your account e-mail.',
    },
    innaOsoba: { pl: 'Jedzie inna osoba', en: 'Someone else is driving' },
    innaOsobaInfo: {
      pl: 'Podaj dane osoby, która pojedzie — SMS z przypomnieniem przyjdzie na jej numer. Rezerwacja zapisze się na Twoim koncie.',
      en: 'Enter the details of the person who will drive — the text reminder goes to their number. The booking is saved in your account.',
    },
    kierowcaImie: { pl: 'Imię i nazwisko osoby jadącej', en: 'Driver’s first and last name' },
    kierowcaTelefon: { pl: 'Telefon osoby jadącej', en: 'Driver’s phone' },
    formImie: { pl: 'Imię i nazwisko', en: 'First and last name' },
    formTelefon: { pl: 'Telefon', en: 'Phone' },
    formTelefonSms: {
      pl: 'Na ten numer przyjdzie SMS z przypomnieniem ok. 26 h przed jazdą.',
      en: 'You’ll get a text reminder at this number about 26 hours before the lesson.',
    },
    formEmail: { pl: 'E-mail', en: 'E-mail' },
    formZgoda: {
      pl: 'Akceptuję <a href="regulamin.html" target="_blank" rel="noopener">Regulamin</a> ' +
        'i <a href="polityka-prywatnosci.html" target="_blank" rel="noopener">Politykę prywatności</a>.',
      en: 'I accept the <a href="regulamin.html" target="_blank" rel="noopener">Terms of Service</a> ' +
        'and the <a href="polityka-prywatnosci.html" target="_blank" rel="noopener">Privacy Policy</a>.',
    },
    formWyslij: { pl: 'Wyślij wstępną rezerwację', en: 'Send provisional booking' },
    formWysylanie: { pl: 'Wysyłanie…', en: 'Sending…' },
    formBrakZgody: {
      pl: 'Zaakceptuj Regulamin i Politykę prywatności.',
      en: 'Please accept the Terms of Service and Privacy Policy.',
    },
    formBrakPolaczenia: {
      pl: 'Brak połączenia z serwerem. Spróbuj ponownie albo napisz SMS / WhatsApp.',
      en: 'Couldn’t reach the server. Please try again or send an SMS / WhatsApp message.',
    },
    formBladOgolny: {
      pl: 'Nie udało się wysłać rezerwacji. Spróbuj ponownie.',
      en: 'The booking couldn’t be sent. Please try again.',
    },
    terminDrobne: {
      pl: 'Po wysłaniu formularza termin jest wstępnie zarezerwowany dla Ciebie. Potwierdzę go albo odezwę się, żeby ustalić szczegóły. Zadatek potwierdza rezerwację.',
      en: 'Once you send the form, the time is provisionally reserved for you. I’ll confirm it or get in touch to sort out the details. The deposit confirms the booking.',
    },
    zmienTermin: { pl: 'Zmień termin', en: 'Change the time' },
    terminZniknal: {
      pl: 'Wybrany termin nie jest już dostępny — wybierz inny.',
      en: 'The chosen time is no longer available — please pick another.',
    },
    alternatywa: { pl: 'Wolisz napisać albo zadzwonić?', en: 'Prefer to message or call?' },
    miejsceEtykieta: { pl: 'Miejsce: ', en: 'Meeting point: ' },

    /* --- Po wysłaniu --- */
    sukcesTytul: { pl: 'Rezerwacja wstępna przyjęta', en: 'Provisional booking received' },
    sukcesTekst: {
      pl: 'Termin jest wstępnie zarezerwowany dla Ciebie — czekaj na potwierdzenie lub kontakt od instruktora.',
      en: 'The time is provisionally reserved for you — please wait for confirmation or for the instructor to contact you.',
    },
    sukcesEmail: { pl: 'Szczegóły wysłałem na adres ', en: 'I’ve sent the details to ' },
    sukcesEmailSpam: {
      pl: ' — jeśli maila nie ma, zajrzyj do folderu spam.',
      en: ' — if you can’t see the e-mail, check your spam folder.',
    },
    sukcesBezEmaila: {
      pl: 'Zapisz kod rezerwacji — potwierdzę termin SMS-em albo telefonicznie.',
      en: 'Please note your booking code — I’ll confirm the time by text or phone.',
    },
    kodLabel: { pl: 'Kod rezerwacji', en: 'Booking code' },
    zadatekKrok: {
      pl: 'Zadatek możesz wysłać BLIK-iem na numer 690 360 164 — w tytule wpisz kod rezerwacji. Po wysłaniu kliknij przycisk poniżej.',
      en: 'You can send the deposit via BLIK (Polish mobile payment) to 690 360 164 — put the booking code in the title; a bank transfer is available on request. Once sent, click the button below.',
    },
    przyciskZadatek: { pl: 'Zadatek wysłany', en: 'Deposit sent' },
    zadatekDzieki: {
      pl: 'Dziękuję! Sprawdzę wpłatę i dam znać.',
      en: 'Thank you! I’ll check the payment and let you know.',
    },
    szczegolyRezerwacji: { pl: 'Szczegóły rezerwacji', en: 'Booking details' },
    mojeRezerwacje: { pl: 'Moje rezerwacje', en: 'My bookings' },
    kolejna: { pl: 'Zarezerwuj kolejną jazdę', en: 'Book another lesson' },

    /* --- Konta: gość i niepełny profil --- */
    goscTytul: {
      pl: 'Zaloguj się albo załóż konto, żeby zobaczyć wolne terminy',
      en: 'Sign in or create an account to see available times',
    },
    goscTekst: {
      pl: 'Wystarczy e-mail — dostaniesz 6-cyfrowy kod, bez haseł. Potem rezerwujesz jazdę w kilka kliknięć, a swoje rezerwacje masz w jednym miejscu.',
      en: 'All you need is your e-mail — you’ll get a 6-digit code, no passwords. Then booking takes a few clicks and all your bookings are in one place.',
    },
    goscPrzycisk: { pl: 'Zaloguj się / załóż konto', en: 'Sign in / create an account' },
    profilTytul: {
      pl: 'Uzupełnij dane w koncie, żeby zobaczyć wolne terminy',
      en: 'Complete your account details to see available times',
    },
    profilTekst: {
      pl: 'Brakuje imienia i nazwiska albo telefonu — podasz je raz, przy kolejnych rezerwacjach już nie trzeba.',
      en: 'Your name or phone number is missing — you enter them once and won’t need to again.',
    },
    profilPrzycisk: { pl: 'Uzupełnij dane', en: 'Complete details' },
    zaslonaKontakt: { pl: 'Wolisz zadzwonić albo napisać?', en: 'Prefer to call or message?' },
  };

  function t(klucz) {
    var wpis = TXT[klucz];
    return wpis[jezyk()] || wpis.pl;
  }

  var widget = document.getElementById('grafik-widget');
  if (!widget) return;

  // Karta rysowana od nowa przy każdej zmianie + stały (nieprzerysowywany)
  // komunikat dla czytników ekranu — nowo wstawione regiony aria-live
  // często nie są odczytywane, więc ten musi trwać.
  widget.innerHTML =
    '<div id="gk-karta"><p class="gk-komunikat">' + TXT.wczytywanie[jezyk()] + '</p></div>' +
    '<p class="visually-hidden" id="gk-ogloszenie" aria-live="polite"></p>';
  var karta = document.getElementById('gk-karta');
  var ogloszenie = document.getElementById('gk-ogloszenie');

  var stan = {
    // 'ladowanie' | 'gosc' (konta włączone, niezalogowany) | 'profil'
    // (zalogowany, brak danych) | 'grafik' | 'blad'
    dostep: 'ladowanie',
    konto: null, // zalogowane konto (tylko gdy konta są włączone)
    dane: null, // ostatnia odpowiedź /api/dostepnosc
    wczytywanie: false,
    nrZapytania: 0,
    krok: 1, // 1–4, a 5 = rezerwacja wysłana
    miejsce: zapamietaneMiejsce(),
    dlugosc: null,
    wybranaData: null, // 'YYYY-MM-DD' dnia pokazanego w liście godzin
    miesiac: null, // 'YYYY-MM' miesiąca w kalendarzu
    wybrany: null, // { data, start, doplata } — wybrany termin
    godzinyNaTelefonie: false, // telefon: lista godzin zamiast kalendarza
    komunikat: '', // np. "termin właśnie został zajęty" po powrocie do kroku 3
    formularz: null, // wpisane dane z kroku 4 (żeby przerysowanie ich nie skasowało)
    wysylanie: false,
    rezerwacja: null, // odpowiedź serwera po udanej rezerwacji
    emailRezerwacji: '',
    zadatek: '', // '' | 'wysylanie' | 'wyslany' | 'blad'
  };

  /* ------------------------------------------------------------------ */
  /* Pomocnicze                                                          */
  /* ------------------------------------------------------------------ */

  /** Tekst do wstawienia w HTML — dane z konta wpisał użytkownik. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function dwieCyfry(n) {
    return String(n).padStart(2, '0');
  }

  /** 805 → '13:25' */
  function godz(minuty) {
    return dwieCyfry(Math.floor(minuty / 60)) + ':' + dwieCyfry(minuty % 60);
  }

  /** '2026-09-22' → '22.09' */
  function krotkaData(data) {
    var cz = data.split('-');
    return cz[2] + '.' + cz[1];
  }

  /* Daty jako 'YYYY-MM-DD' liczone w UTC — bez przesunięć przy zmianie czasu. */
  function dataUTC(data) {
    var cz = data.split('-').map(Number);
    return new Date(Date.UTC(cz[0], cz[1] - 1, cz[2] || 1));
  }

  function dodajDni(data, ile) {
    var d = dataUTC(data);
    d.setUTCDate(d.getUTCDate() + ile);
    return d.toISOString().slice(0, 10);
  }

  function dzienTygodnia(data) {
    return dataUTC(data).getUTCDay();
  }

  /** '2026-10' → 31 */
  function dniWMiesiacu(miesiac) {
    var cz = miesiac.split('-').map(Number);
    return new Date(Date.UTC(cz[0], cz[1], 0)).getUTCDate();
  }

  function dodajMiesiac(miesiac, ile) {
    var cz = miesiac.split('-').map(Number);
    return new Date(Date.UTC(cz[0], cz[1] - 1 + ile, 1)).toISOString().slice(0, 7);
  }

  /* Nazwy dni i miesięcy liczymy z daty (backend podaje nazwę dnia tylko po polsku). */
  var NAZWY = {
    pl: {
      dni: ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'],
      dniKrotkie: ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'],
      naglowek: ['PN', 'WT', 'ŚR', 'CZ', 'PT', 'SO', 'ND'],
      miesiace: ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień',
        'Październik', 'Listopad', 'Grudzień'],
      miesiaceDop: ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września',
        'października', 'listopada', 'grudnia'],
    },
    en: {
      dni: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      dniKrotkie: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      naglowek: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
      miesiace: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
        'October', 'November', 'December'],
      miesiaceDop: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
        'October', 'November', 'December'],
    },
  };

  function nazwy() {
    return NAZWY[jezyk()] || NAZWY.pl;
  }

  /** 'wt 21.10, 10:00' */
  function terminKrotko(data, start) {
    return nazwy().dniKrotkie[dzienTygodnia(data)] + ' ' + krotkaData(data) + ', ' + godz(start);
  }

  /** 'wt 21.10, 10:00–12:00' */
  function terminZakres(data, start, dlugosc) {
    return terminKrotko(data, start) + '–' + godz(start + dlugosc * 60);
  }

  /** 'wtorek, 21 października' / 'Tuesday, 21 October' */
  function dlugaData(data) {
    var cz = data.split('-').map(Number);
    return nazwy().dni[dzienTygodnia(data)] + ', ' + cz[2] + ' ' + nazwy().miesiaceDop[cz[1] - 1];
  }

  /** '2026-10' → 'Październik 2026' */
  function nazwaMiesiaca(miesiac) {
    var cz = miesiac.split('-').map(Number);
    return nazwy().miesiace[cz[1] - 1] + ' ' + cz[0];
  }

  function zapamietaneMiejsce() {
    try {
      return window.localStorage.getItem(KLUCZ_MIEJSCA) || '';
    } catch (e) {
      return '';
    }
  }

  function zapamietajMiejsce(id) {
    try {
      if (id) window.localStorage.setItem(KLUCZ_MIEJSCA, id);
      else window.localStorage.removeItem(KLUCZ_MIEJSCA);
    } catch (e) {
      // Prywatne okno / zablokowany localStorage — następnym razem wybór od nowa
    }
  }

  function szeroki() {
    return SZEROKI ? SZEROKI.matches : true;
  }

  function miejsceWgId(id) {
    var lista = stan.dane ? stan.dane.miejsca : [];
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }

  function nazwaMiejsca(m) {
    return m ? (jezyk() === 'en' ? m.nazwa_en : m.nazwa) : '';
  }

  /** Czy wczytane dane dotyczą wybranego miejsca (godziny zależą od miejsca). */
  function daneMiejsca() {
    return Boolean(stan.dane && stan.miejsce && stan.dane.miejsce === stan.miejsce && !stan.wczytywanie);
  }

  function dzienWgDaty(data) {
    var dni = stan.dane ? stan.dane.dni : [];
    for (var i = 0; i < dni.length; i++) if (dni[i].data === data) return dni[i];
    return null;
  }

  function terminyDnia(dzien, dlugosc) {
    return (dzien && dzien.terminy && dzien.terminy[dlugosc || stan.dlugosc]) || [];
  }

  /** Pierwszy wolny termin w horyzoncie dla wybranej długości. */
  function najblizszyTermin() {
    var dni = stan.dane.dni;
    for (var i = 0; i < dni.length; i++) {
      var lista = terminyDnia(dni[i]);
      if (lista.length) return { dzien: dni[i], termin: lista[0] };
    }
    return null;
  }

  function stawka() {
    return stan.dane.stawka_godzinowa;
  }

  function doplataZaGodzine() {
    return stan.dane.doplata_za_godzine || 15;
  }

  /** Cena do paska: dokładna po wyborze godziny, wcześniej "od …" poza Wawrem. */
  function cenaTekst() {
    if (!stan.dlugosc || !stan.dane) return '';
    if (stan.wybrany) return stan.dlugosc * (stawka() + (stan.wybrany.doplata || 0)) + ' zł';
    var m = miejsceWgId(stan.miejsce);
    return (m && !m.wawer ? t('od') : '') + stan.dlugosc * stawka() + ' zł';
  }

  function oglos(tekst) {
    // Ten sam tekst drugi raz nie zostałby odczytany — czyścimy na chwilę
    ogloszenie.textContent = '';
    window.setTimeout(function () {
      ogloszenie.textContent = tekst;
    }, 50);
  }

  /* ------------------------------------------------------------------ */
  /* Wczytanie danych                                                    */
  /* ------------------------------------------------------------------ */

  /** fetch + JSON; nigdy nie rzuca przy kodzie błędu HTTP, tylko przy braku sieci. */
  function pobierz(url, opcje) {
    opcje = opcje || {};
    opcje.credentials = 'same-origin';
    opcje.headers = opcje.headers || { Accept: 'application/json' };
    return fetch(url, opcje).then(function (r) {
      return r
        .json()
        .catch(function () {
          return {};
        })
        .then(function (body) {
          return { status: r.status, ok: r.ok, body: body || {} };
        });
    });
  }

  function start() {
    pobierz('/api/konto/ja')
      .then(function (w) {
        if (w.ok) {
          // Konta działają — grafik tylko dla zalogowanych z kompletem danych
          if (!w.body.zalogowany) return pokazDostep('gosc', null);
          if (!w.body.konto.kompletny) return pokazDostep('profil', w.body.konto);
          stan.konto = w.body.konto;
        }
        // 404 KONTA_WYLACZONE (produkcja) albo inny błąd — grafik jak dawniej
        stan.dostep = 'grafik';
        wczytaj();
      })
      .catch(function () {
        stan.dostep = 'grafik';
        wczytaj();
      });
  }

  function pokazDostep(dostep, konto) {
    stan.dostep = dostep;
    stan.konto = konto;
    rysuj();
  }

  function wczytaj() {
    var nr = ++stan.nrZapytania;
    stan.wczytywanie = true;
    var url = '/api/dostepnosc' + (stan.miejsce ? '?miejsce=' + encodeURIComponent(stan.miejsce) : '');
    return pobierz(url)
      .then(function (w) {
        if (nr !== stan.nrZapytania) return; // w międzyczasie wybrano inne miejsce
        stan.wczytywanie = false;
        // 401 = konta włączone, a sesji nie ma (np. wygasła) — to nie błąd,
        // tylko zaproszenie do logowania.
        if (w.status === 401) return pokazDostep('gosc', null);
        if (!w.ok || !w.body.dni) throw new Error('HTTP ' + w.status);
        stan.dane = w.body;
        if (stan.miejsce && w.body.miejsce !== stan.miejsce) {
          // Zapamiętane miejsce zniknęło z listy — wybór od nowa
          stan.miejsce = '';
          zapamietajMiejsce('');
          stan.krok = 1;
        }
        sprawdzWybor();
        if (stan.dostep !== 'grafik') stan.dostep = 'grafik';
        rysuj();
      })
      .catch(function () {
        if (nr !== stan.nrZapytania) return;
        // Backend może jeszcze nie być wdrożony — strona ma wtedy nadal
        // działać i kierować do kontaktu telefonicznego.
        stan.wczytywanie = false;
        stan.dostep = 'blad';
        rysuj();
      });
  }

  /** Po odświeżeniu grafiku wybrana godzina mogła zniknąć albo zmienić cenę. */
  function sprawdzWybor() {
    if (!daneMiejsca()) return;
    if (stan.wybranaData && !dzienWgDaty(stan.wybranaData)) stan.wybranaData = null;
    if (!stan.wybrany) return;
    var nowy = null;
    terminyDnia(dzienWgDaty(stan.wybrany.data)).forEach(function (x) {
      if (x.start === stan.wybrany.start) nowy = x;
    });
    if (nowy) {
      stan.wybrany.doplata = nowy.doplata || 0;
      return;
    }
    stan.wybrany = null;
    if (stan.krok === 4) {
      stan.krok = 3;
      stan.komunikat = t('terminZniknal');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Rysowanie                                                           */
  /* ------------------------------------------------------------------ */

  function rysuj() {
    var fokus = kluczFokusu(document.activeElement);
    zapamietajFormularz();

    var html;
    if (stan.dostep === 'ladowanie') {
      html = '<p class="gk-komunikat">' + t('wczytywanie') + '</p>';
    } else if (stan.dostep === 'gosc' || stan.dostep === 'profil') {
      html = zaslonaHtml();
    } else if (stan.dostep === 'blad') {
      html = bladHtml();
    } else if (!stan.dane) {
      html = '<p class="gk-komunikat">' + t('wczytywanie') + '</p>';
    } else if (stan.krok === 5) {
      html = '<div class="gk-tresc gk-sukces">' + sukcesHtml() + '</div>';
    } else {
      while (stan.krok > 1 && !krokDostepny(stan.krok)) stan.krok--;
      var tresc = stan.krok === 1 ? krok1Html() : stan.krok === 2 ? krok2Html() : stan.krok === 3 ? krok3Html() : krok4Html();
      html = krokiHtml() + '<div class="gk-tresc">' + tresc + '</div>' + (stan.krok < 4 ? pasekHtml() : '');
    }
    karta.innerHTML = html;
    przywrocFormularz();

    // Ten sam element co przed przerysowaniem (np. kliknięty dzień) dostaje
    // fokus z powrotem — inaczej klawiatura wracałaby na początek strony.
    if (fokus) {
      var el = karta.querySelector(fokus);
      if (el && !el.disabled) el.focus({ preventScroll: true });
    }
  }

  /** Selektor elementu z fokusem, po którym da się go znaleźć po przerysowaniu. */
  function kluczFokusu(el) {
    if (!el || !karta.contains(el)) return null;
    if (el.id) return '#' + el.id;
    var akcja = el.getAttribute('data-akcja');
    if (!akcja) return null;
    var sel = '[data-akcja="' + akcja + '"]';
    ['data-data', 'data-start', 'data-id', 'data-h', 'data-krok', 'data-kierunek'].forEach(function (a) {
      if (el.hasAttribute(a)) sel += '[' + a + '="' + el.getAttribute(a) + '"]';
    });
    return sel;
  }

  /** Fokus na nagłówek nowego kroku + przewinięcie, gdy karta uciekła za górę ekranu. */
  function fokusNa(selektor) {
    var el = karta.querySelector(selektor || '.gk-tytul');
    // 70 px — tyle zasłania przyklejony nagłówek strony
    if (widget.getBoundingClientRect().top < 70 && widget.scrollIntoView) {
      widget.scrollIntoView({ block: 'start', behavior: MALO_RUCHU && MALO_RUCHU.matches ? 'auto' : 'smooth' });
    }
    if (el) el.focus({ preventScroll: true });
  }

  function naglowekKroku(tytul, podtytul) {
    return (
      '<h3 class="gk-tytul" id="gk-tytul" tabindex="-1">' + tytul + '</h3>' +
      (podtytul ? '<p class="gk-podtytul">' + podtytul + '</p>' : '')
    );
  }

  function krokDostepny(n) {
    if (n === 1) return true;
    if (n === 2) return Boolean(miejsceWgId(stan.miejsce));
    if (n === 3) return krokDostepny(2) && Boolean(stan.dlugosc);
    if (n === 4) return krokDostepny(3) && Boolean(stan.wybrany);
    return false;
  }

  /* ---- Pasek kroków -------------------------------------------------- */

  function krokiHtml() {
    var m = miejsceWgId(stan.miejsce);
    var nazwyKrokow = [t('krok1'), t('krok2'), t('krok3'), t('krok4')];
    var wartosci = [
      m ? nazwaMiejsca(m) : '',
      stan.dlugosc ? stan.dlugosc + ' h' : '',
      stan.wybrany ? terminKrotko(stan.wybrany.data, stan.wybrany.start) : '',
      '',
    ];
    var html = '<ol class="gk-kroki" aria-label="' + t('krokiAria') + '">';
    for (var i = 1; i <= 4; i++) {
      var aktywny = i === stan.krok;
      var zrobiony = !aktywny && wartosci[i - 1] !== '';
      var wnetrze =
        '<span class="gk-krok-nr" aria-hidden="true">' + i + '</span>' +
        '<span class="gk-krok-tekst"><span class="visually-hidden">' + t('krokNr')(i) + '</span>' +
        '<span class="gk-krok-nazwa">' + nazwyKrokow[i - 1] + '</span>' +
        (zrobiony ? '<span class="gk-krok-wartosc">' + esc(wartosci[i - 1]) + '</span>' : '') +
        '</span>';
      html +=
        '<li class="gk-krok' + (aktywny ? ' is-aktywny' : zrobiony ? ' is-zrobiony' : '') + '"' +
        (aktywny ? ' aria-current="step"' : '') + '>' +
        (!aktywny && krokDostepny(i)
          ? '<button type="button" class="gk-krok-btn" data-akcja="krok" data-krok="' + i + '">' + wnetrze +
            (zrobiony ? '<span class="visually-hidden">' + t('krokZmien') + '</span>' : '') + '</button>'
          : '<span class="gk-krok-btn">' + wnetrze + '</span>') +
        '</li>';
    }
    return html + '</ol>';
  }

  /* ---- Pasek z podsumowaniem i przyciskiem DALEJ --------------------- */

  function pasekHtml() {
    var m = miejsceWgId(stan.miejsce);
    var czesci = [];
    if (stan.dlugosc) czesci.push(stan.dlugosc + ' h');
    if (m) czesci.push(esc(nazwaMiejsca(m)));
    if (stan.wybrany) czesci.push(terminZakres(stan.wybrany.data, stan.wybrany.start, stan.dlugosc));
    var cena = cenaTekst();
    if (cena) czesci.push('<strong>' + cena + '</strong>');
    // DALEJ działa, gdy w bieżącym kroku coś już wybrano — w kroku 3
    // dopiero po wybraniu godziny.
    var gotowe =
      (stan.krok === 1 && Boolean(m)) || (stan.krok === 2 && Boolean(stan.dlugosc)) || (stan.krok === 3 && Boolean(stan.wybrany));
    return (
      '<div class="gk-pasek" role="region" aria-label="' + t('pasekAria') + '">' +
      '<p class="gk-pasek-tekst">' + (czesci.length ? czesci.join(' · ') : t('pasekPusty')) + '</p>' +
      '<button type="button" class="btn btn-primary gk-dalej" data-akcja="dalej"' + (gotowe ? '' : ' disabled') + '>' +
      t('dalej') + '</button>' +
      '</div>'
    );
  }

  /* ---- Krok 1: miejsce spotkania ------------------------------------- */

  var PINEZKA =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';

  function krok1Html() {
    var s = stawka();
    var d = doplataZaGodzine();
    var html = naglowekKroku(t('tytul1'), t('podtytul1'));
    [
      { wawer: true, nazwa: t('grupaWawer'), cena: s + t('zaGodzine') },
      { wawer: false, nazwa: t('grupaDalej'), cena: s + '–' + (s + d) + t('zaGodzine') },
    ].forEach(function (grupa, i) {
      var lista = stan.dane.miejsca.filter(function (m) {
        return m.wawer === grupa.wawer;
      });
      if (!lista.length) return;
      html +=
        '<div class="gk-grupa" role="group" aria-labelledby="gk-grupa-' + i + '">' +
        '<h4 class="gk-grupa-naglowek" id="gk-grupa-' + i + '">' + grupa.nazwa + ' <span class="gk-grupa-cena">— ' + grupa.cena + '</span></h4>' +
        '<div class="gk-kafelki">' +
        lista.map(function (m) {
          var wybrane = m.id === stan.miejsce;
          return (
            '<button type="button" class="gk-kafel gk-kafel-miejsce' + (wybrane ? ' is-wybrany' : '') + '" data-akcja="miejsce" data-id="' +
            esc(m.id) + '" aria-pressed="' + wybrane + '">' +
            '<span class="gk-kafel-ikona" aria-hidden="true">' + PINEZKA + '</span>' +
            '<span class="gk-kafel-tekst"><span class="gk-kafel-tytul">' + esc(nazwaMiejsca(m)) + '</span>' +
            '<span class="gk-kafel-opis">' + (m.wawer ? s : s + '–' + (s + d)) + t('zaGodzine') + '</span></span>' +
            '</button>'
          );
        }).join('') +
        '</div></div>';
    });
    return html + '<p class="gk-info">' + t('infoDalej')(s, d) + '</p>';
  }

  /* ---- Krok 2: długość jazdy ----------------------------------------- */

  function krok2Html() {
    var m = miejsceWgId(stan.miejsce);
    var html = naglowekKroku(t('tytul2'), esc(nazwaMiejsca(m)));
    html += '<div class="gk-kafelki gk-kafelki-dlugosc" role="group" aria-label="' + t('krok2') + '">';
    [2, 3, 4].forEach(function (h) {
      var wybrane = h === stan.dlugosc;
      // Bez wolnych terminów w całym horyzoncie — da się wybrać (krok 3
      // podpowie, co dalej), ale uprzedzamy od razu.
      var brak = daneMiejsca() && !stan.dane.dni.some(function (d) {
        return terminyDnia(d, h).length > 0;
      });
      html +=
        '<button type="button" class="gk-kafel gk-kafel-dlugosc' + (wybrane ? ' is-wybrany' : '') + '" data-akcja="dlugosc" data-h="' + h +
        '" aria-pressed="' + wybrane + '">' +
        '<span class="gk-kafel-duzy">' + h + ' h</span>' +
        '<span class="gk-kafel-opis">' + t('godzinyOpis')(h) + '</span>' +
        '<span class="gk-kafel-cena">' + (m && !m.wawer ? t('od') : '') + h * stawka() + ' zł</span>' +
        (brak ? '<span class="gk-kafel-uwaga">' + t('brakWHoryzoncie') + '</span>' : '') +
        '</button>';
    });
    html += '</div>';
    if (m && !m.wawer) html += '<p class="gk-info">' + t('infoDalej')(stawka(), doplataZaGodzine()) + '</p>';
    return html;
  }

  /* ---- Krok 3: kalendarz miesiąca + godziny dnia -------------------- */

  /** Domyślny dzień (pierwszy z wolnymi godzinami) i miesiąc kalendarza. */
  function ustawDzienIMiesiac() {
    var dni = stan.dane.dni;
    if (stan.wybranaData && !dzienWgDaty(stan.wybranaData)) stan.wybranaData = null;
    if (!stan.wybranaData) {
      var n = najblizszyTermin();
      stan.wybranaData = n ? n.dzien.data : null;
    }
    var pierwszy = dni[0].data.slice(0, 7);
    var ostatni = dni[dni.length - 1].data.slice(0, 7);
    if (!stan.miesiac) stan.miesiac = (stan.wybranaData || dni[0].data).slice(0, 7);
    if (stan.miesiac < pierwszy) stan.miesiac = pierwszy;
    if (stan.miesiac > ostatni) stan.miesiac = ostatni;
  }

  function krok3Html() {
    var m = miejsceWgId(stan.miejsce);
    var html = naglowekKroku(t('tytul3'), stan.dlugosc + ' h · ' + esc(nazwaMiejsca(m)));
    if (!daneMiejsca()) return html + '<p class="gk-komunikat">' + t('wczytywanie') + '</p>';

    ustawDzienIMiesiac();
    if (stan.komunikat) {
      html += '<p class="gk-alert" id="gk-alert" role="alert" tabindex="-1">' + esc(stan.komunikat) + '</p>';
    }
    var n = najblizszyTermin();
    if (n) {
      html +=
        '<button type="button" class="gk-najblizszy" data-akcja="najblizszy">' +
        '<span class="gk-najblizszy-ikona" aria-hidden="true">→</span>' +
        '<span>' + t('najblizszy') + '<strong>' + terminKrotko(n.dzien.data, n.termin.start) + '</strong></span>' +
        '</button>';
    } else {
      html += '<p class="gk-alert">' + t('brakWszystkich')(stan.dlugosc) + '</p>';
    }
    html +=
      '<div class="gk-termin' + (stan.godzinyNaTelefonie && stan.wybranaData ? ' is-godziny' : '') + '">' +
      kalendarzHtml() +
      '<div class="gk-godziny-panel">' + godzinyHtml() + '</div>' +
      '</div>';
    return html;
  }

  function kalendarzHtml() {
    var dni = stan.dane.dni;
    var pierwszy = dni[0].data.slice(0, 7);
    var ostatni = dni[dni.length - 1].data.slice(0, 7);
    var miesiac = stan.miesiac;
    var dzisiaj = dni[0].data; // serwer liczy "dziś" w polskiej strefie czasowej
    // Strzałki tylko wtedy, gdy horyzont (1–3 tygodnie) wchodzi na drugi miesiąc
    var strzalki = pierwszy !== ostatni;

    var html =
      '<div class="gk-kalendarz">' +
      '<div class="gk-miesiac-nav">' +
      '<p class="gk-miesiac" id="gk-miesiac">' + nazwaMiesiaca(miesiac) + '</p>' +
      (strzalki
        ? '<button type="button" class="gk-strzalka" data-akcja="miesiac" data-kierunek="-1" aria-label="' + t('poprzedniMiesiac') + '"' +
          (miesiac <= pierwszy ? ' disabled' : '') + '>‹</button>' +
          '<button type="button" class="gk-strzalka" data-akcja="miesiac" data-kierunek="1" aria-label="' + t('nastepnyMiesiac') + '"' +
          (miesiac >= ostatni ? ' disabled' : '') + '>›</button>'
        : '') +
      '</div>' +
      '<div class="gk-dni-tygodnia" aria-hidden="true">' +
      nazwy().naglowek.map(function (s) {
        return '<span>' + s + '</span>';
      }).join('') +
      '</div>' +
      '<div class="gk-siatka" role="group" aria-labelledby="gk-miesiac">';

    // Poniedziałek pierwszy: puste pola przed 1. dniem miesiąca
    var przesuniecie = (dzienTygodnia(miesiac + '-01') + 6) % 7;
    for (var p = 0; p < przesuniecie; p++) html += '<span class="gk-dzien is-pusty" aria-hidden="true"></span>';

    var ile = dniWMiesiacu(miesiac);
    for (var n = 1; n <= ile; n++) {
      var data = miesiac + '-' + dwieCyfry(n);
      var dzien = dzienWgDaty(data);
      if (!dzien) {
        // Przeszłość albo poza horyzontem — nie do kliknięcia
        html += '<span class="gk-dzien is-poza" aria-hidden="true">' + n + '</span>';
        continue;
      }
      var wolne = terminyDnia(dzien).length;
      var wybrany = data === stan.wybranaData;
      var opis =
        dlugaData(data) + (data === dzisiaj ? t('labelDzis') : '') +
        (dzien.aktywny === false ? t('labelZamkniete') : wolne ? t('labelWolne')(wolne) : t('labelBrak'));
      // Dni bez wolnych godzin są wyszarzone, ale klikalne: dzień, w którym
      // nie pracuję, pokazuje zachętę do kontaktu (jak w dawnym grafiku).
      html +=
        '<button type="button" class="gk-dzien' + (wolne ? ' is-wolny' : ' is-brak') + (data === dzisiaj ? ' is-dzis' : '') +
        (wybrany ? ' is-wybrany' : '') + '" data-akcja="dzien" data-data="' + data + '" aria-pressed="' + wybrany + '"' +
        (data === dzisiaj ? ' aria-current="date"' : '') + ' aria-label="' + esc(opis) + '">' + n + '</button>';
    }
    return html + '</div></div>';
  }

  /** Wolne godziny i cudze wstępne rezerwacje dnia, po kolei według godziny. */
  function elementyDnia(dzien) {
    return terminyDnia(dzien)
      .map(function (x) {
        return { start: x.start, termin: x };
      })
      .concat(
        (dzien.wstepne || []).map(function (w) {
          return { start: w.start, wstepna: w };
        })
      )
      .sort(function (a, b) {
        return a.start - b.start;
      });
  }

  function godzinyHtml() {
    var dzien = stan.wybranaData ? dzienWgDaty(stan.wybranaData) : null;
    var html =
      '<div class="gk-godziny-glowa">' +
      '<button type="button" class="gk-wroc" data-akcja="wroc-kalendarz"><span aria-hidden="true">‹ </span>' + t('wrocKalendarz') + '</button>' +
      (dzien ? '<h4 class="gk-dzien-tytul" id="gk-dzien-tytul" tabindex="-1">' + dlugaData(dzien.data) + '</h4>' : '') +
      '</div>';
    if (!dzien) return html + '<p class="gk-drobne">' + t('wybierzDzien') + '</p>';
    if (dzien.aktywny === false) return html + kontaktDniaZamknietego(dzien);

    var wolne = terminyDnia(dzien);
    if (!wolne.length) {
      html += dzien.data === stan.dane.dni[0].data
        ? '<p class="gk-drobne">' + t('dzisInfo') + '<a href="tel:' + TELEFON + '">' + TELEFON_ZAPIS + '</a></p>'
        : '<p class="gk-drobne">' + t('brakTerminow') + '</p>';
    }

    var elementy = elementyDnia(dzien);
    [
      { klucz: 'rano', od: 0, do: 12 * 60 },
      { klucz: 'popoludnie', od: 12 * 60, do: 17 * 60 },
      { klucz: 'wieczor', od: 17 * 60, do: 24 * 60 },
    ].forEach(function (pora) {
      var lista = elementy.filter(function (el) {
        return el.start >= pora.od && el.start < pora.do;
      });
      if (!lista.length) return;
      html +=
        '<div class="gk-pora">' +
        '<h5 class="gk-pora-tytul">' + t(pora.klucz) + '</h5>' +
        '<div class="gk-godziny">' +
        lista.map(function (el) {
          return el.wstepna ? chipWstepnej(el.wstepna) : chipTerminu(dzien, el.termin);
        }).join('') +
        '</div></div>';
    });

    var legenda = [];
    if (wolne.some(function (x) { return x.doplata > 0; })) legenda.push(t('legendaDoplata')(stawka(), doplataZaGodzine()));
    if (dzien.wstepne && dzien.wstepne.length) legenda.push(t('wstepnaLegenda'));
    if (legenda.length) html += '<p class="gk-legenda">' + legenda.join(' ') + '</p>';
    return html;
  }

  function chipTerminu(dzien, termin) {
    var wybrany = Boolean(stan.wybrany && stan.wybrany.data === dzien.data && stan.wybrany.start === termin.start);
    var doplata = termin.doplata > 0;
    var opis = t('terminAria') + terminZakres(dzien.data, termin.start, stan.dlugosc) + (doplata ? t('doplataAria')(termin.doplata) : '');
    return (
      '<button type="button" class="gk-godzina' + (doplata ? ' is-doplata' : '') + (wybrany ? ' is-wybrana' : '') +
      '" data-akcja="godzina" data-start="' + termin.start + '" aria-pressed="' + wybrany + '" aria-label="' + esc(opis) + '">' +
      '<span class="gk-godzina-czas">' + godz(termin.start) + '</span>' +
      (doplata ? '<span class="gk-godzina-doplata" aria-hidden="true">+' + termin.doplata + ' zł/h</span>' : '') +
      '</button>'
    );
  }

  function chipWstepnej(w) {
    return (
      '<span class="gk-godzina is-wstepna" role="note" aria-label="' + esc(godz(w.start) + '–' + godz(w.koniec) + t('wstepnaAria')) + '">' +
      '<span class="gk-godzina-czas" aria-hidden="true">' + godz(w.start) + '</span>' +
      '<span class="gk-godzina-opis" aria-hidden="true">' + t('wstepnaEtykieta') + '</span>' +
      '</span>'
    );
  }

  /** Zachęta do kontaktu w dniu, w którym nie pracuję (e-mail/SMS przed telefonem). */
  function kontaktDniaZamknietego(dzien) {
    var angielski = jezyk() === 'en';
    var opis = nazwy().dni[dzienTygodnia(dzien.data)] + ' ' + krotkaData(dzien.data);
    var tresc = angielski
      ? 'Hello, I’d like to ask about a possible time for a refresher driving lesson on ' + opis + '.'
      : 'Dzień dobry, chciałbym zapytać o możliwy termin jazdy doszkalającej: ' + opis + '.';
    var temat = angielski ? 'Question about a time: ' + opis : 'Pytanie o termin: ' + opis;
    var mail = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(temat) + '&body=' + encodeURIComponent(tresc);
    var sms = 'sms:' + TELEFON + '?body=' + encodeURIComponent(tresc);
    var whatsapp = 'https://wa.me/' + TELEFON_WA + '?text=' + encodeURIComponent(tresc);
    return (
      '<p class="gk-drobne">' + t('kontaktZachetaTekst') + '</p>' +
      '<div class="gk-kanaly">' +
      '<a class="btn btn-secondary" href="' + mail + '">' + t('przyciskEmail') + '</a>' +
      '<a class="btn btn-secondary" href="' + sms + '">' + t('przyciskSms') + '</a>' +
      '<a class="btn btn-secondary" href="' + whatsapp + '" target="_blank" rel="noopener">' + t('przyciskWhatsapp') + '</a>' +
      '<a class="btn btn-secondary" href="tel:' + TELEFON + '">' + t('przyciskTelefon') + '</a>' +
      '</div>'
    );
  }

  /* ---- Krok 4: podsumowanie i formularz ------------------------------ */

  function kwotyHtml(cenaH, doplataH, razem, zadatek, reszta, dlugosc) {
    // Kwoty bierzemy z serwera (ustawienia w bazie), a nie z kodu — zadatek
    // zmienia się z panelu i nie może wymagać wdrożenia strony na nowo.
    // Ostateczną cenę i tak liczy serwer przy zapisie; tu tylko ją pokazujemy.
    return (
      '<div class="gk-kwoty">' +
      '<p><span>' + t('cenaZaGodzine') + (doplataH > 0 ? t('cenaDojazd')(doplataH) : '') + '</span><strong>' + cenaH + ' zł</strong></p>' +
      '<p><span>' + t('razem')(dlugosc) + '</span><strong>' + razem + ' zł</strong></p>' +
      '<p><span>' + t('zadatekBlik') + '<span class="gk-nowrap">' + TELEFON_ZAPIS + '</span>' + (jezyk() === 'en' ? t('zadatekPrzelew') : '') +
      '</span><strong>' + zadatek + ' zł</strong></p>' +
      '<p><span>' + t('resztaGotowka') + '</span><strong>' + reszta + ' zł</strong></p>' +
      '</div>'
    );
  }

  function krok4Html() {
    var w = stan.wybrany;
    var m = miejsceWgId(stan.miejsce);
    var cenaH = stawka() + (w.doplata || 0);
    var razem = stan.dlugosc * cenaH;
    var zadatek = stan.dane.kwota_zadatku;
    var opisTerminu = dlugaData(w.data) + ', ' + godz(w.start) + '–' + godz(w.start + stan.dlugosc * 60) + ' (' + stan.dlugosc + ' h)';

    return (
      naglowekKroku(t('tytul4'), '') +
      '<div class="gk-podsumowanie">' +
      '<dl class="gk-dane">' +
      '<div><dt>' + t('dtMiejsce') + '</dt><dd>' + esc(nazwaMiejsca(m)) + '</dd></div>' +
      '<div><dt>' + t('dtTermin') + '</dt><dd>' + opisTerminu + '</dd></div>' +
      '</dl>' +
      kwotyHtml(cenaH, w.doplata || 0, razem, zadatek, razem - zadatek, stan.dlugosc) +
      '</div>' +
      formularzHtml() +
      '<p class="gk-wstecz"><button type="button" class="gk-link" data-akcja="krok" data-krok="3"><span aria-hidden="true">‹ </span>' +
      t('zmienTermin') + '</button></p>' +
      alternatywaHtml(terminZakres(w.data, w.start, stan.dlugosc) + ' (' + stan.dlugosc + ' h), ' + t('miejsceEtykieta') + nazwaMiejsca(m))
    );
  }

  function pole(id, nazwa, typ, etykieta, autocomplete, info) {
    return (
      '<label for="' + id + '">' + etykieta + '</label>' +
      '<input id="' + id + '" name="' + nazwa + '" type="' + typ + '" maxlength="' + (typ === 'email' ? 120 : typ === 'tel' ? 25 : 80) +
      '" autocomplete="' + autocomplete + '" required' + (typ === 'tel' ? ' inputmode="tel"' : '') +
      (info ? ' aria-describedby="' + id + '-info"' : '') + '>' +
      (info ? '<p class="gk-pole-info" id="' + id + '-info">' + info + '</p>' : '')
    );
  }

  function formularzHtml() {
    var k = stan.konto;
    var html = '<form id="gk-form" class="gk-form" novalidate>';
    if (k) {
      // Zalogowany: dane z konta (tylko do odczytu); osobę jadącą można
      // zmienić — SMS z przypomnieniem idzie na numer wpisany przy jeździe.
      html +=
        '<div class="gk-konto-dane">' +
        '<p class="gk-etykieta">' + t('kontoJako') + '</p>' +
        '<p class="gk-konto-osoba"><strong>' + esc(k.imie) + '</strong> · ' + esc(k.telefon) + '<br>' +
        '<span class="gk-drobne">' + esc(k.email) + ' — ' + t('kontoEmailInfo') + '</span></p>' +
        '</div>' +
        '<label class="gk-check"><input type="checkbox" id="gk-inna" aria-controls="gk-kierowca" aria-expanded="false"> <span>' +
        t('innaOsoba') + '</span></label>' +
        '<div class="gk-kierowca" id="gk-kierowca" hidden>' +
        '<p class="gk-pole-info">' + t('innaOsobaInfo') + '</p>' +
        pole('gk-imie', 'imie', 'text', t('kierowcaImie'), 'off') +
        pole('gk-telefon', 'telefon', 'tel', t('kierowcaTelefon'), 'off') +
        '</div>';
    } else {
      html +=
        pole('gk-imie', 'imie', 'text', t('formImie'), 'name') +
        pole('gk-telefon', 'telefon', 'tel', t('formTelefon'), 'tel', t('formTelefonSms')) +
        pole('gk-email', 'email', 'email', t('formEmail'), 'email');
    }
    return (
      html +
      // Pułapka na boty: człowiek tego pola nie widzi (ani czytnik ekranu),
      // automat wypełniający wszystko jak leci — tak, i serwer go odrzuci.
      '<div class="gk-pulapka" aria-hidden="true">' +
      '<label for="gk-strona">Strona www</label>' +
      '<input id="gk-strona" name="strona" type="text" tabindex="-1" autocomplete="off">' +
      '</div>' +
      '<label class="gk-check gk-zgoda"><input type="checkbox" id="gk-zgoda" required> <span>' + t('formZgoda') + '</span></label>' +
      '<p class="gk-blad" id="gk-blad" role="alert" hidden></p>' +
      '<button type="submit" class="btn btn-primary gk-wyslij" id="gk-wyslij"' + (stan.wysylanie ? ' disabled' : '') + '>' +
      (stan.wysylanie ? t('formWysylanie') : t('formWyslij')) + '</button>' +
      '<p class="gk-drobne">' + t('terminDrobne') + '</p>' +
      '</form>'
    );
  }

  /** Dotychczasowe kanały kontaktu — zostają jako druga droga pod formularzem. */
  function alternatywaHtml(opis) {
    var angielski = jezyk() === 'en';
    var tresc = angielski
      ? 'Hello, I’d like to book a refresher driving lesson: ' + opis + '. Please confirm the time.'
      : 'Dzień dobry, chciałbym zarezerwować jazdę doszkalającą: ' + opis + '. Proszę o potwierdzenie terminu.';
    var temat = angielski ? 'Booking request: ' + opis : 'Rezerwacja jazdy doszkalającej: ' + opis;
    // Parametr ?body= obsługują dziś zarówno Android, jak i iOS
    var sms = 'sms:' + TELEFON + '?body=' + encodeURIComponent(tresc);
    var whatsapp = 'https://wa.me/' + TELEFON_WA + '?text=' + encodeURIComponent(tresc);
    var mail = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(temat) + '&body=' + encodeURIComponent(tresc);
    return (
      '<div class="gk-alternatywa">' +
      '<p class="gk-alternatywa-tytul">' + t('alternatywa') + '</p>' +
      '<div class="gk-kanaly">' +
      '<a class="btn btn-secondary" href="' + sms + '">' + t('przyciskSms') + '</a>' +
      '<a class="btn btn-secondary" href="' + whatsapp + '" target="_blank" rel="noopener">' + t('przyciskWhatsapp') + '</a>' +
      '<a class="btn btn-secondary" href="' + mail + '">' + t('przyciskEmail') + '</a>' +
      '<a class="btn btn-secondary" href="tel:' + TELEFON + '">' + t('zadzwon') + '</a>' +
      '</div></div>'
    );
  }

  /* Wpisane dane przeżywają przerysowanie karty (np. zmianę języka). */
  function zapamietajFormularz() {
    var form = document.getElementById('gk-form');
    if (!form) return;
    var wartosc = function (id) {
      var el = document.getElementById(id);
      return el ? (el.type === 'checkbox' ? el.checked : el.value) : null;
    };
    stan.formularz = {
      'gk-imie': wartosc('gk-imie'),
      'gk-telefon': wartosc('gk-telefon'),
      'gk-email': wartosc('gk-email'),
      'gk-inna': wartosc('gk-inna'),
      'gk-zgoda': wartosc('gk-zgoda'),
    };
  }

  function przywrocFormularz() {
    if (!stan.formularz || !document.getElementById('gk-form')) return;
    Object.keys(stan.formularz).forEach(function (id) {
      var el = document.getElementById(id);
      var w = stan.formularz[id];
      if (!el || w === null) return;
      if (el.type === 'checkbox') el.checked = w;
      else el.value = w;
    });
    pokazKierowce(false);
  }

  /** "Jedzie inna osoba" — pola z imieniem i telefonem osoby jadącej. */
  function pokazKierowce(fokus) {
    var check = document.getElementById('gk-inna');
    var pola = document.getElementById('gk-kierowca');
    if (!check || !pola) return;
    pola.hidden = !check.checked;
    check.setAttribute('aria-expanded', String(check.checked));
    if (fokus && check.checked) document.getElementById('gk-imie').focus();
  }

  function bladFormularza(tekst) {
    var blad = document.getElementById('gk-blad');
    var przycisk = document.getElementById('gk-wyslij');
    stan.wysylanie = false;
    if (przycisk) {
      przycisk.disabled = false;
      przycisk.textContent = t('formWyslij');
    }
    if (blad) {
      blad.textContent = tekst;
      blad.hidden = false;
    }
  }

  function wyslij() {
    if (stan.wysylanie || !stan.wybrany) return;
    var wartosc = function (id) {
      var el = document.getElementById(id);
      return el ? el.value : '';
    };
    document.getElementById('gk-blad').hidden = true;

    // Pola sprawdza dokładnie serwer (i odpowiada w języku strony);
    // tutaj tylko to, czego nie ma sensu wysyłać.
    if (!document.getElementById('gk-zgoda').checked) {
      bladFormularza(t('formBrakZgody'));
      return;
    }

    var k = stan.konto;
    var inna = Boolean(k && document.getElementById('gk-inna').checked);
    var dane = {
      data: stan.wybrany.data,
      start: stan.wybrany.start,
      dlugosc: stan.dlugosc,
      miejsce: stan.miejsce,
      // Zalogowany: e-mail zawsze z konta, imię i telefon z konta albo
      // osoby jadącej ("Jedzie inna osoba").
      imie: k && !inna ? k.imie : wartosc('gk-imie'),
      telefon: k && !inna ? k.telefon : wartosc('gk-telefon'),
      email: k ? k.email : wartosc('gk-email'),
      strona: wartosc('gk-strona'),
      zgoda_regulamin: true,
      jezyk: jezyk(),
    };

    stan.wysylanie = true;
    var przycisk = document.getElementById('gk-wyslij');
    przycisk.disabled = true;
    przycisk.textContent = t('formWysylanie');

    pobierz('/api/rezerwacja', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(dane),
    })
      .then(function (w) {
        stan.wysylanie = false;
        if (w.ok) {
          stan.rezerwacja = w.body;
          stan.emailRezerwacji = String(dane.email).trim();
          stan.zadatek = '';
          stan.formularz = null;
          stan.wybrany = null;
          stan.krok = 5;
          rysuj();
          fokusNa();
          wczytaj(); // zajęty termin znika z grafiku
          return;
        }
        if (w.status === 401) return pokazDostep('gosc', null); // sesja wygasła
        if (w.body.kod === 'PROFIL') return pokazDostep('profil', stan.konto);
        if (w.body.kod === 'TERMIN_ZAJETY' || w.body.kod === 'ZAMKNIETE') {
          // Termin właśnie zniknął — z powrotem do kalendarza, ze świeżym grafikiem
          stan.komunikat = w.body.blad || t('terminZniknal');
          stan.wybrany = null;
          stan.krok = 3;
          stan.godzinyNaTelefonie = false;
          rysuj();
          fokusNa('#gk-alert');
          wczytaj();
          return;
        }
        bladFormularza(w.body.blad || t('formBladOgolny'));
      })
      .catch(function () {
        bladFormularza(t('formBrakPolaczenia'));
      });
  }

  /* ---- Po wysłaniu --------------------------------------------------- */

  function sukcesHtml() {
    var rez = stan.rezerwacja;
    var info = rez.email_wyslany
      ? t('sukcesEmail') + '<strong class="gk-email">' + esc(stan.emailRezerwacji) + '</strong>' + t('sukcesEmailSpam')
      : t('sukcesBezEmaila');
    var zadatek;
    if (stan.zadatek === 'wyslany') {
      zadatek = '<p class="gk-ok" role="status">' + t('zadatekDzieki') + '</p>';
    } else {
      zadatek =
        '<p class="gk-drobne">' + t('zadatekKrok') + '</p>' +
        '<div class="gk-akcje"><button type="button" class="btn btn-primary" data-akcja="zadatek"' +
        (stan.zadatek === 'wysylanie' ? ' disabled' : '') + '>' + t('przyciskZadatek') + '</button></div>' +
        (stan.zadatek === 'blad' ? '<p class="gk-blad" role="alert">' + t('formBrakPolaczenia') + '</p>' : '');
    }
    return (
      '<h3 class="gk-tytul" id="gk-tytul" tabindex="-1"><span class="gk-sukces-znak" aria-hidden="true">✓</span> ' + t('sukcesTytul') + '</h3>' +
      '<p class="gk-ok">' + t('sukcesTekst') + '</p>' +
      '<p>' + t('kodLabel') + ': <strong class="gk-kod">' + esc(rez.kod_rezerwacji) + '</strong></p>' +
      '<p>' + info + '</p>' +
      kwotyHtml(rez.cena_za_godzine, rez.doplata_h, rez.kwota_zadatku + rez.do_zaplaty_na_miejscu, rez.kwota_zadatku,
        rez.do_zaplaty_na_miejscu, rez.dlugosc) +
      zadatek +
      '<div class="gk-akcje gk-akcje-dalej">' +
      (rez.token ? '<a class="btn btn-secondary" href="potwierdzenie.html?t=' + encodeURIComponent(rez.token) + '">' + t('szczegolyRezerwacji') + '</a>' : '') +
      (stan.konto ? '<a class="btn btn-secondary" href="konto.html">' + t('mojeRezerwacje') + '</a>' : '') +
      '<button type="button" class="btn btn-secondary" data-akcja="kolejna">' + t('kolejna') + '</button>' +
      '</div>'
    );
  }

  function zglosZadatek() {
    if (stan.zadatek === 'wysylanie' || stan.zadatek === 'wyslany') return;
    stan.zadatek = 'wysylanie';
    rysuj();
    pobierz('/api/zadatek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token: stan.rezerwacja.token }),
    })
      .then(function (w) {
        if (!w.ok) throw new Error('HTTP ' + w.status);
        stan.zadatek = 'wyslany';
        rysuj();
        oglos(t('zadatekDzieki'));
      })
      .catch(function () {
        stan.zadatek = 'blad';
        rysuj();
      });
  }

  /* ---- Gość / niepełny profil: rozmyty grafik ------------------------ */

  /** Atrapa grafiku — sam obrazek, bez żadnych prawdziwych danych. */
  function atrapaHtml() {
    var dni = '';
    for (var i = 0; i < 35; i++) {
      var n = ((i + 26) % 31) + 1;
      var wolny = i > 8 && i < 30 && [0, 2, 3, 5].indexOf(i % 7) !== -1;
      dni += '<span class="gk-atrapa-dzien' + (wolny ? ' is-wolny' : '') + (i === 16 ? ' is-wybrany' : '') + '">' + n + '</span>';
    }
    var godziny = '';
    ['9:00', '10:00', '11:00', '13:00', '14:00', '15:30', '17:00', '18:00'].forEach(function (g, i) {
      godziny += '<span class="gk-atrapa-godzina' + (i === 4 ? ' is-wstepna' : '') + '">' + g + '</span>';
    });
    return (
      '<div class="gk-atrapa" aria-hidden="true">' +
      '<div class="gk-atrapa-kroki"><span></span><span></span><span class="is-aktywny"></span><span></span></div>' +
      '<div class="gk-atrapa-uklad">' +
      '<div><div class="gk-atrapa-miesiac"></div><div class="gk-atrapa-siatka">' + dni + '</div></div>' +
      '<div class="gk-atrapa-godziny">' + godziny + '</div>' +
      '</div></div>'
    );
  }

  function zaslonaHtml() {
    var gosc = stan.dostep === 'gosc';
    return (
      '<div class="gk-zaslona">' +
      atrapaHtml() +
      '<div class="gk-zaslona-karta">' +
      '<h3 class="gk-tytul" id="gk-tytul" tabindex="-1">' + (gosc ? t('goscTytul') : t('profilTytul')) + '</h3>' +
      '<p>' + (gosc ? t('goscTekst') : t('profilTekst')) + '</p>' +
      '<a class="btn btn-primary" href="' + KONTO_URL + '">' + (gosc ? t('goscPrzycisk') : t('profilPrzycisk')) + '</a>' +
      '<p class="gk-drobne">' + t('zaslonaKontakt') + '</p>' +
      '<div class="gk-kanaly">' +
      '<a class="btn btn-secondary" href="tel:' + TELEFON + '">' + t('zadzwon') + '</a>' +
      '<a class="btn btn-secondary" href="https://wa.me/' + TELEFON_WA + '" target="_blank" rel="noopener">' + t('przyciskWhatsapp') + '</a>' +
      '<a class="btn btn-secondary" href="sms:' + TELEFON + '">' + t('przyciskSms') + '</a>' +
      '</div></div></div>'
    );
  }

  function bladHtml() {
    return (
      '<div class="gk-tresc">' +
      '<p class="gk-alert">' + t('grafikNiedostepny') +
      ' <a href="tel:' + TELEFON + '">' + t('zadzwonPrefiks') + TELEFON_ZAPIS + '</a></p>' +
      '<button type="button" class="btn btn-secondary" data-akcja="ponow">' + t('sprobujPonownie') + '</button>' +
      '</div>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* Akcje                                                               */
  /* ------------------------------------------------------------------ */

  function idzDoKroku(n) {
    if (!krokDostepny(n)) return;
    stan.krok = n;
    // Telefon: wracając do terminu z wybraną godziną, od razu lista godzin
    if (n === 3) stan.godzinyNaTelefonie = Boolean(stan.wybrany);
    rysuj();
    fokusNa();
  }

  function wybierzMiejsce(id) {
    if (id !== stan.miejsce) {
      // Inne miejsce = inne godziny i ceny — wybrana godzina przestaje obowiązywać
      stan.miejsce = id;
      stan.wybrany = null;
      stan.komunikat = '';
      zapamietajMiejsce(id);
      wczytaj();
    }
    idzDoKroku(2);
  }

  function wybierzDlugosc(h) {
    if (h !== stan.dlugosc) {
      stan.dlugosc = h;
      stan.wybrany = null;
      stan.komunikat = '';
    }
    idzDoKroku(3);
  }

  function wybierzDzien(data) {
    if (stan.wybrany && stan.wybrany.data !== data) stan.wybrany = null;
    stan.wybranaData = data;
    stan.miesiac = data.slice(0, 7);
    stan.godzinyNaTelefonie = true;
    stan.komunikat = '';
    rysuj();
    if (!szeroki()) fokusNa('#gk-dzien-tytul');
    oglos(t('dzienOgloszenie')(dlugaData(data), terminyDnia(dzienWgDaty(data)).length));
  }

  function wybierzGodzine(start) {
    var dzien = dzienWgDaty(stan.wybranaData);
    var termin = null;
    terminyDnia(dzien).forEach(function (x) {
      if (x.start === start) termin = x;
    });
    if (!termin) return;
    stan.wybrany = { data: dzien.data, start: termin.start, doplata: termin.doplata || 0 };
    stan.komunikat = '';
    rysuj();
    oglos(t('wybrano') + terminZakres(dzien.data, start, stan.dlugosc) + ', ' + cenaTekst());
  }

  function skoczDoNajblizszego() {
    var n = najblizszyTermin();
    if (!n) return;
    stan.wybranaData = n.dzien.data;
    stan.miesiac = n.dzien.data.slice(0, 7);
    stan.wybrany = { data: n.dzien.data, start: n.termin.start, doplata: n.termin.doplata || 0 };
    stan.godzinyNaTelefonie = true;
    stan.komunikat = '';
    rysuj();
    fokusNa('.gk-godzina.is-wybrana');
    oglos(t('wybrano') + terminZakres(n.dzien.data, n.termin.start, stan.dlugosc) + ', ' + cenaTekst());
  }

  function zmienMiesiac(kierunek) {
    stan.miesiac = dodajMiesiac(stan.miesiac, kierunek);
    rysuj();
    // Strzałka na końcu zakresu staje się nieaktywna — fokus na drugą
    var ta = karta.querySelector('[data-akcja="miesiac"][data-kierunek="' + kierunek + '"]');
    var druga = karta.querySelector('[data-akcja="miesiac"][data-kierunek="' + -kierunek + '"]');
    if (ta && ta.disabled && druga && document.activeElement === document.body) druga.focus();
    oglos(nazwaMiesiaca(stan.miesiac));
  }

  /** Strzałki w kalendarzu: ←/→ dzień, ↑/↓ tydzień (Tab i Enter działają zawsze). */
  function strzalkaWKalendarzu(e, el) {
    var krok = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!krok) return;
    var cel = dodajDni(el.getAttribute('data-data'), krok);
    if (!dzienWgDaty(cel)) return;
    e.preventDefault();
    if (cel.slice(0, 7) !== stan.miesiac) {
      stan.miesiac = cel.slice(0, 7);
      rysuj();
    }
    var przycisk = karta.querySelector('[data-akcja="dzien"][data-data="' + cel + '"]');
    if (przycisk) przycisk.focus();
  }

  karta.addEventListener('click', function (e) {
    var el = e.target.closest('[data-akcja]');
    if (!el || !karta.contains(el) || el.disabled) return;
    var akcja = el.getAttribute('data-akcja');
    if (akcja === 'krok') idzDoKroku(Number(el.getAttribute('data-krok')));
    else if (akcja === 'dalej') idzDoKroku(stan.krok + 1);
    else if (akcja === 'miejsce') wybierzMiejsce(el.getAttribute('data-id'));
    else if (akcja === 'dlugosc') wybierzDlugosc(Number(el.getAttribute('data-h')));
    else if (akcja === 'dzien') wybierzDzien(el.getAttribute('data-data'));
    else if (akcja === 'godzina') wybierzGodzine(Number(el.getAttribute('data-start')));
    else if (akcja === 'najblizszy') skoczDoNajblizszego();
    else if (akcja === 'miesiac') zmienMiesiac(Number(el.getAttribute('data-kierunek')));
    else if (akcja === 'wroc-kalendarz') {
      stan.godzinyNaTelefonie = false;
      rysuj();
      fokusNa(stan.wybranaData ? '[data-akcja="dzien"][data-data="' + stan.wybranaData + '"]' : '.gk-tytul');
    } else if (akcja === 'zadatek') zglosZadatek();
    else if (akcja === 'kolejna') {
      stan.rezerwacja = null;
      stan.zadatek = '';
      stan.wybranaData = null; // od nowa: dzień z najbliższym wolnym terminem
      stan.miesiac = null;
      stan.krok = krokDostepny(3) ? 3 : 1;
      stan.godzinyNaTelefonie = false;
      rysuj();
      fokusNa();
    } else if (akcja === 'ponow') {
      stan.dostep = 'ladowanie';
      rysuj();
      start();
    }
  });

  karta.addEventListener('change', function (e) {
    if (e.target.id === 'gk-inna') pokazKierowce(true);
  });

  karta.addEventListener('submit', function (e) {
    if (e.target.id !== 'gk-form') return;
    e.preventDefault();
    wyslij();
  });

  karta.addEventListener('keydown', function (e) {
    var el = e.target;
    if (el.getAttribute && el.getAttribute('data-akcja') === 'dzien') strzalkaWKalendarzu(e, el);
  });

  // Przy zmianie języka przerysowujemy kartę — to treść generowana w JS,
  // poza zasięgiem generycznego i18n.js. Wpisane dane formularza zostają.
  document.addEventListener('jd:jezyk', function () {
    if (stan.dostep !== 'ladowanie') rysuj();
  });

  start();
})();
