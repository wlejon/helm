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
    if (!c) return;
    // A minimized window comes back first (restoring also focuses it).
    const w = attempt('compositor.getWindow', () => c.getWindow(id), null);
    if (w && w.minimized && typeof c.restoreWindow === 'function') {
      attempt('compositor.restoreWindow', () => c.restoreWindow(id));
      this.changed('windows');
      return;
    }
    attempt('compositor.focusWindow', () => c.focusWindow(id));
    this.changed('focus');
  }

  close(id) {
    const c = api('compositor');
    if (c) attempt('compositor.closeWindow', () => c.closeWindow(id));
  }

  /** Whether the compositor offers window states (minimize / maximize / restore). */
  hasStates() {
    const c = api('compositor');
    return !!c && typeof c.maximizeWindow === 'function';
  }

  minimize(id) {
    const c = api('compositor');
    if (c && typeof c.minimizeWindow === 'function') attempt('compositor.minimizeWindow', () => c.minimizeWindow(id));
    this.changed('windows');
  }

  maximize(id) {
    const c = api('compositor');
    if (c && typeof c.maximizeWindow === 'function') attempt('compositor.maximizeWindow', () => c.maximizeWindow(id));
    this.changed('windows');
  }

  restore(id) {
    const c = api('compositor');
    if (c && typeof c.restoreWindow === 'function') attempt('compositor.restoreWindow', () => c.restoreWindow(id));
    this.changed('windows');
  }

  /** Maximize, or restore a maximized window (a snapped half maximizes). */
  toggleMaximize(id) {
    const c = api('compositor');
    const w = c ? attempt('compositor.getWindow', () => c.getWindow(id), null) : null;
    if (!w) return;
    if (w.maximized) this.restore(id);
    else this.maximize(id);
  }

  /**
   * The Super+arrow step: 'left' / 'right' snap to that half (from the other
   * half, restore), 'up' maximizes, 'down' restores a maximized or snapped
   * window and minimizes a normal one. The compositor owns the rules.
   */
  snapToward(id, dir) {
    const c = api('compositor');
    if (!c || id == null || typeof c.snapWindowToward !== 'function') return false;
    const ok = attempt(`compositor.snapWindowToward ${dir}`, () => c.snapWindowToward(id, dir), false);
    this.changed('windows');
    return !!ok;
  }

  /** Fit a window to a zone of its work area ('left', 'right', 'maximize', 'none'...). */
  snap(id, zone) {
    const c = api('compositor');
    if (c && typeof c.snapWindow === 'function') attempt(`compositor.snapWindow ${zone}`, () => c.snapWindow(id, zone));
    this.changed('windows');
  }

  /** Whether the compositor draws shell frames (bro with setDecorations). */
  hasFrames() {
    const c = api('compositor');
    return !!c && typeof c.setDecorations === 'function' && typeof c.beginMove === 'function';
  }

  /** Start an interactive move from a press on a window's title bar. */
  beginMove(id) {
    const c = api('compositor');
    return !!c && typeof c.beginMove === 'function' && !!attempt('compositor.beginMove', () => c.beginMove(id), false);
  }

  /** Start an interactive resize from a press on a frame edge ('top left', 'bottom'...). */
  beginResize(id, edges) {
    const c = api('compositor');
    return !!c && typeof c.beginResize === 'function'
      && !!attempt('compositor.beginResize', () => c.beginResize(id, edges), false);
  }

  /**
   * Reserve a band along a screen edge for a shell panel, so maximized and
   * tiled windows stay clear of it. Returns the reservation id (0: none).
   */
  reserveEdge(edge, thickness) {
    const c = api('compositor');
    if (!c || typeof c.reserveEdge !== 'function' || !(thickness > 0)) return 0;
    return attempt(`compositor.reserveEdge ${edge}`, () => c.reserveEdge(edge, Math.round(thickness)), 0) || 0;
  }

  releaseEdge(id) {
    const c = api('compositor');
    if (id && c && typeof c.releaseEdge === 'function') attempt('compositor.releaseEdge', () => c.releaseEdge(id));
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
