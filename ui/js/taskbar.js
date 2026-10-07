/**
 * Helm Desktop Running Applications Taskbar Controller
 * Synchronizes with bro.compositor to display running window tasks,
 * track focus, bring windows to front, and close windows.
 */

export class TaskbarController {
  constructor() {
    this.windows = new Map(); // id -> WindowSnapshot
    this.activeWindowId = null;
    this.container = null;
  }

  init() {
    this.container = document.getElementById('panel-taskbar');
    this.setupCompositorListeners();
    this.setupShellHookListeners();
    this.loadInitialWindows();
  }

  setupShellHookListeners() {
    if (typeof bro === 'undefined' || !bro.shellHook?.on) return;

    try {
      bro.shellHook.on('windowCreated', (payload) => {
        const win = payload?.window || payload;
        if (win && (win.id != null || win.hwnd != null)) {
          this.addWindow({
            id: win.id ?? win.hwnd,
            title: win.title || win.className || 'Application',
            className: win.className,
            processId: win.processId,
            minimized: win.minimized,
            maximized: win.maximized,
            focused: false
          });
        }
      });

      bro.shellHook.on('windowDestroyed', (payload) => {
        const id = payload?.id ?? payload?.hwnd ?? payload?.window?.hwnd;
        if (id != null) {
          this.removeWindow(id);
        }
      });

      bro.shellHook.on('windowActivated', (payload) => {
        const id = payload?.id ?? payload?.hwnd ?? payload?.window?.hwnd;
        if (id != null) {
          this.setFocus(id);
        }
      });

      bro.shellHook.on('windowRedraw', (payload) => {
        const win = payload?.window || payload;
        if (win && (win.id != null || win.hwnd != null)) {
          const id = win.id ?? win.hwnd;
          this.updateWindow({
            id: id,
            title: win.title || win.className || 'Application',
            className: win.className,
            processId: win.processId,
            minimized: win.minimized,
            maximized: win.maximized,
            focused: id === this.activeWindowId
          });
        }
      });

      bro.shellHook.on('getMinRect', (payload) => {
        const win = payload?.window || payload;
        if (win && (win.id != null || win.hwnd != null)) {
          const id = win.id ?? win.hwnd;
          const existing = this.windows.get(id);
          if (existing) {
            existing.minimized = win.minimized;
            this.render();
          }
        }
      });
    } catch (err) {
      console.warn('Failed to attach shellHook listeners:', err);
    }
  }

  setupCompositorListeners() {
    if (typeof bro === 'undefined' || !bro.compositor) return;

    try {
      if (typeof bro.compositor.on === 'function') {
        bro.compositor.on('windowAdded', (payload) => {
          const win = payload?.window || payload;
          if (win && win.id != null) {
            this.addWindow(win);
          }
        });

        bro.compositor.on('windowRemoved', (payload) => {
          const id = payload?.id ?? payload?.windowId ?? payload;
          if (id != null) {
            this.removeWindow(id);
          }
        });

        bro.compositor.on('windowChanged', (payload) => {
          const win = payload?.window || payload;
          if (win && win.id != null) {
            this.updateWindow(win);
          }
        });

        bro.compositor.on('focusChanged', (payload) => {
          const id = payload?.id ?? payload?.windowId ?? payload;
          this.setFocus(id);
        });
      }
    } catch (err) {
      console.warn('Failed to attach compositor listeners:', err);
    }
  }

  loadInitialWindows() {
    if (typeof bro !== 'undefined' && bro.compositor?.getWindows) {
      try {
        const list = bro.compositor.getWindows() || [];
        for (const w of list) {
          if (w && w.id != null) {
            this.windows.set(w.id, w);
            if (w.focused) this.activeWindowId = w.id;
          }
        }
      } catch (err) {
        console.warn('Failed to query compositor initial windows:', err);
      }
    }

    if (this.windows.size === 0 && typeof bro !== 'undefined' && bro.shellHook?.getWindows) {
      try {
        const list = bro.shellHook.getWindows() || [];
        for (const w of list) {
          if (w && (w.id != null || w.hwnd != null)) {
            const id = w.id ?? w.hwnd;
            this.windows.set(id, {
              id: id,
              title: w.title || w.className || 'Application',
              className: w.className,
              processId: w.processId,
              minimized: w.minimized,
              maximized: w.maximized,
              focused: false
            });
          }
        }
      } catch (err) {
        console.warn('Failed to query shellHook initial windows:', err);
      }
    }

    this.render();
  }

  addWindow(win) {
    this.windows.set(win.id, win);
    if (win.focused) this.activeWindowId = win.id;
    this.render();
  }

  removeWindow(id) {
    this.windows.delete(id);
    if (this.activeWindowId === id) this.activeWindowId = null;
    this.render();
  }

  updateWindow(win) {
    this.windows.set(win.id, win);
    if (win.focused) this.activeWindowId = win.id;
    this.render();
  }

  setFocus(id) {
    this.activeWindowId = id;
    for (const [winId, w] of this.windows.entries()) {
      w.focused = (winId === id);
    }
    this.render();
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = '';

    for (const [id, win] of this.windows.entries()) {
      if (win.className === 'Progman' || win.className === 'WorkerW') continue;

      const item = document.createElement('div');
      item.className = 'taskbar-item' + (win.id === this.activeWindowId ? ' active' : '') + (win.minimized ? ' minimized' : '');
      item.setAttribute('data-id', String(id));
      item.title = win.title || win.appId || 'Window';

      const icon = document.createElement('span');
      icon.className = 'taskbar-icon';
      icon.textContent = this.resolveIcon(win);

      const title = document.createElement('span');
      title.className = 'taskbar-title';
      title.textContent = this.formatTitle(win.title || win.appId || 'Window');

      const closeBtn = document.createElement('button');
      closeBtn.className = 'taskbar-close-btn';
      closeBtn.textContent = '×';
      closeBtn.title = 'Close window';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeWindow(id);
      });

      item.appendChild(icon);
      item.appendChild(title);
      item.appendChild(closeBtn);

      item.addEventListener('click', () => {
        this.activateWindow(id);
      });

      this.container.appendChild(item);
    }
  }

  resolveIcon(win) {
    const name = (win.appId || win.title || '').toLowerCase();
    if (name.includes('code') || name.includes('cursor')) return '📝';
    if (name.includes('terminal') || name.includes('pwsh') || name.includes('cmd') || name.includes('broterm')) return '💻';
    if (name.includes('chrome') || name.includes('edge') || name.includes('firefox') || name.includes('browser')) return '🌐';
    if (name.includes('file') || name.includes('explorer')) return '📁';
    if (name.includes('settings')) return '⚙️';
    if (name.includes('music') || name.includes('spotify')) return '🎵';
    return '🪟';
  }

  formatTitle(title) {
    if (title.length > 24) {
      return title.slice(0, 22) + '…';
    }
    return title;
  }

  activateWindow(id) {
    if (typeof bro !== 'undefined' && bro.compositor?.focusWindow) {
      try {
        bro.compositor.focusWindow(id);
        this.setFocus(id);
        return;
      } catch (err) {
        console.warn('Failed to focus window via compositor:', err);
      }
    }
    if (typeof bro !== 'undefined' && bro.shellHook?.focusWindow) {
      try {
        bro.shellHook.focusWindow(id);
        this.setFocus(id);
      } catch (err) {
        console.warn('Failed to focus window via shellHook:', err);
      }
    }
  }

  closeWindow(id) {
    if (typeof bro !== 'undefined' && bro.compositor?.closeWindow) {
      try {
        bro.compositor.closeWindow(id);
        return;
      } catch (err) {
        console.warn('Failed to close window via compositor:', err);
      }
    }
    if (typeof bro !== 'undefined' && bro.shellHook?.closeWindow) {
      try {
        bro.shellHook.closeWindow(id);
      } catch (err) {
        console.warn('Failed to close window via shellHook:', err);
      }
    }
  }
}
