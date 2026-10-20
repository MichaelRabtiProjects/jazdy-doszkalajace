/**
 * POST /api/admin/przypomnienia  (chronione przez _middleware.js)
 *
 * Wysyła od razu przypomnienia (e-mail + SMS, jeśli włączone) o potwierdzonych
 * jazdach w ciągu najbliższych 48 h — bez czekania na "26 h przed" i bez
 * ciszy nocnej. Nikt nie dostanie tego samego przypomnienia dwa razy.
 *
 * Odpowiedź zawiera podgląd treści SMS-ów — także wtedy, gdy wysyłka SMS
 * jest wyłączona — żeby dało się sprawdzić, jak wyglądają.
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
