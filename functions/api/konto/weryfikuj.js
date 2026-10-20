/**
 * POST /api/konto/weryfikuj  { email, kod, jezyk }
 * Poprawny kod → konto (nowe albo istniejące) i sesja w ciasteczku.
 */

import { sprawdzKod, kontoDlaEmaila, utworzSesje, ciastkoSesji, widokKonta, skrotIp, BladKonta } from '../../../lib/konto.js';
import { json, blad, wymagajBazy } from '../../../lib/http.js';

export async function onRequestPost({ request, env }) {
  let dane;
  try {
    dane = await request.json();
  } catch {
    return blad('Nieprawidłowe dane.', 400);
  }
  const jezyk = dane && dane.jezyk === 'en' ? 'en' : 'pl';
  try {
    const db = wymagajBazy(env);
    const email = await sprawdzKod(db, { email: dane && dane.email, kod: dane && dane.kod, jezyk, ipSkrot: await skrotIp(request) });
    const u = await kontoDlaEmaila(db, email, jezyk);
    const token = await utworzSesje(db, u.id);
    return json({ ok: true, konto: widokKonta(u) }, 200, { 'Set-Cookie': ciastkoSesji(request, token) });
  } catch (err) {
    if (err instanceof BladKonta) return blad(err.message, err.status, err.kod);
    console.error('Błąd /api/konto/weryfikuj:', err);
    return blad('Nie udało się zalogować. Spróbuj za chwilę.', 500);
  }
}
