import crypto from 'node:crypto';
import { PaymentProvider } from './PaymentProvider.js';

// Atrapa płatności do testów lokalnych — zamiast prawdziwej strony banku
// pokazuje naszą własną stronę /platnosc-mock.html z przyciskiem
// "zapłacono". Zwraca method:'GET', bo to zwykłe przekierowanie —
// AutopayProvider (prawdziwa bramka) zwraca method:'POST', bo tego wymaga
// ich system (patrz PaymentProvider.js).
export class MockProvider extends PaymentProvider {
  async createPayment({ code }) {
    const providerPaymentId = `mock_${crypto.randomBytes(8).toString('hex')}`;
    return {
      method: 'GET',
      url: `/platnosc-mock.html?code=${encodeURIComponent(code)}`,
      fields: {},
      providerPaymentId,
    };
  }
}
