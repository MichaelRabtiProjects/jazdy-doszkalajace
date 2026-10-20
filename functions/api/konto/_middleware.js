/**
 * Strażnik wszystkich adresów /api/konto/* (konta kursantów).
 *
 *  - Konta wyłączone (produkcja przed decyzją właściciela) → 404, a przycisk
 *    "Zaloguj się" w menu się nie pokazuje.
 *  - Zmiany (POST) tylko jako JSON z tej samej strony: obca strona nie wyśle
 *    takiego zapytania z ciasteczkiem kursanta (druga warstwa obok SameSite).
 *  - Odpowiedzi zależą od zalogowanej osoby — żadnej pamięci podręcznej.
 */

import { kontaWlaczone } from '../../../lib/konto.js';
import { blad } from '../../../lib/http.js';

export async function onRequest(context) {
  const { request, env, next } = context;
  if (!kontaWlaczone(env)) return blad('Konta są jeszcze wyłączone.', 404, 'KONTA_WYLACZONE');

  if (request.method !== 'GET') {
    const typ = request.headers.get('Content-Type') || '';
    if (!typ.includes('application/json')) return blad('Nieprawidłowe zapytanie.', 415);
    const skad = request.headers.get('Sec-Fetch-Site');
    if (skad && skad !== 'same-origin') return blad('Nieprawidłowe zapytanie.', 403);
  }

  const odp = await next();
  const kopia = new Response(odp.body, odp);
  kopia.headers.set('Cache-Control', 'no-store');
  return kopia;
}
