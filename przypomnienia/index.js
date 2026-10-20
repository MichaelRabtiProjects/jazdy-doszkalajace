/**
 * Worker "jazdy-przypomnienia" — co 10 minut sprawdza, czy jakiejś
 * potwierdzonej jeździe należy się przypomnienie (e-mail + SMS ok. 26 h
 * przed, bez ciszy nocnej 22:00–6:00) — cała logika w lib/przypomnienia.js.
 *
 * Osobny Worker, bo Pages Functions (reszta strony) nie mają harmonogramu.
 * Korzysta z tej samej bazy D1 i tego samego kodu z lib/.
 *
 * UWAGA: ten Worker NIE publikuje się z gita razem ze stroną. Po każdej
 * zmianie w lib/ trzeba go wdrożyć ręcznie: npx wrangler deploy (z tego folderu).
 */

import { wyslijPrzypomnienia } from '../lib/przypomnienia.js';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      wyslijPrzypomnienia(env.DB, env, env.ADRES_STRONY).then((wynik) => {
        if (wynik.jazd) console.log('Przypomnienia:', JSON.stringify(wynik));
      })
    );
  },

  // Worker nie ma strony — działa tylko z harmonogramu
  async fetch() {
    return new Response('Nie ma tu nic do oglądania.', { status: 404 });
  },
};
