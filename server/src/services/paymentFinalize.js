import db, { runInTransaction } from '../db/database.js';

/**
 * Zmienia rezerwację na "opłaconą". To jedyne miejsce w całej aplikacji,
 * które to robi — wywołuje je WYŁĄCZNIE endpoint webhooka (routes/payments.js),
 * nigdy strona, na którą wraca przeglądarka klienta po płatności. Przeglądarka
 * mogłaby skłamać (albo po prostu nigdy nie wrócić, bo np. klient zamknął
 * kartę tuż po zapłaceniu) — webhook przychodzi z serwera dostawcy płatności,
 * niezależnie od tego, co robi przeglądarka klienta.
 */
export function finalizeBookingPayment(code, { provider, providerPaymentId }) {
  return runInTransaction(() => {
    const booking = db.prepare('SELECT * FROM bookings WHERE code = ?').get(code);

    if (!booking) {
      const err = new Error(`Nie znaleziono rezerwacji o kodzie "${code}".`);
      err.code = 'BOOKING_NOT_FOUND';
      throw err;
    }

    if (booking.status === 'paid') {
      // Dostawcy płatności zwykle gwarantują dostarczenie webhooka
      // "co najmniej raz" — ten sam webhook może przyjść dwa razy (np. gdy
      // nasza odpowiedź nie dotarła do dostawcy za pierwszym razem, mimo że
      // faktycznie zdążyliśmy przetworzyć płatność). Druga wiadomość o TEJ
      // SAMEJ płatności nie może nic zepsuć — stąd "cichy sukces" zamiast
      // błędu, gdy rezerwacja jest już opłacona. To jest właśnie
      // "idempotencja", o którą chodzi przy projektowaniu webhooków.
      // justPaid: false mówi wywołującemu kodowi "nic nowego się nie stało,
      // NIE wysyłaj maila po raz drugi".
      return { booking, justPaid: false };
    }

    if (booking.status !== 'pending_payment') {
      const err = new Error(`Rezerwacja ma status "${booking.status}" — nie można jej już opłacić.`);
      err.code = 'BOOKING_NOT_PAYABLE';
      throw err;
    }

    if (new Date(booking.hold_expires_at).getTime() < Date.now()) {
      const err = new Error('Czas na dokończenie płatności minął — termin mógł już zostać zwolniony.');
      err.code = 'HOLD_EXPIRED';
      throw err;
    }

    db.prepare('UPDATE bookings SET status = ?, payment_provider = ?, payment_reference = ? WHERE id = ?').run(
      'paid',
      provider,
      providerPaymentId,
      booking.id
    );

    return {
      booking: { ...booking, status: 'paid', payment_provider: provider, payment_reference: providerPaymentId },
      justPaid: true,
    };
  });
}
