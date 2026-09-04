const DAY_LABELS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
const PRICE_PER_HOUR_ZL = 160;

function toISODateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toISODateLocal(date);
}

function formatDayLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return { dayName: DAY_LABELS[date.getDay()], display: `${d}.${String(m).padStart(2, '0')}` };
}

// Zwraca godziny startowe, dla których jest `duration` kolejnych wolnych
// godzin POD RZĄD — np. dla duration=2 godzina 9 nadaje się na start tylko
// jeśli 9 ORAZ 10 są obie wolne.
function findValidStartHours(availableHours, duration) {
  const set = new Set(availableHours);
  return availableHours.filter((h) => {
    for (let i = 0; i < duration; i++) {
      if (!set.has(h + i)) return false;
    }
    return true;
  });
}

const todayStr = toISODateLocal(new Date());

const state = {
  duration: 2,
  weekStart: todayStr,
  days: [],
};

const durationButtons = document.querySelectorAll('.duration-btn');
const calendarGrid = document.getElementById('calendar-grid');
const weekRangeEl = document.getElementById('week-range');
const prevWeekBtn = document.getElementById('prev-week');
const nextWeekBtn = document.getElementById('next-week');
const calendarMessage = document.getElementById('calendar-message');

durationButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.duration = Number(btn.dataset.hours);
    durationButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
    renderCalendar();
  });
});
durationButtons[0].classList.add('is-active');

prevWeekBtn.addEventListener('click', () => {
  state.weekStart = addDaysToDateStr(state.weekStart, -7);
  loadWeek();
});
nextWeekBtn.addEventListener('click', () => {
  state.weekStart = addDaysToDateStr(state.weekStart, 7);
  loadWeek();
});

async function loadWeek() {
  calendarMessage.hidden = true;
  prevWeekBtn.disabled = state.weekStart <= todayStr;

  const res = await fetch(`/api/availability?start=${state.weekStart}&days=7`);
  const data = await res.json();
  state.days = data.days;

  const first = formatDayLabel(state.days[0].date);
  const last = formatDayLabel(state.days[state.days.length - 1].date);
  weekRangeEl.textContent = `${first.display} – ${last.display}`;

  renderCalendar();
}

function renderCalendar() {
  calendarGrid.innerHTML = '';
  const nowHour = new Date().getHours();

  for (const day of state.days) {
    const isToday = day.date === todayStr;
    const isPast = day.date < todayStr;

    const col = document.createElement('div');
    col.className = 'calendar-day' + (isPast ? ' is-past' : '');

    const { dayName, display } = formatDayLabel(day.date);
    const header = document.createElement('div');
    header.className = 'calendar-day-header';
    header.innerHTML = `${dayName}<span class="day-date">${display}</span>`;
    col.appendChild(header);

    let validHours = findValidStartHours(day.availableHours, state.duration);
    if (isToday) {
      // Dzisiaj nie proponujemy godzin, które już minęły.
      validHours = validHours.filter((h) => h > nowHour);
    }

    if (isPast || validHours.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'no-slots';
      empty.textContent = isPast ? '—' : 'Brak terminów';
      col.appendChild(empty);
    } else {
      for (const hour of validHours) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hour-slot';
        btn.textContent = `${hour}:00`;
        btn.addEventListener('click', () => selectSlot(day.date, hour));
        col.appendChild(btn);
      }
    }

    calendarGrid.appendChild(col);
  }
}

// --- Krok 2: formularz danych klienta ---

const stepCalendar = document.getElementById('step-calendar');
const stepForm = document.getElementById('step-form');
const stepConfirmation = document.getElementById('step-confirmation');
const bookingSummary = document.getElementById('booking-summary');
const backToCalendarBtn = document.getElementById('back-to-calendar');
const bookingForm = document.getElementById('booking-form');
const formError = document.getElementById('form-error');

let selected = null;

function selectSlot(date, startHour) {
  selected = { date, start_hour: startHour, duration_hours: state.duration };

  const { dayName, display } = formatDayLabel(date);
  const endHour = startHour + state.duration;
  const price = state.duration * PRICE_PER_HOUR_ZL;

  bookingSummary.innerHTML = `
    <p><strong>${dayName}, ${display}</strong></p>
    <p>${startHour}:00 – ${endHour}:00 (${state.duration}h)</p>
    <p>Do zapłaty: <strong>${price} zł</strong></p>
  `;

  stepCalendar.hidden = true;
  stepForm.hidden = false;
  formError.hidden = true;
}

backToCalendarBtn.addEventListener('click', () => {
  stepForm.hidden = true;
  stepCalendar.hidden = false;
});

bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;

  const payload = {
    ...selected,
    client_name: document.getElementById('client_name').value,
    client_phone: document.getElementById('client_phone').value,
    client_email: document.getElementById('client_email').value,
  };

  const submitBtn = bookingForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      formError.textContent = data.error || 'Nie udało się utworzyć rezerwacji.';
      formError.hidden = false;
      if (res.status === 409) {
        loadWeek(); // termin właśnie zajęty - odśwież widok w tle
      }
      return;
    }

    await goToPayment(data.code);
  } catch {
    formError.textContent = 'Błąd połączenia z serwerem. Spróbuj ponownie.';
    formError.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

// --- Krok 3: rezerwacja utworzona -> inicjujemy płatność i przekierowujemy ---
//
// Rezerwacja w tym momencie ma status "pending_payment" i 15-minutową
// blokadę terminu (patrz backend: POST /api/bookings). Teraz prosimy
// dostawcę płatności o utworzenie płatności i przechodzimy na jego stronę —
// samo utworzenie rezerwacji NIE jest jeszcze dowodem zapłaty.
//
// Dwa sposoby przekierowania, zależnie od dostawcy (patrz
// server/src/payments/PaymentProvider.js): zwykłe przekierowanie GET
// (atrapa) albo wysłanie ukrytego formularza metodą POST bezpośrednio do
// bramki (Autopay tego wymaga — nie da się tego zrobić samym
// window.location.href, bo to zawsze GET).
function submitPostRedirect(url, fields) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = url;

  for (const [name, value] of Object.entries(fields || {})) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

async function goToPayment(code) {
  stepForm.hidden = true;
  stepConfirmation.hidden = false;

  const statusLine = document.getElementById('confirmation-status-line');
  const errorEl = document.getElementById('confirmation-error');

  try {
    const res = await fetch('/api/payments/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();

    if (!res.ok) {
      statusLine.hidden = true;
      errorEl.textContent = data.error || 'Nie udało się rozpocząć płatności.';
      errorEl.hidden = false;
      return;
    }

    if (data.method === 'POST') {
      submitPostRedirect(data.url, data.fields);
    } else {
      window.location.href = data.url;
    }
  } catch {
    statusLine.hidden = true;
    errorEl.textContent = 'Błąd połączenia z serwerem. Spróbuj ponownie.';
    errorEl.hidden = false;
  }
}

loadWeek();
