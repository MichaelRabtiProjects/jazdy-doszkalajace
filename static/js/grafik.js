/* Grafik wolnych terminów + formularz wstępnej rezerwacji.

   Kursant wybiera dzień i godzinę, wpisuje imię i nazwisko, telefon
   i e-mail. Termin od razu zajmuje się jako "wstępna rezerwacja — czeka na
   potwierdzenie", a instruktor potwierdza go albo odrzuca w panelu (/admin).
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
    labelZamkniete: { pl: ', zamknięte, napisz e-mail, SMS lub WhatsApp', en: ', closed — send an e-mail, SMS or WhatsApp message' },
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

  var elDlugosci = document.getElementById('grafik-dlugosci');
  var elKomunikat = document.getElementById('grafik-komunikat');
  var elKalendarz = document.getElementById('grafik-kalendarz');
  var elPasek = document.getElementById('dni-pasek');
  var elPanelGodzin = document.getElementById('godziny-panel');
  var btnLewo = document.getElementById('dni-lewo');
  var btnPrawo = document.getElementById('dni-prawo');

  var panel = document.getElementById('termin-panel');
  var panelTytul = document.getElementById('termin-tytul');
  var panelPodsumowanie = document.getElementById('termin-podsumowanie');
  var panelTresc = document.getElementById('termin-tresc');
  var panelZamknij = document.getElementById('termin-zamknij');

  var stan = {
    dane: null,
    dlugosc: 2,
    // Indeks wybranego dnia w stan.dane.dni — dzień, którego godziny
    // pokazuje dolny panel. null dopóki nie wybrano (jeszcze) żadnego.
    wybranyIdx: null,
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

  function godzinaTekst(g) {
    return dwieCyfry(g) + ':00';
  }

  function zakresGodzin(start, dlugosc) {
    return godzinaTekst(start) + '–' + godzinaTekst(start + dlugosc);
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

  function tekstOpisu(data, godzina, dlugosc, nazwaDniaPL) {
    return (
      nazwaDnia(nazwaDniaPL) + ' ' + krotkaData(data) + ', ' + zakresGodzin(godzina, dlugosc) +
      ' (' + dlugosc + ' h)'
    );
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
  }

  function wczytaj() {
    fetch('/api/dostepnosc', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (dane) {
        stan.dane = dane;
        zaktualizujCeny();
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

  /* ------------------------------------------------------------------ */
  /* Rysowanie grafiku — pasek dni u góry, godziny wybranego dnia niżej  */
  /*                                                                     */
  /* Wcześniej grafik był jedną pionową listą wszystkich ~21 dni naraz.  */
  /* Teraz klient wybiera dzień w przewijanym pasku (jak w Calendesku),  */
  /* a poniżej widzi tylko godziny TEGO jednego dnia — mniej scrollowania*/
  /* na telefonie, gęstszy układ godzin.                                 */
  /* ------------------------------------------------------------------ */

  /** Czy slot pasuje do aktualnie wybranej długości jazdy. */
  function dlugoscPasuje(slot) {
    return slot.dlugosci.indexOf(stan.dlugosc) !== -1;
  }

  var SKROTY_DNI_PL = {
    niedziela: 'Nd',
    poniedziałek: 'Pon',
    wtorek: 'Wt',
    środa: 'Śr',
    czwartek: 'Cz',
    piątek: 'Pt',
    sobota: 'Sob',
  };

  var SKROTY_DNI_EN = {
    niedziela: 'Sun',
    poniedziałek: 'Mon',
    wtorek: 'Tue',
    środa: 'Wed',
    czwartek: 'Thu',
    piątek: 'Fri',
    sobota: 'Sat',
  };

  function skrotDnia(nazwaPL) {
    var mapa = jezyk() === 'en' ? SKROTY_DNI_EN : SKROTY_DNI_PL;
    return mapa[nazwaPL] || nazwaPL.slice(0, 2);
  }

  /** Pierwszy dzień z wolnymi godzinami dla aktualnej długości — domyślny wybór. */
  function domyslnyIndeks(dni) {
    for (var i = 0; i < dni.length; i++) {
      if (dni[i].sloty.some(dlugoscPasuje)) return i;
    }
    return 0;
  }

  function rysuj() {
    var dni = stan.dane.dni;

    // Dzień bez wolnych godzin (zamknięty albo zajęty) ma zawsze pustą
    // listę sloty z backendu — nie trzeba osobno sprawdzać dzien.aktywny.
    var czyCokolwiek = dni.some(function (d) {
      return d.sloty.some(dlugoscPasuje);
    });

    if (!czyCokolwiek) {
      elKalendarz.hidden = true;
      elKomunikat.hidden = false;
      elKomunikat.className = 'grafik-komunikat';
      elKomunikat.textContent = jezyk() === 'en'
        ? 'No available times for ' + stan.dlugosc + ' h in the coming weeks — try a shorter lesson or give us a call.'
        : 'Brak wolnych terminów na ' + stan.dlugosc + ' h w najbliższych tygodniach — spróbuj krótszej jazdy albo zadzwoń.';
      return;
    }

    // Domyślny wybór liczymy tylko raz, przy pierwszym renderze — zmiana
    // długości jazdy nie ma przeskakiwać klientowi wybranego dnia.
    if (stan.wybranyIdx === null || stan.wybranyIdx >= dni.length) {
      stan.wybranyIdx = domyslnyIndeks(dni);
    }

    elKomunikat.hidden = true;
    elKalendarz.hidden = false;
    rysujPasek();
    rysujGodziny();
    wysrodkujChip(stan.wybranyIdx, 'auto');
    aktualizujStrzalki();
  }

  /** Górny pasek: po jednej małej karcie ("chipie") na każdy dzień horyzontu. */
  function rysujPasek() {
    elPasek.innerHTML = '';

    stan.dane.dni.forEach(function (dzien, i) {
      var pasujace = dzien.sloty.filter(dlugoscPasuje);
      var zamkniety = dzien.aktywny === false;
      var pelny = !zamkniety && pasujace.length === 0;

      // Kolor kropki i tła chipa odróżnia trzy stany dnia — tak samo jak
      // kolor karty w panelu godzin niżej. Opis dla czytników ekranu
      // rozróżnia to samo: zamknięty dzień proponuje kontakt, zajęty dzień
      // mówi wprost, że nie ma wolnych godzin (patrz rysujGodziny).
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
          (zamkniety ? t('labelZamkniete')
            : pelny ? t('labelBrakTerminow')
            : t('labelWolneTerminy'))
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

  /** Dolny panel: godziny WYBRANEGO dnia, w gęstszej siatce niż dawna lista. */
  function rysujGodziny() {
    var dzien = stan.dane.dni[stan.wybranyIdx];
    var pasujace = dzien.sloty.filter(dlugoscPasuje);
    var nieaktywny = dzien.aktywny === false;
    // Starsza wersja API (przed wdrożeniem formularza) nie zwraca tego pola
    var wstepne = dzien.wstepne || [];

    elPanelGodzin.innerHTML = '';

    var karta = document.createElement('div');
    karta.className =
      'dzien' + (nieaktywny ? ' dzien-nieaktywny' : pasujace.length === 0 ? ' dzien-pusty' : '');
    if (nieaktywny) karta.setAttribute('aria-disabled', 'true');

    var head = document.createElement('header');
    head.className = 'dzien-naglowek';
    head.innerHTML =
      '<span class="dzien-nazwa">' + nazwaDnia(dzien.nazwa_dnia) + '</span>' +
      '<span class="dzien-data">' + krotkaData(dzien.data) + '</span>';
    karta.appendChild(head);

    if (nieaktywny) {
      // Dzień poza szablonem — zachęcamy do kontaktu, ale telefon jest tu
      // ostatnią opcją: w te dni Michael może akurat prowadzić inną jazdę
      // i nie odebrać. E-mail/SMS/WhatsApp przeczyta, jak tylko będzie mógł.
      var angielski = jezyk() === 'en';
      var opis = nazwaDnia(dzien.nazwa_dnia) + ' ' + krotkaData(dzien.data);
      var tresc = angielski
        ? 'Hello, I’d like to ask about a possible time for a refresher driving lesson on ' + opis + '.'
        : 'Dzień dobry, chciałbym zapytać o możliwy termin jazdy doszkalającej w ' + opis + '.';
      var temat = angielski ? 'Question about a time: ' + opis : 'Pytanie o termin: ' + opis;
      var mail =
        'mailto:' + EMAIL +
        '?subject=' + encodeURIComponent(temat) +
        '&body=' + encodeURIComponent(tresc);
      var sms = 'sms:' + TELEFON + '?body=' + encodeURIComponent(tresc);
      var whatsapp = 'https://wa.me/' + TELEFON_WA + '?text=' + encodeURIComponent(tresc);

      var kontakt = document.createElement('p');
      kontakt.className = 'dzien-brak';
      kontakt.textContent = t('kontaktZachetaTekst');
      karta.appendChild(kontakt);

      var akcje = document.createElement('div');
      akcje.className = 'termin-akcje termin-akcje-kanaly';
      akcje.innerHTML =
        '<a class="btn btn-secondary" href="' + mail + '">' + t('przyciskEmail') + '</a>' +
        '<a class="btn btn-secondary" href="' + sms + '">' + t('przyciskSms') + '</a>' +
        '<a class="btn btn-secondary" href="' + whatsapp + '" target="_blank" rel="noopener">' + t('przyciskWhatsapp') + '</a>' +
        '<a class="btn btn-secondary" href="tel:' + TELEFON + '">' + t('przyciskTelefon') + '</a>';
      karta.appendChild(akcje);
    } else if (pasujace.length === 0 && wstepne.length === 0) {
      // Dzień otwarty, ale w pełni zajęty — inny komunikat niż wyżej,
      // bo tu telefon nic nie zmieni, po prostu nie ma wolnego terminu.
      var brak = document.createElement('p');
      brak.className = 'dzien-brak';
      brak.textContent = t('brakTerminow');
      karta.appendChild(brak);
    } else {
      var lista = document.createElement('div');
      lista.className = 'dzien-godziny';

      // Wolne godziny i wstępne rezerwacje w jednej siatce, po kolei według
      // godziny — kursant od razu widzi, że np. 14:00 "już ktoś wziął".
      var elementy = pasujace.map(function (slot) {
        return { godzina: slot.godzina, slot: slot };
      }).concat(wstepne.map(function (w) {
        return { godzina: w.godzina_start, wstepna: w };
      })).sort(function (a, b) {
        return a.godzina - b.godzina;
      });

      elementy.forEach(function (el) {
        if (el.wstepna) {
          var zajety = document.createElement('div');
          zajety.className = 'godzina-wstepna';
          zajety.setAttribute('role', 'note');
          zajety.setAttribute(
            'aria-label',
            zakresGodzin(el.wstepna.godzina_start, el.wstepna.godzina_koniec - el.wstepna.godzina_start) + t('wstepnaAria')
          );
          zajety.innerHTML =
            '<span class="godzina-wstepna-czas" aria-hidden="true">' + godzinaTekst(el.wstepna.godzina_start) + '</span>' +
            '<span class="godzina-wstepna-opis" aria-hidden="true">' + t('wstepnaEtykieta') + '</span>';
          lista.appendChild(zajety);
          return;
        }
        var slot = el.slot;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'godzina-btn';
        btn.textContent = godzinaTekst(slot.godzina);
        btn.setAttribute(
          'aria-label',
          t('terminAriaLabel') + nazwaDnia(dzien.nazwa_dnia) + ' ' + krotkaData(dzien.data) +
            t('terminAriaO') + godzinaTekst(slot.godzina)
        );
        btn.setAttribute('aria-pressed', 'false');
        btn.addEventListener('click', function () {
          // Po zamknięciu panelu kursant widzi, którą godzinę ostatnio
          // oglądał — wyróżnienie zostaje tylko na jednej pigułce.
          lista.querySelectorAll('.godzina-btn.is-wybrana').forEach(function (b) {
            b.classList.remove('is-wybrana');
            b.setAttribute('aria-pressed', 'false');
          });
          btn.classList.add('is-wybrana');
          btn.setAttribute('aria-pressed', 'true');
          otworzPanel(dzien, slot.godzina, btn);
        });
        lista.appendChild(btn);
      });
      karta.appendChild(lista);

      if (wstepne.length) {
        var legenda = document.createElement('p');
        legenda.className = 'godzina-wstepna-legenda';
        legenda.textContent = t('wstepnaLegenda');
        karta.appendChild(legenda);
      }
    }

    elPanelGodzin.appendChild(karta);
  }

  function wybierzDzien(i) {
    if (i === stan.wybranyIdx) return;
    stan.wybranyIdx = i;
    rysujPasek();
    rysujGodziny();
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

  function otworzPanel(dzien, godzina, zrodlo) {
    stan.wybrany = { dzien: dzien, godzina: godzina };
    stan.ostatnioKlikniety = zrodlo;

    var opis = tekstOpisu(dzien.data, godzina, stan.dlugosc, dzien.nazwa_dnia);
    panelPodsumowanie.textContent = opis;
    panelTytul.textContent = t('formTytul');
    panelTresc.innerHTML = formularzHtml() + alternatywaHtml(opis);
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

  function kwotyHtml() {
    // Kwoty bierzemy z ustawień w bazie, a nie z kodu — zadatek zmienia się
    // z panelu i nie może wymagać wdrożenia strony na nowo.
    var zadatek = stan.dane.kwota_zadatku;
    var doZaplaty = stan.dlugosc * stan.dane.stawka_godzinowa - zadatek;
    return (
      '<div class="termin-kwoty">' +
      '<p><span>' + t('zadatekBlik') + TELEFON_ZAPIS + (jezyk() === 'en' ? t('zadatekPrzelew') : '') +
      '</span><strong>' + zadatek + ' zł</strong></p>' +
      '<p><span>' + t('resztaGotowka') + '</span><strong>' + doZaplaty + ' zł</strong></p>' +
      '</div>'
    );
  }

  function formularzHtml() {
    return (
      kwotyHtml() +
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
    var mail =
      'mailto:' + EMAIL +
      '?subject=' + encodeURIComponent(temat) +
      '&body=' + encodeURIComponent(tresc);

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
    var form = document.getElementById('termin-form');
    var blad = document.getElementById('rez-blad');
    var przycisk = form.querySelector('button[type="submit"]');

    function pole(id) {
      return document.getElementById(id).value;
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
      if (!document.getElementById('rez-zgoda').checked) {
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
          godzina_start: stan.wybrany.godzina,
          dlugosc: stan.dlugosc,
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

    var btn = document.getElementById('rez-zadatek');
    var bladZadatku = document.getElementById('rez-zadatek-blad');
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

  // Przy zmianie języka trzeba przerysować pasek dni i panel godzin ręcznie —
  // to treść generowana w JS, poza zasięgiem generycznego i18n.js. Modala
  // wyboru terminu nie trzeba tu obsługiwać: kiedy jest otwarty, i tak
  // zasłania nagłówek z przełącznikiem języka (z-index), więc nie da się
  // go w tym momencie kliknąć.
  document.addEventListener('jd:jezyk', function () {
    if (stan.dane) rysuj();
  });

  wczytaj();
})();
