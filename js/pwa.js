(() => {
  const installButtons = document.querySelectorAll('[data-install-app]');
  const status = document.getElementById('pwaStatus');
  let deferredInstallPrompt = null;

  const showStatus = (message) => {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('hidden', !message);
  };

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.error('Échec de l’activation du mode hors ligne AutoRendez :', error);
      showStatus('Le mode hors ligne n’a pas pu être activé. Rechargez la page ou vérifiez que le site est servi en HTTPS.');
    });
  } else {
    showStatus('Pour installer AutoRendez et utiliser le mode hors ligne, ouvrez le site depuis une adresse HTTPS.');
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButtons.forEach((button) => button.classList.remove('hidden'));
  });

  installButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;

      button.disabled = true;
      try {
        await deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        showStatus(choice.outcome === 'accepted' ? 'AutoRendez a été installée.' : 'Installation annulée.');
        deferredInstallPrompt = null;
        if (choice.outcome === 'accepted') {
          installButtons.forEach((installButton) => installButton.classList.add('hidden'));
        }
      } catch (error) {
        console.error('Échec de l’installation AutoRendez :', error);
        showStatus('L’installation a échoué. Réessayez depuis le menu de votre navigateur.');
      } finally {
        button.disabled = false;
      }
    });
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installButtons.forEach((button) => button.classList.add('hidden'));
    showStatus('AutoRendez a été installée.');
  });
})();
