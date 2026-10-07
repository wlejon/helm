/**
 * Helm Desktop Notification Controller
 * Manages toast notification overlays, notification drawer,
 * and integration with bro.sys.notifications.
 */

import { createIcon } from './icons.js';
import { h, clear } from './dom.js';

export class NotificationController {
  constructor() {
    this.notifications = [];
    this.unreadCount = 0;
    this.isDrawerOpen = false;
    this.dndEnabled = false;
    this.nextNotificationId = 1;
  }

  init() {
    this.setupListeners();
    this.bindEvents();
    this.updateBadge();
  }

  setupListeners() {
    if (typeof bro !== 'undefined' && bro.sys?.notifications) {
      try {
        if (typeof bro.sys.notifications.listen === 'function') {
          bro.sys.notifications.listen();
        }

        const handlePosted = (payload) => {
          const n = payload?.notification || payload;
          if (n) {
            this.handleIncomingNotification({
              id: n.id || ++this.nextNotificationId,
              appName: n.appName || 'System',
              appIcon: n.appIcon || 'bell',
              summary: n.summary || 'Notification',
              body: n.body || '',
              actions: n.actions || [],
            });
          }
        };

        if (typeof bro.sys.notifications.on === 'function') {
          bro.sys.notifications.on('posted', handlePosted);
        } else if (typeof bro.sys.on === 'function') {
          bro.sys.on('notifications:posted', handlePosted);
          bro.sys.on('notificationPosted', handlePosted);
        }
      } catch (err) {
        console.warn('Failed to initialize bro.sys.notifications:', err);
      }
    }
  }

  bindEvents() {
    const toggleBtn = document.getElementById('btn-notify-toggle');
    const clockBtn = document.getElementById('btn-clock');
    const dndBtn = document.getElementById('btn-dnd-toggle');
    const clearBtn = document.getElementById('btn-clear-notifications');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDrawer();
      });
    }

    if (clockBtn) {
      clockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDrawer();
      });
    }

    if (dndBtn) {
      dndBtn.addEventListener('click', () => {
        this.dndEnabled = !this.dndEnabled;
        dndBtn.textContent = `DND: ${this.dndEnabled ? 'On' : 'Off'}`;
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearAll();
      });
    }

    document.addEventListener('click', (e) => {
      if (this.isDrawerOpen) {
        const drawer = document.getElementById('notify-drawer');
        const toggle = document.getElementById('btn-notify-toggle');
        const clock = document.getElementById('btn-clock');
        if (drawer && !drawer.contains(e.target) && !toggle?.contains(e.target) && !clock?.contains(e.target)) {
          this.closeDrawer();
        }
      }
    });
  }

  postNotification(opts) {
    const notif = {
      id: opts.id || ++this.nextNotificationId,
      appName: opts.appName || 'Desktop',
      appIcon: opts.appIcon || 'bell',
      summary: opts.summary || 'Alert',
      body: opts.body || '',
      actions: opts.actions || [],
      timestamp: Date.now(),
    };
    this.handleIncomingNotification(notif);
  }

  handleIncomingNotification(notif) {
    this.notifications.unshift(notif);
    this.unreadCount++;
    this.updateBadge();
    this.renderDrawerList();

    if (!this.dndEnabled) {
      this.showToast(notif);
    }
  }

  showToast(notif) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const iconEl = h('div.toast-icon', null, createIcon('bell', 16));

    const contentChildren = [
      h('div.toast-title', null, notif.summary)
    ];
    if (notif.body) {
      contentChildren.push(h('div.toast-body', null, notif.body));
    }

    let toastEl;

    if (Array.isArray(notif.actions) && notif.actions.length > 0) {
      const actionsEl = h('div.toast-actions');
      for (const act of notif.actions) {
        actionsEl.appendChild(
          h('button.drawer-action-btn', {
            onclick: (e) => {
              e.stopPropagation();
              if (typeof bro !== 'undefined' && bro.sys?.notifications?.invokeAction) {
                bro.sys.notifications.invokeAction(notif.id, act.key);
              }
              this.dismissToast(toastEl);
            }
          }, act.label || act.key)
        );
      }
      contentChildren.push(actionsEl);
    }

    const contentEl = h('div.toast-content', null, ...contentChildren);

    const closeBtn = h('button.toast-close', {
      title: 'Dismiss',
      onclick: (e) => {
        e.stopPropagation();
        this.dismissToast(toastEl);
      }
    }, createIcon('close', 12));

    toastEl = h('div.toast', {
      dataset: { id: String(notif.id) }
    }, iconEl, contentEl, closeBtn);

    container.appendChild(toastEl);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      this.dismissToast(toastEl);
    }, 5000);
  }

  dismissToast(toastEl) {
    if (!toastEl || !toastEl.parentNode) return;
    toastEl.style.transition = 'opacity 200ms ease, transform 200ms ease';
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
    }, 220);
  }

  updateBadge() {
    const badge = document.getElementById('notify-badge');
    if (!badge) return;
    badge.textContent = String(this.unreadCount);
    if (this.unreadCount > 0) {
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  renderDrawerList() {
    const listEl = document.getElementById('notify-history-list');
    const emptyEl = document.getElementById('notify-empty-state');
    if (!listEl) return;

    clear(listEl);

    if (this.notifications.length === 0) {
      if (emptyEl) {
        emptyEl.classList.remove('hidden');
        listEl.appendChild(emptyEl);
      }
      return;
    }

    for (const notif of this.notifications) {
      const titleEl = h('div.toast-title', null,
        h('span.drawer-item-icon', null, createIcon('bell', 14)),
        ' ' + notif.summary
      );

      const itemKids = [titleEl];
      if (notif.body) {
        itemKids.push(h('div.toast-body', null, notif.body));
      }

      const itemEl = h('div.drawer-item', null, ...itemKids);
      listEl.appendChild(itemEl);
    }
  }

  clearAll() {
    this.notifications = [];
    this.unreadCount = 0;
    this.updateBadge();
    this.renderDrawerList();
  }

  openDrawer() {
    this.isDrawerOpen = true;
    if (window.helm && typeof window.helm.setModalActive === 'function') {
      window.helm.setModalActive('notify', true);
    }
    const drawer = document.getElementById('notify-drawer');
    if (drawer) drawer.classList.remove('hidden');
    this.unreadCount = 0;
    this.updateBadge();
  }

  closeDrawer() {
    this.isDrawerOpen = false;
    const drawer = document.getElementById('notify-drawer');
    if (drawer) drawer.classList.add('hidden');
    if (window.helm && typeof window.helm.setModalActive === 'function') {
      window.helm.setModalActive('notify', false);
    }
  }

  toggleDrawer() {
    if (this.isDrawerOpen) {
      this.closeDrawer();
    } else {
      this.openDrawer();
    }
  }
}
