/**
 * The top bar: launcher button, workspaces, focused window, clock, media
 * chip, tray and the status pill that opens quick settings.
 */

import { h, $, api, attempt, listen, everyMinute, fmtTime, fmtDateShort, appIcon } from './util.js';
import { icon } from './icons.js';
import { settings } from './settings.js';
import { system, volumeIcon, networkIcon } from './system.js';
import { windows } from './windows.js';
import { appdb } from './appdb.js';

export class Bar {
  constructor(shell) {
    this.shell = shell;
    this.stopClock = null;
  }

  init() {
    this.el = $('#top-panel');
    this.wsEl = $('#workspaces');
    this.focusedEl = $('#bar-focused');
    this.clockBtn = $('#bar-clock');
    this.statusBtn = $('#bar-status');
    this.mediaBtn = $('#bar-media');
    this.trayEl = $('#tray');

    $('#bar-launcher').addEventListener('click', () => this.shell.launcher.toggle());
    this.clockBtn.addEventListener('click', () => this.shell.calendar.toggle(this.clockBtn));
    this.statusBtn.addEventListener('click', () => this.shell.quick.toggle(this.statusBtn));
    this.statusBtn.addEventListener('wheel', (e) => {
      e.preventDefault();
      const a = system.audio();
      if (!a.available) return;
      const v = Math.min(1, Math.max(0, a.volume + (e.deltaY < 0 ? 0.05 : -0.05)));
      system.setVolume(v);
      this.shell.osd.show(volumeIcon({ ...a, volume: v, muted: false }), v);
    });
    this.mediaBtn.addEventListener('click', () => this.shell.quick.toggle(this.statusBtn));

    this.wsEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const list = windows.workspaces();
      const i = list.findIndex((w) => w.active);
      const next = list[i + (e.deltaY > 0 ? 1 : -1)];
      if (next) windows.switchWorkspace(next.id);
    });

    this.stopClock = everyMinute(() => this.renderClock());
    settings.watch('use24h', () => this.renderClock());
    settings.watch('showSeconds', () => this.syncSecondsTick());
    this.syncSecondsTick();
    system.on('audio', () => this.renderStatus());
    system.on('network', () => this.renderStatus());
    system.on('bluetooth', () => this.renderStatus());
    system.on('power', () => this.renderStatus());
    windows.on('workspaces', () => this.renderWorkspaces());
    windows.on('windows', () => this.renderFocused());
    windows.on('focus', () => this.renderFocused());
    this.shell.media.onChange(() => this.renderMedia());

    this.renderStatus();
    this.renderWorkspaces();
    this.renderFocused();
    this.renderMedia();
    this.setupTray();
  }

  renderClock() {
    const now = new Date();
    $('.clock-date', this.clockBtn).textContent = fmtDateShort(now);
    $('.clock-time', this.clockBtn).textContent = fmtTime(now, settings.get('use24h'), settings.get('showSeconds'));
  }

  /** A one-second tick only while the clock shows seconds. */
  syncSecondsTick() {
    clearInterval(this.secondsTimer);
    this.secondsTimer = settings.get('showSeconds') ? setInterval(() => this.renderClock(), 1000) : 0;
    this.renderClock();
  }

  /** Unread dot and do-not-disturb glyph beside the clock. */
  setClockIndicators({ unread, dnd }) {
    $('.badge-dot', this.clockBtn).classList.toggle('hidden', !unread || dnd);
    $('.dnd-glyph', this.clockBtn).classList.toggle('hidden', !dnd);
  }

  renderStatus() {
    const net = system.network();
    const audio = system.audio();
    const bt = system.bluetooth();
    const power = system.power();

    const kids = [];
    kids.push(icon(networkIcon(net), `status-glyph${net.connected ? '' : ' dim'}`));
    if (bt.available && bt.powered && bt.connected.length > 0) kids.push(icon('bluetooth', 'status-glyph'));
    kids.push(icon(volumeIcon(audio), 'status-glyph'));
    if (power.hasBattery) {
      kids.push(icon(power.charging ? 'battery-charging' : 'battery', 'status-glyph'));
      kids.push(h('span.battery-text', `${power.percent}%`));
    }
    kids.push(icon('power', 'status-glyph'));
    this.statusBtn.replaceChildren(...kids);
    this.statusBtn.title = [net.label, `Volume ${Math.round(audio.volume * 100)}%`].join(' · ');
  }

  renderWorkspaces() {
    const list = windows.workspaces();
    if (list.length <= 1 && windows.windows().length === 0) {
      // A single empty workspace says nothing; keep the space for the title.
      this.wsEl.replaceChildren();
      this.wsEl.classList.add('hidden');
    } else {
      this.wsEl.classList.remove('hidden');
      this.wsEl.replaceChildren(...list.map((ws) => {
        const dot = h('span.ws-dot', { title: `Workspace ${ws.name || ws.id}` });
        dot.classList.toggle('active', !!ws.active);
        dot.classList.toggle('occupied', (ws.windows || []).length > 0);
        dot.addEventListener('click', () => windows.switchWorkspace(ws.id));
        return dot;
      }));
    }
  }

  renderFocused() {
    const w = windows.focused();
    if (!w) {
      this.focusedEl.replaceChildren();
      return;
    }
    const app = appdb.forWindow(w.appId, w.title);
    const name = app ? app.name : (w.appId || w.title || '');
    this.focusedEl.replaceChildren(
      appIcon(app ? app.icon : w.appId, name, 32),
      h('span.focused-title', name),
    );
    this.focusedEl.title = w.title || name;
  }

  renderMedia() {
    const m = this.shell.media;
    if (!m.active) {
      this.mediaBtn.classList.add('hidden');
      return;
    }
    this.mediaBtn.classList.remove('hidden');
    const label = m.artist && m.artist !== m.title ? `${m.title} · ${m.artist}` : m.title;
    this.mediaBtn.replaceChildren(
      icon(m.playing ? 'music' : 'pause'),
      h('span.media-chip-title', label),
    );
  }

  // -- Tray (StatusNotifierItem host) --------------------------------------

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
        glyph = img.tagName === 'IMG' ? img : null;
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
    clearInterval(this.secondsTimer);
  }
}
