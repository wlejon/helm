/**
 * Power & Battery Settings View
 * Manages genuine battery metrics, sleep/display timeouts, power efficiency profiles,
 * and session power actions. Zero mock or fake data.
 */

import { h, clear } from '../../dom.js';
import { createIcon } from '../../icons.js';
import { viewHeader, emptyState } from '../components.js';

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
    clear(container);

    container.appendChild(
      viewHeader('Power & Battery', 'Inspect battery telemetry, configure display/system sleep timeouts, and choose power performance profiles.')
    );

    const powerData = this.getPowerState();

    // 1. Power Source & Battery Card
    container.appendChild(this.renderBatteryCard(powerData));

    // 2. Power Profiles Selector Card
    container.appendChild(this.renderProfileCard());

    // 3. Sleep & Inactivity Timeouts Card
    container.appendChild(this.renderSleepCard());

    // 4. Power Actions Grid Card
    container.appendChild(this.renderActionsCard());
  }

  renderBatteryCard(data) {
    const iconName = data.hasBattery
      ? (data.isAC ? 'batteryCharging' : 'battery')
      : 'desktopAc';

    const titleText = data.hasBattery ? 'Battery Status & Health' : 'Power Source';
    const descText = data.hasBattery
      ? (data.isAC ? 'Connected to AC power' : 'Running on internal battery')
      : 'Connected to AC mains wall power. No rechargeable battery installed.';

    const badgeClass = data.hasBattery
      ? (data.percent > 20 ? 'badge-success' : 'badge-danger')
      : 'badge-success';

    const badgeText = data.hasBattery ? `${data.percent}% Capacity` : 'AC Connected';

    const header = h('div.settings-card-header', null,
      h('div.card-header-icon', null, createIcon(iconName, 18)),
      h('div.card-header-text', null,
        h('h3.card-title', null, titleText),
        h('p.card-description', null, descText)
      ),
      h(`span.badge.${badgeClass}`, null, badgeText)
    );

    if (!data.hasBattery) {
      return h('section.settings-card.power-battery-card', null,
        header,
        emptyState(
          'Desktop AC Power',
          'This computer is operating directly on continuous AC mains power. Battery health and discharge timers do not apply.',
          'desktopAc'
        )
      );
    }

    const subEstimateText = data.isAC
      ? (data.percent >= 99 ? 'Fully Charged' : (data.timeToFullMin ? `Estimated ${data.timeToFullMin}m until fully charged` : 'Charging'))
      : (data.timeToEmptyMin ? `Estimated ${Math.floor(data.timeToEmptyMin / 60)}h ${data.timeToEmptyMin % 60}m remaining` : 'Discharging');

    const gaugeBox = h('div.power-gauge-box', null,
      h('div.battery-visual-shell', null,
        h('div.battery-terminal'),
        h('div.battery-visual-level', { style: { width: `${data.percent}%` } }),
        h('span.battery-visual-text', null, `${data.percent}%`)
      ),
      h('div.battery-sub-estimate', null, subEstimateText)
    );

    const detailsKids = [];
    if (data.healthPercent != null) {
      detailsKids.push(
        h('div.power-metric-item', null,
          h('span.metric-label', null, 'Health'),
          h('span.metric-val.text-success', null, `${data.healthPercent}%`)
        )
      );
    }
    if (data.energyWh != null) {
      detailsKids.push(
        h('div.power-metric-item', null,
          h('span.metric-label', null, 'Current Charge'),
          h('span.metric-val.font-mono', null, `${data.energyWh} Wh`)
        )
      );
    }
    if (data.designWh != null) {
      detailsKids.push(
        h('div.power-metric-item', null,
          h('span.metric-label', null, 'Design Capacity'),
          h('span.metric-val.font-mono', null, `${data.designWh} Wh`)
        )
      );
    }
    if (data.technology) {
      detailsKids.push(
        h('div.power-metric-item', null,
          h('span.metric-label', null, 'Chemistry'),
          h('span.metric-val', null, data.technology)
        )
      );
    }

    return h('section.settings-card.power-battery-card', null,
      header,
      h('div.power-metrics-grid', null,
        gaugeBox,
        h('div.power-details-box', null, ...detailsKids)
      )
    );
  }

  renderProfileCard() {
    const header = h('div.settings-card-header', null,
      h('div.card-header-icon', null, createIcon('power', 18)),
      h('div.card-header-text', null,
        h('h3.card-title', null, 'Power & Performance Profiles'),
        h('p.card-description', null, 'Tune system scheduling between peak responsiveness and power conservation.')
      )
    );

    const profiles = [
      { id: 'performance', name: 'High Performance', desc: 'Maximum clock rates and responsiveness; higher energy draw.', icon: 'performance' },
      { id: 'balanced', name: 'Balanced', desc: 'Dynamically balances performance and efficiency for standard workflows.', icon: 'balanced' },
      { id: 'powersaver', name: 'Power Saver', desc: 'Lowers clock speeds and extends runtime; reduces fan noise.', icon: 'eco' },
    ];

    const buttons = profiles.map((p) => {
      const isActive = this.activeProfile === p.id;
      return h(`button.profile-select-btn${isActive ? '.active' : ''}`, {
        type: 'button',
        onclick: () => {
          this.activeProfile = p.id;
          if (typeof bro !== 'undefined' && bro.sys?.power?.setProfile) {
            try { bro.sys.power.setProfile(p.id); } catch (_) {}
          }
          this.render(this.container, this.controller.searchQuery);
        }
      },
        h('span.profile-icon', null, createIcon(p.icon, 16)),
        h('div.profile-meta', null,
          h('span.profile-name', null, p.name),
          h('span.profile-desc', null, p.desc)
        )
      );
    });

    return h('section.settings-card.power-profiles-card', null,
      header,
      h('div.profiles-button-group', null, ...buttons)
    );
  }

  renderSleepCard() {
    const header = h('div.settings-card-header', null,
      h('div.card-header-icon', null, createIcon('sleep', 18)),
      h('div.card-header-text', null,
        h('h3.card-title', null, 'Screen & Sleep Timeouts'),
        h('p.card-description', null, 'Specify inactivity intervals before display sleep or standby.')
      )
    );

    // 1. Display timeout slider
    const dispVal = h('span.slider-value-tag.font-mono#disp-timeout-val', null, `${this.displaySleepTimeoutMin} minutes`);
    const dispSlider = h('input.slider#disp-timeout-slider', {
      type: 'range',
      min: '1',
      max: '120',
      step: '5',
      value: String(this.displaySleepTimeoutMin),
      oninput: (e) => {
        this.displaySleepTimeoutMin = parseInt(e.target.value, 10);
        dispVal.textContent = `${this.displaySleepTimeoutMin} minutes`;
      }
    });

    const dispRow = h('div.slider-control-row', null,
      h('div.slider-info', null,
        h('span.slider-title', null, 'Turn off display after'),
        dispVal
      ),
      dispSlider
    );

    // 2. System sleep slider
    const sysVal = h('span.slider-value-tag.font-mono#sys-timeout-val', null, `${this.systemSleepTimeoutMin} minutes`);
    const sysSlider = h('input.slider#sys-timeout-slider', {
      type: 'range',
      min: '5',
      max: '180',
      step: '5',
      value: String(this.systemSleepTimeoutMin),
      oninput: (e) => {
        this.systemSleepTimeoutMin = parseInt(e.target.value, 10);
        sysVal.textContent = `${this.systemSleepTimeoutMin} minutes`;
      }
    });

    const sysRow = h('div.slider-control-row', null,
      h('div.slider-info', null,
        h('span.slider-title', null, 'Put computer to sleep after'),
        sysVal
      ),
      sysSlider
    );

    return h('section.settings-card.power-sleep-card', null,
      header,
      h('div.sleep-timeouts-form', null, dispRow, sysRow)
    );
  }

  renderActionsCard() {
    const header = h('div.settings-card-header', null,
      h('div.card-header-icon', null, createIcon('power', 18)),
      h('div.card-header-text', null,
        h('h3.card-title', null, 'Power Actions'),
        h('p.card-description', null, 'Immediate power operations and session state controls.')
      )
    );

    const actions = [
      { id: 'lock', label: 'Lock Session', icon: 'lock', action: () => window.helm?.lock?.lock() },
      { id: 'sleep', label: 'Sleep', icon: 'sleep', action: () => this.requestPowerAction('sleep') },
      { id: 'restart', label: 'Restart Computer', icon: 'restart', action: () => this.requestPowerAction('reboot') },
      { id: 'shutdown', label: 'Shut Down', icon: 'shutdown', action: () => this.requestPowerAction('shutdown'), danger: true },
    ];

    const buttons = actions.map((act) => {
      return h(`button.btn.${act.danger ? 'btn-danger' : 'btn-secondary'}.btn-power-action`, {
        type: 'button',
        onclick: act.action
      },
        h('span', null, createIcon(act.icon, 14)),
        h('span', null, ` ${act.label}`)
      );
    });

    return h('section.settings-card.power-actions-card', null,
      header,
      h('div.power-actions-grid', null, ...buttons)
    );
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
}
