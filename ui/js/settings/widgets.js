/**
 * Settings building blocks. A page is sections; a section is a micro-caps
 * heading over one recessed glass group of rows; a row is an optional glyph,
 * a title and a line of description, and a control on the right. Rows carry
 * data-anchor so search can land on them.
 */

import { h } from '../util.js';
import { icon } from '../icons.js';
import { Slider, Switch } from '../controls.js';

export function section(title, rows, { aside = null, note = null, anchor = null, cls = '' } = {}) {
  const list = [].concat(rows).filter(Boolean);
  if (list.length === 0) return null;
  return h(`section.st-section${cls ? `.${cls}` : ''}`, { dataset: anchor ? { anchor } : undefined },
    title || aside ? h('div.st-section-head', title ? h('span.micro', title) : null, h('span.grow'), aside) : null,
    h('div.st-group', list),
    note ? h('div.st-note', note) : null);
}

/**
 * { glyph, title, desc, control, below, anchor, onClick, selected, cls, tag }
 * glyph is an icon name or an element; below is a block (a slider, facts,
 * swatches) set under the title line, indented to the text.
 */
export function row({ glyph, title, desc, control, below, anchor, onClick, selected, cls, tag } = {}) {
  const lead = glyph ? h('span.st-row-glyph', typeof glyph === 'string' ? icon(glyph) : glyph) : null;
  const text = h('span.st-row-text',
    h('span.st-row-title', title),
    desc ? h('span.st-row-desc', desc) : null);
  const ctl = control ? h('span.st-row-control', control) : null;
  const clickable = typeof onClick === 'function';
  const props = { dataset: anchor ? { anchor } : undefined, ...(tag || {}) };
  if (tag && tag.dataset) props.dataset = { ...(anchor ? { anchor } : {}), ...tag.dataset };
  let el;
  if (below) {
    el = h(`div.st-row.st-row-stack${cls ? `.${cls}` : ''}`, props,
      h('div.st-row-line', lead, text, ctl),
      h(`div.st-row-below${lead ? '' : '.flush'}`, below));
  } else {
    el = h(`${clickable ? 'button' : 'div'}.st-row${cls ? `.${cls}` : ''}`, props, lead, text, ctl);
  }
  if (clickable) {
    el.classList.add('clickable');
    el.addEventListener('click', onClick);
  }
  if (selected) el.classList.add('selected');
  return el;
}

export function toggle(on, onChange, { disabled = false } = {}) {
  const sw = new Switch({ on: !!on, onChange });
  if (disabled) sw.el.disabled = true;
  return sw.el;
}

export function switchRow(opts, on, onChange) {
  const sw = toggle(on, onChange, opts);
  const r = row({ ...opts, control: sw });
  // The whole row toggles, not just the switch.
  r.classList.add('clickable');
  r.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.switch')) return;
    if (!sw.disabled) sw.click();
  });
  return r;
}

/** A pill of choices: options [{ value, label }]. */
export function segmented(options, value, onChange, { anchor } = {}) {
  const el = h('div.st-seg', { role: 'radiogroup', dataset: anchor ? { anchor } : undefined });
  for (const o of options) {
    const b = h('button.st-seg-opt', { role: 'radio' }, o.label);
    b.classList.toggle('on', o.value === value);
    b.addEventListener('click', () => {
      for (const x of el.children) x.classList.remove('on');
      b.classList.add('on');
      onChange(o.value);
    });
    el.appendChild(b);
  }
  return el;
}

/**
 * A slider row whose value is set once laid out (sliders size from layout):
 * returns { el, slider, value } and registers the set with ctx.after.
 */
export function slider(ctx, { glyph, value, muted, disabled, onInput, onCommit, format }) {
  const readout = h('span.st-slider-value', format ? format(value) : `${Math.round(value * 100)}`);
  const s = new Slider({
    icon: glyph,
    onInput: (v) => {
      readout.textContent = format ? format(v) : `${Math.round(v * 100)}`;
      if (onInput) onInput(v);
    },
    onCommit,
  });
  s.setMuted(!!muted);
  s.el.classList.toggle('disabled', !!disabled);
  ctx.after(() => s.set(value));
  ctx.track(s);
  return { el: h('div.st-slider', s.el, readout), slider: s };
}

export function button(label, onClick, { kind = '', glyph = null, disabled = false, title = null } = {}) {
  const b = h(`button.btn${kind ? `.${kind}` : ''}`, { disabled, title }, glyph ? icon(glyph) : null, label);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(e);
  });
  return b;
}

/**
 * A button that asks once more: the first press turns it into "label?" with
 * the danger tint for a few seconds; the second press acts.
 */
export function confirmButton(label, act, { glyph = null, kind = '', ms = 4000 } = {}) {
  const b = h(`button.btn${kind ? `.${kind}` : ''}`, glyph ? icon(glyph) : null, h('span', label));
  let armed = null;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!armed) {
      b.classList.add('confirming');
      b.lastChild.textContent = `${label}?`;
      armed = setTimeout(() => {
        armed = null;
        b.classList.remove('confirming');
        b.lastChild.textContent = label;
      }, ms);
      return;
    }
    clearTimeout(armed);
    armed = null;
    b.classList.remove('confirming');
    b.lastChild.textContent = label;
    act();
  });
  return b;
}

export function empty(glyph, title, hint) {
  return h('div.empty.st-empty',
    h('span.empty-glyph', icon(glyph)),
    h('span.empty-title', title),
    hint ? h('span.empty-hint', hint) : null);
}

/** A status chip: tone is 'ok' | 'warn' | 'off' | 'accent'. */
export function chip(text, tone = 'off') {
  return h(`span.st-chip.${tone}`, text);
}

export function keycaps(keys) {
  return h('span.st-keys', keys.map((k) => h('kbd', k)));
}

/** A key/value pair for detail grids. */
export function fact(label, value, { mono = false } = {}) {
  if (value == null || value === '') return null;
  return h('div.st-fact', h('span.st-fact-label', label), h(`span.st-fact-value${mono ? '.num' : ''}`, value));
}

export function facts(list) {
  const items = list.filter(Boolean);
  return items.length ? h('div.st-facts', items) : null;
}

/** The big lead card a page opens with: a lit glyph, a title, a line. */
export function hero({ glyph, title, desc, aside, tone = 'accent', anchor }) {
  return h(`div.st-hero.${tone}`, { dataset: anchor ? { anchor } : undefined },
    h('span.st-hero-glyph', typeof glyph === 'string' ? icon(glyph) : glyph),
    h('span.st-hero-text', h('span.st-hero-title', title), desc ? h('span.st-hero-desc', desc) : null),
    aside ? h('span.st-hero-aside', aside) : null);
}
