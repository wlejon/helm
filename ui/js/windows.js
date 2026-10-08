/**
 * Windows and workspaces from bro.compositor. Outside DRM mode the binding
 * answers from a stand-in manager with no windows, which the shell treats
 * as an empty desktop. Subscribers hear 'windows', 'focus' and 'workspaces'.
 */

import { api, attempt } from './util.js';

class WindowState {
  constructor() {
    this.subs = new Map();
    this.queued = new Set();
    this.timer = null;
  }

  init() {
    const c = api('compositor');
    if (!c) return;
    const on = (ev, topic) => attempt(`compositor.on ${ev}`, () => c.on(ev, () => this.changed(topic)));
    on('windowCreated', 'windows');
    on('windowClosed', 'windows');
    on('windowChanged', 'windows');
    on('focusChanged', 'focus');
    on('workspaceChanged', 'workspaces');
    on('monitorsChanged', 'workspaces');
  }

  on(topic, fn) {
    if (!this.subs.has(topic)) this.subs.set(topic, new Set());
    this.subs.get(topic).add(fn);
  }

  changed(topic) {
    this.queued.add(topic);
    // A window change can move it between workspaces or change focus too.
    if (topic === 'windows') {
      this.queued.add('workspaces');
      this.queued.add('focus');
    }
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const topics = Array.from(this.queued);
      this.queued.clear();
      for (const t of topics) for (const fn of this.subs.get(t) || []) attempt(`windows ${t}`, () => fn());
    }, 16);
  }

  windows() {
    const c = api('compositor');
    if (!c) return [];
    const list = attempt('compositor.getWindows', () => c.getWindows(), []) || [];
    return list.filter((w) => w.shown !== false);
  }

  focused() {
    return this.windows().find((w) => w.focused) || null;
  }

  workspaces() {
    const c = api('compositor');
    if (!c) return [];
    return attempt('compositor.getWorkspaces', () => c.getWorkspaces(), []) || [];
  }

  activeWorkspace() {
    return this.workspaces().find((w) => w.active) || null;
  }

  focus(id) {
    const c = api('compositor');
    if (c) attempt('compositor.focusWindow', () => c.focusWindow(id));
    this.changed('focus');
  }

  close(id) {
    const c = api('compositor');
    if (c) attempt('compositor.closeWindow', () => c.closeWindow(id));
  }

  switchWorkspace(id) {
    const c = api('compositor');
    if (c) attempt('compositor.switchWorkspace', () => c.switchWorkspace(id));
    this.changed('workspaces');
  }

  /** Switch to the workspace at `index` (0-based), creating it if missing. */
  switchToIndex(index) {
    const c = api('compositor');
    if (!c) return;
    let list = this.workspaces();
    while (list.length <= index && list.length < 9) {
      const active = list.find((w) => w.active);
      attempt('compositor.createWorkspace', () => c.createWorkspace(active ? active.monitor : undefined));
      const next = this.workspaces();
      if (next.length === list.length) break;
      list = next;
    }
    if (list[index]) this.switchWorkspace(list[index].id);
  }

  moveToWorkspace(winId, wsId) {
    const c = api('compositor');
    if (c) attempt('compositor.moveWindowToWorkspace', () => c.moveWindowToWorkspace(winId, wsId, false));
    this.changed('windows');
  }
}

export const windows = new WindowState();
