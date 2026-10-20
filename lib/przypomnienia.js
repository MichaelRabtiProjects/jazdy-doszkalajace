/**
 * Przypomnienia ok. 26 h przed jazdą — e-mail i SMS razem
 * (ustalenia właściciela: docs/plan-konta-sms-grafik.md).
 *
 * Kto: wszystkie POTWIERDZONE jazdy, także bez otrzymanego zadatku.
 *
 * Kiedy: 26 h przed początkiem jazdy — kursant ma wtedy jeszcze ok. 2 h na
 * bezpłatne odwołanie (regulamin § 5: do 24 h przed).
 *   - Cisza nocna 22:00–6:00: wtedy nic nie wychodzi. Gdy moment "26 h
 *     przed" wypada w nocy (albo tuż przed nią, od 21:30), przypomnienie idzie
 *     WCZEŚNIEJ — o 21:30 poprzedniego wieczoru.
 *   - Jazda potwierdzona później niż 26 h przed: od razu (panel wysyła zaraz
 *     po potwierdzeniu, a automat i tak sprawdza co 10 minut); w nocy — o 6:00.
 *   - Gdy do jazdy została mniej niż godzina — już nie wysyłamy.
 *
 * Kto uruchamia: Worker przypomnienia/ co 10 minut oraz panel po
 * potwierdzeniu, dodaniu albo zmianie godziny jazdy.
 *
 * Każdy kanał ma swój znacznik: przypomnienie_o (e-mail) i
 * sms_przypomnienie_o (SMS). Przed wysyłką rezerwację "zajmujemy" jednym
 * UPDATE ... WHERE znacznik IS NULL — dwa równoległe uruchomienia (automat +
 * panel) nie wyślą tego samego dwa razy. Gdy wysyłka się nie uda, zwalniamy
 * znacznik i próbujemy przy następnym uruchomieniu, najwyżej MAKS_PROB razy.
 */

import { dataPL, dodajDni, chwilaPL, minutyPL } from './czas.js';
import { wyslijEmail } from './email.js';
import { wyslijSms, smsWlaczone, bezPolskichZnakow } from './sms.js';
import { mailPrzypomnienie, smsPrzypomnienie } from './maile.js';

/** Ile minut przed jazdą wysyłamy przypomnienie (26 h). */
export const WYPRZEDZENIE_MIN = 26 * 60;
/** Cisza nocna (czas polski, minuty od północy): 22:00–6:00. */
export const CISZA_OD = 22 * 60;
export const CISZA_DO = 6 * 60;
/** Gdy "26 h przed" wypada w nocy — wysyłka o tej porze poprzedniego wieczoru. */
export const WIECZOREM = 21 * 60 + 30;
/** Bliżej jazdy niż tyle minut — przypomnienie nie ma już sensu. */
export const NAJPOZNIEJ_PRZED_JAZDA_MIN = 60;
/** Ile razy próbujemy każdy kanał, zanim się poddamy (błąd widać w panelu). */
export const MAKS_PROB = 5;
/** Bezpiecznik kosztów: najwyżej tyle SMS-ów dziennie (zmienna SMS_LIMIT_DZIENNY). */
const DOMYSLNY_LIMIT_SMS = 40;
/** Przycisk w panelu wysyła przypomnienia o jazdach w ciągu tylu godzin. */
const WYMUS_GODZIN = 48;

/** Czy w Polsce trwa cisza nocna (22:00–6:00). */
export function cisza(teraz = new Date()) {
  const m = minutyPL(teraz);
  return m >= CISZA_OD || m < CISZA_DO;
}

/** Od kiedy przypomnienie o jeździe (data YYYY-MM-DD, start w minutach) jest należne. */
export function momentPrzypomnienia(data, startMin) {
  const start = chwilaPL(data, startMin).getTime();
  const cel = new Date(start - WYPRZEDZENIE_MIN * 60000);
  const m = minutyPL(cel);
  // 21:30–23:59 → ten sam wieczór o 21:30; 0:00–5:59 → poprzedni wieczór o 21:30.
  if (m >= WIECZOREM) return chwilaPL(dataPL(cel), WIECZOREM);
  if (m < CISZA_DO) return chwilaPL(dodajDni(dataPL(cel), -1), WIECZOREM);
  return cel;
}

/**
 * Czy teraz wysłać przypomnienie o tej jeździe.
 * wymus (przycisk w panelu) — bez czekania na "26 h przed" i bez ciszy
 * nocnej, ale tylko dla jazd w ciągu najbliższych 48 h.
 */
export function nalezne(r, teraz = new Date(), { wymus = false } = {}) {
  const doJazdy = chwilaPL(r.data, r.start_min).getTime() - teraz.getTime();
  if (doJazdy < NAJPOZNIEJ_PRZED_JAZDA_MIN * 60000) return false;
  if (wymus) return doJazdy <= WYMUS_GODZIN * 3600 * 1000;
  if (cisza(teraz)) return false;
  return teraz.getTime() >= momentPrzypomnienia(r.data, r.start_min).getTime();
}

const POTWIERDZONE_SQL = "'potwierdzona', 'oplacone'";

/**
 * Wysyła należne przypomnienia.
 *   id     — tylko ta jedna rezerwacja (panel, zaraz po potwierdzeniu)
 *   wymus  — przycisk "Wyślij przypomnienia teraz" w panelu
 * Zwraca podsumowanie; przy wymus także podgląd treści SMS-ów (dla panelu).
 */
export async function wyslijPrzypomnienia(db, env, origin, { wymus = false, id = null, teraz = new Date() } = {}) {
  const dzis = dataPL(teraz);
  const zapytanie =
    id != null
      ? db.prepare(`SELECT * FROM rezerwacje WHERE id = ? AND status IN (${POTWIERDZONE_SQL})`).bind(id)
      : db
          .prepare(
            `SELECT * FROM rezerwacje
             WHERE data BETWEEN ? AND ? AND status IN (${POTWIERDZONE_SQL})
               AND ((przypomnienie_o IS NULL AND mail_proby < ? AND email != '')
                 OR (sms_przypomnienie_o IS NULL AND sms_proby < ?))
             ORDER BY data, start_min`
          )
          .bind(dzis, dodajDni(dzis, 2), MAKS_PROB, MAKS_PROB);
  const { results } = await zapytanie.all();
  const kandydaci = results.filter((r) => nalezne(r, teraz, { wymus }));

  const wynik = { jazd: kandydaci.length, maile: 0, smsy: 0, bledy: [] };
  if (wymus) wynik.podglad = [];
  if (!kandydaci.length) return wynik;

  const mailMozliwy = Boolean(env && env.BREVO_API_KEY);
  const smsMozliwy = smsWlaczone(env);
  let zostaloSms = smsMozliwy ? Math.max(0, limitSms(env) - (await smsyDzisiaj(db, teraz))) : 0;

  for (const r of kandydaci) {
    const sms = bezPolskichZnakow(smsPrzypomnienie(r, teraz));
    if (wymus) wynik.podglad.push({ kod: r.kod_rezerwacji, sms });

    if (mailMozliwy && r.email && !r.przypomnienie_o && r.mail_proby < MAKS_PROB) {
      if (await zajmij(db, r.id, 'przypomnienie_o', 'mail_proby', teraz)) {
        if (await wyslijEmail(env, mailPrzypomnienie(r, origin, env, teraz))) wynik.maile++;
        else {
          await zwolnij(db, r.id, 'przypomnienie_o');
          wynik.bledy.push(r.kod_rezerwacji + ': e-mail nie wyszedł');
        }
      }
    }

    if (smsMozliwy && !r.sms_przypomnienie_o && r.sms_proby < MAKS_PROB) {
      if (zostaloSms <= 0) {
        wynik.limit_sms = true;
        continue;
      }
      if (await zajmij(db, r.id, 'sms_przypomnienie_o', 'sms_proby', teraz)) {
        zostaloSms--;
        const odp = await wyslijSms(env, r.telefon, sms);
        if (odp.ok) {
          wynik.smsy++;
          await db.prepare('UPDATE rezerwacje SET sms_blad = NULL WHERE id = ?').bind(r.id).run();
        } else {
          await zwolnij(db, r.id, 'sms_przypomnienie_o', odp.blad);
          wynik.bledy.push(r.kod_rezerwacji + ': SMS — ' + odp.blad);
        }
      }
    }
  }
  if (wynik.limit_sms) console.error('Przypomnienia: osiągnięto dzienny limit SMS-ów (' + limitSms(env) + ').');
  return wynik;
}

/** Nazwy kolumn to stałe z tego pliku — nigdy dane od użytkownika. */
async function zajmij(db, id, kolumna, proby, teraz) {
  const { meta } = await db
    .prepare(`UPDATE rezerwacje SET ${kolumna} = ?, ${proby} = ${proby} + 1 WHERE id = ? AND ${kolumna} IS NULL AND ${proby} < ?`)
    .bind(teraz.toISOString(), id, MAKS_PROB)
    .run();
  return Boolean(meta && meta.changes === 1);
}

async function zwolnij(db, id, kolumna, blad) {
  if (kolumna === 'sms_przypomnienie_o') {
    await db.prepare('UPDATE rezerwacje SET sms_przypomnienie_o = NULL, sms_blad = ? WHERE id = ?').bind(blad || null, id).run();
  } else {
    await db.prepare(`UPDATE rezerwacje SET ${kolumna} = NULL WHERE id = ?`).bind(id).run();
  }
}

function limitSms(env) {
  const n = parseInt(env && env.SMS_LIMIT_DZIENNY, 10);
  return Number.isFinite(n) && n >= 0 ? n : DOMYSLNY_LIMIT_SMS;
}

/** Ile SMS-ów z przypomnieniem wyszło od północy (czasu polskiego). */
async function smsyDzisiaj(db, teraz) {
  const polnoc = chwilaPL(dataPL(teraz), 0).toISOString();
  const w = await db.prepare('SELECT COUNT(*) AS n FROM rezerwacje WHERE sms_przypomnienie_o >= ?').bind(polnoc).first();
  return (w && w.n) || 0;
}
