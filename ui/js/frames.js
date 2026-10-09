/**
 * Server-side window frames, borderless windows' corner controls, and the
 * snap preview.
 *
 * bro's compositor draws decorated windows (xdg-decoration server-side ones,
 * X11 windows without their own frame) inside a band the shell declares with
 * setDecorations(), and treats any element carrying data-window-frame="<id>"
 * as that window's frame: it positions the element on the window's outer
 * rect, stacks it just below the window, and marks it with
 * data-window-state / data-window-snap / data-window-focused /
 * data-window-borderless. Everything the frame looks like and does is ours:
 * a slim title bar with the app's icon, title and buttons, a 1px rim with
 * resize grips reaching past it, the focus glow.
 *
 * Borderless windows (a zero band: maximized ones, since MAXIMIZED_INSETS is
 * zero) keep their frame, the size of the client, with no trim. Their
 * controls are a data-window-overlay in the frame, which bro paints over the
 * client and routes the pointer to first: a hot corner a few pixels square
 * at the window's top-right that opens a compact pill (title, minimize,
 * restore, close). None of this keys on maximize: any window the compositor
 * gives a zero band gets the same corner.
 *
 * The snap preview is the accent glass that shows where a dragged window
 * will land (the compositor's 'snapPreview' event) when it arms a snap at a
 * screen edge.
 */

import { h, $, api, attempt, windowIcon } from './util.js';
import { icon } from './icons.js';
import { appdb } from './appdb.js';
import { windows } from './windows.js';

/**
 * The frame band: a slim title bar on top, a 1px rim elsewhere (the resize
 * grips reach past it, outside the band). Maximized windows are borderless.
 */
export const INSETS = { top: 28, left: 1, right: 1, bottom: 1 };
export const MAXIMIZED_INSETS = { top: 0, left: 0, right: 0, bottom: 0 };

/** How long the corner pill stays after the pointer leaves it. */
const CORNER_LINGER_MS = 450;

/** Resize grips: [class, edges for beginResize]. */
const EDGES = [
  ['n', 'top'], ['s', 'bottom'], ['w', 'left'], ['e', 'right'],
  ['nw', 'top left'], ['ne', 'top right'], ['sw', 'bottom left'], ['se', 'bottom right'],
];

export class Frames {
  constructor(shell) {
    this.shell = shell;
    this.frames = new Map(); // window id -> the parts build() returns
    this.controls = null;    // { id, el, f } while Super+. controls hold the keyboard
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
    // A press outside open keyboard controls puts them away.
    document.addEventListener('pointerdown', (e) => {
      if (this.controls && !this.controls.el.contains(e.target)) this.hideControls();
    }, true);

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
      if (this.controls && this.controls.id === id) this.controls = null;
      f.el.remove();
      this.frames.delete(id);
    }
  }

  /** Minimize, maximize / restore and close for window `id`, as one row. */
  buttons(id) {
    const btn = (cls, glyph, label, action) => {
      const b = h(`button.wf-btn.${cls}`, { title: label, 'aria-label': label }, icon(glyph));
      // The press stays the button's: no move starts from it.
      b.addEventListener('mousedown', (e) => e.stopPropagation());
      b.addEventListener('dblclick', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideControls();
        action();
      });
      return b;
    };
    const max = btn('wf-max', 'window-max', 'Maximize', () => windows.toggleMaximize(id));
    const row = h('div.wf-buttons',
      btn('wf-min', 'window-min', 'Minimize', () => windows.minimize(id)),
      max,
      btn('wf-close', 'window-close', 'Close', () => windows.close(id)));
    return { row, max };
  }

  /** A title area: a press moves the window, a double click maximizes or restores. */
  grabbable(el, id) {
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) windows.beginMove(id);
    });
    el.addEventListener('dblclick', () => windows.toggleMaximize(id));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.menu(id, e.clientX, e.clientY);
    });
  }

  build(id) {
    const titleEl = h('span.wf-title');
    const iconSlot = h('span.wf-icon-slot');
    const barButtons = this.buttons(id);
    const bar = h('div.wf-bar', iconSlot, titleEl, barButtons.row);
    this.grabbable(bar, id);

    // The borderless corner: painted over the client (data-window-overlay).
    const pillTitle = h('span.wf-title');
    const pillButtons = this.buttons(id);
    const pill = h('div.wf-pill', pillTitle, pillButtons.row);
    this.grabbable(pill, id);
    const hot = h('div.wf-hot');
    const corner = h('div.wf-corner', { 'data-window-overlay': '' }, hot, pill);
    hot.addEventListener('pointerenter', () => this.openCorner(f));
    pill.addEventListener('pointerenter', () => clearTimeout(f.cornerTimer));
    pill.addEventListener('pointerleave', () => {
      if (this.controls && this.controls.id === id) return;
      clearTimeout(f.cornerTimer);
      f.cornerTimer = setTimeout(() => corner.classList.remove('open'), CORNER_LINGER_MS);
    });
    corner.addEventListener('keydown', (e) => this.controlsKey(e));
    bar.addEventListener('keydown', (e) => this.controlsKey(e));

    const el = h('div.wframe', { 'data-window-frame': String(id) },
      h('div.wf-chrome', h('div.wf-seam')), bar, corner);
    for (const [cls, edges] of EDGES) {
      const grip = h(`div.wf-edge.wf-${cls}`);
      grip.addEventListener('mousedown', (e) => {
        if (e.button === 0) windows.beginResize(id, edges);
      });
      el.appendChild(grip);
    }
    const f = {
      id, el, bar, corner, pill, titleEl, pillTitle, iconSlot, maxBtns: [barButtons.max, pillButtons.max],
      title: null, iconKey: null, maximized: null, cornerTimer: 0,
    };
    return f;
  }

  openCorner(f) {
    clearTimeout(f.cornerTimer);
    f.corner.classList.add('open');
  }

  // -- Keyboard controls (Super+.) --------------------------------------------

  /** Whether a window's controls hold the keyboard. */
  get controlsOpen() {
    return !!this.controls;
  }

  /**
   * Show window `id`'s controls: the corner pill of a borderless window, the
   * title bar's buttons otherwise. With keyboard, they take the keyboard
   * (data-shell-keyboard) and the first button takes focus.
   */
  showControls(id, { keyboard = false } = {}) {
    const f = this.frames.get(id);
    if (!f || !f.el.isConnected || f.el.style.display === 'none') return false;
    this.hideControls();
    const borderless = f.el.hasAttribute('data-window-borderless');
    if (borderless) this.openCorner(f);
    if (!keyboard) return true;
    const host = borderless ? f.corner : f.bar;
    host.setAttribute('data-shell-keyboard', '');
    this.controls = { id, el: host, f };
    const first = host.querySelector('.wf-btn');
    if (first) first.focus();
    return true;
  }

  hideControls() {
    const c = this.controls;
    if (!c) return;
    this.controls = null;
    c.el.removeAttribute('data-shell-keyboard');
    if (c.el.contains(document.activeElement)) document.activeElement.blur();
    c.f.corner.classList.remove('open');
  }

  /** Arrows step between the buttons; Escape (the shell's) puts them away. */
  controlsKey(e) {
    if (!this.controls || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    const btns = Array.from(this.controls.el.querySelectorAll('.wf-btn'));
    const i = btns.indexOf(document.activeElement);
    const next = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
    if (next) next.focus();
    e.preventDefault();
  }

  update(f, w, refreshIcons) {
    const app = appdb.forWindow(w.appId, w.title);
    const name = app ? app.name : w.appId || 'Window';
    const title = w.title || name;
    if (f.title !== title) {
      f.title = title;
      f.titleEl.textContent = title;
      f.pillTitle.textContent = title;
      f.el.setAttribute('aria-label', title);
    }
    const iconKey = `${app ? app.icon : w.appId}|${name}|${w.iconSerial || 0}`;
    if (f.iconKey !== iconKey || refreshIcons) {
      f.iconKey = iconKey;
      f.iconSlot.replaceChildren(windowIcon(w, app, name, 32, 'wf-icon'));
    }
    const maximized = !!w.maximized;
    if (f.maximized !== maximized) {
      f.maximized = maximized;
      // A change of state puts open controls away (the corner may be gone).
      if (this.controls && this.controls.f === f) this.hideControls();
      f.corner.classList.remove('open');
      const label = maximized ? 'Restore' : 'Maximize';
      for (const b of f.maxBtns) {
        b.replaceChildren(icon(maximized ? 'window-restore' : 'window-max'));
        b.title = label;
        b.setAttribute('aria-label', label);
      }
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
