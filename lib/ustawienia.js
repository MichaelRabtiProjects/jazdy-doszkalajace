/** Odczyt i zapis tabeli `ustawienia` (klucz → wartość, wszystko jako tekst). */

const DOMYSLNE = {
  horyzont_tygodni: '3',
  platnosci_online: 'false',
  kwota_zadatku: '80',
};

/** Wczytuje wszystkie ustawienia jako zwykły obiekt, z wartościami domyślnymi. */
export async function wczytajUstawienia(db) {
  const { results } = await db.prepare('SELECT klucz, wartosc FROM ustawienia').all();
  const mapa = { ...DOMYSLNE };
  for (const wiersz of results) mapa[wiersz.klucz] = wiersz.wartosc;
  return mapa;
}

/**
 * Horyzont w tygodniach — twardo ograniczony do 1-3.
 * Limit 3 tygodni jest wymogiem biznesowym, więc pilnujemy go w kodzie,
 * nawet gdyby ktoś wpisał do bazy co innego.
 */
export function horyzontTygodni(ustawienia) {
  const n = Number.parseInt(ustawienia.horyzont_tygodni, 10);
  if (!Number.isFinite(n)) return 3;
  return Math.min(Math.max(n, 1), 3);
}

/**
 * Twardy wyłącznik płatności online.
 *
 * Kod trybu B (formularz + rezerwacja przez API) został zaparkowany, a nie
 * usunięty — patrz tag `autopay-wersja`. Sama flaga `platnosci_online`
 * w bazie NIE wystarczy, żeby go włączyć: trzeba jeszcze zmienić tę stałą
 * i wdrożyć stronę na nowo.
 *
 * Po co podwójny zamek: flaga w bazie jest edytowalna z panelu, a panel
 * chroni jedno hasło. Gdyby ktoś je zdobył, samo przestawienie flagi
 * otworzyłoby publiczny formularz zbierający imię, telefon i e-mail.
 * Stała w kodzie sprawia, że taka pomyłka nic nie zmienia.
 */
export const PLATNOSCI_ONLINE_DOSTEPNE = false;

export function platnosciOnline(ustawienia) {
  return PLATNOSCI_ONLINE_DOSTEPNE && ustawienia.platnosci_online === 'true';
}

export function kwotaZadatku(ustawienia) {
  const n = Number.parseInt(ustawienia.kwota_zadatku, 10);
  return Number.isFinite(n) && n > 0 ? n : 80;
}

export async function zapiszUstawienie(db, klucz, wartosc) {
  await db
    .prepare(
      `INSERT INTO ustawienia (klucz, wartosc) VALUES (?, ?)
       ON CONFLICT (klucz) DO UPDATE SET wartosc = excluded.wartosc`
    )
    .bind(klucz, String(wartosc))
    .run();
}
