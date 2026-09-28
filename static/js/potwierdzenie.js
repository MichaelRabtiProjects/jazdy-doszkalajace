/* Strona "Twoja rezerwacja" — tu prowadzi przycisk z maila po wstępnej
   rezerwacji. Adres: /potwierdzenie?t=TOKEN.

   Pokazuje termin, status (wstępna / potwierdzona / odrzucona / odwołana)
   i przycisk "Zadatek wysłany", który powiadamia instruktora mailem.
   Token jest losowy i niezgadywalny; API i tak nie zwraca telefonu
   ani e-maila. */

(function () {
  'use strict';

  var TXT = {
    brakLinku: {
      pl: 'Ten link jest niepełny. Otwórz go jeszcze raz z maila albo napisz: 690 360 164.',
      en: 'This link is incomplete. Open it again from the e-mail or message me: +48 690 360 164.',
    },
    nieZnaleziono: {
      pl: 'Nie znaleziono tej rezerwacji — mogła zostać usunięta. W razie pytań napisz: 690 360 164.',
      en: 'This booking couldn’t be found — it may have been removed. Questions? Message me: +48 690 360 164.',
    },
    bladPolaczenia: {
      pl: 'Nie udało się wczytać rezerwacji. Odśwież stronę za chwilę.',
      en: 'The booking couldn’t be loaded. Please refresh the page in a moment.',
    },
    termin: { pl: 'Termin', en: 'Time' },
    kod: { pl: 'Kod rezerwacji', en: 'Booking code' },
    status: { pl: 'Status', en: 'Status' },
    zadatek: { pl: 'Zadatek (BLIK na 690 360 164)', en: 'Deposit (BLIK to 690 360 164)' },
    reszta: { pl: 'Reszta — przed lub po jeździe', en: 'The rest — before or after the lesson' },
    wstepna: {
      pl: 'Wstępna rezerwacja — czekaj na potwierdzenie lub kontakt od instruktora',
      en: 'Provisional booking — please wait for confirmation or for the instructor to contact you',
    },
    potwierdzona: { pl: 'Potwierdzona — do zobaczenia!', en: 'Confirmed — see you then!' },
    odrzucona: {
      pl: 'Niepotwierdzona — ten termin nie jest już dostępny',
      en: 'Not confirmed — this time is no longer available',
    },
    anulowane: { pl: 'Odwołana', en: 'Cancelled' },
    zadatekOtrzymany: { pl: 'Zadatek otrzymany — dziękuję!', en: 'Deposit received — thank you!' },
    zadatekZgloszony: {
      pl: 'Zgłoszono wysłanie zadatku — sprawdzę wpłatę i dam znać.',
      en: 'You’ve reported sending the deposit — I’ll check the payment and let you know.',
    },
    zadatekKrok: {
      pl: 'Zadatek możesz wysłać BLIK-iem na numer 690 360 164 — w tytule wpisz kod rezerwacji. Po wysłaniu kliknij przycisk poniżej.',
      en: 'You can send the deposit via BLIK (Polish mobile payment) to 690 360 164 — put the booking code in the title; a bank transfer is available on request. Once sent, click the button below.',
    },
    przyciskZadatek: { pl: 'Zadatek wysłany', en: 'Deposit sent' },
    grafik: { pl: 'Wybierz inny termin', en: 'Pick another time' },
  };

  var DNI = {
    pl: ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  };

  function jezyk() {
    return typeof window.jdJezyk === 'function' ? window.jdJezyk() : 'pl';
  }

  function t(klucz) {
    return TXT[klucz][jezyk()] || TXT[klucz].pl;
  }

  function dwie(n) {
    return String(n).padStart(2, '0');
  }

  function opisTerminu(r) {
    var cz = r.data.split('-');
    var dzien = new Date(Date.UTC(+cz[0], +cz[1] - 1, +cz[2])).getUTCDay();
    return (
      DNI[jezyk() === 'en' ? 'en' : 'pl'][dzien] + ' ' + cz[2] + '.' + cz[1] + '.' + cz[0] + ', ' +
      dwie(r.godzina_start) + ':00–' + dwie(r.godzina_koniec) + ':00 (' + r.dlugosc + ' h)'
    );
  }

  var el = document.getElementById('potwierdzenie-tresc');
  var token = new URLSearchParams(window.location.search).get('t') || '';
  var stan = { rez: null, blad: null };

  function komunikat(tekst) {
    el.innerHTML = '<p class="grafik-komunikat grafik-komunikat-blad"></p>';
    el.firstChild.textContent = tekst;
  }

  function rysuj() {
    if (stan.blad) return komunikat(t(stan.blad));
    var r = stan.rez;
    if (!r) return;

    var aktywna = r.status === 'wstepna' || r.status === 'potwierdzona';
    var html =
      '<div class="potwierdzenie-karta">' +
      '<dl class="potwierdzenie-dane">' +
      '<dt>' + t('termin') + '</dt><dd>' + opisTerminu(r) + '</dd>' +
      '<dt>' + t('kod') + '</dt><dd><strong class="termin-kod">' + r.kod_rezerwacji + '</strong></dd>' +
      '<dt>' + t('status') + '</dt><dd><strong>' + (TXT[r.status] ? t(r.status) : r.status) + '</strong></dd>' +
      (aktywna
        ? '<dt>' + t('zadatek') + '</dt><dd>' + r.kwota_zadatku + ' zł</dd>' +
          '<dt>' + t('reszta') + '</dt><dd>' + r.do_zaplaty_na_miejscu + ' zł</dd>'
        : '') +
      '</dl>';

    if (aktywna) {
      if (r.zadatek_otrzymany) {
        html += '<p class="termin-sukces">' + t('zadatekOtrzymany') + '</p>';
      } else if (r.zadatek_zgloszony) {
        html += '<p class="termin-sukces">' + t('zadatekZgloszony') + '</p>';
      } else {
        html +=
          '<p class="termin-drobne">' + t('zadatekKrok') + '</p>' +
          '<div class="termin-akcje"><button type="button" class="btn btn-primary" id="zadatek-btn">' +
          t('przyciskZadatek') + '</button></div>' +
          '<p class="termin-blad" id="zadatek-blad" role="alert" hidden></p>';
      }
    } else {
      html += '<div class="termin-akcje"><a class="btn btn-primary" href="index.html#grafik">' + t('grafik') + '</a></div>';
    }

    el.innerHTML = html + '</div>';

    var btn = document.getElementById('zadatek-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        btn.disabled = true;
        fetch('/api/zadatek', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token }),
        })
          .then(function (odp) {
            if (!odp.ok) throw new Error('HTTP ' + odp.status);
            return odp.json();
          })
          .then(function (rez) {
            stan.rez = rez;
            rysuj();
          })
          .catch(function () {
            btn.disabled = false;
            var blad = document.getElementById('zadatek-blad');
            blad.textContent = t('bladPolaczenia');
            blad.hidden = false;
          });
      });
    }
  }

  if (!/^[0-9a-f]{32}$/.test(token)) {
    stan.blad = 'brakLinku';
    rysuj();
  } else {
    fetch('/api/rezerwacja?t=' + encodeURIComponent(token), { headers: { Accept: 'application/json' } })
      .then(function (odp) {
        if (odp.status === 404) {
          stan.blad = 'nieZnaleziono';
          return null;
        }
        if (!odp.ok) throw new Error('HTTP ' + odp.status);
        return odp.json();
      })
      .then(function (rez) {
        if (rez) {
          stan.rez = rez;
          // Strona otwiera się w języku, w którym wypełniono formularz —
          // tak samo jak mail, z którego ktoś tu przyszedł. Przełącznik
          // w nagłówku działa potem normalnie.
          if (rez.jezyk && rez.jezyk !== jezyk()) {
            var przycisk = document.querySelector('.lang-btn[data-lang="' + rez.jezyk + '"]');
            if (przycisk) przycisk.click();
          }
        }
        rysuj();
      })
      .catch(function () {
        stan.blad = 'bladPolaczenia';
        rysuj();
      });
  }

  // Treść jest generowana w JS, więc przy zmianie języka rysujemy ją od nowa
  document.addEventListener('jd:jezyk', rysuj);
})();
