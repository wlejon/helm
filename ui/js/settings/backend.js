/**
 * Everything the Settings pages read from and write to the machine, in one
 * object. Pages never touch bro.* directly, so:
 *   - a page asks here whether its API exists, and hides when it does not;
 *   - every call that changes the machine is a method named in WRITES, which
 *     tests and screenshot scripts replace wholesale (stubWrites) so a run
 *     never changes the real volume, network, Bluetooth or power state.
 */

import { api, attempt } from '../util.js';
import { system } from '../system.js';
import { settings } from '../settings.js';

/** The methods below that change machine or session state. */
export const WRITES = [
  'setPref', 'setDefaultDevice', 'setDeviceVolume', 'setDeviceMuted', 'setStreamVolume', 'setStreamMuted',
  'scanWifi', 'connectWifi', 'disconnectWifi',
  'setBluetoothPowered', 'startDiscovery', 'stopDiscovery', 'pairDevice', 'connectDevice', 'disconnectDevice',
  'forgetDevice', 'setNightLight', 'setBrightness', 'powerAction', 'lock', 'setIdleTimeout',
  'setDnd', 'setAppQuiet', 'clearNotifications', 'setDefaultApp',
];

const fs = () => attempt('require fs', () => (typeof require === 'function' ? require('fs') : null));

function readText(path) {
  const f = fs();
  if (!f) return null;
  return attempt(`read ${path}`, () => String(f.readFileSync(path, 'utf8')), null);
}

export class Backend {
  constructor(shell) {
    this.shell = shell;
  }

  // -- Availability --------------------------------------------------------------

  /** True when the namespace is installed and available. */
  has(name) {
    return !!api(name);
  }

  sys(part) {
    const s = api('sys');
    return s && s[part] ? s[part] : null;
  }

  // -- Preferences (bro.conf, helm.shell) ---------------------------------------

  pref(key) {
    return settings.get(key);
  }

  setPref(key, value) {
    settings.set(key, value);
  }

  // -- Sound -----------------------------------------------------------------------

  hasSound() {
    return !!this.sys('audio') || this.has('pulse');
  }

  devices(direction) {
    return system.devices(direction);
  }

  streams() {
    return system.streams();
  }

  setDefaultDevice(id, direction) {
    system.setDefaultDevice(id, direction);
  }

  setDeviceVolume(id, v) {
    system.setDeviceVolume(id, v);
  }

  setDeviceMuted(id, m) {
    system.setDeviceMuted(id, m);
  }

  setStreamVolume(id, v) {
    system.setStreamVolume(id, v);
  }

  setStreamMuted(id, m) {
    system.setStreamMuted(id, m);
  }

  // -- Network -----------------------------------------------------------------------

  hasNetwork() {
    return !!this.sys('network');
  }

  /** NetworkManager's state: { connectivity, wifiEnabled, devices[], ... } or null. */
  networkState() {
    const n = this.sys('network');
    return n ? attempt('sys.network.getState', () => n.getState()) : null;
  }

  accessPoints() {
    return system.accessPoints();
  }

  /** Resolves when NetworkManager reports the scan done, or after 8s. */
  scanWifi() {
    return Promise.race([system.scanWifi(), new Promise((r) => setTimeout(r, 8000))]);
  }

  connectWifi(ssid, secret) {
    return system.connectWifi(ssid, secret);
  }

  disconnectWifi() {
    system.disconnectWifi();
  }

  // -- Bluetooth ---------------------------------------------------------------------

  hasBluetooth() {
    const b = this.sys('bluetooth');
    if (!b) return false;
    const st = attempt('sys.bluetooth.getState', () => b.getState());
    return !!(st && (st.defaultAdapter || (st.adapters || []).length));
  }

  /** { adapter, devices } with every device BlueZ knows, paired or found. */
  bluetooth() {
    const b = this.sys('bluetooth');
    const st = b ? attempt('sys.bluetooth.getState', () => b.getState()) : null;
    const adapter = st && (st.defaultAdapter || (st.adapters || [])[0]);
    if (!adapter) return { adapter: null, devices: [] };
    return { adapter, devices: (st.devices || []).filter((d) => !d.adapterId || d.adapterId === adapter.id) };
  }

  setBluetoothPowered(on) {
    const { adapter } = this.bluetooth();
    attempt('sys.bluetooth.setPowered', () => this.sys('bluetooth').setPowered(on, adapter ? adapter.id : ''));
    system.changed('bluetooth');
  }

  startDiscovery() {
    const { adapter } = this.bluetooth();
    attempt('sys.bluetooth.startDiscovery', () => this.sys('bluetooth').startDiscovery(adapter ? adapter.id : ''));
    system.changed('bluetooth');
  }

  stopDiscovery() {
    const { adapter } = this.bluetooth();
    attempt('sys.bluetooth.stopDiscovery', () => this.sys('bluetooth').stopDiscovery(adapter ? adapter.id : ''));
    system.changed('bluetooth');
  }

  /** Pair, then connect. Throws with BlueZ's message when pairing fails. */
  pairDevice(mac) {
    const b = this.sys('bluetooth');
    b.pair(mac);
    attempt('sys.bluetooth.connect', () => b.connect(mac));
    system.changed('bluetooth');
  }

  connectDevice(mac) {
    this.sys('bluetooth').connect(mac);
    system.changed('bluetooth');
  }

  disconnectDevice(mac) {
    this.sys('bluetooth').disconnect(mac);
    system.changed('bluetooth');
  }

  forgetDevice(mac) {
    this.sys('bluetooth').removeDevice(mac);
    system.changed('bluetooth');
  }

  // -- Displays ----------------------------------------------------------------------

  displays() {
    const d = api('displays');
    const snap = d ? attempt('displays.getSnapshot', () => d.getSnapshot()) : null;
    return snap && Array.isArray(snap.displays) ? snap.displays.filter((x) => x.isConnected !== false) : [];
  }

  nightLight() {
    const d = api('displays');
    return (d && attempt('displays.getNightLight', () => d.getNightLight())) || { supported: false };
  }

  setNightLight(cfg) {
    attempt('displays.setNightLight', () => api('displays').setNightLight(cfg));
    system.changed('display');
  }

  brightness() {
    return system.brightness();
  }

  setBrightness(v) {
    system.setBrightness(v);
  }

  // -- Power and session ----------------------------------------------------------

  hasPower() {
    return !!this.sys('power');
  }

  power() {
    return system.power();
  }

  /** Raw logind answers: 'yes' | 'no' | 'na' | 'needs-auth' | 'challenge' per action. */
  powerCaps() {
    const p = this.sys('power');
    return (p && attempt('sys.power.getCapabilities', () => p.getCapabilities())) || {};
  }

  powerAction(action) {
    return system.request(action);
  }

  lock() {
    this.shell.lock.lock();
  }

  /** What is holding sleep or idle off right now (logind inhibitors). */
  inhibitors() {
    const seat = api('seat');
    if (!seat || typeof seat.listInhibitors !== 'function') return null;
    return attempt('seat.listInhibitors', () => seat.listInhibitors(), null);
  }

  /**
   * The idle timeout before the session locks, in ms, or null when bro.seat
   * has no idle API (it is being added: the control stays hidden until
   * seat.getIdleTimeout / seat.setIdleTimeout exist).
   */
  idleTimeout() {
    const seat = api('seat');
    if (!seat || typeof seat.getIdleTimeout !== 'function' || typeof seat.setIdleTimeout !== 'function') return null;
    const ms = attempt('seat.getIdleTimeout', () => seat.getIdleTimeout(), null);
    return typeof ms === 'number' ? ms : null;
  }

  setIdleTimeout(ms) {
    attempt('seat.setIdleTimeout', () => api('seat').setIdleTimeout(ms));
  }

  // -- Notifications -----------------------------------------------------------------

  notifyStatus() {
    const n = this.sys('notifications');
    return n ? attempt('notifications.getCapabilities', () => n.getCapabilities(), null) : null;
  }

  setDnd(on) {
    this.shell.notify.setDnd(on);
  }

  setAppQuiet(name, quiet) {
    this.shell.notify.setQuiet(name, quiet);
  }

  clearNotifications() {
    this.shell.notify.clearAll();
  }

  // -- Default apps ----------------------------------------------------------------

  hasMime() {
    const a = api('apps');
    return !!a && typeof a.getDefaultApp === 'function' && typeof a.setDefaultAppForMime === 'function';
  }

  defaultApp(mime) {
    return attempt(`apps.getDefaultApp ${mime}`, () => api('apps').getDefaultApp(mime), null);
  }

  appsFor(mime) {
    return attempt(`apps.getAppsForMime ${mime}`, () => api('apps').getAppsForMime(mime), []) || [];
  }

  /** Make appId the default for every MIME type in mimes; true when all took. */
  setDefaultApp(mimes, appId) {
    const a = api('apps');
    let ok = true;
    for (const m of mimes) ok = attempt(`apps.setDefaultAppForMime ${m}`, () => a.setDefaultAppForMime(m, appId), false) && ok;
    return ok;
  }

  // -- About -------------------------------------------------------------------------

  readText(path) {
    return readText(path);
  }

  listDir(path) {
    const f = fs();
    if (!f) return [];
    if (!attempt('exists', () => f.existsSync(path), false)) return [];
    return attempt(`readdir ${path}`, () => f.readdirSync(path), []) || [];
  }

  isDir(path) {
    const f = fs();
    return !!f && attempt('exists', () => f.existsSync(path), false)
      && attempt(`stat ${path}`, () => f.statSync(path).isDirectory(), false);
  }

  /** A cached thumbnail path for an image (bro.thumb), or null. */
  thumbnail(path) {
    const t = api('thumb');
    if (!t) return Promise.resolve(null);
    return Promise.resolve(attempt('thumb.get', () => t.get(path, { size: 'large' }), null))
      .then((r) => (r && r.path) || null, () => null);
  }

  hasThumbnails() {
    return this.has('thumb');
  }
}

/**
 * Replace every write with a recorder: calls land in the returned log and
 * nothing reaches the machine. For tests and screenshot scripts.
 */
export function stubWrites(backend, overrides = {}) {
  const log = [];
  for (const name of WRITES) {
    backend[name] = (...args) => {
      log.push([name, ...args]);
      if (overrides[name]) return overrides[name](...args);
      if (name === 'setPref') settings.set(args[0], args[1]);
      return name === 'connectWifi' || name === 'scanWifi' ? Promise.resolve(true) : true;
    };
  }
  return log;
}
