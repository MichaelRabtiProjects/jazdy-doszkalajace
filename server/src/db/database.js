import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// node:sqlite to moduł wbudowany w samego Node.js (od wersji 22+) — w
// przeciwieństwie do popularnej biblioteki "better-sqlite3" nie wymaga
// kompilowania kodu natywnego (C++) przy instalacji. Na tym komputerze nie
// było zainstalowanego Pythona/Visual Studio Build Tools, więc better-sqlite3
// nie dało się zbudować — node:sqlite omija ten problem całkowicie, bo
// przychodzi gotowy razem z Node.js.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', 'data', 'app.db');

const db = new DatabaseSync(dbPath);

// WAL (Write-Ahead Log) pozwala odczytom działać równolegle z zapisem,
// zamiast blokować się nawzajem — przydatne, bo nasz serwer obsługuje wiele
// requestów "naraz" (np. ktoś czyta grafik, gdy ktoś inny właśnie rezerwuje).
db.exec('PRAGMA journal_mode = WAL;');

// SQLite domyślnie NIE pilnuje kluczy obcych (foreign key) — trzeba to włączyć
// jawnie, inaczej booking_hours mógłby wskazywać na nieistniejący booking_id.
db.exec('PRAGMA foreign_keys = ON;');

// SQLite pozwala na jeden zapis naraz. Jeśli inny proces (np. skrypt
// administracyjny odpalony ręcznie) akurat coś zapisuje, domyślnie
// dostalibyśmy od razu błąd "database is locked". busy_timeout każe
// zamiast tego poczekać do 5 sekund, aż zwolni się blokada.
db.exec('PRAGMA busy_timeout = 5000;');

export default db;

/**
 * Uruchamia funkcję `fn` w transakcji: albo wszystkie jej zapisy do bazy się
 * powiodą razem, albo żaden. Potrzebne np. przy rezerwacji — "sprawdź, czy
 * termin wolny" i "zapisz rezerwację" muszą zajść jako jedna, niepodzielna
 * operacja, żeby dwie równoległe rezerwacje na ten sam termin się nie
 * "przeplotły".
 */
export function runInTransaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
