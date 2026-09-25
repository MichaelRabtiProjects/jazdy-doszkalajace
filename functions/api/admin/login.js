/**
 * /api/admin/login
 *   POST { haslo }  — logowanie, ustawia ciasteczko sesji na 30 dni
 *   DELETE          — wylogowanie
 *   GET             — czy sesja jest ważna (panel pyta o to przy starcie)
 */

import {
  sprawdzHaslo,
  nowaSesja,
  sesjaWazna,
  ciastkoSesji,
  ciastkoWylogowania,
  zablokowanyZaProby,
  zapiszNieudanaProbe,
} from '../../../lib/sesja.js';
import { json, blad, wymagajBazy } from '../../../lib/http.js';

export async function onRequestGet({ request, env }) {
  return json({ zalogowany: await sesjaWazna(request, env), skonfigurowane: Boolean(env.ADMIN_HASLO) });
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_HASLO) {
    return blad('Panel nie jest jeszcze skonfigurowany: brak zmiennej ADMIN_HASLO w Cloudflare.', 503);
  }

  const db = wymagajBazy(env);
  if (await zablokowanyZaProby(db, request)) {
    return blad('Za dużo nieudanych prób. Spróbuj ponownie za 15 minut.', 429);
  }

  let dane;
  try {
    dane = await request.json();
  } catch {
    return blad('Nieprawidłowe dane.', 400);
  }

  if (!(await sprawdzHaslo(env, dane && dane.haslo))) {
    await zapiszNieudanaProbe(db, request);
    return blad('Nieprawidłowe hasło.', 401);
  }

  return json({ zalogowany: true }, 200, { 'Set-Cookie': ciastkoSesji(request, await nowaSesja(env)) });
}

export async function onRequestDelete({ request }) {
  return json({ zalogowany: false }, 200, { 'Set-Cookie': ciastkoWylogowania(request) });
}
