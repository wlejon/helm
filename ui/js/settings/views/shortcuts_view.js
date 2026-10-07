/**
 * Keyboard Shortcuts & Hotkeys Configuration View
 * Provides an interactive cheat-sheet, search filter, and keybinding configurator.
 */

export class ShortcutsView {
  constructor(controller) {
    this.controller = controller;
    this.container = null;
    this.editingShortcutId = null;

    this.shortcuts = [
      // Desktop & Navigation
      { id: 'launcher', category: 'Navigation', name: 'Open Spotlight Launcher', defaultChord: 'Super / Ctrl+Space', keys: ['Ctrl', 'Space'], desc: 'Quick search applications, commands, and files.' },
      { id: 'clipboard', category: 'Navigation', name: 'Clipboard History', defaultChord: 'Super+V / Ctrl+Alt+V', keys: ['Ctrl', 'Alt', 'V'], desc: 'Inspect and paste recently copied text items.' },
      { id: 'notifications', category: 'Navigation', name: 'Toggle Notification Drawer', defaultChord: 'Ctrl+Shift+N', keys: ['Ctrl', 'Shift', 'N'], desc: 'Open notifications and quick message history.' },
      { id: 'settings', category: 'Navigation', name: 'Open System Settings', defaultChord: 'Super+, / Ctrl+,', keys: ['Ctrl', ','], desc: 'Launch the native Helm control center.' },
      { id: 'lock', category: 'Navigation', name: 'Lock Screen Session', defaultChord: 'Ctrl+Alt+L', keys: ['Ctrl', 'Alt', 'L'], desc: 'Lock session with password authentication.' },
      { id: 'escape', category: 'Navigation', name: 'Close Active Overlay', defaultChord: 'Escape', keys: ['Esc'], desc: 'Dismiss active popups, drawers, or modal windows.' },

      // Window Management
      { id: 'switch-win', category: 'Window Management', name: 'Switch Windows', defaultChord: 'Alt+Tab', keys: ['Alt', 'Tab'], desc: 'Cycle focus between active desktop application windows.' },
      { id: 'workspace-1', category: 'Window Management', name: 'Switch to Workspace 1', defaultChord: 'Super+1', keys: ['Super', '1'], desc: 'Switch to virtual desktop workspace 1.' },
      { id: 'workspace-2', category: 'Window Management', name: 'Switch to Workspace 2', defaultChord: 'Super+2', keys: ['Super', '2'], desc: 'Switch to virtual desktop workspace 2.' },
      { id: 'workspace-3', category: 'Window Management', name: 'Switch to Workspace 3', defaultChord: 'Super+3', keys: ['Super', '3'], desc: 'Switch to virtual desktop workspace 3.' },
      { id: 'close-win', category: 'Window Management', name: 'Close Window', defaultChord: 'Alt+F4 / Super+W', keys: ['Alt', 'F4'], desc: 'Close the currently focused window.' },

      // Media & Audio Controls
      { id: 'media-play', category: 'Media & Audio', name: 'Play / Pause Playback', defaultChord: 'MediaPlayPause', keys: ['MediaPlay'], desc: 'Toggle media stream playback state.' },
      { id: 'media-next', category: 'Media & Audio', name: 'Next Media Track', defaultChord: 'MediaTrackNext', keys: ['MediaNext'], desc: 'Skip to next track in active media player.' },
      { id: 'media-prev', category: 'Media & Audio', name: 'Previous Media Track', defaultChord: 'MediaTrackPrevious', keys: ['MediaPrev'], desc: 'Return to previous track in active media player.' },
      { id: 'vol-mute', category: 'Media & Audio', name: 'Mute Master Audio', defaultChord: 'VolumeMute', keys: ['VolMute'], desc: 'Quickly toggle master output mute.' },
    ];
  }

  init() {
    // Load custom keybindings from localStorage if saved
    try {
      const saved = localStorage.getItem('helm.customShortcuts');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.shortcuts.forEach((sc) => {
          if (parsed[sc.id]) {
            sc.keys = parsed[sc.id].keys;
            sc.custom = true;
          }
        });
      }
    } catch (_) {}
  }

  hasSearchMatches(query) {
    const q = query.toLowerCase();
    return this.shortcuts.some((s) =>
      s.name.toLowerCase().includes(q) ||
      s.desc.toLowerCase().includes(q) ||
      s.keys.some((k) => k.toLowerCase().includes(q))
    );
  }

  /* -------------------------------------------------------------------------
   * Rendering
   * ---------------------------------------------------------------------- */

  render(container, searchQuery = '') {
    this.container = container;
    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'settings-view-header';
    header.innerHTML = `
      <div class="view-header-titles">
        <h2 class="view-title">Keyboard Shortcuts</h2>
        <p class="view-subtitle">System-wide hotkeys, navigation chords, and customizable trigger bindings.</p>
      </div>
    `;
    container.appendChild(header);

    const q = (searchQuery || '').toLowerCase().trim();

    // Group shortcuts by category
    const categories = ['Navigation', 'Window Management', 'Media & Audio'];

    categories.forEach((catName) => {
      const items = this.shortcuts.filter((s) => {
        if (s.category !== catName) return false;
        if (!q) return true;
        return s.name.toLowerCase().includes(q) ||
               s.desc.toLowerCase().includes(q) ||
               s.keys.some((k) => k.toLowerCase().includes(q));
      });

      if (items.length === 0) return;

      const card = document.createElement('section');
      card.className = 'settings-card shortcuts-category-card';

      const catHeader = document.createElement('div');
      catHeader.className = 'settings-card-header';
      catHeader.innerHTML = `
        <h3 class="card-title">${this.escapeHtml(catName)}</h3>
      `;
      card.appendChild(catHeader);

      const table = document.createElement('div');
      table.className = 'shortcuts-table';

      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'shortcut-row';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'shortcut-info';
        infoDiv.innerHTML = `
          <span class="shortcut-name">${this.escapeHtml(item.name)}</span>
          <span class="shortcut-desc">${this.escapeHtml(item.desc)}</span>
        `;

        const chordDiv = document.createElement('div');
        chordDiv.className = 'shortcut-chord-box';

        item.keys.forEach((key) => {
          const kbd = document.createElement('kbd');
          kbd.className = 'shortcut-kbd';
          kbd.textContent = key;
          chordDiv.appendChild(kbd);
        });

        row.appendChild(infoDiv);
        row.appendChild(chordDiv);
        table.appendChild(row);
      });

      card.appendChild(table);
      container.appendChild(card);
    });

    // Reset Shortcuts Footer
    const resetFooter = document.createElement('div');
    resetFooter.className = 'shortcuts-footer-bar';
    resetFooter.innerHTML = `
      <span class="footer-hint">Press any hotkey combination anytime while working in Helm.</span>
      <button class="btn btn-secondary btn-sm" id="btn-reset-shortcuts">Reset to Defaults</button>
    `;

    const resetBtn = resetFooter.querySelector('#btn-reset-shortcuts');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        try { localStorage.removeItem('helm.customShortcuts'); } catch (_) {}
        this.shortcuts.forEach((sc) => { delete sc.custom; });
        this.render(this.container, this.controller.searchQuery);
      });
    }

    container.appendChild(resetFooter);
  }

  destroy() {
    this.container = null;
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
