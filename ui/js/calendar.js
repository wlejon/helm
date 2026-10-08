/**
 * The clock island's panel: today and a month calendar on the left, the
 * notification center on the right, the now-playing card under the
 * calendar while something plays.
 */

import { h, $, DAYS, MONTHS, fmtTime } from './util.js';
import { icon } from './icons.js';
import { Switch } from './controls.js';
import { settings } from './settings.js';
import { panels } from './morph.js';
import { mediaCard } from './media.js';

export class CalendarPopover {
  constructor(shell) {
    this.shell = shell;
    this.viewYear = 0;
    this.viewMonth = 0;
  }

  init() {
    this.el = $('#center-panel');
    this.body = h('div.panel-body.cp');
    this.el.replaceChildren(this.body);
    this.panel = {
      el: this.el, body: this.body, island: $('#island-center'), align: 'center',
      onOpen: () => {
        const now = new Date();
        this.viewYear = now.getFullYear();
        this.viewMonth = now.getMonth();
        this.render();
        this.shell.notify.markRead();
      },
    };
    const notify = this.shell.notify;
    const indicate = () => this.shell.islands.setIndicators({ unread: notify.unread, dnd: notify.dnd });
    notify.onChange(() => {
      if (this.isOpen) {
        notify.unread = 0;
        panels.resize(this.panel, () => this.renderNotifications());
      }
      indicate();
    });
    notify.onDndChange(() => {
      indicate();
      if (this.isOpen) this.renderNotifications();
    });
    this.shell.media.onChange(() => this.isOpen && panels.resize(this.panel, () => this.renderSide()));
    indicate();
  }

  get isOpen() {
    return panels.isOpen(this.panel);
  }

  toggle() {
    panels.toggle(this.panel);
  }

  close() {
    if (this.isOpen) panels.close();
  }

  render() {
    this.nc = h('section.nc');
    this.side = h('section.cal-side');
    this.body.replaceChildren(this.side, this.nc);
    this.renderSide();
    this.renderNotifications();
  }

  renderSide() {
    const now = new Date();
    this.cal = h('div.cal');
    const today = h('div.cal-today',
      h('span.micro', DAYS[now.getDay()]),
      h('div.cal-today-date', `${MONTHS[now.getMonth()]} ${now.getDate()}`),
      h('div.cal-today-time', fmtTime(now, settings.get('use24h')), h('span', ` · ${now.getFullYear()}`)));
    this.side.replaceChildren(...[today, this.cal, this.shell.media.active ? mediaCard(this.shell.media) : null].filter(Boolean));
    this.renderCalendar();
  }

  renderNotifications() {
    const notify = this.shell.notify;
    const items = notify.items;
    const list = items.length
      ? h('div.nc-list', items.map((it) => notify.card(it)))
      : h('div.nc-empty.empty',
        h('div.empty-glyph', icon(notify.dnd ? 'bell-off' : 'sparkles')),
        h('div.empty-title', notify.dnd ? 'Focus is on' : 'All caught up'),
        h('div.empty-hint', notify.dnd ? 'Alerts are collected here quietly' : 'New notifications land here'));
    const dnd = new Switch({ on: notify.dnd, onChange: (on) => notify.setDnd(on) });
    this.nc.replaceChildren(
      h('div.nc-head',
        h('span.nc-title', 'Notifications'),
        items.length ? h('span.nc-total.num', String(items.length)) : null,
        h('span.grow'),
        items.length ? h('button.btn.ghost', { onclick: () => notify.clearAll() }, 'Clear all') : null),
      list,
      h('div.nc-foot',
        h('span.nc-foot-glyph', icon('bell-off')),
        h('span.grow', 'Focus', h('span.nc-foot-sub', ' · silence alerts')),
        dnd.el));
  }

  renderCalendar() {
    const today = new Date();
    const y = this.viewYear;
    const m = this.viewMonth;
    const first = new Date(y, m, 1);
    // Weeks start on Monday.
    const lead = (first.getDay() + 6) % 7;
    const start = new Date(y, m, 1 - lead);
    const cells = [];
    for (const d of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) cells.push(h('div.cal-dow', d));
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const c = h('div.cal-day', h('span', String(d.getDate())));
      c.classList.toggle('other', d.getMonth() !== m);
      c.classList.toggle('weekend', d.getDay() === 0 || d.getDay() === 6);
      c.classList.toggle('today', d.toDateString() === today.toDateString());
      cells.push(c);
    }
    const nav = (delta) => {
      const d = new Date(this.viewYear, this.viewMonth + delta, 1);
      this.viewYear = d.getFullYear();
      this.viewMonth = d.getMonth();
      this.renderCalendar();
    };
    const isNow = y === today.getFullYear() && m === today.getMonth();
    const monthLabel = h('button.cal-month', { title: 'Back to today' }, MONTHS[m], h('span.cal-year', ` ${y}`));
    monthLabel.disabled = isNow;
    monthLabel.addEventListener('click', () => {
      this.viewYear = today.getFullYear();
      this.viewMonth = today.getMonth();
      this.renderCalendar();
    });
    this.cal.replaceChildren(
      h('div.cal-nav',
        monthLabel,
        h('span.grow'),
        h('button.icon-btn', { title: 'Previous month', onclick: () => nav(-1) }, icon('chevron-left')),
        h('button.icon-btn', { title: 'Next month', onclick: () => nav(1) }, icon('chevron-right'))),
      h('div.cal-grid', cells));
  }
}
