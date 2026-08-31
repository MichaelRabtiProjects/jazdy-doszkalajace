import { NodemailerGmailProvider } from './NodemailerGmailProvider.js';

// Ten sam wzorzec co server/src/payments/index.js — wybór dostawcy przez
// zmienną środowiskową, żeby zmiana (np. na Resend po założeniu własnej
// domeny) była podmianą w .env, a nie w kodzie.
const providers = {
  gmail: new NodemailerGmailProvider(),
};

export function getEmailProvider() {
  const name = process.env.EMAIL_PROVIDER || 'gmail';
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Nieznany dostawca e-mail: "${name}". Dostępne: ${Object.keys(providers).join(', ')}.`);
  }
  return provider;
}
