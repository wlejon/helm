import { ClipboardController } from './clipboard.js';

export class LauncherController {
  constructor() {
    this.isOpen = false;
    this.apps = [];
    this.systemCommands = [];
    this.filtered = [];
    this.selectedIndex = 0;
    this.clipboard = new ClipboardController();
  }

  init() {
    this.clipboard.init();
    this.setupSystemCommands();
    this.loadApps();
    this.bindEvents();
  }

  setupSystemCommands() {
    this.systemCommands = [
      {
        id: 'cmd:lock',
        name: 'Lock Screen',
        comment: 'Lock the current desktop session',
        icon: '🔒',
        type: 'cmd',
        action: () => window.helm?.lock?.lock(),
      },
      {
        id: 'cmd:sleep',
        name: 'Sleep / Suspend',
        comment: 'Suspend system to RAM',
        icon: '💤',
        type: 'cmd',
        action: () => window.helm?.panel?.requestPowerAction('suspend'),
      },
      {
        id: 'cmd:restart',
        name: 'Restart System',
        comment: 'Reboot the machine',
        icon: '🔄',
        type: 'cmd',
        action: () => window.helm?.panel?.requestPowerAction('reboot'),
      },
      {
        id: 'cmd:shutdown',
        name: 'Shut Down',
        comment: 'Power off the system',
        icon: '⏻',
        type: 'cmd',
        action: () => window.helm?.panel?.requestPowerAction('powerOff'),
      },
      {
        id: 'cmd:terminal',
        name: 'Terminal',
        comment: 'Open command line terminal',
        icon: '💻',
        type: 'cmd',
        action: () => {
          if (typeof bro !== 'undefined' && bro.apps?.launch) {
            bro.apps.launch('terminal');
          }
        },
      },
      {
        id: 'cmd:notifications',
        name: 'Toggle Notifications',
        comment: 'Open notification history drawer',
        icon: '🔔',
        type: 'cmd',
        action: () => window.helm?.notify?.toggleDrawer(),
      },
      {
        id: 'cmd:clipboard',
        name: 'Clipboard History',
        comment: 'Search and paste recent clipboard items',
        icon: '📋',
        type: 'cmd',
        action: () => this.openClipboard(),
      },
    ];
  }

  loadApps() {
    this.apps = [];

    if (typeof bro !== 'undefined' && bro.apps?.list) {
      try {
        const rawApps = bro.apps.list() || [];
        for (const a of rawApps) {
          if (a.nodisplay) continue;
          this.apps.push({
            id: a.id,
            name: a.name || a.id,
            comment: a.comment || a.genericName || '',
            exec: a.exec || '',
            icon: a.icon || '🚀',
            type: 'app',
          });
        }
      } catch (err) {
        console.warn('Failed to load apps via bro.apps.list():', err);
      }
    }

    // Default sample applications if none discovered from system
    if (this.apps.length === 0) {
      this.apps = [
        { id: 'broterm', name: 'Bro Terminal', comment: 'Hardware-accelerated terminal emulator', icon: '💻', type: 'app' },
        { id: 'files', name: 'File Manager', comment: 'Browse files, folders, and storage', icon: '📁', type: 'app' },
        { id: 'browser', name: 'Web Browser', comment: 'Browse the World Wide Web', icon: '🌐', type: 'app' },
        { id: 'settings', name: 'System Settings', comment: 'Display, network, audio, and device settings', icon: '⚙️', type: 'app' },
        { id: 'editor', name: 'Text Editor', comment: 'Edit code and text documents', icon: '📝', type: 'app' },
        { id: 'media', name: 'Media Player', comment: 'Play audio and video streams', icon: '🎵', type: 'app' },
      ];
    }
  }

  bindEvents() {
    const input = document.getElementById('launcher-input');
    const backdrop = document.getElementById('launcher-backdrop');
    const pillBtn = document.getElementById('btn-launcher-pill');
    const actBtn = document.getElementById('btn-activities');

    if (pillBtn) {
      pillBtn.addEventListener('click', () => this.toggle());
    }

    if (actBtn) {
      actBtn.addEventListener('click', () => this.toggle());
    }

    if (backdrop) {
      backdrop.addEventListener('click', () => this.close());
    }

    if (input) {
      input.addEventListener('input', (e) => this.onInput(e.target.value));
      input.addEventListener('keydown', (e) => this.onKeyDown(e));
    }
  }

  onInput(query) {
    const q = (query || '').trim();

    if (!q) {
      // Show combination of apps and system commands
      this.filtered = [...this.apps, ...this.systemCommands];
      this.selectedIndex = 0;
      this.renderResults();
      return;
    }

    // Clipboard History query mode
    if (q.startsWith('clip:') || q.startsWith('/clip')) {
      const filterText = q.replace(/^(clip:|\/clip)\s*/, '').toLowerCase();
      const entries = this.clipboard.getEntries();
      this.filtered = entries
        .filter((e) => !filterText || (e.previewText && e.previewText.toLowerCase().includes(filterText)))
        .map((e) => ({
          id: e.id,
          name: e.previewText || `Clip #${e.id}`,
          comment: `${e.byteSize || 0} bytes • ${e.isPinned ? '📌 Pinned' : 'Recent'}`,
          icon: '📋',
          type: 'clip',
        }));
      this.selectedIndex = 0;
      this.renderResults();
      return;
    }

    const allCandidates = [...this.apps, ...this.systemCommands];

    // Use native bro.search.fuzzy if available
    if (typeof bro !== 'undefined' && bro.search?.fuzzy) {
      try {
        const matches = bro.search.fuzzy(q, allCandidates, { key: 'name' });
        if (Array.isArray(matches)) {
          this.filtered = matches.map((m) => (m && m.item ? m.item : m)).filter(Boolean);
          this.selectedIndex = 0;
          this.renderResults();
          return;
        }
      } catch (_) {}
    }

    // Fallback fuzzy/substring search
    const lowerQ = q.toLowerCase();
    this.filtered = allCandidates.filter((item) => {
      const name = (item.name || '').toLowerCase();
      const comment = (item.comment || '').toLowerCase();
      return name.includes(lowerQ) || comment.includes(lowerQ);
    });

    this.selectedIndex = 0;
    this.renderResults();
  }

  onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.navigate(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.navigate(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.executeSelected();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }

  navigate(delta) {
    if (this.filtered.length === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + this.filtered.length) % this.filtered.length;
    this.renderSelection();
  }

  renderResults() {
    const container = document.getElementById('launcher-results');
    if (!container) return;

    container.innerHTML = '';

    if (this.filtered.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'launcher-empty';
      emptyEl.textContent = 'No matching applications or commands';
      container.appendChild(emptyEl);
      return;
    }

    this.filtered.forEach((item, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = `launcher-item ${index === this.selectedIndex ? 'active' : ''}`;
      itemEl.dataset.index = index;

      const iconEl = document.createElement('span');
      iconEl.className = 'launcher-item-icon';
      iconEl.textContent = item.icon || (item.type === 'cmd' ? '⚡' : '🚀');

      const contentEl = document.createElement('div');
      contentEl.className = 'launcher-item-content';

      const titleEl = document.createElement('span');
      titleEl.className = 'launcher-item-title';
      titleEl.textContent = item.name;

      const descEl = document.createElement('span');
      descEl.className = 'launcher-item-desc';
      descEl.textContent = item.comment || '';

      contentEl.appendChild(titleEl);
      if (item.comment) contentEl.appendChild(descEl);

      const badgeEl = document.createElement('span');
      badgeEl.className = 'launcher-item-badge';
      badgeEl.textContent = item.type === 'cmd' ? 'Action' : 'App';

      itemEl.appendChild(iconEl);
      itemEl.appendChild(contentEl);
      itemEl.appendChild(badgeEl);

      itemEl.addEventListener('click', () => {
        this.selectedIndex = index;
        this.executeSelected();
      });

      container.appendChild(itemEl);
    });

    this.scrollSelectedIntoView();
  }

  renderSelection() {
    const items = document.querySelectorAll('.launcher-item');
    items.forEach((el, idx) => {
      if (idx === this.selectedIndex) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
    this.scrollSelectedIntoView();
  }

  scrollSelectedIntoView() {
    const activeEl = document.querySelector('.launcher-item.active');
    if (activeEl && typeof activeEl.scrollIntoView === 'function') {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  executeSelected() {
    if (this.filtered.length === 0 || this.selectedIndex < 0) return;
    const selected = this.filtered[this.selectedIndex];
    if (!selected) return;

    this.close();

    if (selected.type === 'app') {
      this.launchApp(selected.id);
    } else if (selected.type === 'clip') {
      this.clipboard.pasteEntry(selected.id);
    } else if (selected.type === 'cmd' && typeof selected.action === 'function') {
      selected.action();
    }
  }

  launchApp(appId) {
    if (typeof bro !== 'undefined' && bro.apps?.launch) {
      try {
        bro.apps.launch(appId);
      } catch (err) {
        console.warn(`Failed to launch app ${appId}:`, err);
      }
    }
  }

  openClipboard() {
    this.isOpen = true;
    const modal = document.getElementById('launcher-modal');
    const input = document.getElementById('launcher-input');
    if (modal) modal.classList.remove('hidden');
    if (input) {
      input.value = 'clip: ';
      input.focus();
    }
    this.onInput('clip: ');
  }

  open() {
    this.isOpen = true;
    const modal = document.getElementById('launcher-modal');
    const input = document.getElementById('launcher-input');
    if (modal) modal.classList.remove('hidden');
    if (input) {
      input.value = '';
      input.focus();
    }
    this.onInput('');
  }

  close() {
    this.isOpen = false;
    const modal = document.getElementById('launcher-modal');
    if (modal) modal.classList.add('hidden');
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }
}
