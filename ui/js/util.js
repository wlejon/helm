/**
 * Small shared helpers: a DOM builder, safe access to the bro namespaces,
 * time formatting and app icons.
 */

import { icon } from './icons.js';

/** h('div.card#id', {onclick, title, dataset}, ...children) */
export function h(spec, props, ...children) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(spec) || [];
  const el = document.createElement(m[1] || 'div');
  for (const part of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'icon') el.appendChild(icon(v));
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) appendChildren(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** The bro namespace `name` when it is installed and available, else null. */
export function api(name) {
  if (typeof bro === 'undefined' || !bro) return null;
  const ns = bro[name];
  if (!ns || ns.available === false) return null;
  return ns;
}

/** Call fn, returning fallback (and logging once per tag) when it throws. */
const warned = new Set();
export function attempt(tag, fn, fallback = null) {
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch (err) {
    if (!warned.has(tag)) {
      warned.add(tag);
      console.warn(`helm: ${tag} failed: ${err && err.message ? err.message : err}`);
    }
    return fallback;
  }
}

/** Subscribe to an event emitter that may spell it on/addEventListener. */
export function listen(target, event, cb) {
  if (!target) return;
  attempt(`listen ${event}`, () => {
    if (typeof target.on === 'function') target.on(event, cb);
    else if (typeof target.addEventListener === 'function') target.addEventListener(event, cb);
  });
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

export function fmtTime(d, use24h = true, seconds = false) {
  let m = String(d.getMinutes()).padStart(2, '0');
  if (seconds) m += `:${String(d.getSeconds()).padStart(2, '0')}`;
  if (use24h) return `${String(d.getHours()).padStart(2, '0')}:${m}`;
  const hr = d.getHours() % 12 || 12;
  return `${hr}:${m} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

export function fmtDateShort(d) {
  return `${DAYS[d.getDay()].slice(0, 3)} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

export function fmtDateLong(d) {
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function fmtRelative(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

/** Fire fn at the top of every minute (and once now). Returns a stop fn. */
export function everyMinute(fn) {
  let timer = null;
  const tick = () => {
    fn(new Date());
    const now = Date.now();
    timer = setTimeout(tick, 60000 - (now % 60000) + 20);
  };
  tick();
  return () => clearTimeout(timer);
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// App icons: resolve a freedesktop icon name to a file once, then cache.
// ---------------------------------------------------------------------------

const iconCache = new Map();

export function appIconPath(name, size = 64) {
  if (!name) return null;
  if (name.startsWith('/')) return name;
  const key = `${name}@${size}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const apps = api('apps');
  let path = null;
  if (apps) {
    let svg = null;
    for (const s of [size, 64, 48, 128, 256, 32]) {
      const p = attempt('resolveIcon', () => apps.resolveIcon(name, { size: s }));
      if (!p || /\.(svgz|xpm)$/i.test(p)) continue;
      if (/\.svg$/i.test(p)) svg = svg || p;
      else { path = p; break; }
    }
    path = path || svg;
  }
  iconCache.set(key, path || null);
  return path || null;
}

// The icon a window's client set on it (xdg-toplevel-icon), as an image URL:
// its pixels through a canvas, or its theme name resolved like an app's.
// Cached per window and icon serial (the serial changes with the icon).
const windowIconCache = new Map();

export function windowIconUrl(w, size = 64) {
  if (!w || !w.iconSerial) return null;
  const key = `${w.id}:${w.iconSerial}:${size}`;
  if (windowIconCache.has(key)) return windowIconCache.get(key);
  const comp = api('compositor');
  const got = comp && typeof comp.getWindowIcon === 'function'
    ? attempt('getWindowIcon', () => comp.getWindowIcon(w.id, size)) : null;
  let url = null;
  if (got && got.size > 0) {
    url = attempt('window icon', () => {
      const c = document.createElement('canvas');
      c.width = got.size;
      c.height = got.size;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(got.size, got.size);
      img.data.set(got.data);
      ctx.putImageData(img, 0, 0);
      return c.toDataURL('image/png');
    }) || null;
  }
  if (!url && got && got.name) url = appIconPath(got.name, size);
  // Old serials of this window are no longer wanted.
  for (const k of [...windowIconCache.keys()]) {
    if (k.startsWith(`${w.id}:`) && !k.startsWith(`${w.id}:${w.iconSerial}:`)) windowIconCache.delete(k);
  }
  windowIconCache.set(key, url);
  return url;
}

/**
 * A window's icon: the one its client set (xdg-toplevel-icon), else its
 * app's from the desktop entry, else a lettered tile.
 */
export function windowIcon(w, app, label, size = 64, cls = 'app-icon') {
  const url = windowIconUrl(w, size);
  if (url) return h(`span.${cls}.app-icon-img`, h('img', { src: url, alt: '', draggable: 'false' }));
  return appIcon(app ? app.icon : w && w.appId, label, size, cls);
}

/** An app icon <img>, or a lettered tile when the icon cannot be resolved. */
export function appIcon(name, label, size = 64, cls = 'app-icon') {
  if (name && name.startsWith('shell:')) {
    return h(`span.${cls}.app-icon-shell`, icon(name.slice(6)));
  }
  const path = appIconPath(name, size);
  if (path) {
    const img = h('img', { src: path, alt: '', draggable: 'false' });
    return h(`span.${cls}.app-icon-img`, img);
  }
  const letter = String(label || name || '?').trim().charAt(0).toUpperCase() || '?';
  let hash = 0;
  for (const ch of String(label || name || '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return h(`div.${cls}.app-icon-fallback`, { style: { '--fallback-h': String(hash % 360) } }, letter);
}
