/**
 * Helm Desktop Environment Shell Controller
 * Orchestrates panel, launcher, notification center, and session lock.
 */

import { PanelController } from './panel.js';
import { LauncherController } from './launcher.js';
import { NotificationController } from './notify.js';
import { LockController } from './lock.js';

export class Shell {
  constructor() {
    this.panel = new PanelController();
    this.launcher = new LauncherController();
    this.notify = new NotificationController();
    this.lock = new LockController();
    this.booted = false;
  }

  init() {
    console.log('Helm: booting desktop environment...');

    this.panel.init();
    this.launcher.init();
    this.notify.init();
    this.lock.init();

    this.registerGlobalHotkeys();

    this.booted = true;

    // Attach to global window object for test automation and extensibility
    window.helm = this;
    window.helm.media = this.panel.media;
    window.helm.clipboard = this.launcher.clipboard;
    window.helm.ime = (typeof bro !== 'undefined' && bro.ime) ? bro.ime : null;
    window.helm.decor = (typeof bro !== 'undefined' && bro.decor) ? bro.decor : null;

    // Dispatch ready event
    window.dispatchEvent(new CustomEvent('helm:ready', { detail: { shell: this } }));

    console.log('Helm: desktop environment ready.');
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

      // 4. Escape -> Close any active popup / launcher / drawer
      if (e.key === 'Escape') {
        let handled = false;
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
    this.panel.destroy();
    this.lock.destroy();
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
