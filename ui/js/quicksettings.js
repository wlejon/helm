/**
 * Quick settings, grown out of the status island: who is signed in, volume
 * and brightness, toggle tiles (network, Bluetooth, night light, do not
 * disturb) whose detail lists open inline, the media card, battery, and
 * the power row (restart and shut down ask once more before acting).
 */

import { h, $, initials } from './util.js';
import { icon } from './icons.js';
import { Slider } from './controls.js';
import { system, volumeIcon, networkIcon } from './system.js';
import { panels } from './morph.js';
import { mediaCard } from './media.js';
import { batteryIcon } from './islands.js';

export class QuickSettings {
  constructor(shell) {
    this.shell = shell;
    this.expanded = null; // 'wifi' | 'bluetooth' | 'audio' | null
    this.confirming = null;
    this.wifiPrompt = null;
  }

  init() {
    this.el = $('#quick-settings');
    this.body = h('div.panel-body.qs');
    this.el.replaceChildren(this.body);
    this.panel = {
      el: this.el, body: this.body, island: $('#island-right'), align: 'right',
      onOpen: () => this.render(),
    };
    this.volume = new Slider({ onInput: (v) => this.onVolume(v) });
    this.brightness = new Slider({ onInput: (v) => system.setBrightness(v) });
    for (const t of ['audio', 'network', 'bluetooth', 'power', 'display']) {
      system.on(t, () => this.isOpen && !this.volume.dragging && !this.brightness.dragging && this.refresh());
    }
    this.shell.media.onChange(() => this.isOpen && this.refresh());
    this.shell.notify.onDndChange(() => this.isOpen && this.refresh());
  }

  get isOpen() {
    return panels.isOpen(this.panel);
  }

  toggle() {
    if (!this.isOpen) {
      this.expanded = null;
      this.confirming = null;
      this.wifiPrompt = null;
    }
    panels.toggle(this.panel);
  }

  open() {
    if (!this.isOpen) this.toggle();
  }

  close() {
    if (this.isOpen) panels.close();
  }

  onVolume(v) {
    system.setVolume(v);
    if (this.volValue) this.volValue.textContent = `${Math.round(v * 100)}`;
  }

  /** Re-render while open, easing any change in height. */
  refresh() {
    panels.resize(this.panel, () => this.render());
  }

  render() {
    const audio = system.audio();
    const net = system.network();
    const bt = system.bluetooth();
    const power = system.power();
    const bright = system.brightness();
    const night = system.nightLight();
    const dnd = this.shell.notify.dnd;

    const user = this.shell.username;
    const head = h('div.qs-head',
      h('div.avatar', h('span.avatar-in', initials(user))),
      h('div.qs-user',
        h('span.qs-user-name', user),
        h('span.micro', this.shell.hostname || 'local session')),
      h('div.qs-head-actions',
        h('button.icon-btn.filled', { title: 'Settings (Super+,)', onclick: (e) => this.shell.openSettings(null, { origin: e.currentTarget, home: '#island-right' }) }, icon('settings')),
        h('button.icon-btn.filled', { title: 'Lock (Super+L)', onclick: () => { this.close(); this.shell.lock.lock(); } }, icon('lock'))));

    // Levels
    const muteBtn = h('button.icon-btn', { title: audio.muted ? 'Unmute' : 'Mute', disabled: !audio.available },
      icon(audio.muted ? 'volume-x' : volumeIcon(audio)));
    muteBtn.addEventListener('click', () => system.setMuted(!audio.muted));
    const outBtn = h('button.icon-btn', { title: 'Output device', disabled: !audio.available },
      icon(this.expanded === 'audio' ? 'chevron-up' : 'chevron-down'));
    outBtn.classList.toggle('on', this.expanded === 'audio');
    outBtn.addEventListener('click', () => this.expand('audio'));
    this.volValue = h('span.slider-value', audio.available ? `${Math.round(audio.volume * 100)}` : '—');
    const volRow = h('div.slider-row', muteBtn, this.volume.el, this.volValue, outBtn);
    this.volume.el.classList.toggle('disabled', !audio.available);

    const levels = h('div.qs-card.qs-levels',
      h('div.qs-card-head', h('span.micro', 'Sound'), h('span.qs-card-meta', audio.available ? audio.name : 'No output device')),
      volRow);
    if (bright.available) {
      levels.appendChild(h('div.slider-row', h('span.icon-btn', icon('sun')), this.brightness.el,
        h('span.slider-value', `${Math.round(bright.percent)}`), h('span.qs-spacer')));
    }
    if (this.expanded === 'audio') levels.appendChild(this.audioList(audio));

    // Tiles
    const tiles = [];
    const netTitle = net.kind === 'wifi' ? (net.wifiSsid || 'Wi-Fi') : (net.connected ? 'Wired' : 'Network');
    tiles.push(this.tile({
      on: net.connected,
      glyph: networkIcon(net),
      title: netTitle,
      sub: net.connected ? (net.limited ? 'Limited' : net.ip || 'Connected') : (net.available ? 'Disconnected' : 'Unavailable'),
      onClick: net.hasWifi ? () => this.expand('wifi') : null,
      more: net.hasWifi ? () => this.expand('wifi') : null,
      expanded: this.expanded === 'wifi',
    }));
    if (bt.available) {
      tiles.push(this.tile({
        on: bt.powered,
        glyph: bt.powered ? 'bluetooth' : 'bluetooth-off',
        title: 'Bluetooth',
        sub: !bt.powered ? 'Off' : bt.connected.length ? bt.connected.map((d) => d.alias || d.name).join(', ') : 'On',
        onClick: () => system.setBluetoothPowered(!bt.powered),
        more: () => this.expand('bluetooth'),
        expanded: this.expanded === 'bluetooth',
      }));
    }
    if (night.supported) {
      tiles.push(this.tile({
        on: night.enabled, glyph: 'moon', title: 'Night Light', sub: night.enabled ? 'Warm' : 'Off',
        onClick: () => system.setNightLight(!night.enabled),
      }));
    }
    tiles.push(this.tile({
      on: dnd, glyph: dnd ? 'bell-off' : 'bell', title: 'Focus', sub: dnd ? 'Silencing alerts' : 'Off',
      onClick: () => this.shell.notify.setDnd(!dnd),
    }));
    tiles.push(this.tile({
      on: false, glyph: 'image', title: 'Wallpaper', sub: this.shell.wallpaperLabel(),
      onClick: () => this.shell.cycleWallpaper(),
    }));
    if (tiles.length % 2) tiles.push(this.tile({
      on: false, glyph: 'clipboard', title: 'Clipboard', sub: 'History',
      onClick: () => { this.close(); this.shell.launcher.openClipboard(); },
    }));

    const parts = [head, levels, h('div.qs-grid', tiles)];
    if (this.expanded === 'wifi') parts.push(this.wifiList(net));
    if (this.expanded === 'bluetooth') parts.push(this.btList(bt));
    if (this.shell.media.active) parts.push(mediaCard(this.shell.media));
    parts.push(this.powerRow(power));

    this.body.replaceChildren(...parts);
    // Sliders size from layout, so set their values once they are placed.
    this.volume.set(audio.volume);
    this.volume.setMuted(audio.muted);
    if (bright.available) this.brightness.set(bright.percent / 100);
  }

  tile({ on, glyph, title, sub, onClick, more, expanded }) {
    const main = h('button.tile-main',
      h('span.tile-glyph', icon(glyph)),
      h('span.tile-text', h('span.tile-title', title), h('span.tile-sub', sub)));
    const el = h('div.tile', main);
    el.classList.toggle('on', !!on);
    el.classList.toggle('expanded', !!expanded);
    if (onClick) main.addEventListener('click', onClick);
    if (more) {
      const m = h('button.tile-more', { title: 'Details' }, icon(expanded ? 'chevron-up' : 'chevron-down'));
      m.addEventListener('click', (e) => {
        e.stopPropagation();
        more();
      });
      el.appendChild(m);
    }
    return el;
  }

  expand(which) {
    this.expanded = this.expanded === which ? null : which;
    this.wifiPrompt = null;
    if (this.expanded === 'wifi') system.scanWifi().then(() => this.isOpen && this.refresh());
    this.refresh();
  }

  sub(title, rows, empty) {
    return h('div.qs-sub',
      h('div.qs-sub-head', h('span.micro', title)),
      rows.length ? rows : h('div.qs-sub-empty', empty || 'Nothing here'));
  }

  audioList(audio) {
    return this.sub('Output', audio.outputs.map((o) => {
      const row = h('button.list-row', icon(/head/i.test(o.name) ? 'headphones' : 'speaker'), h('span.grow', o.name),
        o.isDefault ? icon('check', 'check') : null);
      row.classList.toggle('selected', o.isDefault);
      row.addEventListener('click', () => system.setOutput(o.id));
      return row;
    }), 'No output devices');
  }

  wifiList(net) {
    const aps = system.accessPoints();
    const rows = aps.slice(0, 8).map((ap) => {
      const strength = ap.strengthPercent >= 67 ? 'wifi' : ap.strengthPercent >= 34 ? 'wifi-2' : 'wifi-1';
      const secure = ap.security && ap.security !== 'open';
      const row = h('button.list-row',
        icon(strength),
        h('span.grow', ap.ssid),
        secure ? icon('lock', 'meta') : null,
        ap.active ? icon('check', 'check') : null);
      row.classList.toggle('selected', !!ap.active);
      row.addEventListener('click', () => {
        if (ap.active) system.disconnectWifi();
        else if (secure) {
          this.wifiPrompt = ap.ssid;
          this.refresh();
        } else {
          system.connectWifi(ap.ssid, '').catch(() => {});
        }
      });
      return row;
    });
    if (this.wifiPrompt) rows.push(this.wifiPasswordRow(this.wifiPrompt));
    if (!net.wifiEnabled) return this.sub('Wi-Fi', [], 'Wi-Fi is turned off');
    return this.sub('Wi-Fi networks', rows, 'Searching for networks…');
  }

  wifiPasswordRow(ssid) {
    const input = h('input.field', { type: 'password', placeholder: `Password for ${ssid}` });
    const err = h('div.qs-sub-error.hidden');
    const go = () => {
      system.connectWifi(ssid, input.value).then(() => {
        this.wifiPrompt = null;
        this.refresh();
      }).catch((e) => {
        err.textContent = (e && e.message) || 'Could not connect';
        err.classList.remove('hidden');
      });
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go();
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.wifiPrompt = null;
        this.refresh();
      }
    });
    setTimeout(() => input.focus(), 0);
    return h('div.qs-wifi-pass', h('div.micro', `Join ${ssid}`),
      h('div.slider-row', input, h('button.btn.primary', { onclick: go }, 'Join')), err);
  }

  btList(bt) {
    if (!bt.powered) return this.sub('Bluetooth', [], 'Bluetooth is off');
    return this.sub('Devices', bt.devices.map((d) => {
      const row = h('button.list-row',
        icon(/audio|headset|headphone/.test(d.icon || '') ? 'headphones' : 'bluetooth'),
        h('span.grow', d.alias || d.name || d.mac),
        h('span.meta', d.connected ? 'Connected' : 'Connect'));
      row.classList.toggle('selected', !!d.connected);
      row.addEventListener('click', () => system.toggleBluetoothDevice(d));
      return row;
    }), 'No paired devices');
  }

  powerRow(power) {
    const act = (key, label, iconName, fn, needsConfirm) => {
      const confirming = this.confirming === key;
      const btn = h('button.qs-power-btn', { title: label }, icon(iconName), h('span', confirming ? `${label}?` : label));
      btn.classList.toggle('confirm', confirming);
      btn.addEventListener('click', () => {
        if (needsConfirm && !confirming) {
          this.confirming = key;
          this.refresh();
          setTimeout(() => {
            if (this.confirming === key) {
              this.confirming = null;
              if (this.isOpen) this.refresh();
            }
          }, 3000);
          return;
        }
        this.confirming = null;
        this.close();
        fn();
      });
      return btn;
    };
    const sleep = act('suspend', 'Sleep', 'moon', () => system.request('suspend'), false);
    if (!power.can('suspend')) sleep.disabled = true;
    const restart = act('reboot', 'Restart', 'restart', () => system.request('reboot'), true);
    if (!power.can('reboot')) restart.disabled = true;
    const off = act('powerOff', 'Shut Down', 'power', () => system.request('powerOff'), true);
    if (!power.can('powerOff')) off.disabled = true;

    const row = h('div.qs-power-row', act('lock', 'Lock', 'lock', () => this.shell.lock.lock(), false), sleep, restart, off);
    if (!power.hasBattery) return row;
    const t = power.charging ? (power.percent >= 99 ? 'Fully charged' : 'Charging') : 'On battery';
    return h('div.qs-foot',
      h('div.qs-battery', icon(power.charging ? 'battery-charging' : batteryIcon(power.percent)),
        h('span.num', `${power.percent}%`), h('span', t)),
      row);
  }
}
