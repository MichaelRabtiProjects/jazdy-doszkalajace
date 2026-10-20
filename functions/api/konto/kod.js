/**
 * POST /api/konto/kod  { email, jezyk }
 * Wysyła 6-cyfrowy kod logowania. Ta sama odpowiedź bez względu na to, czy
 * konto istnieje — nie da się w ten sposób sprawdzić, kto ma tu konto.
 */

import { przygotujKod, skrotIp, sprzataj, BladKonta } from '../../../lib/konto.js';
import { wyslijEmail } from '../../../lib/email.js';
import { mailKodLogowania } from '../../../lib/maile.js';
import { json, blad, wymagajBazy } from '../../../lib/http.js';

export async function onRequestPost({ request, env, waitUntil }) {
  let dane;
  try {
    dane = await request.json();
  } catch {
    return blad('Nieprawidłowe dane.', 400);
  }
  const jezyk = dane && dane.jezyk === 'en' ? 'en' : 'pl';
  try {
    const db = wymagajBazy(env);
    const { email, kod } = await przygotujKod(db, { email: dane && dane.email, jezyk, ipSkrot: await skrotIp(request) });
    const wyslany = await wyslijEmail(env, mailKodLogowania(email, kod, jezyk, env));
    if (!wyslany) console.error('Kod logowania nie wyszedł (Brevo / brak klucza) dla', email.replace(/^(.).*@/, '$1***@'));
    if (waitUntil) waitUntil(sprzataj(db).catch(() => {}));
    return json({ ok: true });
  } catch (err) {
    if (err instanceof BladKonta) return blad(err.message, err.status, err.kod);
    console.error('Błąd /api/konto/kod:', err);
    return blad('Nie udało się wysłać kodu. Spróbuj za chwilę.', 500);
  }
}
