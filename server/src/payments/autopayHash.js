import crypto from 'node:crypto';

// Sposób liczenia hasha przez Autopay (na podstawie ich dokumentacji:
// https://developers.autopay.pl/online/dokumentacja):
// sklej WARTOŚCI pól (bez nazw pól), w ustalonej kolejności, oddzielone
// znakiem "|", dopisz na końcu wspólny klucz (SharedKey), policz SHA256
// z całości. Pola o pustej/nieobecnej wartości pomija się (bez pustego
// miejsca w konkatenacji).
export function computeAutopayHash(parts, sharedKey) {
  const nonEmpty = parts.filter((p) => p !== undefined && p !== null && p !== '');
  const base = [...nonEmpty, sharedKey].join('|');
  return crypto.createHash('sha256').update(base, 'utf8').digest('hex');
}
