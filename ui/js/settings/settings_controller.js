/**
 * Helm Desktop Settings Application Controller
 * Orchestrates category views, sidebar navigation, live search, and modal lifecycle.
 */

import { AudioView } from './views/audio_view.js';
import { DisplayView } from './views/display_view.js';
import { NetworkView } from './views/network_view.js';
import { PowerView } from './views/power_view.js';
import { AppearanceView } from './views/appearance_view.js';
import { ShortcutsView } from './views/shortcuts_view.js';
import { SystemView } from './views/system_view.js';
import { createIcon } from '../icons.js';
import { h, clear } from '../dom.js';

export class SettingsController {
  constructor() {
    this.isOpen = false;
    this.activeCategory = 'audio';
    this.searchQuery = '';

    this.categories = [
      { id: 'audio', label: 'Audio Studio', icon: 'audio', keywords: ['sound', 'volume', 'microphone', 'sink', 'speaker', 'headphone', 'pulse', 'input', 'output'] },
      { id: 'display', label: 'Displays & Monitors', icon: 'display', keywords: ['screen', 'resolution', 'refresh', 'rate', 'dpi', 'scale', 'monitors', 'layout', 'orientation'] },
      { id: 'network', label: 'Network & Internet', icon: 'network', keywords: ['wifi', 'ethernet', 'ip', 'mac', 'gateway', 'dns', 'internet', 'connection', 'ssid'] },
      { id: 'power', label: 'Power & Battery', icon: 'power', keywords: ['battery', 'charge', 'sleep', 'timeout', 'energy', 'profile', 'suspend', 'shutdown'] },
      { id: 'appearance', label: 'Appearance & Desktop', icon: 'appearance', keywords: ['wallpaper', 'theme', 'dark', 'light', 'accent', 'color', 'background', 'style'] },
      { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: 'shortcuts', keywords: ['hotkeys', 'keybindings', 'chords', 'keys', 'launcher', 'clipboard', 'super', 'ctrl'] },
      { id: 'system', label: 'System Information', icon: 'system', keywords: ['about', 'hardware', 'cpu', 'gpu', 'memory', 'ram', 'specs', 'os', 'uptime', 'helm'] },
    ];

    this.views = {
      audio: new AudioView(this),
      display: new DisplayView(this),
      network: new NetworkView(this),
      power: new PowerView(this),
      appearance: new AppearanceView(this),
      shortcuts: new ShortcutsView(this),
      system: new SystemView(this),
    };
  }

  init() {
    this.modalEl = document.getElementById('settings-modal');
    this.sidebarEl = document.getElementById('settings-sidebar-list');
    this.contentEl = document.getElementById('settings-content-viewport');
    this.searchInput = document.getElementById('settings-search-input');
    this.closeBtn = document.getElementById('settings-close-btn');
    this.backdropEl = document.getElementById('settings-backdrop');

    this.renderSidebar();
    this.bindEvents();

    // Initialize all views
    for (const [id, view] of Object.entries(this.views)) {
      if (typeof view.init === 'function') {
        try {
          view.init();
        } catch (err) {
          console.warn(`Settings: failed to init view ${id}:`, err);
        }
      }
    }
  }

  bindEvents() {
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    const winCloseBtn = document.getElementById('settings-win-close');
    if (winCloseBtn) {
      winCloseBtn.addEventListener('click', () => this.close());
    }

    if (this.backdropEl) {
      this.backdropEl.addEventListener('click', () => this.close());
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => this.onSearch(e.target.value));
      this.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (this.searchQuery) {
            e.stopPropagation();
            this.searchInput.value = '';
            this.onSearch('');
          }
        }
      });
    }
  }

  renderSidebar() {
    if (!this.sidebarEl) return;
    clear(this.sidebarEl);

    const query = this.searchQuery.toLowerCase().trim();

    this.categories.forEach((cat) => {
      // If searching, check if category or view matches
      const isCategoryMatch = !query ||
        cat.label.toLowerCase().includes(query) ||
        cat.keywords.some((k) => k.includes(query));

      const view = this.views[cat.id];
      const hasViewMatches = query && typeof view?.hasSearchMatches === 'function' ?
        view.hasSearchMatches(query) : false;

      const isVisible = !query || isCategoryMatch || hasViewMatches;
      if (!isVisible) return;

      const itemBtn = h(`button.settings-nav-item${cat.id === this.activeCategory ? '.active' : ''}`, {
        type: 'button',
        dataset: { categoryId: cat.id },
        onclick: () => this.showCategory(cat.id),
      },
        h('span.nav-icon', null, createIcon(cat.icon, 16)),
        h('span.nav-label', null, cat.label)
      );

      this.sidebarEl.appendChild(itemBtn);
    });
  }

  showCategory(categoryId) {
    if (!this.views[categoryId]) categoryId = 'audio';
    this.activeCategory = categoryId;

    // Update active class on sidebar items
    if (this.sidebarEl) {
      const items = this.sidebarEl.querySelectorAll('.settings-nav-item');
      items.forEach((item) => {
        if (item.dataset.categoryId === categoryId) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }

    // Render active view in viewport
    if (this.contentEl) {
      clear(this.contentEl);
      const view = this.views[categoryId];
      if (view && typeof view.render === 'function') {
        try {
          const viewContainer = h(`div.settings-view.settings-view-${categoryId}`);
          view.render(viewContainer, this.searchQuery);
          this.contentEl.appendChild(viewContainer);
        } catch (err) {
          console.error(`Settings: error rendering view ${categoryId}:`, err);
          const errEl = h('div.settings-error', null, `Failed to load ${categoryId} settings.`);
          this.contentEl.appendChild(errEl);
        }
      }
    }
  }

  onSearch(query) {
    this.searchQuery = query || '';
    this.renderSidebar();

    // If active category was filtered out, pick the first visible category
    const activeItem = this.sidebarEl?.querySelector(`.settings-nav-item[data-category-id="${this.activeCategory}"]`);
    if (!activeItem) {
      const firstVisible = this.sidebarEl?.querySelector('.settings-nav-item');
      if (firstVisible && firstVisible.dataset.categoryId) {
        this.showCategory(firstVisible.dataset.categoryId);
        return;
      }
    }

    // Re-render current category view with search highlight
    this.showCategory(this.activeCategory);
  }

  open(category = null) {
    if (category && this.views[category]) {
      this.activeCategory = category;
    }

    this.isOpen = true;

    if (window.helm && typeof window.helm.setModalActive === 'function') {
      window.helm.setModalActive('settings', true);
    }

    if (this.modalEl) {
      this.modalEl.classList.remove('hidden');
    }

    this.showCategory(this.activeCategory);

    // Focus search input or active view
    setTimeout(() => {
      if (this.searchInput) {
        this.searchInput.focus();
      }
    }, 50);
  }

  close() {
    this.isOpen = false;

    if (this.modalEl) {
      this.modalEl.classList.add('hidden');
    }

    if (window.helm && typeof window.helm.setModalActive === 'function') {
      window.helm.setModalActive('settings', false);
    }
  }

  toggle(category = null) {
    if (this.isOpen) {
      if (category && category !== this.activeCategory) {
        this.showCategory(category);
      } else {
        this.close();
      }
    } else {
      this.open(category || this.activeCategory);
    }
  }

  destroy() {
    for (const view of Object.values(this.views)) {
      if (typeof view.destroy === 'function') {
        try {
          view.destroy();
        } catch (_) {}
      }
    }
    this.close();
  }
}
