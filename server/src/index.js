import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import availabilityRouter from './routes/availability.js';
import adminRouter from './routes/admin.js';
import bookingsRouter from './routes/bookings.js';
import paymentsRouter from './routes/payments.js';
import { startExpiredHoldsJob } from './jobs/releaseExpiredHolds.js';

// W module ES (bo mamy "type": "module" w package.json) nie ma gotowego
// __dirname jak w starym Node.js — odtwarzamy go z adresu bieżącego pliku.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Wczytuje plik .env (hasło admina, sekret sesji, port) do process.env.
// Musi się wykonać zanim jakikolwiek request trafi do tras logowania —
// dlatego jest tu, przed app.listen(). Ciche pominięcie błędu: przy
// pierwszym uruchomieniu (przed npm run set-admin-password) pliku .env
// jeszcze nie ma, i to jest OK, panel admina po prostu nie zadziała.
try {
  process.loadEnvFile();
} catch {
  console.warn('Brak pliku .env — panel admina nie będzie działał, dopóki nie uruchomisz: npm run set-admin-password');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Pozwala Expressowi odczytać JSON z ciała requestu (np. POST z danymi
// formularza rezerwacji) i wystawić go jako req.body.
app.use(express.json());

// Autopay wysyła powiadomienia (ITN) jako klasyczny formularz
// (Content-Type: application/x-www-form-urlencoded), nie JSON — bez tego
// req.body byłoby puste dla tamtego requestu.
app.use(express.urlencoded({ extended: true }));

app.use('/api/availability', availabilityRouter);
app.use('/api/admin', adminRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/payments', paymentsRouter);

// Folder "public" jest teraz WEWNĄTRZ "server" (server/public), nie obok
// niego — to ważne przy hostingu typu Railway, gdzie "Root Directory"
// ogranicza wdrożenie do zawartości jednego folderu (server/). Gdyby
// public/ leżał poza nim (jako sąsiad server/), nie trafiłby w ogóle do
// wdrożenia, mimo że lokalnie wszystko działałoby normalnie.
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

app.listen(PORT, () => {
  console.log(`Serwer działa: http://localhost:${PORT}`);
});

startExpiredHoldsJob();
