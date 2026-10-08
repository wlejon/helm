/**
 * On-screen display for volume and brightness changes: an icon and a level
 * bar that fades after a moment.
 */

import { h, $ } from './util.js';
import { icon } from './icons.js';

export class Osd {
  init() {
    this.el = $('#osd');
    this.timer = null;
  }

  show(iconName, value01) {
    const pct = Math.round(Math.max(0, Math.min(1, value01)) * 100);
    this.el.replaceChildren(
      icon(iconName),
      h('div.osd-bar', h('div.osd-fill', { style: { width: `${pct}%` } })),
      h('span.osd-value', String(pct)));
    if (this.el.classList.contains('hidden')) {
      this.el.classList.remove('hidden', 'leaving');
    } else {
      this.el.classList.remove('leaving');
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.el.classList.add('leaving');
      this.timer = setTimeout(() => this.el.classList.add('hidden'), 220);
    }, 1400);
  }
}
