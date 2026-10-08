/**
 * The dock: pinned apps, then running apps that are not pinned, then the
 * app grid button. A dot marks running apps (brighter for the focused one).
 * Click launches or focuses (and cycles through an app's windows), middle
 * click opens a new instance, right click opens the app's menu.
 *
 * With autohide on, the dock steps aside while a window overlaps it and
 * comes back when the pointer reaches the bottom edge.
 */

import { h, $, appIcon } from './util.js';
import { icon } from './icons.js';
import { settings } from './settings.js';
import { appdb } from './appdb.js';
import { windows } from './windows.js';

const LAUNCH_FEEDBACK_MS = 4000;

export class Dock {
  constructor(shell) {
    this.shell = shell;
    this.launching = new Map(); // app id -> timer
    this.hovered = false;
    this.revealed = false;
    this.cycle = new Map();     // app id -> index of the last window focused
  }

  init() {
    this.el = $('#dock');
    this.inner = h('div.dock-inner');
    this.tip = h('div.dock-tip.hidden');
    this.edge = $('#dock-edge');
    this.el.replaceChildren(this.inner);
    document.body.appendChild(this.tip);

    this.el.addEventListener('pointerenter', () => {
      this.hovered = true;
      this.updateVisibility();
    });
    this.el.addEventListener('pointerleave', () => {
      this.hovered = false;
      this.hideTip();
      setTimeout(() => this.updateVisibility(), 350);
    });
    this.edge.addEventListener('pointerenter', () => {
      this.revealed = true;
      this.updateVisibility();
    });

    windows.on('windows', () => this.render());
    windows.on('focus', () => this.render());
    windows.on('workspaces', () => this.render());
    appdb.onChange(() => this.render());
    settings.watch('pinnedApps', () => this.render());
    settings.watch('dockAutohide', () => this.updateVisibility());
    window.addEventListener('helm:launched', (e) => this.markLaunching(e.detail.id));
    window.addEventListener('helm:overlay', () => this.updateVisibility());
    this.render();
  }

  pinned() {
    const ids = settings.get('pinnedApps') || [];
    return ids.map((id) => appdb.get(id)).filter(Boolean);
  }

  /** Windows grouped by their app entry (or app_id when unmatched). */
  groups() {
    const map = new Map();
    for (const w of windows.windows()) {
      const app = appdb.forWindow(w.appId, w.title);
      const key = app ? app.id : `win:${w.appId || w.id}`;
      if (!map.has(key)) map.set(key, { app, key, wins: [] });
      map.get(key).wins.push(w);
    }
    return map;
  }

  render() {
    const groups = this.groups();
    const items = [];
    const seen = new Set();
    for (const app of this.pinned()) {
      seen.add(app.id);
      items.push(this.item(app, app.id, groups.get(app.id), true));
    }
    const running = Array.from(groups.values()).filter((g) => !seen.has(g.key));
    if (running.length) {
      items.push(h('div.dock-sep'));
      for (const g of running) items.push(this.item(g.app, g.key, g, false));
    }
    items.push(h('div.dock-sep'));
    const grid = h('button.dock-item.dock-apps', h('span.dock-apps-glyph', icon('grid')));
    grid.addEventListener('click', () => this.shell.launcher.toggle());
    this.tooltip(grid, 'Applications');
    items.push(grid);

    this.inner.replaceChildren(...items);
    this.updateVisibility();
  }

  item(app, key, group, pinned) {
    const wins = group ? group.wins : [];
    const first = wins[0];
    const label = app ? app.name : (first && (first.title || first.appId)) || key;
    const iconEl = appIcon(app ? app.icon : first && first.appId, label, 64, 'dock-icon');
    const btn = h('button.dock-item', iconEl);
    const dots = h('span.dock-dots');
    for (let i = 0; i < Math.min(3, wins.length); i++) dots.appendChild(h('span.dock-dot'));
    btn.appendChild(dots);
    btn.classList.toggle('running', wins.length > 0);
    btn.classList.toggle('focused', wins.some((w) => w.focused));
    btn.classList.toggle('launching', this.launching.has(key) && wins.length === 0);
    if (wins.length > 0 && this.launching.has(key)) {
      clearTimeout(this.launching.get(key));
      this.launching.delete(key);
    }

    btn.addEventListener('click', () => this.activate(app, key, wins));
    btn.addEventListener('auxclick', (e) => {
      if (e.button === 1 && app) appdb.launch(app.id);
    });
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.hideTip();
      this.menu(app, key, wins, pinned, btn);
    });
    this.tooltip(btn, wins.length > 1 ? `${label} (${wins.length})` : label);
    return btn;
  }

  activate(app, key, wins) {
    if (wins.length === 0) {
      if (app) appdb.launch(app.id);
      return;
    }
    const focusedIdx = wins.findIndex((w) => w.focused);
    if (focusedIdx < 0) {
      windows.focus(wins[0].id);
      return;
    }
    // Already focused: step to the app's next window.
    if (wins.length > 1) {
      const next = wins[(focusedIdx + 1) % wins.length];
      windows.focus(next.id);
    }
  }

  menu(app, key, wins, pinned, anchor) {
    const items = [{ heading: app ? app.name : key }];
    for (const w of wins.slice(0, 8)) {
      items.push({ label: w.title || w.appId, icon: w.focused ? 'check' : 'maximize', action: () => windows.focus(w.id) });
    }
    if (wins.length) items.push({ separator: true });
    if (app) items.push({ label: 'New Window', icon: 'plus', action: () => appdb.launch(app.id) });
    if (app) {
      items.push(pinned
        ? { label: 'Unpin from Dock', icon: 'pin', action: () => this.setPinned(app.id, false) }
        : { label: 'Pin to Dock', icon: 'pin', action: () => this.setPinned(app.id, true) });
    }
    if (wins.length) {
      items.push({ separator: true });
      items.push({
        label: wins.length > 1 ? `Close ${wins.length} Windows` : 'Close',
        icon: 'x', danger: true, action: () => wins.forEach((w) => windows.close(w.id)),
      });
    }
    this.shell.menus.showAbove(items, anchor, { onClose: () => this.updateVisibility() });
    this.updateVisibility();
  }

  setPinned(id, on) {
    const ids = (settings.get('pinnedApps') || []).filter((x) => x !== id);
    if (on) ids.push(id);
    settings.set('pinnedApps', ids);
  }

  markLaunching(id) {
    if (!id) return;
    clearTimeout(this.launching.get(id));
    this.launching.set(id, setTimeout(() => {
      this.launching.delete(id);
      this.render();
    }, LAUNCH_FEEDBACK_MS));
    this.render();
  }

  // -- Tooltip ---------------------------------------------------------------

  tooltip(el, text) {
    el.addEventListener('pointerenter', () => {
      this.tip.textContent = text;
      this.tip.classList.remove('hidden');
      const r = el.getBoundingClientRect();
      const t = this.tip.getBoundingClientRect();
      this.tip.style.left = `${Math.round(r.left + r.width / 2 - t.width / 2)}px`;
      this.tip.style.top = `${Math.round(r.top - t.height - 10)}px`;
    });
    el.addEventListener('pointerleave', () => this.hideTip());
  }

  hideTip() {
    this.tip.classList.add('hidden');
  }

  // -- Autohide ----------------------------------------------------------------

  /** Whether a window on the active workspace covers the dock's area. */
  overlapped() {
    const r = this.inner.getBoundingClientRect();
    if (r.width === 0) return false;
    const ws = windows.activeWorkspace();
    return windows.windows().some((w) => {
      if (w.minimized) return false;
      if (ws && w.workspaceId != null && w.workspaceId !== ws.id) return false;
      const f = w.frame || w;
      if (!f || f.width == null) return false;
      return f.x < r.right && f.x + f.width > r.left && f.y + f.height > r.top - 8;
    });
  }

  updateVisibility() {
    const autohide = settings.get('dockAutohide');
    const busy = this.hovered || this.shell.menus.isOpen || this.shell.launcher.isOpen;
    let hide = false;
    if (autohide && !busy) {
      hide = this.overlapped();
      if (hide && this.revealed) hide = false;
    }
    if (!this.hovered && !this.shell.menus.isOpen) this.revealed = false;
    this.el.classList.toggle('tucked', hide);
    this.edge.classList.toggle('hidden', !hide);
  }
}
