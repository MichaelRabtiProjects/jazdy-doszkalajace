import { PaymentProvider } from './PaymentProvider.js';
import { computeAutopayHash } from './autopayHash.js';

// Integracja z prawdziwą bramką Autopay (dawniej BlueMedia), zbudowana na
// podstawie ich publicznej dokumentacji:
// https://developers.autopay.pl/online/dokumentacja
//
// WAŻNE — TEGO KODU NIE DAŁO SIĘ JESZCZE PRZETESTOWAĆ z prawdziwym kontem
// Autopay (nie mieliśmy go w trakcie pisania). Zanim ustawisz
// PAYMENT_PROVIDER=autopay na produkcji, KONIECZNIE zrób co najmniej jedną
// transakcję testową w środowisku sandbox (https://testpay.autopay.eu) —
// jedyne, czego nie da się w 100% zweryfikować bez realnego wywołania ich
// systemu, to czy hash jest liczony dokładnie tak, jak oni oczekują.
const GATEWAY_URL = {
  production: 'https://pay.autopay.eu',
  test: 'https://testpay.autopay.eu',
};

export class AutopayProvider extends PaymentProvider {
  async createPayment({ code, amountGrosz, description, email }) {
    const serviceId = process.env.AUTOPAY_SERVICE_ID;
    const sharedKey = process.env.AUTOPAY_SHARED_KEY;

    if (!serviceId || !sharedKey) {
      throw new Error('Brak AUTOPAY_SERVICE_ID / AUTOPAY_SHARED_KEY w .env.');
    }

    const isProduction = process.env.AUTOPAY_ENV === 'production';
    const amount = (amountGrosz / 100).toFixed(2);

    // Kolejność kluczy w tym obiekcie MA znaczenie: hash liczymy niżej z
    // Object.values() w tej samej kolejności, w jakiej wpisujemy je tutaj —
    // Autopay wymaga po swojej stronie dokładnie tej samej kolejności.
    const fields = {
      ServiceID: serviceId,
      OrderID: code, // nasz kod rezerwacji — unikalny, dokładnie do tego służy to pole
      Amount: amount,
      Description: description,
      Currency: 'PLN',
      CustomerEmail: email,
    };

    fields.Hash = computeAutopayHash(Object.values(fields), sharedKey);

    return {
      method: 'POST',
      url: isProduction ? GATEWAY_URL.production : GATEWAY_URL.test,
      fields,
      providerPaymentId: code,
    };
  }
}
