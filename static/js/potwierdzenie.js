/* Strona potwierdzenia — pokazuje kod rezerwacji i jej status po powrocie
   z płatności. Status bierzemy z backendu, a nie z adresu URL: powrót na tę
   stronę sam w sobie nie dowodzi, że płatność się powiodła. */

(function () {
  'use strict';

  var TELEFON = '+48690360164';
  var TELEFON_ZAPIS = '690 360 164';

  var el = document.getElementById('potwierdzenie-tresc');
  if (!el) return;

  var kod = new URLSearchParams(window.location.search).get('kod');

  var OPISY = {
    oplacone: {
      tytul: 'Rezerwacja potwierdzona',
      klasa: 'potwierdzenie-ok',
      tekst: 'Zadatek zaksięgowany. Termin jest zarezerwowany na Twoje nazwisko.',
    },
    oczekuje: {
      tytul: 'Czekamy na potwierdzenie płatności',
      klasa: 'potwierdzenie-czeka',
      tekst:
        'Płatność jeszcze nie dotarła. Jeśli właśnie ją zrobiłeś, odśwież tę stronę za chwilę — ' +
        'potwierdzenie z banku potrafi przyjść z niewielkim opóźnieniem.',
    },
    wygasle: {
      tytul: 'Rezerwacja wygasła',
      klasa: 'potwierdzenie-blad',
      tekst:
        'Czas na opłacenie zadatku minął i termin wrócił do puli. Wybierz go ponownie w grafiku ' +
        'albo zadzwoń, a umówimy się telefonicznie.',
    },
    anulowane: {
      tytul: 'Rezerwacja anulowana',
      klasa: 'potwierdzenie-blad',
      tekst: 'Ta rezerwacja została anulowana. Zadzwoń, jeśli to pomyłka.',
    },
  };

  function dataTekst(data) {
    var cz = data.split('-');
    return cz[2] + '.' + cz[1] + '.' + cz[0];
  }

  function godz(g) {
    return String(g).padStart(2, '0') + ':00';
  }

  function pokazBlad(tekst) {
    el.innerHTML =
      '<div class="potwierdzenie-karta potwierdzenie-blad">' +
      '<h2>Nie udało się sprawdzić rezerwacji</h2>' +
      '<p>' + tekst + '</p>' +
      '<p><a class="btn btn-primary" href="tel:' + TELEFON + '">Zadzwoń: ' + TELEFON_ZAPIS + '</a></p>' +
      '</div>';
  }

  if (!kod) {
    pokazBlad('Brak kodu rezerwacji w adresie strony.');
    return;
  }

  fetch('/api/status/' + encodeURIComponent(kod), { headers: { Accept: 'application/json' } })
    .then(function (r) {
      return r.json().then(function (body) {
        return { ok: r.ok, body: body };
      });
    })
    .then(function (w) {
      if (!w.ok) {
        pokazBlad(w.body.blad || 'Spróbuj ponownie za chwilę.');
        return;
      }

      var r = w.body;
      var opis = OPISY[r.status] || OPISY.oczekuje;

      el.innerHTML =
        '<div class="potwierdzenie-karta ' + opis.klasa + '">' +
        '<h2>' + opis.tytul + '</h2>' +
        '<p class="potwierdzenie-kod">' + r.kod_rezerwacji + '</p>' +
        '<dl class="potwierdzenie-dane">' +
        '<dt>Termin</dt><dd>' + dataTekst(r.data) + ', ' + godz(r.godzina_start) + '–' + godz(r.godzina_koniec) + ' (' + r.dlugosc + ' h)</dd>' +
        '<dt>Zadatek</dt><dd>' + r.kwota_zadatku + ' zł</dd>' +
        '<dt>Do zapłaty na miejscu</dt><dd>' + r.do_zaplaty_na_miejscu + ' zł gotówką</dd>' +
        '</dl>' +
        '<p>' + opis.tekst + '</p>' +
        '<p class="potwierdzenie-drobne">Zapisz kod rezerwacji — przyda się, gdybyśmy musieli coś ustalić telefonicznie.</p>' +
        '</div>';
    })
    .catch(function () {
      pokazBlad('Brak połączenia z serwerem.');
    });
})();
