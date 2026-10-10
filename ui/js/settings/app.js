/**
 * Settings: one deep-glass window that grows out of whatever opened it (the
 * quick settings gear, the launcher, the status island for Super+,) and
 * folds back into it. A sidebar holds who is signed in, search and the
 * pages; the page scrolls beside it.
 *
 * Pages (./pages/*.js) are { id, title, glyph, blurb, available(b), items,
 * topics, render(ctx), leave?(ctx) }. A page whose API is missing on this
 * machine says so through available() and is left out of the sidebar and
 * of search. items are the page's searchable settings: { id, label,
 * keywords }, each landing on the element carrying data-anchor=id.
 */

import { h, $, initials, attempt } from '../util.js';
import { icon } from '../icons.js';
import { animate, morphIn, morphOut, rectOf, EASE_OUT, EASE_STD } from '../morph.js';
import { system } from '../system.js';
import { Backend, stubWrites } from './backend.js';
import { PAGES } from './pages/index.js';
import { search } from './search.js';

const WIDTH = 1120;
const HEIGHT = 760;
const PROMPT = 'Search settings';

export class SettingsApp {
  constructor(shell) {
    this.shell = shell;
    this.backend = new Backend(shell);
    this.isOpen = false;
    this.page = null;
    this.query = '';
    this.selected = 0;
    this.results = [];
    this.state = {};      // per-page scratch state that survives re-renders
    this.sliders = [];
    this.pending = [];
  }

  init() {
    this.el = $('#settings-app');
    this.input = h('input.st-search-input', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': PROMPT });
    this.ghost = h('span.st-search-ghost', PROMPT);
    this.clear = h('button.st-search-clear.hidden', { title: 'Clear' }, icon('x'));
    this.nav = h('nav.st-nav');
    this.user = h('button.st-user');
    this.title = h('h1.st-title');
    this.blurb = h('p.st-blurb');
    this.headGlyph = h('span.st-head-glyph');
    this.content = h('div.st-page');
    this.scroller = h('div.st-scroll', this.content);
    const closeBtn = h('button.icon-btn.filled.st-close', { title: 'Close (Esc)' }, icon('x'));
    this.inner = h('div.st-body',
      h('aside.st-side',
        this.user,
        h('div.st-search', h('span.st-search-glyph', icon('search')), h('div.st-search-field', this.ghost, this.input), this.clear),
        this.nav),
      h('main.st-main',
        h('header.st-head', this.headGlyph, h('div.st-head-text', this.title, this.blurb), closeBtn),
        this.scroller));
    this.window = h('div.settings.glass.deep', { role: 'dialog', 'aria-label': 'Settings' }, this.inner);
    this.scrim = h('div.settings-scrim');
    this.el.replaceChildren(this.scrim, this.window);

    this.scrim.addEventListener('pointerdown', () => this.close());
    closeBtn.addEventListener('click', () => this.close());
    this.user.addEventListener('click', () => this.go('about'));
    this.clear.addEventListener('click', () => {
      this.setQuery('');
      this.input.focus();
    });
    this.input.addEventListener('input', () => this.setQuery(this.input.value));
    this.input.addEventListener('keydown', (e) => this.onSearchKey(e));
    this.el.addEventListener('keydown', (e) => this.onKey(e));

    for (const topic of ['audio', 'streams', 'network', 'bluetooth', 'power', 'display']) {
      system.on(topic, () => this.onTopic(topic));
    }
    for (const key of ['wallpaper', 'accentHue', 'use24h', 'showSeconds', 'notifyQuiet', 'notifyApps']) {
      this.shell.prefs.watch(key, () => this.onTopic('prefs'));
    }
    this.shell.notify.onDndChange(() => this.onTopic('notify'));
    this.shell.notify.onChange(() => this.onTopic('notify'));
    this.shell.registerSettingsApp(this);
  }

  /** Pages this machine can show, in sidebar order. */
  pages() {
    return PAGES.filter((p) => attempt(`settings page ${p.id}`, () => p.available(this.backend), false));
  }

  pageById(id) {
    return this.pages().find((p) => p.id === id) || null;
  }

  // -- Open and close ------------------------------------------------------------

  /**
   * open(page, { origin, from, home }): origin is the element it grows out of
   * (or from, its rect, taken before that element went away); home is where
   * it folds back to on close.
   */
  open(pageId, { origin = null, from = null, home = null, anchor = null } = {}) {
    const homeEl = typeof home === 'string' ? $(home) : home;
    this.home = homeEl || (origin && origin.isConnected !== false ? origin : null) || $('#island-right');
    if (this.isOpen) {
      if (pageId) this.go(pageId, { anchor });
      return;
    }
    this.isOpen = true;
    this.query = '';
    this.input.value = '';
    this.el.classList.remove('hidden', 'leaving');
    this.place();
    this.renderUser();
    const first = this.pageById(pageId) || this.pageById(this.lastPage) || this.pages()[0];
    this.go(first ? first.id : null, { instant: true });
    if (anchor) setTimeout(() => this.isOpen && this.reveal(anchor), 0);
    this.input.focus();

    const start = from || (origin ? rectOf(origin) : rectOf(this.home));
    if (start && start.width > 0) {
      morphIn(this.window, start, { body: this.inner, duration: 520 });
    } else {
      animate(this.window, [{ opacity: 0, transform: 'scale(0.95) translateY(14px)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, easing: EASE_OUT });
    }
    this.announce();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.leavePage();
    this.input.blur();
    this.el.classList.add('leaving');
    const done = () => {
      if (!this.isOpen) this.el.classList.add('hidden');
      this.el.classList.remove('leaving');
    };
    const to = this.home && this.home.isConnected !== false ? rectOf(this.home) : null;
    if (to && to.width > 0) {
      morphOut(this.window, to, { body: this.inner, duration: 320, done });
    } else {
      animate(this.window, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96) translateY(8px)' }],
        { duration: 180, easing: EASE_STD, fill: 'forwards' });
      setTimeout(done, 180);
    }
    this.announce();
  }

  toggle(pageId) {
    if (this.isOpen) this.close();
    else this.open(pageId);
  }

  announce() {
    window.dispatchEvent(new CustomEvent('helm:overlay'));
  }

  /** Center the window in pixels; the body keeps its size while the box morphs. */
  place() {
    const vw = window.innerWidth || 1920;
    const vh = window.innerHeight || 1080;
    const w = Math.min(WIDTH, vw - 32);
    const ht = Math.min(HEIGHT, vh - 96);
    Object.assign(this.window.style, {
      left: `${Math.round((vw - w) / 2)}px`,
      top: `${Math.round(Math.max(64, (vh - ht) / 2 - 10))}px`,
      width: `${w}px`,
      height: `${ht}px`,
    });
    Object.assign(this.inner.style, { width: `${w}px`, height: `${ht}px` });
  }

  // -- Navigation -------------------------------------------------------------------

  /** Show a page; with anchor, scroll to that setting and light it briefly. */
  go(pageId, { anchor = null, instant = false } = {}) {
    const page = this.pageById(pageId);
    if (!page) return;
    if (this.query) {
      this.query = '';
      this.input.value = '';
      this.syncSearch();
    }
    if (this.page !== page) {
      this.leavePage();
      this.page = page;
      this.lastPage = page.id;
      this.renderPage({ keepScroll: false });
      if (!instant) {
        animate(this.content, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
          { duration: 260, easing: EASE_OUT });
      }
    }
    this.renderNav();
    if (anchor) this.reveal(anchor);
  }

  leavePage() {
    if (this.page && this.page.leave) attempt(`settings leave ${this.page.id}`, () => this.page.leave(this.ctx()));
  }

  reveal(anchor) {
    const el = this.content.querySelector(`[data-anchor="${anchor}"]`);
    if (!el) return;
    const top = el.getBoundingClientRect().top - this.content.getBoundingClientRect().top;
    this.scroller.scrollTop = Math.max(0, top - 28);
    el.classList.remove('st-flash');
    el.classList.add('st-flash');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => el.classList.remove('st-flash'), 1600);
  }

  // -- Rendering ----------------------------------------------------------------------

  /** What a page's render() gets. */
  ctx() {
    const page = this.page;
    if (!this.state[page.id]) this.state[page.id] = {};
    return {
      shell: this.shell,
      b: this.backend,
      app: this,
      state: this.state[page.id],
      after: (fn) => this.pending.push(fn),
      track: (s) => this.sliders.push(s),
      rerender: () => this.rerender(),
      go: (id, anchor) => this.go(id, { anchor }),
    };
  }

  renderUser() {
    const host = this.shell.hostname;
    const os = osName(this.backend);
    this.user.replaceChildren(
      h('span.avatar', h('span.avatar-in', initials(this.shell.username))),
      h('span.st-user-text',
        h('span.st-user-name', this.shell.username),
        h('span.st-user-sub', [host, os].filter(Boolean).join(' · ') || 'This computer')));
  }

  renderNav() {
    const hits = this.query ? new Set(this.results.map((r) => r.page.id)) : null;
    this.nav.replaceChildren(...this.pages().map((p) => {
      const b = h('button.st-nav-item', { dataset: { page: p.id } },
        h('span.st-nav-glyph', icon(p.glyph)), h('span.grow', p.title));
      b.classList.toggle('on', !this.query && this.page === p);
      b.classList.toggle('dim', !!hits && !hits.has(p.id));
      b.addEventListener('click', () => this.go(p.id));
      return b;
    }));
  }

  renderHead(glyph, title, blurb) {
    this.headGlyph.replaceChildren(icon(glyph));
    this.title.textContent = title;
    this.blurb.textContent = blurb || '';
  }

  renderPage({ keepScroll = true } = {}) {
    const page = this.page;
    if (!page) return;
    const scroll = this.scroller.scrollTop;
    this.sliders = [];
    this.pending = [];
    this.renderHead(page.glyph, page.title, page.blurb);
    const parts = attempt(`settings render ${page.id}`, () => page.render(this.ctx()), null);
    const list = [].concat(parts || []).filter(Boolean);
    this.content.replaceChildren(...(list.length ? list : [errorState(page)]));
    this.content.dataset.page = page.id;
    for (const fn of this.pending) attempt('settings after', fn);
    this.pending = [];
    this.scroller.scrollTop = keepScroll ? scroll : 0;
  }

  /** Re-render the open page unless a slider is mid-drag. */
  rerender() {
    if (!this.isOpen || this.query) return;
    if (this.sliders.some((s) => s.dragging)) return;
    this.renderPage({ keepScroll: true });
  }

  onTopic(topic) {
    if (!this.isOpen || !this.page) return;
    if ((this.page.topics || []).includes(topic)) this.rerender();
  }

  /**
   * Tests and screenshot runs: every write the pages can make becomes a
   * recorder; returns the call log.
   */
  stubWrites(overrides) {
    return stubWrites(this.backend, overrides);
  }

  /** Search results for a query from outside (the launcher). */
  find(q) {
    return search(this.pages(), q, this.backend);
  }

  // -- Search ----------------------------------------------------------------------

  setQuery(q) {
    this.query = q.trim();
    this.selected = 0;
    this.syncSearch();
    if (!this.query) {
      this.renderNav();
      this.renderPage({ keepScroll: false });
      return;
    }
    this.results = search(this.pages(), this.query, this.backend);
    this.renderNav();
    this.renderResults();
  }

  syncSearch() {
    this.ghost.classList.toggle('hidden', this.input.value.length > 0);
    this.clear.classList.toggle('hidden', this.input.value.length === 0);
  }

  renderResults() {
    this.sliders = [];
    this.renderHead('search', 'Search', this.results.length
      ? `${this.results.length} ${this.results.length === 1 ? 'match' : 'matches'} for “${this.query}”`
      : `Nothing matches “${this.query}”`);
    this.content.dataset.page = 'search';
    if (this.results.length === 0) {
      this.content.replaceChildren(h('div.st-empty-wrap',
        h('div.empty.st-empty',
          h('span.empty-glyph', icon('search')),
          h('span.empty-title', 'No settings match'),
          h('span.empty-hint', 'Try a page name like Sound or Network, or a word like wallpaper, volume or Wi-Fi'))));
      return;
    }
    const rows = this.results.map((r, i) => {
      const el = h('button.st-result', { dataset: { page: r.page.id, anchor: r.item ? r.item.id : '' } },
        h('span.st-nav-glyph', icon(r.page.glyph)),
        h('span.st-result-text',
          h('span.st-result-title', r.item ? r.item.label : r.page.title),
          h('span.st-result-path', r.item ? r.page.title : r.page.blurb)),
        icon('chevron-right', 'st-result-go'));
      el.classList.toggle('selected', i === this.selected);
      el.addEventListener('click', () => this.openResult(r));
      el.addEventListener('pointermove', () => this.selectResult(i));
      return el;
    });
    this.content.replaceChildren(h('div.st-results', rows));
    this.scroller.scrollTop = 0;
  }

  selectResult(i) {
    if (!this.results.length) return;
    this.selected = Math.max(0, Math.min(this.results.length - 1, i));
    const els = this.content.querySelectorAll('.st-result');
    els.forEach((el, j) => el.classList.toggle('selected', j === this.selected));
  }

  openResult(r) {
    this.query = '';
    this.input.value = '';
    this.syncSearch();
    this.leavePage();
    this.page = null;
    this.go(r.page.id, { anchor: r.item ? r.item.id : null });
  }

  onSearchKey(e) {
    if (e.key === 'Escape' && this.input.value) {
      e.preventDefault();
      e.stopPropagation();
      this.setQuery('');
      this.input.value = '';
      this.syncSearch();
      return;
    }
    if (!this.query) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      this.selectResult(this.selected + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter' && this.results[this.selected]) {
      e.preventDefault();
      this.openResult(this.results[this.selected]);
    }
  }

  /** Ctrl+PageUp/PageDown (or Alt+Up/Down) walk the pages. */
  onKey(e) {
    const step = (e.ctrlKey && (e.key === 'PageDown' || e.key === 'PageUp')) || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp'));
    if (!step || this.query) return;
    e.preventDefault();
    const pages = this.pages();
    const i = pages.indexOf(this.page);
    const next = pages[(i + (e.key === 'PageDown' || e.key === 'ArrowDown' ? 1 : -1) + pages.length) % pages.length];
    this.go(next.id);
  }
}

function errorState(page) {
  return h('div.st-empty-wrap', h('div.empty.st-empty',
    h('span.empty-glyph', icon('alert')),
    h('span.empty-title', `${page.title} could not load`),
    h('span.empty-hint', 'The system service behind this page did not answer. It will refresh when it does.')));
}

function osName(b) {
  const txt = b.readText('/etc/os-release') || '';
  const m = /^PRETTY_NAME="?([^"\n]*)"?/m.exec(txt) || /^NAME="?([^"\n]*)"?/m.exec(txt);
  return m ? m[1] : '';
}
