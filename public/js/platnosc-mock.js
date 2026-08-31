// Ta strona udaje bramkę płatności (Autopay/HotPay) na potrzeby lokalnych
// testów. W prawdziwym wdrożeniu klient trafiałby tu na stronę banku, a
// kliknięcie "zapłacono" wywoływałoby się samo, po realnej płatności, po
// stronie serwera dostawcy — nie z naszego JS w przeglądarce.
const params = new URLSearchParams(window.location.search);
const code = params.get('code');
const box = document.getElementById('payment-box');

async function load() {
  if (!code) {
    box.innerHTML = '<p>Brak kodu rezerwacji w adresie.</p>';
    return;
  }

  const res = await fetch(`/api/payments/status/${encodeURIComponent(code)}`);
  const data = await res.json();

  if (!res.ok) {
    box.innerHTML = `<p>${data.error || 'Nie znaleziono rezerwacji.'}</p>`;
    return;
  }

  if (data.status === 'paid') {
    box.innerHTML = `
      <p>Ta rezerwacja jest już opłacona.</p>
      <p><a href="/rezerwacja-potwierdzona.html?code=${encodeURIComponent(code)}">Zobacz potwierdzenie</a></p>
    `;
    return;
  }

  const msLeft = new Date(data.holdExpiresAt).getTime() - Date.now();
  if (msLeft <= 0) {
    box.innerHTML = `
      <p>Czas na dokończenie tej płatności minął, termin został zwolniony.</p>
      <p><a href="/rezerwacja.html">Wróć do kalendarza i zarezerwuj ponownie</a></p>
    `;
    return;
  }

  box.innerHTML = `
    <h1>To jest testowa strona płatności</h1>
    <p>W realnym wdrożeniu w tym miejscu byłaby strona banku / Autopay / HotPay — tu tylko symulujemy jej działanie.</p>
    <p>Kod rezerwacji: <strong>${data.code}</strong></p>
    <p>Do zapłaty: <strong>${(data.amountGrosz / 100).toFixed(2)} zł</strong></p>
    <p>Pozostały czas na płatność: <strong id="mock-timer"></strong></p>
    <p>
      <button type="button" id="pay-success-btn" class="btn btn-primary">Zapłacono (symulacja)</button>
      <button type="button" id="pay-cancel-btn" class="btn btn-ghost-dark">Anuluj</button>
    </p>
    <p id="mock-error" class="admin-error" hidden></p>
  `;

  startTimer(new Date(data.holdExpiresAt));

  document.getElementById('pay-success-btn').addEventListener('click', () => confirmPayment('success'));
  document.getElementById('pay-cancel-btn').addEventListener('click', () => confirmPayment('failed'));
}

function startTimer(expiresAt) {
  const el = document.getElementById('mock-timer');
  let intervalId;

  function tick() {
    const msLeft = expiresAt.getTime() - Date.now();
    if (msLeft <= 0) {
      el.textContent = 'czas minął';
      clearInterval(intervalId);
      return;
    }
    const m = Math.floor(msLeft / 60000);
    const s = Math.floor((msLeft % 60000) / 1000);
    el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  tick();
  intervalId = setInterval(tick, 1000);
}

async function confirmPayment(result) {
  const errorEl = document.getElementById('mock-error');
  errorEl.hidden = true;

  const res = await fetch('/api/payments/webhook/mock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, result }),
  });
  const data = await res.json();

  if (!res.ok) {
    errorEl.textContent = data.error || 'Błąd płatności.';
    errorEl.hidden = false;
    return;
  }

  if (result === 'success') {
    window.location.href = `/rezerwacja-potwierdzona.html?code=${encodeURIComponent(code)}`;
  } else {
    window.location.href = '/rezerwacja.html';
  }
}

load();
