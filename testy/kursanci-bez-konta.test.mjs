/**
 * Rezerwacje wpisane w panelu bez telefonu / e-maila oraz osoby bez konta
 * w zakładce "Kursanci" (listaKont / osobaZHistoria).
 * Uruchomienie: node --test "testy/*.test.mjs"
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { utworzZPanelu, utworzWstepna, BladRezerwacji } from '../lib/rezerwacje.js';
import { listaKont, osobaZHistoria } from '../lib/kursanci.js';
import { dataPL, dodajDni } from '../lib/czas.js';
import { nowaBaza } from './d1-sqlite.mjs';

function otwartyDzien(db, ileDni = 2) {
  const data = dodajDni(dataPL(), ileDni);
  db.sqlite.prepare('DELETE FROM wyjatki WHERE data = ?').run(data);
  db.sqlite.prepare("INSERT INTO wyjatki (data, typ, godzina_start, godzina_koniec) VALUES (?, 'dodatkowa_godzina', 10, 20)").run(data);
  return data;
}

test('panel: rezerwacja bez telefonu i e-maila (wpis dla instruktora), imię może być jednym słowem', async () => {
  const db = nowaBaza();
  const data = otwartyDzien(db);
  const r = await utworzZPanelu(db, { data, start: 600, dlugosc: 2, imie: 'Kasia', telefon: '', email: '' });
  assert.equal(r.telefon, '');
  assert.equal(r.email, '');
  assert.equal(r.token, null);
  // podany numer dalej musi być poprawny
  await assert.rejects(
    utworzZPanelu(db, { data, start: 900, dlugosc: 2, imie: 'Kasia', telefon: '12', email: '' }),
    (e) => e instanceof BladRezerwacji && e.kod === 'WALIDACJA'
  );
  // a bez imienia nie przejdzie
  await assert.rejects(
    utworzZPanelu(db, { data, start: 900, dlugosc: 2, imie: '', telefon: '', email: '' }),
    (e) => e instanceof BladRezerwacji && e.kod === 'WALIDACJA'
  );
});

test('formularz publiczny: telefon dalej wymagany', async () => {
  const db = nowaBaza();
  const data = otwartyDzien(db);
  await assert.rejects(
    utworzWstepna(db, { data, start: 600, dlugosc: 2, miejsce: 'ferio', imie: 'Anna Kowalska', telefon: '', email: 'a@example.com', zgoda_regulamin: true }),
    (e) => e instanceof BladRezerwacji && e.kod === 'WALIDACJA'
  );
});

test('Kursanci: osoby z rezerwacji z panelu (z telefonem lub e-mailem) bez konta, zgrupowane', async () => {
  const db = nowaBaza();
  const data = otwartyDzien(db);
  const jutro = dodajDni(data, 1);
  await utworzZPanelu(db, { data, start: 600, dlugosc: 2, imie: 'Ola Nowak', telefon: '600 100 200', email: '' });
  await utworzZPanelu(db, { data: jutro, start: 600, dlugosc: 2, imie: 'Ola Nowak', telefon: '+48600100200', email: 'ola@example.com' });
  await utworzZPanelu(db, { data, start: 900, dlugosc: 2, imie: 'Piotr', telefon: '', email: 'piotr@example.com' });
  await utworzZPanelu(db, { data, start: 1080, dlugosc: 1, imie: 'Moje', telefon: '', email: '' }); // bez kontaktu — nie kursant
  // konto z tym samym telefonem co ktoś z panelu — ta osoba nie dubluje się
  db.sqlite.prepare("INSERT INTO uzytkownicy (email, imie, telefon, jezyk, utworzono_o) VALUES ('ewa@example.com', 'Ewa Konto', '700 200 300', 'pl', datetime('now'))").run();
  await utworzZPanelu(db, { data: jutro, start: 900, dlugosc: 2, imie: 'Ewa Konto', telefon: '700200300', email: '' });

  const lista = await listaKont(db);
  const bez = lista.filter((k) => k.bez_konta);
  assert.deepEqual(bez.map((k) => k.imie).sort(), ['Ola Nowak', 'Piotr']);
  const ola = bez.find((k) => k.imie === 'Ola Nowak');
  assert.equal(ola.jazd, 2);
  assert.equal(ola.email, 'ola@example.com');
  assert.equal(ola.klucz, 'tel:600100200');
  assert.equal(lista.filter((k) => !k.bez_konta).length, 1);

  const szukane = await listaKont(db, 'piotr');
  assert.deepEqual(szukane.map((k) => k.imie), ['Piotr']);

  const h = await osobaZHistoria(db, ola.klucz);
  assert.equal(h.rezerwacje.length, 2);
  assert.equal(h.telefon !== '', true);
  assert.equal(await osobaZHistoria(db, 'tel:999999999'), null);
});
