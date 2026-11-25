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
  const q = String(fraza || '').trim().slice(0, 60).toLocaleLowerCase('pl');
  if (q.length < 2) return [];
  const cyfry = q.replace(/\D/g, '');
  // Porównujemy w JS, nie przez LIKE: SQLite nie zna polskich wielkich liter,
  // więc "łuk" nie znalazłoby "Łukasz". Rezerwacji jest najwyżej kilkaset
  // (dane kasują się po 180 dniach), więc to tanie.
  const { results } = await db
    .prepare(
      `SELECT imie, telefon, email, jezyk, data FROM rezerwacje
       WHERE status IN ('${PRAWDZIWE.join("', '")}')
       ORDER BY data DESC LIMIT 3000`
    )
    .all();
  const pasuje = (r) =>
    String(r.imie || '').toLocaleLowerCase('pl').includes(q) ||
    String(r.email || '').toLocaleLowerCase('pl').includes(q) ||
    (cyfry.length >= 3 && String(r.telefon || '').replace(/\D/g, '').includes(cyfry));

  const osoby = [];
  for (const r of results.filter(pasuje)) {
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

/* ------------------------------------------------------------------ */
/* Konta kursantów w panelu (zakładka "Kursanci")                       */
/* ------------------------------------------------------------------ */

/**
 * Zakładka "Kursanci": konta ORAZ osoby bez konta z rezerwacji (np. wpisane
 * przez instruktora w panelu), o ile mają telefon albo e-mail. Osoba bez
 * konta, której telefon lub e-mail pasuje do konta, nie pojawia się osobno.
 * Fraza szuka w imieniu, e-mailu i telefonie.
 */
export async function listaKont(db, fraza = '') {
  const { results: konta } = await db
    .prepare(
      `SELECT u.id, u.email, u.imie, u.telefon, u.jezyk, u.zablokowany, u.utworzono_o, u.ostatnio_o,
              (SELECT COUNT(*) FROM rezerwacje r WHERE r.uzytkownik_id = u.id AND r.status IN ('${PRAWDZIWE.join("', '")}')) AS jazd,
              (SELECT MAX(r.data) FROM rezerwacje r WHERE r.uzytkownik_id = u.id) AS ostatnia
       FROM uzytkownicy u ORDER BY COALESCE(u.ostatnio_o, u.utworzono_o) DESC LIMIT 1000`
    )
    .all();
  const lista = [...konta, ...(await osobyBezKonta(db, konta))].sort((a, b) => {
    const ka = a.ostatnia || String(a.ostatnio_o || a.utworzono_o || '').slice(0, 10);
    const kb = b.ostatnia || String(b.ostatnio_o || b.utworzono_o || '').slice(0, 10);
    return ka < kb ? 1 : ka > kb ? -1 : 0;
  });
  const q = String(fraza || '').trim().toLocaleLowerCase('pl');
  if (q.length < 2) return lista;
  const cyfry = q.replace(/\D/g, '');
  return lista.filter(
    (u) =>
      String(u.imie || '').toLocaleLowerCase('pl').includes(q) ||
      String(u.email || '').toLowerCase().includes(q) ||
      (cyfry.length >= 3 && String(u.telefon || '').replace(/\D/g, '').includes(cyfry))
  );
}

/** Klucz osoby bez konta w panelu: "tel:600100200" albo "mail:jan@x.pl". */
function kluczTekst({ tel, mail }) {
  return tel ? 'tel:' + tel : 'mail:' + mail;
}

/**
 * Osoby bez konta z rezerwacji (bez uzytkownik_id), pogrupowane po telefonie
 * albo e-mailu jak w podpowiedziach. Rezerwacje bez żadnego kontaktu to wpisy
 * tylko dla instruktora — nie tworzą kursanta.
 */
async function osobyBezKonta(db, konta) {
  const { results } = await db
    .prepare(
      `SELECT imie, telefon, email, jezyk, data, status FROM rezerwacje
       WHERE uzytkownik_id IS NULL AND status IN ('${PRAWDZIWE.join("', '")}')
       ORDER BY data DESC LIMIT 3000`
    )
    .all();
  const telKont = new Set(konta.map((u) => kluczeOsoby(u).tel).filter(Boolean));
  const mailKont = new Set(konta.map((u) => kluczeOsoby(u).mail).filter(Boolean));
  const osoby = [];
  for (const r of results) {
    const { tel, mail } = kluczeOsoby(r);
    if (!tel && !mail) continue;
    if ((tel && telKont.has(tel)) || (mail && mailKont.has(mail))) continue;
    let o = osoby.find((x) => (tel && x._tel === tel) || (mail && x._mail === mail));
    if (!o) {
      o = { bez_konta: true, imie: r.imie, telefon: r.telefon, email: r.email, jezyk: r.jezyk, ostatnia: r.data, jazd: 0, _tel: tel, _mail: mail };
      osoby.push(o);
    }
    o.jazd++;
    if (!o._tel && tel) Object.assign(o, { _tel: tel, telefon: r.telefon });
    if (!o._mail && mail) Object.assign(o, { _mail: mail, email: r.email });
  }
  return osoby.map(({ _tel, _mail, ...o }) => ({ ...o, klucz: kluczTekst({ tel: _tel, mail: _mail }) }));
}

/** Osoba bez konta z historią jazd — po kluczu z listy ("tel:…" albo "mail:…"). */
export async function osobaZHistoria(db, klucz) {
  const m = /^(tel|mail):(.+)$/.exec(String(klucz || ''));
  if (!m) return null;
  const { results } = await db
    .prepare(
      `SELECT id, data, start_min, koniec_min, miejsce, imie, telefon, email, jezyk, status, kod_rezerwacji, zadatek_otrzymany_o
       FROM rezerwacje WHERE uzytkownik_id IS NULL ORDER BY data DESC, start_min DESC LIMIT 3000`
    )
    .all();
  // Najpierw rezerwacje z tym kluczem, potem dołączamy te z drugim kontaktem tej osoby
  const tel = new Set(m[1] === 'tel' ? [m[2]] : []);
  const mail = new Set(m[1] === 'mail' ? [m[2].toLowerCase()] : []);
  const pasuje = (r) => {
    const k = kluczeOsoby(r);
    return (k.tel && tel.has(k.tel)) || (k.mail && mail.has(k.mail));
  };
  for (const r of results.filter(pasuje)) {
    const k = kluczeOsoby(r);
    if (k.tel) tel.add(k.tel);
    if (k.mail) mail.add(k.mail);
  }
  const rezerwacje = results.filter(pasuje);
  if (!rezerwacje.length) return null;
  const najnowsza = rezerwacje[0];
  return {
    bez_konta: true,
    klucz,
    imie: najnowsza.imie,
    telefon: (rezerwacje.find((r) => r.telefon) || {}).telefon || '',
    email: (rezerwacje.find((r) => r.email) || {}).email || '',
    jezyk: najnowsza.jezyk,
    rezerwacje: rezerwacje.map(({ telefon, email, jezyk, ...r }) => r),
  };
}

/** Konto z historią jazd (do okna szczegółów w panelu). */
export async function kontoZHistoria(db, id) {
  const u = await db.prepare('SELECT * FROM uzytkownicy WHERE id = ?').bind(id).first();
  if (!u) return null;
  const { results } = await db
    .prepare(
      `SELECT id, data, start_min, koniec_min, miejsce, imie, status, kod_rezerwacji, zadatek_otrzymany_o
       FROM rezerwacje WHERE uzytkownik_id = ? ORDER BY data DESC, start_min DESC`
    )
    .bind(id)
    .all();
  return { ...u, rezerwacje: results };
}

/** Blokada konta: zablokowany kursant nie zaloguje się, jego sesje znikają od razu. */
export async function zablokujKonto(db, id, zablokowany) {
  await db.batch([
    db.prepare('UPDATE uzytkownicy SET zablokowany = ? WHERE id = ?').bind(zablokowany ? 1 : 0, id),
    ...(zablokowany ? [db.prepare('DELETE FROM sesje WHERE uzytkownik_id = ?').bind(id)] : []),
  ]);
}
