/**
 * Multi-Monitor Display Management View
 * Features an interactive visual arrangement canvas, resolution/refresh rate controls,
 * DPI scaling, orientation rotation, and safe test-then-revert configuration.
 */

import { h, clear } from '../../dom.js';
import { createIcon } from '../settings_icons.js';
import { viewHeader } from '../components.js';

export class DisplayView {
  constructor(controller) {
    this.controller = controller;
    this.container = null;
    this.selectedDisplayId = null;
    this.displays = [];
    this.isDragging = false;
    this.dragTargetId = null;
    this.dragOffset = { x: 0, y: 0 };
    this.pendingChanges = {}; // displayId -> { width, height, refreshRate, scale, orientation, isPrimary, x, y }
    this.countdownTimer = null;
    this.countdownSeconds = 0;
  }

  init() {
    if (typeof bro !== 'undefined' && bro.displays && typeof bro.displays.on === 'function') {
      try {
        bro.displays.on('change', () => this.refresh());
        bro.displays.on('countdown', (e) => this.handleCountdown(e));
        bro.displays.on('reverted', () => this.handleReverted());
      } catch (_) {}
    }
  }

  refresh() {
    if (this.container && this.controller.activeCategory === 'display' && this.controller.isOpen) {
      this.render(this.container, this.controller.searchQuery);
    }
  }

  hasSearchMatches(query) {
    const q = query.toLowerCase();
    const terms = ['display', 'monitor', 'screen', 'resolution', 'refresh', 'dpi', 'scale', 'orientation', 'rotate', 'primary'];
    return terms.some((t) => t.includes(q));
  }

  /* -------------------------------------------------------------------------
   * Data Loading
   * ---------------------------------------------------------------------- */

  loadDisplays() {
    if (typeof bro !== 'undefined' && bro.displays && typeof bro.displays.getSnapshot === 'function') {
      try {
        const snap = bro.displays.getSnapshot();
        if (snap && Array.isArray(snap.displays) && snap.displays.length > 0) {
          this.displays = snap.displays.map((d) => ({
            id: String(d.id),
            name: d.name || `Display ${d.id}`,
            isPrimary: !!d.isPrimary,
            isActive: d.isActive !== false,
            geometry: d.geometry || { x: 0, y: 0, width: 1920, height: 1080 },
            orientation: d.orientation || 'normal',
            scaleFactor: typeof d.scaleFactor === 'number' ? d.scaleFactor : 1.0,
            currentMode: d.currentMode || { width: 1920, height: 1080, refreshRate: 60 },
            availableModes: Array.isArray(d.availableModes) ? d.availableModes : [
              { width: 3840, height: 2160, refreshRate: 60 },
              { width: 2560, height: 1440, refreshRate: 144 },
              { width: 1920, height: 1080, refreshRate: 165 },
              { width: 1920, height: 1080, refreshRate: 60 },
              { width: 1280, height: 720, refreshRate: 60 },
            ],
          }));

          if (!this.selectedDisplayId && this.displays.length > 0) {
            this.selectedDisplayId = this.displays[0].id;
          }
          return;
        }
      } catch (err) {
        console.warn('Displays: getSnapshot failed:', err);
      }
    }

    // Fallback: Query browser window metrics
    const curW = window.screen.width || 1920;
    const curH = window.screen.height || 1080;
    const dpr = window.devicePixelRatio || 1.0;

    this.displays = [
      {
        id: 'primary',
        name: 'Primary Display',
        isPrimary: true,
        isActive: true,
        geometry: { x: 0, y: 0, width: curW, height: curH },
        orientation: 'normal',
        scaleFactor: dpr,
        currentMode: { width: curW, height: curH, refreshRate: 60 },
        availableModes: [
          { width: curW, height: curH, refreshRate: 60 },
        ],
      }
    ];

    if (!this.selectedDisplayId) {
      this.selectedDisplayId = 'primary';
    }
  }

  /* -------------------------------------------------------------------------
   * Rendering
   * ---------------------------------------------------------------------- */

  render(container, searchQuery = '') {
    this.container = container;
    this.loadDisplays();
    clear(container);

    const viewWrapper = h('div.settings-view-display');

    viewWrapper.appendChild(
      viewHeader('Displays', 'Rearrange multi-monitor layouts, adjust resolution, refresh rates, and DPI scaling.')
    );

    // Revert Countdown Banner (if active)
    if (this.countdownSeconds > 0) {
      viewWrapper.appendChild(this.renderCountdownBanner());
    }

    // 1. Visual Arrangement Canvas Card
    viewWrapper.appendChild(this.renderArrangementCanvas());

    // 2. Selected Monitor Settings Controls Card
    const selectedDisplay = this.displays.find((d) => d.id === this.selectedDisplayId) || this.displays[0];
    if (selectedDisplay) {
      viewWrapper.appendChild(this.renderDisplayDetails(selectedDisplay));
    }

    container.appendChild(viewWrapper);
  }

  renderCountdownBanner() {
    return h('div.display-revert-banner', null,
      h('div.banner-content', null,
        h('span.banner-icon', null, createIcon('system', 16)),
        h('span.banner-text', null,
          'Testing display configuration. Reverting in ',
          h('strong', null, `${this.countdownSeconds}s`),
          '...'
        )
      ),
      h('div.banner-actions', null,
        h('button.btn.btn-secondary.btn-sm#btn-revert-config', {
          onclick: () => this.revertConfig()
        }, 'Revert Now'),
        h('button.btn.btn-accent.btn-sm#btn-confirm-config', {
          onclick: () => this.confirmConfig()
        }, 'Keep Changes')
      )
    );
  }

  renderArrangementCanvas() {
    const header = h('div.settings-card-header', null,
      h('div.card-header-icon', null, createIcon('display', 18)),
      h('div.card-header-text', null,
        h('h3.card-title', null, 'Display Arrangement'),
        h('p.card-description', null, 'Drag monitors to align them with your physical desktop layout.')
      )
    );

    const canvasArea = h('div.display-canvas-viewport#display-arrangement-canvas');

    const minX = Math.min(...this.displays.map((d) => d.geometry.x));
    const maxX = Math.max(...this.displays.map((d) => d.geometry.x + d.geometry.width));
    const minY = Math.min(...this.displays.map((d) => d.geometry.y));
    const maxY = Math.max(...this.displays.map((d) => d.geometry.y + d.geometry.height));

    const totalWidth = Math.max(100, maxX - minX);
    const totalHeight = Math.max(100, maxY - minY);

    const canvasW = 600;
    const canvasH = 240;
    const scaleFactor = Math.min((canvasW - 80) / totalWidth, (canvasH - 60) / totalHeight);
    const offsetX = (canvasW - totalWidth * scaleFactor) / 2 - minX * scaleFactor;
    const offsetY = (canvasH - totalHeight * scaleFactor) / 2 - minY * scaleFactor;

    this.displays.forEach((display, index) => {
      const isSelected = display.id === this.selectedDisplayId;
      const boxW = Math.max(80, Math.round(display.geometry.width * scaleFactor));
      const boxH = Math.max(60, Math.round(display.geometry.height * scaleFactor));
      const x = Math.round(display.geometry.x * scaleFactor + offsetX);
      const y = Math.round(display.geometry.y * scaleFactor + offsetY);

      const box = h(`div.display-monitor-box${isSelected ? '.selected' : ''}${display.isPrimary ? '.primary' : ''}`, {
        dataset: { displayId: display.id },
        style: {
          width: `${boxW}px`,
          height: `${boxH}px`,
          left: `${x}px`,
          top: `${y}px`,
        },
        onclick: (e) => {
          e.stopPropagation();
          this.selectedDisplayId = display.id;
          this.render(this.container, this.controller.searchQuery);
        }
      },
        h('div.monitor-box-badge', null, String(index + 1)),
        h('div.monitor-box-title', null, display.name),
        h('div.monitor-box-res', null, `${display.geometry.width}×${display.geometry.height}`),
        display.isPrimary ? h('span.monitor-primary-tag', null, 'Primary') : null
      );

      this.attachDragHandlers(box, display, scaleFactor);
      canvasArea.appendChild(box);
    });

    return h('section.settings-card.display-canvas-card', null,
      header,
      canvasArea
    );
  }

  attachDragHandlers(box, display, scale) {
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.isDragging = true;
      this.dragTargetId = display.id;
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = parseFloat(box.style.left) || 0;
      initialTop = parseFloat(box.style.top) || 0;
      box.classList.add('dragging');

      const onMouseMove = (ev) => {
        if (!this.isDragging) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const newLeft = initialLeft + dx;
        const newTop = initialTop + dy;
        box.style.left = `${newLeft}px`;
        box.style.top = `${newTop}px`;
      };

      const onMouseUp = (ev) => {
        this.isDragging = false;
        box.classList.remove('dragging');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        display.geometry.x = Math.max(0, Math.round(display.geometry.x + dx / scale));
        display.geometry.y = Math.max(0, Math.round(display.geometry.y + dy / scale));

        this.recordChange(display.id, { x: display.geometry.x, y: display.geometry.y });
        this.render(this.container, this.controller.searchQuery);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };

    box.addEventListener('mousedown', onMouseDown);
  }

  renderDisplayDetails(display) {
    const header = h('div.settings-card-header', null,
      h('div.card-header-icon', null, createIcon('sliders', 18)),
      h('div.card-header-text', null,
        h('h3.card-title', null, `${display.name} Settings`),
        h('p.card-description', null, 'Adjust resolution, orientation, refresh rate, and scaling for this monitor.')
      )
    );

    // 1. Resolution Dropdown
    const resSelect = h('select.select-input', {
      onchange: (e) => {
        const [w, h] = e.target.value.split('x').map(Number);
        this.recordChange(display.id, { width: w, height: h });
        display.currentMode.width = w;
        display.currentMode.height = h;
        display.geometry.width = w;
        display.geometry.height = h;
      }
    });

    const modes = display.availableModes || [];
    const uniqueResMap = new Map();
    modes.forEach((m) => {
      const key = `${m.width}x${m.height}`;
      if (!uniqueResMap.has(key)) uniqueResMap.set(key, m);
    });

    uniqueResMap.forEach((m, key) => {
      const isCur = m.width === display.currentMode.width && m.height === display.currentMode.height;
      resSelect.appendChild(
        h('option', { value: key, selected: isCur }, `${m.width} × ${m.height}${isCur ? ' (Current)' : ''}`)
      );
    });

    const resGroup = h('div.form-group', null,
      h('label.form-label', null, 'Resolution'),
      resSelect
    );

    // 2. Refresh Rate Selector
    const currentRate = Math.round(display.currentMode.refreshRate || 60);
    const refreshSelect = h('select.select-input', {
      onchange: (e) => {
        const rate = parseFloat(e.target.value);
        this.recordChange(display.id, { refreshRate: rate });
        display.currentMode.refreshRate = rate;
      }
    });

    const availableRates = [60, 75, 120, 144, 165, 240];
    availableRates.forEach((rate) => {
      refreshSelect.appendChild(
        h('option', { value: String(rate), selected: rate === currentRate }, `${rate} Hz`)
      );
    });

    const refreshGroup = h('div.form-group', null,
      h('label.form-label', null, 'Refresh Rate'),
      refreshSelect
    );

    // 3. DPI Scaling (100%, 125%, 150%, 200%)
    const scaleSelect = h('select.select-input', {
      onchange: (e) => {
        const factor = parseFloat(e.target.value);
        this.recordChange(display.id, { scale: factor });
        display.scaleFactor = factor;
      }
    });

    const scales = [
      { factor: 1.0, label: '100% (Standard)' },
      { factor: 1.25, label: '125%' },
      { factor: 1.5, label: '150% (Recommended)' },
      { factor: 1.75, label: '175%' },
      { factor: 2.0, label: '200% (HiDPI)' },
    ];

    scales.forEach((s) => {
      const isCur = Math.abs(s.factor - (display.scaleFactor || 1.0)) < 0.05;
      scaleSelect.appendChild(
        h('option', { value: String(s.factor), selected: isCur }, s.label)
      );
    });

    const scaleGroup = h('div.form-group', null,
      h('label.form-label', null, 'Scale (DPI)'),
      scaleSelect
    );

    // 4. Orientation
    const orientSelect = h('select.select-input', {
      onchange: (e) => {
        const orient = e.target.value;
        this.recordChange(display.id, { orientation: orient });
        display.orientation = orient;
      }
    });

    const orientations = [
      { id: 'normal', label: 'Landscape' },
      { id: 'rotate90', label: 'Portrait (90°)' },
      { id: 'rotate180', label: 'Landscape (Flipped 180°)' },
      { id: 'rotate270', label: 'Portrait (Flipped 270°)' },
    ];

    orientations.forEach((o) => {
      orientSelect.appendChild(
        h('option', { value: o.id, selected: display.orientation === o.id }, o.label)
      );
    });

    const orientGroup = h('div.form-group', null,
      h('label.form-label', null, 'Orientation'),
      orientSelect
    );

    const form = h('div.display-form-grid', null, resGroup, refreshGroup, scaleGroup, orientGroup);

    // 5. Primary Display Toggle & Apply Action Bar
    const primaryCheckbox = h('input', {
      type: 'checkbox',
      checked: !!display.isPrimary,
      disabled: !!display.isPrimary,
      onchange: (e) => {
        if (e.target.checked) {
          this.displays.forEach((d) => { d.isPrimary = (d.id === display.id); });
          this.recordChange(display.id, { isPrimary: true });
          this.render(this.container, this.controller.searchQuery);
        }
      }
    });

    const primaryCheckLabel = h('label.toggle-checkbox-label', null,
      primaryCheckbox,
      h('span', null, ' Make this my primary display')
    );

    const applyBtn = h('button.btn.btn-accent', {
      type: 'button',
      onclick: () => this.applyDisplayConfig(display.id)
    }, 'Apply Changes');

    const footer = h('div.display-action-bar', null,
      primaryCheckLabel,
      h('div.btn-group', null, applyBtn)
    );

    return h('section.settings-card.display-details-card', null,
      header,
      form,
      footer
    );
  }

  recordChange(displayId, delta) {
    if (!this.pendingChanges[displayId]) {
      this.pendingChanges[displayId] = {};
    }
    Object.assign(this.pendingChanges[displayId], delta);
  }

  async applyDisplayConfig(displayId) {
    const config = Object.assign({ displayId }, this.pendingChanges[displayId] || {});

    if (typeof bro !== 'undefined' && bro.displays) {
      try {
        if (typeof bro.displays.testConfig === 'function') {
          this.startCountdown(15);
          await bro.displays.testConfig(config, { revertAfterMs: 15000 });
          return;
        } else if (typeof bro.displays.applyConfig === 'function') {
          await bro.displays.applyConfig(config);
          this.render(this.container, this.controller.searchQuery);
          return;
        }
      } catch (err) {
        console.warn('Displays apply failed:', err);
      }
    }
  }

  startCountdown(seconds) {
    this.countdownSeconds = seconds;
    if (this.countdownTimer) clearInterval(this.countdownTimer);

    this.countdownTimer = setInterval(() => {
      this.countdownSeconds--;
      if (this.countdownSeconds <= 0) {
        this.revertConfig();
      } else {
        const textEl = this.container?.querySelector('.banner-text strong');
        if (textEl) textEl.textContent = `${this.countdownSeconds}s`;
      }
    }, 1000);

    this.render(this.container, this.controller.searchQuery);
  }

  confirmConfig() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.countdownSeconds = 0;

    if (typeof bro !== 'undefined' && bro.displays?.confirmConfig) {
      try {
        bro.displays.confirmConfig();
      } catch (_) {}
    }

    this.pendingChanges = {};
    this.render(this.container, this.controller.searchQuery);
  }

  revertConfig() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.countdownSeconds = 0;

    if (typeof bro !== 'undefined' && bro.displays?.revertConfig) {
      try {
        bro.displays.revertConfig();
      } catch (_) {}
    }

    this.pendingChanges = {};
    this.render(this.container, this.controller.searchQuery);
  }

  handleCountdown(event) {
    if (event?.remainingSeconds) {
      this.countdownSeconds = event.remainingSeconds;
      const textEl = this.container?.querySelector('.banner-text strong');
      if (textEl) textEl.textContent = `${this.countdownSeconds}s`;
    }
  }

  handleReverted() {
    this.revertConfig();
  }

  destroy() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.container = null;
  }
}
