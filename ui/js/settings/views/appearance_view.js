/**
 * Appearance & Desktop Customization View
 * Manages wallpaper gallery, custom image selection via bro.vfs, Dark/Light/Auto modes,
 * and dynamic accent color swatches updating CSS custom property tokens in real-time.
 */

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
    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'settings-view-header';
    header.innerHTML = `
      <div class="view-header-titles">
        <h2 class="view-title">Appearance & Desktop</h2>
        <p class="view-subtitle">Select desktop backgrounds, switch dark/light theme mode, and customize your vibrant system accent color.</p>
      </div>
    `;
    container.appendChild(header);

    // 1. Wallpaper Gallery Card
    const wallpaperCard = this.renderWallpaperSection();
    container.appendChild(wallpaperCard);

    // 2. Theme Mode Switch Card
    const themeCard = this.renderThemeModeSection();
    container.appendChild(themeCard);

    // 3. Accent Color Selector Card
    const accentCard = this.renderAccentColorSection();
    container.appendChild(accentCard);
  }

  renderWallpaperSection() {
    const card = document.createElement('section');
    card.className = 'settings-card appearance-wallpaper-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    header.innerHTML = `
      <div class="card-header-icon">🖼️</div>
      <div class="card-header-text">
        <h3 class="card-title">Desktop Wallpaper</h3>
        <p class="card-description">Choose a curated desktop background or import custom images.</p>
      </div>
      <div class="card-header-actions">
        <button class="btn btn-secondary btn-sm" id="btn-custom-wallpaper">📁 Choose Image...</button>
        <input type="file" id="custom-wallpaper-file-input" accept="image/*" class="hidden">
      </div>
    `;
    card.appendChild(header);

    const btnCustom = header.querySelector('#btn-custom-wallpaper');
    const fileInput = header.querySelector('#custom-wallpaper-file-input');

    if (btnCustom && fileInput) {
      btnCustom.addEventListener('click', () => {
        this.openCustomWallpaperPicker(fileInput);
      });

      fileInput.addEventListener('change', (e) => {
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
      });
    }

    const grid = document.createElement('div');
    grid.className = 'wallpaper-gallery-grid';

    this.wallpapers.forEach((wp) => {
      const isSelected = this.selectedWallpaperId === wp.id;
      const tile = document.createElement('div');
      tile.className = `wallpaper-tile ${isSelected ? 'selected' : ''}`;
      tile.dataset.wallpaperId = wp.id;

      const preview = document.createElement('div');
      preview.className = 'wallpaper-tile-preview';
      preview.style.background = wp.background;

      if (isSelected) {
        const checkBadge = document.createElement('div');
        checkBadge.className = 'wallpaper-check-badge';
        checkBadge.textContent = '✓';
        preview.appendChild(checkBadge);
      }

      const info = document.createElement('div');
      info.className = 'wallpaper-tile-info';
      info.innerHTML = `
        <span class="wallpaper-tile-name">${this.escapeHtml(wp.name)}</span>
      `;

      tile.appendChild(preview);
      tile.appendChild(info);

      tile.addEventListener('click', () => {
        this.applyWallpaper(wp);
        this.render(this.container, this.controller.searchQuery);
      });

      grid.appendChild(tile);
    });

    card.appendChild(grid);
    return card;
  }

  renderThemeModeSection() {
    const card = document.createElement('section');
    card.className = 'settings-card appearance-theme-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    header.innerHTML = `
      <div class="card-header-icon">🌓</div>
      <div class="card-header-text">
        <h3 class="card-title">Color Theme Mode</h3>
        <p class="card-description">Select your preferred desktop appearance tone.</p>
      </div>
    `;
    card.appendChild(header);

    const modes = [
      { id: 'dark', label: 'Dark Mode', icon: '🌙', desc: 'Subtle dark acrylic surfaces with optimal night contrast' },
      { id: 'light', label: 'Light Mode', icon: '☀️', desc: 'Crisp bright paper tones with high sunlight legibility' },
      { id: 'auto', label: 'Auto (System)', icon: '🌓', desc: 'Automatically aligns with day and night cycles' },
    ];

    const group = document.createElement('div');
    group.className = 'theme-modes-grid';

    modes.forEach((m) => {
      const isSelected = this.themeMode === m.id;
      const tile = document.createElement('div');
      tile.className = `theme-mode-tile ${isSelected ? 'selected' : ''}`;
      tile.innerHTML = `
        <span class="mode-tile-icon">${m.icon}</span>
        <span class="mode-tile-title">${m.label}</span>
        <span class="mode-tile-desc">${m.desc}</span>
        ${isSelected ? '<span class="badge badge-accent">Active</span>' : ''}
      `;

      tile.addEventListener('click', () => {
        this.setThemeMode(m.id);
        this.render(this.container, this.controller.searchQuery);
      });

      group.appendChild(tile);
    });

    card.appendChild(group);
    return card;
  }

  renderAccentColorSection() {
    const card = document.createElement('section');
    card.className = 'settings-card appearance-accent-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    header.innerHTML = `
      <div class="card-header-icon">🎨</div>
      <div class="card-header-text">
        <h3 class="card-title">System Accent Color</h3>
        <p class="card-description">Customizes buttons, focus rings, sliders, and highlights across Helm.</p>
      </div>
    `;
    card.appendChild(header);

    const swatchesGrid = document.createElement('div');
    swatchesGrid.className = 'accent-swatches-grid';

    this.accentColors.forEach((accent) => {
      const isSelected = this.activeAccent === accent.id;
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = `accent-swatch ${isSelected ? 'selected' : ''}`;
      swatch.title = accent.label;
      swatch.style.backgroundColor = accent.oklch;

      if (isSelected) {
        const mark = document.createElement('span');
        mark.className = 'swatch-checkmark';
        mark.textContent = '✓';
        swatch.appendChild(mark);
      }

      swatch.addEventListener('click', () => {
        this.setAccent(accent);
        this.render(this.container, this.controller.searchQuery);
      });

      swatchesGrid.appendChild(swatch);
    });

    card.appendChild(swatchesGrid);
    return card;
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

  async openCustomWallpaperPicker(fileInput) {
    // If bro.vfs is available, scan Pictures/Wallpapers directory
    if (typeof bro !== 'undefined' && bro.vfs && typeof bro.vfs.scan === 'function') {
      try {
        const homePath = '/home' || 'C:/Users';
        const res = await bro.vfs.scan(homePath, { maxDepth: 2 });
        if (Array.isArray(res) && res.length > 0) {
          const img = res.find((f) => f.name.match(/\.(png|jpg|jpeg|webp)$/i));
          if (img && img.path) {
            this.applyCustomWallpaper(img.path, img.name);
            return;
          }
        }
      } catch (_) {}
    }

    // Standard file dialog fallback
    fileInput.click();
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

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
