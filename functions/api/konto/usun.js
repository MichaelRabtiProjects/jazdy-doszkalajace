/**
 * POST /api/konto/usun  { kod }
 * Usunięcie konta (RODO) — potwierdzone świeżym kodem z e-maila, żeby nikt
 * z dostępem do odblokowanego telefonu nie usunął konta jednym kliknięciem.
 * Kod wysyła się zwykłym /api/konto/kod.
 */

import { kontoZSesji, sprawdzKod, usunKonto, ciastkoWylogowania, skrotIp, BladKonta } from '../../../lib/konto.js';
import { json, blad, wymagajBazy } from '../../../lib/http.js';

export async function onRequestPost({ request, env }) {
  let dane;
  try {
    dane = await request.json();
  } catch {
    return blad('Nieprawidłowe dane.', 400);
  }
  try {
    const db = wymagajBazy(env);
    const u = await kontoZSesji(db, request);
    if (!u) return blad('Zaloguj się ponownie.', 401, 'BRAK_SESJI');
    await sprawdzKod(db, { email: u.email, kod: dane && dane.kod, jezyk: u.jezyk, ipSkrot: await skrotIp(request) });
    await usunKonto(db, u.id);
    return json({ ok: true }, 200, { 'Set-Cookie': ciastkoWylogowania(request) });
  } catch (err) {
    if (err instanceof BladKonta) return blad(err.message, err.status, err.kod);
    console.error('Błąd /api/konto/usun:', err);
    return blad('Nie udało się usunąć konta.', 500);
  }
}
