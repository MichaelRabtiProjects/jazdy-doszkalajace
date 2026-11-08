/* LajtELka – Jazdy doszkalające — cała interaktywność strony.
   Czysty JavaScript, zero bibliotek. */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ======================================================================
     FAQ — dalsze pytania pod przyciskiem „Pokaż więcej pytań”
     ====================================================================== */
  var faqPokaz = document.querySelector('.faq-pokaz');
  var faqWiecej = document.getElementById('faq-wiecej');

  if (faqPokaz && faqWiecej) {
    var pokazFaq = function (otwarte) {
      faqWiecej.classList.toggle('is-otwarte', otwarte);
      faqPokaz.setAttribute('aria-expanded', String(otwarte));
      // Przygaszone pytania nie łapią fokusu z klawiatury.
      faqWiecej.querySelectorAll('summary').forEach(function (s) {
        if (otwarte) s.removeAttribute('tabindex');
        else s.setAttribute('tabindex', '-1');
      });
    };
    pokazFaq(false);
    faqPokaz.addEventListener('click', function () {
      pokazFaq(faqPokaz.getAttribute('aria-expanded') !== 'true');
    });
    // Klik w przygaszone pytanie też rozwija listę.
    faqWiecej.addEventListener('click', function () {
      if (!faqWiecej.classList.contains('is-otwarte')) pokazFaq(true);
    });
  }

  /* ======================================================================
     Menu mobilne
     ====================================================================== */
  var navToggle = document.getElementById('nav-toggle');
  var mainNav = document.getElementById('main-nav');

  if (navToggle && mainNav) {
    navToggle.addEventListener('click', function () {
      var isOpen = mainNav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    // Po kliknięciu w link menu na telefonie chowamy je, żeby nie zasłaniało
    // sekcji, do której użytkownik właśnie przeszedł.
    mainNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        mainNav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ======================================================================
     Pojawianie się sekcji przy przewijaniu
     Każdy element animuje się tylko raz. Przy włączonej w systemie opcji
     ograniczenia animacji pokazujemy wszystko od razu.
     ====================================================================== */
  // Karty cennika i galerii też wjeżdżają — dopisujemy klasę tutaj,
  // żeby nie powtarzać jej w HTML przy każdej z kilkudziesięciu kart.
  document.querySelectorAll('.price-grid > *, .gallery-grid > *').forEach(function (el) {
    el.classList.add('reveal');
  });

  var revealEls = document.querySelectorAll('.reveal');
  var STAGGER_MS = 70;
  var STAGGER_MAX = 5;

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) {
      el.classList.add('is-visible');
    });
  } else {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        // Elementy, które weszły na ekran w tej samej chwili (np. rząd
        // kart), pojawiają się po kolei co 70 ms — stąd licznik partii.
        var wPartii = 0;
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var krok = Math.min(wPartii, STAGGER_MAX);
            entry.target.style.transitionDelay = krok * STAGGER_MS + 'ms';
            wPartii++;
            entry.target.classList.add('is-visible');
            // Po wjeździe zdejmujemy klasy i opóźnienie — inaczej karta
            // zostałaby z przejściem "reveal" i spóźnionym efektem hover.
            var el = entry.target;
            setTimeout(function () {
              el.classList.remove('reveal', 'is-visible');
              el.style.transitionDelay = '';
            }, 400 + krok * STAGGER_MS + 50);
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 }
    );

    revealEls.forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  /* ======================================================================
     Podświetlanie aktywnej pozycji menu podczas przewijania
     ====================================================================== */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.main-nav a'));

  if ('IntersectionObserver' in window && navLinks.length) {
    var sectionObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.getAttribute('id');
          navLinks.forEach(function (link) {
            link.classList.toggle('is-active', link.getAttribute('href') === '#' + id);
          });
        });
      },
      // Sekcja staje się "aktywna", gdy znajdzie się mniej więcej na środku ekranu
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
    );

    navLinks.forEach(function (link) {
      var target = document.querySelector(link.getAttribute('href'));
      if (target) sectionObserver.observe(target);
    });
  }

  /* ======================================================================
     Pływające przyciski kontaktu (Zadzwoń, WhatsApp — .js-fab)
     Pokazują się po przewinięciu poza Hero i chowają nad stopką, żeby
     jej nie zasłaniać. Wspólna logika dla wszystkich .js-fab na stronie.
     ====================================================================== */
  var fabs = Array.prototype.slice.call(document.querySelectorAll('.js-fab'));
  var hero = document.getElementById('hero');
  var footer = document.getElementById('site-footer');

  if (fabs.length && hero && 'IntersectionObserver' in window) {
    var heroVisible = true;
    var footerVisible = false;
    var grafikVisible = false;
    // Gdy karta grafiku sięga prawie do prawej krawędzi ekranu, przyciski
    // wchodziłyby na godziny i na przyklejony pasek z przyciskiem "Dalej" —
    // wtedy je chowamy. Dopiero na szerokim ekranie (kontener 1100 px
    // wyśrodkowany) jest dość miejsca po prawej.
    var waskiEkran = window.matchMedia('(max-width: 1180px)');

    var updateFabs = function () {
      var zaslania = grafikVisible && waskiEkran.matches;
      fabs.forEach(function (fab) {
        fab.classList.toggle('is-visible', !heroVisible && !footerVisible && !zaslania);
      });
    };

    var grafikWidget = document.getElementById('grafik-widget');
    if (grafikWidget) {
      new IntersectionObserver(
        function (entries) {
          grafikVisible = entries[0].isIntersecting;
          updateFabs();
        },
        { threshold: 0 }
      ).observe(grafikWidget);
    }
    if (waskiEkran.addEventListener) {
      waskiEkran.addEventListener('change', updateFabs);
    }

    new IntersectionObserver(
      function (entries) {
        heroVisible = entries[0].isIntersecting;
        updateFabs();
      },
      { threshold: 0.15 }
    ).observe(hero);

    if (footer) {
      new IntersectionObserver(
        function (entries) {
          footerVisible = entries[0].isIntersecting;
          updateFabs();
        },
        { threshold: 0.05 }
      ).observe(footer);
    }
  } else {
    fabs.forEach(function (fab) {
      fab.classList.add('is-visible');
    });
  }

  /* ======================================================================
     Opinie — filtry (Wszystkie / Google / Messenger)
     ====================================================================== */
  var reviewsGrid = document.getElementById('reviews-grid');
  var filterBtns = Array.prototype.slice.call(document.querySelectorAll('.filter-btn'));
  var reviewItems = reviewsGrid
    ? Array.prototype.slice.call(reviewsGrid.querySelectorAll('.review-item'))
    : [];

  // Opinie są w jednym płynącym pasku (pasek-auto.js) — filtr tylko
  // chowa te, które nie pasują; wszystkie pasujące są od razu w pasku.
  var reviewsState = { filter: 'all' };

  function renderReviews() {
    reviewItems.forEach(function (item) {
      item.hidden = reviewsState.filter !== 'all' && item.dataset.source !== reviewsState.filter;
    });
    // Pasek wraca na początek i przelicza swoją długość
    reviewsGrid.dispatchEvent(new CustomEvent('jd:pasek-zmiana'));
  }

  if (reviewItems.length) {
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        reviewsState.filter = btn.dataset.filter;
        filterBtns.forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        renderReviews();
      });
    });
  }

  /* ======================================================================
     Lightbox — wspólny dla galerii (zdjęcia + filmy) i opinii
     Film jest tworzony dopiero w momencie otwarcia, więc wejście na stronę
     nie pobiera ani bajta wideo.
     ====================================================================== */
  var lightbox = document.getElementById('lightbox');
  var lbMedia = document.getElementById('lightbox-media');
  var lbCaption = document.getElementById('lightbox-caption');
  var lbClose = document.getElementById('lightbox-close');
  var lbPrev = document.getElementById('lightbox-prev');
  var lbNext = document.getElementById('lightbox-next');

  var lb = { items: [], index: 0, opener: null, pokazPodpis: true };

  function itemFromEl(el) {
    return {
      type: el.dataset.type === 'video' ? 'video' : 'image',
      src: el.dataset.full,
      poster: el.dataset.poster || '',
      caption: el.dataset.caption || ''
    };
  }

  function groupItems(groupEl) {
    var els = Array.prototype.slice.call(groupEl.querySelectorAll('[data-full]'));
    // W opiniach przechodzimy tylko po tych, które pasują do wybranego filtra
    if (groupEl === reviewsGrid) {
      els = els.filter(function (el) {
        return reviewsState.filter === 'all' || el.dataset.source === reviewsState.filter;
      });
    }
    return els;
  }

  function renderLightbox() {
    var item = lb.items[lb.index];
    if (!item) return;

    lbMedia.innerHTML = '';

    if (item.type === 'video') {
      var video = document.createElement('video');
      video.src = item.src;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      if (item.poster) video.poster = item.poster;
      lbMedia.appendChild(video);
    } else {
      var img = document.createElement('img');
      img.src = item.src;
      img.alt = item.caption;
      lbMedia.appendChild(img);
    }

    // W galerii podpis pod zdjęciem jest zbędny (i psuje kompozycję) —
    // treść zdjęcia mówi sama za siebie. W opiniach zostaje: to zrzuty
    // z Google/Messengera i podpis pomaga zorientować się w treści.
    lbCaption.hidden = !lb.pokazPodpis;
    lbCaption.textContent = lb.pokazPodpis ? item.caption : '';

    var multiple = lb.items.length > 1;
    lbPrev.hidden = !multiple;
    lbNext.hidden = !multiple;
  }

  function openLightbox(els, startEl, pokazPodpis) {
    lb.items = els.map(itemFromEl);
    lb.index = Math.max(els.indexOf(startEl), 0);
    lb.opener = startEl;
    lb.pokazPodpis = pokazPodpis;

    lightbox.hidden = false;
    document.body.classList.add('lightbox-open');
    renderLightbox();
    lbClose.focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.classList.remove('lightbox-open');
    lbMedia.innerHTML = ''; // zatrzymuje i zwalnia odtwarzany film
    if (lb.opener && typeof lb.opener.focus === 'function') lb.opener.focus();
    lb.opener = null;
  }

  function step(delta) {
    if (!lb.items.length) return;
    lb.index = (lb.index + delta + lb.items.length) % lb.items.length;
    renderLightbox();
  }

  if (lightbox && lbMedia) {
    document.querySelectorAll('[data-lightbox-group]').forEach(function (group) {
      group.addEventListener('click', function (event) {
        var trigger = event.target.closest('[data-full]');
        if (!trigger || !group.contains(trigger)) return;
        openLightbox(groupItems(group), trigger, group.dataset.lightboxGroup !== 'galeria');
      });
    });

    lbClose.addEventListener('click', closeLightbox);
    lbPrev.addEventListener('click', function () {
      step(-1);
    });
    lbNext.addEventListener('click', function () {
      step(1);
    });

    // Klik w tło (poza zdjęciem/filmem i poza przyciskami) zamyka podgląd
    lightbox.addEventListener('click', function (event) {
      if (event.target === lightbox || event.target.classList.contains('lightbox-figure')) {
        closeLightbox();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (lightbox.hidden) return;
      if (event.key === 'Escape') {
        closeLightbox();
      } else if (event.key === 'ArrowLeft') {
        step(-1);
      } else if (event.key === 'ArrowRight') {
        step(1);
      }
    });
  }

  /* ======================================================================
     Mapa miejsc spotkań — interaktywna mapa Google (Moje Mapy) dopiero
     po kliknięciu „Przybliż na mapie Google”. Do tego czasu strona pokazuje
     zdjęcie satelitarne z własnego serwera i nie łączy się z Mapami Google.
     ====================================================================== */
  var mapaMiejsc = document.querySelector('[data-mapa-miejsc]');
  var mapaSrc = mapaMiejsc && mapaMiejsc.getAttribute('data-mapa-src');
  var mapaPrzybliz = mapaMiejsc && mapaMiejsc.querySelector('[data-mapa-przybliz]');

  var mapaWroc = mapaMiejsc && mapaMiejsc.querySelector('[data-mapa-wroc]');
  var mapaRamka = null;

  if (mapaSrc && mapaPrzybliz) {
    mapaPrzybliz.hidden = false;
    var mapaNota = document.querySelector('[data-mapa-nota]');
    if (mapaNota) mapaNota.hidden = false;

    // „Poprzedni widok” — z powrotem zdjęcie z pinezkami i cenami. Ramka
    // zostaje (ukryta), więc ponowne „Przybliż” pokaże mapę Google bez
    // ponownego ładowania i w tym miejscu, w którym ją zostawiono.
    if (mapaWroc) {
      mapaWroc.addEventListener('click', function () {
        if (mapaRamka) mapaRamka.hidden = true;
        mapaMiejsc.classList.remove('is-google');
        mapaWroc.hidden = true;
        mapaPrzybliz.focus();
      });
    }

    mapaPrzybliz.addEventListener('click', function () {
      if (mapaRamka) {
        mapaRamka.hidden = false;
        mapaMiejsc.classList.add('is-google');
        if (mapaWroc) mapaWroc.hidden = false;
        mapaRamka.focus();
        return;
      }

      // Przybliżenie dobrane do szerokości mapy tak, żeby wszystkie pinezki
      // (Łopuszańska ↔ Będzińska, ok. 16 km) zmieściły się w kadrze, jak na
      // zdjęciu. Środek kadru (ll=) jest w data-mapa-src.
      var szerokosc = mapaMiejsc.clientWidth;
      var zoom = szerokosc >= 800 ? 12 : 11;

      // Telefon: osadzona mapa Google otwiera się z panelem listy, który
      // zasłania całą mapę — lepiej pełny ekran Moich Map w nowej karcie.
      if (szerokosc < 700) {
        window.open(mapaSrc.replace('/embed?', '/viewer?') + '&z=' + zoom, '_blank', 'noopener');
        return;
      }

      var ramka = document.createElement('iframe');
      ramka.src = mapaSrc + '&z=' + zoom;
      ramka.title = document.documentElement.lang === 'en'
        ? 'Google map — LajtELka meeting points'
        : 'Mapa Google — miejsca spotkań LajtELka';
      ramka.setAttribute('allowfullscreen', '');
      ramka.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      mapaMiejsc.classList.add('is-google');
      mapaMiejsc.appendChild(ramka);
      mapaRamka = ramka;
      if (mapaWroc) mapaWroc.hidden = false;
      ramka.focus();
    });
  }

  /* Dymki pinezek: klik w pinezkę pokazuje NA MAPIE dymek z nazwą, ceną,
     opisem i linkami (dojazd komunikacją / Mapy Google). Bez JS pinezka
     zostaje zwykłym linkiem do trasy komunikacją miejską. */
  var otwartyDymek = null;
  var otwartyPin = null;

  var zamknijDymek = function (oddajFokus) {
    if (!otwartyDymek) return;
    otwartyDymek.hidden = true;
    otwartyPin.classList.remove('is-aktywny');
    otwartyPin.setAttribute('aria-expanded', 'false');
    if (oddajFokus) otwartyPin.focus();
    otwartyDymek = null;
    otwartyPin = null;
  };

  // Dymek nad pinezką; gdy się nie mieści — pod, z prawej albo z lewej.
  var ustawDymek = function () {
    if (!otwartyDymek) return;
    var W = mapaMiejsc.clientWidth;
    var H = mapaMiejsc.clientHeight;
    var x = otwartyPin.offsetLeft; // pinezka ma zerowy rozmiar: to jest punkt na mapie
    var y = otwartyPin.offsetTop;
    var w = otwartyDymek.offsetWidth;
    var h = otwartyDymek.offsetHeight;
    var M = 8; // odstęp od krawędzi mapy
    var srodekX = Math.min(Math.max(x - w / 2, M), W - w - M);
    var srodekY = Math.min(Math.max(y - 18 - h / 2, M), H - h - M);
    var opcje = [
      [srodekX, y - 44 - h], // nad pinezką (ikona ma ok. 36 px wysokości)
      [srodekX, y + 10], // pod
      [x + 22, srodekY], // z prawej
      [x - 22 - w, srodekY], // z lewej
    ];
    // Wąska mapa (telefon): dymek to karta na całą szerokość — na dole mapy,
    // a gdy zasłoniłaby pinezkę, na górze.
    if (W < 600) {
      opcje = [[M, H - M - h], [M, M]];
    }
    var zaslania = function (o) {
      return o[0] < x + 16 && o[0] + w > x - 16 && o[1] < y + 4 && o[1] + h > y - 40;
    };
    var wybor = opcje.filter(function (o) {
      return o[0] >= M && o[0] + w <= W - M && o[1] >= M && o[1] + h <= H - M && !zaslania(o);
    })[0] || opcje.filter(function (o) {
      return o[1] >= M && o[1] + h <= H - M;
    })[0] || [srodekX, Math.max(M, Math.min(y + 10, H - h - M))];
    otwartyDymek.style.left = wybor[0] + 'px';
    otwartyDymek.style.top = wybor[1] + 'px';
  };

  if (mapaMiejsc) {
    mapaMiejsc.querySelectorAll('[data-dymek]').forEach(function (pin) {
      var dymek = document.getElementById(pin.getAttribute('data-dymek'));
      if (!dymek) return;
      pin.setAttribute('aria-expanded', 'false');
      pin.addEventListener('click', function (event) {
        event.preventDefault();
        var tenSam = otwartyPin === pin;
        zamknijDymek(false);
        if (tenSam) return;
        otwartyPin = pin;
        otwartyDymek = dymek;
        pin.classList.add('is-aktywny');
        pin.setAttribute('aria-expanded', 'true');
        dymek.hidden = false;
        ustawDymek();
        dymek.focus({ preventScroll: true });
      });
    });

    mapaMiejsc.querySelectorAll('[data-dymek-zamknij]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        zamknijDymek(true);
      });
    });

    // Klik w samą mapę (poza pinezką i dymkiem) zamyka dymek
    mapaMiejsc.addEventListener('click', function (event) {
      if (!otwartyDymek) return;
      if (event.target.closest('[data-dymek]') || event.target.closest('.mapa-dymek')) return;
      zamknijDymek(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && otwartyDymek) zamknijDymek(true);
    });

    window.addEventListener('resize', ustawDymek);
  }
})();
