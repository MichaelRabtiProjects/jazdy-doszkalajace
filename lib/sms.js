/**
 * Wysyłka SMS przez Brevo (to samo konto i klucz co e-maile).
 *
 * Endpoint wg dokumentacji Brevo: POST /v3/transactionalSMS/send
 * (starszy /v3/transactionalSMS/sms jest wycofywany), numer odbiorcy
 * z kierunkowym kraju bez "+" (np. 48690360164), nadawca: do 11 liter/cyfr.
 * Odpowiedź 201 z messageId = przyjęte do wysyłki.
 *
 * SMS-y są płatne (kredyty SMS w koncie Brevo), dlatego wysyłka jest
 * WYŁĄCZONA, dopóki w Cloudflare nie ustawisz zmiennej SMS_WLACZONE=tak.
 * Bez niej treść SMS-a trafia tylko do logu — jak e-maile bez klucza.
 *
 * SMS_TYLKO_NUMERY (opcjonalnie, np. "48690360164") — SMS-y idą wyłącznie na
 * te numery (po przecinku), reszta tylko do logu. Do testów na adresie
 * testowym, żeby żaden kursant nie dostał próbnego SMS-a.
 */

/** Nazwa nadawcy — trzeba ją zgłosić w Brevo (SMS → Senders) dla Polski. */
const NADAWCA = 'LajtELka';

/**
 * Polskie litery zamieniamy na łacińskie: SMS ze znakiem spoza podstawowego
 * alfabetu GSM ma limit 70 znaków zamiast 160, więc to samo przypomnienie
 * kosztowałoby 2-3 SMS-y zamiast jednego.
 */
export function bezPolskichZnakow(tekst) {
  const mapa = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z', Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z', '–': '-', '—': '-', '’': "'", '„': '"', '”': '"' };
  return String(tekst).replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ–—’„”]/g, (z) => mapa[z]);
}

/**
 * Numer w formacie dla Brevo: same cyfry z kierunkowym.
 *   "600 100 200"      → "48600100200"
 *   "+48 600 100 200"  → "48600100200"
 *   "0044 7700 900123" → "447700900123"
 * Zwraca null, gdy numer wygląda na niepoprawny.
 */
export function numerMiedzynarodowy(telefon) {
  const s = String(telefon || '').trim();
  let cyfry = s.replace(/\D/g, '');
  if (s.startsWith('+')) return cyfry.length >= 10 ? cyfry : null;
  if (cyfry.startsWith('00')) cyfry = cyfry.slice(2);
  else if (cyfry.length === 9) cyfry = '48' + cyfry;
  return cyfry.length >= 10 && cyfry.length <= 15 ? cyfry : null;
}

export function smsWlaczone(env) {
  return Boolean(env && env.BREVO_API_KEY && env.SMS_WLACZONE === 'tak');
}

/** Numery z SMS_TYLKO_NUMERY albo null, gdy ograniczenia nie ma. */
function dozwoloneNumery(env) {
  const lista = String((env && env.SMS_TYLKO_NUMERY) || '')
    .split(',')
    .map((n) => numerMiedzynarodowy(n))
    .filter(Boolean);
  return lista.length ? lista : null;
}

/**
 * Wysyła jeden SMS. Nigdy nie rzuca wyjątku.
 * Zwraca { ok: true } albo { ok: false, blad: 'krótki powód' }.
 */
export async function wyslijSms(env, telefon, tresc) {
  const numer = numerMiedzynarodowy(telefon);
  const tekst = bezPolskichZnakow(tresc);
  if (!numer) {
    console.error('SMS: niepoprawny numer', telefon);
    return { ok: false, blad: 'niepoprawny numer' };
  }
  const dozwolone = dozwoloneNumery(env);
  if (!smsWlaczone(env) || (dozwolone && !dozwolone.includes(numer))) {
    console.log('[SMS — tylko w logu (SMS_WLACZONE / SMS_TYLKO_NUMERY)]\nDo: ' + numer + '\n' + tekst);
    return { ok: false, blad: 'wysyłka SMS wyłączona' };
  }
  try {
    const odp = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: NADAWCA, recipient: numer, content: tekst, type: 'transactional', tag: 'przypomnienie' }),
    });
    if (!odp.ok) {
      const opis = await odp.text();
      console.error('Brevo odrzuciło SMS:', odp.status, opis);
      return { ok: false, blad: 'Brevo ' + odp.status + ': ' + opis.slice(0, 120) };
    }
    return { ok: true };
  } catch (err) {
    console.error('Błąd połączenia z Brevo (SMS):', err);
    return { ok: false, blad: 'brak połączenia z Brevo' };
  }
}
