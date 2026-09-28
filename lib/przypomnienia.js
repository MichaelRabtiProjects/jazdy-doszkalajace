/**
 * Przypomnienia dzień przed jazdą, o 18:00 (czasu polskiego).
 *
 * Kto dostaje: jazdy JUTRZEJSZE, które instruktor potwierdził i przy których
 * zaznaczył "zadatek otrzymany". Wstępne rezerwacje i jazdy bez zadatku —
 * nie (tak ustalił instruktor).
 *
 * Kanały: e-mail (darmowy, jeśli kursant podał adres) i SMS (płatny,
 * tylko przy SMS_WLACZONE=tak — patrz lib/sms.js).
 *
 * Każda jazda dostaje przypomnienie najwyżej raz: po wysyłce zapisujemy
 * przypomnienie_o. Dzięki temu uruchomienie drugi raz (np. cron o 16:00
 * i 17:00 UTC — patrz przypomnienia/index.js) niczego nie dubluje.
 */

import { dataPL, dodajDni, godzinaPL } from './czas.js';
import { wyslijEmail } from './email.js';
import { wyslijSms, smsWlaczone } from './sms.js';
import { mailPrzypomnienie, smsPrzypomnienie } from './maile.js';

/** Godzina (czasu polskiego), o której wysyłamy przypomnienia. */
export const GODZINA_PRZYPOMNIEN = 18;

export async function wyslijPrzypomnienia(db, env, origin, { wymus = false } = {}) {
  // Cron uruchamia się o dwóch godzinach UTC (lato i zima) — faktycznie
  // działamy tylko wtedy, gdy w Polsce jest 18:00.
  if (!wymus && godzinaPL() !== GODZINA_PRZYPOMNIEN) return { pominieto: 'nie 18:00 w Polsce' };

  const jutro = dodajDni(dataPL(), 1);
  const { results } = await db
    .prepare(
      `SELECT * FROM rezerwacje
       WHERE data = ? AND status IN ('potwierdzona', 'oplacone')
         AND zadatek_otrzymany_o IS NOT NULL AND przypomnienie_o IS NULL
       ORDER BY start_min`
    )
    .bind(jutro)
    .all();

  const wynik = { jutro, jazd: results.length, maile: 0, smsy: 0 };
  for (const r of results) {
    const [mailOk, smsOk] = await Promise.all([
      r.email ? wyslijEmail(env, mailPrzypomnienie(r, origin, env)) : Promise.resolve(false),
      smsWlaczone(env) ? wyslijSms(env, r.telefon, smsPrzypomnienie(r)) : Promise.resolve(false),
    ]);
    if (mailOk) wynik.maile++;
    if (smsOk) wynik.smsy++;
    // Zapisujemy wysłanie, gdy przynajmniej jeden kanał zadziałał —
    // inaczej spróbujemy jeszcze raz przy następnym uruchomieniu.
    if (mailOk || smsOk) {
      await db.prepare('UPDATE rezerwacje SET przypomnienie_o = ? WHERE id = ?').bind(new Date().toISOString(), r.id).run();
    }
  }
  return wynik;
}
