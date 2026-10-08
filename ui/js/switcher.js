/**
 * Window switcher (Alt+Tab / Super+Tab): windows of the active workspace in
 * most-recently-focused order. Tab and Shift+Tab (or the arrows) move,
 * releasing the modifier or Enter focuses, Escape cancels.
 */

import { h, $, appIcon } from './util.js';
import { windows } from './windows.js';
import { appdb } from './appdb.js';

export class Switcher {
  constructor(shell) {
    this.shell = shell;
    this.isOpen = false;
    this.list = [];
    this.index = 0;
    this.modifier = 'Alt';
  }

  init() {
    this.el = $('#switcher');
    window.addEventListener('keydown', (e) => this.onKeyDown(e), true);
    window.addEventListener('keyup', (e) => this.onKeyUp(e), true);
  }

  /** Windows of the active workspace, most recently focused first. */
  ordered() {
    const ws = windows.activeWorkspace();
    let wins = windows.windows();
    if (ws) wins = wins.filter((w) => w.workspaceId == null || w.workspaceId === ws.id);
    const order = ws && Array.isArray(ws.focusOrder) ? ws.focusOrder : [];
    const rank = (w) => {
      if (w.focused) return -1;
      const i = order.indexOf(w.id);
      return i < 0 ? 1e6 : i;
    };
    return wins.slice().sort((a, b) => rank(a) - rank(b));
  }

  open(modifier, step) {
    this.list = this.ordered();
    if (this.list.length === 0) return;
    this.shell.closeTransient();
    this.modifier = modifier;
    this.isOpen = true;
    this.index = this.list.length > 1 ? (step > 0 ? 1 : this.list.length - 1) : 0;
    this.render();
    this.el.classList.remove('hidden');
  }

  /**
   * One Tab of Alt+Tab / Super+Tab (Shift: backwards): opens the switcher,
   * or moves the selection while it is open. `modifier` is the key whose
   * release commits ('Alt' or 'Meta').
   */
  step(modifier, dir) {
    if (this.isOpen) this.move(dir);
    else this.open(modifier, dir);
  }

  render() {
    const cards = this.list.map((w, i) => {
      const app = appdb.forWindow(w.appId, w.title);
      const name = app ? app.name : w.appId || 'Window';
      const card = h('div.switcher-card',
        appIcon(app ? app.icon : w.appId, name, 64, 'switcher-icon'),
        h('div.switcher-title', w.title || name));
      card.classList.toggle('selected', i === this.index);
      card.addEventListener('click', () => {
        this.index = i;
        this.commit();
      });
      return card;
    });
    this.el.replaceChildren(h('div.switcher-panel', cards));
  }

  move(step) {
    if (!this.list.length) return;
    this.index = (this.index + step + this.list.length) % this.list.length;
    this.render();
  }

  commit() {
    const w = this.list[this.index];
    this.close();
    if (w) windows.focus(w.id);
  }

  close() {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  onKeyDown(e) {
    if (this.shell.lock.isLocked) return;
    if (e.key === 'Tab' && (e.altKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      this.step(e.metaKey ? 'Meta' : 'Alt', e.shiftKey ? -1 : 1);
      return;
    }
    if (!this.isOpen) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') this.close();
    else if (e.key === 'Enter') this.commit();
    else if (e.key === 'ArrowRight') this.move(1);
    else if (e.key === 'ArrowLeft') this.move(-1);
  }

  onKeyUp(e) {
    if (this.isOpen && e.key === this.modifier) {
      e.preventDefault();
      this.commit();
    }
  }
}
