/**
 * Worker "jazdy-przypomnienia" — codziennie o 18:00 czasu polskiego
 * wysyła przypomnienia o jutrzejszych jazdach (lib/przypomnienia.js).
 *
 * Osobny Worker, bo Pages Functions (reszta strony) nie mają harmonogramu.
 * Korzysta z tej samej bazy D1 i tego samego kodu z lib/.
 *
 * Cron w Cloudflare liczy czas w UTC, a Polska ma UTC+2 latem i UTC+1
 * zimą — dlatego dwa wyzwalacze (16:00 i 17:00 UTC), a kod sam sprawdza,
 * który z nich to 18:00 w Polsce. Drugie uruchomienie niczego nie dubluje.
 */

import { wyslijPrzypomnienia } from '../lib/przypomnienia.js';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      wyslijPrzypomnienia(env.DB, env, env.ADRES_STRONY).then((wynik) => {
        console.log('Przypomnienia:', JSON.stringify(wynik));
      })
    );
  },

  // Worker nie ma strony — działa tylko z harmonogramu
  async fetch() {
    return new Response('Nie ma tu nic do oglądania.', { status: 404 });
  },
};
