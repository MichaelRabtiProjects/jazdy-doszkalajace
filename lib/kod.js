/**
 * Kod rezerwacji w formacie JD-DDMM-GG (np. JD-2609-17 = 26.09, start 17:00).
 *
 * Dzięki temu, że na dany termin może istnieć tylko jedna żywa rezerwacja,
 * kod jest naturalnie unikalny. Wyjątek: gdy wcześniejsza rezerwacja na ten
 * sam termin wygasła lub została anulowana, a ktoś rezerwuje go ponownie —
 * wtedy dokładamy licznik (JD-2609-17-2), żeby nie naruszyć UNIQUE w bazie
 * i nie pomylić dwóch różnych rezerwacji w rozmowie z klientem.
 */

export function bazowyKod(data, godzinaStart) {
  const [, miesiac, dzien] = data.split('-');
  const gg = String(godzinaStart).padStart(2, '0');
  return `JD-${dzien}${miesiac}-${gg}`;
}

export async function wygenerujKod(db, data, godzinaStart) {
  const baza = bazowyKod(data, godzinaStart);

  const { results } = await db
    .prepare("SELECT kod_rezerwacji FROM rezerwacje WHERE kod_rezerwacji = ? OR kod_rezerwacji LIKE ? || '-%'")
    .bind(baza, baza)
    .all();

  if (results.length === 0) return baza;

  // Szukamy pierwszego wolnego sufiksu: -2, -3, ...
  const zajete = new Set(results.map((r) => r.kod_rezerwacji));
  for (let i = 2; i < 100; i++) {
    const kandydat = `${baza}-${i}`;
    if (!zajete.has(kandydat)) return kandydat;
  }

  throw new Error('Nie udało się wygenerować unikalnego kodu rezerwacji.');
}
