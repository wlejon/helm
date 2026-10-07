/**
 * Power & Battery Settings View
 * Manages battery metrics, sleep/display timeouts, power efficiency profiles,
 * and session power actions.
 */

export class PowerView {
  constructor(controller) {
    this.controller = controller;
    this.container = null;
    this.activeProfile = 'balanced';
    this.displaySleepTimeoutMin = 10;
    this.systemSleepTimeoutMin = 30;
  }

  init() {
    if (typeof bro !== 'undefined' && bro.sys?.power && typeof bro.sys.power.on === 'function') {
      try {
        bro.sys.power.on('changed', () => this.refresh());
        bro.sys.power.on('powerChanged', () => this.refresh());
      } catch (_) {}
    }
  }

  refresh() {
    if (this.container && this.controller.activeCategory === 'power' && this.controller.isOpen) {
      this.render(this.container, this.controller.searchQuery);
    }
  }

  hasSearchMatches(query) {
    const q = query.toLowerCase();
    const terms = ['power', 'battery', 'charge', 'charging', 'sleep', 'timeout', 'energy', 'profile', 'saver', 'performance', 'suspend'];
    return terms.some((t) => t.includes(q));
  }

  /* -------------------------------------------------------------------------
   * Data Loading
   * ---------------------------------------------------------------------- */

  getPowerState() {
    if (typeof bro !== 'undefined' && bro.sys?.power?.getState) {
      try {
        const state = bro.sys.power.getState();
        if (state) {
          const isAC = state.source === 'ac' || state.source === 'linePower';
          const percent = state.percent != null ? Math.round(state.percent) : 95;
          const timeEmpty = state.timeToEmptyS ? Math.round(state.timeToEmptyS / 60) : 340;
          const timeFull = state.timeToFullS ? Math.round(state.timeToFullS / 60) : 0;

          return {
            percent,
            isAC,
            source: state.source || 'ac',
            timeToEmptyMin: timeEmpty,
            timeToFullMin: timeFull,
            technology: 'Lithium-Ion Polymer',
            energyWh: 78.4,
            designWh: 82.0,
            healthPercent: 96,
            hasBattery: state.hasSystemBattery !== false,
          };
        }
      } catch (err) {
        console.warn('Power: getState failed:', err);
      }
    }

    // Default simulated battery state
    return {
      percent: 94,
      isAC: true,
      source: 'ac',
      timeToEmptyMin: 380,
      timeToFullMin: 25,
      technology: 'Lithium-Ion Polymer',
      energyWh: 78.4,
      designWh: 82.0,
      healthPercent: 96,
      hasBattery: true,
    };
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
        <h2 class="view-title">Power & Battery</h2>
        <p class="view-subtitle">Inspect battery health, configure screen/system sleep timeouts, and choose power performance profiles.</p>
      </div>
    `;
    container.appendChild(header);

    const powerData = this.getPowerState();

    // 1. Battery Health & Gauge Card
    const batteryCard = this.renderBatteryCard(powerData);
    container.appendChild(batteryCard);

    // 2. Power Profiles Selector Card
    const profileCard = this.renderProfileCard();
    container.appendChild(profileCard);

    // 3. Sleep & Inactivity Timeouts Card
    const sleepCard = this.renderSleepCard();
    container.appendChild(sleepCard);

    // 4. Power Actions Grid Card
    const actionsCard = this.renderActionsCard();
    container.appendChild(actionsCard);
  }

  renderBatteryCard(data) {
    const card = document.createElement('section');
    card.className = 'settings-card power-battery-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    header.innerHTML = `
      <div class="card-header-icon">${data.isAC ? '⚡' : '🔋'}</div>
      <div class="card-header-text">
        <h3 class="card-title">Battery Status & Health</h3>
        <p class="card-description">${data.isAC ? 'Connected to AC power • Adapter supplying full charge' : 'Running on internal battery'}</p>
      </div>
      <span class="badge ${data.percent > 20 ? 'badge-success' : 'badge-danger'}">
        ${data.percent}% Capacity
      </span>
    `;
    card.appendChild(header);

    const metricsGrid = document.createElement('div');
    metricsGrid.className = 'power-metrics-grid';

    // Battery gauge visualization
    const gaugeBox = document.createElement('div');
    gaugeBox.className = 'power-gauge-box';
    gaugeBox.innerHTML = `
      <div class="battery-visual-shell">
        <div class="battery-terminal"></div>
        <div class="battery-visual-level" style="width: ${data.percent}%;"></div>
        <span class="battery-visual-text">${data.percent}%</span>
      </div>
      <div class="battery-sub-estimate">
        ${data.isAC ? (data.percent >= 99 ? 'Fully Charged' : `Estimated ${data.timeToFullMin}m until fully charged`) : `Estimated ${Math.floor(data.timeToEmptyMin / 60)}h ${data.timeToEmptyMin % 60}m remaining`}
      </div>
    `;
    metricsGrid.appendChild(gaugeBox);

    // Hardware specifications
    const detailsBox = document.createElement('div');
    detailsBox.className = 'power-details-box';
    detailsBox.innerHTML = `
      <div class="power-metric-item">
        <span class="metric-label">Health</span>
        <span class="metric-val text-success">${data.healthPercent}% (Normal)</span>
      </div>
      <div class="power-metric-item">
        <span class="metric-label">Current Charge</span>
        <span class="metric-val font-mono">${data.energyWh} Wh</span>
      </div>
      <div class="power-metric-item">
        <span class="metric-label">Design Capacity</span>
        <span class="metric-val font-mono">${data.designWh} Wh</span>
      </div>
      <div class="power-metric-item">
        <span class="metric-label">Chemistry</span>
        <span class="metric-val">${this.escapeHtml(data.technology)}</span>
      </div>
    `;
    metricsGrid.appendChild(detailsBox);

    card.appendChild(metricsGrid);
    return card;
  }

  renderProfileCard() {
    const card = document.createElement('section');
    card.className = 'settings-card power-profiles-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    header.innerHTML = `
      <div class="card-header-icon">⚖️</div>
      <div class="card-header-text">
        <h3 class="card-title">Power Mode Profile</h3>
        <p class="card-description">Balance performance against power consumption and thermal limits.</p>
      </div>
    `;
    card.appendChild(header);

    const profiles = [
      {
        id: 'performance',
        icon: '🏎️',
        title: 'High Performance',
        desc: 'Uncapped CPU/GPU clock limits for intense 3D, physics, and compilation tasks.',
      },
      {
        id: 'balanced',
        icon: '⚖️',
        title: 'Balanced (Standard)',
        desc: 'Dynamically scales processor frequency according to UI responsiveness demands.',
      },
      {
        id: 'powersaver',
        icon: '🌱',
        title: 'Power Saver',
        desc: 'Lowers screen brightness ceiling, throttles background tasks, and extends battery life.',
      }
    ];

    const grid = document.createElement('div');
    grid.className = 'power-profiles-grid';

    profiles.forEach((p) => {
      const isSelected = this.activeProfile === p.id;
      const item = document.createElement('div');
      item.className = `power-profile-card ${isSelected ? 'active' : ''}`;
      item.dataset.profileId = p.id;
      item.innerHTML = `
        <div class="profile-card-header">
          <span class="profile-icon">${p.icon}</span>
          <span class="profile-name">${p.title}</span>
          ${isSelected ? '<span class="badge badge-accent">Active</span>' : ''}
        </div>
        <p class="profile-desc">${p.desc}</p>
      `;

      item.addEventListener('click', () => {
        this.activeProfile = p.id;
        this.render(this.container, this.controller.searchQuery);
      });

      grid.appendChild(item);
    });

    card.appendChild(grid);
    return card;
  }

  renderSleepCard() {
    const card = document.createElement('section');
    card.className = 'settings-card power-sleep-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    header.innerHTML = `
      <div class="card-header-icon">💤</div>
      <div class="card-header-text">
        <h3 class="card-title">Sleep & Inactivity Timeouts</h3>
        <p class="card-description">Set inactivity intervals before blanking screen or sleeping.</p>
      </div>
    `;
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'sleep-timeouts-body';

    // 1. Display Sleep Slider
    const dispRow = document.createElement('div');
    dispRow.className = 'audio-control-row';

    const dispLabel = document.createElement('span');
    dispLabel.className = 'control-label';
    dispLabel.textContent = 'Turn off display after:';

    const dispSlider = document.createElement('input');
    dispSlider.type = 'range';
    dispSlider.min = '1';
    dispSlider.max = '60';
    dispSlider.value = this.displaySleepTimeoutMin;
    dispSlider.className = 'slider';

    const dispBadge = document.createElement('span');
    dispBadge.className = 'slider-value-badge';
    dispBadge.textContent = `${this.displaySleepTimeoutMin} min`;

    dispSlider.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      this.displaySleepTimeoutMin = v;
      dispBadge.textContent = `${v} min`;
    });

    dispRow.appendChild(dispLabel);
    dispRow.appendChild(dispSlider);
    dispRow.appendChild(dispBadge);
    body.appendChild(dispRow);

    // 2. System Sleep Slider
    const sysRow = document.createElement('div');
    sysRow.className = 'audio-control-row';

    const sysLabel = document.createElement('span');
    sysLabel.className = 'control-label';
    sysLabel.textContent = 'System sleep after:';

    const sysSlider = document.createElement('input');
    sysSlider.type = 'range';
    sysSlider.min = '5';
    sysSlider.max = '120';
    sysSlider.value = this.systemSleepTimeoutMin;
    sysSlider.className = 'slider';

    const sysBadge = document.createElement('span');
    sysBadge.className = 'slider-value-badge';
    sysBadge.textContent = `${this.systemSleepTimeoutMin} min`;

    sysSlider.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      this.systemSleepTimeoutMin = v;
      sysBadge.textContent = `${v} min`;
    });

    sysRow.appendChild(sysLabel);
    sysRow.appendChild(sysSlider);
    sysRow.appendChild(sysBadge);
    body.appendChild(sysRow);

    card.appendChild(body);
    return card;
  }

  renderActionsCard() {
    const card = document.createElement('section');
    card.className = 'settings-card power-actions-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    header.innerHTML = `
      <div class="card-header-icon">⚡</div>
      <div class="card-header-text">
        <h3 class="card-title">Session Power Controls</h3>
        <p class="card-description">Immediate power state transitions and session suspension.</p>
      </div>
    `;
    card.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'power-quick-actions';

    const actions = [
      { id: 'lock', label: 'Lock Session', icon: '🔒', action: () => window.helm?.lock?.lock() },
      { id: 'suspend', label: 'Sleep / Suspend', icon: '💤', action: () => this.requestPowerAction('suspend') },
      { id: 'reboot', label: 'Restart System', icon: '🔄', action: () => this.requestPowerAction('reboot') },
      { id: 'powerOff', label: 'Shut Down', icon: '⏻', danger: true, action: () => this.requestPowerAction('powerOff') },
    ];

    actions.forEach((act) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn ${act.danger ? 'btn-danger' : 'btn-secondary'} power-action-tile`;
      btn.innerHTML = `
        <span class="action-tile-icon">${act.icon}</span>
        <span class="action-tile-label">${act.label}</span>
      `;
      btn.addEventListener('click', act.action);
      grid.appendChild(btn);
    });

    card.appendChild(grid);
    return card;
  }

  requestPowerAction(action) {
    if (typeof bro !== 'undefined' && bro.sys?.power?.request) {
      try {
        bro.sys.power.request(action);
      } catch (err) {
        console.warn(`Power action ${action} failed:`, err);
      }
    }
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
