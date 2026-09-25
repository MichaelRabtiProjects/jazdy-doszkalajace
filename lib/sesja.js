/**
 * Logowanie do panelu administratora — jedno hasło, sesja na 30 dni.
 *
 * Hasło: zmienna ADMIN_HASLO w Cloudflare (typ: Secret). Nigdzie w kodzie.
 *
 * Sesja to ciasteczko "wygasa.podpis", gdzie podpis = HMAC-SHA256 z datą
 * wygaśnięcia, liczony kluczem pochodzącym z hasła. Serwer nie musi niczego
 * pamiętać — wystarczy sprawdzić podpis. Skutek uboczny, zamierzony:
 * zmiana hasła w Cloudflare od razu wylogowuje wszystkie urządzenia.
 *
 * Ciasteczko: HttpOnly (JavaScript strony go nie odczyta), SameSite=Strict
 * (inna strona nie wyśle go w Twoim imieniu), Secure na https.
 */

export const NAZWA_CIASTKA = 'jd_admin';
export const DNI_SESJI = 30;
const MAKS_PROB = 8;
const OKNO_MINUT = 15;

const kodowanie = new TextEncoder();

async function kluczHmac(haslo) {
  return crypto.subtle.importKey(
    'raw',
    kodowanie.encode('jd-admin-sesja:' + haslo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function hmacHex(haslo, tresc) {
  const podpis = await crypto.subtle.sign('HMAC', await kluczHmac(haslo), kodowanie.encode(tresc));
  return Array.from(new Uint8Array(podpis), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Porównanie w stałym czasie — czas odpowiedzi nie zdradza, ile znaków się zgadza. */
function rowne(a, b) {
  if (a.length !== b.length) return false;
  let roznica = 0;
  for (let i = 0; i < a.length; i++) roznica |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return roznica === 0;
}

export async function sprawdzHaslo(env, podane) {
  if (!env.ADMIN_HASLO || typeof podane !== 'string') return false;
  // Porównujemy skróty, a nie same hasła — mają wtedy zawsze równą długość.
  const [a, b] = await Promise.all([
    hmacHex(env.ADMIN_HASLO, 'porownanie:' + podane),
    hmacHex(env.ADMIN_HASLO, 'porownanie:' + env.ADMIN_HASLO),
  ]);
  return rowne(a, b);
}

export async function nowaSesja(env) {
  const wygasa = Date.now() + DNI_SESJI * 24 * 60 * 60 * 1000;
  return wygasa + '.' + (await hmacHex(env.ADMIN_HASLO, 'sesja:' + wygasa));
}

function odczytajCiastko(request) {
  const naglowek = request.headers.get('Cookie') || '';
  for (const czesc of naglowek.split(';')) {
    const [nazwa, ...reszta] = czesc.trim().split('=');
    if (nazwa === NAZWA_CIASTKA) return reszta.join('=');
  }
  return '';
}

export async function sesjaWazna(request, env) {
  if (!env.ADMIN_HASLO) return false;
  const [wygasa, podpis] = odczytajCiastko(request).split('.');
  if (!wygasa || !podpis || !/^\d+$/.test(wygasa)) return false;
  if (Number(wygasa) < Date.now()) return false;
  return rowne(podpis, await hmacHex(env.ADMIN_HASLO, 'sesja:' + wygasa));
}

function atrybuty(request) {
  const https = new URL(request.url).protocol === 'https:';
  return '; Path=/api/admin; HttpOnly; SameSite=Strict' + (https ? '; Secure' : '');
}

export function ciastkoSesji(request, wartosc) {
  return NAZWA_CIASTKA + '=' + wartosc + atrybuty(request) + '; Max-Age=' + DNI_SESJI * 24 * 60 * 60;
}

export function ciastkoWylogowania(request) {
  return NAZWA_CIASTKA + '=' + atrybuty(request) + '; Max-Age=0';
}

/* ---- Ogranicznik prób logowania ---------------------------------------- */

async function skrotIp(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'lokalnie';
  const skrot = await crypto.subtle.digest('SHA-256', kodowanie.encode('jd-ip:' + ip));
  return Array.from(new Uint8Array(skrot), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function zablokowanyZaProby(db, request) {
  const ip = await skrotIp(request);
  const wiersz = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM logowania_nieudane
       WHERE ip_skrot = ? AND datetime(czas) > datetime('now', '-${OKNO_MINUT} minutes')`
    )
    .bind(ip)
    .first();
  return wiersz.n >= MAKS_PROB;
}

export async function zapiszNieudanaProbe(db, request) {
  await db.prepare('INSERT INTO logowania_nieudane (ip_skrot) VALUES (?)').bind(await skrotIp(request)).run();
}
