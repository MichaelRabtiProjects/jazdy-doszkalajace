import { MockProvider } from './MockProvider.js';
import { AutopayProvider } from './AutopayProvider.js';

// Wybór dostawcy przez zmienną środowiskową PAYMENT_PROVIDER. Domyślnie
// zostajemy przy 'mock', dopóki nie ustawisz PAYMENT_PROVIDER=autopay
// (i nie uzupełnisz AUTOPAY_SERVICE_ID/AUTOPAY_SHARED_KEY) w .env — to
// świadome zabezpieczenie, żeby nikt przypadkiem nie włączył prawdziwych
// płatności bez przetestowania.
const providers = {
  mock: new MockProvider(),
  autopay: new AutopayProvider(),
};

export function getPaymentProvider() {
  const name = process.env.PAYMENT_PROVIDER || 'mock';
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Nieznany dostawca płatności: "${name}". Dostępne: ${Object.keys(providers).join(', ')}.`);
  }
  return provider;
}
