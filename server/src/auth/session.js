import crypto from 'node:crypto';

// Nie trzymamy sesji w bazie danych — zamiast tego ciasteczko SAMO niesie
// informację "kiedy wygasa", podpisaną kluczem, który zna tylko nasz
// serwer (SESSION_SECRET z .env). Przeglądarka odsyła to ciasteczko przy
// każdym zapytaniu; serwer sprawdza podpis (czy ciasteczko na pewno
// wystawił on sam, a nie ktoś, kto próbuje je sfałszować) i datę wygaśnięcia.
// To najprostszy możliwy mechanizm logowania, wystarczający dla jednego
// admina — nie trzeba tabeli "sesje" ani czyszczenia jej ze starych wpisów.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 godzin

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('Brak SESSION_SECRET w zmiennych środowiskowych (.env) — uruchom npm run set-admin-password.');
  }
  return secret;
}

export function createSessionCookie() {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ expiresAt })).toString('base64url');
  const signature = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySessionCookie(cookieValue) {
  if (!cookieValue) return false;

  const [payload, signature] = cookieValue.split('.');
  if (!payload || !signature) return false;

  const expectedSignature = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');

  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  try {
    const { expiresAt } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof expiresAt === 'number' && Date.now() < expiresAt;
  } catch {
    return false;
  }
}
