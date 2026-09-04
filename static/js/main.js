// Rozwijane menu mobilne — na desktopie nawigacja jest zawsze widoczna,
// więc ten kod dotyczy tylko wąskich ekranów (patrz media query w style.css).
const navToggle = document.getElementById('nav-toggle');
const mainNav = document.getElementById('main-nav');

navToggle.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('is-open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

// Po kliknięciu w link nawigacji na telefonie menu powinno się zamknąć,
// żeby nie zasłaniało sekcji, do której użytkownik właśnie przeszedł.
mainNav.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    mainNav.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});
