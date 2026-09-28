/**
 * Treści e-maili. Kursant dostaje je w języku, w którym wypełnił formularz
 * (pl/en), instruktor — zawsze po polsku.
 *
 * Każdy mail ma dwie wersje: HTML i czysty tekst. Programy pocztowe, które
 * nie wyświetlają HTML-a (albo filtry antyspamowe, które go nie lubią),
 * dostają tekst — to też poprawia dostarczalność.
 */

import { esc, emailInstruktora } from './email.js';
import { cenaZaGodzine } from './rezerwacje.js';
import { miejsce as znajdzMiejsce } from './miejsca.js';
import { dzienTygodnia } from './czas.js';

const TELEFON = '690 360 164';
const BLIK = '690 360 164';

const DNI = {
  pl: ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

function dwie(n) {
  return String(n).padStart(2, '0');
}

/** 805 → "13:25" */
export function godz(minuty) {
  return dwie(Math.floor(minuty / 60)) + ':' + dwie(minuty % 60);
}

/** "środa 01.10.2026, 13:25–15:25 (2 h)" */
export function opisTerminu(r, jezyk = 'pl') {
  const [rok, mies, dzien] = r.data.split('-');
  const nazwa = DNI[jezyk === 'en' ? 'en' : 'pl'][dzienTygodnia(r.data)];
  const dl = (r.koniec_min - r.start_min) / 60;
  return nazwa + ' ' + dzien + '.' + mies + '.' + rok + ', ' + godz(r.start_min) + '–' + godz(r.koniec_min) + ' (' + dl + ' h)';
}

/** Nazwa miejsca spotkania albo "do ustalenia" (np. wpis ręczny bez miejsca). */
export function nazwaMiejsca(r, jezyk = 'pl') {
  const m = znajdzMiejsce(r.miejsce);
  if (!m) return jezyk === 'en' ? 'to be agreed' : 'do ustalenia';
  return jezyk === 'en' ? m.nazwa_en : m.nazwa;
}

/** "175 zł/h (w tym 15 zł/h za dojazd)" */
export function opisCeny(r, jezyk = 'pl') {
  const cena = cenaZaGodzine(r) + ' zł/h';
  if (!r.doplata_h) return cena;
  return cena + (jezyk === 'en'
    ? ' (incl. ' + r.doplata_h + ' zł/h travel surcharge)'
    : ' (w tym ' + r.doplata_h + ' zł/h za dojazd)');
}

function doZaplaty(r) {
  return ((r.koniec_min - r.start_min) / 60) * cenaZaGodzine(r) - r.kwota_zadatku;
}

/** Prosta, jednolita oprawa HTML — style inline, bo programy pocztowe ignorują <style>. */
function oprawa(tytul, trescHtml) {
  return (
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f6f4ef;">' +
    '<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;color:#1f2023;line-height:1.55;">' +
    '<div style="background:#1b1d21;color:#ffffff;padding:16px 20px;border-radius:12px 12px 0 0;border-bottom:3px solid #f5a300;">' +
    '<strong style="font-size:18px;">Jazdy Doszkalające<span style="color:#f5a300;">.</span></strong></div>' +
    '<div style="background:#ffffff;padding:20px;border-radius:0 0 12px 12px;">' +
    '<h1 style="font-size:20px;margin:0 0 12px;">' + esc(tytul) + '</h1>' +
    trescHtml +
    '</div></div></body></html>'
  );
}

function przycisk(href, napis) {
  return (
    '<p style="margin:20px 0;"><a href="' + esc(href) + '" style="display:inline-block;background:#f5a300;color:#1b1d21;' +
    'padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold;">' + esc(napis) + '</a></p>'
  );
}

function tabela(wiersze) {
  return (
    '<table style="border-collapse:collapse;width:100%;margin:12px 0;">' +
    wiersze
      .map(
        ([k, v]) =>
          '<tr><td style="padding:6px 8px 6px 0;color:#4a4d53;vertical-align:top;white-space:nowrap;">' + esc(k) +
          '</td><td style="padding:6px 0;"><strong>' + v + '</strong></td></tr>'
      )
      .join('') +
    '</table>'
  );
}

/* ------------------------------------------------------------------ */
/* Do instruktora                                                      */
/* ------------------------------------------------------------------ */

export function mailNowaRezerwacja(r, origin, env) {
  const termin = opisTerminu(r, 'pl');
  const panel = origin + '/admin';
  const tel = r.telefon.replace(/[^\d+]/g, '');
  return {
    do: emailInstruktora(env),
    odpowiedzDo: r.email,
    temat: 'Nowa wstępna rezerwacja: ' + termin,
    html: oprawa(
      'Nowa wstępna rezerwacja',
      '<p>Ktoś zarezerwował wstępnie termin przez grafik na stronie.</p>' +
        tabela([
          ['Termin', esc(termin)],
          ['Miejsce', esc(nazwaMiejsca(r))],
          ['Cena', esc(opisCeny(r))],
          ['Kursant', esc(r.imie)],
          ['Telefon', '<a href="tel:' + esc(tel) + '">' + esc(r.telefon) + '</a>'],
          ['E-mail', '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>'],
          ['Kod', esc(r.kod_rezerwacji)],
          ['Język', r.jezyk === 'en' ? 'angielski' : 'polski'],
        ]) +
        '<p>Termin jest już zablokowany w grafiku jako „wstępna rezerwacja”. ' +
        'Skontaktuj się z kursantem, a potem potwierdź albo odrzuć rezerwację w panelu.</p>' +
        przycisk(panel, 'Otwórz panel') +
        '<p style="color:#4a4d53;font-size:13px;">Odpowiedź na tego maila trafi prosto do kursanta.</p>'
    ),
    tekst:
      'Nowa wstępna rezerwacja\n\n' +
      'Termin: ' + termin + '\nMiejsce: ' + nazwaMiejsca(r) + '\nCena: ' + opisCeny(r) +
      '\nKursant: ' + r.imie + '\nTelefon: ' + r.telefon +
      '\nE-mail: ' + r.email + '\nKod: ' + r.kod_rezerwacji + '\n\n' +
      'Potwierdź albo odrzuć w panelu: ' + panel + '\n',
  };
}

export function mailZadatekZgloszony(r, origin, env) {
  const termin = opisTerminu(r, 'pl');
  const panel = origin + '/admin';
  return {
    do: emailInstruktora(env),
    odpowiedzDo: r.email,
    temat: 'Zadatek wysłany: ' + r.imie + ' — ' + termin,
    html: oprawa(
      'Kursant zgłosił wysłanie zadatku',
      tabela([
        ['Termin', esc(termin)],
        ['Miejsce', esc(nazwaMiejsca(r))],
        ['Kursant', esc(r.imie)],
        ['Telefon', esc(r.telefon)],
        ['Kwota', esc(r.kwota_zadatku) + ' zł (BLIK na ' + BLIK + ')'],
        ['Kod', esc(r.kod_rezerwacji)],
      ]) +
        '<p>Sprawdź, czy wpłata dotarła, i zaznacz „Zadatek otrzymany” w panelu.</p>' +
        przycisk(panel, 'Otwórz panel')
    ),
    tekst:
      'Kursant zgłosił wysłanie zadatku\n\n' +
      'Termin: ' + termin + '\nKursant: ' + r.imie + '\nTelefon: ' + r.telefon +
      '\nKwota: ' + r.kwota_zadatku + ' zł\nKod: ' + r.kod_rezerwacji + '\n\n' +
      'Sprawdź wpłatę i zaznacz ją w panelu: ' + panel + '\n',
  };
}

/* ------------------------------------------------------------------ */
/* Do kursanta                                                         */
/* ------------------------------------------------------------------ */

const TXT = {
  pl: {
    wstepnaTemat: 'Rezerwacja wstępna przyjęta — czekaj na potwierdzenie',
    wstepnaTytul: 'Rezerwacja wstępna przyjęta',
    wstepnaWstep: (imie) =>
      'Dzień dobry ' + imie + ', dziękuję za rezerwację. Termin jest wstępnie zarezerwowany dla Ciebie — ' +
      '<strong>czekaj na potwierdzenie lub kontakt od instruktora</strong>.',
    wstepnaWstepTxt: (imie) =>
      'Dzień dobry ' + imie + ', dziękuję za rezerwację. Termin jest wstępnie zarezerwowany dla Ciebie — ' +
      'czekaj na potwierdzenie lub kontakt od instruktora.',
    termin: 'Termin',
    miejsce: 'Miejsce spotkania',
    cena: 'Cena',
    kod: 'Kod rezerwacji',
    zadatek: 'Zadatek',
    reszta: 'Reszta — przed lub po jeździe',
    zadatekInfo: (kwota, kod) =>
      'Zadatek ' + kwota + ' zł możesz wysłać BLIK-iem na numer ' + BLIK + ' (w tytule wpisz ' + kod + '). ' +
      'Po wysłaniu kliknij przycisk poniżej, żebym wiedział, że pieniądze są w drodze.',
    przyciskZadatek: 'Zadatek wysłany? Kliknij tutaj',
    kontakt: 'Pytania? Odpowiedz na tego maila albo napisz SMS / WhatsApp: ' + TELEFON + '.',
    potwTemat: 'Termin potwierdzony',
    potwTytul: 'Twój termin jest potwierdzony',
    potwWstep: (imie) => 'Dzień dobry ' + imie + ', potwierdzam termin jazdy doszkalającej. Do zobaczenia!',
    potwMiejsce: 'Miejsce spotkania ustalimy telefonicznie lub SMS-em, jeśli jeszcze tego nie zrobiliśmy.',
    odrzTemat: 'Rezerwacja niepotwierdzona',
    odrzTytul: 'Nie mogę potwierdzić tego terminu',
    odrzWstep: (imie) =>
      'Dzień dobry ' + imie + ', niestety nie mogę potwierdzić tego terminu. ' +
      'Jeśli zadatek został już wysłany, zwrócę go w całości. Zapraszam do wyboru innego terminu w grafiku.',
    grafik: 'Zobacz grafik',
    szczegoly: 'Szczegóły rezerwacji',
  },
  en: {
    wstepnaTemat: 'Provisional booking received — please wait for confirmation',
    wstepnaTytul: 'Provisional booking received',
    wstepnaWstep: (imie) =>
      'Hello ' + imie + ', thank you for your booking. The time is provisionally reserved for you — ' +
      '<strong>please wait for confirmation or for the instructor to contact you</strong>.',
    wstepnaWstepTxt: (imie) =>
      'Hello ' + imie + ', thank you for your booking. The time is provisionally reserved for you — ' +
      'please wait for confirmation or for the instructor to contact you.',
    termin: 'Time',
    miejsce: 'Meeting point',
    cena: 'Price',
    kod: 'Booking code',
    zadatek: 'Deposit',
    reszta: 'The rest — before or after the lesson',
    zadatekInfo: (kwota, kod) =>
      'You can send the ' + kwota + ' zł deposit via BLIK (Polish mobile payment) to ' + BLIK +
      ' (put ' + kod + ' in the title); a bank transfer is available on request. ' +
      'Once sent, click the button below so I know the money is on its way.',
    przyciskZadatek: 'Deposit sent? Click here',
    kontakt: 'Questions? Reply to this e-mail or send an SMS / WhatsApp message to +48 ' + TELEFON + '.',
    potwTemat: 'Your lesson is confirmed',
    potwTytul: 'Your lesson is confirmed',
    potwWstep: (imie) => 'Hello ' + imie + ', I’m confirming your refresher driving lesson. See you then!',
    potwMiejsce: 'We’ll agree on the meeting point by phone or text if we haven’t already.',
    odrzTemat: 'Booking not confirmed',
    odrzTytul: 'I can’t confirm this time',
    odrzWstep: (imie) =>
      'Hello ' + imie + ', unfortunately I can’t confirm this time. ' +
      'If you have already sent the deposit, I’ll refund it in full. Feel free to pick another time in the schedule.',
    grafik: 'See the schedule',
    szczegoly: 'Booking details',
  },
};

function jez(r) {
  return r.jezyk === 'en' ? 'en' : 'pl';
}

/** Pierwsze słowo z "imię i nazwisko" — do powitania. */
function imieZPola(pole) {
  return String(pole).trim().split(/\s+/)[0];
}

export function mailWstepnaDoKursanta(r, origin, env) {
  const j = jez(r);
  const T = TXT[j];
  const termin = opisTerminu(r, j);
  const link = origin + '/potwierdzenie?t=' + encodeURIComponent(r.token);
  const imie = imieZPola(r.imie);
  return {
    do: r.email,
    doNazwa: r.imie,
    odpowiedzDo: emailInstruktora(env),
    temat: T.wstepnaTemat,
    html: oprawa(
      T.wstepnaTytul,
      '<p>' + T.wstepnaWstep(esc(imie)) + '</p>' +
        tabela([
          [T.termin, esc(termin)],
          [T.miejsce, esc(nazwaMiejsca(r, j))],
          [T.cena, esc(opisCeny(r, j))],
          [T.kod, esc(r.kod_rezerwacji)],
          [T.zadatek, esc(r.kwota_zadatku) + ' zł'],
          [T.reszta, esc(doZaplaty(r)) + ' zł'],
        ]) +
        '<p>' + esc(T.zadatekInfo(r.kwota_zadatku, r.kod_rezerwacji)) + '</p>' +
        przycisk(link, T.przyciskZadatek) +
        '<p style="color:#4a4d53;font-size:13px;">' + esc(T.kontakt) + '</p>'
    ),
    tekst:
      T.wstepnaTytul + '\n\n' + T.wstepnaWstepTxt(imie) + '\n\n' +
      T.termin + ': ' + termin + '\n' + T.miejsce + ': ' + nazwaMiejsca(r, j) + '\n' + T.kod + ': ' + r.kod_rezerwacji + '\n' +
      T.zadatek + ': ' + r.kwota_zadatku + ' zł\n' + T.reszta + ': ' + doZaplaty(r) + ' zł\n\n' +
      T.zadatekInfo(r.kwota_zadatku, r.kod_rezerwacji) + '\n' + link + '\n\n' + T.kontakt + '\n',
  };
}

export function mailPotwierdzonaDoKursanta(r, origin, env) {
  const j = jez(r);
  const T = TXT[j];
  const termin = opisTerminu(r, j);
  const imie = imieZPola(r.imie);
  const link = r.token ? origin + '/potwierdzenie?t=' + encodeURIComponent(r.token) : origin;
  return {
    do: r.email,
    doNazwa: r.imie,
    odpowiedzDo: emailInstruktora(env),
    temat: T.potwTemat + ': ' + termin,
    html: oprawa(
      T.potwTytul,
      '<p>' + esc(T.potwWstep(imie)) + '</p>' +
        tabela([
          [T.termin, esc(termin)],
          [T.miejsce, esc(nazwaMiejsca(r, j))],
          [T.cena, esc(opisCeny(r, j))],
          [T.kod, esc(r.kod_rezerwacji)],
          [T.reszta, esc(doZaplaty(r)) + ' zł'],
        ]) +
        '<p>' + esc(T.potwMiejsce) + '</p>' +
        przycisk(link, T.szczegoly) +
        '<p style="color:#4a4d53;font-size:13px;">' + esc(T.kontakt) + '</p>'
    ),
    tekst:
      T.potwTytul + '\n\n' + T.potwWstep(imie) + '\n\n' + T.termin + ': ' + termin + '\n' + T.miejsce + ': ' + nazwaMiejsca(r, j) + '\n' +
      T.kod + ': ' + r.kod_rezerwacji + '\n' + T.reszta + ': ' + doZaplaty(r) + ' zł\n\n' +
      T.potwMiejsce + '\n\n' + T.kontakt + '\n',
  };
}

export function mailOdrzuconaDoKursanta(r, origin, env) {
  const j = jez(r);
  const T = TXT[j];
  const termin = opisTerminu(r, j);
  const imie = imieZPola(r.imie);
  return {
    do: r.email,
    doNazwa: r.imie,
    odpowiedzDo: emailInstruktora(env),
    temat: T.odrzTemat + ': ' + termin,
    html: oprawa(
      T.odrzTytul,
      '<p>' + esc(T.odrzWstep(imie)) + '</p>' +
        tabela([[T.termin, esc(termin)], [T.miejsce, esc(nazwaMiejsca(r, j))]]) +
        przycisk(origin + '/#grafik', T.grafik) +
        '<p style="color:#4a4d53;font-size:13px;">' + esc(T.kontakt) + '</p>'
    ),
    tekst:
      T.odrzTytul + '\n\n' + T.odrzWstep(imie) + '\n\n' + T.termin + ': ' + termin + '\n\n' +
      T.grafik + ': ' + origin + '/#grafik\n\n' + T.kontakt + '\n',
  };
}

/* ------------------------------------------------------------------ */
/* Przypomnienie dzień przed jazdą (wysyła je lib/przypomnienia.js)    */
/* ------------------------------------------------------------------ */

const PRZYP = {
  pl: {
    temat: (godzina, miejsce) => 'Przypomnienie: jutro jazda o ' + godzina + ' — ' + miejsce,
    tytul: 'Przypomnienie o jutrzejszej jeździe',
    wstep: (imie) => 'Dzień dobry ' + imie + ', przypominam o jutrzejszej jeździe doszkalającej. Do zobaczenia!',
    zabierz: 'Weź ze sobą prawo jazdy. Gdyby coś się zmieniło, daj znać jak najszybciej: SMS / WhatsApp ' + TELEFON + '.',
    sms: (dzien, godziny, miejsce) =>
      'Przypomnienie: jutro (' + dzien + ') jazda ' + godziny + ', miejsce: ' + miejsce +
      '. Zabierz prawo jazdy. Do zobaczenia! Michael, ' + TELEFON,
  },
  en: {
    temat: (godzina, miejsce) => 'Reminder: lesson tomorrow at ' + godzina + ' — ' + miejsce,
    tytul: 'Reminder about tomorrow’s lesson',
    wstep: (imie) => 'Hello ' + imie + ', this is a reminder about your refresher driving lesson tomorrow. See you then!',
    zabierz: 'Please bring your driving licence. If anything changes, let me know as soon as possible: SMS / WhatsApp +48 ' + TELEFON + '.',
    sms: (dzien, godziny, miejsce) =>
      'Reminder: driving lesson tomorrow (' + dzien + ') ' + godziny + ', meeting point: ' + miejsce +
      '. Bring your licence. See you! Michael, +48 ' + TELEFON,
  },
};

export function mailPrzypomnienie(r, origin, env) {
  const j = jez(r);
  const T = TXT[j];
  const P = PRZYP[j];
  const termin = opisTerminu(r, j);
  const imie = imieZPola(r.imie);
  const miejsce = nazwaMiejsca(r, j);
  return {
    do: r.email,
    doNazwa: r.imie,
    odpowiedzDo: emailInstruktora(env),
    temat: P.temat(godz(r.start_min), miejsce),
    html: oprawa(
      P.tytul,
      '<p>' + esc(P.wstep(imie)) + '</p>' +
        tabela([
          [T.termin, esc(termin)],
          [T.miejsce, esc(miejsce)],
          [T.reszta, esc(doZaplaty(r)) + ' zł'],
        ]) +
        '<p>' + esc(P.zabierz) + '</p>'
    ),
    tekst:
      P.tytul + '\n\n' + P.wstep(imie) + '\n\n' + T.termin + ': ' + termin + '\n' + T.miejsce + ': ' + miejsce + '\n' +
      T.reszta + ': ' + doZaplaty(r) + ' zł\n\n' + P.zabierz + '\n',
  };
}

/** Krótka treść SMS (bez polskich znaków dopilnuje lib/sms.js). */
export function smsPrzypomnienie(r) {
  const j = jez(r);
  const [, mies, dzien] = r.data.split('-');
  // Nazwa bez dopisku w nawiasie — pełna nazwa najdłuższego miejsca
  // przekroczyłaby 160 znaków, a wtedy przypomnienie to 2 płatne SMS-y.
  const miejsce = nazwaMiejsca(r, j).split(' (')[0];
  return PRZYP[j].sms(dzien + '.' + mies, godz(r.start_min) + '-' + godz(r.koniec_min), miejsce);
}
