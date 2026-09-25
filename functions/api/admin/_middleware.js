/**
 * Strażnik wszystkich adresów /api/admin/* — poza samym logowaniem.
 *
 * Plik o nazwie _middleware.js Cloudflare Pages uruchamia przed każdą
 * funkcją w tym folderze, więc żadna z nich nie może "zapomnieć"
 * sprawdzić sesji.
 */

import { sesjaWazna } from '../../../lib/sesja.js';
import { blad } from '../../../lib/http.js';

export async function onRequest(context) {
  const { request, env, next } = context;
  const sciezka = new URL(request.url).pathname;

  if (sciezka === '/api/admin/login') return next();

  // Zmiany wymagają nagłówka JSON. Obca strona nie wyśle takiego zapytania
  // bez zgody przeglądarki (CORS) — druga warstwa obok SameSite=Strict.
  if (request.method !== 'GET') {
    const typ = request.headers.get('Content-Type') || '';
    if (!typ.includes('application/json')) return blad('Nieprawidłowe zapytanie.', 415);
  }

  if (!(await sesjaWazna(request, env))) {
    return blad('Zaloguj się ponownie.', 401, 'BRAK_SESJI');
  }

  const odp = await next();
  // Panel pokazuje dane osobowe — nie mogą zostać w żadnej pamięci podręcznej.
  const kopia = new Response(odp.body, odp);
  kopia.headers.set('Cache-Control', 'no-store');
  return kopia;
}
