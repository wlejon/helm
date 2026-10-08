/**
 * System state, normalised for the bar and quick settings. Each getter
 * returns a plain snapshot; subscribers hear 'audio', 'network', 'bluetooth',
 * 'power' and 'display' when something changes.
 *
 * Audio prefers bro.sys.audio (PipeWire) and falls back to bro.pulse.
 * Volumes are 0..1, the scale wpctl prints.
 */

import { api, attempt, listen } from './util.js';

class SystemState {
  constructor() {
    this.subs = new Map();
    this.pending = new Set();
    this.flushQueued = false;
  }

  init() {
    const pulse = api('pulse');
    const sys = api('sys');
    const displays = api('displays');

    if (sys && sys.audio) {
      for (const ev of ['deviceAdded', 'deviceRemoved', 'deviceChanged', 'defaultChanged']) {
        listen(sys.audio, ev, () => this.changed('audio'));
      }
    } else if (pulse) {
      for (const ev of ['sinkAdded', 'sinkUpdated', 'sinkRemoved', 'defaultSinkChanged']) {
        listen(pulse, ev, () => this.changed('audio'));
      }
    }
    if (pulse) {
      for (const ev of ['streamAdded', 'streamUpdated', 'streamRemoved']) {
        listen(pulse, ev, () => this.changed('streams'));
      }
    }
    if (sys && sys.network) {
      listen(sys.network, 'changed', () => this.changed('network'));
      listen(sys.network, 'wifiScanCompleted', () => this.changed('network'));
    }
    if (sys && sys.bluetooth) {
      for (const ev of ['adapterChanged', 'deviceFound', 'deviceChanged', 'deviceRemoved']) {
        listen(sys.bluetooth, ev, () => this.changed('bluetooth'));
      }
    }
    if (sys && sys.power) {
      listen(sys.power, 'changed', () => this.changed('power'));
    }
    if (displays) {
      listen(displays, 'brightness', () => this.changed('display'));
    }
  }

  on(topic, fn) {
    if (!this.subs.has(topic)) this.subs.set(topic, new Set());
    this.subs.get(topic).add(fn);
  }

  /** Coalesce bursts (a sink update fires per channel) into one notify. */
  changed(topic) {
    this.pending.add(topic);
    if (this.flushQueued) return;
    this.flushQueued = true;
    setTimeout(() => {
      this.flushQueued = false;
      const topics = Array.from(this.pending);
      this.pending.clear();
      for (const t of topics) {
        for (const fn of this.subs.get(t) || []) attempt(`system ${t} subscriber`, () => fn());
      }
    }, 16);
  }

  // -- Audio --------------------------------------------------------------
  //
  // bro.sys.audio (PipeWire) first: it reads the same volumes wpctl prints
  // and covers inputs too. bro.pulse is the fallback for outputs, and the
  // only source of per-application streams.

  /** Every output or input device: { id, name, volume, muted, isDefault, hasVolume, formFactor }. */
  devices(direction = 'output') {
    const sys = api('sys');
    if (sys && sys.audio) {
      const st = attempt('sys.audio.getState', () => sys.audio.getState());
      if (st && Array.isArray(st.devices)) {
        const def = direction === 'output' ? st.defaultOutput : st.defaultInput;
        const list = st.devices.filter((d) => d.direction === direction);
        const hasDef = list.some((d) => d.id === def);
        return list.map((d, i) => ({
          id: d.id,
          name: d.description || d.deviceName || d.id,
          volume: d.volume ?? 0,
          muted: !!d.muted,
          isDefault: hasDef ? d.id === def : (list.some((x) => x.isDefault) ? !!d.isDefault : i === 0),
          hasVolume: d.hasVolume !== false,
          formFactor: d.formFactor || '',
          backend: 'sys',
        }));
      }
    }
    const pulse = api('pulse');
    if (pulse && direction === 'output') {
      const sinks = attempt('pulse.getSinks', () => pulse.getSinks(), []) || [];
      const def = attempt('pulse.getDefaultSink', () => pulse.getDefaultSink());
      return sinks.map((s, i) => ({
        id: s.id,
        name: s.description || s.name,
        volume: s.volume ?? 0,
        muted: !!s.isMuted,
        isDefault: def ? s.id === def.id : (sinks.some((x) => x.isDefault) ? !!s.isDefault : i === 0),
        hasVolume: true,
        formFactor: '',
        backend: 'pulse',
      }));
    }
    return [];
  }

  audio() {
    const outs = this.devices('output');
    const def = outs.find((d) => d.isDefault) || outs[0];
    if (!def) return { available: false, id: null, volume: 0, muted: false, name: 'No output', outputs: [] };
    return {
      available: true,
      id: def.id,
      volume: def.volume,
      muted: def.muted,
      name: def.name,
      outputs: outs.map((o) => ({ id: o.id, name: o.name, isDefault: o.id === def.id })),
    };
  }

  /** The default input, shaped like audio(). */
  microphone() {
    const ins = this.devices('input');
    const def = ins.find((d) => d.isDefault) || ins[0];
    if (!def) return { available: false, id: null, volume: 0, muted: false, name: 'No input', inputs: [] };
    return { available: true, id: def.id, volume: def.volume, muted: def.muted, name: def.name, inputs: ins };
  }

  setDeviceVolume(id, v) {
    const sys = api('sys');
    if (sys && sys.audio) attempt('sys.audio.setVolume', () => sys.audio.setVolume(id, v));
    else attempt('pulse.setSinkVolume', () => api('pulse').setSinkVolume(id, v));
    this.changed('audio');
  }

  setDeviceMuted(id, m) {
    const sys = api('sys');
    if (sys && sys.audio) attempt('sys.audio.setMute', () => sys.audio.setMute(id, m));
    else attempt('pulse.setSinkMuted', () => api('pulse').setSinkMuted(id, m));
    this.changed('audio');
  }

  setDefaultDevice(id, direction = 'output') {
    const sys = api('sys');
    if (sys && sys.audio) {
      attempt('sys.audio.setDefault', () => (direction === 'output'
        ? sys.audio.setDefaultSink(id) : sys.audio.setDefaultSource(id)));
    } else if (direction === 'output') {
      attempt('pulse.setDefaultSink', () => api('pulse').setDefaultSink(id));
    }
    this.changed('audio');
  }

  setVolume(v) {
    const a = this.audio();
    if (!a.available) return;
    this.setDeviceVolume(a.id, v);
    if (a.muted && v > 0) this.setDeviceMuted(a.id, false);
  }

  setMuted(m) {
    const a = this.audio();
    if (!a.available) return;
    this.setDeviceMuted(a.id, m);
  }

  setOutput(id) {
    this.setDefaultDevice(id, 'output');
  }

  /** Applications playing sound (bro.pulse), or null when that is missing. */
  streams() {
    const pulse = api('pulse');
    if (!pulse) return null;
    const list = attempt('pulse.getStreams', () => pulse.getStreams(), []) || [];
    return list.map((st) => ({
      id: st.id,
      name: st.appId || st.name || 'Application',
      icon: st.icon || '',
      volume: st.volume ?? 0,
      muted: !!st.isMuted,
    }));
  }

  setStreamVolume(id, v) {
    attempt('pulse.setStreamVolume', () => api('pulse').setStreamVolume(id, v));
    this.changed('streams');
  }

  setStreamMuted(id, m) {
    attempt('pulse.setStreamMuted', () => api('pulse').setStreamMuted(id, m));
    this.changed('streams');
  }

  // -- Network ------------------------------------------------------------

  network() {
    const sys = api('sys');
    const st = sys && sys.network ? attempt('sys.network.getState', () => sys.network.getState()) : null;
    if (!st) return { available: false, kind: 'none', connected: false, label: 'Offline', detail: '' };
    const devices = (st.devices || []).filter((d) => d.type === 'ethernet' || d.type === 'wifi');
    const primary = devices.find((d) => d.id === st.primaryDevice)
      || devices.find((d) => d.isPrimary)
      || devices.find((d) => d.state === 'connected');
    const wifiDev = devices.find((d) => d.type === 'wifi');
    const connected = !!primary && primary.state === 'connected';
    const kind = connected ? primary.type : 'none';
    const ip = connected && primary.ipv4 && primary.ipv4.addresses && primary.ipv4.addresses[0]
      ? primary.ipv4.addresses[0].replace(/\/\d+$/, '') : '';
    let label = 'Disconnected';
    if (connected && kind === 'wifi') label = primary.connection || 'Wi-Fi';
    else if (connected) label = 'Wired';
    return {
      available: true,
      kind,
      connected,
      limited: connected && st.connectivity && st.connectivity !== 'full',
      label,
      ip,
      detail: connected ? [primary.interfaceName, ip].filter(Boolean).join(' · ') : '',
      speedMbps: connected ? primary.speedMbps : 0,
      hasWifi: !!wifiDev,
      wifiDeviceId: wifiDev ? wifiDev.id : null,
      wifiEnabled: !!st.wifiEnabled && !!st.wifiHardwareEnabled,
      wifiConnected: !!wifiDev && wifiDev.state === 'connected',
      wifiSsid: wifiDev && wifiDev.state === 'connected' ? wifiDev.connection : '',
    };
  }

  accessPoints() {
    const sys = api('sys');
    if (!sys || !sys.network) return [];
    const aps = attempt('sys.network.getAccessPoints', () => sys.network.getAccessPoints(), []) || [];
    // One row per SSID: the strongest BSSID wins.
    const best = new Map();
    for (const ap of aps) {
      if (!ap.ssid) continue;
      const prev = best.get(ap.ssid);
      if (!prev || ap.active || (!prev.active && ap.strengthPercent > prev.strengthPercent)) best.set(ap.ssid, ap);
    }
    return Array.from(best.values()).sort((a, b) => (b.active - a.active) || (b.strengthPercent - a.strengthPercent));
  }

  scanWifi() {
    const sys = api('sys');
    if (!sys || !sys.network) return Promise.resolve([]);
    return Promise.resolve(attempt('sys.network.scanWifi', () => sys.network.scanWifi(), [])).catch(() => []);
  }

  connectWifi(ssid, secret) {
    const sys = api('sys');
    return Promise.resolve(sys.network.connectWifi(ssid, secret || ''));
  }

  disconnectWifi() {
    const sys = api('sys');
    attempt('sys.network.disconnectWifi', () => sys.network.disconnectWifi());
    this.changed('network');
  }

  // -- Bluetooth ----------------------------------------------------------

  bluetooth() {
    const sys = api('sys');
    const st = sys && sys.bluetooth ? attempt('sys.bluetooth.getState', () => sys.bluetooth.getState()) : null;
    const adapter = st && (st.defaultAdapter || (st.adapters || [])[0]);
    if (!adapter) return { available: false, powered: false, devices: [], connected: [] };
    const devices = (st.devices || []).filter((d) => d.paired || d.connected);
    return {
      available: true,
      adapterId: adapter.id,
      powered: !!adapter.powered,
      devices,
      connected: devices.filter((d) => d.connected),
    };
  }

  setBluetoothPowered(on) {
    const bt = this.bluetooth();
    attempt('sys.bluetooth.setPowered', () => api('sys').bluetooth.setPowered(on, bt.adapterId));
    this.changed('bluetooth');
  }

  toggleBluetoothDevice(dev) {
    const b = api('sys').bluetooth;
    attempt('sys.bluetooth.connect', () => (dev.connected ? b.disconnect(dev.mac) : b.connect(dev.mac)));
    this.changed('bluetooth');
  }

  // -- Power --------------------------------------------------------------

  power() {
    const sys = api('sys');
    const st = sys && sys.power ? attempt('sys.power.getState', () => sys.power.getState()) : null;
    const caps = sys && sys.power ? attempt('sys.power.getCapabilities', () => sys.power.getCapabilities(), {}) : {};
    const hasBattery = !!(st && st.hasSystemBattery && st.percent != null);
    return {
      hasBattery,
      percent: hasBattery ? Math.round(st.percent) : null,
      charging: !!st && st.source === 'ac',
      timeToEmptyS: st ? st.timeToEmptyS : null,
      timeToFullS: st ? st.timeToFullS : null,
      can: (action) => {
        if (!caps || caps[action] === undefined) return true;
        return caps[action] === 'yes' || caps[action] === 'needs-auth' || caps[action] === 'challenge';
      },
    };
  }

  request(action) {
    const sys = api('sys');
    if (!sys || !sys.power) return false;
    return attempt(`sys.power.request ${action}`, () => {
      sys.power.request(action);
      return true;
    }, false);
  }

  // -- Display ------------------------------------------------------------

  brightness() {
    const d = api('displays');
    if (!d) return { available: false, percent: 0 };
    const devs = attempt('displays.getBacklightDevices', () => d.getBacklightDevices(), []) || [];
    if (devs.length === 0) return { available: false, percent: 0 };
    const pct = attempt('displays.getBrightness', () => d.getBrightness(), -1);
    return { available: pct >= 0, percent: pct };
  }

  setBrightness(v01) {
    const d = api('displays');
    // setBrightness reads values above 1 as percent and 1 or below as a
    // fraction, so pass percent with a floor of 1.01 to keep 1% meaning 1%.
    const pct = Math.max(1.01, v01 * 100);
    attempt('displays.setBrightness', () => d.setBrightness(pct));
    this.changed('display');
  }

  nightLight() {
    const d = api('displays');
    const nl = d ? attempt('displays.getNightLight', () => d.getNightLight()) : null;
    return { supported: !!(nl && nl.supported), enabled: !!(nl && nl.enabled) };
  }

  setNightLight(on) {
    const d = api('displays');
    attempt('displays.setNightLight', () => d.setNightLight({ enabled: on, temperature: 4000 }));
    this.changed('display');
  }
}

export const system = new SystemState();

export function volumeIcon(a) {
  if (!a.available || a.muted || a.volume <= 0.001) return 'volume-x';
  if (a.volume < 0.34) return 'volume-0';
  if (a.volume < 0.67) return 'volume-1';
  return 'volume-2';
}

export function networkIcon(n) {
  if (!n.available || !n.connected) return n.hasWifi ? 'wifi-off' : 'globe';
  if (n.kind === 'wifi') return 'wifi';
  return 'ethernet';
}
