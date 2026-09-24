/** Wersje dokumentów prawnych. */

/**
 * Data wejścia w życie aktualnego Regulaminu i Polityki prywatności.
 *
 * Wersję zapisujemy po stronie serwera, a nie przyjmujemy jej z formularza —
 * przeglądarka mogłaby przysłać dowolną wartość, a to właśnie ten zapis ma
 * później dowodzić, na jaką treść klient się zgodził.
 *
 * Przy każdej zmianie treści regulaminu trzeba zmienić tę stałą ORAZ daty
 * widoczne w static/regulamin.html i static/polityka-prywatnosci.html.
 */
export const WERSJA_REGULAMINU = '2026-09-24';
