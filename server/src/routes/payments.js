import crypto from 'node:crypto';
import { Router } from 'express';
import db from '../db/database.js';
import { getPaymentProvider } from '../payments/index.js';
import { computeAutopayHash } from '../payments/autopayHash.js';
import { finalizeBookingPayment } from '../services/paymentFinalize.js';
import { getEmailProvider } from '../email/index.js';

const router = Router();

// POST /api/payments/create { code }
// Prosi dostawcę płatności o rozpoczęcie płatności za daną rezerwację i
// zwraca instrukcję, JAK przekierować klienta (patrz komentarz w
// payments/PaymentProvider.js — różni dostawcy wymagają różnego sposobu
// przekierowania).
router.post('/create', async (req, res) => {
  const { code } = req.body || {};
  if (typeof code !== 'string') {
    return res.status(400).json({ error: 'Brak kodu rezerwacji.' });
  }

  const booking = db.prepare('SELECT * FROM bookings WHERE code = ?').get(code);
  if (!booking) return res.status(404).json({ error: 'Nie znaleziono rezerwacji.' });
  if (booking.status === 'paid') return res.status(409).json({ error: 'Ta rezerwacja jest już opłacona.' });
  if (booking.status !== 'pending_payment') {
    return res.status(409).json({ error: 'Tej rezerwacji nie można już opłacić.' });
  }
  if (new Date(booking.hold_expires_at).getTime() < Date.now()) {
    return res.status(410).json({ error: 'Czas na dokończenie tej rezerwacji minął. Zarezerwuj termin ponownie.' });
  }

  try {
    const providerName = process.env.PAYMENT_PROVIDER || 'mock';
    const provider = getPaymentProvider();

    const { method, url, fields, providerPaymentId } = await provider.createPayment({
      code: booking.code,
      amountGrosz: booking.amount_grosz,
      description: `Jazda doszkalająca ${booking.date} ${String(booking.start_hour).padStart(2, '0')}:00`,
      email: booking.client_email,
    });

    db.prepare('UPDATE bookings SET payment_provider = ?, payment_reference = ? WHERE id = ?').run(
      providerName,
      providerPaymentId,
      booking.id
    );

    res.json({ method, url, fields });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Nie udało się zainicjować płatności. Spróbuj ponownie.' });
  }
});

// GET /api/payments/status/:code
// Publiczny odczyt stanu rezerwacji po kodzie — używany przez stronę
// płatności i stronę potwierdzenia, żeby wiedzieć, co pokazać. Celowo NIE
// zwraca telefonu ani e-maila klienta, tylko to, co potrzebne do wyświetlenia
// statusu (kod sam w sobie pełni rolę "hasła" do tej jednej rezerwacji).
router.get('/status/:code', (req, res) => {
  const booking = db
    .prepare(
      `SELECT code, status, date, start_hour, duration_hours, amount_grosz, hold_expires_at
       FROM bookings WHERE code = ?`
    )
    .get(req.params.code);

  if (!booking) return res.status(404).json({ error: 'Nie znaleziono rezerwacji.' });

  res.json({
    code: booking.code,
    status: booking.status,
    date: booking.date,
    startHour: booking.start_hour,
    durationHours: booking.duration_hours,
    amountGrosz: booking.amount_grosz,
    holdExpiresAt: booking.hold_expires_at,
  });
});

// Wysyła maile po sfinalizowanej płatności. Wspólne dla wszystkich
// dostawców — nie wywołuje się, jeśli webhook to duplikat (outcome.justPaid
// === false), i nigdy nie rzuca dalej błędu (brak maila nie może cofnąć
// opłaconej rezerwacji, patrz komentarz w services/paymentFinalize.js).
async function sendConfirmationEmailsIfNeeded(outcome) {
  if (!outcome.justPaid) return;
  try {
    const emailProvider = getEmailProvider();
    await emailProvider.sendBookingConfirmation(outcome.booking);
    await emailProvider.sendAdminNotification(outcome.booking);
  } catch (err) {
    console.error('Nie udało się wysłać e-maili po opłaceniu rezerwacji:', err);
  }
}

// POST /api/payments/webhook/mock { code, result }
// W PRAWDZIWEJ integracji (Autopay, patrz /webhook/autopay niżej) ten
// endpoint jest wywoływany przez SERWER bramki płatności i weryfikuje
// podpis dołączony przez dostawcę. Mock nie ma czego weryfikować (to i tak
// tylko nasza własna strona /platnosc-mock.html), ale STRUKTURA jest
// identyczna: osobny endpoint, niezależny od tego, co robi przeglądarka
// klienta, jest jedynym miejscem, które faktycznie zmienia status
// rezerwacji na "opłacona".
router.post('/webhook/mock', async (req, res) => {
  const { code, result } = req.body || {};

  if (typeof code !== 'string' || !['success', 'failed'].includes(result)) {
    return res.status(400).json({ error: 'Nieprawidłowe dane webhooka.' });
  }

  if (result === 'failed') {
    // Nic nie zmieniamy — rezerwacja zostaje "pending_payment" i wygaśnie
    // sama, gdy minie jej 15-minutowa blokada.
    return res.json({ ok: true });
  }

  let outcome;
  try {
    const providerPaymentId = `mock_${crypto.randomBytes(6).toString('hex')}`;
    outcome = finalizeBookingPayment(code, { provider: 'mock', providerPaymentId });
  } catch (err) {
    if (err.code === 'BOOKING_NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'HOLD_EXPIRED') return res.status(410).json({ error: err.message });
    if (err.code === 'BOOKING_NOT_PAYABLE') return res.status(409).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'Błąd serwera przy finalizacji płatności.' });
  }

  await sendConfirmationEmailsIfNeeded(outcome);
  res.json({ ok: true });
});

// --- Autopay ---
//
// Autopay wysyła powiadomienie o transakcji (ITN) jako POST z jednym polem
// "transactions" zawierającym XML zakodowany w Base64. To minimalny,
// "ręczny" parser dopasowany dokładnie do ich stałego formatu — nie ogólny
// parser XML, żeby nie dokładać kolejnej zależności dla jednego, prostego i
// przewidywalnego formatu wiadomości.
function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : null;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// POST /api/payments/webhook/autopay
// Prawdziwy webhook (Autopay nazywa to "ITN" — Instant Transaction
// Notification). Zobacz obszerny komentarz w payments/AutopayProvider.js —
// ten kod nie był jeszcze przetestowany z prawdziwym kontem Autopay.
router.post('/webhook/autopay', async (req, res) => {
  const sharedKey = process.env.AUTOPAY_SHARED_KEY;
  const serviceId = process.env.AUTOPAY_SERVICE_ID;

  if (!sharedKey || !serviceId) {
    console.error('Otrzymano ITN Autopay, ale brak AUTOPAY_SERVICE_ID / AUTOPAY_SHARED_KEY w .env.');
    return res.status(500).send('Konfiguracja serwera niekompletna.');
  }

  const encoded = req.body?.transactions;
  if (typeof encoded !== 'string') {
    return res.status(400).send('Brak danych transakcji.');
  }

  const xml = Buffer.from(encoded, 'base64').toString('utf-8');

  const msgServiceId = extractTag(xml, 'serviceID');
  const orderId = extractTag(xml, 'orderID');
  const remoteId = extractTag(xml, 'remoteID');
  const amount = extractTag(xml, 'amount');
  const currency = extractTag(xml, 'currency');
  const gatewayId = extractTag(xml, 'gatewayID') || '';
  const paymentDate = extractTag(xml, 'paymentDate');
  const paymentStatus = extractTag(xml, 'paymentStatus');
  const paymentStatusDetails = extractTag(xml, 'paymentStatusDetails') || '';
  const receivedHash = extractTag(xml, 'hash');

  const expectedHash = computeAutopayHash(
    [msgServiceId, orderId, remoteId, amount, currency, gatewayId, paymentDate, paymentStatus, paymentStatusDetails],
    sharedKey
  );

  const hashValid =
    typeof receivedHash === 'string' &&
    receivedHash.length === expectedHash.length &&
    crypto.timingSafeEqual(Buffer.from(receivedHash, 'hex'), Buffer.from(expectedHash, 'hex'));

  // "authentic" = czy WIADOMOŚĆ jest wiarygodna (podpis się zgadza i to na
  // pewno nasz serviceID) — to jest niezależne od tego, czy sama płatność
  // się powiodła. confirmation informuje Autopay "zrozumiałem tę
  // wiadomość", nie "płatność OK".
  const authentic = hashValid && msgServiceId === serviceId;
  const confirmation = authentic ? 'CONFIRMED' : 'NOTCONFIRMED';

  if (!authentic) {
    console.error('Odrzucono ITN Autopay: nieprawidłowy hash lub serviceID.', { orderId });
  } else if (paymentStatus === 'SUCCESS') {
    if (orderId && /^[A-Z0-9]{8}$/.test(orderId)) {
      try {
        const outcome = finalizeBookingPayment(orderId, { provider: 'autopay', providerPaymentId: remoteId || '' });
        await sendConfirmationEmailsIfNeeded(outcome);
      } catch (err) {
        // Autopay potwierdza SUCCESS, ale nie udało się sfinalizować
        // rezerwacji (np. wygasła blokada, ktoś inny zajął termin w
        // międzyczasie). To sytuacja wymagająca RĘCZNEJ interwencji — klient
        // zapłacił, ale nie mamy gwarancji terminu. Stąd bardzo wyraźny log.
        console.error(`PILNE: Autopay potwierdził płatność ${orderId}, ale nie udało się sfinalizować rezerwacji:`, err);
      }
    } else {
      console.error('ITN Autopay z nieprawidłowym/nieoczekiwanym orderID:', orderId);
    }
  }
  // paymentStatus FAILURE/PENDING — nic nie robimy, rezerwacja zostaje
  // "pending_payment" i wygaśnie sama wraz z blokadą.

  const confirmationHash = computeAutopayHash([serviceId, orderId || '', confirmation], sharedKey);

  const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<confirmationList>
  <serviceID>${escapeXml(serviceId)}</serviceID>
  <transactionsConfirmations>
    <transactionConfirmed>
      <orderID>${escapeXml(orderId || '')}</orderID>
      <confirmation>${confirmation}</confirmation>
    </transactionConfirmed>
  </transactionsConfirmations>
  <hash>${confirmationHash}</hash>
</confirmationList>`;

  res.set('Content-Type', 'application/xml').status(200).send(responseXml);
});

export default router;
