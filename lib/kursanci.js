/**
 * Kursanci w panelu — zanim powstaną konta, "kursant" to ta sama osoba
 * w różnych rezerwacjach: rozpoznajemy ją po numerze telefonu (ostatnie
 * 9 cyfr, więc "+48 600 100 200" = "600100200") albo po e-mailu.
 */

/** Statusy, które liczą się jako prawdziwa rezerwacja osoby (bez odrzuconych). */
const PRAWDZIWE = ['wstepna', 'potwierdzona', 'oplacone', 'anulowane'];

export function kluczeOsoby(r) {
  const cyfry = String(r.telefon || '').replace(/\D/g, '');
  const email = String(r.email || '').trim().toLowerCase();
  return { tel: cyfry.length >= 9 ? cyfry.slice(-9) : '', mail: email };
}

/**
 * Id rezerwacji, które są PIERWSZĄ rezerwacją danej osoby (znaczek
 * "Pierwsza rezerwacja" w kalendarzu, jak w Calendesku). Dane starsze niż
 * 180 dni są kasowane, więc "pierwsza" znaczy: pierwsza od pół roku.
 */
export function pierwszeRezerwacje(wszystkie) {
  const posortowane = wszystkie
    .filter((r) => PRAWDZIWE.includes(r.status))
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.start_min - b.start_min || a.id - b.id));
  const znaneTel = new Set();
  const znaneMail = new Set();
  const pierwsze = new Set();
  for (const r of posortowane) {
    const { tel, mail } = kluczeOsoby(r);
    const znana = (tel && znaneTel.has(tel)) || (mail && znaneMail.has(mail));
    if (!znana) pierwsze.add(r.id);
    if (tel) znaneTel.add(tel);
    if (mail) znaneMail.add(mail);
  }
  return pierwsze;
}

export async function wszystkieDoPierwszych(db) {
  const { results } = await db
    .prepare(`SELECT id, data, start_min, telefon, email, status FROM rezerwacje WHERE status IN ('${PRAWDZIWE.join("', '")}')`)
    .all();
  return results;
}

/**
 * Wyszukiwanie kursanta do formularza "Nowa rezerwacja" (pole "Z kim
 * odbędzie się spotkanie?"): po imieniu, nazwisku, telefonie albo e-mailu.
 * Zwraca najwyżej 8 osób, od ostatnio jeżdżących.
 */
export async function szukajKursantow(db, fraza) {
  const q = String(fraza || '').trim().slice(0, 60);
  if (q.length < 2) return [];
  const wzor = '%' + q.replace(/[\\%_]/g, (z) => '\\' + z) + '%';
  const cyfry = q.replace(/\D/g, '');
  const { results } = await db
    .prepare(
      `SELECT imie, telefon, email, jezyk, data FROM rezerwacje
       WHERE status IN ('${PRAWDZIWE.join("', '")}')
         AND (imie LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\'
              OR (? != '' AND replace(replace(replace(telefon, ' ', ''), '-', ''), '+', '') LIKE ?))
       ORDER BY data DESC LIMIT 200`
    )
    .bind(wzor, wzor, cyfry, '%' + cyfry + '%')
    .all();

  const osoby = [];
  for (const r of results) {
    const { tel, mail } = kluczeOsoby(r);
    let o = osoby.find((x) => (tel && x._tel === tel) || (mail && x._mail === mail));
    if (!o) {
      o = { imie: r.imie, telefon: r.telefon, email: r.email, jezyk: r.jezyk, ostatnia: r.data, liczba: 0, _tel: tel, _mail: mail };
      osoby.push(o);
    }
    o.liczba++;
    if (!o._mail && mail) {
      o._mail = mail;
      o.email = r.email;
    }
  }
  return osoby.slice(0, 8).map(({ _tel, _mail, ...o }) => o);
}
