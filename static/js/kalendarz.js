/* Kalendarz w panelu — widok dnia / tygodnia / miesiąca jak w panelu
   Calendesk (decyzje właściciela: docs/plan-konta-sms-grafik.md).

   - jazdy jako bloki na osi godzin (potwierdzone, wstępne), blokady
     fioletowe w paski, czas poza godzinami pracy przyciemniony, linia "teraz",
   - klik w jazdę → szczegóły i te same akcje co na liście (js/admin.js),
   - klik w puste miejsce → "Nowa rezerwacja" z tą datą i godziną,
   - przeciąganie jazdy / blokady na inną godzinę albo dzień (na telefonie:
     przytrzymaj blok, potem przesuń),
   - "Blokada kalendarza": zablokowany czas znika z grafiku kursantów.

   Korzysta z narzędzi panelu (window.Panel z js/admin.js). Dane kursantów
   wstawiamy wyłącznie przez esc() — imię nie może stać się HTML-em. */

(function () {
  'use strict';

  var P = window.Panel;
  if (!P) return;

  var $ = function (id) {
    return document.getElementById(id);
  };
  var esc = P.esc;
  var godz = P.godz;

  /** Wysokość godziny w px — ta sama co --k-px-godz w admin.css. */
  var PX_GODZ = 48;
  var PX = PX_GODZ / 60;
  /** Przeciąganie co 5 minut (starty po dojeździe bywają np. 13:25). */
  var KROK = 5;
  /** Klik w puste miejsce: start zaokrąglony w dół do pół godziny. */
  var KROK_KLIKU = 30;
  var WIDOKI = ['dzien', 'tydzien', 'miesiac'];
  var DNI_GLOWA = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];
  var DNI_MIESIAC = ['pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.', 'niedz.'];

  var K = {
    widok: 'tydzien',
    data: null, // dzień, wokół którego jest widok (YYYY-MM-DD)
    dane: null, // odpowiedź /api/admin/kalendarz
    zakres: null,
    os: { od: 420, do: 1260 }, // zakres osi godzin w minutach
    nrWczytania: 0,
    nieaktualne: true,
    zaladowany: null, // { widok, data } ostatnio wczytanych danych
    podpisOtwartego: '', // co pokazuje okno szczegółów (żeby nie odświeżać go bez potrzeby)
    otwarte: null, // { typ: 'rez'|'blok'|'dzien', id, data } — okno szczegółów
    tryb: 'rezerwacja', // okno "Nowa rezerwacja": 'rezerwacja' | 'blokada'
    edytowanaBlokada: null,
    poPrzeciaganiu: false,
    przewinieto: false,
  };

  var obszar = $('kal-obszar');
  var F = $('form-nowa');

  /* ------------------------------------------------------------------ */
  /* Daty (bez stref — sama data kalendarzowa liczona w UTC)             */
  /* ------------------------------------------------------------------ */

  function ms(data) {
    var c = data.split('-');
    return Date.UTC(+c[0], +c[1] - 1, +c[2]);
  }
  function zMs(t) {
    return new Date(t).toISOString().slice(0, 10);
  }
  function dodaj(data, dni) {
    return zMs(ms(data) + dni * 86400000);
  }
  function dzienTyg(data) {
    return new Date(ms(data)).getUTCDay();
  }
  function poniedzialek(data) {
    var dt = dzienTyg(data);
    return dodaj(data, dt === 0 ? -6 : 1 - dt);
  }
  function fmt(data, opcje) {
    return new Intl.DateTimeFormat('pl-PL', Object.assign({ timeZone: 'UTC' }, opcje)).format(new Date(ms(data)));
  }
  function ddmm(data) {
    var c = data.split('-');
    return c[2] + '.' + c[1];
  }
  function dzisPL() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date());
  }
  function terazPL() {
    var c = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .format(new Date())
      .split(':');
    return +c[0] * 60 + +c[1];
  }
  /** Numer tygodnia ISO (jak "Tydz. 43" w Calendesku). */
  function nrTygodnia(data) {
    var d = new Date(ms(data));
    var dt = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dt);
    return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  }
  function dzis() {
    return (K.dane && K.dane.dzisiaj) || dzisPL();
  }
  function dlugoscTekst(min) {
    var h = min / 60;
    return (Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')) + ' h';
  }

  /* ------------------------------------------------------------------ */
  /* Wczytywanie                                                         */
  /* ------------------------------------------------------------------ */

  function zakresWidoku() {
    if (K.widok === 'dzien') return { od: K.data, do: K.data };
    if (K.widok === 'tydzien') {
      var p = poniedzialek(K.data);
      return { od: p, do: dodaj(p, 6) };
    }
    var c = K.data.split('-');
    var pierwszy = c[0] + '-' + c[1] + '-01';
    var ostatni = zMs(Date.UTC(+c[0], +c[1], 0));
    return { od: poniedzialek(pierwszy), do: dodaj(poniedzialek(ostatni), 6) };
  }

  /** Wczytuje widok K.widok / K.data. Zwraca obietnicę true (udało się) / false. */
  function wczytaj() {
    var z = zakresWidoku();
    var nr = ++K.nrWczytania;
    obszar.classList.add('is-ladowanie');
    rysujPasek(z);
    return P.api('/api/admin/kalendarz?od=' + z.od + '&do=' + z.do)
      .then(function (d) {
        if (nr !== K.nrWczytania) return false; // w międzyczasie kliknięto dalej
        K.dane = d;
        K.zakres = z;
        K.zaladowany = { widok: K.widok, data: K.data };
        K.nieaktualne = false;
        if (!P.stan.miejsca.length) P.stan.miejsca = d.miejsca;
        rysuj();
        odswiezOtwarte();
        return true;
      })
      .catch(function (err) {
        if (nr !== K.nrWczytania) return false;
        // Wracamy do widoku, którego dane naprawdę mamy, i spróbujemy jeszcze raz
        K.nieaktualne = true;
        if (K.zaladowany) {
          K.widok = K.zaladowany.widok;
          K.data = K.zaladowany.data;
          rysujPasek(K.zakres);
        }
        P.komunikat(err.message, true);
        return false;
      })
      .then(function (ok) {
        if (nr === K.nrWczytania) obszar.classList.remove('is-ladowanie');
        return ok;
      });
  }

  function rezerwacja(id) {
    if (!K.dane) return null;
    for (var i = 0; i < K.dane.rezerwacje.length; i++) if (K.dane.rezerwacje[i].id === id) return K.dane.rezerwacje[i];
    return null;
  }
  function blokada(id) {
    if (!K.dane) return null;
    for (var i = 0; i < K.dane.blokady.length; i++) if (K.dane.blokady[i].id === id) return K.dane.blokady[i];
    return null;
  }
  function dzien(data) {
    if (K.dane) for (var i = 0; i < K.dane.dni.length; i++) if (K.dane.dni[i].data === data) return K.dane.dni[i];
    return { data: data, zamkniety: false, praca: [] };
  }

  /* ------------------------------------------------------------------ */
  /* Pasek: tytuł, widoki, "Dziś"                                        */
  /* ------------------------------------------------------------------ */

  function rysujPasek(z) {
    var t;
    if (K.widok === 'dzien') {
      t = fmt(K.data, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } else if (K.widok === 'tydzien') {
      var tenSam = z.od.slice(0, 7) === z.do.slice(0, 7);
      t = (tenSam ? fmt(z.od, { day: 'numeric' }) : fmt(z.od, { day: 'numeric', month: 'long' })) + ' – ' +
        fmt(z.do, { day: 'numeric', month: 'long', year: 'numeric' });
    } else {
      t = fmt(K.data, { month: 'long', year: 'numeric' });
    }
    $('kal-tytul').textContent = t;
    document.querySelectorAll('.kal-widok').forEach(function (b) {
      var akt = b.dataset.widok === K.widok;
      b.classList.toggle('is-active', akt);
      b.setAttribute('aria-pressed', String(akt));
    });
    var d = dzis();
    var widacDzis = K.widok === 'miesiac' ? d.slice(0, 7) === K.data.slice(0, 7) : d >= z.od && d <= z.do;
    $('kal-dzis').disabled = widacDzis;
  }

  /**
   * Kalendarz zajmuje ekran do samego dołu, ale nie więcej — inaczej na
   * telefonie dolne godziny chowały się pod krawędzią i trzeba było przewijać
   * i stronę, i kalendarz.
   */
  function dopasujWysokosc() {
    if ($('panel-kalendarz').hidden) return;
    var widoczna = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    var gora = obszar.getBoundingClientRect().top + (window.scrollY || 0);
    obszar.style.maxHeight = Math.max(360, Math.round(widoczna - Math.max(gora - (window.scrollY || 0), 0) - 12)) + 'px';
  }

  function rysuj() {
    if (!K.dane) return;
    rysujPasek(K.zakres);
    dopasujWysokosc();
    if (K.widok === 'miesiac') return rysujMiesiac();
    var daty = [];
    for (var d = K.zakres.od; d <= K.zakres.do; d = dodaj(d, 1)) daty.push(d);
    rysujDni(daty);
  }

  /* ------------------------------------------------------------------ */
  /* Dzień / tydzień                                                     */
  /* ------------------------------------------------------------------ */

  /** Zakres osi: co najmniej 7:00–21:00 (jak w Calendesku), szerzej gdy trzeba. */
  function policzOs(daty) {
    var od = 7 * 60;
    var doM = 21 * 60;
    daty.forEach(function (data) {
      dzien(data).praca.forEach(function (p) {
        od = Math.min(od, p[0]);
        doM = Math.max(doM, p[1]);
      });
    });
    wydarzeniaDni(daty).forEach(function (w) {
      od = Math.min(od, w.x.start_min);
      doM = Math.max(doM, w.x.koniec_min);
    });
    return { od: Math.floor(od / 60) * 60, do: Math.min(24 * 60, Math.ceil(doM / 60) * 60) };
  }

  function wydarzeniaDni(daty) {
    var wynik = [];
    K.dane.rezerwacje.forEach(function (r) {
      if (daty.indexOf(r.data) !== -1) wynik.push({ typ: 'rez', x: r });
    });
    K.dane.blokady.forEach(function (b) {
      if (daty.indexOf(b.data) !== -1) wynik.push({ typ: 'blok', x: b });
    });
    return wynik;
  }

  /** Nakładające się bloki dzielą szerokość kolumny (rzadkie — baza tego pilnuje). */
  function rozlozTory(lista) {
    lista.sort(function (a, b) {
      return a.x.start_min - b.x.start_min || b.x.koniec_min - a.x.koniec_min;
    });
    var grupa = [];
    var koniecGrupy = -1;
    function zamknij() {
      var tory = [];
      grupa.forEach(function (w) {
        var t = 0;
        while (tory[t] > w.x.start_min) t++;
        tory[t] = w.x.koniec_min;
        w.tor = t;
      });
      grupa.forEach(function (w) {
        w.torow = tory.length;
      });
      grupa = [];
    }
    lista.forEach(function (w) {
      if (w.x.start_min >= koniecGrupy && grupa.length) zamknij();
      grupa.push(w);
      koniecGrupy = Math.max(koniecGrupy, w.x.koniec_min);
    });
    if (grupa.length) zamknij();
    return lista;
  }

  function nazwaMiejsca(id) {
    var n = P.nazwaMiejsca(id);
    return n.split(' (')[0];
  }

  function htmlWydarzenia(w, dzisiaj, teraz) {
    var x = w.x;
    var top = (x.start_min - K.os.od) * PX + 1;
    var wys = Math.max((x.koniec_min - x.start_min) * PX - 2, 18);
    var szer = 100 / (w.torow || 1);
    var styl = 'top:' + top + 'px;height:' + wys + 'px;left:calc(' + szer * (w.tor || 0) + '% + 2px);width:calc(' + szer + '% - 5px)';
    var przeszla = x.data < dzisiaj || (x.data === dzisiaj && x.koniec_min <= teraz);
    var czas = godz(x.start_min) + ' - ' + godz(x.koniec_min);
    var klasa;
    var tresc;
    var opis;

    if (w.typ === 'rez') {
      var zn = '';
      if (x.zadatek_otrzymany_o) zn += '<span class="kal-znaczek kal-zn-zaplacone">Zadatek ✓</span>';
      else if (x.zadatek_zgloszony_o) zn += '<span class="kal-znaczek kal-zn-zgloszony">Zadatek zgłoszony</span>';
      if (x.status === 'wstepna') zn += '<span class="kal-znaczek kal-zn-wstepna">Wstępna</span>';
      var miejsce = nazwaMiejsca(x.miejsce);
      klasa = 'kal-wyd kal-wyd-' + x.status;
      tresc =
        '<span class="kal-wyd-czas">' + czas + zn + '</span>' +
        '<span class="kal-wyd-tytul">' + esc(x.imie) + '</span>' +
        '<span class="kal-wyd-opis">Jazda ' + dlugoscTekst(x.koniec_min - x.start_min) + ' · ' + esc(miejsce) + '</span>' +
        (x.pierwsza ? '<span class="kal-znaczek kal-zn-pierwsza">Pierwsza rezerwacja</span>' : '');
      opis = (x.status === 'wstepna' ? 'Wstępna rezerwacja ' : 'Jazda ') + czas + ', ' + x.imie + ', ' + miejsce;
    } else {
      klasa = 'kal-wyd kal-wyd-blokada';
      tresc =
        '<span class="kal-wyd-czas">' + czas + '</span>' +
        '<span class="kal-wyd-tytul">Zablokowane' + (x.opis ? ': ' + esc(x.opis) : '') + '</span>';
      opis = 'Blokada ' + czas + (x.opis ? ', ' + x.opis : '');
    }
    return (
      '<button type="button" class="' + klasa + (przeszla ? ' is-przeszla' : '') + '" style="' + styl + '"' +
      ' data-typ="' + w.typ + '" data-id="' + x.id + '" aria-label="' + esc(opis) + '">' + tresc + '</button>'
    );
  }

  function rysujDni(daty) {
    var dzisiaj = dzis();
    var teraz = K.dane.dzisiaj === dzisPL() ? terazPL() : K.dane.teraz;
    K.os = policzOs(daty);
    var wys = (K.os.do - K.os.od) * PX;
    var wszystkie = wydarzeniaDni(daty);

    // Minimalna szerokość kolumny tygodnia na telefonie ustawia CSS (.is-tydzien)
    var html =
      '<div class="kal-siatka' + (daty.length > 1 ? ' is-tydzien' : '') + '" style="--k-kol:' + daty.length + '">' +
      '<div class="kal-rog" title="Numer tygodnia">Tydz. ' + nrTygodnia(daty[0]) + '</div>';

    daty.forEach(function (data) {
      var dz = dzien(data);
      html +=
        '<div class="kal-dzien-glowa' + (data === dzisiaj ? ' is-dzis' : '') + (dz.zamkniety ? ' is-zamkniety' : '') + '"' +
        ' data-dzien="' + data + '" role="button" tabindex="0" title="Pokaż ten dzień">' +
        (daty.length === 1
          ? esc(fmt(data, { weekday: 'long' })) + ' ' + ddmm(data)
          : DNI_GLOWA[dzienTyg(data)] + ' ' + ddmm(data)) +
        '</div>';
    });

    html += '<div class="kal-cd-rog">Cały<br>dzień</div>';
    daty.forEach(function (data) {
      html +=
        '<div class="kal-cd">' +
        (dzien(data).zamkniety
          ? '<button type="button" class="kal-cd-blok" data-zamkniety="' + data + '">Dzień zamknięty</button>'
          : '') +
        '</div>';
    });

    html += '<div class="kal-os" style="height:' + wys + 'px">';
    for (var m = K.os.od; m <= K.os.do; m += 60) {
      if (m === K.os.od) continue;
      html += '<span class="kal-os-godz" style="top:' + (m - K.os.od) * PX + 'px">' + godz(m % 1440) + '</span>';
    }
    html += '</div>';

    daty.forEach(function (data) {
      var dz = dzien(data);
      html +=
        '<div class="kal-kolumna' + (data === dzisiaj ? ' is-dzis' : '') + (dz.zamkniety ? ' is-zamkniety' : '') + '"' +
        ' data-data="' + data + '" style="height:' + wys + 'px">';

      // Czas poza godzinami pracy (dzień zamknięty = cały)
      var praca = dz.zamkniety ? [] : dz.praca;
      var kursor = K.os.od;
      praca.concat([[K.os.do, K.os.do]]).forEach(function (p) {
        var od = Math.max(p[0], K.os.od);
        if (od > kursor) {
          html += '<div class="kal-poza" style="top:' + (kursor - K.os.od) * PX + 'px;height:' + (od - kursor) * PX + 'px"></div>';
        }
        kursor = Math.max(kursor, Math.min(p[1], K.os.do));
      });

      rozlozTory(wszystkie.filter(function (w) {
        return w.x.data === data;
      })).forEach(function (w) {
        html += htmlWydarzenia(w, dzisiaj, teraz);
      });

      if (data === dzisiaj && teraz >= K.os.od && teraz <= K.os.do) {
        html += '<div class="kal-teraz" style="top:' + (teraz - K.os.od) * PX + 'px"></div>';
      }
      html += '</div>';
    });

    html += '</div>';
    obszar.innerHTML = html;

    // Za pierwszym razem przewijamy do początku pracy (albo do "teraz")
    if (!K.przewinieto) {
      K.przewinieto = true;
      var pierwszaPraca = Math.min.apply(null, daty.map(function (d) {
        var p = dzien(d).praca;
        return p.length ? p[0][0] : 600;
      }));
      var cel = daty.indexOf(dzisiaj) !== -1 && teraz > pierwszaPraca ? teraz - 90 : pierwszaPraca - 30;
      obszar.scrollTop = Math.max(0, (cel - K.os.od) * PX);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Miesiąc                                                             */
  /* ------------------------------------------------------------------ */

  function rysujMiesiac() {
    var dzisiaj = dzis();
    var miesiac = K.data.slice(0, 7);
    var html = '<div class="kal-miesiac">';
    DNI_MIESIAC.forEach(function (n) {
      html += '<div class="kal-m-glowa">' + n + '</div>';
    });
    for (var data = K.zakres.od; data <= K.zakres.do; data = dodaj(data, 1)) {
      var dz = dzien(data);
      var lista = rozlozTory(wydarzeniaDni([data]));
      html +=
        '<div class="kal-m-dzien' + (data.slice(0, 7) !== miesiac ? ' is-inny' : '') + (data === dzisiaj ? ' is-dzis' : '') +
        (dz.zamkniety ? ' is-zamkniety' : '') + '" data-data="' + data + '">' +
        '<button type="button" class="kal-m-nr" data-dzien="' + data + '" aria-label="' + esc(fmt(data, { weekday: 'long', day: 'numeric', month: 'long' })) + '">' +
        Number(data.slice(8)) + '</button>';
      if (dz.zamkniety) html += '<button type="button" class="kal-m-wpis kal-wyd-blokada" data-zamkniety="' + data + '">Dzień zamknięty</button>';
      lista.slice(0, 3).forEach(function (w) {
        var x = w.x;
        var tekst = godz(x.start_min) + ' ' + (w.typ === 'rez' ? x.imie : 'Zablokowane' + (x.opis ? ': ' + x.opis : ''));
        html +=
          '<button type="button" class="kal-m-wpis ' + (w.typ === 'rez' ? 'kal-wyd-' + x.status : 'kal-wyd-blokada') + '"' +
          ' data-typ="' + w.typ + '" data-id="' + x.id + '" title="' + esc(tekst) + '">' + esc(tekst) + '</button>';
      });
      if (lista.length > 3) {
        html += '<button type="button" class="kal-m-wiecej" data-dzien="' + data + '">+' + (lista.length - 3) + ' więcej</button>';
      }
      html += '</div>';
    }
    obszar.innerHTML = html + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Kliknięcia w kalendarzu                                             */
  /* ------------------------------------------------------------------ */

  function pokazDzien(data) {
    K.widok = 'dzien';
    K.data = data;
    zapiszWidok();
    wczytaj();
  }

  obszar.addEventListener('click', function (e) {
    if (K.poPrzeciaganiu) return;
    var wyd = e.target.closest('[data-typ][data-id]');
    if (wyd) return otworzSzczegoly(wyd.dataset.typ, Number(wyd.dataset.id));

    var zamk = e.target.closest('[data-zamkniety]');
    if (zamk) return otworzSzczegoly('dzien', null, zamk.dataset.zamkniety);

    var dz = e.target.closest('[data-dzien]');
    if (dz) return pokazDzien(dz.dataset.dzien);

    var kol = e.target.closest('.kal-kolumna');
    if (kol) {
      var y = e.clientY - kol.getBoundingClientRect().top;
      var start = Math.floor((K.os.od + y / PX) / KROK_KLIKU) * KROK_KLIKU;
      return nowa({ data: kol.dataset.data, start: Math.min(start, 23 * 60) });
    }
    var dzM = e.target.closest('.kal-m-dzien');
    if (dzM) return nowa({ data: dzM.dataset.data });
  });

  obszar.addEventListener('keydown', function (e) {
    var dz = e.target.closest('.kal-dzien-glowa[data-dzien]');
    if (dz && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      pokazDzien(dz.dataset.dzien);
    }
  });

  /* ------------------------------------------------------------------ */
  /* Okno szczegółów                                                     */
  /* ------------------------------------------------------------------ */

  var dlgSzczegoly = $('dlg-szczegoly');

  function linkiKontaktu(telefon) {
    var cyfry = String(telefon || '').replace(/\D/g, '');
    if (cyfry.length === 9) cyfry = '48' + cyfry;
    else if (cyfry.indexOf('00') === 0) cyfry = cyfry.slice(2);
    if (cyfry.length < 10) return '';
    return (
      '<div class="dlg-kontakt">' +
      '<a class="btn btn-secondary" href="tel:+' + cyfry + '">Zadzwoń</a>' +
      '<a class="btn btn-secondary" href="sms:+' + cyfry + '">SMS</a>' +
      '<a class="btn btn-secondary" href="https://wa.me/' + cyfry + '" target="_blank" rel="noopener">WhatsApp</a>' +
      '</div>'
    );
  }

  function otworzSzczegoly(typ, id, data) {
    K.otwarte = { typ: typ, id: id, data: data };
    if (!wypelnijSzczegoly()) return;
    if (!dlgSzczegoly.open) dlgSzczegoly.showModal();
  }

  /** Zwraca false (i zamyka okno), gdy tego, co pokazywało, już nie ma. */
  function wypelnijSzczegoly() {
    var o = K.otwarte;
    var tytul = $('dlg-szczegoly-tytul');
    var tresc = $('dlg-szczegoly-tresc');
    if (!o) return false;
    K.podpisOtwartego = podpisOtwartego();

    if (o.typ === 'rez') {
      var r = rezerwacja(o.id);
      if (!r) return zamknijSzczegoly();
      var rodzaj = r.status === 'wstepna' ? 'wstepna' : r.data >= dzis() ? 'nadchodzaca' : 'historia';
      tytul.textContent = (r.status === 'wstepna' ? 'Wstępna rezerwacja' : 'Jazda') + ' · ' + P.krotko(r.data) + ' ' +
        godz(r.start_min) + '–' + godz(r.koniec_min);
      tresc.innerHTML =
        linkiKontaktu(r.telefon) +
        P.kartaRezerwacji(r, rodzaj) +
        (r.pierwsza ? '<p class="admin-drobne">To pierwsza rezerwacja tej osoby (w danych z ostatniego pół roku).</p>' : '');
      return true;
    }

    if (o.typ === 'blok') {
      var b = blokada(o.id);
      if (!b) return zamknijSzczegoly();
      tytul.textContent = 'Blokada kalendarza';
      tresc.innerHTML =
        '<p class="rez-termin"><strong>' + esc(P.krotko(b.data)) + '</strong> ' + godz(b.start_min) + '–' + godz(b.koniec_min) + '</p>' +
        '<p class="rez-osoba">' + (b.opis ? esc(b.opis) : 'Zablokowane') + '</p>' +
        '<p class="admin-drobne">Kursanci nie widzą tego czasu w grafiku i nie mogą się na niego zapisać. Opis widzisz tylko Ty.</p>' +
        '<div class="rez-akcje">' +
        '<button type="button" class="btn btn-primary" id="blok-edytuj">Zmień godziny / opis</button>' +
        '<button type="button" class="btn btn-secondary btn-ostrozny" id="blok-usun">Usuń blokadę</button>' +
        '</div>';
      $('blok-edytuj').addEventListener('click', function () {
        dlgSzczegoly.close();
        nowa({ tryb: 'blokada', blokada: b });
      });
      $('blok-usun').addEventListener('click', function () {
        usunBlokade(b);
      });
      return true;
    }

    // Zamknięty cały dzień
    if (!dzien(o.data).zamkniety) return zamknijSzczegoly();
    var przeszly = o.data < dzis();
    tytul.textContent = 'Dzień zamknięty';
    tresc.innerHTML =
      '<p class="rez-termin"><strong>' + esc(fmt(o.data, { weekday: 'long', day: 'numeric', month: 'long' })) + '</strong></p>' +
      (przeszly
        ? '<p class="admin-drobne">Ten dzień już minął.</p>'
        : '<p class="admin-drobne">Tego dnia nic nie da się zarezerwować. Jazdy, które już były, zostają.</p>' +
          '<div class="rez-akcje"><button type="button" class="btn btn-primary" id="dzien-otworz">Otwórz dzień</button></div>');
    if (przeszly) return true;
    $('dzien-otworz').addEventListener('click', function (e) {
      e.target.disabled = true;
      P.api('/api/admin/grafik', { akcja: 'dzien', data: o.data, zamkniety: false })
        .then(function () {
          P.komunikat('Dzień otwarty — godziny wróciły do grafiku.');
          dlgSzczegoly.close();
          return P.poZmianie();
        })
        .catch(function (err) {
          e.target.disabled = false;
          P.komunikat(err.message, true);
        });
    });
    return true;
  }

  function zamknijSzczegoly() {
    K.otwarte = null;
    if (dlgSzczegoly.open) dlgSzczegoly.close();
    return false;
  }

  /** Co dokładnie pokazuje okno — zmiana podpisu = trzeba je narysować od nowa. */
  function podpisOtwartego() {
    var o = K.otwarte;
    if (!o) return '';
    if (o.typ === 'rez') return JSON.stringify(rezerwacja(o.id));
    if (o.typ === 'blok') return JSON.stringify(blokada(o.id));
    return String(dzien(o.data).zamkniety);
  }

  /**
   * Po wczytaniu danych — okno pokazuje świeży stan albo się zamyka. Gdy nic
   * się nie zmieniło, nie ruszamy go: odświeżenie w tle (np. po powrocie
   * z rozmowy telefonicznej) nie może skasować otwartego formularza zmiany
   * godziny ani odznaczonego "Wyślij kursantowi e-mail".
   */
  function odswiezOtwarte() {
    if (!dlgSzczegoly.open || !K.otwarte) return;
    if (podpisOtwartego() === K.podpisOtwartego) return;
    wypelnijSzczegoly();
  }

  dlgSzczegoly.addEventListener('close', function () {
    K.otwarte = null;
  });
  // Klik w przyciemnione tło (poza oknem) zamyka okno szczegółów. Na telefonie
  // okno zajmuje cały ekran — tam stuknięcie w puste miejsce niczego nie zamyka.
  dlgSzczegoly.addEventListener('click', function (e) {
    if (e.target !== dlgSzczegoly) return;
    var r = dlgSzczegoly.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlgSzczegoly.close();
  });

  function usunBlokade(b) {
    if (!window.confirm('Usunąć blokadę ' + P.krotko(b.data) + ' ' + godz(b.start_min) + '–' + godz(b.koniec_min) + '?\n\nTen czas wróci do grafiku kursantów.')) return;
    P.api('/api/admin/kalendarz', { akcja: 'blokada-usun', id: b.id })
      .then(function () {
        P.komunikat('Blokada usunięta — czas wrócił do grafiku.');
        zamknijSzczegoly();
        if ($('dlg-nowa').open) $('dlg-nowa').close();
        return P.poZmianie();
      })
      .catch(function (err) {
        P.komunikat(err.message, true);
      });
  }

  /* ------------------------------------------------------------------ */
  /* Okno "Nowa rezerwacja" / "Blokada kalendarza"                       */
  /* ------------------------------------------------------------------ */

  var dlgNowa = $('dlg-nowa');

  function nowa(opcje) {
    opcje = opcje || {};
    var b = opcje.blokada || null;
    K.edytowanaBlokada = b;
    F.reset();
    P.pokazBlad('blad-nowa', '');
    schowajPodpowiedzi();
    F.elements.miejsce.innerHTML = P.opcjeMiejsc('', true);

    var data = b ? b.data : opcje.data || (K.widok === 'dzien' && K.data) || dzis();
    var start = b ? b.start_min : opcje.start != null ? opcje.start : 600;
    F.elements.data.value = data;
    F.elements.start.value = godz(start);
    if (b) {
      F.elements.koniec.value = godz(b.koniec_min % 1440);
      F.elements.opis.value = b.opis || '';
    }
    // Przy zmianie istniejącej blokady nie ma przełączania na "Rezerwacja"
    F.querySelector('.dlg-zakladki').hidden = Boolean(b);
    ustawTryb(opcje.tryb || 'rezerwacja');
    if (!b) przeliczKoniec();
    odswiezCene();
    odswiezPrzeszlosc();
    if (!dlgNowa.open) dlgNowa.showModal();
    (K.tryb === 'rezerwacja' ? F.elements.imie : F.elements.opis).focus();
  }

  /** Zakładka okna: 'rezerwacja' albo 'blokada' (K.edytowanaBlokada = zmiana istniejącej). */
  function ustawTryb(tryb) {
    K.tryb = tryb;
    if (tryb === 'rezerwacja') K.edytowanaBlokada = null;
    F.querySelector('.dlg-kolumny').classList.toggle('is-jedna', tryb === 'blokada');
    document.querySelectorAll('.dlg-zakladka').forEach(function (z) {
      var akt = z.dataset.tryb === tryb;
      z.classList.toggle('is-active', akt);
      z.setAttribute('aria-selected', String(akt));
    });
    F.querySelectorAll('[data-tryb-tylko]').forEach(function (el) {
      el.hidden = el.dataset.trybTylko !== tryb;
    });
    var edycja = tryb === 'blokada' && K.edytowanaBlokada;
    $('dlg-nowa-tytul').textContent =
      tryb === 'rezerwacja' ? 'Nowa rezerwacja' : edycja ? 'Zmień blokadę' : 'Nowa blokada kalendarza';
    $('nowa-zapisz').textContent = tryb === 'rezerwacja' ? 'Dodaj rezerwację' : edycja ? 'Zapisz blokadę' : 'Zablokuj';
    $('nowa-kiedy').textContent = tryb === 'rezerwacja' ? 'Kiedy ma się odbyć spotkanie?' : 'Który czas zablokować?';
    $('nowa-stopka-blokady').hidden = !edycja;
    if (tryb === 'blokada' && !K.edytowanaBlokada && P.minuty(F.elements.koniec.value) <= P.minuty(F.elements.start.value)) {
      F.elements.koniec.value = godz(Math.min(P.minuty(F.elements.start.value) + 60, 1435));
    }
    odswiezPolaCzasu();
  }

  function dlugoscUslugi() {
    return Number(F.elements.usluga.value) || 120;
  }

  /** Koniec = start + usługa. Jazda kończąca się o północy pokazuje "00:00". */
  function przeliczKoniec() {
    if (K.tryb !== 'rezerwacja' || F.elements.koniec_recznie.checked) return;
    var start = P.minuty(F.elements.start.value);
    if (isNaN(start)) return;
    var koniec = start + dlugoscUslugi();
    F.elements.koniec.value = koniec > 1440 ? '' : godz(koniec % 1440);
    P.pokazBlad('blad-nowa', koniec > 1440 ? 'Ta jazda skończyłaby się po północy — wybierz wcześniejszą godzinę.' : '');
  }

  function odswiezPolaCzasu() {
    var przeszly = F.elements.data.value && F.elements.data.value < dzis();
    if (przeszly) F.elements.caly_dzien.checked = false; // przeszłego dnia nie da się zamknąć
    F.elements.caly_dzien.disabled = Boolean(K.edytowanaBlokada) || przeszly;
    var calyDzien = K.tryb === 'blokada' && F.elements.caly_dzien.checked;
    F.elements.start.disabled = calyDzien;
    F.elements.koniec.disabled = calyDzien;
    F.elements.opis.disabled = calyDzien; // zamknięty dzień nie ma opisu
    F.elements.koniec.readOnly = K.tryb === 'rezerwacja' && !F.elements.koniec_recznie.checked;
  }

  function odswiezCene() {
    var start = P.minuty(F.elements.start.value);
    var koniec = P.minuty(F.elements.koniec.value);
    var min = koniec - start;
    var stawka = 160 + Number(F.elements.doplata_h.value || 0);
    $('nowa-cena').textContent = min > 0
      ? 'Cena: ' + dlugoscTekst(min) + ' × ' + stawka + ' zł/h = ' + Math.round((min / 60) * stawka) + ' zł'
      : '';
  }

  function odswiezPrzeszlosc() {
    $('nowa-przeszlosc').hidden = !(F.elements.data.value && F.elements.data.value < dzis());
  }

  document.querySelectorAll('.dlg-zakladka').forEach(function (z) {
    z.addEventListener('click', function () {
      if (z.dataset.tryb === K.tryb) return;
      ustawTryb(z.dataset.tryb);
      if (K.tryb === 'rezerwacja') przeliczKoniec();
      odswiezCene();
      P.pokazBlad('blad-nowa', '');
    });
  });

  function poZmianiePola(e) {
    var n = e.target.name;
    if (n === 'koniec_recznie' || n === 'caly_dzien' || n === 'data') odswiezPolaCzasu();
    // Odznaczenie "koniec ręcznie" wraca do końca wyliczonego z usługi
    if (n === 'start' || n === 'usluga' || n === 'koniec_recznie') przeliczKoniec();
    if (n === 'data') odswiezPrzeszlosc();
    odswiezCene();
  }
  F.addEventListener('input', poZmianiePola);
  F.addEventListener('change', poZmianiePola);

  document.querySelectorAll('dialog [data-zamknij]').forEach(function (b) {
    b.addEventListener('click', function () {
      b.closest('dialog').close();
    });
  });

  $('blokada-usun').addEventListener('click', function () {
    if (K.edytowanaBlokada) usunBlokade(K.edytowanaBlokada);
  });

  F.addEventListener('submit', function (e) {
    e.preventDefault();
    P.pokazBlad('blad-nowa', '');
    var data = F.elements.data.value;
    var start = P.minuty(F.elements.start.value);
    var koniec = P.minuty(F.elements.koniec.value);
    if (koniec === 0 && start > 0) koniec = 24 * 60; // "do 00:00" = do północy
    if (!data) return P.pokazBlad('blad-nowa', 'Wybierz dzień.');

    var calyDzien = K.tryb === 'blokada' && F.elements.caly_dzien.checked;
    if (!calyDzien && (isNaN(start) || isNaN(koniec) || koniec <= start)) {
      return P.pokazBlad('blad-nowa', 'Godzina końca musi być po godzinie początku.');
    }

    var zadanie;
    if (K.tryb === 'blokada') {
      if (calyDzien) {
        zadanie = P.api('/api/admin/grafik', { akcja: 'dzien', data: data, zamkniety: true }).then(function () {
          return 'Dzień zamknięty — tego dnia nic nie da się zarezerwować.';
        });
      } else {
        var dane = { data: data, start: start, koniec: koniec, opis: F.elements.opis.value };
        if (K.edytowanaBlokada) {
          dane.akcja = 'blokada-zmien';
          dane.id = K.edytowanaBlokada.id;
        } else {
          dane.akcja = 'blokada';
        }
        zadanie = P.api('/api/admin/kalendarz', dane).then(function () {
          return 'Zablokowano ' + P.krotko(data) + ' ' + godz(start) + '–' + godz(koniec % 1440 || 0) + ' — kursanci nie zobaczą tego czasu.';
        });
      }
    } else {
      if (!F.elements.imie.value.trim() || !F.elements.telefon.value.trim()) {
        return P.pokazBlad('blad-nowa', 'Podaj imię i nazwisko oraz telefon kursanta.');
      }
      zadanie = P.api('/api/admin/rezerwacje', {
        akcja: 'dodaj',
        data: data,
        start: start,
        koniec: koniec,
        miejsce: F.elements.miejsce.value,
        doplata_h: Number(F.elements.doplata_h.value),
        imie: F.elements.imie.value,
        telefon: F.elements.telefon.value,
        email: F.elements.email.value,
        notatka: F.elements.notatka.value,
        status: F.elements.status.value,
        jezyk: F.elements.jezyk.value,
        powiadom: !F.elements.bez_powiadomien.checked,
      }).then(function (w) {
        return 'Rezerwacja dodana.' +
          (w.email_wyslany === true ? ' Kursant dostał e-mail.' : w.email_wyslany === false ? ' Uwaga: e-maila nie udało się wysłać.' : '');
      });
    }

    var przycisk = $('nowa-zapisz');
    przycisk.disabled = true;
    zadanie
      .then(function (tekst) {
        dlgNowa.close();
        P.komunikat(tekst);
        // Pokaż dzień, na który właśnie coś dodano
        if (!K.zakres || data < K.zakres.od || data > K.zakres.do) K.data = data;
        K.nieaktualne = true;
        return P.poZmianie();
      })
      .catch(function (err) {
        P.pokazBlad('blad-nowa', err.message);
      })
      .then(function () {
        przycisk.disabled = false;
      });
  });

  /* ---- Podpowiedzi kursantów ("Z kim odbędzie się spotkanie?") --------- */

  var lista = $('kursant-lista');
  var zegarSzukania = null;
  var wyniki = [];

  function schowajPodpowiedzi() {
    lista.hidden = true;
    lista.innerHTML = '';
    F.elements.imie.setAttribute('aria-expanded', 'false');
  }

  F.elements.imie.addEventListener('input', function () {
    clearTimeout(zegarSzukania);
    var q = F.elements.imie.value.trim();
    if (q.length < 2) return schowajPodpowiedzi();
    zegarSzukania = setTimeout(function () {
      P.api('/api/admin/kursanci?q=' + encodeURIComponent(q))
        .then(function (d) {
          wyniki = d.kursanci || [];
          if (!wyniki.length || F.elements.imie.value.trim() !== q) return schowajPodpowiedzi();
          lista.innerHTML = wyniki
            .map(function (k, i) {
              return (
                '<li role="option"><button type="button" data-i="' + i + '">' + esc(k.imie) +
                '<small>' + esc(k.telefon) + (k.email ? ' · ' + esc(k.email) : '') + ' · jazd: ' + k.liczba +
                ', ostatnio ' + esc(P.krotko(k.ostatnia)) + '</small></button></li>'
              );
            })
            .join('');
          lista.hidden = false;
          F.elements.imie.setAttribute('aria-expanded', 'true');
        })
        .catch(schowajPodpowiedzi);
    }, 250);
  });

  F.elements.imie.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' && !lista.hidden) {
      e.preventDefault();
      var pierwszy = lista.querySelector('button');
      if (pierwszy) pierwszy.focus();
    } else if (e.key === 'Escape' && !lista.hidden) {
      e.preventDefault(); // nie zamykaj całego okna
      schowajPodpowiedzi();
    }
  });

  lista.addEventListener('keydown', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var li = b.parentElement;
    if (e.key === 'ArrowDown' && li.nextElementSibling) {
      e.preventDefault();
      li.nextElementSibling.querySelector('button').focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (li.previousElementSibling ? li.previousElementSibling.querySelector('button') : F.elements.imie).focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      schowajPodpowiedzi();
      F.elements.imie.focus();
    }
  });

  lista.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-i]');
    if (!b) return;
    var k = wyniki[Number(b.dataset.i)];
    F.elements.imie.value = k.imie;
    F.elements.telefon.value = k.telefon;
    F.elements.email.value = k.email || '';
    F.elements.jezyk.value = k.jezyk === 'en' ? 'en' : 'pl';
    schowajPodpowiedzi();
    F.elements.miejsce.focus();
  });

  document.addEventListener('click', function (e) {
    if (!lista.hidden && !e.target.closest('.kursant-pole')) schowajPodpowiedzi();
  });

  /* ------------------------------------------------------------------ */
  /* Przeciąganie jazd i blokad                                          */
  /* ------------------------------------------------------------------ */

  var ciag = null;

  obszar.addEventListener('pointerdown', function (e) {
    if (K.widok === 'miesiac' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    var el = e.target.closest('.kal-wyd[data-typ]');
    if (!el) return;
    var typ = el.dataset.typ;
    var x = typ === 'rez' ? rezerwacja(Number(el.dataset.id)) : blokada(Number(el.dataset.id));
    if (!x) return;
    ciag = {
      el: el,
      typ: typ,
      x: x,
      dl: x.koniec_min - x.start_min,
      sx: e.clientX,
      sy: e.clientY,
      chwyt: (e.clientY - el.getBoundingClientRect().top) / PX,
      dotyk: e.pointerType !== 'mouse',
      aktywne: false,
      cel: null,
      duch: null,
      zegar: null,
    };
    // Na telefonie przeciąganie zaczyna się po przytrzymaniu — zwykłe
    // przesunięcie palcem dalej przewija kalendarz.
    if (ciag.dotyk) {
      ciag.zegar = setTimeout(function () {
        if (ciag) aktywuj();
      }, 380);
    }
    document.addEventListener('pointermove', ruch, { passive: false });
    document.addEventListener('pointerup', puszczenie);
    document.addEventListener('pointercancel', przerwij);
  });

  function aktywuj() {
    ciag.aktywne = true;
    ciag.el.classList.add('is-zrodlo');
    document.body.classList.add('kal-przeciaganie');
    if (ciag.dotyk && navigator.vibrate) navigator.vibrate(15);
  }

  function kolumnaPod(x) {
    var kolumny = obszar.querySelectorAll('.kal-kolumna');
    for (var i = 0; i < kolumny.length; i++) {
      var r = kolumny[i].getBoundingClientRect();
      if (x >= r.left && x < r.right) return kolumny[i];
    }
    return null;
  }

  /** Widoczna część kalendarza (bez przyklejonych nagłówków), przycięta do ekranu. */
  function widocznyObszar() {
    var r = obszar.getBoundingClientRect();
    var glowa = obszar.querySelector('.kal-cd');
    var os = obszar.querySelector('.kal-os');
    var wys = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    return {
      gora: Math.max(r.top, 0) + (glowa ? glowa.getBoundingClientRect().bottom - r.top : 0),
      dol: Math.min(r.bottom, wys),
      lewo: r.left + (os ? os.getBoundingClientRect().width : 0),
      prawo: Math.min(r.right, window.innerWidth),
    };
  }

  function schowajDucha() {
    if (ciag && ciag.duch && ciag.duch.parentElement) ciag.duch.parentElement.removeChild(ciag.duch);
  }

  function ruch(e) {
    if (!ciag) return;
    var odl = Math.hypot(e.clientX - ciag.sx, e.clientY - ciag.sy);
    if (!ciag.aktywne) {
      if (ciag.dotyk) {
        if (odl > 8) przerwij(); // to było przewijanie
        return;
      }
      if (odl < 5) return;
      aktywuj();
    }
    e.preventDefault();

    // Poza widoczną siatką = brak celu; puszczenie tam anuluje przenoszenie
    var w = widocznyObszar();
    var kol = kolumnaPod(e.clientX);
    if (!kol || e.clientY < w.gora - 30 || e.clientY > w.dol + 30 || e.clientX < w.lewo || e.clientX > w.prawo) {
      ciag.cel = null;
      schowajDucha();
      return;
    }
    var r = kol.getBoundingClientRect();
    var start = Math.round((K.os.od + (e.clientY - r.top) / PX - ciag.chwyt) / KROK) * KROK;
    start = Math.max(K.os.od, Math.min(start, K.os.do - ciag.dl, 24 * 60 - ciag.dl));
    ciag.cel = { data: kol.dataset.data, start: start };

    if (!ciag.duch) {
      ciag.duch = document.createElement('div');
      ciag.duch.className = 'kal-duch' + (ciag.typ === 'blok' ? ' is-blokada' : '');
      ciag.duch.innerHTML = '<span class="kal-duch-etykieta"></span>';
    }
    if (ciag.duch.parentElement !== kol) kol.appendChild(ciag.duch);
    ciag.duch.style.top = (start - K.os.od) * PX + 'px';
    ciag.duch.style.height = ciag.dl * PX + 'px';
    ciag.duch.style.left = '2px';
    ciag.duch.style.right = '3px';
    ciag.duch.firstChild.textContent = P.krotko(ciag.cel.data) + ' · ' + godz(start) + '–' + godz((start + ciag.dl) % 1440 || 0);

    // Przewijanie, gdy przeciągamy przy krawędzi widocznej części kalendarza
    // (w pionie, a w tygodniu na telefonie także w poziomie — do innych dni)
    if (e.clientY < w.gora + 36) obszar.scrollTop -= 14;
    else if (e.clientY > w.dol - 36) obszar.scrollTop += 14;
    if (e.clientX < w.lewo + 30) obszar.scrollLeft -= 14;
    else if (e.clientX > w.prawo - 30) obszar.scrollLeft += 14;
  }

  // Escape przerywa przeciąganie
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && ciag && ciag.aktywne) przerwij();
  });

  function sprzatnij() {
    document.removeEventListener('pointermove', ruch);
    document.removeEventListener('pointerup', puszczenie);
    document.removeEventListener('pointercancel', przerwij);
    document.body.classList.remove('kal-przeciaganie');
    if (!ciag) return null;
    clearTimeout(ciag.zegar);
    ciag.el.classList.remove('is-zrodlo');
    if (ciag.duch && ciag.duch.parentElement) ciag.duch.parentElement.removeChild(ciag.duch);
    var c = ciag;
    ciag = null;
    return c;
  }

  function przerwij() {
    sprzatnij();
  }

  function puszczenie() {
    var c = sprzatnij();
    if (!c || !c.aktywne) return;
    // Kliknięcie, które przeglądarka wyśle zaraz po puszczeniu, nie otwiera okna
    K.poPrzeciaganiu = true;
    setTimeout(function () {
      K.poPrzeciaganiu = false;
    }, 0);
    if (!c.cel || (c.cel.data === c.x.data && c.cel.start === c.x.start_min)) return;
    przenies(c.typ, c.x, c.cel, c.dl);
  }

  // iOS/Android: gdy przeciąganie trwa, palec nie przewija strony
  obszar.addEventListener('touchmove', function (e) {
    if (ciag && ciag.aktywne) e.preventDefault();
  }, { passive: false });
  obszar.addEventListener('contextmenu', function (e) {
    if (e.target.closest('.kal-wyd')) e.preventDefault();
  });

  function przenies(typ, x, cel, dl) {
    var z = P.krotko(x.data) + ' ' + godz(x.start_min) + '–' + godz(x.koniec_min);
    var na = P.krotko(cel.data) + ' ' + godz(cel.start) + '–' + godz((cel.start + dl) % 1440 || 0);
    var pytanie = typ === 'rez'
      ? 'Przenieść jazdę?\n' + x.imie + '\n\nz: ' + z + '\nna: ' + na +
        '\n\nKursant nie dostanie automatycznej wiadomości o zmianie — daj mu znać.'
      : 'Przenieść blokadę' + (x.opis ? ' „' + x.opis + '”' : '') + '?\n\nz: ' + z + '\nna: ' + na;
    if (!window.confirm(pytanie)) return;

    // Od razu pokazujemy w nowym miejscu; serwer potwierdzi albo cofniemy
    var stary = { data: x.data, start_min: x.start_min, koniec_min: x.koniec_min };
    x.data = cel.data;
    x.start_min = cel.start;
    x.koniec_min = cel.start + dl;
    rysuj();

    var zadanie = typ === 'rez'
      ? P.api('/api/admin/rezerwacje', { akcja: 'edytuj', id: x.id, data: cel.data, start: cel.start })
      : P.api('/api/admin/kalendarz', { akcja: 'blokada-zmien', id: x.id, data: cel.data, start: cel.start, koniec: cel.start + dl });
    zadanie
      .then(function () {
        P.komunikat((typ === 'rez' ? 'Jazda przeniesiona' : 'Blokada przeniesiona') + ' na ' + na + '.');
      })
      .catch(function (err) {
        x.data = stary.data;
        x.start_min = stary.start_min;
        x.koniec_min = stary.koniec_min;
        rysuj();
        P.komunikat(err.message, true);
      })
      .then(function () {
        return P.poZmianie();
      });
  }

  /* ------------------------------------------------------------------ */
  /* Pasek narzędzi, start                                               */
  /* ------------------------------------------------------------------ */

  function zapiszWidok() {
    try {
      localStorage.setItem('kal-widok', K.widok);
    } catch (e) {
      /* tryb prywatny — trudno, widok się nie zapamięta */
    }
  }

  function przesun(kierunek) {
    if (K.widok === 'dzien') K.data = dodaj(K.data, kierunek);
    else if (K.widok === 'tydzien') K.data = dodaj(K.data, 7 * kierunek);
    else {
      var c = K.data.split('-');
      K.data = zMs(Date.UTC(+c[0], +c[1] - 1 + kierunek, 1));
    }
    wczytaj();
  }

  $('kal-wstecz').addEventListener('click', function () {
    przesun(-1);
  });
  $('kal-dalej').addEventListener('click', function () {
    przesun(1);
  });
  $('kal-dzis').addEventListener('click', function () {
    K.data = dzis();
    K.przewinieto = false;
    wczytaj();
  });
  $('kal-odswiez').addEventListener('click', function () {
    wczytaj().then(function (ok) {
      if (ok) P.komunikat('Odświeżono.');
    });
  });
  $('kal-dodaj').addEventListener('click', function () {
    nowa({});
  });
  document.querySelectorAll('.kal-widok').forEach(function (b) {
    b.addEventListener('click', function () {
      if (K.widok === b.dataset.widok) return;
      K.widok = b.dataset.widok;
      K.przewinieto = false;
      zapiszWidok();
      wczytaj();
    });
  });

  // Zmiana gdziekolwiek w panelu (lista, okno szczegółów) → świeży kalendarz
  document.addEventListener('panel:zmiana', function () {
    K.nieaktualne = true;
    if (!$('panel-kalendarz').hidden) wczytaj();
  });

  // Linia "teraz" przesuwa się co minutę
  setInterval(function () {
    if ($('panel-kalendarz').hidden || K.widok === 'miesiac' || !K.dane || K.dane.dzisiaj !== dzisPL()) return;
    var teraz = terazPL();
    obszar.querySelectorAll('.kal-teraz').forEach(function (l) {
      l.style.top = (teraz - K.os.od) * PX + 'px';
    });
  }, 60000);

  try {
    K.widok = localStorage.getItem('kal-widok');
  } catch (e) {
    K.widok = null;
  }
  if (WIDOKI.indexOf(K.widok) === -1) K.widok = window.innerWidth < 720 ? 'dzien' : 'tydzien';
  K.data = dzisPL();

  // Obrót telefonu / zmiana okna — wysokość i szerokość kolumn
  var zegarRozmiaru = null;
  window.addEventListener('resize', function () {
    clearTimeout(zegarRozmiaru);
    zegarRozmiaru = setTimeout(function () {
      if (K.dane && !$('panel-kalendarz').hidden) rysuj();
    }, 150);
  });

  window.Kalendarz = {
    /**
     * Zakładka Kalendarz: od razu to, co mamy, i zawsze świeże dane z serwera —
     * zmiany z zakładek Grafik / Ustawienia (godziny pracy, zamknięte dni)
     * też muszą tu dotrzeć.
     */
    pokaz: function () {
      if (K.dane) rysuj();
      wczytaj();
    },
    odswiez: wczytaj,
    nowa: nowa,
    rezerwacja: rezerwacja,
    /** Wylogowanie: żadne dane kursantów nie zostają w stronie. */
    wyczysc: function () {
      K.dane = null;
      K.zakres = null;
      K.zaladowany = null;
      K.nieaktualne = true;
      K.otwarte = null;
      K.nrWczytania++;
      obszar.innerHTML = '';
      $('dlg-szczegoly-tresc').innerHTML = '';
      F.reset();
      schowajPodpowiedzi();
    },
  };

  // Gdy panel otworzył się na zakładce Kalendarz, zanim ten plik się wczytał
  if (!$('widok-panel').hidden && !$('panel-kalendarz').hidden) window.Kalendarz.pokaz();
})();
