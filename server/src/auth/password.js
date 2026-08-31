import crypto from 'node:crypto';

// scrypt (z wbudowanego modułu crypto, więc znowu zero dodatkowych
// zależności) to funkcja specjalnie zaprojektowana do haseł — jest CELOWO
// wolna i zużywa dużo pamięci. Zwykłe sha256 policzyłoby miliardy prób na
// sekundę, gdyby ktoś zdobył plik .env i próbował odgadnąć hasło brute
// force'em; scrypt sprowadza to do garstki prób na sekundę.
const KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;

  const candidate = crypto.scryptSync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, 'hex');

  // Zwykłe porównanie (===) kończy się w chwili napotkania pierwszej różnicy,
  // więc czas odpowiedzi zdradzałby, ile początkowych znaków zgadza się z
  // prawdziwym hasłem ("timing attack"). timingSafeEqual zawsze porównuje
  // wszystkie bajty, więc czas odpowiedzi nic nie zdradza.
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}
