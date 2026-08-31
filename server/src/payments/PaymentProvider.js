// Kontrakt, jaki musi spełniać KAŻDY dostawca płatności (Mock, Autopay,
// kiedyś może HotPay albo Stripe). JavaScript nie ma prawdziwych interfejsów
// jak TypeScript — symulujemy to klasą bazową, której metoda rzuca błąd,
// jeśli podklasa jej nie nadpisze.
export class PaymentProvider {
  /**
   * Rozpoczyna płatność za rezerwację.
   *
   * Zwraca informację, JAK przekierować klienta do dostawcy — bo różni
   * dostawcy tego wymagają inaczej. Atrapa (Mock) po prostu pokazuje naszą
   * własną stronę pod adresem (zwykłe przekierowanie GET). Autopay wymaga
   * wysłania formularza metodą POST bezpośrednio do ich bramki, z
   * konkretnymi polami (m.in. podpisem/hashem) — stąd `method` i `fields`.
   *
   * @param {{ code: string, amountGrosz: number, description: string, email: string }} params
   * @returns {Promise<{ method: 'GET'|'POST', url: string, fields: Record<string,string>, providerPaymentId: string }>}
   */
  async createPayment(params) {
    throw new Error('createPayment() nie zostało zaimplementowane w tym dostawcy płatności.');
  }
}
