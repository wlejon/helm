/**
 * The clock popover: notification center on the left, today and a month
 * calendar on the right.
 */

import { h, $, popovers, DAYS, MONTHS } from './util.js';
import { icon } from './icons.js';
import { Switch } from './controls.js';

export class CalendarPopover {
  constructor(shell) {
    this.shell = shell;
    this.viewYear = 0;
    this.viewMonth = 0;
  }

  init() {
    this.el = $('#calendar-popover');
    const notify = this.shell.notify;
    notify.onChange(() => {
      if (this.isOpen) {
        notify.unread = 0;
        this.renderNotifications();
      }
      this.shell.bar.setClockIndicators({ unread: notify.unread > 0, dnd: notify.dnd });
    });
    notify.onDndChange(() => {
      this.shell.bar.setClockIndicators({ unread: notify.unread > 0, dnd: notify.dnd });
      if (this.isOpen) this.renderNotifications();
    });
    this.shell.bar.setClockIndicators({ unread: false, dnd: notify.dnd });
  }

  get isOpen() {
    return popovers.isOpen(this.el);
  }

  toggle(anchor) {
    if (!this.isOpen) {
      const now = new Date();
      this.viewYear = now.getFullYear();
      this.viewMonth = now.getMonth();
      this.render();
      this.shell.notify.markRead();
    }
    popovers.toggle(this.el, anchor, { align: 'center' });
  }

  render() {
    this.nc = h('section.nc');
    this.cal = h('section.cal');
    this.el.replaceChildren(this.nc, this.cal);
    this.renderNotifications();
    this.renderCalendar();
  }

  renderNotifications() {
    const notify = this.shell.notify;
    const items = notify.items;
    const list = items.length
      ? h('div.nc-list', items.map((it) => notify.card(it)))
      : h('div.nc-empty', icon(notify.dnd ? 'bell-off' : 'bell'), 'No notifications');
    const dnd = new Switch({ on: notify.dnd, onChange: (on) => notify.setDnd(on) });
    this.nc.replaceChildren(
      h('div.nc-head', h('span.nc-title', 'Notifications')),
      list,
      h('div.nc-foot',
        h('label.dnd-switch', dnd.el, 'Do Not Disturb'),
        items.length ? h('button.btn.ghost', { onclick: () => notify.clearAll() }, 'Clear all') : h('span')));
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
    for (const d of ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']) cells.push(h('div.cal-dow', d));
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const c = h('div.cal-day', String(d.getDate()));
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
    const monthLabel = h('button.cal-month', `${MONTHS[m]} ${y}`);
    monthLabel.addEventListener('click', () => {
      this.viewYear = today.getFullYear();
      this.viewMonth = today.getMonth();
      this.renderCalendar();
    });
    this.cal.replaceChildren(
      h('div',
        h('div.cal-today-dow', DAYS[today.getDay()]),
        h('div.cal-today-date', `${MONTHS[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`)),
      h('div.cal-nav',
        monthLabel,
        h('button.icon-btn', { title: 'Previous month', onclick: () => nav(-1) }, icon('chevron-left')),
        h('button.icon-btn', { title: 'Next month', onclick: () => nav(1) }, icon('chevron-right'))),
      h('div.cal-grid', cells));
  }
}
