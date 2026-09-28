/* Płynący pasek — opinie i galeria.

   Znaczniki w HTML-u:
     [data-pasek-auto]   — kontener
     [data-pasek-tor]    — przewijany pasek z kartami
     [data-pasek-prev]   — strzałka w lewo (widać ją tylko pod myszką)
     [data-pasek-next]   — strzałka w prawo

   Jak to działa:
   - Pasek sam powoli przewija się w prawo; na końcu chwilę stoi,
     znika na moment i zaczyna od początku.
   - Najazd myszką zatrzymuje ruch — wtedy działa jak zwykły slajder:
     strzałki, przeciąganie myszką, kółko/touchpad w bok.
   - Na telefonie (i na ekranie dotykowym komputera) dotknięcie zatrzymuje
     ruch i pasek przesuwa się palcem; kilka sekund po puszczeniu rusza dalej.
   - Ruch stoi też, gdy pasek jest poza ekranem, karta przeglądarki jest
     w tle albo ktoś ma w systemie włączone "ogranicz animacje".

   Samo przewijanie to zwykłe overflow-x z CSS — bez tego skryptu pasek
   nadal da się przesuwać palcem. */

(function () {
  'use strict';

  var SZYBKOSC = 35; // piksele na sekundę
  var PAUZA_PO_DOTYKU = 4000; // ms od puszczenia palca do ponownego ruchu
  var POSTOJ_NA_KONCU = 1500; // ms, zanim pasek wróci na początek
  var ZANIKANIE = 350; // ms — musi się zgadzać z transition w style.css

  var ograniczRuch = window.matchMedia('(prefers-reduced-motion: reduce)');

  function uruchom(pasek) {
    var tor = pasek.querySelector('[data-pasek-tor]');
    var prev = pasek.querySelector('[data-pasek-prev]');
    var next = pasek.querySelector('[data-pasek-next]');
    if (!tor) return;

    var stan = { mysz: false, dotyk: false, fokus: false, przeciaganie: false, widoczny: false, naKoncu: false };
    var poz = 0; // pozycja z ułamkami — scrollLeft bywa zaokrąglany do pełnych pikseli
    var klatkaId = null;
    var poprzedniCzas = null;
    var timerDotyku = null;

    function nadmiar() {
      return tor.scrollWidth - tor.clientWidth;
    }

    function stoi() {
      return (
        ograniczRuch.matches || document.hidden || !stan.widoczny ||
        stan.mysz || stan.dotyk || stan.fokus || stan.przeciaganie || stan.naKoncu || nadmiar() <= 1
      );
    }

    function klatka(czas) {
      klatkaId = requestAnimationFrame(klatka);
      // Ktoś przewinął pasek sam (palcem, strzałką, filtrem opinii) — jedziemy dalej od tego miejsca
      if (Math.abs(tor.scrollLeft - poz) > 2) poz = tor.scrollLeft;
      var dt = poprzedniCzas === null ? 0 : Math.min(czas - poprzedniCzas, 50) / 1000;
      poprzedniCzas = czas;
      poz += SZYBKOSC * dt;
      if (poz >= nadmiar() - 1) {
        tor.scrollLeft = nadmiar();
        wrocNaPoczatek();
        return;
      }
      tor.scrollLeft = poz;
    }

    /** Start albo stop animacji — wołane po każdej zmianie stanu. */
    function odswiez() {
      if (stoi()) {
        if (klatkaId !== null) cancelAnimationFrame(klatkaId);
        klatkaId = null;
        tor.classList.remove('is-plynie');
      } else if (klatkaId === null) {
        poz = tor.scrollLeft;
        poprzedniCzas = null;
        tor.classList.add('is-plynie');
        klatkaId = requestAnimationFrame(klatka);
      }
      aktualizujStrzalki();
    }

    function wrocNaPoczatek() {
      stan.naKoncu = true;
      odswiez();
      setTimeout(function () {
        // W międzyczasie ktoś złapał pasek — nie wyrywamy mu go spod ręki
        if (stan.mysz || stan.dotyk || stan.fokus || stan.przeciaganie) {
          stan.naKoncu = false;
          odswiez();
          return;
        }
        tor.classList.add('is-zanika');
        setTimeout(function () {
          tor.scrollLeft = 0;
          poz = 0;
          tor.classList.remove('is-zanika');
          stan.naKoncu = false;
          odswiez();
        }, ZANIKANIE);
      }, POSTOJ_NA_KONCU);
    }

    /* ---- Strzałki: o jedną kartę; na końcu przeskakują na początek ---- */

    function krok() {
      var karta = null;
      for (var i = 0; i < tor.children.length; i++) {
        if (!tor.children[i].hidden) {
          karta = tor.children[i];
          break;
        }
      }
      var szer = karta ? karta.getBoundingClientRect().width : 0;
      var odstep = parseFloat(getComputedStyle(tor).columnGap) || 0;
      return szer > 0 ? szer + odstep : tor.clientWidth * 0.8;
    }

    function przesun(kierunek) {
      var max = nadmiar();
      var cel;
      if (kierunek > 0 && tor.scrollLeft >= max - 2) cel = 0;
      else if (kierunek < 0 && tor.scrollLeft <= 2) cel = max;
      else cel = tor.scrollLeft + kierunek * krok();
      tor.scrollTo({ left: cel, behavior: ograniczRuch.matches ? 'auto' : 'smooth' });
    }

    function aktualizujStrzalki() {
      var jest = nadmiar() > 1;
      if (prev) prev.hidden = !jest;
      if (next) next.hidden = !jest;
    }

    if (prev) prev.addEventListener('click', function () { przesun(-1); });
    if (next) next.addEventListener('click', function () { przesun(1); });

    /* ---- Mysz: najazd zatrzymuje, przeciąganie przesuwa ---- */

    pasek.addEventListener('pointerenter', function (e) {
      if (e.pointerType !== 'mouse') return;
      stan.mysz = true;
      odswiez();
    });
    pasek.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse') return;
      stan.mysz = false;
      odswiez();
    });

    var przeciag = null;
    var blokujKlik = false;

    tor.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      przeciag = { x: e.clientX, start: tor.scrollLeft, ruszyl: false };
    });
    window.addEventListener('pointermove', function (e) {
      if (!przeciag) return;
      var dx = e.clientX - przeciag.x;
      if (!przeciag.ruszyl && Math.abs(dx) > 5) {
        przeciag.ruszyl = true;
        stan.przeciaganie = true;
        tor.classList.add('is-przeciagany');
        odswiez();
      }
      if (przeciag.ruszyl) tor.scrollLeft = przeciag.start - dx;
    });
    window.addEventListener('pointerup', function () {
      if (!przeciag) return;
      // Po przeciągnięciu puszczenie przycisku nie może otworzyć podglądu zdjęcia
      if (przeciag.ruszyl) {
        blokujKlik = true;
        setTimeout(function () { blokujKlik = false; }, 0);
      }
      przeciag = null;
      stan.przeciaganie = false;
      tor.classList.remove('is-przeciagany');
      odswiez();
    });
    tor.addEventListener('click', function (e) {
      if (!blokujKlik) return;
      e.preventDefault();
      e.stopPropagation();
      blokujKlik = false;
    }, true);
    // Bez tego przeglądarka "chwyta" samo zdjęcie zamiast przewijać pasek
    tor.addEventListener('dragstart', function (e) {
      e.preventDefault();
    });

    /* ---- Dotyk: palec zatrzymuje, po chwili ruch wraca ---- */

    tor.addEventListener('touchstart', function () {
      clearTimeout(timerDotyku);
      stan.dotyk = true;
      odswiez();
    }, { passive: true });
    tor.addEventListener('touchend', function () {
      clearTimeout(timerDotyku);
      timerDotyku = setTimeout(function () {
        stan.dotyk = false;
        odswiez();
      }, PAUZA_PO_DOTYKU);
    }, { passive: true });

    /* ---- Klawiatura: fokus na karcie zatrzymuje (żeby dało się ją kliknąć) ---- */

    pasek.addEventListener('focusin', function (e) {
      var zKlawiatury = true;
      try {
        zKlawiatury = e.target.matches(':focus-visible');
      } catch (err) { /* stara przeglądarka bez :focus-visible */ }
      if (!zKlawiatury) return;
      stan.fokus = true;
      odswiez();
    });
    pasek.addEventListener('focusout', function (e) {
      if (e.relatedTarget && pasek.contains(e.relatedTarget)) return;
      stan.fokus = false;
      odswiez();
    });

    /* ---- Poza ekranem i w tle nie liczymy klatek ---- */

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (wpisy) {
        stan.widoczny = wpisy[0].isIntersecting;
        odswiez();
      }).observe(tor);
    } else {
      stan.widoczny = true;
    }
    document.addEventListener('visibilitychange', odswiez);
    window.addEventListener('resize', odswiez);
    window.addEventListener('load', odswiez);
    // Filtr opinii zmienia liczbę kart — main.js wysyła wtedy to zdarzenie
    tor.addEventListener('jd:pasek-zmiana', function () {
      tor.scrollLeft = 0;
      poz = 0;
      odswiez();
    });
    if (ograniczRuch.addEventListener) ograniczRuch.addEventListener('change', odswiez);

    odswiez();
  }

  document.querySelectorAll('[data-pasek-auto]').forEach(uruchom);
})();
