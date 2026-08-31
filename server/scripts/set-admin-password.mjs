// Ustawia (lub zmienia) hasło do panelu admina.
//
// Użycie:
//   node scripts/set-admin-password.mjs           -> wygeneruje losowe hasło
//   node scripts/set-admin-password.mjs MojeHaslo -> ustawi podane hasło
//
// W pliku .env NIGDY nie zapisujemy hasła wprost, tylko jego hash (odcisk).
// Odcisku nie da się odwrócić z powrotem na hasło — dlatego jeśli
// wygenerujemy hasło losowo, trzeba je zapisać w tym momencie, bo potem
// nikt (łącznie ze mną) nie jest w stanie go odczytać, tylko zresetować.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function generatePassword(length = 16) {
  // Zestaw znaków bez łatwych do pomylenia par (0/O, l/1/I) — jak się je
  // gdzieś ręcznie przepisuje, mniej pomyłek.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function loadExistingEnv() {
  if (!fs.existsSync(envPath)) return new Map();
  const content = fs.readFileSync(envPath, 'utf-8');
  const map = new Map();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    map.set(trimmed.slice(0, idx), trimmed.slice(idx + 1));
  }
  return map;
}

const providedPassword = process.argv[2];
const password = providedPassword || generatePassword();

const env = loadExistingEnv();
env.set('ADMIN_PASSWORD_HASH', hashPassword(password));

// SESSION_SECRET zostaje taki sam, jeśli już istnieje — zmiana hasła nie
// powinna wylogowywać nikogo, kto akurat ma otwarty panel w przeglądarce.
if (!env.has('SESSION_SECRET')) {
  env.set('SESSION_SECRET', crypto.randomBytes(32).toString('hex'));
}

const serialized = Array.from(env.entries())
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');

fs.writeFileSync(envPath, serialized + '\n');

if (providedPassword) {
  console.log('Hasło do panelu admina zostało zaktualizowane.');
} else {
  console.log('Wygenerowano nowe hasło do panelu admina — zapisz je teraz, nie da się go później odczytać:');
  console.log('');
  console.log(`  ${password}`);
  console.log('');
}
