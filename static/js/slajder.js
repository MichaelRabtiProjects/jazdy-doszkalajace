/* Slajder kart — jeden komponent, dowolnie wiele instancji na stronie.

   Znaczniki w HTML-u:
     [data-slajder]        — kontener
     [data-slajder-tor]    — przewijany pasek z kartami (dzieci = karty)
     [data-slajder-prev]   — strzałka w lewo
     [data-slajder-next]   — strzałka w prawo

   Samo przewijanie robi CSS (overflow-x + scroll-snap), więc na telefonie
   działa zwykły gest palcem, nawet gdyby ten skrypt się nie wczytał.
   JS dokłada tylko strzałki: przesuwają o jedną kartę, wyłączają się
   na końcach, a znikają zupełnie, gdy wszystkie karty mieszczą się naraz
   (np. 3 miejsca na szerokim ekranie — nie ma czego przewijać). */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function uruchom(slajder) {
    var tor = slajder.querySelector('[data-slajder-tor]');
    var prev = slajder.querySelector('[data-slajder-prev]');
    var next = slajder.querySelector('[data-slajder-next]');
    if (!tor || !prev || !next) return;

    /** Szerokość jednej karty razem z odstępem — o tyle przesuwa strzałka. */
    function krok() {
      var karta = tor.firstElementChild;
      if (!karta) return tor.clientWidth;
      var odstep = parseFloat(getComputedStyle(tor).columnGap) || 0;
      return karta.getBoundingClientRect().width + odstep;
    }

    function aktualizuj() {
      var nadmiar = tor.scrollWidth - tor.clientWidth;
      var jestCoPrzewijac = nadmiar > 1;
      slajder.classList.toggle('slajder-przewijalny', jestCoPrzewijac);
      prev.hidden = !jestCoPrzewijac;
      next.hidden = !jestCoPrzewijac;
      prev.disabled = tor.scrollLeft <= 1;
      next.disabled = tor.scrollLeft >= nadmiar - 1;
    }

    function przesun(kierunek) {
      tor.scrollBy({ left: kierunek * krok(), behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    prev.addEventListener('click', function () {
      przesun(-1);
    });
    next.addEventListener('click', function () {
      przesun(1);
    });

    // Strzałki z klawiatury, gdy fokus jest na samym pasku
    tor.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        przesun(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        przesun(-1);
      }
    });

    tor.addEventListener('scroll', aktualizuj, { passive: true });
    window.addEventListener('resize', aktualizuj);
    // Po wczytaniu czcionek szerokości kart mogą się minimalnie zmienić
    window.addEventListener('load', aktualizuj);
    aktualizuj();
  }

  document.querySelectorAll('[data-slajder]').forEach(uruchom);
})();
