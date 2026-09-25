/**
 * Wysyłka e-maili przez Brevo (dawniej Sendinblue) — zwykłe wywołanie
 * HTTP, bez żadnej biblioteki.
 *
 * Dlaczego Brevo: strona stoi na adresie *.pages.dev, bez własnej domeny.
 * Brevo pozwala wysyłać z potwierdzonego adresu Gmail (MichaelRabti@gmail.com)
 * do dowolnego odbiorcy, za darmo do 300 maili dziennie.
 *
 * Zmienne w Cloudflare (Pages → Settings → Variables and Secrets):
 *   BREVO_API_KEY      — klucz API z panelu Brevo (typ: Secret)
 *   EMAIL_INSTRUKTORA  — opcjonalnie; domyślnie MichaelRabti@gmail.com
 *
 * Bez BREVO_API_KEY nic nie jest wysyłane — treść maila trafia tylko do
 * logu serwera. Dzięki temu cały przepływ da się przetestować lokalnie,
 * zanim powstanie konto w Brevo.
 */

const DOMYSLNY_EMAIL = 'MichaelRabti@gmail.com';
const NADAWCA_NAZWA = 'Jazdy Doszkalające — Michael Rabti';

export function emailInstruktora(env) {
  return (env && env.EMAIL_INSTRUKTORA) || DOMYSLNY_EMAIL;
}

/** Zamienia znaki specjalne HTML — dane z formularza nie mogą wstrzyknąć znaczników do maila. */
export function esc(tekst) {
  return String(tekst == null ? '' : tekst)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Wysyła jeden e-mail. Nigdy nie rzuca wyjątku — zwraca true/false, bo
 * nieudany mail nie może cofnąć już zapisanej rezerwacji.
 *
 * mail = { do, doNazwa?, odpowiedzDo?, temat, html, tekst }
 */
export async function wyslijEmail(env, mail) {
  const nadawca = emailInstruktora(env);

  if (!env || !env.BREVO_API_KEY) {
    console.log(
      '[e-mail — tryb testowy, brak BREVO_API_KEY]\n' +
        'Do: ' + mail.do + '\nTemat: ' + mail.temat + '\n\n' + mail.tekst
    );
    return false;
  }

  const cialo = {
    sender: { name: NADAWCA_NAZWA, email: nadawca },
    to: [{ email: mail.do, name: mail.doNazwa || mail.do }],
    subject: mail.temat,
    htmlContent: mail.html,
    textContent: mail.tekst,
  };
  if (mail.odpowiedzDo) cialo.replyTo = { email: mail.odpowiedzDo };

  try {
    const odp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(cialo),
    });
    if (!odp.ok) {
      console.error('Brevo odrzuciło e-mail:', odp.status, await odp.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('Błąd połączenia z Brevo:', err);
    return false;
  }
}
