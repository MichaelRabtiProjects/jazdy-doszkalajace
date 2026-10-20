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

  var ZAKLADKI = ['kalendarz', 'rezerwacje', 'kursanci', 'grafik', 'ustawienia'];

  var stan = { dzisiaj: null, rezerwacje: [], miejsca: [], grafik: null, zakladka: 'kalendarz' };

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

  /** 805 → '13:25' */
  function godz(minuty) {
    return dwie(Math.floor(minuty / 60)) + ':' + dwie(minuty % 60);
  }

  /** '13:25' → 805 */
  function minuty(tekst) {
    var cz = String(tekst).split(':');
    return Number(cz[0]) * 60 + Number(cz[1]);
  }

  function nazwaMiejsca(id) {
    for (var i = 0; i < stan.miejsca.length; i++) if (stan.miejsca[i].id === id) return stan.miejsca[i].nazwa;
    return 'miejsce do ustalenia';
  }

  function opcjeMiejsc(wybrane, zPustym) {
    var html = zPustym ? '<option value="">— do ustalenia —</option>' : '';
    stan.miejsca.forEach(function (m) {
      html += '<option value="' + esc(m.id) + '"' + (m.id === wybrane ? ' selected' : '') + '>' +
        esc(m.nazwa) + (m.wawer ? ' (Wawer)' : '') + '</option>';
    });
    return html;
  }

  function zakres(r) {
    return godz(r.start_min) + '–' + godz(r.koniec_min);
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
  var miejsceKomunikatu = null;
  function komunikat(tekst, blad) {
    var el = $('komunikat');
    // Otwarte okno (dialog) leży nad całą stroną — komunikat musi trafić do
    // niego, inaczej np. "e-mail nie wyszedł" schowałby się pod spodem.
    if (!miejsceKomunikatu) miejsceKomunikatu = el.parentNode;
    var okno = document.querySelector('dialog[open]');
    var cel = okno || miejsceKomunikatu;
    if (el.parentNode !== cel) cel.appendChild(el);
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
    // Dane kursantów nie mogą zostać w stronie po wylogowaniu / wygaśnięciu sesji
    document.querySelectorAll('dialog[open]').forEach(function (d) {
      d.close();
    });
    ['lista-wstepne', 'lista-nadchodzace', 'lista-historia', 'grafik-dni'].forEach(function (id) {
      $(id).innerHTML = '';
    });
    stan.rezerwacje = [];
    stan.grafik = null;
    if (window.Kalendarz) window.Kalendarz.wyczysc();
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
    przelaczZakladke(ZAKLADKI.indexOf(z) !== -1 ? z : 'kalendarz');
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
    ZAKLADKI.forEach(function (n) {
      $('panel-' + n).hidden = n !== nazwa;
    });
    document.body.classList.toggle('kal-szeroki', nazwa === 'kalendarz');
    if (history.replaceState) history.replaceState(null, '', '#' + nazwa);
    if ((nazwa === 'grafik' || nazwa === 'ustawienia') && !stan.grafik) wczytajGrafik();
    if (nazwa === 'kalendarz' && window.Kalendarz) window.Kalendarz.pokaz();
    if (nazwa === 'kursanci') wczytajKursantow();
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
        stan.miejsca = dane.miejsca || [];
        document.querySelectorAll('.sel-miejsce').forEach(function (s) {
          var w = s.value;
          s.innerHTML = opcjeMiejsc(w, true);
        });
        rysujRezerwacje();
      })
      .catch(function (err) {
        komunikat(err.message, true);
      });
  }

  function kartaRezerwacji(r, typ) {
    var tel = String(r.telefon).replace(/[^\d+]/g, '');
    var dl = (r.koniec_min - r.start_min) / 60;
    var znaczki = ['<span class="znaczek">' + esc(r.kod_rezerwacji) + '</span>'];
    if (r.zrodlo === 'panel') znaczki.push('<span class="znaczek">wpisana ręcznie</span>');
    if (r.jezyk === 'en') znaczki.push('<span class="znaczek">EN</span>');
    if (r.przypomnienie_o) znaczki.push('<span class="znaczek">e-mail z przypomnieniem ' + esc(kiedy(r.przypomnienie_o)) + '</span>');
    if (r.sms_przypomnienie_o) znaczki.push('<span class="znaczek">SMS wysłany ' + esc(kiedy(r.sms_przypomnienie_o)) + '</span>');
    else if (r.sms_blad) znaczki.push('<span class="znaczek znaczek-blad" title="' + esc(r.sms_blad) + ' — ponów przyciskiem „Wyślij przypomnienia teraz”">SMS nie wyszedł (próby: ' + esc(r.sms_proby) + ')</span>');
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
        '<button type="button" class="btn btn-secondary" data-akcja="edytuj">Zmień godzinę / miejsce</button>' +
        '<button type="button" class="btn btn-secondary" data-akcja="notatka">Notatka</button>';
      if (typ !== 'wstepna') akcje += '<button type="button" class="btn btn-secondary btn-ostrozny" data-akcja="anuluj">Odwołaj</button>';
    } else {
      akcje += '<button type="button" class="btn btn-secondary btn-ostrozny" data-akcja="usun">Usuń dane</button>';
    }

    return (
      '<article class="admin-karta rez rez-' + esc(r.status) + '" data-id="' + r.id + '">' +
      '<div class="rez-termin"><strong>' + esc(krotko(r.data)) + '</strong> ' + zakres(r) +
      ' <span class="rez-dl">' + godziny(dl) + '</span></div>' +
      '<div class="rez-miejsce">' + esc(nazwaMiejsca(r.miejsce)) + ' · <strong>' + (160 + (r.doplata_h || 0)) + ' zł/h</strong>' +
      (r.doplata_h ? ' <span class="znaczek">+' + r.doplata_h + ' zł/h dojazd</span>' : '') + '</div>' +
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
      (aktywna ? formularzEdycji(r) : '') +
      '</article>'
    );
  }

  /** 1.5 → '1,5 h' */
  function godziny(h) {
    return String(Math.round(h * 100) / 100).replace('.', ',') + ' h';
  }

  /** Ukryty formularz ręcznej zmiany godziny / długości / miejsca / dopłaty. */
  function formularzEdycji(r) {
    // Długość w minutach — także pół godziny i długość ustawiona ręcznie
    // w kalendarzu (np. 85 min); inaczej zapis bez zmiany długości po cichu
    // zmieniłby jazdę.
    var dl = r.koniec_min - r.start_min;
    var dlugosci = [60, 90, 120, 150, 180, 210, 240];
    if (dlugosci.indexOf(dl) === -1) dlugosci.push(dl);
    dlugosci.sort(function (a, b) {
      return a - b;
    });
    var opcjeDl = '';
    dlugosci.forEach(function (m) {
      opcjeDl += '<option value="' + m + '"' + (m === dl ? ' selected' : '') + '>' +
        (m % 30 === 0 ? godziny(m / 60) : Math.floor(m / 60) + ' h ' + (m % 60) + ' min') + '</option>';
    });
    return (
      '<div class="rez-edycja" hidden>' +
      '<div class="admin-siatka">' +
      '<label>Dzień <input type="date" class="ed-data" value="' + esc(r.data) + '"></label>' +
      '<label>Start <input type="time" class="ed-start" step="300" value="' + godz(r.start_min) + '"></label>' +
      '<label>Długość <select class="ed-dlugosc">' + opcjeDl + '</select></label>' +
      '<label>Miejsce <select class="ed-miejsce">' + opcjeMiejsc(r.miejsce, true) + '</select></label>' +
      '<label>Dopłata <select class="ed-doplata">' +
      '<option value="0"' + (!r.doplata_h ? ' selected' : '') + '>brak (160 zł/h)</option>' +
      '<option value="15"' + (r.doplata_h ? ' selected' : '') + '>+15 zł/h (175 zł/h)</option>' +
      '</select></label>' +
      '</div>' +
      '<p class="admin-drobne">Możesz ustawić dowolny dzień i godzinę, także z krótszym buforem niż wyliczył grafik — pilnuję tylko, żeby jazdy na siebie nie nachodziły. Kursant nie dostaje automatycznej wiadomości o zmianie, a jeśli przypomnienie już wyszło, nowego nie będzie — daj mu znać sam.</p>' +
      '<div class="rez-akcje">' +
      '<button type="button" class="btn btn-primary" data-akcja="zapisz-edycje">Zapisz zmianę</button>' +
      '<button type="button" class="btn btn-secondary" data-akcja="anuluj-edycje">Anuluj</button>' +
      '</div></div>'
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
    document.title = (wstepne.length ? '(' + wstepne.length + ') ' : '') + 'Panel | LajtELka';
  }

  function znajdz(id) {
    for (var i = 0; i < stan.rezerwacje.length; i++) if (stan.rezerwacje[i].id === id) return stan.rezerwacje[i];
    // Kalendarz może pokazywać jazdy starsze niż lista (14 dni wstecz)
    return window.Kalendarz ? window.Kalendarz.rezerwacja(id) : null;
  }

  /** Po każdej zmianie: lista, grafik i kalendarz wczytują się od nowa. */
  function poZmianie() {
    stan.grafik = null;
    document.dispatchEvent(new CustomEvent('panel:zmiana'));
    return wczytajRezerwacje();
  }

  // Jeden słuchacz na całą listę rezerwacji (i okno szczegółów w kalendarzu)
  // zamiast osobnego na każdym przycisku
  function obsluzAkcje(e) {
    var przycisk = e.target.closest('button[data-akcja]');
    if (!przycisk) return;
    var karta = przycisk.closest('.rez');
    if (!karta) return;
    var id = Number(karta.dataset.id);
    // W oknie z kalendarza liczy się to, co widać w oknie (świeże dane kalendarza)
    var r = (karta.closest('#dlg-szczegoly') && window.Kalendarz && window.Kalendarz.rezerwacja(id)) || znajdz(id);
    if (!r) return;
    var akcja = przycisk.dataset.akcja;
    var opis = krotko(r.data) + ' ' + zakres(r) + ' — ' + r.imie;
    var edycja = karta.querySelector('.rez-edycja');

    // Formularz edycji otwieramy i zamykamy bez rozmowy z serwerem
    if (akcja === 'edytuj' || akcja === 'anuluj-edycje') {
      edycja.hidden = akcja === 'anuluj-edycje';
      return;
    }
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
    } else if (akcja === 'zapisz-edycje') {
      dane.akcja = 'edytuj';
      dane.data = edycja.querySelector('.ed-data').value || r.data;
      dane.start = minuty(edycja.querySelector('.ed-start').value);
      dane.koniec = dane.start + Number(edycja.querySelector('.ed-dlugosc').value);
      dane.miejsce = edycja.querySelector('.ed-miejsce').value;
      dane.doplata_h = Number(edycja.querySelector('.ed-doplata').value);
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
          'zapisz-edycje': 'Zmiana zapisana — grafik na stronie przeliczył się od nowa.',
        };
        var tekst = teksty[akcja];
        if (wynik.email_wyslany === true) tekst += ' Kursant dostał e-mail.';
        if (wynik.email_wyslany === false) tekst += ' Uwaga: e-maila nie udało się wysłać — daj znać kursantowi SMS-em.';
        komunikat(tekst, wynik.email_wyslany === false);
        return poZmianie();
      })
      .catch(function (err) {
        przycisk.disabled = false;
        komunikat(err.message, true);
      });
  }

  $('panel-rezerwacje').addEventListener('click', obsluzAkcje);
  $('dlg-szczegoly').addEventListener('click', obsluzAkcje);

  // Przypomnienia (e-mail + SMS) wysyła automat ok. 26 h przed jazdą — ten
  // przycisk robi to od razu dla jazd w ciągu 48 h i pokazuje treść SMS-a.
  $('przypomnij-teraz').addEventListener('click', function () {
    if (!window.confirm('Wysłać teraz przypomnienia (e-mail i SMS) o potwierdzonych jazdach w ciągu najbliższych 48 godzin?\n\nKażda jazda dostaje przypomnienie tylko raz. Normalnie robi to automat ok. 26 h przed jazdą.')) return;
    var btn = $('przypomnij-teraz');
    btn.disabled = true;
    api('/api/admin/przypomnienia', {})
      .then(function (w) {
        var bledy = w.bledy || [];
        komunikat(
          w.jazd === 0
            ? 'Brak potwierdzonych jazd w ciągu 48 h, które czekają na przypomnienie.'
            : 'Jazdy: ' + w.jazd + '. Wysłane e-maile: ' + w.maile + ', SMS-y: ' + w.smsy + '.',
          bledy.length > 0
        );
        if (w.podglad && w.podglad.length) {
          window.alert(
            'Treść SMS-ów' + (w.smsy ? '' : ' (podgląd — wysyłka SMS jest wyłączona albo SMS już wyszedł)') + ':\n\n' +
              w.podglad.map(function (p) { return p.kod + ' (' + p.sms.length + ' znaków):\n' + p.sms; }).join('\n\n') +
              (bledy.length ? '\n\nBłędy:\n' + bledy.join('\n') : '') +
              (w.limit_sms ? '\n\nOsiągnięto dzienny limit SMS-ów.' : '')
          );
        }
        return wczytajRezerwacje();
      })
      .catch(function (err) {
        komunikat(err.message, true);
      })
      .then(function () {
        btn.disabled = false;
      });
  });

  $('odswiez').addEventListener('click', function () {
    wczytajRezerwacje().then(function () {
      komunikat('Odświeżono.');
    });
  });

  /* ---- Ręczne dodawanie — okno "Nowa rezerwacja" z kalendarza -------- */

  $('pokaz-dodaj').addEventListener('click', function () {
    if (window.Kalendarz) window.Kalendarz.nowa({});
  });

  /* ------------------------------------------------------------------ */
  /* Kursanci (konta)                                                    */
  /* ------------------------------------------------------------------ */

  var STATUSY = { wstepna: 'wstępna', potwierdzona: 'potwierdzona', oplacone: 'potwierdzona', anulowane: 'odwołana', odrzucona: 'odrzucona', wygasle: 'wygasła', oczekuje: 'oczekuje' };
  var zegarKursantow = null;

  function wczytajKursantow() {
    var q = $('kursanci-q').value.trim();
    return api('/api/admin/kursanci?konta=1&q=' + encodeURIComponent(q))
      .then(function (d) {
        $('kursanci-lista').innerHTML = d.konta.length
          ? d.konta.map(function (k) {
              return (
                '<details class="admin-karta kursant" data-id="' + k.id + '"><summary>' +
                '<strong>' + esc(k.imie || '(bez imienia)') + '</strong> · ' + esc(k.telefon || '—') + ' · ' + esc(k.email) +
                ' · jazd: ' + k.jazd + (k.ostatnia ? ' · ostatnio ' + esc(krotko(k.ostatnia)) : '') +
                (k.zablokowany ? ' <span class="znaczek znaczek-blad">zablokowany</span>' : '') +
                '</summary><div class="kursant-tresc"><p class="admin-pusto">…</p></div></details>'
              );
            }).join('')
          : '<p class="admin-pusto">Brak kont' + (q ? ' pasujących do wyszukiwania' : '') + '.</p>';
      })
      .catch(function (err) {
        komunikat(err.message, true);
      });
  }

  $('kursanci-q').addEventListener('input', function () {
    clearTimeout(zegarKursantow);
    zegarKursantow = setTimeout(wczytajKursantow, 250);
  });

  // Historia jazd wczytuje się dopiero po rozwinięciu osoby
  $('kursanci-lista').addEventListener('toggle', function (e) {
    var el = e.target;
    if (!el.classList || !el.classList.contains('kursant') || !el.open) return;
    api('/api/admin/kursanci?id=' + el.dataset.id)
      .then(function (d) {
        var k = d.konto;
        el.querySelector('.kursant-tresc').innerHTML =
          '<p class="admin-drobne">Konto od ' + esc(kiedy(k.utworzono_o)) +
          (k.ostatnio_o ? ' · ostatnie logowanie ' + esc(kiedy(k.ostatnio_o)) : '') + ' · język: ' + esc(k.jezyk) + '</p>' +
          (k.rezerwacje.length
            ? '<ul class="kursant-jazdy">' + k.rezerwacje.map(function (r) {
                return '<li><strong>' + esc(krotko(r.data)) + '</strong> ' + zakres(r) + ' · ' + esc(nazwaMiejsca(r.miejsce)) +
                  ' · ' + esc(STATUSY[r.status] || r.status) + (r.zadatek_otrzymany_o ? ' · zadatek ✓' : '') +
                  (r.imie !== k.imie ? ' · jedzie: ' + esc(r.imie) : '') +
                  ' <span class="znaczek">' + esc(r.kod_rezerwacji) + '</span></li>';
              }).join('') + '</ul>'
            : '<p class="admin-pusto">Brak jazd na tym koncie.</p>') +
          '<div class="rez-akcje">' +
          '<button type="button" class="btn btn-secondary" data-kursant="zablokuj" data-zablokowany="' + (k.zablokowany ? '0' : '1') + '">' +
          (k.zablokowany ? 'Odblokuj konto' : 'Zablokuj konto') + '</button>' +
          '<button type="button" class="btn btn-secondary btn-ostrozny" data-kursant="usun">Usuń konto</button>' +
          '</div>';
      })
      .catch(function (err) {
        komunikat(err.message, true);
      });
  }, true);

  $('kursanci-lista').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-kursant]');
    if (!b) return;
    var el = b.closest('.kursant');
    var id = Number(el.dataset.id);
    var nazwa = el.querySelector('summary strong').textContent;
    var dane;
    if (b.dataset.kursant === 'usun') {
      if (!window.confirm('Usunąć konto: ' + nazwa + '?\n\nKursant straci dostęp do konta. Jego rezerwacje zostaną (rozliczenia) i znikną po 180 dniach. Tego nie da się cofnąć.')) return;
      dane = { akcja: 'usun', id: id };
    } else {
      var zablokuj = b.dataset.zablokowany === '1';
      if (zablokuj && !window.confirm('Zablokować konto: ' + nazwa + '?\n\nKursant zostanie wylogowany i nie zaloguje się, dopóki nie odblokujesz.')) return;
      dane = { akcja: 'zablokuj', id: id, zablokowany: zablokuj };
    }
    b.disabled = true;
    api('/api/admin/kursanci', dane)
      .then(function () {
        komunikat(dane.akcja === 'usun' ? 'Konto usunięte.' : dane.zablokowany ? 'Konto zablokowane.' : 'Konto odblokowane.');
        return wczytajKursantow();
      })
      .catch(function (err) {
        b.disabled = false;
        komunikat(err.message, true);
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
        rysujDojazdy();
      })
      .catch(function (err) {
        komunikat(err.message, true);
      });
  }

  function klasaGodziny(h, dzien) {
    if (h.rezerwacja) return h.rezerwacja.status === 'wstepna' ? 'h-wstepna' : 'h-zajeta';
    if (dzien.zablokowany) return 'h-zamknieta';
    if (h.blokada) return 'h-blokada';
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
          ? (h.rezerwacja.status === 'wstepna' ? 'Wstępna: ' : 'Jazda: ') + h.rezerwacja.imie + ' ' +
            godz(h.rezerwacja.start) + '–' + godz(h.rezerwacja.koniec) + ', ' + nazwaMiejsca(h.rezerwacja.miejsce)
          : h.blokada && !dzien.zablokowany
            ? 'Zablokowane ' + godz(h.blokada.start) + '–' + godz(h.blokada.koniec) + (h.blokada.opis ? ': ' + h.blokada.opis : '') + ' — zmienisz w Kalendarzu'
            : h.otwarta && !dzien.zablokowany ? 'Otwarta — kliknij, żeby zamknąć' : 'Zamknięta — kliknij, żeby otworzyć';
        html +=
          '<button type="button" class="h ' + klasaGodziny(h, dzien) + '" data-godzina="' + h.godzina + '"' +
          ' data-otwarta="' + (h.otwarta ? '1' : '0') + '" title="' + esc(tytul) + '" aria-label="' + dwie(h.godzina) + ':00 — ' + esc(tytul) + '"' +
          (h.rezerwacja || h.blokada || dzien.zablokowany ? ' disabled' : '') + '>' +
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

  /* ---- Czasy dojazdu ---------------------------------------------------- */

  function rysujDojazdy() {
    var sel = $('dojazd-z');
    var z = sel.value || (stan.grafik.miejsca[0] && stan.grafik.miejsca[0].id);
    if (!stan.miejsca.length) stan.miejsca = stan.grafik.miejsca;
    sel.innerHTML = opcjeMiejsc(z, false);
    var html = '';
    stan.grafik.dojazdy.forEach(function (p) {
      if (p.z !== z) return;
      html +=
        '<tr data-do="' + esc(p.do_miejsca) + '">' +
        '<td>' + esc(nazwaMiejsca(p.do_miejsca)) + '</td>' +
        '<td><input type="number" class="dj-n" min="0" max="30" step="5" value="' + p.normalnie + '" aria-label="Normalnie, minuty"> min</td>' +
        '<td><input type="number" class="dj-s" min="0" max="30" step="5" value="' + p.szczyt + '" aria-label="W szczycie, minuty"> min</td>' +
        '</tr>';
    });
    $('dojazdy-wiersze').innerHTML = html;
  }

  $('dojazd-z').addEventListener('change', rysujDojazdy);

  $('form-dojazdy').addEventListener('submit', function (e) {
    e.preventDefault();
    pokazBlad('blad-dojazdy', '');
    var z = $('dojazd-z').value;
    var obie = $('dojazd-obie').checked;
    var pary = [];
    var blad = '';
    document.querySelectorAll('#dojazdy-wiersze tr').forEach(function (w) {
      var n = Number(w.querySelector('.dj-n').value);
      var s = Number(w.querySelector('.dj-s').value);
      if (!Number.isInteger(n) || !Number.isInteger(s) || n < 0 || s < 0 || n > 30 || s > 30) blad = 'Czas dojazdu: od 0 do 30 minut.';
      pary.push({ z: z, do_miejsca: w.dataset.do, normalnie: n, szczyt: s });
      if (obie) pary.push({ z: w.dataset.do, do_miejsca: z, normalnie: n, szczyt: s });
    });
    if (blad) return pokazBlad('blad-dojazdy', blad);
    api('/api/admin/grafik', { akcja: 'dojazdy', pary: pary })
      .then(function () {
        komunikat('Czasy dojazdu zapisane — grafik przelicza się od razu.');
        return wczytajGrafik();
      })
      .catch(function (err) {
        pokazBlad('blad-dojazdy', err.message);
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
      if (stan.zakladka === 'kalendarz' && window.Kalendarz) window.Kalendarz.odswiez();
    }
  });

  // Komunikat pokazany w oknie nie może zniknąć razem z oknem (np. jazda
  // przeniesiona na inny tydzień zamyka okno szczegółów). Obserwujemy atrybut
  // "open" zamiast zdarzenia "close" — to drugie bywa w przeglądarkach opóźnione.
  var obserwatorOkien = new MutationObserver(function () {
    var el = $('komunikat');
    var okno = el.closest('dialog');
    if (okno && !okno.open && miejsceKomunikatu) miejsceKomunikatu.appendChild(el);
  });
  document.querySelectorAll('dialog').forEach(function (okno) {
    obserwatorOkien.observe(okno, { attributes: true, attributeFilter: ['open'] });
  });

  // Zamykanie zmiany dnia z kalendarza też musi odświeżyć zakładkę Grafik
  document.addEventListener('panel:zmiana', function () {
    stan.grafik = null;
  });

  // Wspólne narzędzia dla kalendarza (js/kalendarz.js)
  window.Panel = {
    api: api,
    esc: esc,
    godz: godz,
    minuty: minuty,
    dwie: dwie,
    krotko: krotko,
    kiedy: kiedy,
    komunikat: komunikat,
    pokazBlad: pokazBlad,
    kartaRezerwacji: kartaRezerwacji,
    opcjeMiejsc: opcjeMiejsc,
    nazwaMiejsca: nazwaMiejsca,
    poZmianie: poZmianie,
    stan: stan,
    DNI: DNI,
    ZAJMUJACE: ZAJMUJACE,
  };

  api('/api/admin/login')
    .then(function (s) {
      if (s.zalogowany) pokazPanel();
      else pokazLogowanie(s.skonfigurowane ? '' : 'Panel nie jest jeszcze skonfigurowany: ustaw zmienną ADMIN_HASLO w Cloudflare.');
    })
    .catch(function () {
      pokazLogowanie('Brak połączenia z serwerem.');
    });
})();
