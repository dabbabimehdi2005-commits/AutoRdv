const ACCOUNTS_KEY = 'autorendez_accounts';
const SESSION_KEY = 'autorendez_client_session';
let currentAccount = null;

function setAuthMessage(message) {
  const element = document.getElementById('authMessage');
  if (element) {
    element.textContent = message;
    element.classList.remove('success');
  }
}

function showAccount(account) {
  currentAccount = account;
  document.getElementById('accountForms').classList.add('hidden');
  document.getElementById('accountWelcome').classList.remove('hidden');
  document.getElementById('welcomeName').textContent = account.nom;
  document.getElementById('welcomeEmail').textContent = account.email;
  document.getElementById('bookingAuthNotice').classList.add('hidden');

  const bookingForm = document.getElementById('bookingForm');
  bookingForm.classList.remove('hidden');
  bookingForm.elements.nom.value = account.nom;
  bookingForm.elements.email.value = account.email;
  bookingForm.elements.telephone.value = account.telephone;
  renderClientAppointments();
}

function showSignedOut() {
  currentAccount = null;
  document.getElementById('accountForms').classList.remove('hidden');
  document.getElementById('accountWelcome').classList.add('hidden');
  document.getElementById('bookingAuthNotice').classList.remove('hidden');
  const bookingForm = document.getElementById('bookingForm');
  bookingForm.classList.add('hidden');
  bookingForm.reset();
  document.getElementById('bookingSuccess').classList.add('hidden');
  renderClientAppointments();
}

function setAccountFormMode(mode) {
  const isRegister = mode === 'register';
  document.getElementById('loginForm').classList.toggle('hidden', isRegister);
  document.getElementById('registerForm').classList.toggle('hidden', !isRegister);
  document.getElementById('loginTab').classList.toggle('active', !isRegister);
  document.getElementById('registerTab').classList.toggle('active', isRegister);
  document.getElementById('loginTab').setAttribute('aria-selected', String(!isRegister));
  document.getElementById('registerTab').setAttribute('aria-selected', String(isRegister));
  setAuthMessage('');
}

async function handleRegistration(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const password = formData.get('password');
  if (password !== formData.get('confirmPassword')) {
    setAuthMessage('Les deux mots de passe ne correspondent pas.');
    return;
  }
  try {
    const result = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        nom: formData.get('nom'),
        telephone: formData.get('telephone'),
        email: formData.get('email'),
        password
      })
    });
    form.reset();
    showAccount(result.user);
    await refreshBookings();
  } catch (error) {
    setAuthMessage(error.message);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  try {
    const result = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: formData.get('email'),
        password: formData.get('password')
      })
    });
    form.reset();
    showAccount(result.user);
    await refreshBookings();
  } catch (error) {
    setAuthMessage(error.message);
  }
}

async function restoreSession() {
  try {
    const me = await apiRequest('/api/me');
    if (me.authenticated && me.role === 'client') showAccount(me.user);
    else showSignedOut();
  } catch (error) {
    showSignedOut();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginTab').addEventListener('click', () => setAccountFormMode('login'));
  document.getElementById('registerTab').addEventListener('click', () => setAccountFormMode('register'));
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('registerForm').addEventListener('submit', handleRegistration);
  document.getElementById('logoutButton').addEventListener('click', async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST', body: '{}' });
      showSignedOut();
      setAuthMessage('');
    } catch (error) {
      setAuthMessage(error.message);
    }
  });
  restoreSession();
});
