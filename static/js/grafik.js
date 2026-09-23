/* Grafik wolnych terminów.
   Jeden kod obsługuje oba tryby — o tym, czy klient rezerwuje online, czy
   dzwoni, decyduje wyłącznie ustawienie platnosci_online z backendu. */

(function () {
  'use strict';

  var TELEFON = '+48690360164';
  var TELEFON_ZAPIS = '690 360 164';

  var widget = document.getElementById('grafik-widget');
  if (!widget) return;

  var elDlugosci = document.getElementById('grafik-dlugosci');
  var elKomunikat = document.getElementById('grafik-komunikat');
  var elDni = document.getElementById('grafik-dni');

  var panel = document.getElementById('termin-panel');
  var panelTytul = document.getElementById('termin-tytul');
  var panelPodsumowanie = document.getElementById('termin-podsumowanie');
  var panelTresc = document.getElementById('termin-tresc');
  var panelZamknij = document.getElementById('termin-zamknij');

  var stan = {
    dane: null,
    dlugosc: 2,
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

  function tekstOpisu(data, godzina, dlugosc, nazwaDnia) {
    return (
      nazwaDnia + ' ' + krotkaData(data) + ', ' + zakresGodzin(godzina, dlugosc) +
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
      ' <a class="grafik-link-tel" href="tel:' + TELEFON + '">Zadzwoń: ' + TELEFON_ZAPIS + '</a>';
    elDni.hidden = true;
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
        pokazBlad('Grafik jest chwilowo niedostępny.');
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
  /* Rysowanie grafiku                                                   */
  /* ------------------------------------------------------------------ */

  var ETYKIETY_TYGODNI = ['Najbliższe dni', 'Za tydzień', 'Za dwa tygodnie'];

  function rysuj() {
    var dni = stan.dane.dni;
    elDni.innerHTML = '';

    var czyCokolwiek = false;

    dni.forEach(function (dzien, i) {
      if (i % 7 === 0) {
        var naglowek = document.createElement('h3');
        naglowek.className = 'grafik-tydzien';
        naglowek.textContent = ETYKIETY_TYGODNI[Math.floor(i / 7)] || 'Dalsze terminy';
        elDni.appendChild(naglowek);
      }

      var pasujace = dzien.sloty.filter(function (slot) {
        return slot.dlugosci.indexOf(stan.dlugosc) !== -1;
      });

      if (pasujace.length > 0) czyCokolwiek = true;

      var karta = document.createElement('article');
      karta.className = 'dzien' + (pasujace.length === 0 ? ' dzien-pusty' : '');

      var head = document.createElement('header');
      head.className = 'dzien-naglowek';
      head.innerHTML =
        '<span class="dzien-nazwa">' + dzien.nazwa_dnia + '</span>' +
        '<span class="dzien-data">' + krotkaData(dzien.data) + '</span>';
      karta.appendChild(head);

      if (pasujace.length === 0) {
        // Zablokowane godziny mają być niewidoczne — pokazujemy sam fakt braku
        var brak = document.createElement('p');
        brak.className = 'dzien-brak';
        brak.textContent = 'brak terminów';
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
            'Termin ' + dzien.nazwa_dnia + ' ' + krotkaData(dzien.data) + ' o ' + godzinaTekst(slot.godzina)
          );
          btn.addEventListener('click', function () {
            otworzPanel(dzien, slot.godzina, btn);
          });
          lista.appendChild(btn);
        });
        karta.appendChild(lista);
      }

      elDni.appendChild(karta);
    });

    elDni.hidden = false;
    elKomunikat.className = 'grafik-komunikat';
    elKomunikat.hidden = czyCokolwiek;
    if (!czyCokolwiek) {
      elKomunikat.textContent =
        'Brak wolnych terminów na ' + stan.dlugosc + ' h w najbliższych tygodniach — spróbuj krótszej jazdy albo zadzwoń.';
    }
  }

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

    if (stan.dane.platnosci_online) {
      panelTytul.textContent = 'Rezerwacja terminu';
      panelTresc.innerHTML = formularzHtml();
      podepnijFormularz();
    } else {
      panelTytul.textContent = 'Ten termin jest wolny';
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

  /* --- Tryb A: kontakt telefoniczny -------------------------------- */

  function trybKontaktowyHtml(opis) {
    var tresc =
      'Dzień dobry, chciałbym zarezerwować jazdę doszkalającą: ' + opis + '.';
    // Parametr ?body= obsługują dziś zarówno Android, jak i iOS
    var sms = 'sms:' + TELEFON + '?body=' + encodeURIComponent(tresc);

    return (
      '<p class="termin-info">Zadzwoń lub napisz SMS, żeby go zarezerwować — potwierdzę termin od ręki.</p>' +
      '<div class="termin-akcje">' +
      '<a class="btn btn-primary" href="tel:' + TELEFON + '">Zadzwoń: ' + TELEFON_ZAPIS + '</a>' +
      '<a class="btn btn-secondary" href="' + sms + '">Napisz SMS</a>' +
      '</div>' +
      '<p class="termin-drobne">SMS ma już wpisaną datę i godzinę — wystarczy wysłać.</p>'
    );
  }

  /* --- Tryb B: rezerwacja online ----------------------------------- */

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

  wczytaj();
})();
