/* Grafik wolnych terminów.

   Grafik jest informacyjny: pokazuje wolne godziny i kieruje do bezpośredniego
   kontaktu. Rezerwację wprowadza instruktor ręcznie z panelu.

   Kod trybu B (formularz rezerwacji online) jest zaparkowany — zostaje
   w pliku, ale backend zawsze zwraca platnosci_online = false, więc nigdy
   się nie wyświetli. Szczegóły: lib/ustawienia.js, tag `autopay-wersja`. */

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
    terminWolny: { pl: 'Ten termin jest wolny', en: 'This time is available' },
    kontaktIntro: {
      pl: 'Odezwij się dowolnym kanałem — termin potwierdzę od ręki. Data i godzina są już wpisane w wiadomości.',
      en: 'Reach out through any channel — I’ll confirm the time right away. The date and time are already filled in.',
    },
    zadzwon: { pl: 'Zadzwoń', en: 'Call' },
    zadatekBlik: {
      pl: 'Zadatek BLIK-iem na nr ',
      en: 'Deposit via BLIK (Polish mobile payment) to ',
    },
    zadatekPrzelew: {
      pl: ' — na życzenie możliwy zwykły przelew',
      en: ' — a bank transfer is available on request',
    },
    resztaGotowka: { pl: 'Reszta gotówką po jeździe', en: 'The rest in cash after the lesson' },
    terminDrobne: {
      pl: 'Termin rezerwuję po kontakcie — dopiero wtedy znika z grafiku. Zadatek potwierdza rezerwację.',
      en: 'I’ll lock in the time once we’re in touch — that’s when it disappears from the schedule. The deposit confirms the booking.',
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
    odliczanie: null,
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
    } else if (pasujace.length === 0) {
      // Dzień otwarty, ale w pełni zajęty — inny komunikat niż wyżej,
      // bo tu telefon nic nie zmieni, po prostu nie ma wolnego terminu.
      var brak = document.createElement('p');
      brak.className = 'dzien-brak';
      brak.textContent = t('brakTerminow');
      karta.appendChild(brak);
    } else {
      var lista = document.createElement('div');
      lista.className = 'dzien-godziny';
      pasujace.forEach(function (slot) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'godzina-btn';
        btn.textContent = godzinaTekst(slot.godzina);
        btn.setAttribute(
          'aria-label',
          t('terminAriaLabel') + nazwaDnia(dzien.nazwa_dnia) + ' ' + krotkaData(dzien.data) +
            t('terminAriaO') + godzinaTekst(slot.godzina)
        );
        btn.addEventListener('click', function () {
          otworzPanel(dzien, slot.godzina, btn);
        });
        lista.appendChild(btn);
      });
      karta.appendChild(lista);
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

    // Gałąź zaparkowana: backend zawsze zwraca platnosci_online = false
    if (stan.dane.platnosci_online) {
      panelTytul.textContent = 'Rezerwacja terminu';
      panelTresc.innerHTML = formularzHtml();
      podepnijFormularz();
    } else {
      panelTytul.textContent = t('terminWolny');
      panelTresc.innerHTML = trybKontaktowyHtml(opis);
    }

    panel.hidden = false;
    document.body.classList.add('panel-open');
    panelZamknij.focus();
  }

  function zamknijPanel() {
    panel.hidden = true;
    document.body.classList.remove('panel-open');
    panelTresc.innerHTML = '';
    if (stan.odliczanie) {
      clearInterval(stan.odliczanie);
      stan.odliczanie = null;
    }
    if (stan.ostatnioKlikniety) stan.ostatnioKlikniety.focus();
  }

  panelZamknij.addEventListener('click', zamknijPanel);

  panel.addEventListener('click', function (e) {
    if (e.target === panel) zamknijPanel();
  });

  document.addEventListener('keydown', function (e) {
    if (!panel.hidden && e.key === 'Escape') zamknijPanel();
  });

  /* --- Panel kontaktowy (jedyny tryb publiczny) --------------------- */

  function trybKontaktowyHtml(opis) {
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

    // Kwoty bierzemy z ustawień w bazie, a nie z kodu — zadatek zmienia się
    // z panelu i nie może wymagać wdrożenia strony na nowo.
    var zadatek = stan.dane.kwota_zadatku;
    var doZaplaty = stan.dlugosc * stan.dane.stawka_godzinowa - zadatek;

    return (
      '<p class="termin-info">' + t('kontaktIntro') + '</p>' +
      '<div class="termin-akcje termin-akcje-kanaly">' +
      '<a class="btn btn-primary" href="tel:' + TELEFON + '">' + t('zadzwon') + '</a>' +
      '<a class="btn btn-secondary" href="' + sms + '">' + t('przyciskSms') + '</a>' +
      '<a class="btn btn-secondary" href="' + whatsapp + '" target="_blank" rel="noopener">' + t('przyciskWhatsapp') + '</a>' +
      '<a class="btn btn-secondary" href="' + mail + '">' + t('przyciskEmail') + '</a>' +
      '</div>' +
      '<div class="termin-kwoty">' +
      '<p><span>' + t('zadatekBlik') + TELEFON_ZAPIS + (angielski ? t('zadatekPrzelew') : '') + '</span><strong>' + zadatek + ' zł</strong></p>' +
      '<p><span>' + t('resztaGotowka') + '</span><strong>' + doZaplaty + ' zł</strong></p>' +
      '</div>' +
      '<p class="termin-drobne">' + t('terminDrobne') + '</p>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* ZAPARKOWANE: rezerwacja online + płatność zadatku                   */
  /*                                                                     */
  /* Poniższy kod jest nieosiągalny — /api/dostepnosc zawsze zwraca      */
  /* platnosci_online = false, a /api/rezerwacja odpowiada 403.          */
  /* Zostaje na wypadek powrotu do płatności online (tag autopay-wersja).*/
  /* ŚWIADOMIE NIE dwujęzyczny (napisy zostają na sztywno po polsku) —    */
  /* skoro kod się nie wykonuje, tłumaczenie go byłoby pracą na darmo.    */
  /* Jeśli płatności online kiedyś wrócą, dopisać tu t()/jezyk() tak jak  */
  /* w reszcie pliku, zanim ta gałąź znów zacznie się wyświetlać.         */
  /* ------------------------------------------------------------------ */

  function formularzHtml() {
    var zadatek = stan.dane.kwota_zadatku;
    var doZaplaty = stan.dlugosc * stan.dane.stawka_godzinowa - zadatek;

    return (
      '<div class="termin-kwoty">' +
      '<p><span>Zadatek online</span><strong>' + zadatek + ' zł</strong></p>' +
      '<p><span>Reszta gotówką na miejscu</span><strong>' + doZaplaty + ' zł</strong></p>' +
      '</div>' +
      '<form id="termin-form" class="termin-form" novalidate>' +
      '<label for="rez-imie">Imię i nazwisko</label>' +
      '<input id="rez-imie" name="imie" type="text" required minlength="2" autocomplete="name">' +
      '<label for="rez-telefon">Telefon</label>' +
      '<input id="rez-telefon" name="telefon" type="tel" required autocomplete="tel">' +
      '<label for="rez-email">E-mail</label>' +
      '<input id="rez-email" name="email" type="email" required autocomplete="email">' +
      '<label class="termin-zgoda">' +
      '<input type="checkbox" id="rez-zgoda" required>' +
      '<span>Rozumiem, że jeśli nie stawię się na jazdę albo odwołam ją później niż ' +
      '24 godziny przed terminem, zadatek może nie podlegać zwrotowi ' +
      '(&sect;&nbsp;5 i &sect;&nbsp;6 Regulaminu).</span>' +
      '</label>' +
      '<label class="termin-zgoda">' +
      '<input type="checkbox" id="rez-zgoda-regulamin" required>' +
      '<span>Zapoznałem się z <a href="regulamin.html" target="_blank" rel="noopener">Regulaminem</a> ' +
      'i <a href="polityka-prywatnosci.html" target="_blank" rel="noopener">Polityką prywatności</a> ' +
      'i akceptuję je.</span>' +
      '</label>' +
      '<p class="termin-blad" id="rez-blad" hidden></p>' +
      '<button type="submit" class="btn btn-primary">Rezerwuję i płacę zadatek</button>' +
      '<p class="termin-platnosc">Zadatek zapłacisz <strong>BLIK-iem, szybkim przelewem ' +
      'lub kartą</strong> na stronie operatora płatności <strong>Autopay&nbsp;S.A.</strong> ' +
      'Dane Twojej karty i logowania do banku podajesz bezpośrednio operatorowi — ' +
      'nie trafiają one do instruktora.</p>' +
      '</form>'
    );
  }

  function podepnijFormularz() {
    var form = document.getElementById('termin-form');
    var blad = document.getElementById('rez-blad');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      blad.hidden = true;

      if (!document.getElementById('rez-zgoda').checked) {
        blad.textContent = 'Potwierdź, że rozumiesz zasady dotyczące zadatku.';
        blad.hidden = false;
        return;
      }

      if (!document.getElementById('rez-zgoda-regulamin').checked) {
        blad.textContent = 'Zaakceptuj Regulamin i Politykę prywatności.';
        blad.hidden = false;
        return;
      }

      var przycisk = form.querySelector('button[type="submit"]');
      przycisk.disabled = true;
      przycisk.textContent = 'Rezerwuję…';

      fetch('/api/rezerwacja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: stan.wybrany.dzien.data,
          godzina_start: stan.wybrany.godzina,
          dlugosc: stan.dlugosc,
          imie: form.imie.value,
          telefon: form.telefon.value,
          email: form.email.value,
          zgoda_zadatek: true,
          zgoda_regulamin: true,
        }),
      })
        .then(function (r) {
          return r.json().then(function (body) {
            return { ok: r.ok, body: body };
          });
        })
        .then(function (wynik) {
          if (!wynik.ok) {
            blad.textContent = wynik.body.blad || 'Nie udało się zarezerwować terminu.';
            blad.hidden = false;
            przycisk.disabled = false;
            przycisk.textContent = 'Rezerwuję i płacę zadatek';
            // Termin mógł właśnie zniknąć — odświeżamy grafik pod spodem
            if (wynik.body.kod === 'TERMIN_ZAJETY') wczytaj();
            return;
          }

          // Etap 3 doda tu adres płatności Autopay. Dopóki go nie ma,
          // pokazujemy kod rezerwacji i odliczanie blokady.
          if (wynik.body.platnosc_url) {
            window.location.href = wynik.body.platnosc_url;
          } else {
            pokazBlokade(wynik.body);
          }
        })
        .catch(function () {
          blad.textContent = 'Brak połączenia z serwerem. Spróbuj ponownie.';
          blad.hidden = false;
          przycisk.disabled = false;
          przycisk.textContent = 'Rezerwuję i płacę zadatek';
        });
    });
  }

  function pokazBlokade(rez) {
    panelTytul.textContent = 'Termin zablokowany dla Ciebie';
    panelTresc.innerHTML =
      '<p class="termin-info">Kod rezerwacji: <strong class="termin-kod">' + rez.kod_rezerwacji + '</strong></p>' +
      '<p class="termin-info">Zadatek do zapłaty: <strong>' + rez.kwota_zadatku + ' zł</strong>, ' +
      'reszta (' + rez.do_zaplaty_na_miejscu + ' zł) gotówką na miejscu.</p>' +
      '<p class="termin-odliczanie">Termin trzymamy jeszcze <strong id="termin-zegar">15:00</strong></p>' +
      '<p class="termin-drobne">Płatności online są w trakcie uruchamiania — zadzwoń, żeby potwierdzić rezerwację.</p>' +
      '<div class="termin-akcje"><a class="btn btn-primary" href="tel:' + TELEFON + '">Zadzwoń: ' + TELEFON_ZAPIS + '</a></div>';

    uruchomOdliczanie(new Date(rez.wygasa_o).getTime());
    wczytaj();
  }

  function uruchomOdliczanie(koniec) {
    var zegar = document.getElementById('termin-zegar');
    if (!zegar) return;

    function krok() {
      var zostalo = koniec - Date.now();
      if (zostalo <= 0) {
        zegar.textContent = 'czas minął';
        clearInterval(stan.odliczanie);
        stan.odliczanie = null;
        return;
      }
      var min = Math.floor(zostalo / 60000);
      var sek = Math.floor((zostalo % 60000) / 1000);
      zegar.textContent = min + ':' + dwieCyfry(sek);
    }

    krok();
    stan.odliczanie = setInterval(krok, 1000);
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
