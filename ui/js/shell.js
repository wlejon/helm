/**
 * Helm desktop shell: builds every surface, owns the global hotkeys, and
 * exposes itself as window.helm for tests and scripting.
 */

import { h, $, api, attempt } from './util.js';
import { icon } from './icons.js';
import { panels, animate, SPRING, EASE_STD } from './morph.js';
import { Activities } from './activities.js';
import { hydrateIcons } from './icons.js';
import { settings } from './settings.js';
import { system, volumeIcon } from './system.js';
import { windows } from './windows.js';
import { appdb } from './appdb.js';
import { Wallpaper, WALLPAPERS } from './wallpaper.js';
import { MediaController } from './media.js';
import { Menus } from './menus.js';
import { Islands } from './islands.js';
import { Spaces } from './spaces.js';
import { QuickSettings } from './quicksettings.js';
import { NotificationCenter } from './notify.js';
import { CalendarPopover } from './calendar.js';
import { Osd } from './osd.js';
import { LauncherController } from './launcher.js';
import { LockController } from './lock.js';
import { Dock } from './dock.js';
import { Switcher } from './switcher.js';

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
    this.activities = new Activities();
    this.islands = new Islands(this);
    this.spaces = new Spaces(this);
    this.quick = new QuickSettings(this);
    this.calendar = new CalendarPopover(this);
    this.osd = new Osd();
    this.launcher = new LauncherController(this);
    this.lock = new LockController(this);
    this.dock = new Dock(this);
    this.switcher = new Switcher(this);
    // A Settings app plugs in through registerSettingsApp(); shell
    // preferences live on this.prefs.
    this.settingsApp = null;
    this.panels = panels;
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
      ['islands', () => this.islands.init()],
      ['spaces', () => this.spaces.init()],
      ['quick settings', () => this.quick.init()],
      ['calendar', () => this.calendar.init()],
      ['osd', () => this.osd.init()],
      ['launcher', () => this.launcher.init()],
      ['lock', () => this.lock.init()],
      ['dock', () => this.dock.init()],
      ['switcher', () => this.switcher.init()],
      ['activities', () => this.watchMedia()],
      ['edges', () => this.reserveEdges()],
    ];
    // One surface failing to start must not take the rest of the desktop with it.
    for (const [name, fn] of steps) attempt(`init ${name}`, fn);

    // window.helm first: views and controllers reach the shell through it.
    window.helm = this;
    this.registerHotkeys();
    this.registerNativeHotkeys();
    // Toasts give way while the clock panel (which lists them) or the
    // launcher is up.
    window.addEventListener('helm:overlay', () => {
      $('#toast-stack').classList.toggle('suppressed', this.calendar.isOpen || this.launcher.isOpen);
      this.setModalActive('panel', panels.isOpen());
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

  // -- Settings hook ------------------------------------------------------------

  /**
   * The Settings app plugs in here: app is { open(page), close(), isOpen }.
   * Every entry point (the quick settings gear, the launcher actions,
   * Super+,) goes through openSettings / toggleSettings.
   */
  registerSettingsApp(app) {
    this.settingsApp = app || null;
  }

  openSettings(page) {
    this.closeTransient();
    if (this.settingsApp) {
      attempt('settings open', () => this.settingsApp.open(page));
      return;
    }
    this.hint('Settings is being rebuilt', 'coming soon', 'settings');
  }

  toggleSettings(page) {
    const app = this.settingsApp;
    if (app && app.isOpen) attempt('settings close', () => app.close());
    else this.openSettings(page);
  }

  /** A transient pill under the clock island. */
  hint(text, sub = '', glyph = 'info') {
    const el = $('#hint');
    el.replaceChildren(...[h('span.hint-glyph', icon(glyph)), h('span', text), sub ? h('span.hint-sub', sub) : null].filter(Boolean));
    el.classList.remove('hidden');
    animate(el, [{ opacity: 0, transform: 'translateX(-50%) translateY(-14px) scale(0.9)' },
      { opacity: 1, transform: 'translateX(-50%)' }], { duration: 420, easing: SPRING });
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => {
      animate(el, [{ opacity: 1, transform: 'translateX(-50%)' },
        { opacity: 0, transform: 'translateX(-50%) translateY(-10px) scale(0.94)' }],
      { duration: 220, easing: EASE_STD, fill: 'forwards' });
      this.hintTimer = setTimeout(() => el.classList.add('hidden'), 220);
    }, 2400);
  }

  // -- Appearance -----------------------------------------------------------------

  applyAccent() {
    const hue = Number(settings.get('accentHue')) || 0;
    const root = document.documentElement.style;
    root.setProperty('--accent-h', String(hue));
    // The gradient's second stop sits 48 degrees round the wheel.
    root.setProperty('--accent-h2', String((hue + 48) % 360));
  }

  cycleAccent() {
    const hues = [255, 285, 320, 20, 65, 150, 190];
    const cur = Number(settings.get('accentHue'));
    const i = hues.findIndex((x) => x === cur);
    settings.set('accentHue', hues[(i + 1) % hues.length]);
  }

  wallpaperLabel() {
    const p = WALLPAPERS[settings.get('wallpaper')];
    return p ? p.label : 'Custom image';
  }

  /** Feed MPRIS into the live activity the clock island shows. */
  watchMedia() {
    const sync = () => {
      const m = this.media;
      if (!m.active) {
        this.activities.end('media');
        return;
      }
      this.activities.start({
        id: 'media', kind: 'media', title: m.artist && m.artist !== m.title ? `${m.title} · ${m.artist}` : m.title,
        art: m.artPath, paused: !m.playing,
      });
    };
    this.media.onChange(sync);
    sync();
  }

  /**
   * The one place screen edges are reserved, so maximised windows stop
   * short of the islands and the dock. The compositor reserves nothing yet;
   * when it grows bro.compositor.reserveEdge(edge, px) this starts working.
   */
  reserveEdges() {
    const c = api('compositor');
    if (!c || typeof c.reserveEdge !== 'function') return;
    const top = $('#top-panel').getBoundingClientRect().height;
    attempt('compositor.reserveEdge top', () => c.reserveEdge('top', Math.round(top)));
    const autohide = settings.get('dockAutohide');
    const dock = autohide ? 0 : Math.round(window.innerHeight - $('#dock .dock-inner').getBoundingClientRect().top);
    attempt('compositor.reserveEdge bottom', () => c.reserveEdge('bottom', dock));
    if (!this.edgeWatch) {
      this.edgeWatch = settings.watch('dockAutohide', () => this.reserveEdges());
    }
  }

  /** Close panels, menus and the launcher (before locking, launching...). */
  closeTransient() {
    panels.close({ instant: true });
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
      ['CommandOrControl+Space', () => this.launcher.toggle(this.launcherOrigin())],
      ['Alt+Space', () => this.launcher.toggle(this.launcherOrigin())],
      ['CommandOrControl+Shift+N', () => this.calendar.toggle()],
      ['CommandOrControl+Alt+L', () => this.lock.lock()],
      ['CommandOrControl+Alt+V', () => this.launcher.openClipboard(this.launcherOrigin())],
      ['CommandOrControl+,', () => this.toggleSettings()],
      ['Super+,', () => this.toggleSettings()],
      ['Super+W', () => this.spaces.toggle()],
      ['Super+S', () => this.quick.toggle()],
      ['Super+N', () => this.calendar.toggle()],
    ];
    this.nativeHotkeys = [];
    for (const [accel, fn] of chords) {
      const id = attempt(`registerGlobalHotkey ${accel}`, () => win.registerGlobalHotkey(accel, () => {
        if (!this.lock.isLocked) fn();
      }));
      if (id) this.nativeHotkeys.push(id);
    }
  }

  launcherOrigin() {
    return $('#isl-launcher');
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
        return run(() => this.launcher.toggle(this.launcherOrigin()));
      }
      // Super+V, Ctrl+Alt+V: clipboard history
      if (k === 'v' && (sup || (e.ctrlKey && e.altKey))) return run(() => this.launcher.openClipboard(this.launcherOrigin()));
      // Super+L, Ctrl+Alt+L: lock
      if (k === 'l' && (sup || (e.ctrlKey && e.altKey))) return run(() => this.lock.lock());
      // Super+N, Ctrl+Shift+N: notification center
      if (k === 'n' && (sup || (e.ctrlKey && e.shiftKey))) return run(() => this.calendar.toggle());
      // Super+S: quick settings
      if (k === 's' && sup) return run(() => this.quick.toggle());
      // Super+W: spaces
      if (k === 'w' && sup) return run(() => this.spaces.toggle());
      // Super+1..9: workspaces
      if (sup && /^[1-9]$/.test(k)) return run(() => windows.switchToIndex(Number(k) - 1));
      // Super+, / Ctrl+,: settings
      if (k === ',' && (sup || e.ctrlKey)) return run(() => this.toggleSettings());
      // Super+Q: close the focused window
      if (k === 'q' && sup) {
        return run(() => {
          const w = windows.focused();
          if (w) windows.close(w.id);
        });
      }

      if (k === 'Escape') {
        if (this.menus.isOpen) return run(() => this.menus.close());
        if (this.settingsApp && this.settingsApp.isOpen) return run(() => this.settingsApp.close());
        if (this.launcher.isOpen) return run(() => this.launcher.close());
        if (panels.isOpen()) return run(() => panels.close());
      }
    });
  }

  destroy() {
    this.islands.destroy();
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
