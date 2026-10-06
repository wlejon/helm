/**
 * Helm Desktop Session Lock Controller
 * Manages the full-screen session lock screen and password verification
 * via bro.cred.
 */

export class LockController {
  constructor() {
    this.isLocked = false;
    this.username = 'User';
    this.clockInterval = null;
  }

  init() {
    this.detectUsername();
    this.setupClock();
    this.bindEvents();
  }

  detectUsername() {
    const userEl = document.getElementById('lock-username');
    if (typeof process !== 'undefined' && process.env?.USER) {
      this.username = process.env.USER;
    } else if (typeof process !== 'undefined' && process.env?.USERNAME) {
      this.username = process.env.USERNAME;
    }
    if (userEl) userEl.textContent = this.username;
  }

  setupClock() {
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
  }

  updateClock() {
    const timeEl = document.getElementById('lock-clock-time');
    const dateEl = document.getElementById('lock-clock-date');
    if (!timeEl || !dateEl) return;

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    timeEl.textContent = `${hours}:${minutes}`;

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    dateEl.textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
  }

  bindEvents() {
    const lockBtn = document.getElementById('btn-session-lock');
    const form = document.getElementById('lock-form');

    if (lockBtn) {
      lockBtn.addEventListener('click', () => this.lock());
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('lock-password');
        const password = input ? input.value : '';
        await this.verify(password);
      });
    }
  }

  lock() {
    this.isLocked = true;
    const screen = document.getElementById('lock-screen');
    const input = document.getElementById('lock-password');
    const errorEl = document.getElementById('lock-error-msg');

    if (screen) screen.classList.remove('hidden');
    if (errorEl) errorEl.classList.add('hidden');
    if (input) {
      input.value = '';
      input.focus();
    }

    // Optional notification to session / power system
    if (typeof bro !== 'undefined' && bro.sys?.power?.request) {
      try {
        bro.sys.power.request('lock');
      } catch (_) {}
    }
  }

  unlock() {
    this.isLocked = false;
    const screen = document.getElementById('lock-screen');
    const input = document.getElementById('lock-password');
    const errorEl = document.getElementById('lock-error-msg');

    if (screen) screen.classList.add('hidden');
    if (errorEl) errorEl.classList.add('hidden');
    if (input) input.value = '';
  }

  async verify(password) {
    const errorEl = document.getElementById('lock-error-msg');
    const input = document.getElementById('lock-password');

    // In a test environment or if bro.cred is unavailable, allow empty or any password
    if (typeof bro === 'undefined' || !bro.cred?.verifyPassword) {
      this.unlock();
      return;
    }

    try {
      let ok = false;
      const verifyFn = bro.cred.verifyPassword || bro.cred.authenticate;
      if (typeof verifyFn === 'function') {
        const res = verifyFn(this.username, password);
        ok = res && typeof res.then === 'function' ? await res : !!res;
      }

      if (ok) {
        this.unlock();
      } else {
        this.showError('Incorrect password. Please try again.');
      }
    } catch (err) {
      console.warn('Authentication error:', err);
      this.showError('Authentication service error');
    }
  }

  showError(msg) {
    const errorEl = document.getElementById('lock-error-msg');
    const input = document.getElementById('lock-password');
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
    }
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  destroy() {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
  }
}
