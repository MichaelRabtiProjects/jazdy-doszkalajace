/* Grafik wolnych terminów + formularz wstępnej rezerwacji.

   Kolejność kroków: długość jazdy → miejsce spotkania (obowiązkowe) →
   godzina (widok dnia albo tygodnia) → formularz. Miejsce musi być pierwsze,
   bo od niego zależą godziny (czas dojazdu instruktora między jazdami)
   i cena (+15 zł/h, gdy trzeba dojechać z dalszego miejsca).

   Termin po wysłaniu formularza zajmuje się jako "wstępna rezerwacja — czeka
   na potwierdzenie", a instruktor potwierdza go albo odrzuca w panelu.
   Zamiast formularza można nadal napisać SMS / WhatsApp / e-mail.

   Wersja z płatnością online (Autopay) jest zachowana w tagu `autopay-wersja`. */

(function () {
  'use strict';

  var TELEFON = '+48690360164';
  var TELEFON_ZAPIS = '690 360 164';
  /* wa.me wymaga samych cyfr, bez znaku '+' i bez spacji */
  var TELEFON_WA = '48690360164';
  var EMAIL = 'michaelrabti@gmail.com';

  /* ------------------------------------------------------------------ */
  /* Dwujęzyczność — cała treść tej sekcji jest generowana w JS (dni,     */
  /* godziny, panel kontaktowy), więc nie da się jej przetłumaczyć przez */
  /* zwykłe data-i18n z i18n.js. Sprawdzamy język tak samo jak reszta    */
  /* strony (window.jdJezyk z i18n.js), żeby przełącznik w nagłówku      */
  /* obejmował też grafik.                                               */
  /* ------------------------------------------------------------------ */

  function jezyk() {
    return typeof window.jdJezyk === 'function' ? window.jdJezyk() : 'pl';
  }

  var TXT = {
    grafikNiedostepny: { pl: 'Grafik jest chwilowo niedostępny.', en: 'The schedule is temporarily unavailable.' },
    zadzwonPrefiks: { pl: 'Zadzwoń: ', en: 'Call: ' },
    labelZamkniete: { pl: ', brak terminów, napisz e-mail, SMS lub WhatsApp', en: ', no available times — send an e-mail, SMS or WhatsApp message' },
    labelBrakTerminow: { pl: ', brak terminów', en: ', no available times' },
    labelWolneTerminy: { pl: ', wolne terminy', en: ', available times' },
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
    brakTerminow: { pl: 'brak terminów', en: 'no available times' },
    terminAriaLabel: { pl: 'Termin ', en: 'Time slot ' },
    terminAriaO: { pl: ' o ', en: ' at ' },
    zadzwon: { pl: 'Zadzwoń', en: 'Call' },
    zadatekBlik: {
      pl: 'Zadatek BLIK-iem na nr ',
      en: 'Deposit via BLIK (Polish mobile payment) to ',
    },
    zadatekPrzelew: {
      pl: ' — na życzenie możliwy zwykły przelew',
      en: ' — a bank transfer is available on request',
    },
    resztaGotowka: { pl: 'Reszta — przed lub po jeździe', en: 'The rest — before or after the lesson' },
    terminDrobne: {
      pl: 'Po wysłaniu formularza termin jest wstępnie zarezerwowany dla Ciebie. Potwierdzę go albo odezwę się, żeby ustalić szczegóły. Zadatek potwierdza rezerwację.',
      en: 'Once you send the form, the time is provisionally reserved for you. I’ll confirm it or get in touch to sort out the details. The deposit confirms the booking.',
    },

    /* --- Miejsce spotkania --- */
    miejsceWybierz: { pl: '— wybierz miejsce spotkania —', en: '— choose a meeting point —' },
    grupaWawer: { pl: 'Wawer — zawsze 160 zł/h', en: 'Wawer — always 160 zł/h' },
    grupaDalej: { pl: 'Pozostałe — 160 lub 175 zł/h', en: 'Other points — 160 or 175 zł/h' },
    miejscePodpowiedz: {
      pl: 'Najpierw wybierz miejsce spotkania — od niego zależą wolne godziny i cena.',
      en: 'First choose a meeting point — the available times and the price depend on it.',
    },
    infoWawer: {
      pl: 'Miejsce w Wawrze — zawsze 160 zł/h.',
      en: 'A Wawer meeting point — always 160 zł/h.',
    },
    infoDalej: {
      pl: 'Godziny oznaczone „+15 zł” kosztują 175 zł/h — muszę tam dojechać z dalszego miejsca. Bez dopłaty (160 zł/h) są godziny, kiedy tego dnia i tak jestem w pobliżu.',
      en: 'Times marked “+15 zł” cost 175 zł/h — I have to drive there from further away. Times without a surcharge (160 zł/h) are when I’m already nearby that day.',
    },
    doplataZnacznik: { pl: '+15 zł', en: '+15 zł' },
    doplataAria: { pl: ', dopłata 15 zł za godzinę', en: ', 15 zł per hour surcharge' },
    legendaDoplata: {
      pl: '„+15 zł” — 175 zł/h, bo dojeżdżam z dalszego miejsca. Chcesz taniej? Wybierz miejsce w Wawrze albo bliżej innej jazdy tego dnia.',
      en: '“+15 zł” — 175 zł/h, because I’m driving over from further away. Want it cheaper? Choose a Wawer meeting point or one closer to another lesson that day.',
    },
    cenaZaGodzine: { pl: 'Cena za godzinę', en: 'Price per hour' },
    cenaDojazd: { pl: ' (w tym 15 zł/h za dojazd)', en: ' (incl. 15 zł/h travel surcharge)' },
    miejsceEtykieta: { pl: 'Miejsce: ', en: 'Meeting point: ' },

    /* --- Widok tygodniowy --- */
    tydzienZakres: { pl: 'Tydzień ', en: 'Week ' },

    /* --- Wstępne rezerwacje w grafiku --- */
    wstepnaEtykieta: { pl: 'wstępna rezerwacja', en: 'provisional' },
    wstepnaLegenda: {
      pl: 'Wstępna rezerwacja — czeka na potwierdzenie instruktora.',
      en: 'Provisional booking — waiting for the instructor to confirm.',
    },
    wstepnaAria: {
      pl: ': wstępna rezerwacja, czeka na potwierdzenie',
      en: ': provisional booking, waiting for confirmation',
    },

    /* --- Formularz --- */
    formTytul: { pl: 'Zarezerwuj ten termin', en: 'Book this time' },
    formImie: { pl: 'Imię i nazwisko', en: 'First and last name' },
    formTelefon: { pl: 'Telefon', en: 'Phone' },
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
    alternatywa: { pl: 'Wolisz napisać albo zadzwonić?', en: 'Prefer to message or call?' },

    /* --- Po wysłaniu --- */
    sukcesTytul: { pl: 'Rezerwacja wstępna przyjęta', en: 'Provisional booking received' },
    sukcesTekst: {
      pl: 'Termin jest wstępnie zarezerwowany dla Ciebie — czekaj na potwierdzenie lub kontakt od instruktora.',
      en: 'The time is provisionally reserved for you — please wait for confirmation or for the instructor to contact you.',
    },
    sukcesEmail: {
      pl: 'Szczegóły wysłałem na adres ',
      en: 'I’ve sent the details to ',
    },
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
  };

  function t(klucz) {
    return TXT[klucz][jezyk()] || TXT[klucz].pl;
  }

  var widget = document.getElementById('grafik-widget');
  if (!widget) return;

  var $ = function (id) {
    return document.getElementById(id);
  };

  var elDlugosci = $('grafik-dlugosci');
  var elMiejsce = $('grafik-miejsce');
  var elMiejsceInfo = $('grafik-miejsce-info');
  var elWidoki = $('grafik-widoki');
  var elKomunikat = $('grafik-komunikat');
  var elKalendarz = $('grafik-kalendarz');
  var elPasek = $('dni-pasek');
  var elPanelGodzin = $('godziny-panel');
  var elTydzien = $('grafik-tydzien');
  var elTydzienKolumny = $('tydzien-kolumny');
  var elTydzienZakres = $('tydzien-zakres');
  var elLegenda = $('grafik-legenda');
  var btnLewo = $('dni-lewo');
  var btnPrawo = $('dni-prawo');
  var btnTydzienLewo = $('tydzien-lewo');
  var btnTydzienPrawo = $('tydzien-prawo');

  var panel = $('termin-panel');
  var panelTytul = $('termin-tytul');
  var panelPodsumowanie = $('termin-podsumowanie');
  var panelTresc = $('termin-tresc');
  var panelZamknij = $('termin-zamknij');

  var stan = {
    dane: null,
    dlugosc: 2,
    miejsce: '',
    widok: 'dzien',
    // Indeks wybranego dnia w stan.dane.dni (widok dnia)
    wybranyIdx: null,
    // Poniedziałek wyświetlanego tygodnia, 'YYYY-MM-DD' (widok tygodnia)
    tydzienOd: null,
    wybrany: null,
    ostatnioKlikniety: null,
  };

  /* ------------------------------------------------------------------ */
  /* Pomocnicze                                                          */
  /* ------------------------------------------------------------------ */

  function dwieCyfry(n) {
    return String(n).padStart(2, '0');
  }

  /** '2026-09-22' → '22.09' */
  function krotkaData(data) {
    var cz = data.split('-');
    return cz[2] + '.' + cz[1];
  }

  /** 805 → '13:25' */
  function godz(minuty) {
    return dwieCyfry(Math.floor(minuty / 60)) + ':' + dwieCyfry(minuty % 60);
  }

  function zakres(start, dlugosc) {
    return godz(start) + '–' + godz(start + dlugosc * 60);
  }

  /* Backend (lib/czas.js) zwraca nazwę dnia zawsze po polsku — tłumaczymy
     ją tutaj, po stronie klienta, zamiast prosić API o wersję językową. */
  var DNI_EN = {
    niedziela: 'Sunday',
    poniedziałek: 'Monday',
    wtorek: 'Tuesday',
    środa: 'Wednesday',
    czwartek: 'Thursday',
    piątek: 'Friday',
    sobota: 'Saturday',
  };

  /** Pełna nazwa dnia w bieżącym języku strony (do nagłówków i podsumowań). */
  function nazwaDnia(nazwaPL) {
    return jezyk() === 'en' ? DNI_EN[nazwaPL] || nazwaPL : nazwaPL;
  }

  var SKROTY_DNI_PL = { niedziela: 'Nd', poniedziałek: 'Pon', wtorek: 'Wt', środa: 'Śr', czwartek: 'Cz', piątek: 'Pt', sobota: 'Sob' };
  var SKROTY_DNI_EN = { niedziela: 'Sun', poniedziałek: 'Mon', wtorek: 'Tue', środa: 'Wed', czwartek: 'Thu', piątek: 'Fri', sobota: 'Sat' };
  var NAZWY_TYGODNIA = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

  function skrotDnia(nazwaPL) {
    var mapa = jezyk() === 'en' ? SKROTY_DNI_EN : SKROTY_DNI_PL;
    return mapa[nazwaPL] || nazwaPL.slice(0, 2);
  }

  /** Daty jako 'YYYY-MM-DD' liczone w UTC — bez przesunięć przy zmianie czasu. */
  function dodajDni(data, ile) {
    var cz = data.split('-').map(Number);
    var d = new Date(Date.UTC(cz[0], cz[1] - 1, cz[2] + ile));
    return d.toISOString().slice(0, 10);
  }

  function dzienTygodnia(data) {
    var cz = data.split('-').map(Number);
    return new Date(Date.UTC(cz[0], cz[1] - 1, cz[2])).getUTCDay();
  }

  function poniedzialek(data) {
    return dodajDni(data, -((dzienTygodnia(data) + 6) % 7));
  }

  function miejsceWgId(id) {
    var lista = stan.dane ? stan.dane.miejsca : [];
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }

  function nazwaMiejsca(m) {
    return m ? (jezyk() === 'en' ? m.nazwa_en : m.nazwa) : '';
  }

  function terminyDnia(dzien) {
    return (dzien.terminy && dzien.terminy[stan.dlugosc]) || [];
  }

  function tekstOpisu(dzien, termin) {
    return nazwaDnia(dzien.nazwa_dnia) + ' ' + krotkaData(dzien.data) + ', ' + zakres(termin.start, stan.dlugosc) +
      ' (' + stan.dlugosc + ' h)';
  }

  /* ------------------------------------------------------------------ */
  /* Wczytanie danych                                                    */
  /* ------------------------------------------------------------------ */

  function pokazBlad(tekst) {
    elKomunikat.hidden = false;
    elKomunikat.className = 'grafik-komunikat grafik-komunikat-blad';
    elKomunikat.innerHTML =
      tekst +
      ' <a class="grafik-link-tel" href="tel:' + TELEFON + '">' + t('zadzwonPrefiks') + TELEFON_ZAPIS + '</a>';
    elKalendarz.hidden = true;
    elTydzien.hidden = true;
    elWidoki.hidden = true;
    elLegenda.hidden = true;
  }

  function wczytaj() {
    var url = '/api/dostepnosc' + (stan.miejsce ? '?miejsce=' + encodeURIComponent(stan.miejsce) : '');
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (dane) {
        stan.dane = dane;
        zaktualizujCeny();
        wypelnijMiejsca();
        rysuj();
      })
      .catch(function () {
        // Backend może jeszcze nie być wdrożony — strona ma wtedy nadal
        // działać i kierować do kontaktu telefonicznego.
        pokazBlad(t('grafikNiedostepny'));
      });
  }

  /** Ceny przy długościach liczymy ze stawki z backendu, żeby nie rozjechały się z cennikiem. */
  function zaktualizujCeny() {
    var stawka = stan.dane.stawka_godzinowa;
    elDlugosci.querySelectorAll('.dlugosc-btn').forEach(function (btn) {
      var dl = Number(btn.dataset.dlugosc);
      var cena = btn.querySelector('.dlugosc-cena');
      if (cena) cena.textContent = dl * stawka + ' zł';
    });
  }

  /** Lista miejsc w <select> — w dwóch grupach: Wawer i pozostałe. */
  function wypelnijMiejsca() {
    var wybrane = stan.miejsce;
    elMiejsce.innerHTML = '';
    var pusta = document.createElement('option');
    pusta.value = '';
    pusta.textContent = t('miejsceWybierz');
    elMiejsce.appendChild(pusta);

    [
      { etykieta: t('grupaWawer'), wawer: true },
      { etykieta: t('grupaDalej'), wawer: false },
    ].forEach(function (grupa) {
      var og = document.createElement('optgroup');
      og.label = grupa.etykieta;
      stan.dane.miejsca.forEach(function (m) {
        if (m.wawer !== grupa.wawer) return;
        var o = document.createElement('option');
        o.value = m.id;
        o.textContent = nazwaMiejsca(m);
        og.appendChild(o);
      });
      elMiejsce.appendChild(og);
    });
    elMiejsce.value = wybrane;

    var m = miejsceWgId(wybrane);
    elMiejsceInfo.hidden = !m;
    elMiejsceInfo.textContent = m ? (m.wawer ? t('infoWawer') : t('infoDalej')) : '';
  }

  elMiejsce.addEventListener('change', function () {
    stan.miejsce = elMiejsce.value;
    // Inne miejsce = inne godziny; wybrany dzień zostaje, jeśli się da
    wczytaj();
  });

  /* ------------------------------------------------------------------ */
  /* Rysowanie                                                           */
  /* ------------------------------------------------------------------ */

  /** Pierwszy dzień z wolnymi godzinami dla aktualnej długości — domyślny wybór. */
  function domyslnyIndeks(dni) {
    for (var i = 0; i < dni.length; i++) {
      if (terminyDnia(dni[i]).length) return i;
    }
    return 0;
  }

  function komunikat(tekst) {
    elKalendarz.hidden = true;
    elTydzien.hidden = true;
    elLegenda.hidden = true;
    elWidoki.hidden = true;
    elKomunikat.hidden = false;
    elKomunikat.className = 'grafik-komunikat';
    elKomunikat.textContent = tekst;
  }

  function rysuj() {
    var dni = stan.dane.dni;

    // Bez miejsca nie pokazujemy godzin — byłyby liczone bez czasu dojazdu
    // i bez ceny, czyli mogłyby się okazać nieaktualne po wyborze miejsca.
    if (!stan.miejsce) {
      komunikat(t('miejscePodpowiedz'));
      return;
    }

    var czyCokolwiek = dni.some(function (d) {
      return terminyDnia(d).length > 0;
    });
    if (!czyCokolwiek) {
      komunikat(jezyk() === 'en'
        ? 'No available times for ' + stan.dlugosc + ' h at this meeting point in the coming weeks — try a shorter lesson, another meeting point, or message me.'
        : 'Brak wolnych terminów na ' + stan.dlugosc + ' h w tym miejscu w najbliższych tygodniach — spróbuj krótszej jazdy, innego miejsca albo napisz do mnie.');
      return;
    }

    // Domyślny wybór liczymy tylko raz — zmiana długości jazdy albo
    // miejsca nie ma przeskakiwać klientowi wybranego dnia.
    if (stan.wybranyIdx === null || stan.wybranyIdx >= dni.length) {
      stan.wybranyIdx = domyslnyIndeks(dni);
    }
    if (!stan.tydzienOd) stan.tydzienOd = poniedzialek(dni[stan.wybranyIdx].data);

    elKomunikat.hidden = true;
    elWidoki.hidden = false;
    elWidoki.querySelectorAll('.widok-btn').forEach(function (b) {
      var aktywny = b.dataset.widok === stan.widok;
      b.classList.toggle('is-active', aktywny);
      b.setAttribute('aria-pressed', String(aktywny));
    });

    // Ukryty widok czyścimy, żeby w DOM nie zostały nieaktualne przyciski
    if (stan.widok === 'tydzien') {
      elKalendarz.hidden = true;
      elPasek.innerHTML = '';
      elPanelGodzin.innerHTML = '';
      elTydzien.hidden = false;
      rysujTydzien();
    } else {
      elTydzien.hidden = true;
      elTydzienKolumny.innerHTML = '';
      elKalendarz.hidden = false;
      rysujPasek();
      rysujGodziny();
      wysrodkujChip(stan.wybranyIdx, 'auto');
      aktualizujStrzalki();
    }
    rysujLegende();
  }

  /** Legenda pod grafikiem: dopłata i wstępne rezerwacje, jeśli widać je w bieżącym widoku. */
  function rysujLegende() {
    var widoczneDni = stan.widok === 'tydzien' ? dniTygodnia().filter(Boolean) : [stan.dane.dni[stan.wybranyIdx]];
    var jestDoplata = widoczneDni.some(function (d) {
      return terminyDnia(d).some(function (x) {
        return x.doplata > 0;
      });
    });
    var jestWstepna = widoczneDni.some(function (d) {
      return d.wstepne && d.wstepne.length;
    });
    var teksty = [];
    if (jestDoplata) teksty.push(t('legendaDoplata'));
    if (jestWstepna) teksty.push(t('wstepnaLegenda'));
    elLegenda.hidden = teksty.length === 0;
    elLegenda.textContent = teksty.join(' ');
  }

  /** Pigułka z godziną — wspólna dla widoku dnia i tygodnia. */
  function przyciskTerminu(dzien, termin) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'godzina-btn' + (termin.doplata > 0 ? ' godzina-btn-doplata' : '');
    btn.innerHTML =
      '<span class="godzina-btn-czas">' + godz(termin.start) + '</span>' +
      (termin.doplata > 0 ? '<span class="godzina-btn-doplata-znacznik" aria-hidden="true">' + t('doplataZnacznik') + '</span>' : '');
    btn.setAttribute(
      'aria-label',
      t('terminAriaLabel') + nazwaDnia(dzien.nazwa_dnia) + ' ' + krotkaData(dzien.data) +
        t('terminAriaO') + godz(termin.start) + (termin.doplata > 0 ? t('doplataAria') : '')
    );
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', function () {
      // Po zamknięciu panelu kursant widzi, którą godzinę ostatnio
      // oglądał — wyróżnienie zostaje tylko na jednej pigułce.
      widget.querySelectorAll('.godzina-btn.is-wybrana').forEach(function (b) {
        b.classList.remove('is-wybrana');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-wybrana');
      btn.setAttribute('aria-pressed', 'true');
      otworzPanel(dzien, termin, btn);
    });
    return btn;
  }

  function elementWstepnej(w) {
    var el = document.createElement('div');
    el.className = 'godzina-wstepna';
    el.setAttribute('role', 'note');
    el.setAttribute('aria-label', godz(w.start) + '–' + godz(w.koniec) + t('wstepnaAria'));
    el.innerHTML =
      '<span class="godzina-wstepna-czas" aria-hidden="true">' + godz(w.start) + '</span>' +
      '<span class="godzina-wstepna-opis" aria-hidden="true">' + t('wstepnaEtykieta') + '</span>';
    return el;
  }

  /** Wolne godziny i wstępne rezerwacje dnia, po kolei według godziny. */
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

  /* ---- Widok dnia: pasek dni + godziny wybranego dnia ------------------ */

  function rysujPasek() {
    elPasek.innerHTML = '';

    stan.dane.dni.forEach(function (dzien, i) {
      var zamkniety = dzien.aktywny === false;
      var pelny = !zamkniety && terminyDnia(dzien).length === 0;

      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className =
        'dzien-chip ' +
        (zamkniety ? 'dzien-chip-zamkniety' : pelny ? 'dzien-chip-pelny' : 'dzien-chip-wolny') +
        (i === stan.wybranyIdx ? ' is-wybrany' : '');
      chip.setAttribute('aria-pressed', i === stan.wybranyIdx ? 'true' : 'false');
      chip.setAttribute(
        'aria-label',
        nazwaDnia(dzien.nazwa_dnia) + ' ' + krotkaData(dzien.data) +
          (zamkniety ? t('labelZamkniete') : pelny ? t('labelBrakTerminow') : t('labelWolneTerminy'))
      );
      chip.innerHTML =
        '<span class="dzien-chip-nazwa" aria-hidden="true">' + skrotDnia(dzien.nazwa_dnia) + '</span>' +
        '<span class="dzien-chip-data" aria-hidden="true">' + krotkaData(dzien.data) + '</span>' +
        '<span class="dzien-chip-kropka" aria-hidden="true"></span>';
      chip.addEventListener('click', function () {
        wybierzDzien(i);
      });
      elPasek.appendChild(chip);
    });
  }

  /** Zachęta do kontaktu w dniu, w którym nie pracuję (e-mail/SMS przed telefonem). */
  function kontaktDniaZamknietego(dzien) {
    var angielski = jezyk() === 'en';
    var opis = nazwaDnia(dzien.nazwa_dnia) + ' ' + krotkaData(dzien.data);
    var tresc = angielski
      ? 'Hello, I’d like to ask about a possible time for a refresher driving lesson on ' + opis + '.'
      : 'Dzień dobry, chciałbym zapytać o możliwy termin jazdy doszkalającej w ' + opis + '.';
    var temat = angielski ? 'Question about a time: ' + opis : 'Pytanie o termin: ' + opis;
    var mail = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(temat) + '&body=' + encodeURIComponent(tresc);
    var sms = 'sms:' + TELEFON + '?body=' + encodeURIComponent(tresc);
    var whatsapp = 'https://wa.me/' + TELEFON_WA + '?text=' + encodeURIComponent(tresc);

    var frag = document.createDocumentFragment();
    var kontakt = document.createElement('p');
    kontakt.className = 'dzien-brak';
    kontakt.textContent = t('kontaktZachetaTekst');
    frag.appendChild(kontakt);

    var akcje = document.createElement('div');
    akcje.className = 'termin-akcje termin-akcje-kanaly';
    akcje.innerHTML =
      '<a class="btn btn-secondary" href="' + mail + '">' + t('przyciskEmail') + '</a>' +
      '<a class="btn btn-secondary" href="' + sms + '">' + t('przyciskSms') + '</a>' +
      '<a class="btn btn-secondary" href="' + whatsapp + '" target="_blank" rel="noopener">' + t('przyciskWhatsapp') + '</a>' +
      '<a class="btn btn-secondary" href="tel:' + TELEFON + '">' + t('przyciskTelefon') + '</a>';
    frag.appendChild(akcje);
    return frag;
  }

  function rysujGodziny() {
    var dzien = stan.dane.dni[stan.wybranyIdx];
    var elementy = elementyDnia(dzien);
    var nieaktywny = dzien.aktywny === false;

    elPanelGodzin.innerHTML = '';

    var karta = document.createElement('div');
    karta.className =
      'dzien' + (nieaktywny ? ' dzien-nieaktywny' : terminyDnia(dzien).length === 0 ? ' dzien-pusty' : '');
    if (nieaktywny) karta.setAttribute('aria-disabled', 'true');

    var head = document.createElement('header');
    head.className = 'dzien-naglowek';
    head.innerHTML =
      '<span class="dzien-nazwa">' + nazwaDnia(dzien.nazwa_dnia) + '</span>' +
      '<span class="dzien-data">' + krotkaData(dzien.data) + '</span>';
    karta.appendChild(head);

    if (nieaktywny) {
      karta.appendChild(kontaktDniaZamknietego(dzien));
    } else if (elementy.length === 0) {
      var brak = document.createElement('p');
      brak.className = 'dzien-brak';
      brak.textContent = t('brakTerminow');
      karta.appendChild(brak);
    } else {
      var lista = document.createElement('div');
      lista.className = 'dzien-godziny';
      elementy.forEach(function (el) {
        lista.appendChild(el.wstepna ? elementWstepnej(el.wstepna) : przyciskTerminu(dzien, el.termin));
      });
      karta.appendChild(lista);
    }

    elPanelGodzin.appendChild(karta);
  }

  function wybierzDzien(i) {
    if (i === stan.wybranyIdx) return;
    stan.wybranyIdx = i;
    stan.tydzienOd = poniedzialek(stan.dane.dni[i].data);
    rysujPasek();
    rysujGodziny();
    rysujLegende();
    wysrodkujChip(i, 'smooth');
    aktualizujStrzalki();
  }

  /** Przewija pasek tak, żeby wybrany chip był w widoku (np. po zmianie długości jazdy). */
  function wysrodkujChip(i, zachowanie) {
    var chip = elPasek.children[i];
    if (chip && chip.scrollIntoView) {
      chip.scrollIntoView({ behavior: zachowanie || 'smooth', inline: 'nearest', block: 'nearest' });
    }
  }

  /** Wyłącza strzałkę, gdy pasek jest już przewinięty do końca w tę stronę. */
  function aktualizujStrzalki() {
    // Drobne opóźnienie, żeby scrollWidth był policzony po dopisaniu chipów do DOM.
    requestAnimationFrame(function () {
      btnLewo.disabled = elPasek.scrollLeft <= 1;
      btnPrawo.disabled = elPasek.scrollLeft + elPasek.clientWidth >= elPasek.scrollWidth - 1;
    });
  }

  btnLewo.addEventListener('click', function () {
    elPasek.scrollBy({ left: -220, behavior: 'smooth' });
  });
  btnPrawo.addEventListener('click', function () {
    elPasek.scrollBy({ left: 220, behavior: 'smooth' });
  });
  elPasek.addEventListener('scroll', aktualizujStrzalki);
  window.addEventListener('resize', aktualizujStrzalki);

  /* ---- Widok tygodnia: 7 kolumn od poniedziałku (jak w Calendesku) ---- */

  /** Dni wyświetlanego tygodnia (pon–nd); null dla dni spoza grafiku (przeszłość / za daleko). */
  function dniTygodnia() {
    var wynik = [];
    for (var k = 0; k < 7; k++) {
      var data = dodajDni(stan.tydzienOd, k);
      var dzien = null;
      for (var i = 0; i < stan.dane.dni.length; i++) {
        if (stan.dane.dni[i].data === data) dzien = stan.dane.dni[i];
      }
      wynik.push(dzien || { data: data, poza: true });
    }
    return wynik;
  }

  function rysujTydzien() {
    var dni = stan.dane.dni;
    var pierwszyTydzien = poniedzialek(dni[0].data);
    var ostatniTydzien = poniedzialek(dni[dni.length - 1].data);
    if (stan.tydzienOd < pierwszyTydzien) stan.tydzienOd = pierwszyTydzien;
    if (stan.tydzienOd > ostatniTydzien) stan.tydzienOd = ostatniTydzien;

    btnTydzienLewo.disabled = stan.tydzienOd <= pierwszyTydzien;
    btnTydzienPrawo.disabled = stan.tydzienOd >= ostatniTydzien;
    elTydzienZakres.textContent =
      t('tydzienZakres') + krotkaData(stan.tydzienOd) + ' – ' + krotkaData(dodajDni(stan.tydzienOd, 6));

    elTydzienKolumny.innerHTML = '';
    dniTygodnia().forEach(function (dzien) {
      var nazwaPL = NAZWY_TYGODNIA[dzienTygodnia(dzien.data)];
      var kol = document.createElement('div');
      var zamkniety = !dzien.poza && dzien.aktywny === false;
      var terminy = dzien.poza ? [] : terminyDnia(dzien);
      kol.className =
        'tydzien-kolumna' +
        (dzien.poza ? ' tydzien-kolumna-poza' : zamkniety ? ' tydzien-kolumna-zamknieta' : terminy.length === 0 ? ' tydzien-kolumna-pelna' : '');

      var naglowek = document.createElement('div');
      naglowek.className = 'tydzien-kolumna-naglowek';
      naglowek.innerHTML =
        '<span class="tydzien-kolumna-nazwa">' + skrotDnia(nazwaPL) + '</span>' +
        '<span class="tydzien-kolumna-data">' + krotkaData(dzien.data) + '</span>';
      kol.appendChild(naglowek);

      var tresc = document.createElement('div');
      tresc.className = 'tydzien-kolumna-godziny';
      if (dzien.poza) {
        tresc.innerHTML = '<span class="tydzien-pusto">—</span>';
      } else if (zamkniety) {
        // Klik w zamknięty dzień przełącza na widok dnia z przyciskami kontaktu
        var link = document.createElement('button');
        link.type = 'button';
        link.className = 'tydzien-pusto tydzien-pusto-link';
        link.textContent = t('brakTerminow');
        link.addEventListener('click', function () {
          stan.widok = 'dzien';
          stan.wybranyIdx = stan.dane.dni.indexOf(dzien);
          rysuj();
        });
        tresc.appendChild(link);
      } else {
        var elementy = elementyDnia(dzien);
        if (elementy.length === 0) {
          tresc.innerHTML = '<span class="tydzien-pusto">' + t('brakTerminow') + '</span>';
        }
        elementy.forEach(function (el) {
          tresc.appendChild(el.wstepna ? elementWstepnej(el.wstepna) : przyciskTerminu(dzien, el.termin));
        });
      }
      kol.appendChild(tresc);
      elTydzienKolumny.appendChild(kol);
    });
  }

  btnTydzienLewo.addEventListener('click', function () {
    stan.tydzienOd = dodajDni(stan.tydzienOd, -7);
    rysujTydzien();
    rysujLegende();
  });
  btnTydzienPrawo.addEventListener('click', function () {
    stan.tydzienOd = dodajDni(stan.tydzienOd, 7);
    rysujTydzien();
    rysujLegende();
  });

  elWidoki.querySelectorAll('.widok-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      stan.widok = btn.dataset.widok;
      if (stan.dane) rysuj();
    });
  });

  elDlugosci.querySelectorAll('.dlugosc-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      stan.dlugosc = Number(btn.dataset.dlugosc);
      elDlugosci.querySelectorAll('.dlugosc-btn').forEach(function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      if (stan.dane) rysuj();
    });
  });

  /* ------------------------------------------------------------------ */
  /* Panel wybranego terminu                                             */
  /* ------------------------------------------------------------------ */

  function otworzPanel(dzien, termin, zrodlo) {
    stan.wybrany = { dzien: dzien, termin: termin, miejsce: stan.miejsce };
    stan.ostatnioKlikniety = zrodlo;

    var opis = tekstOpisu(dzien, termin);
    var m = miejsceWgId(stan.miejsce);
    panelPodsumowanie.textContent = opis + ' · ' + nazwaMiejsca(m);
    panelTytul.textContent = t('formTytul');
    panelTresc.innerHTML = formularzHtml(termin) + alternatywaHtml(opis + ', ' + t('miejsceEtykieta') + nazwaMiejsca(m));
    podepnijFormularz();

    panel.hidden = false;
    document.body.classList.add('panel-open');
    panelZamknij.focus();
  }

  function zamknijPanel() {
    panel.hidden = true;
    document.body.classList.remove('panel-open');
    panelTresc.innerHTML = '';
    if (stan.ostatnioKlikniety && document.body.contains(stan.ostatnioKlikniety)) {
      stan.ostatnioKlikniety.focus();
    }
  }

  panelZamknij.addEventListener('click', zamknijPanel);

  panel.addEventListener('click', function (e) {
    if (e.target === panel) zamknijPanel();
  });

  document.addEventListener('keydown', function (e) {
    if (!panel.hidden && e.key === 'Escape') zamknijPanel();
  });

  /* --- Treść panelu --------------------------------------------------- */

  function kwotyHtml(termin) {
    // Kwoty bierzemy z ustawień w bazie, a nie z kodu — zadatek zmienia się
    // z panelu i nie może wymagać wdrożenia strony na nowo. Ostateczną cenę
    // i tak liczy serwer przy zapisie; tu tylko ją pokazujemy.
    var zadatek = stan.dane.kwota_zadatku;
    var cena = stan.dane.stawka_godzinowa + (termin.doplata || 0);
    var doZaplaty = stan.dlugosc * cena - zadatek;
    return (
      '<div class="termin-kwoty">' +
      '<p><span>' + t('cenaZaGodzine') + (termin.doplata > 0 ? t('cenaDojazd') : '') +
      '</span><strong>' + cena + ' zł</strong></p>' +
      '<p><span>' + t('zadatekBlik') + TELEFON_ZAPIS + (jezyk() === 'en' ? t('zadatekPrzelew') : '') +
      '</span><strong>' + zadatek + ' zł</strong></p>' +
      '<p><span>' + t('resztaGotowka') + '</span><strong>' + doZaplaty + ' zł</strong></p>' +
      '</div>'
    );
  }

  function formularzHtml(termin) {
    return (
      kwotyHtml(termin) +
      '<form id="termin-form" class="termin-form" novalidate>' +
      '<label for="rez-imie">' + t('formImie') + '</label>' +
      '<input id="rez-imie" name="imie" type="text" required minlength="3" maxlength="80" autocomplete="name">' +
      '<label for="rez-telefon">' + t('formTelefon') + '</label>' +
      '<input id="rez-telefon" name="telefon" type="tel" required maxlength="25" autocomplete="tel" inputmode="tel">' +
      '<label for="rez-email">' + t('formEmail') + '</label>' +
      '<input id="rez-email" name="email" type="email" required maxlength="120" autocomplete="email">' +
      // Pułapka na boty: człowiek tego pola nie widzi (ani czytnik ekranu),
      // automat wypełniający wszystko jak leci — tak, i serwer go odrzuci.
      '<div class="termin-pulapka" aria-hidden="true">' +
      '<label for="rez-strona">Strona www</label>' +
      '<input id="rez-strona" name="strona" type="text" tabindex="-1" autocomplete="off">' +
      '</div>' +
      '<label class="termin-zgoda">' +
      '<input type="checkbox" id="rez-zgoda" required>' +
      '<span>' + t('formZgoda') + '</span>' +
      '</label>' +
      '<p class="termin-blad" id="rez-blad" role="alert" hidden></p>' +
      '<button type="submit" class="btn btn-primary">' + t('formWyslij') + '</button>' +
      '<p class="termin-drobne">' + t('terminDrobne') + '</p>' +
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
      '<div class="termin-alternatywa">' +
      '<p class="termin-alternatywa-tytul">' + t('alternatywa') + '</p>' +
      '<div class="termin-akcje termin-akcje-kanaly">' +
      '<a class="btn btn-secondary" href="' + sms + '">' + t('przyciskSms') + '</a>' +
      '<a class="btn btn-secondary" href="' + whatsapp + '" target="_blank" rel="noopener">' + t('przyciskWhatsapp') + '</a>' +
      '<a class="btn btn-secondary" href="' + mail + '">' + t('przyciskEmail') + '</a>' +
      '<a class="btn btn-secondary" href="tel:' + TELEFON + '">' + t('zadzwon') + '</a>' +
      '</div>' +
      '</div>'
    );
  }

  function podepnijFormularz() {
    var form = $('termin-form');
    var blad = $('rez-blad');
    var przycisk = form.querySelector('button[type="submit"]');

    function pole(id) {
      return $(id).value;
    }

    function pokazBladFormularza(tekst) {
      blad.textContent = tekst;
      blad.hidden = false;
      przycisk.disabled = false;
      przycisk.textContent = t('formWyslij');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      blad.hidden = true;

      // Pola sprawdza dokładnie serwer (i odpowiada w języku strony);
      // tutaj tylko to, czego nie ma sensu wysyłać.
      if (!$('rez-zgoda').checked) {
        pokazBladFormularza(t('formBrakZgody'));
        return;
      }

      przycisk.disabled = true;
      przycisk.textContent = t('formWysylanie');

      fetch('/api/rezerwacja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: stan.wybrany.dzien.data,
          start: stan.wybrany.termin.start,
          dlugosc: stan.dlugosc,
          miejsce: stan.wybrany.miejsce,
          imie: pole('rez-imie'),
          telefon: pole('rez-telefon'),
          email: pole('rez-email'),
          strona: pole('rez-strona'),
          zgoda_regulamin: true,
          jezyk: jezyk(),
        }),
      })
        .then(function (r) {
          return r.json().then(function (body) {
            return { ok: r.ok, body: body };
          });
        })
        .then(function (wynik) {
          if (!wynik.ok) {
            pokazBladFormularza(wynik.body.blad || t('formBladOgolny'));
            // Termin mógł właśnie zniknąć — odświeżamy grafik pod spodem
            if (wynik.body.kod === 'TERMIN_ZAJETY' || wynik.body.kod === 'ZAMKNIETE') wczytaj();
            return;
          }
          pokazSukces(wynik.body, pole('rez-email').trim());
          wczytaj();
        })
        .catch(function () {
          pokazBladFormularza(t('formBrakPolaczenia'));
        });
    });
  }

  /** Ekran po wysłaniu formularza: kod, zadatek i przycisk "Zadatek wysłany". */
  function pokazSukces(rez, email) {
    var info = rez.email_wyslany
      ? '<p class="termin-info">' + t('sukcesEmail') + '<strong class="termin-email"></strong>' + t('sukcesEmailSpam') + '</p>'
      : '<p class="termin-info">' + t('sukcesBezEmaila') + '</p>';

    panelTytul.textContent = t('sukcesTytul');
    panelTresc.innerHTML =
      '<p class="termin-sukces">' + t('sukcesTekst') + '</p>' +
      '<p class="termin-info">' + t('kodLabel') + ': <strong class="termin-kod">' + rez.kod_rezerwacji + '</strong></p>' +
      info +
      '<div class="termin-kwoty">' +
      '<p><span>' + t('cenaZaGodzine') + (rez.doplata_h > 0 ? t('cenaDojazd') : '') + '</span><strong>' + rez.cena_za_godzine + ' zł</strong></p>' +
      '<p><span>' + t('zadatekBlik') + TELEFON_ZAPIS + '</span><strong>' + rez.kwota_zadatku + ' zł</strong></p>' +
      '<p><span>' + t('resztaGotowka') + '</span><strong>' + rez.do_zaplaty_na_miejscu + ' zł</strong></p>' +
      '</div>' +
      '<p class="termin-drobne">' + t('zadatekKrok') + '</p>' +
      '<div class="termin-akcje"><button type="button" class="btn btn-primary" id="rez-zadatek">' + t('przyciskZadatek') + '</button></div>' +
      '<p class="termin-blad" id="rez-zadatek-blad" role="alert" hidden></p>';

    // Adres e-mail wstawiamy przez textContent, nie przez HTML — to tekst
    // wpisany przez użytkownika.
    var elEmail = panelTresc.querySelector('.termin-email');
    if (elEmail) elEmail.textContent = email;

    var btn = $('rez-zadatek');
    var bladZadatku = $('rez-zadatek-blad');
    btn.addEventListener('click', function () {
      btn.disabled = true;
      bladZadatku.hidden = true;
      fetch('/api/zadatek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rez.token }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          var akcje = btn.parentNode;
          akcje.innerHTML = '<p class="termin-sukces">' + t('zadatekDzieki') + '</p>';
        })
        .catch(function () {
          btn.disabled = false;
          bladZadatku.textContent = t('formBrakPolaczenia');
          bladZadatku.hidden = false;
        });
    });

    panelZamknij.focus();
  }

  // Przy zmianie języka trzeba przerysować grafik ręcznie — to treść
  // generowana w JS, poza zasięgiem generycznego i18n.js. Modala wyboru
  // terminu nie trzeba tu obsługiwać: kiedy jest otwarty, i tak zasłania
  // nagłówek z przełącznikiem języka (z-index), więc nie da się go kliknąć.
  document.addEventListener('jd:jezyk', function () {
    if (!stan.dane) return;
    wypelnijMiejsca();
    rysuj();
  });

  wczytaj();
})();
