/* Tłumaczenie strony potwierdzenia rezerwacji na angielski.
   Strona jest dziś osierocona — nic do niej nie linkuje, bo rezerwacje
   online są wyłączone (patrz functions/api/status/[kod].js, zawsze 403).
   Tłumaczymy tylko statyczną powłokę; treść, którą js/potwierdzenie.js
   wstawia po odpowiedzi z API, zostaje po polsku — ten skrypt nie jest
   dwujęzyczny, bo i tak nikt tam nie trafia (patrz komentarz w HTML). */
window.I18N = {
  'header-grafik': 'Schedule',
  'tytul': 'Booking confirmation',
  'sprawdzamy': 'Checking booking status…',
  'powrot': '← Back to the homepage',
  'footer-prawa': '© 2026 Jazdy Doszkalające. All rights reserved.',
  'footer-regulamin': 'Terms of Service',
  'footer-polityka': 'Privacy Policy',
  'footer-area': 'Refresher driving lessons Warsaw · Wawer',
};
