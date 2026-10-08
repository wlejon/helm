/**
 * Context menus: show(items, x, y) with items
 *   { label, icon?, action?, danger?, disabled? } | { separator: true } | { heading }
 * and the tray item menus, built from the item's DBusMenu.
 */

import { h, api, attempt, clamp } from './util.js';
import { icon } from './icons.js';

export class Menus {
  constructor() {
    this.el = null;
    this.onClose = null;
    document.addEventListener('pointerdown', (e) => {
      if (this.el && !this.el.contains(e.target)) this.close();
    }, true);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.el) {
        e.preventDefault();
        this.close();
      }
    });
  }

  get isOpen() {
    return !!this.el;
  }

  show(items, x, y, { onClose } = {}) {
    this.close();
    const el = h('div.menu', { role: 'menu' });
    for (const it of items) {
      if (!it) continue;
      if (it.separator) {
        el.appendChild(h('div.menu-sep'));
      } else if (it.heading) {
        el.appendChild(h('div.menu-label', it.heading));
      } else {
        const btn = h('button.menu-item', { role: 'menuitem', disabled: !!it.disabled },
          it.icon ? icon(it.icon) : null, h('span', it.label));
        if (it.danger) btn.classList.add('danger');
        if (it.disabled) btn.style.opacity = '0.4';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (it.disabled) return;
          this.close();
          if (it.action) it.action();
        });
        el.appendChild(btn);
      }
    }
    document.body.appendChild(el);
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.round(clamp(x, 6, window.innerWidth - r.width - 6))}px`;
    el.style.top = `${Math.round(clamp(y, 6, window.innerHeight - r.height - 6))}px`;
    this.el = el;
    this.onClose = onClose || null;
  }

  /** A menu opening downward from under an anchor element. */
  showBelow(items, anchor, opts) {
    const r = anchor.getBoundingClientRect();
    this.show(items, r.left, r.bottom + 6, opts);
  }

  /** A menu opening upward from above an anchor element (the dock). */
  showAbove(items, anchor, opts) {
    this.show(items, 0, 0, opts);
    const r = anchor.getBoundingClientRect();
    const m = this.el.getBoundingClientRect();
    this.el.style.left = `${Math.round(clamp(r.left + r.width / 2 - m.width / 2, 6, window.innerWidth - m.width - 6))}px`;
    this.el.style.top = `${Math.round(r.top - m.height - 8)}px`;
  }

  close() {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    const fn = this.onClose;
    this.onClose = null;
    if (fn) fn();
  }

  trayMenu(item, anchor) {
    const tray = api('sys') && api('sys').tray;
    if (!tray) return;
    const root = attempt('tray.getMenu', () => tray.getMenu(item.id));
    if (!root || !root.children || root.children.length === 0) {
      const r = anchor.getBoundingClientRect();
      attempt('tray.contextMenu', () => tray.contextMenu(item.id, Math.round(r.left), Math.round(r.bottom)));
      return;
    }
    attempt('tray.menuAboutToShow', () => tray.menuAboutToShow(item.id, root.id));
    const items = [];
    const walk = (nodes, depth) => {
      for (const n of nodes) {
        if (n.visible === false) continue;
        if (n.separator) {
          items.push({ separator: true });
          continue;
        }
        const mark = n.toggle !== 'none' && n.toggleState ? '✓ ' : '';
        const label = mark + String(n.label || '').replace(/_(?=[^_])/g, '');
        if (n.hasSubmenu && n.children && n.children.length) {
          items.push({ heading: label });
          walk(n.children, depth + 1);
        } else {
          items.push({
            label: (depth ? '  ' : '') + label,
            disabled: n.enabled === false,
            action: () => attempt('tray.menuEvent', () => tray.menuEvent(item.id, n.id, 'clicked')),
          });
        }
      }
    };
    walk(root.children, 0);
    this.showBelow(items, anchor);
  }
}
