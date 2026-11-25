(() => {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      try {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      } catch (_) {}
    });
  }

  const installBtn = document.querySelector('#install-app');
  const installGuide = document.querySelector('#install-guide');
  const closeGuideBtn = document.querySelector('#install-guide-close');
  if (!installBtn) return;

  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (isStandalone) {
    installBtn.hidden = true;
    if (installGuide) installGuide.hidden = true;
    return;
  }

  let deferredPrompt = null;

  function hideInstallUI() {
    installBtn.hidden = true;
    if (installGuide) installGuide.hidden = true;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installBtn.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallUI();
  });

  const isIOS =
    /(iPad|iPhone|iPod)/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIOS) {
    installBtn.hidden = false;
  }

  installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        const choice = await deferredPrompt.userChoice;
        if (choice?.outcome === 'accepted') {
          hideInstallUI();
        }
      } catch (_) {}
      deferredPrompt = null;
      return;
    }

    if (isIOS && installGuide) {
      const opening = installGuide.hidden;
      installGuide.hidden = !opening;
      installBtn.setAttribute('aria-expanded', String(opening));
    }
  });

  if (closeGuideBtn && installGuide) {
    closeGuideBtn.addEventListener('click', () => {
      installGuide.hidden = true;
      installBtn.setAttribute('aria-expanded', 'false');
    });
  }
})();
