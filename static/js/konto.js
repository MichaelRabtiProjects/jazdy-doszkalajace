/* Strona "Moje konto" — logowanie 6-cyfrowym kodem z e-maila, uzupełnienie
   danych, moje rezerwacje (z odwołaniem), zmiana danych, wylogowanie,
   usunięcie konta. Cała logika i bezpieczeństwo są na serwerze
   (functions/api/konto/*, lib/konto.js) — ta strona tylko je pokazuje.

   Dane wstawiamy wyłącznie przez esc() — nic od użytkownika nie staje się
   HTML-em. Język: ten sam przełącznik co na całej stronie (js/i18n.js). */

(function () {
  'use strict';

  var tresc = document.getElementById('konto-tresc');
  var stan = { widok: 'ladowanie', email: '', konto: null, rezerwacje: [], blad: '', info: '', wysylanie: false };

  var T = {
    pl: {
      wstep: 'Zaloguj się albo załóż konto — wystarczy e-mail. Wyślemy Ci 6-cyfrowy kod, bez haseł.',
      email: 'E-mail',
      wyslijKod: 'Wyślij kod',
      kodWyslany: function (e) { return 'Wysłaliśmy kod na ' + e + '. Sprawdź skrzynkę (także spam) — kod jest ważny 10 minut.'; },
      kod: 'Kod z e-maila',
      zaloguj: 'Zaloguj się',
      nowyKod: 'Wyślij nowy kod',
      zmienEmail: 'Zmień e-mail',
      uzupelnij: 'Jeszcze tylko kilka danych — podasz je raz, przy kolejnych rezerwacjach już nie trzeba.',
      imie: 'Imię i nazwisko',
      telefon: 'Telefon',
      telefonInfo: 'Na ten numer przyjdzie SMS z przypomnieniem ok. 26 h przed jazdą.',
      jezyk: 'Język wiadomości',
      zgoda: 'Akceptuję <a href="regulamin.html" target="_blank" rel="noopener">Regulamin</a> i <a href="polityka-prywatnosci.html" target="_blank" rel="noopener">Politykę prywatności</a>.',
      zapisz: 'Zapisz',
      zapisano: 'Zapisano.',
      witaj: function (i) { return 'Dzień dobry, ' + i + '!'; },
      zarezerwuj: 'Zarezerwuj jazdę',
      nadchodzace: 'Nadchodzące jazdy',
      historia: 'Historia',
      brakNadchodzacych: 'Nie masz zaplanowanych jazd.',
      brakHistorii: 'Pusto.',
      status: { wstepna: 'Wstępna — czeka na potwierdzenie', potwierdzona: 'Potwierdzona', oplacone: 'Potwierdzona', odrzucona: 'Niepotwierdzona', anulowane: 'Odwołana', wygasle: 'Wygasła', oczekuje: 'Czeka na płatność' },
      doZaplaty: 'Do zapłaty na miejscu',
      zadatekOk: 'Zadatek otrzymany ✓',
      zadatekZgl: 'Zadatek zgłoszony — czeka na sprawdzenie',
      zadatekBrak: 'Zadatek: jeszcze nie wysłany',
      szczegoly: 'Szczegóły i zadatek',
      odwolaj: 'Odwołaj',
      odwolajPytanie: function (o) { return 'Odwołać jazdę?\n' + o + '\n\nTermin wróci do grafiku. Jeśli zadatek był wpłacony, instruktor go zwróci albo przeniesie na nowy termin.'; },
      odwolano: 'Jazda odwołana. Instruktor dostał wiadomość.',
      osoba: 'Jedzie',
      mojeDane: 'Moje dane',
      wyloguj: 'Wyloguj się',
      wylogujWszedzie: 'Wyloguj ze wszystkich urządzeń',
      usun: 'Usuń konto',
      usunInfo: function (e) { return 'Usunięcie konta jest nieodwracalne. Wyślemy kod na ' + e + ' — wpisz go, żeby potwierdzić. Twoje rezerwacje zostaną u instruktora (rozliczenia) i znikną po 180 dniach.'; },
      usunPotwierdz: 'Usuń konto na zawsze',
      anuluj: 'Anuluj',
      usunieto: 'Konto usunięte.',
      zaloguj2: 'Zaloguj się',
      blad: 'Coś poszło nie tak. Spróbuj ponownie albo zadzwoń: 690 360 164.',
      wylaczone: 'Konta kursantów jeszcze nie działają. Zarezerwuj jazdę w grafiku albo zadzwoń: 690 360 164.',
      dni: ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'],
      doUstalenia: 'miejsce do ustalenia',
    },
    en: {
      wstep: 'Sign in or create an account — all you need is your e-mail. We’ll send you a 6-digit code, no passwords.',
      email: 'E-mail',
      wyslijKod: 'Send code',
      kodWyslany: function (e) { return 'We’ve sent a code to ' + e + '. Check your inbox (and spam) — the code is valid for 10 minutes.'; },
      kod: 'Code from the e-mail',
      zaloguj: 'Sign in',
      nowyKod: 'Send a new code',
      zmienEmail: 'Change e-mail',
      uzupelnij: 'Just a few details — you enter them once and won’t need to again for future bookings.',
      imie: 'First and last name',
      telefon: 'Phone',
      telefonInfo: 'You’ll get a text reminder at this number about 26 hours before the lesson.',
      jezyk: 'Language of messages',
      zgoda: 'I accept the <a href="regulamin.html" target="_blank" rel="noopener">Terms of Service</a> and the <a href="polityka-prywatnosci.html" target="_blank" rel="noopener">Privacy Policy</a>.',
      zapisz: 'Save',
      zapisano: 'Saved.',
      witaj: function (i) { return 'Hello, ' + i + '!'; },
      zarezerwuj: 'Book a lesson',
      nadchodzace: 'Upcoming lessons',
      historia: 'History',
      brakNadchodzacych: 'You have no lessons planned.',
      brakHistorii: 'Nothing here yet.',
      status: { wstepna: 'Provisional — awaiting confirmation', potwierdzona: 'Confirmed', oplacone: 'Confirmed', odrzucona: 'Not confirmed', anulowane: 'Cancelled', wygasle: 'Expired', oczekuje: 'Awaiting payment' },
      doZaplaty: 'To pay on the day',
      zadatekOk: 'Deposit received ✓',
      zadatekZgl: 'Deposit reported — being checked',
      zadatekBrak: 'Deposit: not sent yet',
      szczegoly: 'Details and deposit',
      odwolaj: 'Cancel',
      odwolajPytanie: function (o) { return 'Cancel this lesson?\n' + o + '\n\nThe time will go back to the schedule. If you paid a deposit, the instructor will refund it or move it to a new date.'; },
      odwolano: 'Lesson cancelled. The instructor has been notified.',
      osoba: 'Driver',
      mojeDane: 'My details',
      wyloguj: 'Sign out',
      wylogujWszedzie: 'Sign out on all devices',
      usun: 'Delete account',
      usunInfo: function (e) { return 'Deleting your account cannot be undone. We’ll send a code to ' + e + ' — enter it to confirm. Your bookings stay with the instructor (for accounting) and are deleted after 180 days.'; },
      usunPotwierdz: 'Delete my account',
      anuluj: 'Cancel',
      usunieto: 'Account deleted.',
      zaloguj2: 'Sign in',
      blad: 'Something went wrong. Please try again or call +48 690 360 164.',
      wylaczone: 'Student accounts are not available yet. Book a lesson in the schedule or call +48 690 360 164.',
      dni: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      doUstalenia: 'meeting point to be agreed',
    },
  };

  function jezyk() {
    try {
      return window.localStorage.getItem('jd_jezyk') === 'en' ? 'en' : 'pl';
    } catch (e) {
      return 'pl';
    }
  }
  function t(k) {
    return T[jezyk()][k];
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function dwie(n) {
    return String(n).padStart(2, '0');
  }
  function godz(m) {
    return dwie(Math.floor(m / 60)) + ':' + dwie(m % 60);
  }
  function opisDaty(data) {
    var c = data.split('-');
    var dt = new Date(Date.UTC(+c[0], +c[1] - 1, +c[2])).getUTCDay();
    return t('dni')[dt] + ' ' + c[2] + '.' + c[1] + '.' + c[0];
  }

  function api(sciezka, dane) {
    var opcje = { method: dane ? 'POST' : 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (dane) {
      opcje.headers['Content-Type'] = 'application/json';
      opcje.body = JSON.stringify(dane);
    }
    return fetch(sciezka, opcje).then(function (odp) {
      return odp.json().catch(function () { return {}; }).then(function (j) {
        if (!odp.ok) {
          var e = new Error(j.blad || t('blad'));
          e.kod = j.kod;
          e.status = odp.status;
          throw e;
        }
        return j;
      });
    });
  }

  function ustaw(zmiany) {
    for (var k in zmiany) stan[k] = zmiany[k];
    rysuj();
  }

  /* ------------------------------------------------------------------ */
  /* Rysowanie                                                           */
  /* ------------------------------------------------------------------ */

  function komunikaty() {
    return (stan.blad ? '<p class="konto-blad" role="alert">' + esc(stan.blad) + '</p>' : '') +
      (stan.info ? '<p class="konto-info" role="status">' + esc(stan.info) + '</p>' : '');
  }

  function formularzDanych(nowy) {
    var k = stan.konto || {};
    return (
      '<form class="konto-form" id="form-profil" novalidate>' +
      '<label for="k-imie">' + t('imie') + '</label>' +
      '<input id="k-imie" name="imie" type="text" maxlength="80" autocomplete="name" required value="' + esc(k.imie) + '">' +
      '<label for="k-telefon">' + t('telefon') + '</label>' +
      '<input id="k-telefon" name="telefon" type="tel" maxlength="25" autocomplete="tel" inputmode="tel" required value="' + esc(k.telefon) + '" aria-describedby="k-telefon-info">' +
      '<p class="konto-drobne" id="k-telefon-info">' + t('telefonInfo') + '</p>' +
      '<label for="k-jezyk">' + t('jezyk') + '</label>' +
      '<select id="k-jezyk" name="jezyk"><option value="pl"' + (k.jezyk !== 'en' ? ' selected' : '') + '>Polski</option>' +
      '<option value="en"' + (k.jezyk === 'en' ? ' selected' : '') + '>English</option></select>' +
      (nowy ? '<label class="konto-zgoda"><input type="checkbox" name="zgoda" required> <span>' + t('zgoda') + '</span></label>' : '') +
      '<button type="submit" class="btn btn-primary"' + (stan.wysylanie ? ' disabled' : '') + '>' + t('zapisz') + '</button>' +
      '</form>'
    );
  }

  function kartaRezerwacji(r) {
    var miejsce = r.miejsce ? (jezyk() === 'en' ? r.miejsce.nazwa_en : r.miejsce.nazwa) : t('doUstalenia');
    var zywa = ['wstepna', 'potwierdzona', 'oplacone'].indexOf(r.status) !== -1;
    var zadatek = r.zadatek_otrzymany ? t('zadatekOk') : r.zadatek_zgloszony ? t('zadatekZgl') : t('zadatekBrak');
    var osoba = stan.konto && r.imie && r.imie !== stan.konto.imie ? '<p class="konto-drobne">' + t('osoba') + ': ' + esc(r.imie) + '</p>' : '';
    return (
      '<article class="konto-rez konto-rez-' + esc(r.status) + '">' +
      '<div class="konto-rez-glowa"><strong>' + esc(opisDaty(r.data)) + '</strong> ' + godz(r.start) + '–' + godz(r.koniec) +
      ' <span class="konto-drobne">(' + esc(r.dlugosc_opis || r.dlugosc + ' h') + ')</span></div>' +
      '<div>' + esc(miejsce) + '</div>' + osoba +
      '<span class="konto-znaczek konto-znaczek-' + esc(r.status) + '">' + esc(t('status')[r.status] || r.status) + '</span>' +
      (zywa
        ? '<p class="konto-drobne">' + t('doZaplaty') + ': <strong>' + esc(r.do_zaplaty_na_miejscu) + ' zł</strong> · ' + zadatek + '</p>' +
          '<div class="konto-akcje">' +
          (r.token ? '<a class="btn btn-secondary" href="potwierdzenie.html?t=' + encodeURIComponent(r.token) + '">' + t('szczegoly') + '</a>' : '') +
          (r.mozna_odwolac ? '<button type="button" class="btn btn-secondary konto-odwolaj" data-id="' + esc(r.id) + '">' + t('odwolaj') + '</button>' : '') +
          '</div>'
        : '') +
      '</article>'
    );
  }

  function rysuj() {
    var w = stan.widok;
    var html = '';
    if (w === 'ladowanie') {
      html = '<p class="konto-drobne">…</p>';
    } else if (w === 'wylaczone') {
      html = '<div class="konto-karta"><p>' + t('wylaczone') + '</p><a class="btn btn-primary" href="index.html#grafik">' + t('zarezerwuj') + '</a></div>';
    } else if (w === 'email') {
      html =
        '<div class="konto-karta"><p>' + t('wstep') + '</p>' + komunikaty() +
        '<form class="konto-form" id="form-email" novalidate>' +
        '<label for="k-email">' + t('email') + '</label>' +
        '<input id="k-email" name="email" type="email" maxlength="120" autocomplete="email" inputmode="email" required value="' + esc(stan.email) + '">' +
        '<button type="submit" class="btn btn-primary"' + (stan.wysylanie ? ' disabled' : '') + '>' + t('wyslijKod') + '</button>' +
        '</form></div>';
    } else if (w === 'kod') {
      html =
        '<div class="konto-karta"><p>' + esc(t('kodWyslany')(stan.email)) + '</p>' + komunikaty() +
        '<form class="konto-form" id="form-kod" novalidate>' +
        '<label for="k-kod">' + t('kod') + '</label>' +
        '<input id="k-kod" name="kod" class="konto-kod" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required>' +
        '<button type="submit" class="btn btn-primary"' + (stan.wysylanie ? ' disabled' : '') + '>' + t('zaloguj') + '</button>' +
        '</form>' +
        '<p class="konto-linki"><button type="button" class="konto-link" id="k-nowy-kod">' + t('nowyKod') + '</button> · ' +
        '<button type="button" class="konto-link" id="k-zmien-email">' + t('zmienEmail') + '</button></p></div>';
    } else if (w === 'profil') {
      html = '<div class="konto-karta"><p>' + t('uzupelnij') + '</p>' + komunikaty() + formularzDanych(true) + '</div>';
    } else if (w === 'panel') {
      var dzis = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date());
      var nadchodzace = stan.rezerwacje.filter(function (r) {
        return r.data >= dzis && ['wstepna', 'potwierdzona', 'oplacone'].indexOf(r.status) !== -1;
      }).reverse();
      var historia = stan.rezerwacje.filter(function (r) {
        return nadchodzace.indexOf(r) === -1;
      });
      html =
        '<div class="konto-karta konto-witaj"><p><strong>' + esc(t('witaj')(String(stan.konto.imie).split(' ')[0])) + '</strong> ' +
        '<span class="konto-drobne">' + esc(stan.konto.email) + '</span></p>' +
        '<a class="btn btn-primary" href="index.html#grafik">' + t('zarezerwuj') + '</a></div>' +
        komunikaty() +
        '<h2 class="konto-naglowek">' + t('nadchodzace') + '</h2>' +
        (nadchodzace.length ? nadchodzace.map(kartaRezerwacji).join('') : '<p class="konto-drobne">' + t('brakNadchodzacych') + '</p>') +
        (historia.length ? '<details class="konto-historia"><summary>' + t('historia') + ' (' + historia.length + ')</summary>' + historia.map(kartaRezerwacji).join('') + '</details>' : '') +
        '<details class="konto-historia"><summary>' + t('mojeDane') + '</summary><div class="konto-karta">' + formularzDanych(false) + '</div></details>' +
        '<div class="konto-akcje konto-stopka">' +
        '<button type="button" class="btn btn-secondary" id="k-wyloguj">' + t('wyloguj') + '</button>' +
        '<button type="button" class="btn btn-secondary" id="k-wyloguj-wszedzie">' + t('wylogujWszedzie') + '</button>' +
        '<button type="button" class="btn btn-secondary konto-ostrozny" id="k-usun">' + t('usun') + '</button>' +
        '</div>';
    } else if (w === 'usun') {
      html =
        '<div class="konto-karta"><p>' + esc(t('usunInfo')(stan.konto.email)) + '</p>' + komunikaty() +
        '<form class="konto-form" id="form-usun" novalidate>' +
        '<label for="k-kod-usun">' + t('kod') + '</label>' +
        '<input id="k-kod-usun" name="kod" class="konto-kod" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>' +
        '<button type="submit" class="btn btn-primary konto-ostrozny"' + (stan.wysylanie ? ' disabled' : '') + '>' + t('usunPotwierdz') + '</button>' +
        '</form><p class="konto-linki"><button type="button" class="konto-link" id="k-usun-anuluj">' + t('anuluj') + '</button></p></div>';
    } else if (w === 'usuniete') {
      html = '<div class="konto-karta"><p>' + t('usunieto') + '</p><button type="button" class="btn btn-primary" id="k-od-nowa">' + t('zaloguj2') + '</button></div>';
    }
    tresc.innerHTML = html;
    var pierwsze = tresc.querySelector('input:not([type=checkbox])');
    if (pierwsze && (w === 'email' || w === 'kod' || w === 'usun') && !pierwsze.value) pierwsze.focus();
  }

  /* ------------------------------------------------------------------ */
  /* Akcje                                                               */
  /* ------------------------------------------------------------------ */

  function bladNaEkran(err) {
    if (err.status === 401) return start();
    ustaw({ wysylanie: false, blad: err.message, info: '' });
  }

  function wyslijKod(email) {
    ustaw({ wysylanie: true, blad: '', info: '' });
    return api('/api/konto/kod', { email: email, jezyk: jezyk() })
      .then(function () {
        ustaw({ wysylanie: false, email: email, widok: stan.widok === 'usun' ? 'usun' : 'kod' });
      })
      .catch(bladNaEkran);
  }

  function wczytajPanel() {
    return api('/api/konto/rezerwacje').then(function (d) {
      ustaw({ widok: 'panel', rezerwacje: d.rezerwacje, wysylanie: false });
    });
  }

  function poZalogowaniu(konto) {
    stan.konto = konto;
    if (!konto.kompletny) return ustaw({ widok: 'profil', wysylanie: false, blad: '', info: '' });
    return wczytajPanel();
  }

  tresc.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    if (f.id === 'form-email') {
      wyslijKod(f.elements.email.value.trim());
    } else if (f.id === 'form-kod') {
      ustaw({ wysylanie: true, blad: '' });
      api('/api/konto/weryfikuj', { email: stan.email, kod: f.elements.kod.value.trim(), jezyk: jezyk() })
        .then(function (d) {
          return poZalogowaniu(d.konto);
        })
        .catch(bladNaEkran);
    } else if (f.id === 'form-profil') {
      var dane = {
        imie: f.elements.imie.value,
        telefon: f.elements.telefon.value,
        jezyk: f.elements.jezyk.value,
        zgoda_regulamin: f.elements.zgoda ? f.elements.zgoda.checked : undefined,
      };
      var bylNowy = stan.widok === 'profil';
      ustaw({ wysylanie: true, blad: '', info: '' });
      api('/api/konto/profil', dane)
        .then(function (d) {
          stan.konto = d.konto;
          stan.info = bylNowy ? '' : t('zapisano');
          return wczytajPanel();
        })
        .catch(bladNaEkran);
    } else if (f.id === 'form-usun') {
      ustaw({ wysylanie: true, blad: '' });
      api('/api/konto/usun', { kod: f.elements.kod.value.trim() })
        .then(function () {
          ustaw({ widok: 'usuniete', konto: null, rezerwacje: [], wysylanie: false });
        })
        .catch(bladNaEkran);
    }
  });

  tresc.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'k-nowy-kod') return wyslijKod(stan.email);
    if (b.id === 'k-zmien-email') return ustaw({ widok: 'email', blad: '', info: '' });
    if (b.id === 'k-wyloguj' || b.id === 'k-wyloguj-wszedzie') {
      return api('/api/konto/wyloguj', { wszedzie: b.id === 'k-wyloguj-wszedzie' }).then(function () {
        ustaw({ widok: 'email', konto: null, rezerwacje: [], blad: '', info: '' });
      }).catch(bladNaEkran);
    }
    if (b.id === 'k-usun') {
      ustaw({ widok: 'usun', blad: '', info: '' });
      return wyslijKod(stan.konto.email);
    }
    if (b.id === 'k-usun-anuluj') return wczytajPanel().catch(bladNaEkran);
    if (b.id === 'k-od-nowa') return ustaw({ widok: 'email', email: '' });
    if (b.classList.contains('konto-odwolaj')) {
      var id = Number(b.dataset.id);
      var r = stan.rezerwacje.filter(function (x) { return x.id === id; })[0];
      if (!r || !window.confirm(t('odwolajPytanie')(opisDaty(r.data) + ' ' + godz(r.start) + '–' + godz(r.koniec)))) return;
      b.disabled = true;
      api('/api/konto/rezerwacje', { id: id, jezyk: jezyk() })
        .then(function (d) {
          ustaw({ rezerwacje: d.rezerwacje, info: t('odwolano'), blad: '' });
        })
        .catch(bladNaEkran);
    }
  });

  // Przełącznik PL / EN na górze strony — przerysowujemy teksty
  document.addEventListener('jd:jezyk', rysuj);

  function start() {
    ustaw({ widok: 'ladowanie', blad: '', info: '', wysylanie: false });
    api('/api/konto/ja')
      .then(function (d) {
        if (!d.zalogowany) return ustaw({ widok: 'email' });
        return poZalogowaniu(d.konto);
      })
      .catch(function (err) {
        if (err.kod === 'KONTA_WYLACZONE') return ustaw({ widok: 'wylaczone' });
        ustaw({ widok: 'email', blad: err.message });
      });
  }

  start();
})();
