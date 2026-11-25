const ADMIN_PASSWORD = 'admin123';
const ADMIN_KEY = 'autorendez_admin_logged_in';
const pendingConfirmationEmails = new Set();
const EMAILJS_CONFIG_KEY = 'autorendez_emailjs_config';
const EMAILJS_CONFIG = {
  serviceId: '',
  templateId: '',
  publicKey: ''
};
let editingServiceId = null;

function setAdminNotification(message, isError = false) {
  const notification = document.getElementById('adminNotification');
  if (!notification) return;

  notification.querySelector('p').textContent = message;
  notification.classList.remove('hidden', 'alert-success', 'alert-error');
  notification.classList.add(isError ? 'alert-error' : 'alert-success');
}

async function sendAppointmentConfirmationEmail(booking) {
  const { serviceId, templateId, publicKey } = getEmailJsConfig();

  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: {
        to_email: booking.email,
        to_name: booking.nom,
        service_name: getBookingServiceName(booking),
        appointment_date: formatBookingDate(booking.date),
        appointment_time: booking.creneau,
        vehicle: `${booking.marque} ${booking.modele}${booking.annee ? ` (${booking.annee})` : ''}`,
        registration: booking.immatriculation || 'Non renseignée',
        message: booking.message || 'Aucun message'
      }
    })
  });

  if (!response.ok) {
    const details = (await response.text()).trim();
    throw new Error(`EmailJS a refusé l’envoi (HTTP ${response.status})${details ? ` : ${details}` : '.'}`);
  }
}

function getEmailJsConfig() {
  const raw = localStorage.getItem(EMAILJS_CONFIG_KEY);
  const config = raw ? JSON.parse(raw) : EMAILJS_CONFIG;
  if (!config || typeof config !== 'object') {
    throw new Error('La configuration EmailJS enregistrée est invalide.');
  }
  const fields = [config.serviceId, config.templateId, config.publicKey];

  if (fields.some((value) => typeof value !== 'string' || !value.trim() || value.trim().startsWith('VOTRE_'))) {
    throw new Error('Configuration EmailJS manquante : ouvrez l’onglet « Rendez-vous » et renseignez le Service ID, le Template ID et la clé publique de votre compte EmailJS.');
  }

  return {
    serviceId: config.serviceId.trim(),
    templateId: config.templateId.trim(),
    publicKey: config.publicKey.trim()
  };
}

function initializeEmailJsConfigForm() {
  const form = document.getElementById('emailjsConfigForm');
  if (!form) return;

  try {
    const raw = localStorage.getItem(EMAILJS_CONFIG_KEY);
    if (raw) {
      const config = JSON.parse(raw);
      form.elements.serviceId.value = config.serviceId || '';
      form.elements.templateId.value = config.templateId || '';
      form.elements.publicKey.value = config.publicKey || '';
    }
  } catch (error) {
    setAdminNotification(`Impossible de charger la configuration EmailJS : ${error.message}`, true);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const config = {
      serviceId: formData.get('serviceId').toString().trim(),
      templateId: formData.get('templateId').toString().trim(),
      publicKey: formData.get('publicKey').toString().trim()
    };

    if (Object.values(config).some((value) => !value)) {
      setAdminNotification('Renseignez le Service ID, le Template ID et la clé publique EmailJS.', true);
      return;
    }

    try {
      localStorage.setItem(EMAILJS_CONFIG_KEY, JSON.stringify(config));
      setAdminNotification('Configuration EmailJS enregistrée. Les prochains emails de confirmation utiliseront ces identifiants.');
    } catch (error) {
      setAdminNotification(`Impossible d’enregistrer la configuration EmailJS : ${error.message}`, true);
    }
  });
}

function getStatusLabel(status) {
  const labels = {
    pending: 'En attente',
    confirmed: 'Confirmé',
    completed: 'Terminé',
    cancelled: 'Annulé'
  };
  return labels[status] || 'En attente';
}

function isAdminLoggedIn() {
  return localStorage.getItem(ADMIN_KEY) === 'true';
}

function setAdminLoggedIn(value) {
  localStorage.setItem(ADMIN_KEY, String(value));
}

function updateAdminView() {
  const loginScreen = document.getElementById('loginScreen');
  const dashboard = document.getElementById('dashboard');

  if (!loginScreen || !dashboard) return;

  if (isAdminLoggedIn()) {
    loginScreen.classList.add('hidden');
    dashboard.classList.remove('hidden');
    renderAdminDashboard();
  } else {
    loginScreen.classList.remove('hidden');
    dashboard.classList.add('hidden');
  }
}

function renderAdminDashboard() {
  const bookings = getBookings();
  const sorted = [...bookings].sort((a, b) => new Date(a.date) - new Date(b.date));

  const statTotal = document.getElementById('statTotal');
  const statPending = document.getElementById('statPending');
  const statConfirmed = document.getElementById('statConfirmed');
  const statCancelled = document.getElementById('statCancelled');

  if (statTotal) statTotal.textContent = String(sorted.length);
  if (statPending) statPending.textContent = String(sorted.filter((booking) => (booking.status || 'pending') === 'pending').length);
  if (statConfirmed) statConfirmed.textContent = String(sorted.filter((booking) => booking.status === 'confirmed').length);
  if (statCancelled) statCancelled.textContent = String(sorted.filter((booking) => booking.status === 'cancelled').length);

  const recentContainer = document.getElementById('recentAppointments');
  if (recentContainer) {
    const recent = sorted.slice(-5).reverse();
    recentContainer.innerHTML = recent.length
      ? `
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Service</th>
              <th>Date</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            ${recent.map((booking) => {
              return `
                <tr>
                  <td>${booking.nom}<br><small>${booking.email}</small></td>
                  <td>${escapeHtml(getBookingServiceName(booking))}</td>
                  <td>${formatBookingDate(booking.date)}<br>${booking.creneau}</td>
                  <td><span class="status-badge status-${booking.status || 'pending'}">${getStatusLabel(booking.status || 'pending')}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `
      : '<p class="empty-state">Aucun rendez-vous pour le moment.</p>';
  }

  renderAllAppointmentsTable();
  renderServicesAdmin();
}

function renderAllAppointmentsTable() {
  const container = document.getElementById('allAppointments');
  const filterStatus = document.getElementById('filterStatus');
  const filterSearch = document.getElementById('filterSearch');

  if (!container) return;

  const statusFilter = filterStatus ? filterStatus.value : 'all';
  const searchFilter = filterSearch ? filterSearch.value.trim().toLowerCase() : '';

  const filtered = getBookings().filter((booking) => {
    const status = booking.status || 'pending';
    const matchesStatus = statusFilter === 'all' || status === statusFilter;
    const searchText = [booking.nom, booking.email, booking.telephone, booking.immatriculation, booking.marque, booking.modele].join(' ').toLowerCase();
    const matchesSearch = !searchFilter || searchText.includes(searchFilter);
    return matchesStatus && matchesSearch;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!filtered.length) {
    container.innerHTML = '<p class="empty-state">Aucun rendez-vous correspondant.</p>';
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Client</th>
          <th>Véhicule</th>
          <th>Service</th>
          <th>Date</th>
          <th>Statut</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map((booking) => {
          const status = booking.status || 'pending';
          return `
            <tr>
              <td>
                <strong>${booking.nom}</strong><br>
                <small>${booking.email}</small><br>
                <small>${booking.telephone}</small>
              </td>
              <td>${booking.marque} ${booking.modele}<br><small>${booking.immatriculation || '—'}</small></td>
              <td>${escapeHtml(getBookingServiceName(booking))}</td>
              <td>${formatBookingDate(booking.date)}<br>${booking.creneau}</td>
              <td><span class="status-badge status-${status}">${getStatusLabel(status)}</span></td>
              <td>
                <div class="action-buttons">
                  <button class="action-btn confirm" data-action="confirm" data-id="${booking.id}">Confirmer</button>
                  <button class="action-btn complete" data-action="complete" data-id="${booking.id}">Terminer</button>
                  <button class="action-btn cancel" data-action="cancel" data-id="${booking.id}">Annuler</button>
                </div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  container.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      const id = button.dataset.id;
      updateAppointmentStatus(id, action);
    });
  });
}

async function updateAppointmentStatus(id, action) {
  const bookings = getBookings();
  const match = bookings.find((booking) => booking.id === id);

  if (!match) return;

  if (action === 'confirm') {
    if (pendingConfirmationEmails.has(id)) {
      setAdminNotification('L’envoi de l’e-mail de confirmation est déjà en cours.');
      return;
    }

    match.status = 'confirmed';
    try {
      await apiRequest('/api/bookings/' + encodeURIComponent(id) + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'confirmed' })
      });
    } catch (error) {
      setAdminNotification(`Impossible d’enregistrer le rendez-vous : ${error.message}`, true);
      return;
    }
    renderAdminDashboard();

    if (match.confirmationEmailSentAt) {
      setAdminNotification('Ce rendez-vous est confirmé et son e-mail a déjà été envoyé.');
      return;
    }

    pendingConfirmationEmails.add(id);
    try {
      await sendAppointmentConfirmationEmail(match);
      match.confirmationEmailSentAt = new Date().toISOString();
    } catch (error) {
      setAdminNotification(`Rendez-vous confirmé, mais l’e-mail n’a pas pu être envoyé. ${error.message} Cliquez de nouveau sur « Confirmer » pour réessayer.`, true);
      return;
    } finally {
      pendingConfirmationEmails.delete(id);
    }

    try {
      await apiRequest('/api/bookings/' + encodeURIComponent(id) + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'confirmed', confirmationEmailSent: true })
      });
      renderAdminDashboard();
      setAdminNotification(`Rendez-vous confirmé : l’e-mail a été envoyé à ${match.email}.`);
    } catch (error) {
      renderAdminDashboard();
      setAdminNotification(`L’e-mail a été envoyé à ${match.email}, mais son état d’envoi n’a pas pu être enregistré. Ne confirmez pas de nouveau ce rendez-vous. ${error.message}`, true);
    }
    return;
  }

  if (action === 'complete') match.status = 'completed';
  if (action === 'cancel') match.status = 'cancelled';
  try {
    await apiRequest('/api/bookings/' + encodeURIComponent(id) + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: match.status })
    });
    await refreshBookings();
    renderAdminDashboard();
  } catch (error) {
    setAdminNotification(`Impossible d’enregistrer le changement : ${error.message}`, true);
  }
}

async function renderServicesAdmin() {
  const container = document.getElementById('servicesListAdmin');
  if (!container) return;

  const message = document.getElementById('serviceAdminMessage');
  try {
    await loadServices();
  } catch (error) {
    container.textContent = '';
    if (message) {
      message.textContent = `Impossible de charger les services : ${error.message}`;
      message.classList.add('error');
    }
    return;
  }

  container.innerHTML = SERVICES.length ? SERVICES.map((service) => `
    <article class="service-card admin-service">
      <div class="service-icon"><i class="fas ${escapeHtml(service.icon)}"></i></div>
      <h3>${escapeHtml(service.name)}</h3>
      <p>${escapeHtml(service.description)}</p>
      <div class="service-meta">
        <span>${escapeHtml(service.duration)}</span>
        <strong>${escapeHtml(service.price)}</strong>
      </div>
      <div class="service-admin-actions">
        <button type="button" class="btn btn-outline btn-sm" data-service-action="edit" data-service-id="${escapeHtml(service.id)}">
          <i class="fas fa-pen"></i> Modifier
        </button>
        <button type="button" class="btn btn-danger btn-sm" data-service-action="delete" data-service-id="${escapeHtml(service.id)}">
          <i class="fas fa-trash"></i> Supprimer
        </button>
      </div>
    </article>
  `).join('') : '<p class="empty-state">Aucun service proposé. Ajoutez votre premier service avec le formulaire ci-dessus.</p>';

  container.querySelectorAll('[data-service-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const service = SERVICES.find((item) => item.id === button.dataset.serviceId);
      if (!service) return;

      if (button.dataset.serviceAction === 'edit') {
        startServiceEdit(service);
      } else if (button.dataset.serviceAction === 'delete') {
        deleteService(service);
      }
    });
  });
}

function setServiceAdminMessage(text, isError = false) {
  const message = document.getElementById('serviceAdminMessage');
  if (!message) return;
  message.textContent = text;
  message.classList.toggle('error', isError);
}

function startServiceEdit(service) {
  const form = document.getElementById('serviceForm');
  if (!form) return;

  editingServiceId = service.id;
  form.elements.name.value = service.name;
  form.elements.description.value = service.description;
  form.elements.duration.value = service.duration;
  form.elements.price.value = service.price;
  form.elements.icon.value = service.icon;
  document.getElementById('saveServiceBtn').innerHTML = '<i class="fas fa-check"></i> Enregistrer les modifications';
  document.getElementById('cancelServiceEditBtn').classList.remove('hidden');
  setServiceAdminMessage(`Modification de « ${service.name} ».`);
  form.elements.name.focus();
}

function resetServiceForm() {
  const form = document.getElementById('serviceForm');
  if (!form) return;

  editingServiceId = null;
  form.reset();
  form.elements.icon.value = 'fa-wrench';
  document.getElementById('saveServiceBtn').innerHTML = '<i class="fas fa-plus"></i> Ajouter le service';
  document.getElementById('cancelServiceEditBtn').classList.add('hidden');
}

async function handleServiceSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const name = formData.get('name').toString().trim();
  const description = formData.get('description').toString().trim();
  const duration = formData.get('duration').toString().trim();
  const price = formData.get('price').toString().trim();
  const icon = formData.get('icon').toString().trim() || 'fa-wrench';

  if (!name || !description || !duration || !price) {
    setServiceAdminMessage('Veuillez remplir tous les champs obligatoires.', true);
    return;
  }

  try {
    await loadServices();
    const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `service-${Date.now()}`;
    const existing = SERVICES.find((service) => service.id === editingServiceId);
    const id = editingServiceId || `${slug}${SERVICES.some((service) => service.id === slug) ? `-${Date.now()}` : ''}`;
    const updatedService = { id, name, description, duration, price, icon };
    const updatedServices = existing
      ? SERVICES.map((service) => service.id === editingServiceId ? updatedService : service)
      : [...SERVICES, updatedService];

    if (existing) {
      await apiRequest('/api/services/' + encodeURIComponent(id), {
        method: 'PUT',
        body: JSON.stringify(updatedService)
      });
    } else {
      await apiRequest('/api/services', {
        method: 'POST',
        body: JSON.stringify(updatedService)
      });
    }
    await loadServices();
    await renderServicesAdmin();
    resetServiceForm();
    setServiceAdminMessage(existing ? 'Le service a été modifié.' : 'Le service a été ajouté.');
  } catch (error) {
    setServiceAdminMessage(`Impossible d’enregistrer le service : ${error.message}`, true);
  }
}

async function deleteService(service) {
  if (!window.confirm(`Supprimer le service « ${service.name} » ?`)) return;

  try {
    await apiRequest('/api/services/' + encodeURIComponent(service.id), { method: 'DELETE' });
    await loadServices();
    if (editingServiceId === service.id) resetServiceForm();
    renderServicesAdmin();
    setServiceAdminMessage('Le service a été supprimé.');
  } catch (error) {
    setServiceAdminMessage(`Impossible de supprimer le service : ${error.message}`, true);
  }
}

function initializeAdminPage() {
  const loginForm = document.getElementById('loginForm');
  const logoutBtn = document.getElementById('logoutBtn');
  const serviceForm = document.getElementById('serviceForm');
  const cancelServiceEditBtn = document.getElementById('cancelServiceEditBtn');

  initializeEmailJsConfigForm();
  if (serviceForm) serviceForm.addEventListener('submit', handleServiceSubmit);
  if (cancelServiceEditBtn) {
    cancelServiceEditBtn.addEventListener('click', () => {
      resetServiceForm();
      setServiceAdminMessage('');
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const passwordInput = document.getElementById('password');
      if (!passwordInput) return;

      try {
        await apiRequest('/api/auth/admin/login', {
          method: 'POST',
          body: JSON.stringify({ password: passwordInput.value })
        });
        setAdminLoggedIn(true);
        await refreshBookings();
        if (isAdminLoggedIn()) {
          refreshBookings().then(() => updateAdminView());
        } else {
          updateAdminView();
        }
      } catch (error) {
        alert(error.message);
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await apiRequest('/api/auth/logout', { method: 'POST', body: '{}' });
      } finally {
        setAdminLoggedIn(false);
        updateAdminView();
      }
    });
  }

  const sidebarLinks = document.querySelectorAll('.sidebar-link');
  sidebarLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const section = link.dataset.section;
      const title = document.getElementById('pageTitle');

      sidebarLinks.forEach((item) => item.classList.toggle('active', item === link));

      const sections = document.querySelectorAll('.admin-section');
      sections.forEach((item) => item.classList.add('hidden'));

      const target = document.getElementById(`section-${section}`);
      if (target) target.classList.remove('hidden');

      if (title) {
        const labels = {
          overview: 'Vue d\'ensemble',
          appointments: 'Rendez-vous',
          services: 'Services'
        };
        title.textContent = labels[section] || 'Vue d\'ensemble';
      }
    });
  });

  const filterStatus = document.getElementById('filterStatus');
  const filterSearch = document.getElementById('filterSearch');

  if (filterStatus) {
    filterStatus.addEventListener('change', renderAllAppointmentsTable);
  }

  if (filterSearch) {
    filterSearch.addEventListener('input', renderAllAppointmentsTable);
  }

  updateAdminView();

  window.addEventListener('storage', (event) => {
    if (event.key === SERVICES_STORAGE_KEY) {
      renderServicesAdmin();
      renderAllAppointmentsTable();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initializeAdminPage();
});
