/**
 * Contact Form Client Logic
 * Gestione validazione, Cloudflare Turnstile, e invio asincrono all'API Vercel
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  const submitBtn = document.getElementById('submitBtn');
  const btnText = submitBtn.querySelector('.btn-text');
  const spinner = submitBtn.querySelector('.spinner');
  const statusMessage = document.getElementById('statusMessage');
  const messageInput = document.getElementById('message');
  const charCount = document.getElementById('charCount');

  let turnstileWidgetId = null;
  let turnstileToken = '';

  // 1. Contatore caratteri per la textarea del messaggio
  if (messageInput && charCount) {
    messageInput.addEventListener('input', () => {
      const length = messageInput.value.length;
      charCount.textContent = `${length} / 5000`;
      if (length > 5000) {
        charCount.style.color = 'var(--color-error)';
      } else {
        charCount.style.color = 'var(--color-text-muted)';
      }
    });
  }

  // 2. Inizializzazione Cloudflare Turnstile (se configurato)
  function initTurnstile() {
    const container = document.getElementById('turnstile-container');
    // Se è definita la sitekey su window o data-sitekey
    const siteKey = window.TURNSTILE_SITE_KEY || '1x00000000000000000000AA'; // Test dummy key di Cloudflare

    if (window.turnstile && container) {
      try {
        turnstileWidgetId = window.turnstile.render(container, {
          sitekey: siteKey,
          theme: 'light',
          callback: (token) => {
            turnstileToken = token;
            clearFieldError('turnstileToken');
          },
          'expired-callback': () => {
            turnstileToken = '';
          },
          'error-callback': () => {
            turnstileToken = '';
          },
        });
      } catch (err) {
        console.warn('Inizializzazione Turnstile:', err);
      }
    }
  }

  // Verifica periodica caricamento script Turnstile
  if (window.turnstile) {
    initTurnstile();
  } else {
    window.addEventListener('load', () => {
      if (window.turnstile) initTurnstile();
    });
  }

  // 3. Helper per gestione degli errori visivi sui campi
  function showFieldError(fieldId, message) {
    const errorEl = document.getElementById(`error-${fieldId}`);
    const inputEl = document.getElementById(fieldId);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
    }
    if (inputEl) {
      inputEl.closest('.form-group')?.classList.add('has-error');
    }
  }

  function clearFieldError(fieldId) {
    const errorEl = document.getElementById(`error-${fieldId}`);
    const inputEl = document.getElementById(fieldId);
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('visible');
    }
    if (inputEl) {
      inputEl.closest('.form-group')?.classList.remove('has-error');
    }
  }

  function clearAllErrors() {
    document.querySelectorAll('.field-error').forEach((el) => {
      el.textContent = '';
      el.classList.remove('visible');
    });
    document.querySelectorAll('.has-error').forEach((el) => {
      el.classList.remove('has-error');
    });
    hideStatusBanner();
  }

  function showStatusBanner(type, message) {
    statusMessage.className = `status-banner ${type}`;
    statusMessage.textContent = message;
    statusMessage.hidden = false;
    statusMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideStatusBanner() {
    statusMessage.hidden = true;
    statusMessage.textContent = '';
  }

  // Rimuovi errore al cambio del valore
  form.querySelectorAll('input, textarea').forEach((input) => {
    input.addEventListener('input', () => clearFieldError(input.id));
  });

  // 4. Validazione lato client
  function validateForm(data) {
    let isValid = true;
    clearAllErrors();

    // Nome
    if (!data.fullName || data.fullName.trim().length < 2) {
      showFieldError('fullName', 'Inserisci un nome e cognome valido (min. 2 caratteri)');
      isValid = false;
    }

    // Email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email || !emailRegex.test(data.email.trim())) {
      showFieldError('email', 'Inserisci un indirizzo email valido');
      isValid = false;
    }

    // Oggetto
    if (!data.subject || data.subject.trim().length < 3) {
      showFieldError('subject', "L'oggetto deve contenere almeno 3 caratteri");
      isValid = false;
    }

    // Messaggio
    if (!data.message || data.message.trim().length < 10) {
      showFieldError('message', 'Il messaggio deve contenere almeno 10 caratteri');
      isValid = false;
    }

    // Privacy Consent
    if (!data.privacyConsent) {
      showFieldError('privacyConsent', 'Devi accettare l informativa privacy per inviare la richiesta');
      isValid = false;
    }

    return isValid;
  }

  // 5. Gestione Submit Form
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    const payload = {
      fullName: (formData.get('fullName') || '').toString().trim(),
      email: (formData.get('email') || '').toString().trim(),
      phone: (formData.get('phone') || '').toString().trim(),
      subject: (formData.get('subject') || '').toString().trim(),
      message: (formData.get('message') || '').toString().trim(),
      privacyConsent: formData.get('privacyConsent') === 'on',
      hp_company_field: (formData.get('hp_company_field') || '').toString().trim(),
      turnstileToken: turnstileToken,
    };

    if (!validateForm(payload)) {
      return;
    }

    // UI Loading state
    submitBtn.disabled = true;
    spinner.hidden = false;
    btnText.textContent = 'Invio in corso...';
    hideStatusBanner();

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        showStatusBanner('success', result.message || 'Messaggio inviato con successo!');
        form.reset();
        if (charCount) charCount.textContent = '0 / 5000';
        turnstileToken = '';
        if (window.turnstile && turnstileWidgetId !== null) {
          window.turnstile.reset(turnstileWidgetId);
        }
      } else {
        // Gestione errori specifici per campo restituiti dal backend
        if (result.details) {
          Object.entries(result.details).forEach(([field, errors]) => {
            const errList = Array.isArray(errors) ? errors : [errors];
            showFieldError(field, errList[0]);
          });
        }
        showStatusBanner('error', result.error || 'Si è verificato un errore durante l invio.');
      }
    } catch (networkError) {
      console.error('Errore di rete:', networkError);
      showStatusBanner(
        'error',
        'Impossibile contattare il server. Verifica la tua connessione internet e riprova.'
      );
    } finally {
      submitBtn.disabled = false;
      spinner.hidden = true;
      btnText.textContent = 'Invia Messaggio';
    }
  });
});
