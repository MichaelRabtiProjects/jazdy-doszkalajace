/**
 * Testy przypomnień (e-mail + SMS ok. 26 h przed jazdą).
 * Uruchomienie: node --test testy/
 *
 * Nic nie jest naprawdę wysyłane — fetch jest podmieniony na atrapę,
 * a baza to SQLite w pamięci z wszystkimi migracjami (testy/d1-sqlite.mjs).
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { chwilaPL, minutyPL } from '../lib/czas.js';
import { momentPrzypomnienia, nalezne, wyslijPrzypomnienia, MAKS_PROB } from '../lib/przypomnienia.js';
import { smsPrzypomnienie, mailPrzypomnienie } from '../lib/maile.js';
import { bezPolskichZnakow } from '../lib/sms.js';
import { MIEJSCA } from '../lib/miejsca.js';
import { nowaBaza } from './d1-sqlite.mjs';

const iso = (d) => d.toISOString();
const T = (s) => new Date(s);

/* ------------------------------------------------------------------ */
/* Czas polski                                                        */
/* ------------------------------------------------------------------ */

test('chwilaPL: czas letni i zimowy', () => {
  assert.equal(iso(chwilaPL('2026-10-23', 805)), '2026-10-23T11:25:00.000Z'); // 13:25 CEST
  assert.equal(iso(chwilaPL('2026-11-05', 600)), '2026-11-05T09:00:00.000Z'); // 10:00 CET
  assert.equal(minutyPL(T('2026-10-23T11:25:00Z')), 805);
});

test('chwilaPL: dni zmiany czasu', () => {
  // 25.10.2026 — koniec czasu letniego (3:00 → 2:00)
  assert.equal(iso(chwilaPL('2026-10-25', 60)), '2026-10-24T23:00:00.000Z'); // 1:00 jeszcze CEST
  assert.equal(iso(chwilaPL('2026-10-25', 600)), '2026-10-25T09:00:00.000Z'); // 10:00 już CET
  // 29.03.2026 — początek czasu letniego (2:00 → 3:00)
  assert.equal(iso(chwilaPL('2026-03-29', 60)), '2026-03-29T00:00:00.000Z'); // 1:00 CET
  assert.equal(iso(chwilaPL('2026-03-29', 600)), '2026-03-29T08:00:00.000Z'); // 10:00 CEST
});

/* ------------------------------------------------------------------ */
/* Kiedy przypomnienie jest należne                                    */
/* ------------------------------------------------------------------ */

test('momentPrzypomnienia: zwykle 26 h przed', () => {
  // czw 22.10 14:00 → śr 21.10 12:00
  assert.equal(iso(momentPrzypomnienia('2026-10-22', 840)), '2026-10-21T10:00:00.000Z');
  // czw 8:00 → śr 6:00 (koniec ciszy nocnej — wolno)
  assert.equal(iso(momentPrzypomnienia('2026-10-22', 480)), '2026-10-21T04:00:00.000Z');
});

test('momentPrzypomnienia: noc → poprzedni wieczór 21:30', () => {
  // czw 7:00 → "26 h przed" = śr 5:00 (cisza) → wt 21:30
  assert.equal(iso(momentPrzypomnienia('2026-10-22', 420)), '2026-10-20T19:30:00.000Z');
  // czw 23:45 → śr 21:45 (tuż przed ciszą) → śr 21:30
  assert.equal(iso(momentPrzypomnienia('2026-10-22', 1425)), '2026-10-21T19:30:00.000Z');
});

test('momentPrzypomnienia: przez zmianę czasu liczy prawdziwe 26 h', () => {
  // pon 26.10 10:00 CET = 09:00Z → minus 26 h = nd 25.10 07:00Z (8:00 CET)
  assert.equal(iso(momentPrzypomnienia('2026-10-26', 600)), '2026-10-25T07:00:00.000Z');
});

test('nalezne: przed i po momencie', () => {
  const r = { data: '2026-10-22', start_min: 840 };
  assert.equal(nalezne(r, T('2026-10-21T09:59:00Z')), false);
  assert.equal(nalezne(r, T('2026-10-21T10:00:00Z')), true);
});

test('nalezne: cisza nocna 22–6', () => {
  const r = { data: '2026-10-22', start_min: 420 }; // czw 7:00
  assert.equal(nalezne(r, T('2026-10-20T19:30:00Z')), true); // wt 21:30
  assert.equal(nalezne(r, T('2026-10-20T20:05:00Z')), false); // wt 22:05
  assert.equal(nalezne(r, T('2026-10-21T03:30:00Z')), false); // śr 5:30
  assert.equal(nalezne(r, T('2026-10-21T04:00:00Z')), true); // śr 6:00
});

test('nalezne: późne potwierdzenie i ostatnia godzina', () => {
  const r = { data: '2026-10-22', start_min: 840 }; // czw 14:00
  assert.equal(nalezne(r, T('2026-10-22T08:00:00Z')), true); // czw 10:00 — od razu
  assert.equal(nalezne(r, T('2026-10-22T11:30:00Z')), false); // 30 min przed — za późno
});

test('nalezne: przycisk w panelu (wymus) — tylko jazdy w ciągu 48 h', () => {
  const r = { data: '2026-10-22', start_min: 840 }; // 12:00Z
  assert.equal(nalezne(r, T('2026-10-20T12:00:00Z'), { wymus: true }), true); // dokładnie 48 h
  assert.equal(nalezne(r, T('2026-10-20T11:00:00Z'), { wymus: true }), false); // 49 h
  assert.equal(nalezne(r, T('2026-10-22T11:30:00Z'), { wymus: true }), false); // 30 min
  assert.equal(nalezne(r, T('2026-10-21T22:00:00Z'), { wymus: true }), true); // w nocy też (ręcznie)
});

/* ------------------------------------------------------------------ */
/* Treść SMS                                                           */
/* ------------------------------------------------------------------ */

// Podstawowy alfabet GSM 03.38 — znak spoza niego = limit 70 znaków zamiast 160.
const GSM7 = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
);

function jazda(nadpisz = {}) {
  return {
    data: '2026-10-22', start_min: 840, koniec_min: 960, miejsce: 'ferio', jezyk: 'pl', doplata_h: 0,
    imie: 'Anna Kowalska', email: 'anna@example.com', telefon: '600100200', kwota_zadatku: 80, kod_rezerwacji: 'JD-2210-14',
    ...nadpisz,
  };
}

test('SMS: dokładna treść (PL i EN)', () => {
  const teraz = T('2026-10-21T10:00:00Z'); // śr 12:00
  assert.equal(
    bezPolskichZnakow(smsPrzypomnienie(jazda(), teraz)),
    'Przypomnienie: jazda jutro (czw 22.10) 14:00-16:00, Ferio Wawer. Wez prawo jazdy/Numer PKK. LajtELka, tel. 690 360 164'
  );
  assert.equal(
    bezPolskichZnakow(smsPrzypomnienie(jazda({ jezyk: 'en' }), teraz)),
    'Reminder: lesson tomorrow (Thu 22.10) 14:00-16:00, Ferio Wawer. Bring your licence/PKK number. LajtELka, +48 690 360 164'
  );
});

test('SMS i e-mail: jazda bez miejsca — "miejsce do ustalenia"', () => {
  const teraz = T('2026-10-21T10:00:00Z');
  assert.match(smsPrzypomnienie(jazda({ miejsce: null }), teraz), /14:00-16:00, miejsce do ustalenia\./);
  assert.match(smsPrzypomnienie(jazda({ miejsce: null, jezyk: 'en' }), teraz), /14:00-16:00, meeting point to be agreed\./);
  assert.equal(mailPrzypomnienie(jazda({ miejsce: null }), 'x', {}, teraz).temat, 'Przypomnienie: jazda jutro o 14:00 — miejsce do ustalenia');
});

test('SMS: "pojutrze" przy wysyłce wieczorem i "dziś" przy późnym potwierdzeniu', () => {
  const rano = jazda({ start_min: 420, koniec_min: 540 }); // czw 7:00
  assert.match(smsPrzypomnienie(rano, T('2026-10-20T19:30:00Z')), /^Przypomnienie: jazda pojutrze \(czw 22\.10\) 07:00-09:00/);
  const pozno = smsPrzypomnienie(jazda(), T('2026-10-22T08:00:00Z')); // czw 10:00, jazda 14:00
  assert.match(pozno, /jazda dziś \(czw 22\.10\)/);
});

test('SMS: bez terminu odwołania i bez "Michael" (decyzja właściciela)', () => {
  const tekst = smsPrzypomnienie(jazda(), T('2026-10-21T10:00:00Z'));
  assert.doesNotMatch(tekst, /odwoł|Michael/);
  assert.match(tekst, /LajtELka, tel\. 690 360 164$/);
});

test('SMS: każdy dzień tygodnia, miejsce, długość i język mieści się w 1 SMS-ie (160 znaków GSM)', () => {
  const miejsca = [...MIEJSCA.map((m) => m.id), null];
  let najdluzszy = '';
  // 7 kolejnych dni (pon 26.10 – nd 1.11) — skróty dni mają różną długość;
  // wysyłka 2 dni wcześniej daje najdłuższe słowo "pojutrze" / "in 2 days".
  for (let d = 0; d < 7; d++) {
    const data = '2026-' + (d < 6 ? '10-' + (26 + d) : '11-01');
    const teraz = new Date(chwilaPL(data, 0).getTime() - 2 * 24 * 3600 * 1000 + 8 * 3600 * 1000);
    for (const miejsce of miejsca) {
      for (const jezyk of ['pl', 'en']) {
        for (let dl = 1; dl <= 8; dl++) {
          const tekst = bezPolskichZnakow(smsPrzypomnienie(jazda({ data, miejsce, jezyk, start_min: 835, koniec_min: 835 + dl * 60 }), teraz));
          assert.ok(tekst.length <= 160, `${data}/${miejsce}/${jezyk}/${dl}h: ${tekst.length} znaków — ${tekst}`);
          for (const z of tekst) assert.ok(GSM7.has(z), `znak spoza GSM-7 "${z}" w: ${tekst}`);
          if (tekst.length > najdluzszy.length) najdluzszy = tekst;
        }
      }
    }
  }
  assert.match(najdluzszy, /pojutrze|in 2 days/, 'test naprawdę sprawdził wariant "pojutrze"');
});

test('E-mail: temat, termin odwołania, PKK', () => {
  const m = mailPrzypomnienie(jazda(), 'https://lajtelka.pl', {}, T('2026-10-21T10:00:00Z'));
  assert.equal(m.temat, 'Przypomnienie: jazda jutro o 14:00 — Ferio Wawer');
  assert.match(m.tekst, /Bezpłatnie odwołasz lub przełożysz jazdę do śr 14:00/);
  assert.match(m.tekst, /prawo jazdy albo numer PKK/);
});

test('E-mail: bez otrzymanego zadatku pełna cena, z zadatkiem — reszta', () => {
  const teraz = T('2026-10-21T10:00:00Z');
  assert.match(mailPrzypomnienie(jazda(), 'x', {}, teraz).tekst, /Cena \(wysłany zadatek odliczę\): 320 zł/);
  assert.match(mailPrzypomnienie(jazda({ zadatek_otrzymany_o: '2026-10-19T10:00:00Z' }), 'x', {}, teraz).tekst, /Reszta — przed lub po jeździe: 240 zł/);
});

/* ------------------------------------------------------------------ */
/* Wysyłka na bazie (atrapa D1 + atrapa Brevo)                         */
/* ------------------------------------------------------------------ */

let wyslane;
let odpowiedzSms;

beforeEach(() => {
  wyslane = [];
  odpowiedzSms = () => new Response(JSON.stringify({ messageId: 1 }), { status: 201 });
  globalThis.fetch = async (url, opcje) => {
    const cialo = JSON.parse(opcje.body);
    if (String(url).includes('transactionalSMS')) {
      wyslane.push({ kanal: 'sms', do: cialo.recipient, tresc: cialo.content, nadawca: cialo.sender });
      return odpowiedzSms();
    }
    wyslane.push({ kanal: 'mail', do: cialo.to[0].email, temat: cialo.subject });
    return new Response('{}', { status: 201 });
  };
});

const ENV = { BREVO_API_KEY: 'klucz-testowy', SMS_WLACZONE: 'tak' };
const MOMENT = T('2026-10-21T10:00:00Z'); // śr 12:00 — 26 h przed czw 14:00

function dodajJazde(db, nadpisz = {}) {
  const r = { ...jazda(), status: 'potwierdzona', ...nadpisz };
  db.sqlite
    .prepare(
      `INSERT INTO rezerwacje (data, godzina_start, godzina_koniec, start_min, koniec_min, miejsce, imie, telefon, email,
         kod_rezerwacji, kwota_zadatku, status, jezyk)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(r.data, Math.floor(r.start_min / 60), Math.ceil(r.koniec_min / 60), r.start_min, r.koniec_min, r.miejsce, r.imie,
      r.telefon, r.email, r.kod_rezerwacji, r.kwota_zadatku, r.status, r.jezyk);
  return db.sqlite.prepare('SELECT id FROM rezerwacje WHERE kod_rezerwacji = ?').get(r.kod_rezerwacji).id;
}

const wiersz = (db, id) => db.sqlite.prepare('SELECT * FROM rezerwacje WHERE id = ?').get(id);

test('baza: należna jazda dostaje e-mail i SMS dokładnie raz', async () => {
  const db = nowaBaza();
  const id = dodajJazde(db);
  const w1 = await wyslijPrzypomnienia(db, ENV, 'https://lajtelka.pl', { teraz: MOMENT });
  assert.deepEqual([w1.maile, w1.smsy], [1, 1]);
  assert.equal(wyslane.find((x) => x.kanal === 'sms').do, '48600100200');
  assert.equal(wyslane.find((x) => x.kanal === 'sms').nadawca, 'LajtELka');
  assert.ok(wiersz(db, id).przypomnienie_o && wiersz(db, id).sms_przypomnienie_o);

  const w2 = await wyslijPrzypomnienia(db, ENV, 'https://lajtelka.pl', { teraz: T('2026-10-21T10:10:00Z') });
  assert.deepEqual([w2.maile, w2.smsy], [0, 0]);
  assert.equal(wyslane.length, 2);
});

test('baza: przed momentem nic nie wychodzi', async () => {
  const db = nowaBaza();
  dodajJazde(db);
  const w = await wyslijPrzypomnienia(db, ENV, 'x', { teraz: T('2026-10-21T09:50:00Z') });
  assert.equal(w.jazd, 0);
  assert.equal(wyslane.length, 0);
});

test('baza: wstępne, odrzucone i odwołane nie dostają przypomnień', async () => {
  const db = nowaBaza();
  dodajJazde(db, { status: 'wstepna', kod_rezerwacji: 'A' });
  dodajJazde(db, { status: 'odrzucona', kod_rezerwacji: 'B' });
  dodajJazde(db, { status: 'anulowane', kod_rezerwacji: 'C' });
  await wyslijPrzypomnienia(db, ENV, 'x', { teraz: MOMENT });
  assert.equal(wyslane.length, 0);
});

test('baza: dwa uruchomienia naraz (automat + panel) — bez podwójnego SMS-a', async () => {
  const db = nowaBaza();
  dodajJazde(db);
  await Promise.all([
    wyslijPrzypomnienia(db, ENV, 'x', { teraz: MOMENT }),
    wyslijPrzypomnienia(db, ENV, 'x', { teraz: MOMENT }),
    wyslijPrzypomnienia(db, ENV, 'x', { teraz: MOMENT, wymus: true }),
  ]);
  assert.equal(wyslane.filter((x) => x.kanal === 'sms').length, 1);
  assert.equal(wyslane.filter((x) => x.kanal === 'mail').length, 1);
});

test('baza: nieudany SMS — błąd w panelu, ponowienie, najwyżej MAKS_PROB prób', async () => {
  const db = nowaBaza();
  const id = dodajJazde(db);
  odpowiedzSms = () => new Response('{"message":"Not enough credits"}', { status: 400 });

  await wyslijPrzypomnienia(db, ENV, 'x', { teraz: MOMENT });
  let r = wiersz(db, id);
  assert.equal(r.sms_przypomnienie_o, null);
  assert.equal(r.sms_proby, 1);
  assert.match(r.sms_blad, /Brevo 400/);
  assert.ok(r.przypomnienie_o, 'e-mail wychodzi mimo błędu SMS-a');

  // to samo uruchomienie jeszcze raz od razu — odstęp 10 min jeszcze nie minął
  await wyslijPrzypomnienia(db, ENV, 'x', { teraz: T('2026-10-21T10:05:00Z') });
  assert.equal(wiersz(db, id).sms_proby, 1);

  // automat co 10 minut przez 9 godzin — próby co 10/30/60/120 min, razem najwyżej 5
  for (let min = 10; min <= 540; min += 10) {
    await wyslijPrzypomnienia(db, ENV, 'x', { teraz: new Date(MOMENT.getTime() + min * 60000) });
  }
  r = wiersz(db, id);
  assert.equal(r.sms_proby, MAKS_PROB);
  const smsy = wyslane.filter((x) => x.kanal === 'sms').length;
  assert.equal(smsy, MAKS_PROB);
});

test('baza: odstępy między próbami — 5 prób rozłożonych na ok. 3,5 h', async () => {
  const db = nowaBaza();
  const id = dodajJazde(db);
  odpowiedzSms = () => new Response('{"message":"Not enough credits"}', { status: 400 });
  const proby = [];
  for (let min = 0; min <= 300; min += 10) {
    const przed = wiersz(db, id).sms_proby;
    await wyslijPrzypomnienia(db, ENV, 'x', { teraz: new Date(MOMENT.getTime() + min * 60000) });
    if (wiersz(db, id).sms_proby > przed) proby.push(min);
  }
  assert.deepEqual(proby, [0, 10, 40, 100, 220]);
});

test('baza: po wyczerpaniu prób przycisk w panelu wysyła ręcznie (np. po doładowaniu kredytów)', async () => {
  const db = nowaBaza();
  const id = dodajJazde(db);
  odpowiedzSms = () => new Response('{"message":"Not enough credits"}', { status: 400 });
  for (let min = 0; min <= 300; min += 10) {
    await wyslijPrzypomnienia(db, ENV, 'x', { teraz: new Date(MOMENT.getTime() + min * 60000) });
  }
  assert.equal(wiersz(db, id).sms_proby, MAKS_PROB);
  // automat już się poddał
  const auto = await wyslijPrzypomnienia(db, ENV, 'x', { teraz: T('2026-10-21T16:00:00Z') });
  assert.equal(auto.smsy, 0);
  // kredyty doładowane — instruktor klika "Wyślij przypomnienia teraz"
  odpowiedzSms = () => new Response('{"messageId":7}', { status: 201 });
  const w = await wyslijPrzypomnienia(db, ENV, 'x', { teraz: T('2026-10-21T16:00:00Z'), wymus: true });
  assert.equal(w.smsy, 1);
  assert.ok(wiersz(db, id).sms_przypomnienie_o);
  assert.equal(wiersz(db, id).sms_blad, null);
});

test('baza: błędna lista SMS_TYLKO_NUMERY blokuje wszystkie SMS-y (zamiast przepuszczać)', async () => {
  const db = nowaBaza();
  dodajJazde(db);
  await wyslijPrzypomnienia(db, { ...ENV, SMS_TYLKO_NUMERY: '69O36O164' }, 'x', { teraz: MOMENT }); // litera O zamiast zera
  assert.equal(wyslane.filter((x) => x.kanal === 'sms').length, 0);
});

test('baza: dzienny limit SMS-ów', async () => {
  const db = nowaBaza();
  dodajJazde(db, { kod_rezerwacji: 'A' });
  dodajJazde(db, { kod_rezerwacji: 'B', start_min: 990, koniec_min: 1110 });
  const w = await wyslijPrzypomnienia(db, { ...ENV, SMS_LIMIT_DZIENNY: '1' }, 'x', { teraz: T('2026-10-21T12:30:00Z') });
  assert.equal(w.smsy, 1);
  assert.equal(w.limit_sms, true);
});

test('baza: SMS wyłączone — tylko e-mail, próby SMS nie przepadają', async () => {
  const db = nowaBaza();
  const id = dodajJazde(db);
  await wyslijPrzypomnienia(db, { BREVO_API_KEY: 'k' }, 'x', { teraz: MOMENT });
  assert.deepEqual(wyslane.map((x) => x.kanal), ['mail']);
  assert.equal(wiersz(db, id).sms_proby, 0);
  // po włączeniu SMS-ów jazda wciąż dostanie SMS
  await wyslijPrzypomnienia(db, ENV, 'x', { teraz: T('2026-10-21T10:10:00Z') });
  assert.deepEqual(wyslane.map((x) => x.kanal), ['mail', 'sms']);
});

test('baza: test — SMS tylko na dozwolone numery', async () => {
  const db = nowaBaza();
  dodajJazde(db, { kod_rezerwacji: 'A', telefon: '600 100 200' });
  dodajJazde(db, { kod_rezerwacji: 'B', telefon: '+48 690 360 164', start_min: 990, koniec_min: 1110 });
  await wyslijPrzypomnienia(db, { ...ENV, SMS_TYLKO_NUMERY: '48690360164' }, 'x', { teraz: T('2026-10-21T12:30:00Z') });
  assert.deepEqual(wyslane.filter((x) => x.kanal === 'sms').map((x) => x.do), ['48690360164']);
});

test('baza: jedno przypomnienie na jazdę — także po zmianie godziny w panelu', async () => {
  const db = nowaBaza();
  const id = dodajJazde(db);
  await wyslijPrzypomnienia(db, ENV, 'x', { teraz: MOMENT });
  // panel: inna godzina tej samej jazdy, potem sprawdzenie przypomnienia
  db.sqlite.prepare('UPDATE rezerwacje SET start_min = 900, koniec_min = 1020 WHERE id = ?').run(id);
  const w = await wyslijPrzypomnienia(db, ENV, 'x', { id, teraz: T('2026-10-21T11:00:00Z') });
  assert.deepEqual([w.maile, w.smsy], [0, 0]);
  assert.equal(wyslane.length, 2);
});

test('baza: zmiana godziny na bliżej niż 26 h, gdy przypomnienie jeszcze nie wyszło — idzie od razu', async () => {
  const db = nowaBaza();
  const id = dodajJazde(db, { data: '2026-10-23' }); // pt 14:00 — jeszcze daleko
  await wyslijPrzypomnienia(db, ENV, 'x', { teraz: MOMENT });
  assert.equal(wyslane.length, 0);
  db.sqlite.prepare("UPDATE rezerwacje SET data = '2026-10-22' WHERE id = ?").run(id); // przeniesiona na czw
  const w = await wyslijPrzypomnienia(db, ENV, 'x', { id, teraz: MOMENT });
  assert.deepEqual([w.maile, w.smsy], [1, 1]);
});

test('baza: przycisk w panelu pokazuje podgląd SMS-a bez wysyłki, gdy SMS wyłączone', async () => {
  const db = nowaBaza();
  dodajJazde(db);
  const w = await wyslijPrzypomnienia(db, {}, 'x', { teraz: T('2026-10-20T20:00:00Z'), wymus: true });
  assert.equal(w.podglad.length, 1);
  assert.match(w.podglad[0].sms, /^Przypomnienie: jazda pojutrze \(czw 22\.10\)/);
  assert.equal(wyslane.length, 0);
});
