/**
 * Jeden adres strony: https://lajtelka.pl.
 *
 * Stary adres (jazdy-doszkalajace.pages.dev) i wersja z www przekierowują
 * na stałe (301) na lajtelka.pl z tą samą ścieżką — linki z wizytówki
 * Google, reklam i maili wysłanych przed zmianą domeny dalej działają,
 * a Google przenosi wszystko na nowy adres.
 *
 * Bez przekierowania zostają podglądy gałęzi (np.
 * abc123.jazdy-doszkalajace.pages.dev — da się je dalej testować) oraz
 * /api/* — karta otwarta jeszcze na starym adresie musi móc dokończyć
 * rezerwację.
 *
 * Plik _middleware.js w głównym folderze functions/ Cloudflare uruchamia
 * przy każdym zapytaniu (także o zdjęcia i style) — samo sprawdzenie
 * adresu to ułamek milisekundy.
 */

const DOMENA = 'lajtelka.pl';
const STARE_ADRESY = ['jazdy-doszkalajace.pages.dev', 'www.lajtelka.pl'];

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  if (STARE_ADRESY.includes(url.hostname) && !url.pathname.startsWith('/api/')) {
    return Response.redirect('https://' + DOMENA + url.pathname + url.search, 301);
  }

  return next();
}
