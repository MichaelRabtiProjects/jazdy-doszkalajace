// Buduje static/en.html — angielską wersję strony głównej pod osobnym
// adresem (lajtelka.pl/en), żeby Google mógł ją zaindeksować pod angielskie
// wyszukiwania. Przełącznik 🇬🇧 podmienia tekst tylko w przeglądarce, więc
// robot widział dotąd wyłącznie polską wersję.
//
// Źródła (jedyne miejsca do edycji):
//   static/index.html            — układ i polska treść
//   static/js/i18n-data-index.js — angielskie teksty (te same klucze data-i18n),
//                                  plus __tytul, __opis, __og-opis dla <head>
//
// Uruchomienie po każdej zmianie index.html lub tłumaczeń:
//   node narzedzia/generuj-en.mjs
//
// Skrypt kończy się błędem, jeśli jakiegoś klucza brakuje w tłumaczeniach
// albo nie znajdzie fragmentu <head> do podmiany — wtedy en.html nie
// zostaje nadpisany.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const KATALOG = fileURLToPath(new URL('../static/', import.meta.url));
const ADRES = 'https://lajtelka.pl';

// Git na Windowsie może wypakować plik z końcami linii CRLF — wzorce niżej
// zakładają samo \n.
let html = readFileSync(KATALOG + 'index.html', 'utf8').replace(/\r\n/g, '\n');

const piaskownica = { window: {} };
vm.runInNewContext(readFileSync(KATALOG + 'js/i18n-data-index.js', 'utf8'), piaskownica);
const slownik = piaskownica.window.I18N;

const brakujace = new Set();

function tlumaczenie(klucz) {
  if (slownik[klucz] === undefined) brakujace.add(klucz);
  return slownik[klucz];
}

function escapeAtrybut(tekst) {
  return tekst.replace(/&(?![a-z]+;|#\d+;)/g, '&amp;').replace(/"/g, '&quot;');
}

/** Indeks znacznika zamykającego dla elementu `tag`, którego treść zaczyna się w `od`
    (liczy zagnieżdżone elementy o tej samej nazwie). */
function koniecElementu(tekst, tag, od) {
  const wzor = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  wzor.lastIndex = od;
  let glebokosc = 1;
  let m;
  while ((m = wzor.exec(tekst))) {
    glebokosc += m[1] ? -1 : 1;
    if (glebokosc === 0) return m.index;
  }
  throw new Error(`Brak znacznika </${tag}> po pozycji ${od}`);
}

// 1. Treść elementów z data-i18n. Od końca pliku, żeby podmiany nie
//    przesuwały pozycji elementów, których jeszcze nie przetworzono.
const otwarcia = [...html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>/g)];
for (const m of otwarcia.reverse()) {
  const [znacznik, tag, klucz] = m;
  const poczatek = m.index + znacznik.length;
  const koniec = koniecElementu(html, tag, poczatek);
  const tekst = tlumaczenie(klucz);
  if (tekst !== undefined) html = html.slice(0, poczatek) + tekst + html.slice(koniec);
}

// 2. Atrybuty z data-i18n-attr="atrybut:klucz,atrybut2:klucz2".
html = html.replace(/<[a-zA-Z][^>]*\sdata-i18n-attr="([^"]+)"[^>]*>/g, (znacznik, pary) => {
  for (const para of pary.split(',')) {
    const [atrybut, klucz] = para.split(':').map((s) => s.trim());
    const tekst = tlumaczenie(klucz);
    if (tekst === undefined) continue;
    znacznik = znacznik.replace(
      new RegExp(`(\\s${atrybut}=")[^"]*(")`),
      (_, a, b) => a + escapeAtrybut(tekst) + b,
    );
  }
  return znacznik;
});

if (brakujace.size) {
  console.error('Brak angielskich tłumaczeń dla kluczy:', [...brakujace].join(', '));
  process.exit(1);
}

// 3. <head> i przełącznik języka. Każda podmiana musi trafić — inaczej błąd.
function podmien(szukane, nowe) {
  if (!html.includes(szukane)) throw new Error('Nie znaleziono w index.html: ' + szukane);
  html = html.replace(szukane, nowe);
}

podmien('<html lang="pl" data-wersja-en="/en">', '<html lang="en" data-wersja-pl="/">');
html = html.replace(
  '<!DOCTYPE html>',
  '<!DOCTYPE html>\n<!-- PLIK GENEROWANY: node narzedzia/generuj-en.mjs (z index.html i js/i18n-data-index.js) — nie edytuj ręcznie. -->',
);
podmien(
  html.match(/<title>[^<]*<\/title>/)[0],
  `<title>${slownik.__tytul}</title>`,
);
podmien(
  html.match(/<meta name="description" content="[^"]*">/)[0],
  `<meta name="description" content="${escapeAtrybut(slownik.__opis)}">`,
);
podmien(`<link rel="canonical" href="${ADRES}/">`, `<link rel="canonical" href="${ADRES}/en">`);
podmien('<meta property="og:locale" content="pl_PL">', '<meta property="og:locale" content="en_GB">');
podmien(
  html.match(/<meta property="og:title" content="[^"]*">/)[0],
  `<meta property="og:title" content="${escapeAtrybut(slownik.__tytul)}">`,
);
podmien(
  html.match(/<meta property="og:description" content="[^"]*">/)[0],
  `<meta property="og:description" content="${escapeAtrybut(slownik['__og-opis'])}">`,
);
podmien(`<meta property="og:url" content="${ADRES}/">`, `<meta property="og:url" content="${ADRES}/en">`);
podmien(
  html.match(/"description": "[^"]*",/)[0],
  `"description": ${JSON.stringify(slownik.__opis)},`,
);
// Przekierowanie na /en dla osób, które wybrały angielski — na samej /en
// zapętliłoby stronę.
podmien(html.match(/<script id="jd-przekierowanie-en">[^<]*<\/script>\n/)[0], '');
podmien(
  '<button type="button" class="lang-btn is-active" data-lang="pl" aria-pressed="true" title="Polski">',
  '<button type="button" class="lang-btn" data-lang="pl" aria-pressed="false" title="Polski">',
);
podmien(
  '<button type="button" class="lang-btn" data-lang="en" aria-pressed="false" title="English">',
  '<button type="button" class="lang-btn is-active" data-lang="en" aria-pressed="true" title="English">',
);

writeFileSync(KATALOG + 'en.html', html);
console.log('Zapisano static/en.html (' + Math.round(html.length / 1024) + ' KB)');
