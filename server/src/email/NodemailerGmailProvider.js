import nodemailer from 'nodemailer';
import { EmailProvider } from './EmailProvider.js';

function formatMoney(grosz) {
  return `${(grosz / 100).toFixed(2)} zł`;
}

function bookingConfirmationHtml(b) {
  const endHour = b.start_hour + b.duration_hours;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2023;">
      <h2 style="color:#1b1d21;">Rezerwacja potwierdzona</h2>
      <p>Cześć ${b.client_name},</p>
      <p>Twoja jazda doszkalająca została zarezerwowana i opłacona.</p>
      <table style="width:100%; border-collapse:collapse; margin:16px 0;">
        <tr><td style="padding:4px 0; color:#55585f;">Kod rezerwacji</td><td style="padding:4px 0; font-weight:bold;">${b.code}</td></tr>
        <tr><td style="padding:4px 0; color:#55585f;">Data</td><td style="padding:4px 0;">${b.date}</td></tr>
        <tr><td style="padding:4px 0; color:#55585f;">Godzina</td><td style="padding:4px 0;">${b.start_hour}:00–${endHour}:00</td></tr>
        <tr><td style="padding:4px 0; color:#55585f;">Zapłacono</td><td style="padding:4px 0;">${formatMoney(b.amount_grosz)}</td></tr>
      </table>
      <p>Ten e-mail jest Twoim dowodem rezerwacji i płatności — w razie pytań podaj kod rezerwacji.</p>
      <p>Do zobaczenia na jeździe!</p>
    </div>
  `;
}

function adminNotificationHtml(b) {
  const endHour = b.start_hour + b.duration_hours;
  return `
    <div style="font-family: Arial, sans-serif; color: #1f2023;">
      <h2>Nowa opłacona rezerwacja</h2>
      <p><strong>${b.client_name}</strong> — ${b.date}, ${b.start_hour}:00–${endHour}:00 (${b.duration_hours}h)</p>
      <p>Kwota: ${formatMoney(b.amount_grosz)}</p>
      <p>Telefon: ${b.client_phone}</p>
      <p>E-mail: ${b.client_email}</p>
      <p>Kod rezerwacji: ${b.code}</p>
    </div>
  `;
}

export class NodemailerGmailProvider extends EmailProvider {
  constructor() {
    super();
    this._transporter = null;
  }

  // Transporter tworzymy leniwie (dopiero przy pierwszej wysyłce), nie w
  // konstruktorze — w konstruktorze process.env.GMAIL_* mogłoby jeszcze nie
  // być wczytane z .env, w zależności od kolejności importów. Przy pierwszym
  // realnym użyciu (obsługa requestu) .env jest już na pewno wczytane.
  _getTransporter() {
    if (!this._transporter) {
      const user = process.env.GMAIL_USER;
      const pass = process.env.GMAIL_APP_PASSWORD;
      if (!user || !pass) {
        throw new Error(
          'Brak GMAIL_USER / GMAIL_APP_PASSWORD w .env — e-maile nie mogą być wysłane. Zobacz README.'
        );
      }
      this._transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      });
    }
    return this._transporter;
  }

  async sendBookingConfirmation(booking) {
    await this._getTransporter().sendMail({
      from: `"Jazdy Doszkalające" <${process.env.GMAIL_USER}>`,
      to: booking.client_email,
      subject: `Potwierdzenie rezerwacji ${booking.code} — Jazdy Doszkalające`,
      html: bookingConfirmationHtml(booking),
    });
  }

  async sendAdminNotification(booking) {
    await this._getTransporter().sendMail({
      from: `"Jazdy Doszkalające — powiadomienia" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      subject: `Nowa opłacona rezerwacja: ${booking.client_name} (${booking.date})`,
      html: adminNotificationHtml(booking),
    });
  }
}
