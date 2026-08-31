import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './database.js';

// Ten skrypt to nasz własny, bardzo prosty "migration runner":
// 1. Pilnuje tabeli schema_migrations — listy nazw plików, które już
//    zostały wykonane na TEJ konkretnej bazie danych.
// 2. Przegląda folder migrations/, sortuje pliki po nazwie (dlatego
//    numerujemy je 0001_, 0002_, ...), i wykonuje tylko te, których nie
//    ma jeszcze na liście.
// Dzięki temu można uruchamiać "npm run migrate" wielokrotnie i bezpiecznie
// — już zastosowane migracje po prostu zostaną pominięte. To samo narzędzie
// posłuży za pół roku, gdy dojdzie kolejna migracja np. 0002_dodaj_cos.sql.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const applied = new Set(
  db.prepare('SELECT filename FROM schema_migrations').all().map((row) => row.filename)
);

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

for (const file of files) {
  if (applied.has(file)) {
    console.log(`Pominięto (już zastosowana): ${file}`);
    continue;
  }

  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

  db.exec('BEGIN');
  try {
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(file);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  console.log(`Zastosowano: ${file}`);
}

console.log('Migracje zakończone.');
