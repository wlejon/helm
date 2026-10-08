/**
 * Session lock: a full-screen overlay over the blurred wallpaper with the
 * clock and a password field checked by bro.cred. Fails closed: without a
 * working authentication service the session stays locked.
 */

import { h, $, api, everyMinute, fmtTime, fmtDateLong, initials } from './util.js';
import { icon } from './icons.js';
import { settings } from './settings.js';

export class LockController {
  constructor(shell) {
    this.shell = shell;
    this.isLocked = false;
    this.busy = false;
    this.requestedAt = 0;
    this.stopClock = null;
  }

  get username() {
    return this.shell.username;
  }

  init() {
    this.el = $('#lock-screen');
    this.render();
    this.stopClock = everyMinute(() => this.renderClock());
    settings.watch('use24h', () => this.renderClock());
    const seat = api('seat');
    if (seat && typeof seat.addEventListener === 'function') {
      // logind answers our own seat.lock() with a Lock signal; one landing
      // after a quick unlock must not lock the screen again.
      seat.addEventListener('lock', () => {
        if (Date.now() - this.requestedAt < 3000) return;
        this.lock({ fromSeat: true });
      });
    }
  }

  render() {
    this.timeEl = h('div.lock-time');
    this.dateEl = h('div.lock-date');
    this.input = h('input.lock-input#lock-password', {
      type: 'password', placeholder: 'Password', autocomplete: 'current-password',
    });
    this.submitBtn = h('button.lock-go#lock-submit', { type: 'submit', title: 'Unlock' }, icon('arrow-right'));
    this.errorEl = h('div.lock-error.hidden#lock-error-msg');
    this.form = h('form.lock-form#lock-form', h('div.lock-field', this.input, this.submitBtn), this.errorEl);
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.verify(this.input.value);
    });
    this.el.replaceChildren(
      h('div.lock-bg#lock-bg'),
      h('div.lock-scrim'),
      h('div.lock-top', this.timeEl, this.dateEl),
      h('div.lock-auth',
        h('div.lock-avatar', initials(this.username)),
        h('div.lock-user#lock-username', this.username),
        this.form));
    this.renderClock();
  }

  renderClock() {
    const now = new Date();
    if (this.timeEl) this.timeEl.textContent = fmtTime(now, settings.get('use24h')).replace(/ [AP]M$/, '');
    if (this.dateEl) this.dateEl.textContent = fmtDateLong(now);
  }

  lock({ fromSeat = false } = {}) {
    if (this.isLocked) return;
    this.isLocked = true;
    this.shell.closeTransient();
    $('#lock-bg', this.el).style.backgroundImage = this.shell.wallpaper.css();
    this.renderClock();
    this.errorEl.classList.add('hidden');
    this.input.value = '';
    this.el.classList.remove('hidden', 'leaving');
    this.el.classList.add('entering');
    setTimeout(() => this.el.classList.remove('entering'), 400);
    setTimeout(() => this.input.focus(), 0);
    const seat = api('seat');
    if (!fromSeat && seat && typeof seat.lock === 'function') {
      this.requestedAt = Date.now();
      try { seat.lock(); } catch (_) {}
    }
  }

  unlock() {
    this.isLocked = false;
    this.input.value = '';
    this.errorEl.classList.add('hidden');
    this.el.classList.add('leaving');
    setTimeout(() => {
      if (!this.isLocked) this.el.classList.add('hidden');
      this.el.classList.remove('leaving');
    }, 300);
    const seat = api('seat');
    if (seat && typeof seat.unlock === 'function') {
      try { seat.unlock(); } catch (_) {}
    }
  }

  async verify(password) {
    if (this.busy) return false;
    const cred = typeof bro !== 'undefined' && bro ? bro.cred : null;
    if (!cred || typeof cred.authenticate !== 'function') {
      this.showError('Authentication service unavailable');
      return false;
    }
    this.busy = true;
    this.form.classList.add('busy');
    try {
      const res = cred.authenticate(this.username, password);
      const ok = res && typeof res.then === 'function' ? await res : !!res;
      if (ok) {
        this.unlock();
        return true;
      }
      this.showError('Incorrect password');
      return false;
    } catch (err) {
      console.warn('helm: authentication error:', err);
      this.showError('Authentication failed');
      return false;
    } finally {
      this.busy = false;
      this.form.classList.remove('busy');
    }
  }

  showError(msg) {
    this.errorEl.textContent = msg;
    this.errorEl.classList.remove('hidden');
    this.input.value = '';
    this.form.classList.remove('shake');
    // Restart the animation on repeated failures.
    void this.form.offsetWidth;
    this.form.classList.add('shake');
    setTimeout(() => this.form.classList.remove('shake'), 450);
    this.input.focus();
  }

  destroy() {
    if (this.stopClock) this.stopClock();
  }
}
