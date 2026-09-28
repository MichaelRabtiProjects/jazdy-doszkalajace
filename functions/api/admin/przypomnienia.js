/**
 * POST /api/admin/przypomnienia  (chronione przez _middleware.js)
 *
 * Wysyła od razu przypomnienia o JUTRZEJSZYCH jazdach — bez czekania na
 * 18:00. Przydaje się do sprawdzenia, jak wyglądają, albo gdy jazdę
 * potwierdzasz już po 18:00. Nikt nie dostanie przypomnienia dwa razy.
 */

import { wyslijPrzypomnienia } from '../../../lib/przypomnienia.js';
import { json, blad, wymagajBazy } from '../../../lib/http.js';

export async function onRequestPost({ request, env }) {
  try {
    const wynik = await wyslijPrzypomnienia(wymagajBazy(env), env, new URL(request.url).origin, { wymus: true });
    return json({ ok: true, ...wynik });
  } catch (err) {
    console.error('Błąd /api/admin/przypomnienia:', err);
    return blad('Nie udało się wysłać przypomnień.', 500);
  }
}
