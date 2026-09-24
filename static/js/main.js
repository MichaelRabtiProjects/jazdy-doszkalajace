/* Jazdy Doszkalające — cała interaktywność strony.
   Czysty JavaScript, zero bibliotek. */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  var revealEls = document.querySelectorAll('.reveal');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) {
      el.classList.add('is-visible');
    });
  } else {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
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
     Pływający przycisk "Zadzwoń"
     Pokazuje się po przewinięciu poza Hero i chowa nad stopką, żeby jej
     nie zasłaniać.
     ====================================================================== */
  var fab = document.getElementById('call-fab');
  var hero = document.getElementById('hero');
  var footer = document.getElementById('site-footer');

  if (fab && hero && 'IntersectionObserver' in window) {
    var heroVisible = true;
    var footerVisible = false;

    var updateFab = function () {
      fab.classList.toggle('is-visible', !heroVisible && !footerVisible);
    };

    new IntersectionObserver(
      function (entries) {
        heroVisible = entries[0].isIntersecting;
        updateFab();
      },
      { threshold: 0.15 }
    ).observe(hero);

    if (footer) {
      new IntersectionObserver(
        function (entries) {
          footerVisible = entries[0].isIntersecting;
          updateFab();
        },
        { threshold: 0.05 }
      ).observe(footer);
    }
  } else if (fab) {
    fab.classList.add('is-visible');
  }

  /* ======================================================================
     Opinie — filtry (Wszystkie / Google / Messenger) i "Pokaż więcej"
     ====================================================================== */
  var REVIEWS_STEP = 9;

  var reviewsGrid = document.getElementById('reviews-grid');
  var moreBtn = document.getElementById('reviews-more-btn');
  var filterBtns = Array.prototype.slice.call(document.querySelectorAll('.filter-btn'));
  var reviewItems = reviewsGrid
    ? Array.prototype.slice.call(reviewsGrid.querySelectorAll('.review-item'))
    : [];

  var reviewsState = { filter: 'all', expanded: false };

  function matchingReviews() {
    return reviewItems.filter(function (item) {
      return reviewsState.filter === 'all' || item.dataset.source === reviewsState.filter;
    });
  }

  function renderReviews() {
    var matching = matchingReviews();

    reviewItems.forEach(function (item) {
      item.hidden = true;
    });

    matching.forEach(function (item, i) {
      item.hidden = !reviewsState.expanded && i >= REVIEWS_STEP;
    });

    if (moreBtn) {
      var hasMore = !reviewsState.expanded && matching.length > REVIEWS_STEP;
      moreBtn.hidden = !hasMore;
      var pozostalo = Math.max(matching.length - REVIEWS_STEP, 0);
      // Tekst ma liczbę w środku, więc nie może iść przez generyczny
      // mechanizm data-i18n (patrz komentarz przy przycisku w index.html) —
      // sprawdzamy język wprost, tak jak grafik.js.
      var angielski = typeof window.jdJezyk === 'function' && window.jdJezyk() === 'en';
      moreBtn.textContent = angielski
        ? 'Show more reviews (' + pozostalo + ')'
        : 'Pokaż więcej opinii (' + pozostalo + ')';
    }
  }

  if (reviewItems.length) {
    renderReviews();

    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        reviewsState.filter = btn.dataset.filter;
        reviewsState.expanded = false;
        filterBtns.forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        renderReviews();
      });
    });

    if (moreBtn) {
      moreBtn.addEventListener('click', function () {
        reviewsState.expanded = true;
        renderReviews();
      });
    }

    // Przycisk "Pokaż więcej" ma tekst z liczbą w środku (patrz wyżej) —
    // trzeba go przerysować ręcznie przy zmianie języka, generyczny
    // mechanizm data-i18n tego nie obejmuje.
    document.addEventListener('jd:jezyk', renderReviews);
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

  var lb = { items: [], index: 0, opener: null };

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

    lbCaption.textContent = item.caption;

    var multiple = lb.items.length > 1;
    lbPrev.hidden = !multiple;
    lbNext.hidden = !multiple;
  }

  function openLightbox(els, startEl) {
    lb.items = els.map(itemFromEl);
    lb.index = Math.max(els.indexOf(startEl), 0);
    lb.opener = startEl;

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
        openLightbox(groupItems(group), trigger);
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
})();
