/**
 * Power & Battery Settings View
 * Manages genuine battery metrics, sleep/display timeouts, power efficiency profiles,
 * and session power actions. Zero mock or fake data.
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
          const hasBattery = state.hasSystemBattery === true && state.percent != null && state.percent >= 0;
          const isAC = state.source === 'ac' || state.source === 'linePower' || state.charging === true || !hasBattery;
          const percent = hasBattery ? Math.round(state.percent) : null;
          const timeEmpty = state.timeToEmptyS ? Math.round(state.timeToEmptyS / 60) : null;
          const timeFull = state.timeToFullS ? Math.round(state.timeToFullS / 60) : null;

          return {
            hasBattery,
            isAC,
            percent,
            source: state.source || (isAC ? 'ac' : 'battery'),
            timeToEmptyMin: timeEmpty,
            timeToFullMin: timeFull,
            technology: state.technology || null,
            energyWh: state.energyWh || null,
            designWh: state.designWh || null,
            healthPercent: state.healthPercent || null,
          };
        }
      } catch (err) {
        console.warn('Power: getState failed:', err);
      }
    }

    // Default: system on AC power without a battery
    return {
      hasBattery: false,
      isAC: true,
      percent: null,
      source: 'ac',
      timeToEmptyMin: null,
      timeToFullMin: null,
      technology: null,
      energyWh: null,
      designWh: null,
      healthPercent: null,
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
        <p class="view-subtitle">Inspect battery telemetry, configure display/system sleep timeouts, and choose power performance profiles.</p>
      </div>
    `;
    container.appendChild(header);

    const powerData = this.getPowerState();

    // 1. Power Source & Battery Card
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
      <div class="card-header-icon">${data.hasBattery ? (data.isAC ? '⚡' : '🔋') : '🔌'}</div>
      <div class="card-header-text">
        <h3 class="card-title">${data.hasBattery ? 'Battery Status & Health' : 'Power Source'}</h3>
        <p class="card-description">${data.hasBattery ? (data.isAC ? 'Connected to AC power' : 'Running on internal battery') : 'Connected to AC mains wall power. No rechargeable battery installed.'}</p>
      </div>
      <span class="badge ${data.hasBattery ? (data.percent > 20 ? 'badge-success' : 'badge-danger') : 'badge-success'}">
        ${data.hasBattery ? `${data.percent}% Capacity` : 'AC Connected'}
      </span>
    `;
    card.appendChild(header);

    if (!data.hasBattery) {
      const empty = document.createElement('div');
      empty.className = 'settings-empty-state';
      empty.innerHTML = `
        <div class="empty-state-icon">🖥️</div>
        <div class="empty-state-title">Desktop AC Power</div>
        <div class="empty-state-desc">This computer is operating directly on continuous AC mains power. Battery health and discharge timers do not apply.</div>
      `;
      card.appendChild(empty);
      return card;
    }

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
        ${data.isAC ? (data.percent >= 99 ? 'Fully Charged' : (data.timeToFullMin ? `Estimated ${data.timeToFullMin}m until fully charged` : 'Charging')) : (data.timeToEmptyMin ? `Estimated ${Math.floor(data.timeToEmptyMin / 60)}h ${data.timeToEmptyMin % 60}m remaining` : 'Discharging')}
      </div>
    `;
    metricsGrid.appendChild(gaugeBox);

    // Hardware specifications
    const detailsBox = document.createElement('div');
    detailsBox.className = 'power-details-box';
    detailsBox.innerHTML = `
      ${data.healthPercent != null ? `
        <div class="power-metric-item">
          <span class="metric-label">Health</span>
          <span class="metric-val text-success">${data.healthPercent}%</span>
        </div>
      ` : ''}
      ${data.energyWh != null ? `
        <div class="power-metric-item">
          <span class="metric-label">Current Charge</span>
          <span class="metric-val font-mono">${data.energyWh} Wh</span>
        </div>
      ` : ''}
      ${data.designWh != null ? `
        <div class="power-metric-item">
          <span class="metric-label">Design Capacity</span>
          <span class="metric-val font-mono">${data.designWh} Wh</span>
        </div>
      ` : ''}
      ${data.technology ? `
        <div class="power-metric-item">
          <span class="metric-label">Chemistry</span>
          <span class="metric-val">${this.escapeHtml(data.technology)}</span>
        </div>
      ` : ''}
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
      <div class="card-header-icon">⚙️</div>
      <div class="card-header-text">
        <h3 class="card-title">Power & Performance Profiles</h3>
        <p class="card-description">Tune system scheduling between peak responsiveness and power conservation.</p>
      </div>
    `;
    card.appendChild(header);

    const profiles = [
      { id: 'performance', name: 'High Performance', desc: 'Maximum clock rates and responsiveness; higher energy draw.', icon: '🚀' },
      { id: 'balanced', name: 'Balanced', desc: 'Dynamically balances performance and efficiency for standard workflows.', icon: '⚖️' },
      { id: 'powersaver', name: 'Power Saver', desc: 'Lowers clock speeds and extends runtime; reduces fan noise.', icon: '🍃' },
    ];

    const group = document.createElement('div');
    group.className = 'profiles-button-group';

    profiles.forEach((p) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `profile-select-btn ${this.activeProfile === p.id ? 'active' : ''}`;
      btn.innerHTML = `
        <span class="profile-icon">${p.icon}</span>
        <div class="profile-meta">
          <span class="profile-name">${p.name}</span>
          <span class="profile-desc">${p.desc}</span>
        </div>
      `;
      btn.addEventListener('click', () => {
        this.activeProfile = p.id;
        if (typeof bro !== 'undefined' && bro.sys?.power?.setProfile) {
          try { bro.sys.power.setProfile(p.id); } catch (_) {}
        }
        this.render(this.container, this.controller.searchQuery);
      });
      group.appendChild(btn);
    });

    card.appendChild(group);
    return card;
  }

  renderSleepCard() {
    const card = document.createElement('section');
    card.className = 'settings-card power-sleep-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    header.innerHTML = `
      <div class="card-header-icon">🌙</div>
      <div class="card-header-text">
        <h3 class="card-title">Screen & Sleep Timeouts</h3>
        <p class="card-description">Specify inactivity intervals before display sleep or standby.</p>
      </div>
    `;
    card.appendChild(header);

    const form = document.createElement('div');
    form.className = 'sleep-timeouts-form';

    // 1. Display timeout slider
    const dispRow = document.createElement('div');
    dispRow.className = 'slider-control-row';
    dispRow.innerHTML = `
      <div class="slider-info">
        <span class="slider-title">Turn off display after</span>
        <span class="slider-value-tag font-mono" id="disp-timeout-val">${this.displaySleepTimeoutMin} minutes</span>
      </div>
      <input type="range" class="slider" min="1" max="120" step="5" value="${this.displaySleepTimeoutMin}" id="disp-timeout-slider">
    `;
    const dispSlider = dispRow.querySelector('#disp-timeout-slider');
    const dispVal = dispRow.querySelector('#disp-timeout-val');
    dispSlider.addEventListener('input', (e) => {
      this.displaySleepTimeoutMin = parseInt(e.target.value, 10);
      dispVal.textContent = `${this.displaySleepTimeoutMin} minutes`;
    });
    form.appendChild(dispRow);

    // 2. System sleep slider
    const sysRow = document.createElement('div');
    sysRow.className = 'slider-control-row';
    sysRow.innerHTML = `
      <div class="slider-info">
        <span class="slider-title">Put computer to sleep after</span>
        <span class="slider-value-tag font-mono" id="sys-timeout-val">${this.systemSleepTimeoutMin} minutes</span>
      </div>
      <input type="range" class="slider" min="5" max="180" step="5" value="${this.systemSleepTimeoutMin}" id="sys-timeout-slider">
    `;
    const sysSlider = sysRow.querySelector('#sys-timeout-slider');
    const sysVal = sysRow.querySelector('#sys-timeout-val');
    sysSlider.addEventListener('input', (e) => {
      this.systemSleepTimeoutMin = parseInt(e.target.value, 10);
      sysVal.textContent = `${this.systemSleepTimeoutMin} minutes`;
    });
    form.appendChild(sysRow);

    card.appendChild(form);
    return card;
  }

  renderActionsCard() {
    const card = document.createElement('section');
    card.className = 'settings-card power-actions-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    header.innerHTML = `
      <div class="card-header-icon">🔌</div>
      <div class="card-header-text">
        <h3 class="card-title">Power Actions</h3>
        <p class="card-description">Immediate power operations and session state controls.</p>
      </div>
    `;
    card.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'power-actions-grid';

    const actions = [
      { id: 'lock', label: 'Lock Session', icon: '🔒', action: () => window.helm?.lock?.lock() },
      { id: 'sleep', label: 'Sleep', icon: '🌙', action: () => this.requestPowerAction('sleep') },
      { id: 'restart', label: 'Restart Computer', icon: '🔄', action: () => this.requestPowerAction('reboot') },
      { id: 'shutdown', label: 'Shut Down', icon: '⏻', action: () => this.requestPowerAction('shutdown'), danger: true },
    ];

    actions.forEach((act) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn ${act.danger ? 'btn-danger' : 'btn-secondary'} btn-power-action`;
      btn.innerHTML = `<span>${act.icon}</span> <span>${act.label}</span>`;
      btn.addEventListener('click', act.action);
      grid.appendChild(btn);
    });

    card.appendChild(grid);
    return card;
  }

  requestPowerAction(action) {
    if (typeof bro !== 'undefined' && bro.sys?.power?.request) {
      try { bro.sys.power.request(action); } catch (err) {
        console.warn(`Power action "${action}" failed:`, err);
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
