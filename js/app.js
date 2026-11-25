const STORAGE_KEY = 'autorendez_bookings';
const SERVICES_STORAGE_KEY = 'autorendez_services';
const DEFAULT_SERVICES = [
  {
    id: 'entretien',
    name: 'Entretien général',
    description: 'Vidange, contrôle des fluides et vérification complète du véhicule.',
    duration: '1h30',
    price: '89€',
    icon: 'fa-screwdriver-wrench'
  },
  {
    id: 'frein',
    name: 'Freinage',
    description: 'Plaquettes, disques, liquide de frein et test de freinage.',
    duration: '2h',
    price: '149€',
    icon: 'fa-stop-circle'
  },
  {
    id: 'pneus',
    name: 'Pneumatiques',
    description: 'Montage de pneus, équilibrage et contrôle de pression.',
    duration: '1h',
    price: '79€',
    icon: 'fa-tire'
  },
  {
    id: 'diagnostic',
    name: 'Diagnostic électronique',
    description: 'Analyse moteur, capteurs et systèmes de sécurité.',
    duration: '1h',
    price: '99€',
    icon: 'fa-magnifying-glass-chart'
  },
  {
    id: 'clim',
    name: 'Climatisation',
    description: 'Vérification, recharge et contrôle du système AC.',
    duration: '1h30',
    price: '120€',
    icon: 'fa-fan'
  },
  {
    id: 'carrosserie',
    name: 'Carrosserie',
    description: 'Réparation esthétique et remise en état de la carrosserie.',
    duration: '2h30',
    price: '179€',
    icon: 'fa-palette'
  }
];
let SERVICES = DEFAULT_SERVICES;
let BOOKINGS_CACHE = [];

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Une erreur serveur est survenue.');
  return data;
}

async function loadServices() {
  try {
    const services = await apiRequest('/api/services');
    if (Array.isArray(services)) {
      SERVICES = services;
      localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(services));
      return SERVICES;
    }
  } catch (error) {
    console.warn(error.message);
  }

  const raw = localStorage.getItem(SERVICES_STORAGE_KEY);
  if (!raw) {
    SERVICES = DEFAULT_SERVICES;
    return SERVICES;
  }

  const services = JSON.parse(raw);
  if (!Array.isArray(services) || services.some((service) =>
    !service || typeof service.id !== 'string' || typeof service.name !== 'string' ||
    typeof service.description !== 'string' || typeof service.duration !== 'string' ||
    typeof service.price !== 'string' || typeof service.icon !== 'string')) {
    throw new Error('La liste des services enregistrée est invalide.');
  }

  SERVICES = services;
  return SERVICES;
}

function saveServices(services) {
  localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(services));
  SERVICES = services;
}

function getBookings() {
  if (BOOKINGS_CACHE.length) return BOOKINGS_CACHE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function saveBookings(bookings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  BOOKINGS_CACHE = bookings;
}

async function refreshBookings() {
  try {
    const bookings = await apiRequest('/api/bookings');
    BOOKINGS_CACHE = Array.isArray(bookings) ? bookings : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(BOOKINGS_CACHE));
  } catch (error) {
    BOOKINGS_CACHE = getBookings();
  }
  return BOOKINGS_CACHE;
}

function getServiceById(id) {
  return SERVICES.find((service) => service.id === id) || SERVICES[0] || DEFAULT_SERVICES[0];
}

function getBookingServiceName(booking) {
  return booking.serviceName || getServiceById(booking.service).name;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

async function renderServices() {
  const servicesGrid = document.getElementById('servicesGrid');
  const serviceSelect = document.getElementById('service');

  try {
    await loadServices();
  } catch (error) {
    if (servicesGrid) servicesGrid.textContent = `Impossible de charger les services : ${error.message}`;
    if (serviceSelect) serviceSelect.disabled = true;
    return;
  }

  if (servicesGrid) {
    servicesGrid.innerHTML = SERVICES.map((service) => `
      <article class="service-card">
        <div class="service-icon"><i class="fas ${escapeHtml(service.icon)}"></i></div>
        <h3>${escapeHtml(service.name)}</h3>
        <p>${escapeHtml(service.description)}</p>
        <div class="service-meta">
          <span>${escapeHtml(service.duration)}</span>
          <strong>${escapeHtml(service.price)}</strong>
        </div>
      </article>
    `).join('');
  }

  if (serviceSelect) {
    serviceSelect.innerHTML = '<option value="">-- Choisir un service --</option>' +
      SERVICES.map((service) => `<option value="${escapeHtml(service.id)}">${escapeHtml(service.name)}</option>`).join('');
    serviceSelect.disabled = SERVICES.length === 0;
  }
}

function setBookingDateMin() {
  const dateInput = document.getElementById('date');
  if (!dateInput) return;

  const today = new Date();
  const value = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString()
    .split('T')[0];
  dateInput.min = value;
}

function updateAvailableBookingSlots() {
  const dateInput = document.getElementById('date');
  const slotSelect = document.getElementById('creneau');
  const availabilityMessage = document.getElementById('bookingAvailability');
  if (!dateInput || !slotSelect) return;

  const selectedDate = dateInput.value;
  const bookingsForDate = selectedDate
    ? getBookings().filter((booking) =>
      booking.date === selectedDate &&
      booking.status !== 'cancelled' &&
      booking.status !== 'completed')
    : [];
  const bookedSlots = new Set(bookingsForDate.map((booking) => booking.creneau));
  const slotOptions = Array.from(slotSelect.options).filter((option) => option.value);

  slotOptions.forEach((option) => {
    if (!option.dataset.defaultLabel) {
      option.dataset.defaultLabel = option.textContent;
    }

    const isBooked = bookedSlots.has(option.value);
    option.disabled = isBooked;
    option.textContent = isBooked
      ? `${option.dataset.defaultLabel} (Complet)`
      : option.dataset.defaultLabel;
  });

  const selectedSlotIsBooked = bookedSlots.has(slotSelect.value);
  if (selectedSlotIsBooked) {
    slotSelect.value = '';
  }

  if (!availabilityMessage) return;

  const allSlotsBooked = slotOptions.length > 0 &&
    slotOptions.every((option) => option.disabled);
  let message = '';
  let isError = false;

  if (selectedSlotIsBooked) {
    message = 'Ce créneau vient d’être réservé. Veuillez en choisir un autre.';
    isError = true;
  } else if (selectedDate && allSlotsBooked) {
    message = 'Tous les créneaux sont complets pour cette journée. Choisissez une autre date.';
    isError = true;
  } else if (selectedDate && bookedSlots.size) {
    message = 'Les créneaux déjà réservés pour cette journée sont indiqués « Complet ».';
  }

  availabilityMessage.textContent = message;
  availabilityMessage.classList.toggle('auth-message', isError);
  availabilityMessage.classList.toggle('auth-notice', !isError);
}

function formatBookingDate(dateString) {
  const date = new Date(dateString + 'T00:00:00');
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function printBookingConfirmation(bookingId) {
  const booking = getBookings().find((savedBooking) => savedBooking.id === bookingId);
  if (!booking) {
    alert('Impossible de retrouver ce rendez-vous. Rechargez la page et réessayez.');
    return;
  }

  const printDocument = document.getElementById('bookingPrintDocument');
  if (!printDocument) {
    alert('Impossible de préparer la lettre de rendez-vous. Rechargez la page et réessayez.');
    return;
  }

  const service = getServiceById(booking.service);
  const statusText = booking.status === 'confirmed'
    ? 'Rendez-vous confirmé par le garage.'
    : booking.status === 'cancelled'
      ? 'Ce rendez-vous a été annulé.'
      : booking.status === 'completed'
        ? 'Ce rendez-vous a été effectué.'
        : 'Demande enregistrée, en attente de confirmation par le garage.';
  const vehicle = [booking.marque, booking.modele, booking.annee]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' ');

  printDocument.innerHTML = `
    <article class="booking-print-letter">
      <header><h1>AutoRendez</h1><div>Lettre de confirmation de rendez-vous</div></header>
      <p>Établie le ${escapeHtml(new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date()))}</p>
      <p>Bonjour <strong>${escapeHtml(booking.nom)}</strong>,</p>
      <p>Voici le récapitulatif de votre rendez-vous auprès d’AutoRendez.</p>
      <div class="booking-print-status">${escapeHtml(statusText)}</div>
      <h2>Détails du rendez-vous</h2>
      <dl>
        <dt>Nom et prénom</dt><dd>${escapeHtml(booking.nom)}</dd>
        <dt>Date</dt><dd>${escapeHtml(formatBookingDate(booking.date))}</dd>
        <dt>Heure</dt><dd>${escapeHtml(booking.creneau)}</dd>
        <dt>Prestation</dt><dd>${escapeHtml(booking.serviceName || service.name)}</dd>
        <dt>Véhicule</dt><dd>${vehicle || 'Non renseigné'}${booking.immatriculation ? ` — ${escapeHtml(booking.immatriculation)}` : ''}</dd>
        <dt>Référence</dt><dd>${escapeHtml(booking.id)}</dd>
      </dl>
      <footer>AutoRendez — +216 41 483 922 — contact@autorendez.fr</footer>
    </article>`;

  const finishPrinting = () => {
    document.body.classList.remove('printing-booking');
    printDocument.replaceChildren();
  };
  window.addEventListener('afterprint', finishPrinting, { once: true });
  document.body.classList.add('printing-booking');
  window.print();
}

function renderClientAppointments() {
  const container = document.getElementById('myAppointments');
  if (!container) return;

  if (!currentAccount) {
    container.innerHTML = '<p class="empty-state">Connectez-vous pour consulter vos rendez-vous.</p>';
    return;
  }

  const bookings = getBookings();
  const filtered = bookings
    .filter((booking) => normalizeText(booking.email) === currentAccount.email)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!filtered.length) {
    container.innerHTML = '<p class="empty-state">Vous n’avez pas encore de rendez-vous.</p>';
    return;
  }

  container.innerHTML = filtered.map((booking) => {
    return `
      <div class="appointment-item">
        <div>
          <h4>${booking.nom}</h4>
          <p>${escapeHtml(getBookingServiceName(booking))}</p>
        </div>
        <div class="appointment-meta">
          <span>${formatBookingDate(booking.date)}</span>
          <span>${booking.creneau}</span>
          <span class="status-badge status-${booking.status || 'pending'}">${booking.status || 'En attente'}</span>
        </div>
        <button type="button" class="btn btn-outline appointment-print-btn" data-booking-id="${escapeHtml(booking.id)}">
          <i class="fas fa-file-pdf"></i> Imprimer / PDF
        </button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.appointment-print-btn').forEach((button) => {
    button.addEventListener('click', () => printBookingConfirmation(button.dataset.bookingId));
  });
}

async function handleBookingSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const formData = new FormData(form);
  if (!currentAccount) {
    document.getElementById('bookingAuthNotice').classList.remove('hidden');
    return;
  }

  const booking = {
    id: `rdv-${Date.now()}`,
    nom: currentAccount.nom,
    email: currentAccount.email,
    telephone: currentAccount.telephone,
    marque: formData.get('marque').toString().trim(),
    modele: formData.get('modele').toString().trim(),
    annee: (formData.get('annee') || '').toString().trim(),
    immatriculation: (formData.get('immatriculation') || '').toString().trim(),
    service: formData.get('service').toString().trim(),
    serviceName: getServiceById(formData.get('service').toString().trim()).name,
    date: formData.get('date').toString().trim(),
    creneau: (formData.get('creneau') || form.elements.creneau.value || '').toString().trim(),
    message: (formData.get('message') || '').toString().trim(),
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  const selectedDate = new Date(booking.date + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!booking.nom || !booking.email || !booking.telephone || !booking.service || !booking.date || !booking.creneau) {
    alert('Veuillez remplir tous les champs obligatoires.');
    return;
  }

  if (selectedDate < today) {
    alert('La date sélectionnée ne peut pas être dans le passé.');
    return;
  }

  const existingBookings = getBookings();
  const slotIsTaken = existingBookings.some((existingBooking) =>
    existingBooking.date === booking.date &&
    existingBooking.creneau === booking.creneau &&
    existingBooking.status !== 'cancelled' &&
    existingBooking.status !== 'completed');

  if (slotIsTaken) {
    updateAvailableBookingSlots();
    return;
  }

  try {
    await apiRequest('/api/bookings', {
      method: 'POST',
      body: JSON.stringify(booking)
    });
    await refreshBookings();
  } catch (error) {
    alert(`Impossible d’enregistrer le rendez-vous : ${error.message}`);
    return;
  }

  const successBox = document.getElementById('bookingSuccess');
  if (successBox) {
    successBox.classList.remove('hidden');
    const printButton = document.getElementById('bookingPrintButton');
    if (printButton) {
      printButton.dataset.bookingId = booking.id;
      printButton.classList.remove('hidden');
      printButton.onclick = () => printBookingConfirmation(booking.id);
    }
    successBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  form.reset();
  form.elements.nom.value = currentAccount.nom;
  form.elements.email.value = currentAccount.email;
  form.elements.telephone.value = currentAccount.telephone;
  setBookingDateMin();
  updateAvailableBookingSlots();
  renderClientAppointments();
}

async function initializeClientPage() {
  await renderServices();
  await refreshBookings();
  setBookingDateMin();
  updateAvailableBookingSlots();
  renderClientAppointments();

  const form = document.getElementById('bookingForm');
  if (form) {
    form.addEventListener('submit', handleBookingSubmit);
  }

  const dateInput = document.getElementById('date');
  if (dateInput) {
    dateInput.addEventListener('change', updateAvailableBookingSlots);
  }

  const slotSelect = document.getElementById('creneau');
  if (slotSelect) {
    slotSelect.addEventListener('change', () => {
      const availabilityMessage = document.getElementById('bookingAvailability');
      if (!availabilityMessage) return;
      availabilityMessage.textContent = '';
      availabilityMessage.classList.remove('auth-message');
      availabilityMessage.classList.add('auth-notice');
    });
  }

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      updateAvailableBookingSlots();
      renderClientAppointments();
    }
    if (event.key === SERVICES_STORAGE_KEY) {
      renderServices();
    }
  });

  const mobileButton = document.getElementById('mobileMenuBtn');
  const mobileNav = document.getElementById('mobileNav');

  if (mobileButton && mobileNav) {
    mobileButton.addEventListener('click', () => {
      mobileNav.classList.toggle('open');
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializeClientPage();
});
