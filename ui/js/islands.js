/**
 * The bar's islands, along the bottom edge (#bar). Left: the launcher mark, workspaces and the focused
 * app. Center: the clock with the live activity and the notification
 * count; it grows into the calendar and notification center. Right: the
 * tray and the status glyphs; it grows into quick settings.
 */

import { h, $, api, attempt, listen, everyMinute, fmtTime, appIcon } from './util.js';
import { icon } from './icons.js';
import { settings } from './settings.js';
import { system, volumeIcon, networkIcon } from './system.js';
import { windows } from './windows.js';
import { appdb } from './appdb.js';
import { animateWidth } from './morph.js';
import { fmtElapsed } from './activities.js';
import { DAYS, MONTHS } from './util.js';

export class Islands {
  constructor(shell) {
    this.shell = shell;
    this.stopClock = null;
    this.indicators = { unread: 0, dnd: false };
  }

  init() {
    this.left = $('#island-left');
    this.center = $('#island-center');
    this.right = $('#island-right');
    this.wsEl = $('#workspaces');
    this.focusedEl = $('#isl-focused');
    this.statusBtn = $('#isl-status');
    this.trayEl = $('#tray');
    this.liveEl = $('#live-activity');

    $('#isl-launcher').addEventListener('click', () => this.shell.launcher.toggle($('#isl-launcher')));
    this.center.addEventListener('click', () => this.shell.calendar.toggle());
    this.statusBtn.addEventListener('click', () => this.shell.quick.toggle());
    this.focusedEl.addEventListener('click', () => this.shell.spaces.toggle());
    this.statusBtn.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.shell.stepVolume(e.deltaY < 0 ? 0.05 : -0.05);
    });
    this.wsEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const list = windows.workspaces();
      const i = list.findIndex((w) => w.active);
      const next = list[i + (e.deltaY > 0 ? 1 : -1)];
      if (next) windows.switchWorkspace(next.id);
    });

    this.stopClock = everyMinute(() => this.renderClock());
    settings.watch('use24h', () => this.renderClock());
    settings.watch('showSeconds', () => this.syncTick());
    this.syncTick();
    for (const t of ['audio', 'network', 'bluetooth', 'power']) system.on(t, () => this.renderStatus());
    windows.on('workspaces', () => this.renderWorkspaces());
    windows.on('windows', () => this.renderFocused());
    windows.on('focus', () => this.renderFocused());
    this.shell.activities.onChange(() => this.renderLive());

    this.renderStatus();
    this.renderWorkspaces();
    this.renderFocused();
    this.renderLive();
    this.setupTray();
  }

  // -- Center ----------------------------------------------------------------

  renderClock() {
    const now = new Date();
    $('.clock-date', this.center).textContent = `${DAYS[now.getDay()].slice(0, 3)} ${now.getDate()} ${MONTHS[now.getMonth()].slice(0, 3)}`;
    $('.clock-time', this.center).textContent = fmtTime(now, settings.get('use24h'), settings.get('showSeconds'));
    if (this.shell.lock && this.shell.lock.renderClock) this.shell.lock.renderClock();
  }

  /** A one-second tick while the clock shows seconds or a recording runs. */
  syncTick() {
    const rec = this.shell.activities.primary();
    const want = settings.get('showSeconds') || (rec && rec.kind === 'recording');
    if (want && !this.tick) {
      this.tick = setInterval(() => {
        if (settings.get('showSeconds')) this.renderClock();
        this.renderRecTime();
      }, 1000);
    } else if (!want && this.tick) {
      clearInterval(this.tick);
      this.tick = 0;
    }
    this.renderClock();
  }

  /** The unread count and do-not-disturb glyph beside the clock. */
  setIndicators({ unread, dnd }) {
    const count = $('.nc-count', this.center);
    const glyph = $('.dnd-glyph', this.center);
    const show = unread > 0 && !dnd;
    if (show === !count.classList.contains('hidden') && count.textContent === String(unread)
        && dnd === !glyph.classList.contains('hidden')) return;
    animateWidth(this.center, () => {
      count.textContent = unread > 99 ? '99+' : String(unread);
      count.classList.toggle('hidden', !show);
      glyph.classList.toggle('hidden', !dnd);
    });
  }

  renderLive() {
    const a = this.shell.activities.primary();
    const key = a ? `${a.id}|${a.kind}|${a.title}|${a.paused}|${a.art}` : '';
    if (key === this.liveKey) return;
    this.liveKey = key;
    animateWidth(this.center, () => {
      if (!a) {
        this.liveEl.classList.add('hidden');
        this.liveEl.replaceChildren();
        return;
      }
      this.liveEl.classList.remove('hidden');
      this.liveEl.classList.toggle('paused', !!a.paused);
      this.liveEl.dataset.kind = a.kind;
      if (a.kind === 'recording') {
        this.recEl = h('span.rec-time', fmtElapsed(Date.now() - a.since));
        this.liveEl.replaceChildren(...[h('span.rec-dot'), this.recEl,
          a.title ? h('span.live-title', a.title) : null].filter(Boolean));
      } else {
        this.recEl = null;
        const art = a.art ? h('span.live-art', h('img', { src: a.art })) : h('span.live-art', icon(a.icon || 'music'));
        this.liveEl.replaceChildren(art,
          h('span.eq', h('span.eq-bar'), h('span.eq-bar'), h('span.eq-bar'), h('span.eq-bar')),
          h('span.live-title', a.title || ''));
      }
    });
    this.syncTick();
  }

  renderRecTime() {
    const a = this.shell.activities.primary();
    if (this.recEl && a && a.kind === 'recording') this.recEl.textContent = fmtElapsed(Date.now() - a.since);
  }

  // -- Left ------------------------------------------------------------------

  renderWorkspaces() {
    let list = windows.workspaces();
    // Without a compositor there is still the one desktop to show.
    if (list.length === 0) list = [{ id: 0, name: '1', active: true, windows: [] }];
    this.wsEl.replaceChildren(...list.map((ws, i) => {
      const b = h('button.ws', { title: `Workspace ${ws.name || i + 1}` }, h('span', String(i + 1)), h('span.ws-dot'));
      b.classList.toggle('active', !!ws.active);
      b.classList.toggle('occupied', (ws.windows || []).length > 0);
      b.addEventListener('click', () => {
        if (ws.active) this.shell.spaces.toggle();
        else windows.switchWorkspace(ws.id);
      });
      return b;
    }));
  }

  renderFocused() {
    const w = windows.focused();
    if (!w) {
      this.focusedEl.classList.add('hidden');
      this.focusedEl.replaceChildren();
      return;
    }
    const app = appdb.forWindow(w.appId, w.title);
    const name = app ? app.name : (w.appId || w.title || '');
    this.focusedEl.classList.remove('hidden');
    this.focusedEl.replaceChildren(
      appIcon(app ? app.icon : w.appId, name, 32),
      h('span.focused-title', name),
    );
    this.focusedEl.title = `${w.title || name} · Spaces (Super+W)`;
  }

  // -- Right -----------------------------------------------------------------

  renderStatus() {
    const net = system.network();
    const audio = system.audio();
    const bt = system.bluetooth();
    const power = system.power();

    const kids = [];
    kids.push(icon(networkIcon(net), net.connected ? '' : 'dim'));
    if (bt.available && bt.powered && bt.connected.length > 0) kids.push(icon('bluetooth'));
    kids.push(icon(volumeIcon(audio), audio.muted ? 'dim' : ''));
    if (power.hasBattery) {
      kids.push(icon(power.charging ? 'battery-charging' : batteryIcon(power.percent)));
      const t = h('span.battery-text', `${power.percent}%`);
      t.classList.toggle('low', !power.charging && power.percent <= 15);
      kids.push(t);
    }
    kids.push(icon('power'));
    this.statusBtn.replaceChildren(...kids);
    this.statusBtn.title = [net.label, audio.available ? `Volume ${Math.round(audio.volume * 100)}%` : null,
      'Quick settings (Super+S)'].filter(Boolean).join(' · ');
  }

  setupTray() {
    const sys = api('sys');
    if (!sys || !sys.tray) return;
    attempt('tray.start', () => sys.tray.start());
    for (const ev of ['itemAdded', 'itemChanged', 'itemRemoved']) listen(sys.tray, ev, () => this.renderTray());
    this.renderTray();
  }

  renderTray() {
    const tray = api('sys').tray;
    const items = attempt('tray.getItems', () => tray.getItems(), []) || [];
    this.trayEl.replaceChildren(...items.filter((it) => !it.hidden && it.status !== 'passive').map((it) => {
      const name = (it.status === 'needs-attention' && it.attentionIcon && it.attentionIcon.name)
        || (it.icon && it.icon.name) || '';
      let glyph = null;
      if (name.startsWith('/')) glyph = h('img', { src: name });
      else if (name) {
        const img = appIcon(name, it.title || it.id, 32, 'tray-img');
        glyph = img.classList.contains('app-icon-img') ? img : null;
      }
      const btn = h('button.tray-item', { title: (it.tooltip && it.tooltip.title) || it.title || it.id },
        glyph || icon('apps'));
      btn.addEventListener('click', (e) => {
        attempt('tray.activate', () => tray.activate(it.id, Math.round(e.clientX), Math.round(e.clientY)));
      });
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.shell.menus.trayMenu(it, btn);
      });
      return btn;
    }));
  }

  destroy() {
    if (this.stopClock) this.stopClock();
    clearInterval(this.tick);
  }
}

export function batteryIcon(pct) {
  if (pct == null) return 'battery';
  if (pct <= 15) return 'battery-low';
  if (pct <= 60) return 'battery-half';
  return 'battery';
}
