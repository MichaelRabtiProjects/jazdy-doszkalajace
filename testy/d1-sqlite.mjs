/**
 * Atrapa bazy Cloudflare D1 na wbudowanym SQLite z Node.js (node:sqlite),
 * do testów lib/ bez Cloudflare. Obsługuje to, czego używa nasz kod:
 * prepare().bind().all() / .first() / .run() oraz batch().
 *
 * Tworzy bazę w pamięci i wgrywa po kolei wszystkie migrations/*.sql —
 * testy sprawdzają więc kod na dokładnie takiej strukturze jak produkcja.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const KATALOG_MIGRACJI = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

class Zapytanie {
  constructor(sqlite, sql, parametry = []) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.parametry = parametry;
  }
  bind(...parametry) {
    return new Zapytanie(this.sqlite, this.sql, parametry);
  }
  // D1 zwraca obietnice — atrapa też, żeby kolejność await była taka sama.
  async all() {
    return { results: this.sqlite.prepare(this.sql).all(...this.parametry).map((w) => ({ ...w })), success: true };
  }
  async first() {
    const w = this.sqlite.prepare(this.sql).get(...this.parametry);
    return w ? { ...w } : null;
  }
  async run() {
    const wynik = this.sqlite.prepare(this.sql).run(...this.parametry);
    return { success: true, meta: { changes: Number(wynik.changes), last_row_id: Number(wynik.lastInsertRowid) } };
  }
}

export function nowaBaza() {
  const sqlite = new DatabaseSync(':memory:');
  for (const plik of readdirSync(KATALOG_MIGRACJI).filter((p) => p.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(join(KATALOG_MIGRACJI, plik), 'utf8'));
  }
  return {
    sqlite,
    prepare: (sql) => new Zapytanie(sqlite, sql),
    async batch(zapytania) {
      return Promise.all(zapytania.map((z) => z.run()));
    },
  };
}
