/**
 * Appearance & Desktop Customization View
 * Manages wallpaper gallery, custom image selection via bro.vfs, Dark/Light/Auto modes,
 * and dynamic accent color swatches updating CSS custom property tokens in real-time.
 */

import { h, clear } from '../../dom.js';
import { createIcon } from '../../icons.js';
import { viewHeader } from '../components.js';

export class AppearanceView {
  constructor(controller) {
    this.controller = controller;
    this.container = null;
    this.themeMode = 'dark';
    this.selectedWallpaperId = 'cosmic-abyss';
    this.activeAccent = 'violet';

    this.wallpapers = [
      {
        id: 'cosmic-abyss',
        name: 'Cosmic Abyss',
        desc: 'Deep indigo and dark violet nebulas with subtle starlight.',
        background: 'radial-gradient(ellipse at 70% 30%, #201335 0%, #110b1a 45%, #08060d 100%)',
      },
      {
        id: 'midnight-aurora',
        name: 'Midnight Aurora',
        desc: 'Vibrant northern lights in emerald and cyan over dark icy mountains.',
        background: 'radial-gradient(circle at 30% 20%, #0d2b29 0%, #091724 50%, #040911 100%)',
      },
      {
        id: 'cyber-sunset',
        name: 'Cyber Sunset',
        desc: 'Warm synthwave sunset with glowing amber and magenta horizon.',
        background: 'linear-gradient(135deg, #2b1126 0%, #1a0a1f 40%, #0c0714 100%)',
      },
      {
        id: 'obsidian-slate',
        name: 'Obsidian Slate',
        desc: 'Monochrome minimalist dark carbon fiber texture and shadows.',
        background: 'radial-gradient(ellipse at center, #1b1c20 0%, #121316 60%, #0a0b0d 100%)',
      },
      {
        id: 'deep-ocean',
        name: 'Deep Oceanic Trench',
        desc: 'Abyssal navy blue and oceanic teal with soft luminescent depth.',
        background: 'radial-gradient(circle at 60% 80%, #0a2538 0%, #061524 50%, #030a12 100%)',
      },
    ];

    this.accentColors = [
      { id: 'violet', label: 'Helm Violet', oklch: 'oklch(0.68 0.22 260)', hover: 'oklch(0.74 0.24 260)', active: 'oklch(0.62 0.20 260)', subtle: 'oklch(0.68 0.22 260 / 0.18)' },
      { id: 'cyan', label: 'Ocean Cyan', oklch: 'oklch(0.70 0.18 215)', hover: 'oklch(0.76 0.20 215)', active: 'oklch(0.64 0.16 215)', subtle: 'oklch(0.70 0.18 215 / 0.18)' },
      { id: 'emerald', label: 'Emerald Green', oklch: 'oklch(0.72 0.18 145)', hover: 'oklch(0.78 0.20 145)', active: 'oklch(0.66 0.16 145)', subtle: 'oklch(0.72 0.18 145 / 0.18)' },
      { id: 'amber', label: 'Amber Gold', oklch: 'oklch(0.78 0.16 75)', hover: 'oklch(0.84 0.18 75)', active: 'oklch(0.72 0.14 75)', subtle: 'oklch(0.78 0.16 75 / 0.18)' },
      { id: 'rose', label: 'Crimson Rose', oklch: 'oklch(0.65 0.24 25)', hover: 'oklch(0.71 0.26 25)', active: 'oklch(0.59 0.22 25)', subtle: 'oklch(0.65 0.24 25 / 0.18)' },
      { id: 'fuchsia', label: 'Neon Fuchsia', oklch: 'oklch(0.68 0.23 320)', hover: 'oklch(0.74 0.25 320)', active: 'oklch(0.62 0.21 320)', subtle: 'oklch(0.68 0.23 320 / 0.18)' },
    ];
  }

  init() {
    // Restore saved appearance preferences from localStorage
    try {
      const savedTheme = localStorage.getItem('helm.themeMode');
      if (savedTheme) this.themeMode = savedTheme;

      const savedAccent = localStorage.getItem('helm.accentColor');
      if (savedAccent) {
        const found = this.accentColors.find((a) => a.id === savedAccent);
        if (found) this.setAccent(found);
      }

      const savedWallpaper = localStorage.getItem('helm.wallpaperId');
      if (savedWallpaper) {
        const wp = this.wallpapers.find((w) => w.id === savedWallpaper);
        if (wp) this.applyWallpaper(wp);
      }
    } catch (_) {}
  }

  hasSearchMatches(query) {
    const q = query.toLowerCase();
    const terms = ['appearance', 'wallpaper', 'theme', 'dark', 'light', 'accent', 'color', 'background', 'style', 'canvas', 'acrylic'];
    return terms.some((t) => t.includes(q));
  }

  /* -------------------------------------------------------------------------
   * Rendering
   * ---------------------------------------------------------------------- */

  render(container, searchQuery = '') {
    this.container = container;
    clear(container);

    container.appendChild(
      viewHeader('Appearance & Desktop', 'Desktop background, theme mode, and system accent color.')
    );

    // 1. Wallpaper Gallery Card
    container.appendChild(this.renderWallpaperSection());

    // 2. Theme Mode Switch Card
    container.appendChild(this.renderThemeModeSection());

    // 3. Accent Color Selector Card
    container.appendChild(this.renderAccentColorSection());
  }

  renderWallpaperSection() {
    const fileInput = h('input#custom-wallpaper-file-input.hidden', {
      type: 'file',
      accept: 'image/*',
      onchange: (e) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target?.result;
            if (dataUrl) {
              this.applyCustomWallpaper(dataUrl, file.name);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    });

    const btnCustom = h('button.btn.btn-secondary.btn-sm#btn-custom-wallpaper', {
      onclick: () => this.openCustomWallpaperPicker(fileInput)
    }, createIcon('image', 13), ' Choose Image...');

    const header = h('div.settings-card-header', null,
      h('span.card-header-icon', null, createIcon('image', 18)),
      h('div.card-header-text', null,
        h('h3.card-title', null, 'Desktop Wallpaper'),
        h('span.card-description', null, 'Choose a curated desktop background or import custom images.')
      ),
      h('div.card-header-actions', null, btnCustom, fileInput)
    );

    const tiles = this.wallpapers.map((wp) => {
      const isSelected = this.selectedWallpaperId === wp.id;

      const previewKids = [];
      if (isSelected) {
        previewKids.push(
          h('div.wallpaper-check-badge', null, createIcon('check', 12))
        );
      }

      const preview = h('div.wallpaper-tile-preview', {
        style: { background: wp.background }
      }, ...previewKids);

      const info = h('div.wallpaper-tile-info', null,
        h('span.wallpaper-tile-name', null, wp.name)
      );

      return h(`div.wallpaper-tile${isSelected ? '.selected' : ''}`, {
        dataset: { wallpaperId: wp.id },
        onclick: () => {
          this.applyWallpaper(wp);
          this.render(this.container, this.controller.searchQuery);
        }
      }, preview, info);
    });

    return h('section.settings-card.appearance-wallpaper-card', null,
      header,
      h('div.wallpaper-gallery-grid', null, ...tiles)
    );
  }

  renderThemeModeSection() {
    const header = h('div.settings-card-header', null,
      h('span.card-header-icon', null, createIcon('appearance', 18)),
      h('div.card-header-text', null,
        h('h3.card-title', null, 'Color Theme Mode'),
        h('span.card-description', null, 'Select your preferred desktop appearance tone.')
      )
    );

    const modes = [
      { id: 'dark', label: 'Dark Mode', icon: 'moon', desc: 'Subtle dark acrylic surfaces with optimal night contrast' },
      { id: 'light', label: 'Light Mode', icon: 'sun', desc: 'Crisp bright paper tones with high sunlight legibility' },
      { id: 'auto', label: 'Auto (System)', icon: 'autoTheme', desc: 'Automatically aligns with day and night cycles' },
    ];

    const tiles = modes.map((m) => {
      const isSelected = this.themeMode === m.id;

      return h(`div.theme-mode-tile${isSelected ? '.selected' : ''}`, {
        onclick: () => {
          this.setThemeMode(m.id);
          this.render(this.container, this.controller.searchQuery);
        }
      },
        h('span.mode-tile-icon', null, createIcon(m.icon, 20)),
        h('span.mode-tile-title', null, m.label),
        h('span.mode-tile-desc', null, m.desc),
        isSelected ? h('span.badge.badge-accent', null, 'Active') : null
      );
    });

    return h('section.settings-card.appearance-theme-card', null,
      header,
      h('div.theme-modes-grid', null, ...tiles)
    );
  }

  renderAccentColorSection() {
    const header = h('div.settings-card-header', null,
      h('span.card-header-icon', null, createIcon('appearance', 18)),
      h('div.card-header-text', null,
        h('h3.card-title', null, 'System Accent Color'),
        h('span.card-description', null, 'Customizes buttons, focus rings, sliders, and highlights across Helm.')
      )
    );

    const swatches = this.accentColors.map((accent) => {
      const isSelected = this.activeAccent === accent.id;

      const swatchKids = [];
      if (isSelected) {
        swatchKids.push(
          h('span.swatch-checkmark', null, createIcon('check', 12))
        );
      }

      return h(`button.accent-swatch${isSelected ? '.selected.active' : ''}`, {
        type: 'button',
        title: accent.label,
        style: { backgroundColor: accent.oklch },
        onclick: () => {
          this.setAccent(accent);
          this.render(this.container, this.controller.searchQuery);
        }
      }, ...swatchKids);
    });

    return h('section.settings-card.appearance-accent-card', null,
      header,
      h('div.accent-swatches-grid', null, ...swatches)
    );
  }

  /* -------------------------------------------------------------------------
   * Appearance Actions
   * ---------------------------------------------------------------------- */

  applyWallpaper(wp) {
    this.selectedWallpaperId = wp.id;
    const wallpaperEl = document.getElementById('wallpaper');
    if (wallpaperEl) {
      wallpaperEl.style.background = wp.background;
      wallpaperEl.style.backgroundSize = 'cover';
      wallpaperEl.style.backgroundPosition = 'center';
    }

    try {
      localStorage.setItem('helm.wallpaperId', wp.id);
    } catch (_) {}
  }

  applyCustomWallpaper(dataUrl, name = 'Custom Image') {
    const customId = `custom-${Date.now()}`;
    const customWp = {
      id: customId,
      name,
      desc: 'User imported custom wallpaper image.',
      background: `url("${dataUrl}") center/cover no-repeat`,
    };

    this.wallpapers.unshift(customWp);
    this.applyWallpaper(customWp);
    this.render(this.container, this.controller.searchQuery);
  }

  openCustomWallpaperPicker(fileInput) {
    if (fileInput) {
      fileInput.click();
    }
  }

  setThemeMode(mode) {
    this.themeMode = mode;
    const root = document.documentElement;

    if (mode === 'light') {
      root.classList.add('theme-light');
      root.classList.remove('theme-dark');
    } else {
      root.classList.add('theme-dark');
      root.classList.remove('theme-light');
    }

    try {
      localStorage.setItem('helm.themeMode', mode);
    } catch (_) {}
  }

  setAccent(accent) {
    this.activeAccent = accent.id;
    const root = document.documentElement;

    root.style.setProperty('--color-accent', accent.oklch);
    root.style.setProperty('--color-accent-hover', accent.hover);
    root.style.setProperty('--color-accent-active', accent.active);
    root.style.setProperty('--color-accent-subtle', accent.subtle);
    root.style.setProperty('--color-border-focus', accent.oklch);

    try {
      localStorage.setItem('helm.accentColor', accent.id);
    } catch (_) {}
  }

  destroy() {
    this.container = null;
  }
}
