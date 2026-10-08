/**
 * On-screen display for volume and brightness: the status island stretches
 * into a level meter (the same shared-element morph the panels use), holds
 * while keys keep coming, and folds back.
 */

import { h, $ } from './util.js';
import { icon } from './icons.js';
import { morphIn, morphOut, rectOf } from './morph.js';

const HOLD_MS = 1500;

export class Osd {
  init() {
    this.el = $('#osd');
    this.island = $('#island-right');
    this.timer = null;
    this.open = false;
    this.glyph = h('span.osd-glyph');
    this.fill = h('div.osd-fill');
    this.value = h('span.osd-value.num');
    this.el.replaceChildren(this.glyph, h('div.osd-bar', this.fill), this.value);
  }

  show(iconName, value01) {
    const pct = Math.round(Math.max(0, Math.min(1, value01)) * 100);
    this.glyph.replaceChildren(icon(iconName));
    this.fill.style.width = `${pct}%`;
    this.value.textContent = String(pct);
    this.el.classList.toggle('muted', iconName === 'volume-x');
    if (!this.open) {
      this.open = true;
      this.el.classList.remove('hidden');
      // Mid-fold (morphedIsland still set) the box simply stays out.
      const from = !this.morphedIsland && this.island && !this.island.classList.contains('morphed')
        ? rectOf(this.island) : null;
      if (from && from.width > 0) {
        this.island.classList.add('morphed');
        this.morphedIsland = true;
        morphIn(this.el, from, { fromRadius: from.height / 2, toRadius: from.height / 2, duration: 420 });
      }
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hide(), HOLD_MS);
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    const done = () => {
      if (this.open) return;
      this.el.classList.add('hidden');
      if (this.morphedIsland) {
        this.morphedIsland = false;
        this.island.classList.remove('morphed');
      }
    };
    if (this.morphedIsland) morphOut(this.el, rectOf(this.island), { duration: 260, done });
    else done();
  }
}
