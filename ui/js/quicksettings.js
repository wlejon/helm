/**
 * Quick settings: user header, volume and brightness, toggle tiles
 * (network, Bluetooth, night light, do not disturb) with expandable detail
 * lists, the media card, and the power row.
 */

import { h, $, popovers, initials } from './util.js';
import { icon } from './icons.js';
import { Slider } from './controls.js';
import { system, volumeIcon, networkIcon } from './system.js';

export class QuickSettings {
  constructor(shell) {
    this.shell = shell;
    this.expanded = null; // 'wifi' | 'bluetooth' | 'audio' | null
    this.confirming = null;
    this.wifiPrompt = null;
  }

  init() {
    this.el = $('#quick-settings');
    this.volume = new Slider({
      onInput: (v) => system.setVolume(v),
    });
    this.brightness = new Slider({
      onInput: (v) => system.setBrightness(v),
    });
    for (const t of ['audio', 'network', 'bluetooth', 'power', 'display']) {
      system.on(t, () => this.isOpen && !this.volume.dragging && this.render());
    }
    this.shell.media.onChange(() => this.isOpen && this.render());
    this.shell.notify.onDndChange(() => this.isOpen && this.render());
  }

  get isOpen() {
    return popovers.isOpen(this.el);
  }

  toggle(anchor) {
    if (!this.isOpen) {
      this.expanded = null;
      this.confirming = null;
      this.wifiPrompt = null;
      this.render();
    }
    popovers.toggle(this.el, anchor, { align: 'right' });
  }

  close() {
    if (this.isOpen) popovers.close();
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
      h('div.qs-avatar', initials(user)),
      h('div.qs-user',
        h('span.qs-user-name', user),
        h('span.qs-user-sub', this.shell.hostname || 'Local session')),
      h('div.qs-head-actions',
        h('button.icon-btn.round-fill', { title: 'Settings', onclick: () => this.shell.openSettings() }, icon('settings')),
        h('button.icon-btn.round-fill', { title: 'Lock', onclick: () => { this.close(); this.shell.lock.lock(); } }, icon('lock'))));

    // Sliders
    const muteBtn = h('button.icon-btn', { title: audio.muted ? 'Unmute' : 'Mute' }, icon(volumeIcon(audio)));
    muteBtn.addEventListener('click', () => system.setMuted(!audio.muted));
    const outBtn = h('button.icon-btn', { title: 'Output device' }, icon(this.expanded === 'audio' ? 'chevron-down' : 'chevron-right'));
    outBtn.addEventListener('click', () => this.expand('audio'));
    const volRow = h('div.slider-row', muteBtn, this.volume.el, outBtn);
    if (!audio.available) volRow.style.opacity = '0.4';

    const sliders = h('div.qs-sliders', volRow);
    if (bright.available) {
      sliders.appendChild(h('div.slider-row', h('span.icon-btn', icon('sun')), this.brightness.el, h('span', { style: { width: '32px' } })));
    }

    // Tiles
    const tiles = [];
    tiles.push(this.tile({
      on: net.connected,
      glyph: networkIcon(net),
      title: net.kind === 'wifi' ? (net.wifiSsid || 'Wi-Fi') : (net.connected ? 'Wired' : 'Network'),
      sub: net.connected ? (net.limited ? 'Limited connectivity' : net.ip || 'Connected') : 'Disconnected',
      more: net.hasWifi ? () => this.expand('wifi') : null,
      onClick: net.hasWifi ? () => this.expand('wifi') : null,
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
        on: night.enabled,
        glyph: 'moon',
        title: 'Night Light',
        sub: night.enabled ? 'On' : 'Off',
        onClick: () => system.setNightLight(!night.enabled),
      }));
    }
    tiles.push(this.tile({
      on: dnd,
      glyph: dnd ? 'bell-off' : 'bell',
      title: 'Do Not Disturb',
      sub: dnd ? 'On' : 'Off',
      onClick: () => this.shell.notify.setDnd(!dnd),
    }));

    const parts = [head, sliders, h('div.qs-grid', tiles)];

    if (this.expanded === 'audio') parts.push(this.audioList(audio));
    if (this.expanded === 'wifi') parts.push(this.wifiList(net));
    if (this.expanded === 'bluetooth') parts.push(this.btList(bt));

    if (this.shell.media.active) parts.push(this.mediaCard());

    if (power.hasBattery) {
      const t = power.charging ? (power.percent >= 99 ? 'Fully charged' : 'Charging') : 'On battery';
      parts.push(h('div.qs-battery', icon(power.charging ? 'battery-charging' : 'battery'), `${power.percent}% · ${t}`));
    }

    parts.push(this.powerRow(power));

    this.el.replaceChildren(...parts);
    // Sliders size from layout, so set their values after they are placed.
    this.volume.set(audio.volume);
    this.volume.setMuted(audio.muted);
    if (bright.available) this.brightness.set(bright.percent / 100);
  }

  tile({ on, glyph, title, sub, onClick, more, expanded }) {
    const el = h('button.tile',
      h('span.tile-glyph', icon(glyph)),
      h('span.tile-text', h('span.tile-title', title), h('span.tile-sub', sub)));
    el.classList.toggle('on', !!on);
    if (onClick) el.addEventListener('click', onClick);
    if (more) {
      const m = h('span.tile-more', icon(expanded ? 'chevron-down' : 'chevron-right'));
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
    if (this.expanded === 'wifi') system.scanWifi().then(() => this.isOpen && this.render());
    this.render();
  }

  sub(title, iconName, rows) {
    return h('div.qs-sub',
      h('div.qs-sub-head', icon(iconName), h('span.qs-sub-title', title)),
      rows.length ? rows : h('div.qs-sub-empty', 'Nothing here'));
  }

  audioList(audio) {
    return this.sub('Sound Output', 'speaker', audio.outputs.map((o) => {
      const row = h('button.list-row', h('span.grow', o.name),
        o.isDefault ? icon('check', 'check') : null);
      row.classList.toggle('selected', o.isDefault);
      row.addEventListener('click', () => system.setOutput(o.id));
      return row;
    }));
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
          this.render();
        } else {
          system.connectWifi(ap.ssid, '').catch(() => {});
        }
      });
      return row;
    });
    if (this.wifiPrompt) rows.push(this.wifiPasswordRow(this.wifiPrompt));
    if (!net.wifiEnabled) rows.unshift(h('div.qs-sub-empty', 'Wi-Fi is turned off'));
    return this.sub('Wi-Fi Networks', 'wifi', rows);
  }

  wifiPasswordRow(ssid) {
    const input = h('input.qs-input', { type: 'password', placeholder: `Password for ${ssid}` });
    const err = h('div.qs-sub-empty.hidden');
    const go = () => {
      system.connectWifi(ssid, input.value).then(() => {
        this.wifiPrompt = null;
        this.render();
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
        this.render();
      }
    });
    setTimeout(() => input.focus(), 0);
    return h('div.qs-wifi-pass', h('div.slider-row', input, h('button.btn.primary', { onclick: go }, 'Join')), err);
  }

  btList(bt) {
    if (!bt.powered) return this.sub('Bluetooth', 'bluetooth', [h('div.qs-sub-empty', 'Bluetooth is off')]);
    return this.sub('Bluetooth Devices', 'bluetooth', bt.devices.map((d) => {
      const row = h('button.list-row',
        icon(/audio|headset|headphone/.test(d.icon || '') ? 'headphones' : 'bluetooth'),
        h('span.grow', d.alias || d.name || d.mac),
        h('span.meta', d.connected ? 'Connected' : ''));
      row.addEventListener('click', () => system.toggleBluetoothDevice(d));
      return row;
    }));
  }

  mediaCard() {
    const m = this.shell.media;
    const art = m.artPath ? h('img', { src: m.artPath }) : icon('music');
    return h('div.media-card',
      h('div.media-art', art),
      h('div.media-meta', h('span.media-title', m.title), h('span.media-artist', m.artist)),
      h('div.media-controls',
        h('button.icon-btn', { title: 'Previous', onclick: () => m.previous() }, icon('skip-back')),
        h('button.icon-btn.play', { title: 'Play/Pause', onclick: () => m.playPause() }, icon(m.playing ? 'pause' : 'play')),
        h('button.icon-btn', { title: 'Next', onclick: () => m.next() }, icon('skip-forward'))));
  }

  powerRow(power) {
    const act = (key, label, iconName, fn, needsConfirm) => {
      const confirming = this.confirming === key;
      const btn = h('button.qs-power-btn', icon(iconName), h('span', confirming ? 'Confirm' : label));
      btn.classList.toggle('confirm', confirming);
      btn.addEventListener('click', () => {
        if (needsConfirm && !confirming) {
          this.confirming = key;
          this.render();
          setTimeout(() => {
            if (this.confirming === key) {
              this.confirming = null;
              if (this.isOpen) this.render();
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
    return h('div.qs-power-row',
      act('lock', 'Lock', 'lock', () => this.shell.lock.lock(), false),
      sleep, restart, off);
  }
}

