/**
 * Helm desktop shell: builds every surface, owns the global hotkeys, and
 * exposes itself as window.helm for tests and scripting.
 */

import { $, api, attempt, popovers } from './util.js';
import { hydrateIcons } from './icons.js';
import { settings } from './settings.js';
import { system, volumeIcon } from './system.js';
import { windows } from './windows.js';
import { appdb } from './appdb.js';
import { Wallpaper, WALLPAPERS } from './wallpaper.js';
import { MediaController } from './media.js';
import { Menus } from './menus.js';
import { Bar } from './bar.js';
import { QuickSettings } from './quicksettings.js';
import { NotificationCenter } from './notify.js';
import { CalendarPopover } from './calendar.js';
import { Osd } from './osd.js';
import { LauncherController } from './launcher.js';
import { LockController } from './lock.js';
import { Dock } from './dock.js';
import { Switcher } from './switcher.js';
import { SettingsController } from './settings/settings_controller.js';

export class Shell {
  constructor() {
    this.booted = false;
    this.prefs = settings;
    this.system = system;
    this.windows = windows;
    this.apps = appdb;
    this.username = detectUser();
    this.hostname = detectHost();
    this.wallpaper = new Wallpaper($('#wallpaper'));
    this.media = new MediaController();
    this.menus = new Menus();
    this.notify = new NotificationCenter();
    this.bar = new Bar(this);
    this.quick = new QuickSettings(this);
    this.calendar = new CalendarPopover(this);
    this.osd = new Osd();
    this.launcher = new LauncherController(this);
    this.lock = new LockController(this);
    this.dock = new Dock(this);
    this.switcher = new Switcher(this);
    // The Settings app; shell preferences live on this.prefs.
    this.settings = new SettingsController();
    this.overlays = new Set();
  }

  init() {
    hydrateIcons();
    settings.init();
    this.applyAccent();
    settings.watch('accentHue', () => this.applyAccent());

    const steps = [
      ['system', () => system.init()],
      ['windows', () => windows.init()],
      ['apps', () => appdb.init()],
      ['wallpaper', () => this.wallpaper.init()],
      ['media', () => this.media.init()],
      ['notify', () => this.notify.init()],
      ['bar', () => this.bar.init()],
      ['quick settings', () => this.quick.init()],
      ['calendar', () => this.calendar.init()],
      ['osd', () => this.osd.init()],
      ['launcher', () => this.launcher.init()],
      ['lock', () => this.lock.init()],
      ['dock', () => this.dock.init()],
      ['switcher', () => this.switcher.init()],
      ['settings', () => this.settings.init()],
    ];
    // One surface failing to start must not take the rest of the desktop with it.
    for (const [name, fn] of steps) attempt(`init ${name}`, fn);

    // window.helm first: views and controllers reach the shell through it.
    window.helm = this;
    this.registerHotkeys();
    this.registerNativeHotkeys();
    // Toasts give way while a popover or the launcher is up.
    window.addEventListener('helm:overlay', () => {
      $('#toast-stack').classList.toggle('suppressed', !!popovers.current || this.launcher.isOpen);
      this.setModalActive('popover', !!popovers.current);
      this.setModalActive('launcher', this.launcher.isOpen);
    });
    this.booted = true;
    window.dispatchEvent(new CustomEvent('helm:ready', { detail: { shell: this } }));
  }

  /**
   * Track shell overlays that own input. Hosts that need to know (the Windows
   * shell broker) get bro.setModalActive(anyOpen).
   */
  setModalActive(source, active) {
    if (active) this.overlays.add(source);
    else this.overlays.delete(source);
    if (typeof bro !== 'undefined' && bro && typeof bro.setModalActive === 'function') {
      attempt('bro.setModalActive', () => bro.setModalActive(this.overlays.size > 0));
    }
  }

  openSettings(category) {
    this.closeTransient();
    this.settings.open(category);
  }

  applyAccent() {
    document.documentElement.style.setProperty('--accent-h', String(settings.get('accentHue')));
  }

  /** Close popovers, menus and the launcher (before locking, launching...). */
  closeTransient() {
    popovers.close();
    this.menus.close();
    if (this.launcher.isOpen) this.launcher.close();
    if (this.switcher && this.switcher.isOpen) this.switcher.close();
  }

  /**
   * Chords registered with the host, where it supports global hotkeys
   * (bro.window.registerGlobalHotkey), so they work while a client window
   * has the keyboard. The keydown handler below covers the shell's own focus.
   */
  registerNativeHotkeys() {
    const win = api('window');
    if (!win || typeof win.registerGlobalHotkey !== 'function') return;
    const chords = [
      ['CommandOrControl+Space', () => this.launcher.toggle()],
      ['Alt+Space', () => this.launcher.toggle()],
      ['CommandOrControl+Shift+N', () => this.calendar.toggle($('#bar-clock'))],
      ['CommandOrControl+Alt+L', () => this.lock.lock()],
      ['CommandOrControl+Alt+V', () => this.launcher.openClipboard()],
      ['CommandOrControl+,', () => this.settings.toggle()],
    ];
    this.nativeHotkeys = [];
    for (const [accel, fn] of chords) {
      const id = attempt(`registerGlobalHotkey ${accel}`, () => win.registerGlobalHotkey(accel, () => {
        if (!this.lock.isLocked) fn();
      }));
      if (id) this.nativeHotkeys.push(id);
    }
  }

  cycleWallpaper() {
    const names = Object.keys(WALLPAPERS);
    const i = names.indexOf(settings.get('wallpaper'));
    settings.set('wallpaper', names[(i + 1) % names.length]);
  }

  appMenu(app, x, y) {
    const pinned = (settings.get('pinnedApps') || []).includes(app.id);
    this.menus.show([
      { heading: app.name },
      { label: 'Open', icon: 'arrow-right', action: () => { this.launcher.close(); this.launcher.launch(app); } },
      pinned
        ? { label: 'Unpin from Dock', icon: 'pin', action: () => this.dock.setPinned(app.id, false) }
        : { label: 'Pin to Dock', icon: 'pin', action: () => this.dock.setPinned(app.id, true) },
    ], x, y);
  }

  stepVolume(delta) {
    const a = system.audio();
    if (!a.available) return;
    const v = Math.max(0, Math.min(1, a.volume + delta));
    system.setVolume(v);
    this.osd.show(volumeIcon({ ...a, volume: v, muted: false }), v);
  }

  toggleMute() {
    const a = system.audio();
    if (!a.available) return;
    system.setMuted(!a.muted);
    this.osd.show(a.muted ? volumeIcon({ ...a, muted: false }) : 'volume-x', a.muted ? a.volume : 0);
  }

  stepBrightness(delta) {
    const b = system.brightness();
    if (!b.available) return;
    const v = Math.max(0.01, Math.min(1, b.percent / 100 + delta));
    system.setBrightness(v);
    this.osd.show('sun', v);
  }

  registerHotkeys() {
    window.addEventListener('keydown', (e) => {
      if (this.lock.isLocked) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const sup = e.metaKey;
      const run = (fn) => {
        e.preventDefault();
        fn();
      };

      // Media and hardware keys
      if (k === 'AudioVolumeUp') return run(() => this.stepVolume(0.05));
      if (k === 'AudioVolumeDown') return run(() => this.stepVolume(-0.05));
      if (k === 'AudioVolumeMute') return run(() => this.toggleMute());
      if (k === 'MediaPlayPause') return run(() => this.media.playPause());
      if (k === 'MediaTrackNext') return run(() => this.media.next());
      if (k === 'MediaTrackPrevious') return run(() => this.media.previous());
      if (k === 'BrightnessUp' || k === 'MonBrightnessUp') return run(() => this.stepBrightness(0.05));
      if (k === 'BrightnessDown' || k === 'MonBrightnessDown') return run(() => this.stepBrightness(-0.05));

      // Super alone, Ctrl/Alt+Space: launcher
      if ((k === 'Meta' && !e.ctrlKey && !e.altKey && !e.shiftKey) || (k === ' ' && (e.ctrlKey || e.altKey))) {
        return run(() => this.launcher.toggle());
      }
      // Super+V, Ctrl+Alt+V: clipboard history
      if (k === 'v' && (sup || (e.ctrlKey && e.altKey))) return run(() => this.launcher.openClipboard());
      // Super+L, Ctrl+Alt+L: lock
      if (k === 'l' && (sup || (e.ctrlKey && e.altKey))) return run(() => this.lock.lock());
      // Super+N, Ctrl+Shift+N: notification center
      if (k === 'n' && (sup || (e.ctrlKey && e.shiftKey))) return run(() => this.calendar.toggle($('#bar-clock')));
      // Super+S: quick settings
      if (k === 's' && sup) return run(() => this.quick.toggle($('#bar-status')));
      // Super+1..9: workspaces
      if (sup && /^[1-9]$/.test(k)) return run(() => windows.switchToIndex(Number(k) - 1));
      // Super+, / Ctrl+,: settings
      if (k === ',' && (sup || e.ctrlKey)) return run(() => (this.settings.isOpen ? this.settings.close() : this.openSettings()));
      // Super+Q: close the focused window
      if (k === 'q' && sup) {
        return run(() => {
          const w = windows.focused();
          if (w) windows.close(w.id);
        });
      }

      if (k === 'Escape') {
        if (this.menus.isOpen) return run(() => this.menus.close());
        if (this.settings.isOpen) return run(() => this.settings.close());
        if (this.launcher.isOpen) return run(() => this.launcher.close());
        if (popovers.current) return run(() => popovers.close());
      }
    });
  }

  destroy() {
    this.bar.destroy();
    this.lock.destroy();
    this.booted = false;
  }
}

function detectUser() {
  const seat = api('seat');
  const fromSeat = seat ? attempt('seat.getSessionState', () => seat.getSessionState().user) : null;
  if (fromSeat) return fromSeat;
  if (typeof process !== 'undefined' && process.env) return process.env.USER || process.env.USERNAME || 'User';
  return 'User';
}

function detectHost() {
  return attempt('hostname', () => {
    if (typeof require === 'function') return require('os').hostname();
    if (typeof process !== 'undefined' && process.env) return process.env.HOSTNAME || '';
    return '';
  }, '');
}

const shell = new Shell();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => shell.init());
} else {
  shell.init();
}

export default shell;
