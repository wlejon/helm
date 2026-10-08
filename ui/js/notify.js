/**
 * Notifications: helm is the org.freedesktop.Notifications server
 * (bro.sys.notifications). Incoming notifications become toasts and join
 * the history the notification center lists. Do Not Disturb holds toasts
 * back (critical ones still show) and is remembered in settings.
 */

import { h, $, api, attempt, listen, fmtRelative, appIconPath } from './util.js';
import { icon } from './icons.js';
import { settings } from './settings.js';
import { appdb } from './appdb.js';

const MAX_TOASTS = 3;
const MAX_HISTORY = 50;

export class NotificationCenter {
  constructor() {
    this.items = [];          // newest first
    this.unread = 0;
    this.dnd = false;
    this.toasts = new Map();  // id -> { el, timer }
    this.localId = 1000000;
    this.subs = new Set();
    this.dndSubs = new Set();
    this.server = false;
  }

  init() {
    this.stack = $('#toast-stack');
    this.dnd = !!settings.get('dndEnabled');
    const n = api('sys') && api('sys').notifications;
    if (n) {
      this.server = attempt('notifications.listen', () => n.listen({ doNotDisturb: this.dnd }), false) !== false;
      listen(n, 'posted', (p) => p && p.notification && this.receive(p.notification, !!p.replaced));
      listen(n, 'closed', (p) => p && this.remove(p.id, false));
      listen(n, 'dndChanged', (p) => p && this.applyDnd(!!p.enabled));
    }
  }

  onChange(fn) {
    this.subs.add(fn);
  }

  onDndChange(fn) {
    this.dndSubs.add(fn);
  }

  emit() {
    for (const fn of this.subs) attempt('notify subscriber', () => fn(this));
  }

  /** A notification from inside the shell (not routed over D-Bus). */
  post({ summary, body = '', appName = 'Helm', icon: iconName = 'info', urgency = 'normal' }) {
    this.receive({
      id: ++this.localId,
      appName,
      shellIcon: iconName,
      summary,
      body,
      urgency,
      actions: [],
      expireTimeoutMs: -1,
      local: true,
    }, false);
  }

  receive(n, replaced) {
    const item = {
      id: n.id,
      appName: n.appName || 'Notification',
      appIcon: n.appIcon || '',
      desktopEntry: n.desktopEntry || '',
      imagePath: n.imagePath || '',
      shellIcon: n.shellIcon || null,
      summary: stripMarkup(n.summary || ''),
      body: stripMarkup(n.body || ''),
      urgency: n.urgency || 'normal',
      actions: Array.isArray(n.actions) ? n.actions : [],
      expireTimeoutMs: n.expireTimeoutMs ?? -1,
      transient: !!n.transient,
      resident: !!n.resident,
      local: !!n.local,
      time: Date.now(),
    };

    const idx = this.items.findIndex((x) => x.id === item.id);
    if (idx >= 0) this.items.splice(idx, 1);
    if (!item.transient) {
      this.items.unshift(item);
      if (this.items.length > MAX_HISTORY) this.items.length = MAX_HISTORY;
      if (!replaced) this.unread++;
    }

    const showToast = !this.dnd || item.urgency === 'critical';
    if (showToast) this.toast(item);
    this.emit();
  }

  remove(id, signal = true) {
    const idx = this.items.findIndex((x) => x.id === id);
    const item = idx >= 0 ? this.items[idx] : null;
    if (idx >= 0) this.items.splice(idx, 1);
    this.dropToast(id);
    if (signal && item && !item.local) {
      const n = api('sys').notifications;
      attempt('notifications.dismiss', () => n.dismiss(id));
    }
    this.emit();
  }

  clearAll() {
    const n = api('sys') && api('sys').notifications;
    for (const it of this.items) {
      if (!it.local && n) attempt('notifications.dismiss', () => n.dismiss(it.id));
      this.dropToast(it.id);
    }
    this.items = [];
    this.unread = 0;
    this.emit();
  }

  markRead() {
    if (this.unread === 0) return;
    this.unread = 0;
    this.emit();
  }

  activate(item, key = 'default') {
    if (!item.local) {
      const n = api('sys').notifications;
      attempt('notifications.invokeAction', () => n.invokeAction(item.id, key));
    }
    if (!item.resident) this.remove(item.id, false);
    this.dropToast(item.id);
  }

  setDnd(on) {
    const n = api('sys') && api('sys').notifications;
    if (n) attempt('notifications.setDoNotDisturb', () => n.setDoNotDisturb(!!on));
    this.applyDnd(!!on);
  }

  applyDnd(on) {
    if (this.dnd === on) return;
    this.dnd = on;
    settings.set('dndEnabled', on);
    if (on) for (const id of Array.from(this.toasts.keys())) this.dropToast(id);
    for (const fn of this.dndSubs) attempt('dnd subscriber', () => fn(on));
    this.emit();
  }

  // -- Cards -----------------------------------------------------------------

  iconFor(item) {
    if (item.shellIcon) return icon(item.shellIcon);
    let path = null;
    if (item.imagePath) path = item.imagePath.replace(/^file:\/\//, '');
    if (!path && item.appIcon) path = appIconPath(item.appIcon.replace(/^file:\/\//, ''), 64);
    if (!path && item.desktopEntry) {
      const app = appdb.get(item.desktopEntry);
      if (app) path = appIconPath(app.icon, 64);
    }
    return path ? h('img', { src: path }) : icon('bell');
  }

  card(item, { onDismiss, withTime = true } = {}) {
    const actions = item.actions.filter((a) => a.key !== 'default');
    const glyph = this.iconFor(item);
    const el = h('div.notif',
      h('div.notif-icon', glyph),
      h('div.notif-main',
        h('div.notif-top',
          h('span.notif-app', item.appName),
          withTime ? h('span.notif-time', fmtRelative(item.time)) : null),
        item.summary ? h('div.notif-summary', item.summary) : null,
        item.body ? h('div.notif-body', item.body) : null,
        actions.length ? h('div.notif-actions', actions.slice(0, 3).map((a) => {
          const b = h('button.btn', a.label || a.key);
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            this.activate(item, a.key);
          });
          return b;
        })) : null),
      h('button.notif-close', { title: 'Dismiss' }, icon('x')));
    el.classList.toggle('critical', item.urgency === 'critical');
    el.classList.toggle('glyph', glyph.tagName !== 'IMG' && glyph.tagName !== 'img');
    el.classList.toggle('actionable', item.actions.some((a) => a.key === 'default'));
    $('.notif-close', el).addEventListener('click', (e) => {
      e.stopPropagation();
      (onDismiss || (() => this.remove(item.id)))();
    });
    el.addEventListener('click', () => {
      if (item.actions.some((a) => a.key === 'default')) this.activate(item, 'default');
    });
    return el;
  }

  // -- Toasts ----------------------------------------------------------------

  toast(item) {
    const existing = this.toasts.get(item.id);
    const el = this.card(item, { onDismiss: () => this.dropToast(item.id), withTime: false });
    el.classList.add('toast');
    if (existing) {
      clearTimeout(existing.timer);
      existing.el.replaceWith(el);
    } else {
      this.stack.prepend(el);
    }
    const entry = { el, timer: null, item };
    this.toasts.set(item.id, entry);
    this.arm(entry);
    el.addEventListener('pointerenter', () => clearTimeout(entry.timer));
    el.addEventListener('pointerleave', () => this.arm(entry));

    while (this.toasts.size > MAX_TOASTS) {
      const oldest = Array.from(this.toasts.keys())[0];
      this.dropToast(oldest);
    }
  }

  arm(entry) {
    clearTimeout(entry.timer);
    const it = entry.item;
    if (it.urgency === 'critical' || it.expireTimeoutMs === 0) return;
    const ms = it.expireTimeoutMs > 0 ? Math.max(it.expireTimeoutMs, 3000) : 5000;
    entry.timer = setTimeout(() => this.dropToast(it.id), ms);
  }

  dropToast(id) {
    const entry = this.toasts.get(id);
    if (!entry) return;
    this.toasts.delete(id);
    clearTimeout(entry.timer);
    entry.el.classList.add('leaving');
    setTimeout(() => entry.el.remove(), 240);
  }
}

function stripMarkup(s) {
  return String(s)
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
