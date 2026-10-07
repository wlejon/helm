/**
 * Helm DOM & Element Builder Substrate
 * Inspired by broworkshop/lib/kit/dom.js: High-performance, declarative,
 * type-safe DOM construction without raw HTML string injection.
 */

/**
 * querySelector that throws when the selector matches nothing.
 * An element passes straight through.
 */
export function $(sel, root) {
  if (typeof sel !== 'string') return sel;
  const el = (root || document).querySelector(sel);
  if (!el) throw new Error('helm: no element matches ' + sel);
  return el;
}

/** querySelectorAll returning a proper Array. */
export function $$(sel, root) {
  return Array.from((root || document).querySelectorAll(sel));
}

/**
 * Build a DOM element.
 * `tag` may include `.class` and `#id` suffixes:
 *   h('button.btn.primary#submit', { onclick }, 'Save')
 * `props`:
 *   class / className: string or array
 *   style: string or object
 *   dataset: object of data attributes
 *   on<event>: event handler function
 *   text: textContent
 *   checked, disabled, value, type, etc.
 * Children: strings, numbers, Node elements, arrays, null/false (skipped).
 */
export function h(tag, props, ...children) {
  const m = /^([a-z0-9-]*)((?:[.#][\w-]+)*)$/i.exec(tag);
  if (!m) throw new Error('helm: bad tag name ' + tag);

  const el = document.createElement(m[1] || 'div');

  // Parse classes and IDs from the selector string
  for (const part of m[2].match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }

  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;

      if (k === 'class' || k === 'className') {
        const list = Array.isArray(v) ? v : String(v).split(/\s+/);
        for (const c of list) if (c) el.classList.add(c);
      } else if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else for (const s in v) el.style[s] = v[s];
      } else if (k === 'dataset') {
        for (const d in v) el.dataset[d] = v[d];
      } else if (k === 'text') {
        el.textContent = v;
      } else if (k.length > 2 && k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k in el) {
        try {
          el[k] = v;
        } catch (_) {
          el.setAttribute(k, String(v));
        }
      } else {
        el.setAttribute(k, v === true ? '' : String(v));
      }
    }
  }

  appendChildren(el, children);
  return el;
}

function appendChildren(el, kids) {
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) {
      appendChildren(el, c);
    } else if (c instanceof Node) {
      el.appendChild(c);
    } else {
      el.appendChild(document.createTextNode(String(c)));
    }
  }
}

/** Clear all children from an element cleanly. */
export function clear(el) {
  const target = typeof el === 'string' ? $(el) : el;
  if (!target) return null;
  while (target.firstChild) {
    target.removeChild(target.firstChild);
  }
  return target;
}

/** Look up multiple elements by ID into an object map. */
export function ids(...names) {
  const out = {};
  for (const n of names) {
    const el = document.getElementById(n);
    if (!el) throw new Error('helm: no element #' + n);
    out[n.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = el;
  }
  return out;
}

/** Formatter: bytes to human string. */
export function fmtBytes(n) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = Number(n) || 0;
  while (Math.abs(val) >= 1024 && i < u.length - 1) {
    val /= 1024;
    i++;
  }
  return (i ? val.toFixed(1) : String(val)) + ' ' + u[i];
}

/** Formatter: milliseconds to formatted string. */
export function fmtMs(ms) {
  if (ms < 1000) return ms.toFixed(ms < 10 ? 2 : 1) + ' ms';
  if (ms < 60000) return (ms / 1000).toFixed(2) + ' s';
  const s = Math.round(ms / 1000);
  return Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's';
}

/** Formatter: wall-clock hh:mm:ss. */
export function clock(d) {
  const date = d || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}
