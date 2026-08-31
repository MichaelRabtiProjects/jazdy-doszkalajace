const params = new URLSearchParams(window.location.search);
const code = params.get('code');
const box = document.getElementById('confirmation-box');

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;
const pollStart = Date.now();

// Dlaczego ta strona ODPYTUJE serwer zamiast po prostu pokazać "dziękujemy":
// sam fakt, że przeglądarka tu trafiła, NIC nie mówi o tym, czy płatność się
// powiodła — ktoś mógł wpisać ten adres ręcznie, mógł wrócić po przerwanej
// płatności, mogła się nie udać. Dopiero webhook (patrz
// server/src/routes/payments.js) ustawia rezerwację na "paid" po stronie
// serwera; ta strona jedynie SPRAWDZA, czy to już się stało — ewentualnie
// czekając chwilę, bo przy prawdziwej bramce webhook bywa dostarczany z
// niewielkim opóźnieniem względem powrotu klienta na stronę.
async function checkStatus() {
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
    box.classList.add('booking-summary-success');
    const endHour = data.startHour + data.durationHours;
    box.innerHTML = `
      <h1>Dziękujemy! Rezerwacja opłacona</h1>
      <p>Kod rezerwacji: <strong>${data.code}</strong></p>
      <p>Termin: <strong>${data.date}, ${data.startHour}:00–${endHour}:00</strong></p>
      <p>Zapłacono: <strong>${(data.amountGrosz / 100).toFixed(2)} zł</strong></p>
      <p class="booking-payment-stub">
        Ten kod to Twój dowód rezerwacji i płatności. Potwierdzenie mailem wyślemy
        automatycznie w kolejnym etapie budowy strony (Etap 7) — na razie zapisz
        sobie kod z tej strony.
      </p>
    `;
    return;
  }

  if (Date.now() - pollStart > POLL_TIMEOUT_MS) {
    box.innerHTML = `
      <p>Płatność jeszcze się nie potwierdziła.</p>
      <p>Kod rezerwacji: <strong>${data.code}</strong></p>
      <p>Jeśli właśnie zapłaciłeś/-aś, odśwież tę stronę za chwilę — potwierdzenie czasem dociera z niewielkim opóźnieniem.</p>
    `;
    return;
  }

  box.innerHTML = '<p>Czekamy na potwierdzenie płatności…</p>';
  setTimeout(checkStatus, POLL_INTERVAL_MS);
}

checkStatus();
