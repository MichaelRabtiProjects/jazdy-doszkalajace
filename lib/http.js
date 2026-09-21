/** Drobne pomocniki do odpowiedzi HTTP w Pages Functions. */

export function json(dane, status = 200, naglowki = {}) {
  return new Response(JSON.stringify(dane), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Grafik musi być zawsze świeży — inaczej klient zobaczyłby terminy
      // zajęte kilka minut wcześniej przez kogoś innego.
      'Cache-Control': 'no-store',
      ...naglowki,
    },
  });
}

export function blad(komunikat, status = 400, kod = null) {
  return json(kod ? { blad: komunikat, kod } : { blad: komunikat }, status);
}

/**
 * Sprawdza, czy baza D1 jest podpięta. Bez tego bindingu (np. zaraz po
 * utworzeniu projektu) dostalibyśmy mało czytelne "cannot read property of
 * undefined" — lepiej powiedzieć wprost, czego brakuje.
 */
export function wymagajBazy(env) {
  if (!env || !env.DB) {
    throw new Error(
      'Brak bindingu bazy D1 o nazwie "DB". Dodaj go w panelu Cloudflare: Pages → Settings → Functions → D1 database bindings.'
    );
  }
  return env.DB;
}
