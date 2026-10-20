/**
 * Testy kalendarza w panelu: blokady (znikają z grafiku kursantów i nie da
 * się na nie zapisać), przenoszenie jazd, "Nowa rezerwacja" z panelu,
 * znaczek "Pierwsza rezerwacja" i wyszukiwanie kursantów.
 * Uruchomienie: node --test "testy/*.test.mjs"
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { terminyDnia, policzDostepnosc } from '../lib/dostepnosc.js';
import { utworzWstepna, utworzZPanelu, edytujZPanelu, usunStareDane, BladRezerwacji } from '../lib/rezerwacje.js';
import { utworzBlokade, zmienBlokade, usunBlokade } from '../lib/blokady.js';
import { pierwszeRezerwacje, szukajKursantow } from '../lib/kursanci.js';
import { dataPL, dodajDni } from '../lib/czas.js';
import { nowaBaza } from './d1-sqlite.mjs';

const bezDojazdu = () => 0;
const starty = (lista) => lista.map((t) => t.start);

/** Jutro albo pojutrze — dzień w horyzoncie, otwarty 10–20 niezależnie od szablonu. */
function otwartyDzien(db, ileDni = 2) {
  const data = dodajDni(dataPL(), ileDni);
  db.sqlite.prepare("DELETE FROM wyjatki WHERE data = ?").run(data);
  db.sqlite.prepare("INSERT INTO wyjatki (data, typ, godzina_start, godzina_koniec) VALUES (?, 'dodatkowa_godzina', 10, 20)").run(data);
  return data;
}

function osoba(nadpisz = {}) {
  return { imie: 'Anna Kowalska', telefon: '600 100 200', email: 'anna@example.com', ...nadpisz };
}

async function oczekujBledu(obietnica, kod) {
  await assert.rejects(obietnica, (e) => e instanceof BladRezerwacji && e.kod === kod);
}

/* ------------------------------------------------------------------ */
/* Blokady a grafik kursantów                                          */
/* ------------------------------------------------------------------ */

test('terminyDnia: blokada wycina godziny, a zaraz po niej jest start', () => {
  const wynik = starty(
    terminyDnia({
      przedzialy: [[600, 1200]],
      rezerwacje: [],
      miejsceId: null,
      dojazd: bezDojazdu,
      dlugosc: 2,
      blokady: [{ start_min: 810, koniec_min: 930 }], // 13:30–15:30
    })
  );
  assert.deepEqual(wynik, [600, 660, 930, 960, 1020, 1080]); // 10, 11, 15:30, 16, 17, 18
});

test('grafik kursantów: zablokowane godziny znikają, odblokowane wracają', async () => {
  const db = nowaBaza();
  const data = otwartyDzien(db);
  const przed = (await policzDostepnosc(db, 'ferio')).dni.find((d) => d.data === data);
  assert.ok(starty(przed.terminy[2]).includes(780)); // 13:00 jest wolne

  const b = await utworzBlokade(db, { data, start: 720, koniec: 900, opis: 'Prywatne doszkalanie' }); // 12–15
  const po = (await policzDostepnosc(db, 'ferio')).dni.find((d) => d.data === data);
  for (const s of starty(po.terminy[2])) assert.ok(s + 120 <= 720 || s >= 900, 'start ' + s + ' nachodzi na blokadę');
  assert.ok(!JSON.stringify(po).includes('Prywatne'), 'opis blokady nie trafia do kursantów');

  await usunBlokade(db, b.id);
  const znowu = (await policzDostepnosc(db, 'ferio')).dni.find((d) => d.data === data);
  assert.deepEqual(starty(znowu.terminy[2]), starty(przed.terminy[2]));
});

test('kursant nie zarezerwuje zablokowanego czasu', async () => {
  const db = nowaBaza();
  const data = otwartyDzien(db);
  await utworzBlokade(db, { data, start: 780, koniec: 900 });
  await oczekujBledu(
    utworzWstepna(db, { data, start: 780, dlugosc: 2, miejsce: 'ferio', ...osoba(), zgoda_regulamin: true }),
    'ZAMKNIETE'
  );
});

test('panel: nowa jazda ani przeniesienie nie wejdą na blokadę', async () => {
  const db = nowaBaza();
  const data = otwartyDzien(db);
  await utworzBlokade(db, { data, start: 1140, koniec: 1260, opis: 'Prywatne' }); // 19–21
  await oczekujBledu(utworzZPanelu(db, { data, start: 1080, dlugosc: 2, ...osoba() }), 'KOLIZJA');
  const r = await utworzZPanelu(db, { data, start: 600, dlugosc: 2, ...osoba() });
  await oczekujBledu(edytujZPanelu(db, r.id, { start: 1170 }), 'KOLIZJA');
});

test('blokada nie wejdzie na jazdę — komunikat mówi, na którą', async () => {
  const db = nowaBaza();
  const data = otwartyDzien(db);
  await utworzZPanelu(db, { data, start: 900, dlugosc: 2, ...osoba({ imie: 'Weronika Marusiak' }) });
  await assert.rejects(utworzBlokade(db, { data, start: 960, koniec: 1080 }), (e) => e.kod === 'KOLIZJA' && /15:00–17:00 \(Weronika Marusiak\)/.test(e.message));
});

test('blokady: przesuwanie, kolizja z inną blokadą, walidacja', async () => {
  const db = nowaBaza();
  const data = otwartyDzien(db);
  const a = await utworzBlokade(db, { data, start: 660, koniec: 900, opis: '  Blokada   kalendarza ' });
  assert.equal(a.opis, 'Blokada kalendarza');
  const b = await utworzBlokade(db, { data, start: 1140, koniec: 1260 });
  await oczekujBledu(zmienBlokade(db, b.id, { start: 840, koniec: 960 }), 'KOLIZJA');
  const jutro = dodajDni(data, 1);
  const przeniesiona = await zmienBlokade(db, b.id, { data: jutro, start: 840, koniec: 960 });
  assert.deepEqual([przeniesiona.data, przeniesiona.start_min, przeniesiona.koniec_min], [jutro, 840, 960]);
  await oczekujBledu(utworzBlokade(db, { data, start: 900, koniec: 900 }), 'WALIDACJA');
  await oczekujBledu(utworzBlokade(db, { data, start: 902, koniec: 960 }), 'WALIDACJA');
  await oczekujBledu(zmienBlokade(db, 999, { start: 600 }), 'BRAK');
});

/* ------------------------------------------------------------------ */
/* Nowa rezerwacja i przeciąganie                                      */
/* ------------------------------------------------------------------ */

test('panel: "Nowa rezerwacja" — koniec ręcznie (1,5 h) i status wstępna', async () => {
  const db = nowaBaza();
  const data = otwartyDzien(db);
  const r = await utworzZPanelu(db, { data, start: 900, koniec: 990, status: 'wstepna', ...osoba() });
  assert.deepEqual([r.start_min, r.koniec_min, r.status, r.zrodlo], [900, 990, 'wstepna', 'panel']);
  const p = await utworzZPanelu(db, { data, start: 600, dlugosc: 3, ...osoba() });
  assert.equal(p.status, 'potwierdzona');
  await oczekujBledu(utworzZPanelu(db, { data, start: 1000, koniec: 1015, ...osoba() }), 'WALIDACJA'); // 15 min
  await oczekujBledu(utworzZPanelu(db, { data, start: 1380, dlugosc: 2, ...osoba() }), 'WALIDACJA'); // po północy
});

test('przeciąganie: jazda na inny dzień i godzinę, bez kolizji z innymi', async () => {
  const db = nowaBaza();
  const data = otwartyDzien(db);
  const jutro = dodajDni(data, 1);
  const r = await utworzZPanelu(db, { data, start: 900, dlugosc: 2, ...osoba() });
  await utworzZPanelu(db, { data: jutro, start: 600, dlugosc: 2, ...osoba({ telefon: '700 100 200', email: '' }) });

  const po = await edytujZPanelu(db, r.id, { data: jutro, start: 780 });
  assert.deepEqual([po.data, po.start_min, po.koniec_min, po.godzina_start, po.godzina_koniec], [jutro, 780, 900, 13, 15]);
  await oczekujBledu(edytujZPanelu(db, r.id, { start: 660 }), 'KOLIZJA'); // na 10–12 innej osoby
  // przeniesiona jazda zwolniła stary termin
  const wolne = await utworzZPanelu(db, { data, start: 900, dlugosc: 2, ...osoba({ email: 'ktos@example.com' }) });
  assert.equal(wolne.data, data);
});

test('przeciąganie: odwołanej jazdy nie da się przenieść', async () => {
  const db = nowaBaza();
  const data = otwartyDzien(db);
  const r = await utworzZPanelu(db, { data, start: 900, dlugosc: 2, ...osoba() });
  db.sqlite.prepare("UPDATE rezerwacje SET status = 'anulowane' WHERE id = ?").run(r.id);
  await oczekujBledu(edytujZPanelu(db, r.id, { start: 960 }), 'STATUS');
});

/* ------------------------------------------------------------------ */
/* Kursanci                                                            */
/* ------------------------------------------------------------------ */

test('pierwsza rezerwacja: ta sama osoba po telefonie (różny zapis) albo e-mailu', () => {
  const pierwsze = pierwszeRezerwacje([
    { id: 1, data: '2026-10-01', start_min: 600, telefon: '+48 600 100 200', email: '', status: 'potwierdzona' },
    { id: 2, data: '2026-10-08', start_min: 600, telefon: '600100200', email: 'Anna@Example.com', status: 'potwierdzona' },
    { id: 3, data: '2026-10-09', start_min: 600, telefon: '511 222 333', email: 'anna@example.com', status: 'wstepna' },
    { id: 4, data: '2026-10-02', start_min: 600, telefon: '799 000 111', email: 'b@example.com', status: 'odrzucona' },
    { id: 5, data: '2026-10-10', start_min: 600, telefon: '799 000 111', email: '', status: 'potwierdzona' },
  ]);
  assert.deepEqual([...pierwsze].sort(), [1, 5]); // 4 odrzucona się nie liczy
});

test('szukaj kursantów: po imieniu, telefonie i e-mailu, ta sama osoba raz', async () => {
  const db = nowaBaza();
  const data = otwartyDzien(db);
  await utworzZPanelu(db, { data, start: 600, dlugosc: 2, ...osoba() });
  await utworzZPanelu(db, { data: dodajDni(data, 1), start: 600, dlugosc: 2, ...osoba({ telefon: '+48600100200' }) });
  await utworzZPanelu(db, { data, start: 900, dlugosc: 2, imie: 'Jan Nowak', telefon: '511 222 333', email: '' });

  const poImieniu = await szukajKursantow(db, 'kowal');
  assert.equal(poImieniu.length, 1);
  assert.equal(poImieniu[0].liczba, 2);
  assert.equal((await szukajKursantow(db, '511222'))[0].imie, 'Jan Nowak');
  assert.equal((await szukajKursantow(db, 'ANNA@')).length, 1);
  assert.deepEqual(await szukajKursantow(db, 'a'), []); // za krótko
  assert.deepEqual(await szukajKursantow(db, '%'), []); // znak specjalny nie znaczy "wszystko"
});

test('stare blokady są kasowane razem ze starymi danymi (180 dni)', async () => {
  const db = nowaBaza();
  const dawno = dodajDni(dataPL(), -200);
  await utworzBlokade(db, { data: dawno, start: 600, koniec: 660, opis: 'Kasia' });
  await usunStareDane(db);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM blokady').get().n, 0);
});
