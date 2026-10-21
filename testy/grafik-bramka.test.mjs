/**
 * Bramka grafiku: gdy konta są włączone (gałąź testowa), wolne terminy
 * i rezerwacja wymagają zalogowania — samo rozmycie grafiku w przeglądarce
 * by nie wystarczyło. Na produkcji (konta wyłączone) wszystko jak dotąd.
 * Uruchomienie: node --test "testy/*.test.mjs"
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { kontoDlaEmaila, utworzSesje, zapiszProfil } from '../lib/konto.js';
import { dataPL, dodajDni } from '../lib/czas.js';
import { nowaBaza } from './d1-sqlite.mjs';
import { onRequestGet as dostepnoscGet } from '../functions/api/dostepnosc.js';
import { onRequestPost as rezerwacjaPost, onRequestGet as rezerwacjaGet } from '../functions/api/rezerwacja.js';
import { onRequestPost as zadatekPost } from '../functions/api/zadatek.js';

const ADRES = 'https://test.jazdy.example';

/** Dzień w horyzoncie, otwarty 10–20 niezależnie od szablonu. */
function otwartyDzien(db, ileDni = 2) {
  const data = dodajDni(dataPL(), ileDni);
  db.sqlite.prepare('DELETE FROM wyjatki WHERE data = ?').run(data);
  db.sqlite.prepare("INSERT INTO wyjatki (data, typ, godzina_start, godzina_koniec) VALUES (?, 'dodatkowa_godzina', 10, 20)").run(data);
  return data;
}

function getDostepnosc(env, ciastko) {
  const request = new Request(ADRES + '/api/dostepnosc?miejsce=ferio', { headers: ciastko ? { Cookie: ciastko } : {} });
  return dostepnoscGet({ request, env });
}

function postRezerwacja(env, dane, ciastko) {
  const request = new Request(ADRES + '/api/rezerwacja', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ciastko ? { Cookie: ciastko } : {}) },
    body: JSON.stringify(dane),
  });
  return rezerwacjaPost({ request, env });
}

/** Wysyłka maili przez atrapę fetch — test nie wychodzi do Brevo. */
async function bezMaili(fn) {
  const staryFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 201 });
  try {
    return await fn();
  } finally {
    globalThis.fetch = staryFetch;
  }
}

async function zalogowany(db, email, profil) {
  const u = await kontoDlaEmaila(db, email, 'pl');
  if (profil) await zapiszProfil(db, u, { ...profil, zgoda_regulamin: true });
  return '__Host-lajtelka_sesja=' + (await utworzSesje(db, u.id));
}

function rezerwacja(data, nadpisz = {}) {
  return {
    data, start: 600, dlugosc: 2, miejsce: 'ferio',
    imie: 'Anna Kowalska', telefon: '600 100 200', email: 'anna@example.com',
    zgoda_regulamin: true, strona: '', jezyk: 'pl', ...nadpisz,
  };
}

test('bramka: na teście bez sesji grafik i rezerwacja odpowiadają 401 BRAK_SESJI', async () => {
  const db = nowaBaza();
  const env = { DB: db, BREVO_API_KEY: 'k', CF_PAGES_BRANCH: 'test' };
  const data = otwartyDzien(db);

  const g = await getDostepnosc(env);
  assert.equal(g.status, 401);
  assert.deepEqual(await g.json(), { blad: 'Zaloguj się, żeby zobaczyć wolne terminy.', kod: 'BRAK_SESJI' });

  // Podrobione ciasteczko też nie przejdzie
  assert.equal((await getDostepnosc(env, '__Host-lajtelka_sesja=' + 'a'.repeat(32) + '.' + 'b'.repeat(64))).status, 401);

  const p = await bezMaili(() => postRezerwacja(env, rezerwacja(data)));
  assert.equal(p.status, 401);
  assert.equal((await p.json()).kod, 'BRAK_SESJI');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM rezerwacje').get().n, 0);
});

test('bramka: z KONTA_WLACZONE=nie grafik i rezerwacja bez logowania, jak dawniej', async () => {
  const db = nowaBaza();
  const env = { DB: db, BREVO_API_KEY: 'k', CF_PAGES_BRANCH: 'master', KONTA_WLACZONE: 'nie' };
  const data = otwartyDzien(db);

  const g = await getDostepnosc(env);
  assert.equal(g.status, 200);
  const dzien = (await g.json()).dni.find((d) => d.data === data);
  assert.ok(dzien.terminy[2].some((t) => t.start === 600));

  const p = await bezMaili(() => postRezerwacja(env, rezerwacja(data)));
  assert.equal(p.status, 201);
  const w = db.sqlite.prepare('SELECT email, uzytkownik_id FROM rezerwacje').get();
  assert.deepEqual([w.email, w.uzytkownik_id], ['anna@example.com', null]);
});

test('bramka: zalogowany bez uzupełnionych danych widzi grafik, ale rezerwacja → 409 PROFIL', async () => {
  const db = nowaBaza();
  const env = { DB: db, BREVO_API_KEY: 'k', CF_PAGES_BRANCH: 'test' };
  const data = otwartyDzien(db);
  const ciastko = await zalogowany(db, 'ola@example.com', null);

  assert.equal((await getDostepnosc(env, ciastko)).status, 200);
  const p = await bezMaili(() => postRezerwacja(env, rezerwacja(data), ciastko));
  assert.equal(p.status, 409);
  assert.equal((await p.json()).kod, 'PROFIL');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM rezerwacje').get().n, 0);
});

test('bramka: zalogowany — rezerwacja na koncie, e-mail z konta, imię i telefon osoby jadącej', async () => {
  const db = nowaBaza();
  const env = { DB: db, BREVO_API_KEY: 'k', CF_PAGES_BRANCH: 'test' };
  const data = otwartyDzien(db);
  const ciastko = await zalogowany(db, 'mama@example.com', { imie: 'Ewa Nowak', telefon: '600 100 200' });

  // Rodzic zapisuje dziecko: inne imię i telefon, a e-mail z formularza
  // (nawet podmieniony) nie wygrywa z adresem konta.
  const p = await bezMaili(() =>
    postRezerwacja(env, rezerwacja(data, { imie: 'Kuba Nowak', telefon: '511 222 333', email: 'obcy@example.com' }), ciastko)
  );
  assert.equal(p.status, 201);
  const odp = await p.json();
  assert.match(odp.token, /^[0-9a-f]{32}$/);

  const w = db.sqlite.prepare('SELECT r.imie, r.telefon, r.email, r.uzytkownik_id, u.email AS konto FROM rezerwacje r JOIN uzytkownicy u ON u.id = r.uzytkownik_id').get();
  assert.deepEqual([w.imie, w.telefon, w.email, w.konto], ['Kuba Nowak', '511 222 333', 'mama@example.com', 'mama@example.com']);

  // Link z maila ("Twoja rezerwacja") i "Zadatek wysłany" działają bez logowania
  const strona = await rezerwacjaGet({ request: new Request(ADRES + '/api/rezerwacja?t=' + odp.token), env });
  assert.equal(strona.status, 200);
  assert.equal((await strona.json()).kod_rezerwacji, odp.kod_rezerwacji);
  const zadatek = await bezMaili(() =>
    zadatekPost({
      request: new Request(ADRES + '/api/zadatek', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: odp.token }) }),
      env,
    })
  );
  assert.equal(zadatek.status, 200);
});

test('bramka: pułapka na boty działa przed sprawdzeniem sesji', async () => {
  const db = nowaBaza();
  const env = { DB: db, BREVO_API_KEY: 'k', CF_PAGES_BRANCH: 'test' };
  const p = await postRezerwacja(env, rezerwacja(dodajDni(dataPL(), 2), { strona: 'http://spam.example' }));
  assert.equal(p.status, 400);
});
