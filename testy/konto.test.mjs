/**
 * Testy kont kursantów (lib/konto.js, functions/api/konto/*).
 * Uruchomienie: node --test "testy/*.test.mjs"
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  nowyKod, normalizujEmail, kontaWlaczone, przygotujKod, sprawdzKod, kontoDlaEmaila, utworzSesje, kontoZSesji,
  zapiszProfil, usunKonto, KOD_MAKS_PROB, BladKonta,
} from '../lib/konto.js';
import { utworzZPanelu, moznaOdwolac, odwolajPrzezKursanta, rezerwacjeKonta, BladRezerwacji } from '../lib/rezerwacje.js';
import { dataPL, dodajDni } from '../lib/czas.js';
import { nowaBaza } from './d1-sqlite.mjs';
import { onRequest as straznik } from '../functions/api/konto/_middleware.js';
import { onRequestPost as kodPost } from '../functions/api/konto/kod.js';
import { onRequestPost as weryfikujPost } from '../functions/api/konto/weryfikuj.js';
import { onRequestGet as jaGet } from '../functions/api/konto/ja.js';
import { onRequestPost as odwolajPost } from '../functions/api/konto/rezerwacje.js';

const T = (s) => new Date(s);
const IP = 'ip-testowe';

async function bladKonta(obietnica, kod) {
  await assert.rejects(obietnica, (e) => (e instanceof BladKonta || e instanceof BladRezerwacji) && e.kod === kod);
}

test('kod: zawsze 6 cyfr', () => {
  for (let i = 0; i < 500; i++) assert.match(nowyKod(), /^\d{6}$/);
});

test('e-mail: małe litery, bez spacji, odrzuca błędne', () => {
  assert.equal(normalizujEmail('  Anna@Example.COM '), 'anna@example.com');
  assert.equal(normalizujEmail('anna@'), null);
  assert.equal(normalizujEmail(''), null);
});

test('konta: włączone na teście, wyłączone na produkcji (chyba że KONTA_WLACZONE=tak)', () => {
  assert.equal(kontaWlaczone({ CF_PAGES_BRANCH: 'test' }), true);
  assert.equal(kontaWlaczone({ CF_PAGES_BRANCH: 'master' }), false);
  assert.equal(kontaWlaczone({ CF_PAGES_BRANCH: 'master', KONTA_WLACZONE: 'tak' }), true);
  assert.equal(kontaWlaczone({ CF_PAGES_BRANCH: 'test', KONTA_WLACZONE: 'nie' }), false);
  assert.equal(kontaWlaczone({}), false);
});

test('logowanie kodem: poprawny kod raz, dawne rezerwacje podpięte po e-mailu', async () => {
  const db = nowaBaza();
  const data = dodajDni(dataPL(), 3);
  const stara = await utworzZPanelu(db, { data, start: 600, dlugosc: 2, imie: 'Anna Kowalska', telefon: '600100200', email: 'Anna@Example.com ' });
  const t0 = T('2026-10-20T10:00:00Z');
  const { kod } = await przygotujKod(db, { email: 'anna@example.com', ipSkrot: IP }, t0);
  const email = await sprawdzKod(db, { email: 'ANNA@example.com', kod, ipSkrot: IP }, T('2026-10-20T10:03:00Z'));
  const u = await kontoDlaEmaila(db, email, 'pl');
  assert.equal(u.email, 'anna@example.com');
  assert.equal(db.sqlite.prepare('SELECT uzytkownik_id FROM rezerwacje WHERE id = ?').get(stara.id).uzytkownik_id, u.id);
  // drugi raz ten sam kod nie działa
  await bladKonta(sprawdzKod(db, { email, kod, ipSkrot: IP }, T('2026-10-20T10:04:00Z')), 'KOD_NIEWAZNY');
});

test('kod: zły kod liczy próby, po 5 trzeba nowego; wygasa po 10 min', async () => {
  const db = nowaBaza();
  const { kod } = await przygotujKod(db, { email: 'a@example.com', ipSkrot: IP }, T('2026-10-20T10:00:00Z'));
  const zly = kod === '000000' ? '111111' : '000000';
  for (let i = 0; i < KOD_MAKS_PROB; i++) {
    await bladKonta(sprawdzKod(db, { email: 'a@example.com', kod: zly, ipSkrot: IP }, T('2026-10-20T10:01:00Z')), 'KOD_ZLY');
  }
  await bladKonta(sprawdzKod(db, { email: 'a@example.com', kod, ipSkrot: IP }, T('2026-10-20T10:02:00Z')), 'KOD_NIEWAZNY');

  const nowy = await przygotujKod(db, { email: 'b@example.com', ipSkrot: IP }, T('2026-10-20T11:00:00Z'));
  await bladKonta(sprawdzKod(db, { email: 'b@example.com', kod: nowy.kod, ipSkrot: IP }, T('2026-10-20T11:11:00Z')), 'KOD_NIEWAZNY');
});

test('kod: odstęp minuty między wysyłkami i najwyżej 3 kody na adres w 15 min', async () => {
  const db = nowaBaza();
  const e = { email: 'c@example.com', ipSkrot: IP };
  await przygotujKod(db, e, T('2026-10-20T10:00:00Z'));
  await bladKonta(przygotujKod(db, e, T('2026-10-20T10:00:30Z')), 'ZA_CZESTO');
  await przygotujKod(db, e, T('2026-10-20T10:01:10Z'));
  await przygotujKod(db, e, T('2026-10-20T10:02:20Z'));
  await bladKonta(przygotujKod(db, e, T('2026-10-20T10:03:30Z')), 'LIMIT');
  await przygotujKod(db, e, T('2026-10-20T10:16:00Z')); // po 15 min znowu można
});

test('sesja: działa z ciasteczkiem, podrobiony sekret i wylogowanie — nie', async () => {
  const db = nowaBaza();
  const u = await kontoDlaEmaila(db, 'd@example.com', 'pl');
  const token = await utworzSesje(db, u.id);
  const zap = (t) => new Request('https://test.example/api/konto/ja', { headers: { Cookie: '__Host-lajtelka_sesja=' + t } });
  assert.equal((await kontoZSesji(db, zap(token))).email, 'd@example.com');
  const [id] = token.split('.');
  assert.equal(await kontoZSesji(db, zap(id + '.' + 'f'.repeat(64))), null);
  assert.equal(await kontoZSesji(db, zap(token), T('2099-01-01T00:00:00Z')), null); // wygasła
  db.sqlite.prepare('UPDATE uzytkownicy SET zablokowany = 1 WHERE id = ?').run(u.id);
  assert.equal(await kontoZSesji(db, zap(token)), null); // zablokowane konto
});

test('profil: imię i nazwisko, telefon, zgoda wymagana za pierwszym razem', async () => {
  const db = nowaBaza();
  const u = await kontoDlaEmaila(db, 'e@example.com', 'pl');
  await bladKonta(zapiszProfil(db, u, { imie: 'Anna', telefon: '600100200', zgoda_regulamin: true }), 'WALIDACJA');
  await bladKonta(zapiszProfil(db, u, { imie: 'Anna Nowak', telefon: '600', zgoda_regulamin: true }), 'WALIDACJA');
  await bladKonta(zapiszProfil(db, u, { imie: 'Anna Nowak', telefon: '600100200' }), 'WALIDACJA');
  const p = await zapiszProfil(db, u, { imie: '  Anna   Nowak ', telefon: '+48 600 100 200', zgoda_regulamin: true });
  assert.deepEqual([p.imie, p.zgoda_regulamin], ['Anna Nowak', 1]);
  const zmiana = await zapiszProfil(db, p, { imie: 'Anna Nowak-Kowalska', telefon: '600100200' }); // zgoda już jest
  assert.equal(zmiana.imie, 'Anna Nowak-Kowalska');
});

test('odwołanie: wstępna zawsze, potwierdzona do 24 h przed, cudzej nie', async () => {
  const teraz = T('2026-10-20T10:00:00Z'); // wt 12:00 w Polsce
  assert.equal(moznaOdwolac({ data: '2026-10-21', start_min: 600, status: 'wstepna' }, teraz), true);
  assert.equal(moznaOdwolac({ data: '2026-10-21', start_min: 780, status: 'potwierdzona' }, teraz), true); // śr 13:00 = 25 h
  assert.equal(moznaOdwolac({ data: '2026-10-21', start_min: 660, status: 'potwierdzona' }, teraz), false); // śr 11:00 = 23 h
  assert.equal(moznaOdwolac({ data: '2026-10-19', start_min: 600, status: 'wstepna' }, teraz), false); // minęła

  const db = nowaBaza();
  const data = dodajDni(dataPL(), 5);
  const u = await kontoDlaEmaila(db, 'f@example.com', 'pl');
  const inny = await kontoDlaEmaila(db, 'g@example.com', 'pl');
  const r = await utworzZPanelu(db, { data, start: 600, dlugosc: 2, imie: 'Ola Nowak', telefon: '600100200', email: 'f@example.com', status: 'wstepna' });
  db.sqlite.prepare('UPDATE rezerwacje SET uzytkownik_id = ? WHERE id = ?').run(u.id, r.id);
  await bladKonta(odwolajPrzezKursanta(db, inny.id, r.id), 'BRAK');
  await odwolajPrzezKursanta(db, u.id, r.id);
  assert.equal((await rezerwacjeKonta(db, u.id))[0].status, 'anulowane');
  await bladKonta(odwolajPrzezKursanta(db, u.id, r.id), 'ZA_POZNO'); // już odwołana
});

test('usunięcie konta: znika konto i sesje, rezerwacje zostają u instruktora', async () => {
  const db = nowaBaza();
  const data = dodajDni(dataPL(), 4);
  await utworzZPanelu(db, { data, start: 600, dlugosc: 2, imie: 'Ola Nowak', telefon: '600100200', email: 'h@example.com' });
  const u = await kontoDlaEmaila(db, 'h@example.com', 'pl');
  await utworzSesje(db, u.id);
  await usunKonto(db, u.id);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM uzytkownicy').get().n, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM sesje').get().n, 0);
  const r = db.sqlite.prepare('SELECT uzytkownik_id FROM rezerwacje').get();
  assert.equal(r.uzytkownik_id, null);
});

/* ------------------------------------------------------------------ */
/* Cała ścieżka przez API (jak w przeglądarce)                         */
/* ------------------------------------------------------------------ */

test('API: strażnik — konta wyłączone na produkcji, POST tylko jako JSON z tej samej strony', async () => {
  const dalej = async () => new Response('ok');
  const zap = (o) => new Request('https://lajtelka.pl/api/konto/kod', { method: 'POST', ...o });
  assert.equal((await straznik({ request: zap({}), env: { CF_PAGES_BRANCH: 'master' }, next: dalej })).status, 404);
  const env = { CF_PAGES_BRANCH: 'test' };
  assert.equal((await straznik({ request: zap({ headers: { 'Content-Type': 'text/plain' } }), env, next: dalej })).status, 415);
  assert.equal((await straznik({ request: zap({ headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' } }), env, next: dalej })).status, 403);
  assert.equal((await straznik({ request: zap({ headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' } }), env, next: dalej })).status, 200);
});

test('API: e-mail → kod z maila → zalogowany → odwołanie własnej jazdy', async () => {
  const db = nowaBaza();
  const env = { DB: db, BREVO_API_KEY: 'k', CF_PAGES_BRANCH: 'test' };
  const maile = [];
  const staryFetch = globalThis.fetch;
  globalThis.fetch = async (url, o) => {
    maile.push(JSON.parse(o.body));
    return new Response('{}', { status: 201 });
  };
  const post = (sciezka, dane, ciastko) =>
    new Request('https://test.jazdy.example' + sciezka, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ciastko ? { Cookie: ciastko } : {}) },
      body: JSON.stringify(dane),
    });
  try {
    const data = dodajDni(dataPL(), 6);
    await utworzZPanelu(db, { data, start: 600, dlugosc: 2, imie: 'Ola Nowak', telefon: '600100200', email: 'ola@example.com', status: 'wstepna' });

    const odp1 = await kodPost({ request: post('/api/konto/kod', { email: 'Ola@Example.com' }), env });
    assert.equal(odp1.status, 200);
    const kod = maile[0].subject.slice(0, 6);
    assert.match(kod, /^\d{6}$/);
    assert.equal(maile[0].to[0].email, 'ola@example.com');

    const odp2 = await weryfikujPost({ request: post('/api/konto/weryfikuj', { email: 'ola@example.com', kod }), env });
    assert.equal(odp2.status, 200);
    const ciastko = odp2.headers.get('Set-Cookie').split(';')[0];
    assert.match(odp2.headers.get('Set-Cookie'), /HttpOnly; SameSite=Lax; Secure/);

    const ja = await (await jaGet({ request: new Request('https://test.jazdy.example/api/konto/ja', { headers: { Cookie: ciastko } }), env })).json();
    assert.equal(ja.zalogowany, true);
    assert.equal(ja.konto.kompletny, false); // trzeba jeszcze uzupełnić imię, telefon, zgodę

    const moje = db.sqlite.prepare('SELECT id FROM rezerwacje').get();
    const odp3 = await odwolajPost({ request: post('/api/konto/rezerwacje', { id: moje.id }, ciastko), env });
    assert.equal(odp3.status, 200);
    assert.equal((await odp3.json()).rezerwacje[0].status, 'anulowane');
    assert.match(maile[maile.length - 1].subject, /^Kursant odwołał jazdę/); // mail do instruktora
  } finally {
    globalThis.fetch = staryFetch;
  }
});
