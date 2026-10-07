/**
 * Helm Desktop Environment Shell Controller
 * Orchestrates panel, launcher, notification center, and session lock.
 */

import { PanelController } from './panel.js';
import { LauncherController } from './launcher.js';
import { NotificationController } from './notify.js';
import { LockController } from './lock.js';
import { SettingsController } from './settings/settings_controller.js';

export class Shell {
  constructor() {
    this.panel = new PanelController();
    this.launcher = new LauncherController();
    this.notify = new NotificationController();
    this.lock = new LockController();
    this.settings = new SettingsController();
    this.activeModals = {};
    this.booted = false;
  }

  setModalActive(source, active) {
    if (active) {
      this.activeModals[source] = true;
    } else {
      delete this.activeModals[source];
    }
    const isAnyActive = Object.keys(this.activeModals).length > 0;
    if (typeof bro !== 'undefined' && typeof bro.setModalActive === 'function') {
      bro.setModalActive(isAnyActive);
    }
  }

  init() {
    console.log('Helm: booting desktop environment...');

    this.panel.init();
    this.launcher.init();
    this.notify.init();
    this.lock.init();
    this.settings.init();

    this.registerGlobalHotkeys();
    this.registerNativeHotkeys();

    this.booted = true;

    // Attach to global window object for test automation and extensibility
    window.helm = this;
    window.helm.settings = this.settings;
    window.helm.media = this.panel.media;
    window.helm.taskbar = this.panel.taskbar;
    window.helm.clipboard = this.launcher.clipboard;
    window.helm.ime = (typeof bro !== 'undefined' && bro.ime) ? bro.ime : null;
    window.helm.decor = (typeof bro !== 'undefined' && bro.decor) ? bro.decor : null;

    // Dispatch ready event
    window.dispatchEvent(new CustomEvent('helm:ready', { detail: { shell: this } }));

    console.log('Helm: desktop environment ready.');
  }

  registerNativeHotkeys() {
    this.nativeHotkeyIds = [];
    if (typeof bro === 'undefined' || !bro.window?.registerGlobalHotkey) return;

    try {
      const chords = [
        { accel: 'CommandOrControl+Space', action: () => this.launcher.toggle() },
        { accel: 'Alt+Space', action: () => this.launcher.toggle() },
        { accel: 'CommandOrControl+Shift+N', action: () => this.notify.toggleDrawer() },
        { accel: 'CommandOrControl+Alt+L', action: () => this.lock.lock() },
        { accel: 'CommandOrControl+Alt+V', action: () => this.launcher.openClipboard() },
        { accel: 'CommandOrControl+,', action: () => this.settings.toggle() },
      ];

      for (const { accel, action } of chords) {
        const id = bro.window.registerGlobalHotkey(accel, () => {
          if (this.lock.isLocked) return;
          action();
        });
        if (id) this.nativeHotkeyIds.push(id);
      }
    } catch (err) {
      console.warn('Failed to register native global hotkeys:', err);
    }
  }

  registerGlobalHotkeys() {
    window.addEventListener('keydown', (e) => {
      // Don't intercept hotkeys if lock screen is active, except unlock attempts
      if (this.lock.isLocked) return;

      // 1. Super / Meta or Ctrl+Space or Alt+Space -> Toggle Launcher
      const isLauncherChord =
        (e.key === ' ' && (e.ctrlKey || e.altKey)) ||
        (e.key === 'Meta' && !e.ctrlKey && !e.altKey && !e.shiftKey);

      if (isLauncherChord) {
        e.preventDefault();
        this.launcher.toggle();
        return;
      }

      // 2. Super+V or Ctrl+Alt+V -> Open Clipboard History
      const isClipChord =
        (e.key.toLowerCase() === 'v' && ((e.ctrlKey && e.altKey) || e.metaKey));

      if (isClipChord) {
        e.preventDefault();
        this.launcher.openClipboard();
        return;
      }

      // 3. Ctrl+Alt+L or Meta+L -> Lock Session
      const isLockChord =
        (e.key.toLowerCase() === 'l' && ((e.ctrlKey && e.altKey) || e.metaKey));

      if (isLockChord) {
        e.preventDefault();
        this.lock.lock();
        return;
      }

      // 4. Ctrl+Shift+N -> Toggle Notifications Drawer
      const isNotifyChord =
        (e.key.toLowerCase() === 'n' && e.ctrlKey && e.shiftKey);

      if (isNotifyChord) {
        e.preventDefault();
        this.notify.toggleDrawer();
        return;
      }

      // 5. Super+, or Ctrl+, -> Toggle Settings
      const isSettingsChord =
        (e.key === ',' && (e.ctrlKey || e.metaKey));

      if (isSettingsChord) {
        e.preventDefault();
        this.settings.toggle();
        return;
      }

      // 6. Escape -> Close any active popup / launcher / drawer / settings
      if (e.key === 'Escape') {
        let handled = false;
        if (this.settings.isOpen) {
          this.settings.close();
          handled = true;
        }
        if (this.launcher.isOpen) {
          this.launcher.close();
          handled = true;
        }
        if (this.panel.currentPopup) {
          this.panel.closePopups();
          handled = true;
        }
        if (this.notify.isDrawerOpen) {
          this.notify.closeDrawer();
          handled = true;
        }
        if (handled) e.preventDefault();
      }
    });
  }

  destroy() {
    if (this.nativeHotkeyIds && typeof bro !== 'undefined' && bro.window?.unregisterGlobalHotkey) {
      for (const id of this.nativeHotkeyIds) {
        try {
          bro.window.unregisterGlobalHotkey(id);
        } catch (_) {}
      }
      this.nativeHotkeyIds = [];
    }
    this.panel.destroy();
    this.lock.destroy();
    this.settings.destroy();
    this.booted = false;
  }
}

// Bootstrap on document load
const shell = new Shell();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => shell.init());
} else {
  shell.init();
}

export default shell;
