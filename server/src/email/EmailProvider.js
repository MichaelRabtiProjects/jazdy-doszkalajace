// Kontrakt dla wysyłki e-maili — ten sam pomysł co PaymentProvider dla
// płatności. Dziś jedyna implementacja to NodemailerGmailProvider (Twoje
// własne konto Gmail), docelowo można podłączyć np. Resend, gdy będzie
// własna domena — reszta kodu (routes/payments.js) o tym nie musi wiedzieć.
export class EmailProvider {
  /** @param {object} booking */
  async sendBookingConfirmation(booking) {
    throw new Error('sendBookingConfirmation() nie zostało zaimplementowane.');
  }

  /** @param {object} booking */
  async sendAdminNotification(booking) {
    throw new Error('sendAdminNotification() nie zostało zaimplementowane.');
  }
}
