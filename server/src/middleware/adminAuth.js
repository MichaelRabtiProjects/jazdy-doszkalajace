import { parseCookies } from './cookies.js';
import { verifySessionCookie } from '../auth/session.js';

export const ADMIN_COOKIE_NAME = 'admin_session';

// Middleware = funkcja, którą Express uruchamia PRZED właściwym handlerem
// trasy. Tu blokuje dostęp, jeśli w ciasteczku nie ma ważnej, poprawnie
// podpisanej sesji — reszta kodu trasy (np. "usuń rezerwację") w ogóle się
// nie wykona.
export function requireAdmin(req, res, next) {
  const cookies = parseCookies(req);
  if (verifySessionCookie(cookies[ADMIN_COOKIE_NAME])) {
    return next();
  }
  res.status(401).json({ error: 'Wymagane zalogowanie do panelu.' });
}
