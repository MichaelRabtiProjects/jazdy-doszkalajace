/**
 * POST /api/konto/profil  { imie, telefon, jezyk, zgoda_regulamin }
 * Uzupełnienie danych po pierwszym logowaniu albo ich zmiana.
 */

import { kontoZSesji, zapiszProfil, widokKonta, BladKonta } from '../../../lib/konto.js';
import { json, blad, wymagajBazy } from '../../../lib/http.js';

export async function onRequestPost({ request, env }) {
  let dane;
  try {
    dane = await request.json();
  } catch {
    return blad('Nieprawidłowe dane.', 400);
  }
  try {
    const db = wymagajBazy(env);
    const u = await kontoZSesji(db, request);
    if (!u) return blad('Zaloguj się ponownie.', 401, 'BRAK_SESJI');
    const nowy = await zapiszProfil(db, u, dane || {});
    return json({ ok: true, konto: widokKonta(nowy) });
  } catch (err) {
    if (err instanceof BladKonta) return blad(err.message, err.status, err.kod);
    console.error('Błąd /api/konto/profil:', err);
    return blad('Nie udało się zapisać danych.', 500);
  }
}
