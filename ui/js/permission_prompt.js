/**
 * The system prompt for app permissions. An app that uses a capability the
 * user has not decided asks the session's shell (bro.permissions' 'request',
 * docs/permissions-api.js in bro); helm shows it here, modal over the
 * desktop: the app, what it wants to do and what it was trying, Allow or
 * Deny. The app keeps the answer for itself (it is then listed in Settings >
 * App Permissions, where it can be changed); Escape is "Not now", which keeps
 * nothing, so the app asks again at its next use.
 *
 * Several apps may ask at once: one prompt is shown, the rest wait in order
 * behind it. A request whose app went away (it quit, crashed, or gave up) is
 * dismissed, shown or waiting.
 *
 * Keyboard: focus starts on Deny; Tab and Shift+Tab move between the
 * buttons, Enter or Space presses the focused one, Escape is Not now.
 */

import { h, api, attempt, appIcon } from './util.js';
import { icon } from './icons.js';
import { animate, SPRING } from './morph.js';

const CAP_GLYPH = {
  files: 'folder',
  net: 'globe',
  spawn: 'terminal',
  mic: 'mic',
  env: 'code',
  screen: 'monitor',
  schedule: 'calendar',
  clip: 'clipboard',
  remote: 'monitor',
  displays: 'monitor',
  pulse: 'speaker',
  mpris: 'music',
};

const glyphFor = (cap) => CAP_GLYPH[cap] || (cap.startsWith('sys.') ? 'settings' : 'shield');

const appLabel = (app) => app.name || app.id || String(app.dir || '').split(/[\\/]/).pop() || 'An app';

export class PermissionPrompts {
  constructor() {
    this.queue = [];        // requests waiting, the shown one first
    this.shown = null;      // the request on screen
    this.el = null;
    this.shell = null;
  }

  init(shell) {
    this.shell = shell;
    this.el = document.getElementById('permission-prompt');
    const p = api('permissions');
    if (!this.el || !p || typeof p.on !== 'function') return;
    // Subscribing is what makes helm the session's prompt: until then the
    // apps fall back to the platform dialog.
    attempt('permissions.on request', () => p.on('request', (req) => this.enqueue(req)));
    attempt('permissions.on cancel', () => p.on('cancel', (e) => this.cancel(e.id)));
    window.addEventListener('keydown', (e) => this.onKey(e), true);
  }

  get isOpen() {
    return !!this.shown;
  }

  /** What is waiting, the shown one first: [{ id, app, capability }]. */
  pending() {
    return this.queue.map((r) => ({ id: r.id, app: appLabel(r.app), capability: r.capability }));
  }

  enqueue(req) {
    this.queue.push(req);
    if (!this.shown) this.showNext();
    else this.renderCount();
  }

  cancel(id) {
    const i = this.queue.findIndex((r) => r.id === id);
    if (i < 0) return;
    this.queue.splice(i, 1);
    if (this.shown && this.shown.id === id) {
      this.shown = null;
      this.showNext();
    } else {
      this.renderCount();
    }
  }

  /** The user's answer for the shown request: true, false, or null (Not now). */
  answer(value) {
    const req = this.shown;
    if (!req) return;
    attempt('permission respond', () => req.respond(value));
    this.queue.shift();
    this.shown = null;
    this.showNext();
  }

  showNext() {
    const req = this.queue[0] || null;
    if (!req) {
      this.close();
      return;
    }
    const wasOpen = !this.el.classList.contains('hidden');
    this.shown = req;
    this.render(req);
    if (!wasOpen) {
      this.el.classList.remove('hidden');
      if (this.shell) this.shell.closeTransient();
      if (this.shell) this.shell.setModalActive('permission-prompt', true);
      const card = this.el.querySelector('.perm-prompt');
      animate(card, [{ opacity: 0, transform: 'translateY(12px) scale(0.96)' }, { opacity: 1, transform: 'none' }],
        { duration: 380, easing: SPRING });
    }
    const deny = this.el.querySelector('[data-answer="deny"]');
    if (deny) deny.focus();
  }

  close() {
    this.shown = null;
    if (!this.el || this.el.classList.contains('hidden')) return;
    this.el.classList.add('hidden');
    this.el.replaceChildren();
    if (this.shell) this.shell.setModalActive('permission-prompt', false);
  }

  render(req) {
    const app = req.app || {};
    const name = appLabel(app);
    const where = [app.id, app.dir].filter(Boolean).join(' · ');
    const btn = (label, kind, value) => h(`button.btn${kind ? '.' + kind : ''}`, {
      dataset: { answer: value === true ? 'allow' : value === false ? 'deny' : 'later' },
      onclick: () => this.answer(value),
    }, label);
    const card = h('div.perm-prompt', { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'perm-prompt-title' },
      h('div.perm-prompt-head',
        appIcon(null, name, 48, 'perm-prompt-icon'),
        h('span.perm-prompt-cap', icon(glyphFor(req.capability)))),
      h('div.perm-prompt-title#perm-prompt-title', h('b', name), ` wants to ${req.summary}`),
      req.what ? h('div.perm-prompt-what', h('span.perm-prompt-label', 'It is trying to'), h('span', req.what)) : null,
      h('div.perm-prompt-meta', h('span.perm-prompt-capname', req.capability), where ? h('span', where) : null),
      h('div.perm-prompt-note', 'Your answer is remembered for this app. You can change it in Settings > App Permissions.'),
      h('div.perm-prompt-count'),
      h('div.perm-prompt-actions',
        btn('Not now', 'ghost', null),
        h('span.perm-prompt-spacer'),
        btn('Deny', '', false),
        btn('Allow', 'primary', true)));
    card.dataset.request = String(req.id);
    card.dataset.capability = req.capability;
    this.el.replaceChildren(h('div.perm-prompt-scrim'), card);
    this.renderCount();
  }

  renderCount() {
    const el = this.el && this.el.querySelector('.perm-prompt-count');
    if (!el) return;
    const more = this.queue.length - 1;
    el.textContent = more > 0 ? `${more} more ${more === 1 ? 'request' : 'requests'} waiting` : '';
    el.classList.toggle('hidden', more <= 0);
  }

  onKey(e) {
    if (!this.shown || (this.shell && this.shell.lock && this.shell.lock.isLocked)) return;
    // While a prompt is up it has the keyboard: nothing reaches the shell's
    // hotkeys (they skip a handled event) or the surfaces under it.
    const buttons = Array.from(this.el.querySelectorAll('.perm-prompt-actions .btn'));
    const at = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.answer(null);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      const n = buttons.length;
      const next = at < 0 ? buttons.length - 2 : (at + (e.shiftKey ? n - 1 : 1)) % n;
      if (buttons[next]) buttons[next].focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      const b = at >= 0 ? buttons[at] : this.el.querySelector('[data-answer="deny"]');
      if (b) b.click();
    } else {
      e.preventDefault();
    }
  }

  destroy() {
    // Waiting apps get no answer: they refuse, keep nothing, and ask again.
    for (const r of this.queue) attempt('permission drop', () => r.respond(null));
    this.queue = [];
    this.close();
  }
}

export const permissionPrompts = new PermissionPrompts();
