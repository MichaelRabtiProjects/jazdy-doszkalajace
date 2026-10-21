/**
 * Konta kursantów — logowanie 6-cyfrowym kodem z e-maila, bez haseł
 * (decyzje właściciela: docs/plan-konta-sms-grafik.md).
 *
 * Jak to działa:
 *   1. Kursant podaje e-mail → dostaje kod (ważny 10 min, najwyżej 5 prób).
 *      Ten sam ekran służy do założenia konta i do logowania.
 *   2. Poprawny kod = skrzynka jest jego → konto (nowe albo istniejące)
 *      i sesja na 90 dni, przedłużana przy korzystaniu.
 *   3. Nowe konto uzupełnia imię i nazwisko, telefon i zgodę na regulamin.
 *   4. Dawne rezerwacje na ten sam e-mail podpinają się do konta.
 *
 * Bezpieczeństwo:
 *   - w bazie tylko skróty SHA-256 kodów i sekretów sesji,
 *   - porównania w stałym czasie,
 *   - limity: kody na adres i na IP, próby kodu, odstęp między wysyłkami,
 *   - odpowiedź na "wyślij kod" nie zdradza, czy konto istnieje.
 *
 * Konta są włączone na gałęziach testowych (CF_PAGES_BRANCH ≠ master),
 * a na produkcji dopiero po ustawieniu KONTA_WLACZONE=tak.
 */

import { WERSJA_REGULAMINU } from './dokumenty.js';

export const KOD_WAZNY_MIN = 10;
export const KOD_MAKS_PROB = 5;
export const SESJA_DNI = 90;
const ODSTEP_WYSYLKI_S = 60;
const LIMITY = {
  'kod-email': { ile: 3, minut: 15 },
  'kod-ip': { ile: 10, minut: 60 },
  'weryfikuj-ip': { ile: 30, minut: 15 },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const kodowanie = new TextEncoder();

export class BladKonta extends Error {
  constructor(kod, komunikat, status = 400) {
    super(komunikat);
    this.kod = kod;
    this.status = status;
  }
}

const KOMUNIKATY = {
  email: { pl: 'Podaj poprawny adres e-mail.', en: 'Please enter a valid e-mail address.' },
  zaCzesto: {
    pl: 'Kod został już wysłany — sprawdź skrzynkę (także spam). Nowy możesz wysłać za minutę.',
    en: 'A code has already been sent — check your inbox (and spam). You can request a new one in a minute.',
  },
  limit: {
    pl: 'Za dużo prób. Spróbuj ponownie za kilkanaście minut albo zadzwoń: 690 360 164.',
    en: 'Too many attempts. Please try again in a few minutes or call +48 690 360 164.',
  },
  kodNiewazny: {
    pl: 'Ten kod wygasł albo został już użyty. Wyślij nowy kod.',
    en: 'This code has expired or has already been used. Please request a new one.',
  },
  kodZly: { pl: 'Nieprawidłowy kod. Sprawdź i spróbuj jeszcze raz.', en: 'Incorrect code. Please check it and try again.' },
  zablokowane: {
    pl: 'To konto jest zablokowane. Skontaktuj się: 690 360 164.',
    en: 'This account is blocked. Please get in touch: +48 690 360 164.',
  },
  imie: { pl: 'Podaj imię i nazwisko.', en: 'Please enter your first and last name.' },
  telefon: { pl: 'Podaj poprawny numer telefonu.', en: 'Please enter a valid phone number.' },
  zgoda: {
    pl: 'Zaakceptuj Regulamin i Politykę prywatności.',
    en: 'Please accept the Terms of Service and Privacy Policy.',
  },
};

export function komunikat(klucz, jezyk) {
  return KOMUNIKATY[klucz][jezyk === 'en' ? 'en' : 'pl'];
}

/** Czy konta są włączone w tym środowisku — tak, chyba że KONTA_WLACZONE=nie
 *  (awaryjny powrót do grafiku bez logowania, bez zmiany kodu). */
export function kontaWlaczone(env) {
  if (!env) return false;
  return env.KONTA_WLACZONE !== 'nie';
}

/** "  Anna@Example.COM " → "anna@example.com"; null, gdy adres jest niepoprawny. */
export function normalizujEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return e.length <= 120 && EMAIL_RE.test(e) ? e : null;
}

/** 6 cyfr bez przewagi którejkolwiek wartości (odrzucamy losowania z "ogona"). */
export function nowyKod() {
  const bufor = new Uint32Array(1);
  const granica = Math.floor(0x100000000 / 1000000) * 1000000;
  for (;;) {
    crypto.getRandomValues(bufor);
    if (bufor[0] < granica) return String(bufor[0] % 1000000).padStart(6, '0');
  }
}

export async function skrot(tekst) {
  const s = await crypto.subtle.digest('SHA-256', kodowanie.encode(tekst));
  return Array.from(new Uint8Array(s), (b) => b.toString(16).padStart(2, '0')).join('');
}

function losowyHex(bajty) {
  const b = new Uint8Array(bajty);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Porównanie w stałym czasie (równej długości skróty hex). */
function rowne(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function skrotIp(request) {
  return skrot('lajtelka-ip:' + (request.headers.get('CF-Connecting-IP') || 'lokalnie'));
}

const za = (teraz, minut) => new Date(teraz.getTime() + minut * 60000).toISOString();

/* ------------------------------------------------------------------ */
/* Limity                                                              */
/* ------------------------------------------------------------------ */

async function przekroczony(db, rodzaj, klucz, teraz) {
  const { ile, minut } = LIMITY[rodzaj];
  const w = await db
    .prepare('SELECT COUNT(*) AS n FROM limity WHERE rodzaj = ? AND klucz = ? AND czas > ?')
    .bind(rodzaj, klucz, za(teraz, -minut))
    .first();
  return w.n >= ile;
}

async function zapiszLimit(db, rodzaj, klucz, teraz) {
  await db.prepare('INSERT INTO limity (rodzaj, klucz, czas) VALUES (?, ?, ?)').bind(rodzaj, klucz, teraz.toISOString()).run();
}

/** Sprząta wpisy starsze niż doba (limity) i wygasłe kody / sesje. */
export async function sprzataj(db, teraz = new Date()) {
  const t = teraz.toISOString();
  await db.batch([
    db.prepare('DELETE FROM limity WHERE czas < ?').bind(za(teraz, -24 * 60)),
    db.prepare('DELETE FROM kody_logowania WHERE wygasa_o < ?').bind(t),
    db.prepare('DELETE FROM sesje WHERE wygasa_o < ?').bind(t),
  ]);
}

/* ------------------------------------------------------------------ */
/* Kod z e-maila                                                        */
/* ------------------------------------------------------------------ */

/**
 * Przygotowuje kod dla adresu. Zwraca { email, kod } — wysyłkę robi
 * wywołujący (functions/api/konto/kod.js), żeby ten plik nie zależał od Brevo.
 */
export async function przygotujKod(db, { email, jezyk, ipSkrot }, teraz = new Date()) {
  const adres = normalizujEmail(email);
  if (!adres) throw new BladKonta('WALIDACJA', komunikat('email', jezyk));

  const ostatni = await db.prepare('SELECT wyslano_o FROM kody_logowania WHERE email = ?').bind(adres).first();
  if (ostatni && teraz.getTime() - Date.parse(ostatni.wyslano_o) < ODSTEP_WYSYLKI_S * 1000) {
    throw new BladKonta('ZA_CZESTO', komunikat('zaCzesto', jezyk), 429);
  }
  const kluczEmail = await skrot('email:' + adres);
  if ((await przekroczony(db, 'kod-email', kluczEmail, teraz)) || (await przekroczony(db, 'kod-ip', ipSkrot, teraz))) {
    throw new BladKonta('LIMIT', komunikat('limit', jezyk), 429);
  }

  const kod = nowyKod();
  await db.batch([
    db
      .prepare(
        `INSERT INTO kody_logowania (email, kod_skrot, wygasa_o, proby, wyslano_o) VALUES (?, ?, ?, 0, ?)
         ON CONFLICT (email) DO UPDATE SET kod_skrot = excluded.kod_skrot, wygasa_o = excluded.wygasa_o,
           proby = 0, wyslano_o = excluded.wyslano_o`
      )
      .bind(adres, await skrot(adres + ':' + kod), za(teraz, KOD_WAZNY_MIN), teraz.toISOString()),
    db.prepare('INSERT INTO limity (rodzaj, klucz, czas) VALUES (?, ?, ?)').bind('kod-email', kluczEmail, teraz.toISOString()),
    db.prepare('INSERT INTO limity (rodzaj, klucz, czas) VALUES (?, ?, ?)').bind('kod-ip', ipSkrot, teraz.toISOString()),
  ]);
  return { email: adres, kod };
}

/**
 * Sprawdza kod. Poprawny kod jest jednorazowy (usuwamy go). Zwraca adres
 * e-mail, którego własność właśnie potwierdzono.
 */
export async function sprawdzKod(db, { email, kod, jezyk, ipSkrot }, teraz = new Date()) {
  const adres = normalizujEmail(email);
  if (!adres) throw new BladKonta('WALIDACJA', komunikat('email', jezyk));
  if (await przekroczony(db, 'weryfikuj-ip', ipSkrot, teraz)) throw new BladKonta('LIMIT', komunikat('limit', jezyk), 429);
  await zapiszLimit(db, 'weryfikuj-ip', ipSkrot, teraz);

  const wiersz = await db.prepare('SELECT * FROM kody_logowania WHERE email = ?').bind(adres).first();
  if (!wiersz || wiersz.wygasa_o < teraz.toISOString() || wiersz.proby >= KOD_MAKS_PROB) {
    if (wiersz) await db.prepare('DELETE FROM kody_logowania WHERE email = ?').bind(adres).run();
    throw new BladKonta('KOD_NIEWAZNY', komunikat('kodNiewazny', jezyk), 400);
  }
  const czysty = String(kod || '').replace(/\D/g, '');
  if (!rowne(await skrot(adres + ':' + czysty), wiersz.kod_skrot)) {
    await db.prepare('UPDATE kody_logowania SET proby = proby + 1 WHERE email = ?').bind(adres).run();
    throw new BladKonta('KOD_ZLY', komunikat('kodZly', jezyk), 400);
  }
  // Jednorazowy — drugi raz tego samego kodu użyć się nie da
  const { meta } = await db.prepare('DELETE FROM kody_logowania WHERE email = ? AND kod_skrot = ?').bind(adres, wiersz.kod_skrot).run();
  if (!meta || meta.changes !== 1) throw new BladKonta('KOD_NIEWAZNY', komunikat('kodNiewazny', jezyk), 400);
  return adres;
}

/**
 * Konto dla potwierdzonego adresu — istniejące albo nowe. Dawne rezerwacje
 * na ten adres (bez konta) podpinają się do niego (decyzja właściciela).
 */
export async function kontoDlaEmaila(db, email, jezyk, teraz = new Date()) {
  await db.prepare('INSERT OR IGNORE INTO uzytkownicy (email, jezyk) VALUES (?, ?)').bind(email, jezyk === 'en' ? 'en' : 'pl').run();
  const u = await db.prepare('SELECT * FROM uzytkownicy WHERE email = ?').bind(email).first();
  if (u.zablokowany) throw new BladKonta('ZABLOKOWANE', komunikat('zablokowane', jezyk), 403);
  await db.batch([
    db.prepare('UPDATE uzytkownicy SET ostatnio_o = ? WHERE id = ?').bind(teraz.toISOString(), u.id),
    db
      .prepare(
        `UPDATE rezerwacje SET uzytkownik_id = ?
         WHERE uzytkownik_id IS NULL AND email != '' AND lower(trim(email)) = ?`
      )
      .bind(u.id, email),
  ]);
  return u;
}

/* ------------------------------------------------------------------ */
/* Sesje                                                               */
/* ------------------------------------------------------------------ */

export async function utworzSesje(db, uzytkownikId, teraz = new Date()) {
  const id = losowyHex(16);
  const sekret = losowyHex(32);
  await db
    .prepare('INSERT INTO sesje (id, sekret_skrot, uzytkownik_id, utworzono_o, ostatnio_o, wygasa_o) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, await skrot(sekret), uzytkownikId, teraz.toISOString(), teraz.toISOString(), za(teraz, SESJA_DNI * 24 * 60))
    .run();
  return id + '.' + sekret;
}

function nazwaCiastka(request) {
  // Prefiks __Host- (tylko https): ciasteczko nie może być ustawione przez
  // subdomenę ani mieć szerszej ścieżki — testowa wersja nie dzieli sesji z lajtelka.pl.
  return new URL(request.url).protocol === 'https:' ? '__Host-lajtelka_sesja' : 'lajtelka_sesja';
}

function atrybuty(request) {
  const https = new URL(request.url).protocol === 'https:';
  return '; Path=/; HttpOnly; SameSite=Lax' + (https ? '; Secure' : '');
}

export function ciastkoSesji(request, token) {
  return nazwaCiastka(request) + '=' + token + atrybuty(request) + '; Max-Age=' + SESJA_DNI * 24 * 60 * 60;
}

export function ciastkoWylogowania(request) {
  return nazwaCiastka(request) + '=' + atrybuty(request) + '; Max-Age=0';
}

function tokenZCiastka(request) {
  const nazwa = nazwaCiastka(request);
  for (const czesc of (request.headers.get('Cookie') || '').split(';')) {
    const [n, ...reszta] = czesc.trim().split('=');
    if (n === nazwa) return reszta.join('=');
  }
  return '';
}

/** Zalogowany użytkownik z ciasteczka albo null. Przedłuża sesję raz na dobę. */
export async function kontoZSesji(db, request, teraz = new Date()) {
  const [id, sekret] = tokenZCiastka(request).split('.');
  if (!id || !sekret || !/^[0-9a-f]{32}$/.test(id) || !/^[0-9a-f]{64}$/.test(sekret)) return null;
  const s = await db.prepare('SELECT * FROM sesje WHERE id = ?').bind(id).first();
  if (!s || s.wygasa_o < teraz.toISOString() || !rowne(await skrot(sekret), s.sekret_skrot)) return null;
  const u = await db.prepare('SELECT * FROM uzytkownicy WHERE id = ?').bind(s.uzytkownik_id).first();
  if (!u || u.zablokowany) return null;
  if (teraz.getTime() - Date.parse(s.ostatnio_o) > 24 * 3600 * 1000) {
    await db
      .prepare('UPDATE sesje SET ostatnio_o = ?, wygasa_o = ? WHERE id = ?')
      .bind(teraz.toISOString(), za(teraz, SESJA_DNI * 24 * 60), id)
      .run();
  }
  return { ...u, sesja_id: id };
}

export async function usunSesje(db, sesjaId) {
  await db.prepare('DELETE FROM sesje WHERE id = ?').bind(sesjaId).run();
}

export async function usunWszystkieSesje(db, uzytkownikId) {
  await db.prepare('DELETE FROM sesje WHERE uzytkownik_id = ?').bind(uzytkownikId).run();
}

/* ------------------------------------------------------------------ */
/* Profil                                                              */
/* ------------------------------------------------------------------ */

/** Czy konto ma wszystko, czego potrzeba do rezerwacji. */
export function profilKompletny(u) {
  return Boolean(u && u.imie && u.telefon && u.zgoda_regulamin);
}

export function widokKonta(u) {
  return {
    email: u.email,
    imie: u.imie || '',
    telefon: u.telefon || '',
    jezyk: u.jezyk,
    kompletny: profilKompletny(u),
  };
}

/** Sprawdza i zapisuje imię, telefon, język i zgodę. Zwraca świeży wiersz konta. */
export async function zapiszProfil(db, u, dane) {
  const jezyk = dane && dane.jezyk === 'en' ? 'en' : 'pl';
  const imie = typeof dane.imie === 'string' ? dane.imie.trim().replace(/\s+/g, ' ') : '';
  const telefon = typeof dane.telefon === 'string' ? dane.telefon.trim() : '';
  if (imie.length < 3 || imie.length > 80 || imie.split(' ').length < 2) throw new BladKonta('WALIDACJA', komunikat('imie', jezyk));
  const cyfry = telefon.replace(/\D/g, '');
  if (cyfry.length < 9 || cyfry.length > 15 || telefon.length > 25) throw new BladKonta('WALIDACJA', komunikat('telefon', jezyk));
  // Zgoda raz na zawsze (do zmiany wersji regulaminu); bez niej nie ma konta
  const zgoda = u.zgoda_regulamin || dane.zgoda_regulamin === true;
  if (!zgoda) throw new BladKonta('WALIDACJA', komunikat('zgoda', jezyk));
  await db
    .prepare(
      `UPDATE uzytkownicy SET imie = ?, telefon = ?, jezyk = ?, zgoda_regulamin = 1,
         wersja_regulaminu = COALESCE(wersja_regulaminu, ?) WHERE id = ?`
    )
    .bind(imie, telefon, jezyk, WERSJA_REGULAMINU, u.id)
    .run();
  return db.prepare('SELECT * FROM uzytkownicy WHERE id = ?').bind(u.id).first();
}

/**
 * Usunięcie konta (RODO). Rezerwacje zostają u instruktora (rozliczenia,
 * umowa) i kasują się same po 180 dniach — tylko odpinają się od konta.
 * Sesje znikają razem z kontem (ON DELETE CASCADE).
 */
export async function usunKonto(db, uzytkownikId) {
  await db.batch([
    db.prepare('UPDATE rezerwacje SET uzytkownik_id = NULL WHERE uzytkownik_id = ?').bind(uzytkownikId),
    db.prepare('DELETE FROM sesje WHERE uzytkownik_id = ?').bind(uzytkownikId),
    db.prepare('DELETE FROM uzytkownicy WHERE id = ?').bind(uzytkownikId),
  ]);
}
