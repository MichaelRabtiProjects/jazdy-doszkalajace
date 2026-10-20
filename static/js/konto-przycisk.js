/* Link "Zaloguj się" / "Moje konto" w menu na każdej stronie.
   Pokazuje się tylko tam, gdzie konta kursantów działają (serwer odpowiada
   na /api/konto/ja) — na lajtelka.pl przed włączeniem kont zostaje ukryty. */
(function () {
  'use strict';
  var link = document.getElementById('nav-konto');
  if (!link) return;
  var zalogowany = false;

  function jezyk() {
    try {
      return window.localStorage.getItem('jd_jezyk') === 'en' ? 'en' : 'pl';
    } catch (e) {
      return 'pl';
    }
  }
  function napis() {
    var en = jezyk() === 'en';
    link.textContent = zalogowany ? (en ? 'My account' : 'Moje konto') : (en ? 'Sign in' : 'Zaloguj się');
  }

  fetch('/api/konto/ja', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
    .then(function (odp) {
      if (!odp.ok) return null;
      return odp.json();
    })
    .then(function (d) {
      if (!d) return;
      zalogowany = Boolean(d.zalogowany);
      napis();
      link.hidden = false;
    })
    .catch(function () {
      /* brak kont albo brak sieci — link zostaje ukryty */
    });

  document.addEventListener('jd:jezyk', napis);
})();
