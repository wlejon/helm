/**
 * The launcher: with no query, frequent apps and a grid of every app; with a
 * query, one ranked list of apps, actions, a calculator answer and clipboard
 * entries. Arrow keys move the selection, Enter runs it, Escape closes.
 */

import { h, $, api, attempt, appIcon, fmtRelative } from './util.js';
import { icon } from './icons.js';
import { settings } from './settings.js';
import { appdb } from './appdb.js';
import { evaluate, formatNumber } from './calc.js';
import { animate, morphIn, morphOut, rectOf, EASE_OUT } from './morph.js';

const GRID_COLS = 6;
const WIDTH = 776;
const HEIGHT = 612;
const PROMPT = 'Search apps and actions, or = to calculate';
const CLIP_PROMPT = 'Search clipboard history';

export class LauncherController {
  constructor(shell) {
    this.shell = shell;
    this.isOpen = false;
    this.mode = 'grid';     // 'grid' | 'list'
    this.entries = [];      // what Enter/arrows act on, in display order
    this.selected = 0;
    this.clipMode = false;
  }

  init() {
    this.el = $('#launcher-modal');
    this.input = h('input.launcher-input#launcher-input', {
      type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': PROMPT,
    });
    // Our own prompt: the engine hides placeholders while an input has focus.
    this.ghost = h('span.launcher-ghost', PROMPT);
    this.chip = h('span.launcher-chip.hidden', icon('clipboard'), 'Clipboard');
    this.body = h('div.launcher-results#launcher-results');
    this.foot = h('div.launcher-foot',
      keyHint('↑↓←→', 'move'), keyHint('↵', 'open'), keyHint('=', 'calculate'), keyHint('esc', 'close'),
      h('span.grow'), h('span.launcher-count'));
    this.inner = h('div.launcher-body',
      h('div.launcher-search',
        h('span.launcher-search-glyph', icon('search')),
        h('div.launcher-field', this.ghost, this.input),
        this.chip),
      this.body,
      this.foot);
    this.window = h('div.launcher.glass.deep', this.inner);
    this.el.replaceChildren(h('div.launcher-scrim#launcher-backdrop'), this.window);
    $('#launcher-backdrop').addEventListener('pointerdown', () => this.close());
    this.input.addEventListener('input', () => this.refresh());
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    appdb.onChange(() => this.isOpen && this.refresh());
  }

  get actions() {
    const s = this.shell;
    return [
      { name: 'Settings', desc: 'Sound, displays, network, power, appearance', icon: 'settings', run: () => s.openSettings() },
      { name: 'Spaces', desc: 'Workspaces and their windows', icon: 'layers', run: () => s.spaces.toggle() },
      { name: 'Accent Colour', desc: 'Cycle the shell accent', icon: 'sparkles', run: () => s.cycleAccent() },
      { name: 'Appearance', desc: 'Wallpaper, accent colour, clock, dock', icon: 'palette', run: () => s.openSettings('appearance') },
      { name: 'Lock Screen', desc: 'Lock this session', icon: 'lock', run: () => s.lock.lock() },
      { name: 'Clipboard History', desc: 'Recent copied items', icon: 'clipboard', keep: true, run: () => this.openClipboard() },
      { name: 'Notifications', desc: 'Open the notification center', icon: 'bell', run: () => s.calendar.toggle() },
      { name: 'Quick Settings', desc: 'Sound, network, Bluetooth, power', icon: 'layout', run: () => s.quick.toggle() },
      { name: 'Do Not Disturb', desc: s.notify.dnd ? 'Turn off' : 'Turn on', icon: 'bell-off', run: () => s.notify.setDnd(!s.notify.dnd) },
      { name: 'Sleep', desc: 'Suspend the computer', icon: 'moon', run: () => s.system.request('suspend') },
      { name: 'Restart', desc: 'Restart the computer', icon: 'restart', run: () => s.system.request('reboot') },
      { name: 'Shut Down', desc: 'Power off the computer', icon: 'power', run: () => s.system.request('powerOff') },
      { name: 'Change Wallpaper', desc: 'Cycle the desktop background', icon: 'image', run: () => s.cycleWallpaper() },
    ];
  }

  /** Open, growing out of `origin` (the island mark or the dock button). */
  open(origin) {
    if (this.isOpen) return;
    this.shell.closeTransient();
    this.isOpen = true;
    this.clipMode = false;
    this.input.value = '';
    this.el.classList.remove('hidden', 'leaving');
    this.place();
    this.refresh();
    this.input.focus();
    this.origin = origin && origin.getBoundingClientRect ? origin : null;
    const from = this.origin ? rectOf(this.origin) : null;
    if (from && from.width > 0) {
      morphIn(this.window, from, { body: this.inner, fromRadius: from.height / 2, toRadius: 32, duration: 520 });
    } else {
      animate(this.window, [{ opacity: 0, transform: 'scale(0.94) translateY(12px)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, easing: EASE_OUT });
    }
    window.dispatchEvent(new CustomEvent('helm:overlay'));
  }

  /** Center the window; morphs need its box in pixels. */
  place() {
    const vw = window.innerWidth || 1920;
    const vh = window.innerHeight || 1080;
    const w = Math.min(WIDTH, vw - 32);
    const ht = Math.min(HEIGHT, vh - 140);
    Object.assign(this.window.style, {
      left: `${Math.round((vw - w) / 2)}px`,
      top: `${Math.round(Math.max(70, (vh - ht) / 2 - 40))}px`,
      width: `${w}px`,
      height: `${ht}px`,
    });
    // The body keeps its final size while the box morphs around it.
    Object.assign(this.inner.style, { width: `${w}px`, height: `${ht}px` });
  }

  openClipboard(origin) {
    if (!this.isOpen) this.open(origin);
    this.clipMode = true;
    this.input.value = '';
    this.refresh();
    this.input.focus();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.input.blur();
    this.el.classList.add('leaving');
    const done = () => {
      if (!this.isOpen) this.el.classList.add('hidden');
      this.el.classList.remove('leaving');
    };
    const to = this.origin && this.origin.isConnected !== false ? rectOf(this.origin) : null;
    if (to && to.width > 0) {
      morphOut(this.window, to, { body: this.inner, duration: 300, done });
    } else {
      animate(this.window, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96) translateY(8px)' }],
        { duration: 180, easing: 'ease-in', fill: 'forwards' });
      setTimeout(done, 180);
    }
    window.dispatchEvent(new CustomEvent('helm:overlay'));
  }

  toggle(origin) {
    if (this.isOpen) this.close();
    else this.open(origin);
  }

  // -- Ranking -----------------------------------------------------------------

  counts() {
    return settings.getJson('launchCounts', {}) || {};
  }

  bump(id) {
    const c = this.counts();
    c[id] = (c[id] || 0) + 1;
    settings.setJson('launchCounts', c);
  }

  frequent(n) {
    const c = this.counts();
    return appdb.apps
      .filter((a) => c[a.id] > 0)
      .sort((a, b) => c[b.id] - c[a.id])
      .slice(0, n);
  }

  score(q, item) {
    const name = item.name.toLowerCase();
    const words = name.split(/[\s\-_.]+/);
    let s = 0;
    if (name === q) s = 1000;
    else if (name.startsWith(q)) s = 800;
    else if (words.some((w) => w.startsWith(q))) s = 600;
    else if (name.includes(q)) s = 400;
    else {
      const hay = [item.generic, item.desc, item.comment, ...(item.keywords || [])].join(' ').toLowerCase();
      if (hay.includes(q)) s = 200;
      else if (fuzzy(q, name)) s = 100;
    }
    if (s > 0 && item.id) s += Math.min(150, (this.counts()[item.id] || 0) * 15);
    return s;
  }

  // -- Rendering ---------------------------------------------------------------

  refresh() {
    const q = this.input.value.trim();
    this.ghost.textContent = this.clipMode ? CLIP_PROMPT : PROMPT;
    this.ghost.classList.toggle('hidden', this.input.value.length > 0);
    this.chip.classList.toggle('hidden', !this.clipMode);
    if (this.clipMode) return this.renderClipboard(q.toLowerCase());
    if (!q) return this.renderGrid();
    return this.renderList(q);
  }

  renderGrid() {
    this.mode = 'grid';
    this.entries = [];
    const sections = [];
    const freq = this.frequent(GRID_COLS);
    if (freq.length) {
      sections.push(h('div.launcher-section.micro', 'Frequent'));
      sections.push(this.gridOf(freq));
    }
    sections.push(h('div.launcher-section.micro', `All apps · ${appdb.apps.length}`));
    sections.push(this.gridOf(appdb.apps));
    this.body.replaceChildren(...sections);
    this.select(0, false);
  }

  gridOf(apps) {
    const sec = this.entries.length ? this.entries[this.entries.length - 1].sec + 1 : 0;
    return h('div.app-grid', apps.map((a, pos) => {
      const index = this.entries.length;
      const entry = { kind: 'app', app: a, sec, pos, run: () => this.launch(a) };
      const tile = h('button.app-tile', { title: a.comment || a.name },
        appIcon(a.icon, a.name, 64, 'app-tile-icon'),
        h('span.app-tile-name', a.name));
      tile.addEventListener('click', () => this.runEntry(entry));
      tile.addEventListener('pointermove', () => this.selected !== index && this.select(index, false));
      tile.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.shell.appMenu(a, e.clientX, e.clientY);
      });
      entry.el = tile;
      this.entries.push(entry);
      return tile;
    }));
  }

  renderList(q) {
    this.mode = 'list';
    this.entries = [];
    const ql = q.toLowerCase();
    const rows = [];

    const calc = evaluate(q);
    if (calc != null) {
      const text = formatNumber(calc);
      rows.push(this.row({
        kind: 'calc', glyph: h('span.row-glyph.calc-glyph', icon('calculator')), title: text, desc: `${q.replace(/^=/, '')} =`, badge: 'Copy',
        run: () => this.copy(text),
      }));
    }

    const apps = appdb.apps
      .map((a) => ({ a, s: this.score(ql, { ...a, desc: a.comment }) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .slice(0, 8);
    if (apps.length) {
      rows.push(h('div.launcher-section.micro', 'Applications'));
      for (const { a } of apps) {
        rows.push(this.row({
          kind: 'app', app: a, glyph: appIcon(a.icon, a.name, 64, 'row-app-icon'),
          title: a.name, desc: a.comment || a.generic, run: () => this.launch(a),
        }));
      }
    }

    const acts = this.actions
      .map((x) => ({ x, s: this.score(ql, { name: x.name, desc: x.desc }) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .slice(0, 4);
    if (acts.length) {
      rows.push(h('div.launcher-section.micro', 'Actions'));
      for (const { x } of acts) {
        rows.push(this.row({
          kind: 'action', glyph: h('span.row-glyph', icon(x.icon)), title: x.name, desc: x.desc,
          run: x.run, keep: x.keep,
        }));
      }
    }

    if (this.entries.length === 0) {
      rows.push(emptyState('search', `Nothing matches “${q}”`, 'Try another word, or start with = to calculate'));
    }
    this.body.replaceChildren(...rows);
    this.select(0, false);
  }

  renderClipboard(ql) {
    this.mode = 'list';
    this.entries = [];
    const clip = api('clip');
    const items = clip ? attempt('clip.getHistory', () => clip.getHistory(), []) || [] : [];
    const rows = [h('div.launcher-section.micro', 'Clipboard')];
    for (const it of items) {
      const text = (it.previewText || it.text || '').replace(/\s+/g, ' ').trim();
      if (ql && !text.toLowerCase().includes(ql)) continue;
      rows.push(this.row({
        kind: 'clip', glyph: h('span.row-glyph', icon(it.isPinned ? 'pin' : 'clipboard')),
        title: text || `${(it.mimeTypes || [])[0] || 'data'} · ${it.byteSize || 0} bytes`,
        desc: fmtRelative(it.timestamp), badge: 'Copy',
        run: () => {
          attempt('clip.paste', () => clip.paste(it.id));
          this.shell.notify.post({ summary: 'Copied to clipboard', icon: 'clipboard' });
        },
      }));
    }
    if (this.entries.length === 0) {
      rows.push(clip ? emptyState('clipboard', 'Nothing copied yet', 'Text you copy shows up here')
        : emptyState('clipboard', 'Clipboard history is unavailable', 'This session has no clipboard service'));
    }
    this.body.replaceChildren(...rows);
    this.select(0, false);
  }

  row(entry) {
    const index = this.entries.length;
    const el = h('button.launcher-row',
      entry.glyph,
      h('span.row-text',
        h('span.row-title', entry.title),
        entry.desc ? h('span.row-desc', entry.desc) : null),
      h('span.row-badge', h('span.row-key', '↵'), entry.badge || (entry.kind === 'app' ? 'Open' : 'Run')));
    el.classList.add(`kind-${entry.kind}`);
    el.addEventListener('click', () => this.runEntry(entry));
    el.addEventListener('pointermove', () => this.selected !== index && this.select(index, false));
    if (entry.app) {
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.shell.appMenu(entry.app, e.clientX, e.clientY);
      });
    }
    entry.el = el;
    this.entries.push(entry);
    return el;
  }

  select(i, scroll = true) {
    const count = $('.launcher-count', this.foot);
    if (count) count.textContent = this.entries.length ? `${Math.min(i, this.entries.length - 1) + 1} / ${this.entries.length}` : '';
    if (this.entries.length === 0) return;
    const prev = this.entries[this.selected];
    if (prev && prev.el) prev.el.classList.remove('selected');
    this.selected = Math.max(0, Math.min(this.entries.length - 1, i));
    const cur = this.entries[this.selected];
    cur.el.classList.add('selected');
    if (scroll && cur.el.scrollIntoView) cur.el.scrollIntoView({ block: 'nearest' });
  }

  onKey(e) {
    const grid = this.mode === 'grid';
    let handled = true;
    switch (e.key) {
      case 'ArrowDown': if (grid) this.gridMove(1); else this.select(this.selected + 1); break;
      case 'ArrowUp': if (grid) this.gridMove(-1); else this.select(this.selected - 1); break;
      case 'ArrowRight': if (grid) this.select(this.selected + 1); else handled = false; break;
      case 'ArrowLeft': if (grid) this.select(this.selected - 1); else handled = false; break;
      case 'Enter': if (this.entries[this.selected]) this.runEntry(this.entries[this.selected]); break;
      case 'Escape':
        if (this.clipMode && this.input.value) this.input.value = '';
        else this.close();
        this.refresh();
        break;
      default: handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  /** Move a grid row up or down, crossing from one section's grid to the next. */
  gridMove(dir) {
    const cur = this.entries[this.selected];
    if (!cur) return;
    const col = cur.pos % GRID_COLS;
    const same = this.entries.filter((x) => x.sec === cur.sec);
    const target = same.find((x) => x.pos === cur.pos + dir * GRID_COLS);
    if (target) return this.select(this.entries.indexOf(target));
    const other = this.entries.filter((x) => x.sec === cur.sec + dir);
    if (other.length === 0) return;
    const rows = Math.ceil(other.length / GRID_COLS);
    const row = dir > 0 ? 0 : rows - 1;
    const pick = other[Math.min(other.length - 1, row * GRID_COLS + col)];
    this.select(this.entries.indexOf(pick));
  }

  runEntry(entry) {
    if (!entry.keep) this.close();
    entry.run();
  }

  launch(app) {
    this.bump(app.id);
    appdb.launch(app.id);
  }

  copy(text) {
    const clip = api('clip');
    if (clip) attempt('clip.setText', () => clip.setText(text));
    this.shell.notify.post({ summary: `Copied ${text}`, icon: 'calculator' });
  }
}

function keyHint(k, label) {
  return h('span.key-hint', h('kbd', k), label);
}

function emptyState(glyph, title, hint) {
  return h('div.launcher-empty.empty', h('div.empty-glyph', icon(glyph)),
    h('div.empty-title', title), h('div.empty-hint', hint));
}

function fuzzy(q, s) {
  let i = 0;
  for (const ch of s) if (ch === q[i]) i++;
  return i === q.length;
}
