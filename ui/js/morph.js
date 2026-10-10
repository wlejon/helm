/**
 * Shared-element motion. A panel does not appear above its island: the
 * island's own glass grows up out of the bar into it. morphIn() animates the panel's box from
 * the island's rect to its laid-out rect (left/top/width/height/radius on a
 * spring) while the panel's body, laid out at its final width and clipped
 * by the growing box, fades up behind it; morphOut() runs the same path
 * back. The island hides while its panel is open, so there is only ever
 * one piece of glass.
 *
 * panels is the one-open-at-a-time manager the islands use: open(panel,
 * island), close(), toggle(), resize(mutate) for content that changes
 * height while open, and outside-click / Escape dismissal.
 */

import { attempt } from './util.js';

export const SPRING = 'linear(0, 0.0365, 0.1251, 0.2406, 0.3655, 0.4877, 0.6001, 0.6985, 0.7814, '
  + '0.8488, 0.9019, 0.9422, 0.9717, 0.9923, 1.0059, 1.0142, 1.0184, 1.0199, 1.0195, 1.0179, 1.0156, '
  + '1.0132, 1.0107, 1.0084, 1)';
export const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const EASE_STD = 'cubic-bezier(0.4, 0, 0.2, 1)';
export const EASE_EXIT = 'cubic-bezier(0.4, 0, 0.9, 0.6)';

export const MORPH_MS = 480;
export const UNMORPH_MS = 300;

const px = (v) => `${Math.round(v * 10) / 10}px`;

/** The corner radius panels and modal surfaces settle at (--r-panel). */
export const R_PANEL = 14;

/** How far the bar's outer islands sit from the screen's sides (islands.css). */
const EDGE = 4;

/** An element's box, with its corner radius so a morph starts from its shape. */
export function rectOf(el) {
  const r = el.getBoundingClientRect();
  const radius = parseFloat(attempt('getComputedStyle', () => getComputedStyle(el).borderTopLeftRadius, '')) || 0;
  return { left: r.left, top: r.top, width: r.width, height: r.height, radius: Math.min(radius, r.height / 2) };
}

/** element.animate when the engine has it; a no-op stand-in otherwise. */
export function animate(el, frames, opts) {
  if (!el || typeof el.animate !== 'function') return null;
  return attempt('element.animate', () => el.animate(frames, opts));
}

function cancel(a) {
  if (a && typeof a.cancel === 'function') attempt('animation.cancel', () => a.cancel());
}

/**
 * While the box morphs, pin the body to the edge its island owns, so the
 * growing glass uncovers it from that side (flex alignment would clamp an
 * overflowing body to the left).
 */
function pinBody(el, body, align, ms) {
  if (!body) return;
  const w = body.getBoundingClientRect().width;
  body.classList.add('morph-body');
  body.style.setProperty('--morph-half', `${-Math.round(w / 2)}px`);
  el.dataset.align = align || 'center';
  el.classList.add('morphing');
  clearTimeout(el._unpin);
  el._unpin = setTimeout(() => el.classList.remove('morphing'), ms);
}

function boxFrame(r, radius) {
  return { left: px(r.left), top: px(r.top), width: px(r.width), height: px(r.height), borderRadius: px(radius) };
}

/**
 * Grow `el` (position: fixed, already laid out where it should end) out
 * of the rect `from`. `body` is the content inside, faded in once the box
 * has cleared it.
 */
export function morphIn(el, from, { body, align, fromRadius, toRadius = R_PANEL, duration = MORPH_MS } = {}) {
  const to = rectOf(el);
  pinBody(el, body, align, duration);
  const anims = [animate(el, [boxFrame(from, fromRadius ?? from.radius ?? 0), boxFrame(to, toRadius)],
    { duration, easing: SPRING })];
  if (body) {
    // The glass grows up out of the bar: the body rises with it.
    anims.push(animate(body, [
      { opacity: 0, transform: 'translateY(10px) scale(0.98)' },
      { opacity: 0, transform: 'translateY(10px) scale(0.98)', offset: 0.18 },
      { opacity: 1, transform: 'none' },
    ], { duration: duration * 0.85, easing: EASE_OUT }));
  }
  return anims;
}

/** Shrink `el` back into the rect `to`; fn runs when it gets there. */
export function morphOut(el, to, { body, align, toRadius, duration = UNMORPH_MS, done } = {}) {
  const from = rectOf(el);
  pinBody(el, body, align, duration + 40);
  const anims = [animate(el, [boxFrame(from, from.radius || R_PANEL), boxFrame(to, toRadius ?? to.radius ?? 0)],
    { duration, easing: EASE_STD, fill: 'forwards' })];
  if (body) {
    anims.push(animate(body, [{ opacity: 1 }, { opacity: 0 }],
      { duration: duration * 0.45, easing: EASE_STD, fill: 'forwards' }));
  }
  setTimeout(() => {
    for (const a of anims) cancel(a);
    if (done) done();
  }, duration);
  return anims;
}

/**
 * Animate a height change made by `mutate` (a re-render while open), so a
 * panel growing a Wi-Fi list eases rather than jumps.
 */
export function animateHeight(el, mutate, duration = 260) {
  const before = el.getBoundingClientRect().height;
  mutate();
  const after = el.getBoundingClientRect().height;
  if (Math.abs(after - before) < 1.5) return;
  animate(el, [{ height: px(before) }, { height: px(after) }], { duration, easing: EASE_OUT });
}

/** Animate an island's width change made by `mutate` (FLIP on width). */
export function animateWidth(el, mutate, duration = 420) {
  const before = el.getBoundingClientRect().width;
  mutate();
  const after = el.getBoundingClientRect().width;
  if (!before || Math.abs(after - before) < 1.5) return;
  animate(el, [{ width: px(before) }, { width: px(after) }], { duration, easing: SPRING });
}

// ---------------------------------------------------------------------------
// The panel manager
// ---------------------------------------------------------------------------

/**
 * A panel is { el, body, island, align, radius?, onOpen?, onClose? }: el the
 * fixed glass box (class .panel), body its content, island the element it
 * grows out of, align 'left' | 'center' | 'right' against that island.
 */
class PanelManager {
  constructor() {
    this.current = null;
    this.closing = new Set();
    document.addEventListener('pointerdown', (e) => {
      const p = this.current;
      if (!p) return;
      if (p.el.contains(e.target)) return;
      if (p.island && p.island.contains(e.target)) return;
      if (p.keepOpen && p.keepOpen(e.target)) return;
      this.close();
    }, true);
  }

  isOpen(panel) {
    return !!this.current && (panel === undefined || this.current === panel);
  }

  toggle(panel) {
    if (this.current === panel) this.close();
    else this.open(panel);
  }

  open(panel) {
    if (this.current === panel) return;
    if (this.current) this.close({ instant: true });
    const { el, body, island } = panel;
    this.current = panel;
    el.classList.remove('hidden', 'closing');
    el.style.height = '';
    if (panel.onOpen) panel.onOpen();
    this.place(panel);
    const from = island ? rectOf(island) : null;
    if (island) island.classList.add('morphed');
    if (from && from.width > 0) {
      morphIn(el, from, { body, align: panel.align, toRadius: panel.radius ?? R_PANEL });
    }
    window.dispatchEvent(new CustomEvent('helm:overlay'));
  }

  /**
   * Stand the panel's box on its island's bottom edge, beside it; the body
   * sets its width and height, so the panel grows upward.
   */
  place(panel) {
    const { el, island, align = 'center' } = panel;
    const vw = window.innerWidth;
    const w = el.getBoundingClientRect().width;
    let left;
    if (!island) left = (vw - w) / 2;
    else {
      const r = island.getBoundingClientRect();
      if (align === 'left') left = r.left;
      else if (align === 'right') left = r.right - w;
      else left = r.left + r.width / 2 - w / 2;
      el.style.top = 'auto';
      el.style.bottom = `${Math.round(window.innerHeight - r.bottom)}px`;
    }
    // Kept on screen, no closer to its edges than the bar's islands are.
    left = Math.max(EDGE, Math.min(vw - w - EDGE, left));
    el.style.left = `${Math.round(left)}px`;
    el.style.right = 'auto';
  }

  close({ instant = false } = {}) {
    const panel = this.current;
    if (!panel) return;
    this.current = null;
    const { el, body, island } = panel;
    const finish = () => {
      if (this.current === panel) return;
      el.classList.add('hidden');
      el.classList.remove('closing');
      if (island) {
        island.classList.remove('morphed');
        animate(island, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: EASE_OUT });
      }
    };
    if (panel.onClose) attempt('panel onClose', () => panel.onClose());
    if (instant || !island) finish();
    else {
      el.classList.add('closing');
      morphOut(el, rectOf(island), { body, align: panel.align, done: finish });
    }
    window.dispatchEvent(new CustomEvent('helm:overlay'));
  }

  /** Re-render the open panel's content, easing its height. */
  resize(panel, mutate) {
    if (this.current !== panel) {
      mutate();
      return;
    }
    animateHeight(panel.el, mutate);
  }
}

export const panels = new PanelManager();
