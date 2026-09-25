/* Panel administratora — rezerwacje, grafik, ustawienia.

   Całe bezpieczeństwo jest po stronie serwera (functions/api/admin/*):
   ta strona to tylko powłoka, która bez ważnej sesji nie dostanie
   żadnych danych. Dane kursantów wstawiamy wyłącznie przez esc() albo
   textContent — imię wpisane w formularzu nie może stać się HTML-em. */

(function () {
  'use strict';

  var DNI = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
  var SKROTY = ['nd', 'pon', 'wt', 'śr', 'czw', 'pt', 'sob'];
  /** Kolejność dni w ustawieniach: od poniedziałku. */
  var TYDZIEN = [1, 2, 3, 4, 5, 6, 0];
  var ZAJMUJACE = ['wstepna', 'potwierdzona', 'oczekuje', 'oplacone'];

  var stan = { dzisiaj: null, rezerwacje: [], grafik: null, zakladka: 'rezerwacje' };

  var $ = function (id) {
    return document.getElementById(id);
  };

  /* ------------------------------------------------------------------ */
  /* Pomocnicze                                                          */
  /* ------------------------------------------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function dwie(n) {
    return String(n).padStart(2, '0');
  }

  function dzienTyg(data) {
    var cz = data.split('-');
    return new Date(Date.UTC(+cz[0], +cz[1] - 1, +cz[2])).getUTCDay();
  }

  /** '2026-09-28' → 'pon 28.09' */
  function krotko(data) {
    var cz = data.split('-');
    return SKROTY[dzienTyg(data)] + ' ' + cz[2] + '.' + cz[1];
  }

  function zakres(r) {
    return dwie(r.godzina_start) + ':00–' + dwie(r.godzina_koniec) + ':00';
  }

  /** Data i godzina z ISO / SQLite ('2026-09-25 17:03:11') po polsku. */
  function kiedy(tekst) {
    if (!tekst) return '';
    var d = new Date(tekst.indexOf('T') === -1 ? tekst.replace(' ', 'T') + 'Z' : tekst);
    if (isNaN(d)) return '';
    return d.toLocaleString('pl-PL', {
      timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }

  var zegarKomunikatu = null;
  function komunikat(tekst, blad) {
    var el = $('komunikat');
    el.textContent = tekst;
    el.className = 'admin-komunikat' + (blad ? ' is-blad' : '');
    el.hidden = false;
    clearTimeout(zegarKomunikatu);
    zegarKomunikatu = setTimeout(function () {
      el.hidden = true;
    }, blad ? 7000 : 3500);
  }

  function pokazBlad(id, tekst) {
    var el = $(id);
    el.textContent = tekst || '';
    el.hidden = !tekst;
  }

  /**
   * Wywołanie API. Przy wygasłej sesji (401) wraca do ekranu logowania.
   * Zwraca Promise z odpowiedzią JSON; przy błędzie rzuca Error z komunikatem serwera.
   */
  function api(sciezka, dane, metoda) {
    var opcje = { method: metoda || (dane ? 'POST' : 'GET'), headers: { Accept: 'application/json' } };
    if (dane) {
      opcje.headers['Content-Type'] = 'application/json';
      opcje.body = JSON.stringify(dane);
    }
    return fetch(sciezka, opcje).then(function (odp) {
      return odp.json().catch(function () {
        return {};
      }).then(function (json) {
        if (odp.status === 401 && sciezka !== '/api/admin/login') {
          pokazLogowanie();
          throw new Error('Sesja wygasła — zaloguj się ponownie.');
        }
        if (!odp.ok) throw new Error(json.blad || 'Błąd serwera (' + odp.status + ').');
        return json;
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Logowanie                                                           */
  /* ------------------------------------------------------------------ */

  function pokazLogowanie(uwaga) {
    $('widok-panel').hidden = true;
    $('wyloguj').hidden = true;
    $('widok-logowanie').hidden = false;
    pokazBlad('blad-logowania', uwaga || '');
    $('haslo').focus();
  }

  function pokazPanel() {
    $('widok-logowanie').hidden = true;
    $('widok-panel').hidden = false;
    $('wyloguj').hidden = false;
    var z = (location.hash || '').slice(1);
    przelaczZakladke(['rezerwacje', 'grafik', 'ustawienia'].indexOf(z) !== -1 ? z : 'rezerwacje');
    wczytajRezerwacje();
  }

  $('form-logowanie').addEventListener('submit', function (e) {
    e.preventDefault();
    var przycisk = e.target.querySelector('button');
    przycisk.disabled = true;
    pokazBlad('blad-logowania', '');
    api('/api/admin/login', { haslo: $('haslo').value })
      .then(function () {
        $('haslo').value = '';
        pokazPanel();
      })
      .catch(function (err) {
        pokazBlad('blad-logowania', err.message);
      })
      .then(function () {
        przycisk.disabled = false;
      });
  });

  $('wyloguj').addEventListener('click', function () {
    api('/api/admin/login', null, 'DELETE').then(function () {
      stan.rezerwacje = [];
      stan.grafik = null;
      pokazLogowanie();
    });
  });

  /* ------------------------------------------------------------------ */
  /* Zakładki                                                            */
  /* ------------------------------------------------------------------ */

  function przelaczZakladke(nazwa) {
    stan.zakladka = nazwa;
    document.querySelectorAll('.admin-zakladka').forEach(function (b) {
      var aktywna = b.dataset.zakladka === nazwa;
      b.classList.toggle('is-active', aktywna);
      b.setAttribute('aria-selected', String(aktywna));
    });
    ['rezerwacje', 'grafik', 'ustawienia'].forEach(function (n) {
      $('panel-' + n).hidden = n !== nazwa;
    });
    if (history.replaceState) history.replaceState(null, '', '#' + nazwa);
    if ((nazwa === 'grafik' || nazwa === 'ustawienia') && !stan.grafik) wczytajGrafik();
  }

  document.querySelectorAll('.admin-zakladka').forEach(function (b) {
    b.addEventListener('click', function () {
      przelaczZakladke(b.dataset.zakladka);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Rezerwacje                                                          */
  /* ------------------------------------------------------------------ */

  function wczytajRezerwacje() {
    return api('/api/admin/rezerwacje')
      .then(function (dane) {
        stan.dzisiaj = dane.dzisiaj;
        stan.rezerwacje = dane.rezerwacje;
        rysujRezerwacje();
      })
      .catch(function (err) {
        komunikat(err.message, true);
      });
  }

  function kartaRezerwacji(r, typ) {
    var tel = String(r.telefon).replace(/[^\d+]/g, '');
    var dl = r.godzina_koniec - r.godzina_start;
    var znaczki = ['<span class="znaczek">' + esc(r.kod_rezerwacji) + '</span>'];
    if (r.zrodlo === 'panel') znaczki.push('<span class="znaczek">wpisana ręcznie</span>');
    if (r.jezyk === 'en') znaczki.push('<span class="znaczek">EN</span>');
    if (r.status === 'odrzucona') znaczki.push('<span class="znaczek znaczek-szary">odrzucona</span>');
    if (r.status === 'anulowane') znaczki.push('<span class="znaczek znaczek-szary">odwołana</span>');

    var zadatek;
    if (r.zadatek_otrzymany_o) zadatek = '<span class="zadatek zadatek-ok">Zadatek otrzymany ✓</span>';
    else if (r.zadatek_zgloszony_o) zadatek = '<span class="zadatek zadatek-zgloszony">Kursant zgłosił wysłanie zadatku (' + esc(kiedy(r.zadatek_zgloszony_o)) + ') — sprawdź konto</span>';
    else zadatek = '<span class="zadatek">Zadatek: jeszcze nie zgłoszony</span>';

    var akcje = '';
    var aktywna = ZAJMUJACE.indexOf(r.status) !== -1;
    if (typ === 'wstepna') {
      akcje =
        '<button type="button" class="btn btn-primary" data-akcja="potwierdz">Potwierdź</button>' +
        '<button type="button" class="btn btn-secondary" data-akcja="odrzuc">Odrzuć</button>';
    }
    if (aktywna) {
      akcje +=
        '<button type="button" class="btn btn-secondary" data-akcja="zadatek">' +
        (r.zadatek_otrzymany_o ? 'Cofnij „zadatek otrzymany”' : 'Zadatek otrzymany') + '</button>' +
        '<button type="button" class="btn btn-secondary" data-akcja="notatka">Notatka</button>';
      if (typ !== 'wstepna') akcje += '<button type="button" class="btn btn-secondary btn-ostrozny" data-akcja="anuluj">Odwołaj</button>';
    } else {
      akcje += '<button type="button" class="btn btn-secondary btn-ostrozny" data-akcja="usun">Usuń dane</button>';
    }

    return (
      '<article class="admin-karta rez rez-' + esc(r.status) + '" data-id="' + r.id + '">' +
      '<div class="rez-termin"><strong>' + esc(krotko(r.data)) + '</strong> ' + zakres(r) +
      ' <span class="rez-dl">' + dl + ' h</span></div>' +
      '<div class="rez-osoba">' + esc(r.imie) + '</div>' +
      '<div class="rez-kontakt"><a href="tel:' + esc(tel) + '">' + esc(r.telefon) + '</a>' +
      (r.email ? ' · <a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>' : '') + '</div>' +
      '<div class="rez-znaczki">' + znaczki.join('') + '</div>' +
      (aktywna ? '<div class="rez-zadatek">' + zadatek + '</div>' : '') +
      (r.notatka ? '<div class="rez-notatka">' + esc(r.notatka) + '</div>' : '') +
      '<div class="rez-meta">Zgłoszono ' + esc(kiedy(r.utworzono_o)) + '</div>' +
      (typ === 'wstepna' && r.email
        ? '<label class="admin-check"><input type="checkbox" class="rez-powiadom" checked> Wyślij kursantowi e-mail</label>'
        : '') +
      '<div class="rez-akcje">' + akcje + '</div>' +
      '</article>'
    );
  }

  function rysujListe(id, lista, typ, pusty) {
    $(id).innerHTML = lista.length
      ? lista.map(function (r) {
          return kartaRezerwacji(r, typ);
        }).join('')
      : '<p class="admin-pusto">' + pusty + '</p>';
  }

  function rysujRezerwacje() {
    var dzis = stan.dzisiaj;
    var wstepne = [];
    var nadchodzace = [];
    var historia = [];
    stan.rezerwacje.forEach(function (r) {
      if (r.status === 'wstepna') wstepne.push(r);
      else if (ZAJMUJACE.indexOf(r.status) !== -1 && r.data >= dzis) nadchodzace.push(r);
      else historia.push(r);
    });
    historia.reverse();

    rysujListe('lista-wstepne', wstepne, 'wstepna', 'Brak rezerwacji czekających na potwierdzenie.');
    rysujListe('lista-nadchodzace', nadchodzace, 'nadchodzaca', 'Brak zaplanowanych jazd.');
    rysujListe('lista-historia', historia, 'historia', 'Pusto.');

    var licznik = $('licznik-wstepnych');
    licznik.textContent = wstepne.length;
    licznik.hidden = wstepne.length === 0;
    document.title = (wstepne.length ? '(' + wstepne.length + ') ' : '') + 'Panel | Jazdy Doszkalające';
  }

  function znajdz(id) {
    for (var i = 0; i < stan.rezerwacje.length; i++) if (stan.rezerwacje[i].id === id) return stan.rezerwacje[i];
    return null;
  }

  // Jeden słuchacz na cały panel rezerwacji zamiast osobnego na każdym przycisku
  $('panel-rezerwacje').addEventListener('click', function (e) {
    var przycisk = e.target.closest('button[data-akcja]');
    if (!przycisk) return;
    var karta = przycisk.closest('.rez');
    var r = znajdz(Number(karta.dataset.id));
    if (!r) return;
    var akcja = przycisk.dataset.akcja;
    var opis = krotko(r.data) + ' ' + zakres(r) + ' — ' + r.imie;
    var dane = { akcja: akcja, id: r.id };
    var potwierdzenie = null;

    if (akcja === 'potwierdz' || akcja === 'odrzuc') {
      var check = karta.querySelector('.rez-powiadom');
      dane.powiadom = Boolean(check && check.checked);
      if (akcja === 'odrzuc') potwierdzenie = 'Odrzucić rezerwację?\n' + opis + '\n\nTermin wróci do grafiku.';
    } else if (akcja === 'anuluj') {
      potwierdzenie = 'Odwołać jazdę?\n' + opis + '\n\nTermin wróci do grafiku. Kursant NIE dostanie automatycznego maila — daj mu znać sam.';
    } else if (akcja === 'usun') {
      potwierdzenie = 'Trwale usunąć dane tej rezerwacji?\n' + opis + '\n\nTego nie da się cofnąć.';
    } else if (akcja === 'zadatek') {
      dane.otrzymany = !r.zadatek_otrzymany_o;
    } else if (akcja === 'notatka') {
      var nowa = window.prompt('Notatka (widzisz ją tylko Ty):', r.notatka || '');
      if (nowa === null) return;
      dane.notatka = nowa;
    }
    if (potwierdzenie && !window.confirm(potwierdzenie)) return;

    przycisk.disabled = true;
    api('/api/admin/rezerwacje', dane)
      .then(function (wynik) {
        var teksty = {
          potwierdz: 'Rezerwacja potwierdzona.',
          odrzuc: 'Rezerwacja odrzucona — termin wrócił do grafiku.',
          anuluj: 'Jazda odwołana — termin wrócił do grafiku.',
          usun: 'Dane usunięte.',
          zadatek: dane.otrzymany ? 'Zaznaczono: zadatek otrzymany.' : 'Cofnięto „zadatek otrzymany”.',
          notatka: 'Notatka zapisana.',
        };
        var tekst = teksty[akcja];
        if (wynik.email_wyslany === true) tekst += ' Kursant dostał e-mail.';
        if (wynik.email_wyslany === false) tekst += ' Uwaga: e-maila nie udało się wysłać — daj znać kursantowi SMS-em.';
        komunikat(tekst, wynik.email_wyslany === false);
        stan.grafik = null;
        return wczytajRezerwacje();
      })
      .catch(function (err) {
        przycisk.disabled = false;
        komunikat(err.message, true);
      });
  });

  $('odswiez').addEventListener('click', function () {
    wczytajRezerwacje().then(function () {
      komunikat('Odświeżono.');
    });
  });

  /* ---- Ręczne dodawanie ------------------------------------------------ */

  (function () {
    var select = $('form-dodaj').elements.godzina_start;
    for (var g = 6; g <= 21; g++) {
      var o = document.createElement('option');
      o.value = g;
      o.textContent = dwie(g) + ':00';
      if (g === 10) o.selected = true;
      select.appendChild(o);
    }
  })();

  $('pokaz-dodaj').addEventListener('click', function () {
    var f = $('form-dodaj');
    f.hidden = false;
    if (!f.elements.data.value) f.elements.data.value = stan.dzisiaj || '';
    f.elements.data.focus();
  });

  $('anuluj-dodaj').addEventListener('click', function () {
    $('form-dodaj').hidden = true;
    pokazBlad('blad-dodaj', '');
  });

  $('form-dodaj').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    var przycisk = f.querySelector('button[type=submit]');
    przycisk.disabled = true;
    pokazBlad('blad-dodaj', '');
    api('/api/admin/rezerwacje', {
      akcja: 'dodaj',
      data: f.elements.data.value,
      godzina_start: Number(f.elements.godzina_start.value),
      dlugosc: Number(f.elements.dlugosc.value),
      imie: f.elements.imie.value,
      telefon: f.elements.telefon.value,
      email: f.elements.email.value,
      notatka: f.elements.notatka.value,
      powiadom: f.elements.powiadom.checked,
    })
      .then(function (wynik) {
        f.reset();
        f.hidden = true;
        komunikat('Rezerwacja dodana.' + (wynik.email_wyslany ? ' Kursant dostał e-mail.' : ''));
        stan.grafik = null;
        return wczytajRezerwacje();
      })
      .catch(function (err) {
        pokazBlad('blad-dodaj', err.message);
      })
      .then(function () {
        przycisk.disabled = false;
      });
  });

  /* ------------------------------------------------------------------ */
  /* Grafik                                                              */
  /* ------------------------------------------------------------------ */

  function wczytajGrafik() {
    return api('/api/admin/grafik')
      .then(function (dane) {
        stan.grafik = dane;
        rysujGrafik();
        rysujUstawienia();
      })
      .catch(function (err) {
        komunikat(err.message, true);
      });
  }

  function klasaGodziny(h, dzien) {
    if (h.rezerwacja) return h.rezerwacja.status === 'wstepna' ? 'h-wstepna' : 'h-zajeta';
    if (dzien.zablokowany) return 'h-zamknieta';
    return h.otwarta ? 'h-otwarta' : 'h-zamknieta';
  }

  function rysujGrafik() {
    var html = '';
    stan.grafik.dni.forEach(function (dzien, i) {
      var dt = dzienTyg(dzien.data);
      if (i === 0 || dt === 1) {
        html += '<h2 class="admin-naglowek g-tydzien">Tydzień od ' + esc(krotko(dzien.data)) + '</h2>';
      }
      var maRezerwacje = dzien.godziny.some(function (h) {
        return h.rezerwacja;
      });
      html +=
        '<div class="g-dzien' + (dzien.zablokowany ? ' g-zablokowany' : '') + (!dzien.aktywny ? ' g-nieaktywny' : '') +
        '" data-data="' + dzien.data + '">' +
        '<div class="g-naglowek"><strong>' + esc(DNI[dt]) + ' ' + esc(krotko(dzien.data).split(' ')[1]) + '</strong>' +
        (dzien.data === stan.grafik.dzisiaj ? ' <span class="znaczek">dziś</span>' : '') +
        (dzien.zablokowany ? ' <span class="znaczek znaczek-szary">dzień zamknięty</span>' : '') +
        '<button type="button" class="g-dzien-btn" data-zamknij="' + (dzien.zablokowany ? '0' : '1') + '"' +
        (maRezerwacje ? ' data-rezerwacje="1"' : '') + '>' +
        (dzien.zablokowany ? 'Otwórz dzień' : 'Zamknij dzień') + '</button></div>' +
        '<div class="g-godziny">';
      dzien.godziny.forEach(function (h) {
        var tytul = h.rezerwacja
          ? (h.rezerwacja.status === 'wstepna' ? 'Wstępna: ' : 'Jazda: ') + h.rezerwacja.imie
          : h.otwarta && !dzien.zablokowany ? 'Otwarta — kliknij, żeby zamknąć' : 'Zamknięta — kliknij, żeby otworzyć';
        html +=
          '<button type="button" class="h ' + klasaGodziny(h, dzien) + '" data-godzina="' + h.godzina + '"' +
          ' data-otwarta="' + (h.otwarta ? '1' : '0') + '" title="' + esc(tytul) + '" aria-label="' + dwie(h.godzina) + ':00 — ' + esc(tytul) + '"' +
          (h.rezerwacja || dzien.zablokowany ? ' disabled' : '') + '>' +
          dwie(h.godzina) +
          (h.rezerwacja && h.rezerwacja.poczatek ? '<span class="h-imie">' + esc(String(h.rezerwacja.imie).split(' ')[0]) + '</span>' : '') +
          '</button>';
      });
      html += '</div></div>';
    });
    $('grafik-dni').innerHTML = html;
  }

  $('grafik-dni').addEventListener('click', function (e) {
    var dzienEl = e.target.closest('.g-dzien');
    if (!dzienEl) return;
    var data = dzienEl.dataset.data;

    var godz = e.target.closest('button.h');
    if (godz && !godz.disabled) {
      var otworz = godz.dataset.otwarta !== '1';
      // Od razu zmieniamy wygląd — serwer potwierdzi, a przy błędzie cofniemy
      godz.className = 'h ' + (otworz ? 'h-otwarta' : 'h-zamknieta') + ' is-zapis';
      godz.dataset.otwarta = otworz ? '1' : '0';
      api('/api/admin/grafik', { akcja: 'godzina', data: data, godzina: Number(godz.dataset.godzina), otwarta: otworz })
        .then(wczytajGrafik)
        .catch(function (err) {
          komunikat(err.message, true);
          wczytajGrafik();
        });
      return;
    }

    var dzienBtn = e.target.closest('.g-dzien-btn');
    if (dzienBtn) {
      var zamknij = dzienBtn.dataset.zamknij === '1';
      if (zamknij && dzienBtn.dataset.rezerwacje &&
          !window.confirm('Tego dnia są już rezerwacje. Zostaną — zamknięcie blokuje tylko nowe. Zamknąć dzień?')) {
        return;
      }
      dzienBtn.disabled = true;
      api('/api/admin/grafik', { akcja: 'dzien', data: data, zamkniety: zamknij })
        .then(function () {
          komunikat(zamknij ? 'Dzień zamknięty.' : 'Dzień otwarty.');
          return wczytajGrafik();
        })
        .catch(function (err) {
          dzienBtn.disabled = false;
          komunikat(err.message, true);
        });
    }
  });

  /* ------------------------------------------------------------------ */
  /* Ustawienia                                                          */
  /* ------------------------------------------------------------------ */

  function opcjeGodzin(od, doG, wybrana) {
    var html = '';
    for (var g = od; g <= doG; g++) {
      html += '<option value="' + g + '"' + (g === wybrana ? ' selected' : '') + '>' + dwie(g) + ':00</option>';
    }
    return html;
  }

  function rysujUstawienia() {
    var szablon = stan.grafik.szablon;
    var html = '';
    var uwagi = [];
    TYDZIEN.forEach(function (dt) {
      var wpisy = szablon.filter(function (w) {
        return w.dzien_tygodnia === dt;
      });
      var pracuje = wpisy.length > 0;
      var od = pracuje ? Math.min.apply(null, wpisy.map(function (w) { return w.godzina_start; })) : 10;
      var doG = pracuje ? Math.max.apply(null, wpisy.map(function (w) { return w.godzina_koniec; })) : 18;
      if (wpisy.length > 1) uwagi.push(DNI[dt]);
      html +=
        '<div class="sz-dzien" data-dt="' + dt + '">' +
        '<label class="admin-check sz-pracuje"><input type="checkbox"' + (pracuje ? ' checked' : '') + '> ' + DNI[dt] + '</label>' +
        '<select class="sz-od" aria-label="' + DNI[dt] + ' od">' + opcjeGodzin(5, 23, od) + '</select>' +
        '<span aria-hidden="true">–</span>' +
        '<select class="sz-do" aria-label="' + DNI[dt] + ' do">' + opcjeGodzin(6, 24, doG) + '</select>' +
        '</div>';
    });
    if (uwagi.length) {
      html += '<p class="admin-drobne">Uwaga: ' + uwagi.join(', ') + ' — w bazie jest kilka przedziałów godzin; po zapisaniu zostanie jeden, od najwcześniejszej do najpóźniejszej.</p>';
    }
    $('szablon-dni').innerHTML = html;
    odswiezWyszarzenie();

    var f = $('form-ustawienia');
    f.elements.kwota_zadatku.value = stan.grafik.ustawienia.kwota_zadatku;
    f.elements.horyzont_tygodni.value = String(stan.grafik.ustawienia.horyzont_tygodni);
  }

  function odswiezWyszarzenie() {
    document.querySelectorAll('.sz-dzien').forEach(function (w) {
      var wl = w.querySelector('.sz-pracuje input').checked;
      w.classList.toggle('is-wolne', !wl);
      w.querySelectorAll('select').forEach(function (s) {
        s.disabled = !wl;
      });
    });
  }

  $('szablon-dni').addEventListener('change', odswiezWyszarzenie);

  $('form-szablon').addEventListener('submit', function (e) {
    e.preventDefault();
    pokazBlad('blad-szablon', '');
    var dni = [];
    var blad = '';
    document.querySelectorAll('.sz-dzien').forEach(function (w) {
      if (!w.querySelector('.sz-pracuje input').checked) return;
      var od = Number(w.querySelector('.sz-od').value);
      var doG = Number(w.querySelector('.sz-do').value);
      if (doG <= od) blad = DNI[Number(w.dataset.dt)] + ': godzina końca musi być po godzinie początku.';
      dni.push({ dzien_tygodnia: Number(w.dataset.dt), godzina_start: od, godzina_koniec: doG });
    });
    if (blad) return pokazBlad('blad-szablon', blad);

    api('/api/admin/grafik', { akcja: 'szablon', dni: dni })
      .then(function () {
        komunikat('Godziny pracy zapisane.');
        return wczytajGrafik();
      })
      .catch(function (err) {
        pokazBlad('blad-szablon', err.message);
      });
  });

  $('form-ustawienia').addEventListener('submit', function (e) {
    e.preventDefault();
    pokazBlad('blad-ustawienia', '');
    api('/api/admin/grafik', {
      akcja: 'ustawienia',
      kwota_zadatku: Number(e.target.elements.kwota_zadatku.value),
      horyzont_tygodni: Number(e.target.elements.horyzont_tygodni.value),
    })
      .then(function () {
        komunikat('Ustawienia zapisane.');
        return wczytajGrafik();
      })
      .catch(function (err) {
        pokazBlad('blad-ustawienia', err.message);
      });
  });

  /* ------------------------------------------------------------------ */
  /* Start                                                               */
  /* ------------------------------------------------------------------ */

  // Po powrocie do karty (np. z SMS-a do kursanta) — świeże dane
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !$('widok-panel').hidden) {
      wczytajRezerwacje();
      if (stan.zakladka === 'grafik') wczytajGrafik();
    }
  });

  api('/api/admin/login')
    .then(function (s) {
      if (s.zalogowany) pokazPanel();
      else pokazLogowanie(s.skonfigurowane ? '' : 'Panel nie jest jeszcze skonfigurowany: ustaw zmienną ADMIN_HASLO w Cloudflare.');
    })
    .catch(function () {
      pokazLogowanie('Brak połączenia z serwerem.');
    });
})();
