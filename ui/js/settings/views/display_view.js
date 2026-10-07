/**
 * Multi-Monitor Display Management View
 * Features an interactive visual arrangement canvas, resolution/refresh rate controls,
 * DPI scaling, orientation rotation, and safe test-then-revert configuration.
 */

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
            scaleFactor: d.scaleFactor || (d.scale?.factor) || 1.0,
            currentMode: d.currentMode || { width: 1920, height: 1080, refreshRate: 60 },
            availableModes: d.availableModes || [
              { width: 3840, height: 2160, refreshRate: 60 },
              { width: 2560, height: 1440, refreshRate: 144 },
              { width: 2560, height: 1440, refreshRate: 60 },
              { width: 1920, height: 1080, refreshRate: 144 },
              { width: 1920, height: 1080, refreshRate: 60 },
              { width: 1280, height: 720, refreshRate: 60 },
            ],
          }));

          if (!this.selectedDisplayId || !this.displays.some((d) => d.id === this.selectedDisplayId)) {
            const primary = this.displays.find((d) => d.isPrimary) || this.displays[0];
            this.selectedDisplayId = primary.id;
          }
          return;
        }
      } catch (err) {
        console.warn('Displays: error getting snapshot:', err);
      }
    }

    // Default multi-monitor setup fallback (1 Primary 1440p + 1 Secondary 1080p)
    this.displays = [
      {
        id: '1',
        name: 'Dell UltraSharp U2724D (Primary)',
        isPrimary: true,
        isActive: true,
        geometry: { x: 0, y: 0, width: 2560, height: 1440 },
        orientation: 'normal',
        scaleFactor: 1.0,
        currentMode: { width: 2560, height: 1440, refreshRate: 120 },
        availableModes: [
          { width: 2560, height: 1440, refreshRate: 120 },
          { width: 2560, height: 1440, refreshRate: 60 },
          { width: 1920, height: 1080, refreshRate: 120 },
          { width: 1920, height: 1080, refreshRate: 60 },
        ],
      },
      {
        id: '2',
        name: 'LG UltraFine 24MD4KL (Side Portrait)',
        isPrimary: false,
        isActive: true,
        geometry: { x: 2560, y: 0, width: 1080, height: 1920 },
        orientation: 'rotate90',
        scaleFactor: 1.25,
        currentMode: { width: 1080, height: 1920, refreshRate: 60 },
        availableModes: [
          { width: 1080, height: 1920, refreshRate: 60 },
          { width: 1920, height: 1080, refreshRate: 60 },
          { width: 1280, height: 720, refreshRate: 60 },
        ],
      }
    ];

    if (!this.selectedDisplayId) {
      this.selectedDisplayId = '1';
    }
  }

  /* -------------------------------------------------------------------------
   * Rendering
   * ---------------------------------------------------------------------- */

  render(container, searchQuery = '') {
    this.container = container;
    this.loadDisplays();
    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'settings-view-header';
    header.innerHTML = `
      <div class="view-header-titles">
        <h2 class="view-title">Displays & Monitors</h2>
        <p class="view-subtitle">Rearrange multi-monitor layouts, adjust resolution, refresh rates, and DPI scaling.</p>
      </div>
    `;
    container.appendChild(header);

    // Revert Countdown Banner (if active)
    if (this.countdownSeconds > 0) {
      const banner = this.renderCountdownBanner();
      container.appendChild(banner);
    }

    // 1. Visual Arrangement Canvas Card
    const canvasCard = this.renderArrangementCanvas();
    container.appendChild(canvasCard);

    // 2. Selected Monitor Settings Controls Card
    const selectedDisplay = this.displays.find((d) => d.id === this.selectedDisplayId) || this.displays[0];
    if (selectedDisplay) {
      const detailsCard = this.renderDisplayDetails(selectedDisplay);
      container.appendChild(detailsCard);
    }
  }

  renderCountdownBanner() {
    const banner = document.createElement('div');
    banner.className = 'display-revert-banner';
    banner.innerHTML = `
      <div class="banner-content">
        <span class="banner-icon">⚠️</span>
        <span class="banner-text">Testing display configuration. Reverting in <strong>${this.countdownSeconds}s</strong>...</span>
      </div>
      <div class="banner-actions">
        <button class="btn btn-secondary btn-sm" id="btn-revert-config">Revert Now</button>
        <button class="btn btn-accent btn-sm" id="btn-confirm-config">Keep Changes</button>
      </div>
    `;

    setTimeout(() => {
      const confirmBtn = banner.querySelector('#btn-confirm-config');
      const revertBtn = banner.querySelector('#btn-revert-config');
      if (confirmBtn) confirmBtn.addEventListener('click', () => this.confirmConfig());
      if (revertBtn) revertBtn.addEventListener('click', () => this.revertConfig());
    }, 0);

    return banner;
  }

  renderArrangementCanvas() {
    const card = document.createElement('section');
    card.className = 'settings-card display-canvas-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    header.innerHTML = `
      <div class="card-header-icon">🖥️</div>
      <div class="card-header-text">
        <h3 class="card-title">Display Arrangement</h3>
        <p class="card-description">Drag monitors to align them with your physical desktop layout.</p>
      </div>
    `;
    card.appendChild(header);

    const canvasArea = document.createElement('div');
    canvasArea.className = 'display-canvas-viewport';
    canvasArea.id = 'display-arrangement-canvas';

    // Calculate canvas scale factor to fit all monitors into ~600x260px area
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
      const box = document.createElement('div');
      const isSelected = display.id === this.selectedDisplayId;
      box.className = `display-monitor-box ${isSelected ? 'selected' : ''} ${display.isPrimary ? 'primary' : ''}`;
      box.dataset.displayId = display.id;

      const w = Math.max(80, Math.round(display.geometry.width * scaleFactor));
      const h = Math.max(60, Math.round(display.geometry.height * scaleFactor));
      const x = Math.round(display.geometry.x * scaleFactor + offsetX);
      const y = Math.round(display.geometry.y * scaleFactor + offsetY);

      box.style.width = `${w}px`;
      box.style.height = `${h}px`;
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;

      box.innerHTML = `
        <div class="monitor-box-badge">${index + 1}</div>
        <div class="monitor-box-title">${this.escapeHtml(display.name)}</div>
        <div class="monitor-box-res">${display.geometry.width}×${display.geometry.height}</div>
        ${display.isPrimary ? '<span class="monitor-primary-tag">Primary</span>' : ''}
      `;

      // Click to select
      box.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedDisplayId = display.id;
        this.render(this.container, this.controller.searchQuery);
      });

      // Drag to arrange
      this.attachDragHandlers(box, display, scaleFactor);

      canvasArea.appendChild(box);
    });

    card.appendChild(canvasArea);
    return card;
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

        // Update relative coordinates
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
    const card = document.createElement('section');
    card.className = 'settings-card display-details-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    header.innerHTML = `
      <div class="card-header-icon">⚙️</div>
      <div class="card-header-text">
        <h3 class="card-title">${this.escapeHtml(display.name)} Settings</h3>
        <p class="card-description">Adjust resolution, orientation, refresh rate, and scaling for this monitor.</p>
      </div>
    `;
    card.appendChild(header);

    const form = document.createElement('div');
    form.className = 'display-form-grid';

    // 1. Resolution Dropdown
    const resGroup = document.createElement('div');
    resGroup.className = 'form-group';
    resGroup.innerHTML = `<label class="form-label">Resolution</label>`;

    const resSelect = document.createElement('select');
    resSelect.className = 'select-input';

    const modes = display.availableModes || [];
    // Group unique resolutions
    const uniqueResMap = new Map();
    modes.forEach((m) => {
      const key = `${m.width}x${m.height}`;
      if (!uniqueResMap.has(key)) uniqueResMap.set(key, m);
    });

    uniqueResMap.forEach((m, key) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `${m.width} × ${m.height}${m.width === display.currentMode.width && m.height === display.currentMode.height ? ' (Current)' : ''}`;
      if (m.width === display.currentMode.width && m.height === display.currentMode.height) {
        opt.selected = true;
      }
      resSelect.appendChild(opt);
    });

    resSelect.addEventListener('change', (e) => {
      const [w, h] = e.target.value.split('x').map(Number);
      this.recordChange(display.id, { width: w, height: h });
      display.currentMode.width = w;
      display.currentMode.height = h;
      display.geometry.width = w;
      display.geometry.height = h;
    });

    resGroup.appendChild(resSelect);
    form.appendChild(resGroup);

    // 2. Refresh Rate Selector
    const refreshGroup = document.createElement('div');
    refreshGroup.className = 'form-group';
    refreshGroup.innerHTML = `<label class="form-label">Refresh Rate</label>`;

    const refreshSelect = document.createElement('select');
    refreshSelect.className = 'select-input';

    const availableRates = [60, 75, 120, 144, 165, 240];
    const currentRate = Math.round(display.currentMode.refreshRate || 60);

    availableRates.forEach((rate) => {
      const opt = document.createElement('option');
      opt.value = rate;
      opt.textContent = `${rate} Hz`;
      if (rate === currentRate) opt.selected = true;
      refreshSelect.appendChild(opt);
    });

    refreshSelect.addEventListener('change', (e) => {
      const rate = parseFloat(e.target.value);
      this.recordChange(display.id, { refreshRate: rate });
      display.currentMode.refreshRate = rate;
    });

    refreshGroup.appendChild(refreshSelect);
    form.appendChild(refreshGroup);

    // 3. DPI Scaling (100%, 125%, 150%, 200%)
    const scaleGroup = document.createElement('div');
    scaleGroup.className = 'form-group';
    scaleGroup.innerHTML = `<label class="form-label">Scale (DPI)</label>`;

    const scaleSelect = document.createElement('select');
    scaleSelect.className = 'select-input';

    const scales = [
      { factor: 1.0, label: '100% (Standard)' },
      { factor: 1.25, label: '125%' },
      { factor: 1.5, label: '150% (Recommended)' },
      { factor: 1.75, label: '175%' },
      { factor: 2.0, label: '200% (HiDPI)' },
    ];

    scales.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.factor;
      opt.textContent = s.label;
      if (Math.abs(s.factor - (display.scaleFactor || 1.0)) < 0.05) {
        opt.selected = true;
      }
      scaleSelect.appendChild(opt);
    });

    scaleSelect.addEventListener('change', (e) => {
      const factor = parseFloat(e.target.value);
      this.recordChange(display.id, { scale: factor });
      display.scaleFactor = factor;
    });

    scaleGroup.appendChild(scaleSelect);
    form.appendChild(scaleGroup);

    // 4. Orientation
    const orientGroup = document.createElement('div');
    orientGroup.className = 'form-group';
    orientGroup.innerHTML = `<label class="form-label">Orientation</label>`;

    const orientSelect = document.createElement('select');
    orientSelect.className = 'select-input';

    const orientations = [
      { id: 'normal', label: 'Landscape' },
      { id: 'rotate90', label: 'Portrait (90°)' },
      { id: 'rotate180', label: 'Landscape (Flipped 180°)' },
      { id: 'rotate270', label: 'Portrait (Flipped 270°)' },
    ];

    orientations.forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.label;
      if (display.orientation === o.id) opt.selected = true;
      orientSelect.appendChild(opt);
    });

    orientSelect.addEventListener('change', (e) => {
      const orient = e.target.value;
      this.recordChange(display.id, { orientation: orient });
      display.orientation = orient;
    });

    orientGroup.appendChild(orientSelect);
    form.appendChild(orientGroup);

    card.appendChild(form);

    // 5. Primary Display Toggle & Apply Action Bar
    const footer = document.createElement('div');
    footer.className = 'display-action-bar';

    const primaryCheckLabel = document.createElement('label');
    primaryCheckLabel.className = 'toggle-checkbox-label';

    const primaryCheckbox = document.createElement('input');
    primaryCheckbox.type = 'checkbox';
    primaryCheckbox.checked = !!display.isPrimary;
    primaryCheckbox.disabled = !!display.isPrimary; // Cannot uncheck primary if already primary

    primaryCheckbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        this.displays.forEach((d) => { d.isPrimary = (d.id === display.id); });
        this.recordChange(display.id, { isPrimary: true });
        this.render(this.container, this.controller.searchQuery);
      }
    });

    primaryCheckLabel.appendChild(primaryCheckbox);
    const primarySpan = document.createElement('span');
    primarySpan.textContent = ' Make this my primary display';
    primaryCheckLabel.appendChild(primarySpan);

    const btnGroup = document.createElement('div');
    btnGroup.className = 'btn-group';

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'btn btn-accent';
    applyBtn.textContent = 'Apply Changes';
    applyBtn.addEventListener('click', () => this.applyDisplayConfig(display.id));

    btnGroup.appendChild(applyBtn);

    footer.appendChild(primaryCheckLabel);
    footer.appendChild(btnGroup);
    card.appendChild(footer);

    return card;
  }

  recordChange(displayId, delta) {
    if (!this.pendingChanges[displayId]) {
      this.pendingChanges[displayId] = {};
    }
    Object.assign(this.pendingChanges[displayId], delta);
  }

  async applyDisplayConfig(displayId) {
    const config = Object.assign({ displayId }, this.pendingChanges[displayId] || {});

    // Try bro.displays.testConfig or applyConfig
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

    // Fallback simulate test mode
    this.startCountdown(10);
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

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
