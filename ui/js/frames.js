/**
 * Server-side window frames and the snap preview.
 *
 * bro's compositor draws decorated windows (xdg-decoration server-side ones,
 * X11 windows without their own frame) inside a band the shell declares with
 * setDecorations(), and treats any element carrying data-window-frame="<id>"
 * as that window's frame: it positions the element on the window's outer
 * rect, stacks it just below the window, and marks it with
 * data-window-state / data-window-snap / data-window-focused. Everything
 * the frame looks like and does is ours: a glass title bar with the app's
 * icon, title and buttons, an invisible resize band, the focus glow.
 *
 * The snap preview is the accent glass that shows where a dragged window
 * will land (the compositor's 'snapPreview' event) when it arms a snap at a
 * screen edge.
 */

import { h, $, api, attempt, appIcon } from './util.js';
import { icon } from './icons.js';
import { appdb } from './appdb.js';
import { windows } from './windows.js';

/**
 * The frame band. The title bar is the top inset; the sides and bottom are
 * an invisible resize grab, with a 1px rim of the frame's glass showing
 * against the client. Maximized windows keep only the title bar.
 */
export const INSETS = { top: 38, left: 6, right: 6, bottom: 6 };
export const MAXIMIZED_INSETS = { top: 38, left: 0, right: 0, bottom: 0 };

/** Resize grips: [class, edges for beginResize]. */
const EDGES = [
  ['n', 'top'], ['s', 'bottom'], ['w', 'left'], ['e', 'right'],
  ['nw', 'top left'], ['ne', 'top right'], ['sw', 'bottom left'], ['se', 'bottom right'],
];

export class Frames {
  constructor(shell) {
    this.shell = shell;
    this.frames = new Map(); // window id -> { el, title, iconKey, titleEl, iconEl, maxBtn }
    this.enabled = false;
  }

  init() {
    this.layer = $('#window-frames');
    this.preview = $('#snap-preview');
    const c = api('compositor');
    if (!c || !this.layer || !windows.hasFrames()) return;
    const deco = attempt('compositor.setDecorations',
      () => c.setDecorations({ insets: INSETS, maximizedInsets: MAXIMIZED_INSETS }), null);
    if (!deco) return;
    this.enabled = true;
    this.layer.style.setProperty('--wf-top', `${INSETS.top}px`);
    this.layer.style.setProperty('--wf-left', `${INSETS.left}px`);
    this.layer.style.setProperty('--wf-right', `${INSETS.right}px`);
    this.layer.style.setProperty('--wf-bottom', `${INSETS.bottom}px`);

    // Created and closed windows sync straight from the compositor's events,
    // so a new window's frame exists in the frame it maps; the debounced
    // topic catches title and app changes.
    for (const ev of ['windowCreated', 'windowClosed', 'windowChanged']) {
      attempt(`compositor.on ${ev}`, () => c.on(ev, () => this.sync()));
    }
    attempt('compositor.on snapPreview', () => c.on('snapPreview', (e) => this.showPreview(e)));
    windows.on('windows', () => this.sync());
    appdb.onChange(() => this.sync(true));
    this.sync();
  }

  /** The frame element of window `id`, or null. */
  frameFor(id) {
    const f = this.frames.get(id);
    return f ? f.el : null;
  }

  /** One frame per decorated window; drop the rest. */
  sync(refreshIcons = false) {
    if (!this.enabled) return;
    const c = api('compositor');
    const list = attempt('compositor.getWindows', () => c.getWindows(), []) || [];
    const live = new Set();
    for (const w of list) {
      if (!w.decorated) continue;
      live.add(w.id);
      let f = this.frames.get(w.id);
      if (!f) {
        f = this.build(w.id);
        this.frames.set(w.id, f);
        this.layer.appendChild(f.el);
      }
      this.update(f, w, refreshIcons);
    }
    for (const [id, f] of this.frames) {
      if (live.has(id)) continue;
      f.el.remove();
      this.frames.delete(id);
    }
  }

  build(id) {
    const titleEl = h('span.wf-title');
    const iconSlot = h('span.wf-icon-slot');
    const btn = (cls, glyph, label, action) => {
      const b = h(`button.wf-btn.${cls}`, { title: label, 'aria-label': label }, icon(glyph));
      // The press stays the button's: no move starts from it.
      b.addEventListener('mousedown', (e) => e.stopPropagation());
      b.addEventListener('dblclick', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        action();
      });
      return b;
    };
    const maxBtn = btn('wf-max', 'window-max', 'Maximize', () => windows.toggleMaximize(id));
    const buttons = h('div.wf-buttons',
      btn('wf-min', 'window-min', 'Minimize', () => windows.minimize(id)),
      maxBtn,
      btn('wf-close', 'window-close', 'Close', () => windows.close(id)));

    const bar = h('div.wf-bar', iconSlot, titleEl, buttons);
    bar.addEventListener('mousedown', (e) => {
      if (e.button === 0) windows.beginMove(id);
    });
    bar.addEventListener('dblclick', () => windows.toggleMaximize(id));
    bar.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.menu(id, e.clientX, e.clientY);
    });

    const el = h('div.wframe', { 'data-window-frame': String(id) }, h('div.wf-chrome', h('div.wf-seam')), bar);
    for (const [cls, edges] of EDGES) {
      const grip = h(`div.wf-edge.wf-${cls}`);
      grip.addEventListener('mousedown', (e) => {
        if (e.button === 0) windows.beginResize(id, edges);
      });
      el.appendChild(grip);
    }
    return { el, titleEl, iconSlot, maxBtn, title: null, iconKey: null, maximized: null };
  }

  update(f, w, refreshIcons) {
    const app = appdb.forWindow(w.appId, w.title);
    const name = app ? app.name : w.appId || 'Window';
    const title = w.title || name;
    if (f.title !== title) {
      f.title = title;
      f.titleEl.textContent = title;
      f.el.setAttribute('aria-label', title);
    }
    const iconKey = `${app ? app.icon : w.appId}|${name}`;
    if (f.iconKey !== iconKey || refreshIcons) {
      f.iconKey = iconKey;
      f.iconSlot.replaceChildren(appIcon(app ? app.icon : w.appId, name, 32, 'wf-icon'));
    }
    const maximized = !!w.maximized;
    if (f.maximized !== maximized) {
      f.maximized = maximized;
      const label = maximized ? 'Restore' : 'Maximize';
      f.maxBtn.replaceChildren(icon(maximized ? 'window-restore' : 'window-max'));
      f.maxBtn.title = label;
      f.maxBtn.setAttribute('aria-label', label);
    }
  }

  menu(id, x, y) {
    const c = api('compositor');
    const w = c ? attempt('compositor.getWindow', () => c.getWindow(id), null) : null;
    if (!w) return;
    const snapped = !w.maximized && w.snap && w.snap !== 'none' && w.snap !== 'maximize';
    this.shell.menus.show([
      { heading: w.title || w.appId || 'Window' },
      { label: 'Minimize', icon: 'window-min', action: () => windows.minimize(id) },
      w.maximized
        ? { label: 'Restore', icon: 'window-restore', action: () => windows.restore(id) }
        : { label: 'Maximize', icon: 'window-max', action: () => windows.maximize(id) },
      snapped ? { label: 'Unsnap', icon: 'window-restore', action: () => windows.snap(id, 'none') } : null,
      { label: 'Snap Left', icon: 'snap-left', action: () => windows.snap(id, 'left') },
      { label: 'Snap Right', icon: 'snap-right', action: () => windows.snap(id, 'right') },
      { separator: true },
      { label: 'Close', icon: 'x', danger: true, action: () => windows.close(id) },
    ], x, y);
  }

  // -- Snap preview ------------------------------------------------------------

  /**
   * e: { windowId, zone, rect } with rect where the window's outer frame
   * lands, or null when the drag leaves the edge or ends. A fresh preview
   * grows out of the dragged window; a moving one glides between zones.
   */
  showPreview(e) {
    const el = this.preview;
    if (!el) return;
    clearTimeout(this.previewTimer);
    const r = e && e.rect;
    if (!r) {
      el.classList.remove('shown');
      this.previewTimer = setTimeout(() => el.classList.add('hidden'), 220);
      return;
    }
    const place = (x) => {
      el.style.left = `${x.x}px`;
      el.style.top = `${x.y}px`;
      el.style.width = `${x.width}px`;
      el.style.height = `${x.height}px`;
    };
    if (!el.classList.contains('shown')) {
      // Start from the window being dragged, without a transition.
      const c = api('compositor');
      const w = c ? attempt('compositor.getWindow', () => c.getWindow(e.windowId), null) : null;
      el.classList.add('instant');
      el.classList.remove('hidden');
      place(w && w.outerFrame ? w.outerFrame : r);
      el.getBoundingClientRect();
      el.classList.remove('instant');
      el.classList.add('shown');
    }
    el.dataset.zone = e.zone || '';
    place(r);
  }
}
