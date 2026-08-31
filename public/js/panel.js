const DAY_NAMES = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
const STATUS_LABELS = {
  pending_payment: 'Oczekuje na płatność',
  paid: 'Opłacona',
  cancelled: 'Anulowana',
  expired: 'Wygasła',
};

const loginView = document.getElementById('login-view');
const panelView = document.getElementById('panel-view');
const logoutBtn = document.getElementById('logout-btn');

// Wszystkie wywołania API panelu przechodzą przez tę funkcję — jeśli
// serwer kiedykolwiek odpowie 401 (sesja wygasła/nieprawidłowa), od razu
// wracamy do widoku logowania zamiast pokazywać błędy w pustych tabelach.
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });

  if (res.status === 401) {
    showLoginView();
    throw new Error('Wymagane zalogowanie.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Błąd żądania (${res.status}).`);
  }
  return data;
}

function showLoginView() {
  loginView.hidden = false;
  panelView.hidden = true;
  logoutBtn.hidden = true;
}

function showPanelView() {
  loginView.hidden = true;
  panelView.hidden = false;
  logoutBtn.hidden = false;
  loadTemplate();
  loadAdminCalendar();
  loadExceptions();
  loadBookings();
}

async function checkSession() {
  const { loggedIn } = await apiFetch('/api/admin/me');
  if (loggedIn) {
    showPanelView();
  } else {
    showLoginView();
  }
}

// --- Logowanie ---

const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;

  const password = document.getElementById('password').value;

  try {
    await apiFetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    document.getElementById('password').value = '';
    showPanelView();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
  }
});

logoutBtn.addEventListener('click', async () => {
  await apiFetch('/api/admin/logout', { method: 'POST' });
  showLoginView();
});

// --- Szablon tygodniowy ---

const templateTableBody = document.querySelector('#template-table tbody');
const templateForm = document.getElementById('template-form');

async function loadTemplate() {
  const { template } = await apiFetch('/api/admin/weekly-template');
  templateTableBody.innerHTML = '';

  for (const row of template) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${DAY_NAMES[row.day_of_week]}</td>
      <td>${row.start_hour}:00</td>
      <td>${row.end_hour}:00</td>
      <td><button class="delete-btn" data-id="${row.id}">Usuń</button></td>
    `;
    templateTableBody.appendChild(tr);
  }
}

templateTableBody.addEventListener('click', async (e) => {
  if (!e.target.matches('.delete-btn')) return;
  await apiFetch(`/api/admin/weekly-template/${e.target.dataset.id}`, { method: 'DELETE' });
  loadTemplate();
});

templateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiFetch('/api/admin/weekly-template', {
      method: 'POST',
      body: JSON.stringify({
        day_of_week: Number(document.getElementById('template-day').value),
        start_hour: Number(document.getElementById('template-start').value),
        end_hour: Number(document.getElementById('template-end').value),
      }),
    });
    templateForm.reset();
    loadTemplate();
  } catch (err) {
    alert(err.message);
  }
});

// --- Kalendarz — szybkie blokowanie (klik = przełącz godzinę) ---

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

const todayStr = toISODateLocal(new Date());
const adminCalendarState = { weekStart: todayStr, days: [] };

const adminWeekRangeEl = document.getElementById('admin-week-range');
const adminPrevWeekBtn = document.getElementById('admin-prev-week');
const adminNextWeekBtn = document.getElementById('admin-next-week');
const adminCalendarHeader = document.getElementById('admin-calendar-header');
const adminCalendarBody = document.getElementById('admin-calendar-body');

adminPrevWeekBtn.addEventListener('click', () => {
  adminCalendarState.weekStart = addDaysToDateStr(adminCalendarState.weekStart, -7);
  loadAdminCalendar();
});
adminNextWeekBtn.addEventListener('click', () => {
  adminCalendarState.weekStart = addDaysToDateStr(adminCalendarState.weekStart, 7);
  loadAdminCalendar();
});

async function loadAdminCalendar() {
  adminPrevWeekBtn.disabled = adminCalendarState.weekStart <= todayStr;

  const { days } = await apiFetch(`/api/admin/calendar?start=${adminCalendarState.weekStart}&days=7`);
  adminCalendarState.days = days;

  adminWeekRangeEl.textContent = `${days[0].date} – ${days[days.length - 1].date}`;
  renderAdminCalendar();
}

function renderAdminCalendar() {
  const { days } = adminCalendarState;

  adminCalendarHeader.innerHTML = '<th></th>' + days.map((d) => `<th>${DAY_NAMES[new Date(`${d.date}T00:00:00`).getDay()].slice(0, 3)}<br>${d.date.slice(5)}</th>`).join('');

  adminCalendarBody.innerHTML = '';
  for (let hour = 0; hour < 24; hour++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="hour-label">${hour}:00</td>`;

    for (const day of days) {
      const cell = day.hours[hour];
      const td = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `cal-cell cal-${cell.status}`;

      if (cell.status === 'booked') {
        btn.disabled = true;
        btn.title = `${cell.clientName} (${cell.code})`;
      } else {
        btn.title = cell.status === 'available' ? 'Kliknij, żeby zablokować' : 'Kliknij, żeby odblokować';
        btn.addEventListener('click', () => toggleAdminHour(day.date, hour));
      }

      td.appendChild(btn);
      tr.appendChild(td);
    }

    adminCalendarBody.appendChild(tr);
  }
}

async function toggleAdminHour(date, hour) {
  try {
    await apiFetch('/api/admin/calendar/toggle', {
      method: 'POST',
      body: JSON.stringify({ date, hour }),
    });
    await loadAdminCalendar();
    await loadExceptions(); // przełączanie tworzy/usuwa wyjątki, więc odświeżamy też ich listę
  } catch (err) {
    alert(err.message);
  }
}

// --- Wyjątki ---

const exceptionsTableBody = document.querySelector('#exceptions-table tbody');
const exceptionForm = document.getElementById('exception-form');

async function loadExceptions() {
  const { exceptions } = await apiFetch('/api/admin/exceptions');
  exceptionsTableBody.innerHTML = '';

  for (const row of exceptions) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.date}</td>
      <td>${row.start_hour}:00</td>
      <td>${row.end_hour}:00</td>
      <td>${row.kind === 'block' ? 'Zablokowane' : 'Dodane'}</td>
      <td>${row.note || ''}</td>
      <td><button class="delete-btn" data-id="${row.id}">Usuń</button></td>
    `;
    exceptionsTableBody.appendChild(tr);
  }
}

exceptionsTableBody.addEventListener('click', async (e) => {
  if (!e.target.matches('.delete-btn')) return;
  await apiFetch(`/api/admin/exceptions/${e.target.dataset.id}`, { method: 'DELETE' });
  loadExceptions();
});

exceptionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiFetch('/api/admin/exceptions', {
      method: 'POST',
      body: JSON.stringify({
        date: document.getElementById('exception-date').value,
        start_hour: Number(document.getElementById('exception-start').value),
        end_hour: Number(document.getElementById('exception-end').value),
        kind: document.getElementById('exception-kind').value,
        note: document.getElementById('exception-note').value,
      }),
    });
    exceptionForm.reset();
    loadExceptions();
  } catch (err) {
    alert(err.message);
  }
});

// --- Rezerwacje (tylko podgląd) ---

const bookingsTableBody = document.querySelector('#bookings-table tbody');
const bookingsEmpty = document.getElementById('bookings-empty');

async function loadBookings() {
  const { bookings } = await apiFetch('/api/admin/bookings');
  bookingsTableBody.innerHTML = '';
  bookingsEmpty.hidden = bookings.length > 0;

  for (const b of bookings) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${b.code}</td>
      <td>${b.client_name}</td>
      <td>${b.client_phone}<br>${b.client_email}</td>
      <td>${b.date}</td>
      <td>${b.start_hour}:00</td>
      <td>${b.duration_hours}h</td>
      <td>${(b.amount_grosz / 100).toFixed(2)} zł</td>
      <td><span class="status-badge status-${b.status}">${STATUS_LABELS[b.status] || b.status}</span></td>
    `;
    bookingsTableBody.appendChild(tr);
  }
}

checkSession();
