// Express potrafi WYSYŁAĆ ciasteczka (res.cookie) bez dodatkowych bibliotek,
// ale do ODCZYTANIA ciasteczka z przychodzącego zapytania normalnie używa
// się osobnego pakietu "cookie-parser". Nagłówek Cookie to tylko zwykły
// tekst ("klucz=wartość; klucz2=wartość2"), więc żeby nie dokładać kolejnej
// zależności, parsujemy go sami — to dosłownie jedna pętla.
export function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;

  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }

  return cookies;
}
