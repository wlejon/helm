/**
 * Shell controls built from divs, so they look the same everywhere:
 * Slider (drag, click, wheel) and Switch.
 */

import { h, clamp } from './util.js';
import { icon } from './icons.js';

export class Slider {
  /**
   * @param {object} o
   * @param {string} o.icon       icon drawn inside the fill
   * @param {(v:number)=>void} o.onInput   live while dragging, v in 0..1
   * @param {(v:number)=>void} [o.onCommit] once on release
   */
  constructor({ icon: iconName, onInput, onCommit }) {
    this.value = 0;
    this.onInput = onInput;
    this.onCommit = onCommit;
    this.dragging = false;
    this.knob = h('span.slider-knob');
    this.fill = h('div.slider-fill', this.knob);
    this.glyph = iconName ? icon(iconName, 'slider-icon') : null;
    this.el = h('div.slider', { role: 'slider' }, this.fill, this.glyph);

    this.el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      if (this.el.setPointerCapture) this.el.setPointerCapture(e.pointerId);
      this.fromPointer(e);
      e.preventDefault();
    });
    this.el.addEventListener('pointermove', (e) => {
      if (this.dragging) this.fromPointer(e);
    });
    const end = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.el.releasePointerCapture) this.el.releasePointerCapture(e.pointerId);
      if (this.onCommit) this.onCommit(this.value);
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
    this.el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = e.deltaY < 0 ? 0.05 : -0.05;
      this.set(clamp(this.value + step, 0, 1));
      if (this.onInput) this.onInput(this.value);
      if (this.onCommit) this.onCommit(this.value);
    });
  }

  fromPointer(e) {
    const r = this.el.getBoundingClientRect();
    if (r.width <= 0) return;
    // The fill never shrinks below the knob width, so map the travel to it.
    const knob = r.height;
    const v = clamp((e.clientX - r.left - knob / 2) / (r.width - knob), 0, 1);
    this.set(v);
    if (this.onInput) this.onInput(v);
  }

  set(v) {
    this.value = clamp(v, 0, 1);
    const r = this.el.getBoundingClientRect();
    const knob = r.height || 28;
    const w = r.width > 0 ? knob + this.value * (r.width - knob) : null;
    this.fill.style.width = w != null ? `${Math.round(w)}px` : `${Math.round(this.value * 100)}%`;
  }

  setIcon(name) {
    if (!this.glyph) return;
    const next = icon(name, 'slider-icon');
    this.glyph.replaceWith(next);
    this.glyph = next;
  }

  setMuted(m) {
    this.el.classList.toggle('muted', !!m);
  }
}

export class Switch {
  constructor({ on = false, onChange }) {
    this.on = on;
    this.el = h('button.switch', { role: 'switch' }, h('span.switch-knob'));
    this.el.classList.toggle('on', on);
    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.set(!this.on);
      if (onChange) onChange(this.on);
    });
  }

  set(on) {
    this.on = !!on;
    this.el.classList.toggle('on', this.on);
  }
}
