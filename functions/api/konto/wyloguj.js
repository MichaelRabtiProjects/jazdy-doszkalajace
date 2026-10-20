/**
 * POST /api/konto/wyloguj  { wszedzie? }
 * Wylogowanie z tego urządzenia albo ze wszystkich naraz.
 */

import { kontoZSesji, usunSesje, usunWszystkieSesje, ciastkoWylogowania } from '../../../lib/konto.js';
import { json, wymagajBazy } from '../../../lib/http.js';

export async function onRequestPost({ request, env }) {
  let dane = {};
  try {
    dane = await request.json();
  } catch {
    /* puste ciało — zwykłe wylogowanie */
  }
  try {
    const db = wymagajBazy(env);
    const u = await kontoZSesji(db, request);
    if (u) {
      if (dane && dane.wszedzie) await usunWszystkieSesje(db, u.id);
      else await usunSesje(db, u.sesja_id);
    }
  } catch (err) {
    console.error('Błąd /api/konto/wyloguj:', err);
  }
  // Ciasteczko kasujemy zawsze — nawet gdy baza chwilowo nie odpowiada
  return json({ ok: true }, 200, { 'Set-Cookie': ciastkoWylogowania(request) });
}
