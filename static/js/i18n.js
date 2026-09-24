/* Przełącznik języka PL / EN — czysty JavaScript, bez bibliotek.

   Jak to działa:
   - Każda strona, która ma być tłumaczona, definiuje w <head> obiekt
     `window.I18N = { klucz: 'tekst po angielsku', ... }` PRZED wczytaniem
     tego pliku.
   - Elementy do przetłumaczenia mają atrybut data-i18n="klucz" (podmienia
     innerHTML) i/lub data-i18n-attr="atrybut:klucz,atrybut2:klucz2"
     (podmienia pojedyncze atrybuty, np. alt, title, data-caption).
   - Oryginalny (polski) tekst jest źródłem prawdy w HTML-u — ten skrypt
     zapamiętuje go przy starcie i przywraca przy powrocie na polski,
     więc tłumaczenia trzeba pisać tylko w jedną stronę (na angielski).
   - Wybór języka trzyma się w localStorage (klucz "jd_jezyk") i obowiązuje
     na całej witrynie — raz przełączony język zostaje przy przejściu na
     inną podstronę, bo localStorage jest wspólny dla całej domeny.
   - Po zmianie języka strona wysyła zdarzenie "jd:jezyk" na document, żeby
     inne skrypty (np. grafik.js, który generuje treść dynamicznie) mogły
     się do niego dostosować.
*/

(function () {
  'use strict';

  var KLUCZ_LS = 'jd_jezyk';
  var slownik = window.I18N || {};

  // Oryginalne (polskie) wartości — zapamiętane raz, przy pierwszym uruchomieniu,
  // żeby przełączanie tam i z powrotem nigdy nie "zjadło" prawdziwej treści.
  var oryginalyInnerHTML = new WeakMap();
  var oryginalyAtrybuty = new WeakMap();
  var oryginalnyTytul = document.title;

  function pobierzZapisanyJezyk() {
    try {
      var z = window.localStorage.getItem(KLUCZ_LS);
      return z === 'en' ? 'en' : 'pl';
    } catch (e) {
      // Prywatne okno / zablokowany localStorage — wracamy do domyślnego polskiego
      return 'pl';
    }
  }

  function zapiszJezyk(jezyk) {
    try {
      window.localStorage.setItem(KLUCZ_LS, jezyk);
    } catch (e) {
      // Brak zapisu nie jest błędem krytycznym — język po prostu nie przetrwa
      // przeładowania strony.
    }
  }

  function zastosujJezyk(jezyk) {
    var angielski = jezyk === 'en';

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var klucz = el.getAttribute('data-i18n');
      if (!oryginalyInnerHTML.has(el)) {
        oryginalyInnerHTML.set(el, el.innerHTML);
      }
      if (angielski && slownik[klucz] !== undefined) {
        el.innerHTML = slownik[klucz];
      } else {
        el.innerHTML = oryginalyInnerHTML.get(el);
      }
    });

    document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      var pary = el.getAttribute('data-i18n-attr').split(',');
      if (!oryginalyAtrybuty.has(el)) {
        oryginalyAtrybuty.set(el, {});
      }
      var zapamietane = oryginalyAtrybuty.get(el);

      pary.forEach(function (para) {
        var dwukropek = para.indexOf(':');
        if (dwukropek === -1) return;
        var atrybut = para.slice(0, dwukropek).trim();
        var klucz = para.slice(dwukropek + 1).trim();

        if (zapamietane[atrybut] === undefined) {
          zapamietane[atrybut] = el.getAttribute(atrybut) || '';
        }

        if (angielski && slownik[klucz] !== undefined) {
          el.setAttribute(atrybut, slownik[klucz]);
        } else {
          el.setAttribute(atrybut, zapamietane[atrybut]);
        }
      });
    });

    if (slownik.__tytul) {
      document.title = angielski ? slownik.__tytul : oryginalnyTytul;
    }

    document.documentElement.setAttribute('lang', angielski ? 'en' : 'pl');
    document.documentElement.classList.toggle('jd-en', angielski);

    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      var aktywny = btn.dataset.lang === jezyk;
      btn.classList.toggle('is-active', aktywny);
      btn.setAttribute('aria-pressed', String(aktywny));
    });

    zapiszJezyk(jezyk);
    document.dispatchEvent(new CustomEvent('jd:jezyk', { detail: { jezyk: jezyk } }));
  }

  /** Bieżący język — do odczytu przez inne skrypty (np. grafik.js). */
  window.jdJezyk = function () {
    return document.documentElement.getAttribute('lang') === 'en' ? 'en' : 'pl';
  };

  function start() {
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        zastosujJezyk(btn.dataset.lang);
      });
    });

    zastosujJezyk(pobierzZapisanyJezyk());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
