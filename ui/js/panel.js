/**
 * Helm Desktop Panel Controller
 * Manages the top status bar, digital clock, quick status popups,
 * and system tray integrations.
 */

import { MediaController } from './media.js';

export class PanelController {
  constructor() {
    this.clockInterval = null;
    this.currentPopup = null;
    this.activeAudioDeviceId = null;
    this.isMuted = false;
    this.media = new MediaController();
  }

  init() {
    this.setupClock();
    this.setupPopups();
    this.setupAudio();
    this.setupNetwork();
    this.setupPower();
    this.setupTray();
    this.media.init();
    this.setupSystemListeners();
  }

  /* -------------------------------------------------------------------------
   * Digital Clock & Date
   * ---------------------------------------------------------------------- */
  setupClock() {
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
  }

  updateClock() {
    const timeEl = document.getElementById('panel-clock-time');
    const dateEl = document.getElementById('panel-clock-date');
    if (!timeEl || !dateEl) return;

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    timeEl.textContent = `${hours}:${minutes}`;

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    dateEl.textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
  }

  /* -------------------------------------------------------------------------
   * Quick Settings Popups
   * ---------------------------------------------------------------------- */
  setupPopups() {
    const popups = {
      'btn-quick-volume': 'popup-volume',
      'btn-quick-net': 'popup-network',
      'btn-quick-battery': 'popup-power',
    };

    for (const [btnId, popupId] of Object.entries(popups)) {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.togglePopup(popupId);
        });
      }
    }

    document.addEventListener('click', (e) => {
      if (this.currentPopup) {
        const popupEl = document.getElementById(this.currentPopup);
        if (popupEl && !popupEl.contains(e.target)) {
          this.closePopups();
        }
      }
    });
  }

  togglePopup(popupId) {
    if (this.currentPopup === popupId) {
      this.closePopups();
      return;
    }

    this.closePopups();
    const popupEl = document.getElementById(popupId);
    if (popupEl) {
      popupEl.classList.remove('hidden');
      this.currentPopup = popupId;
    }
  }

  closePopups() {
    if (this.currentPopup) {
      const popupEl = document.getElementById(this.currentPopup);
      if (popupEl) popupEl.classList.add('hidden');
      this.currentPopup = null;
    }
  }

  /* -------------------------------------------------------------------------
   * Audio Subsystem Integration (bro.pulse with bro.sys.audio fallback)
   * ---------------------------------------------------------------------- */
   setupAudio() {
    const slider = document.getElementById('vol-slider');
    const muteBtn = document.getElementById('vol-mute-btn');

    if (slider) {
      slider.addEventListener('input', (e) => {
        const vol = parseFloat(e.target.value) / 100.0;
        this.setAudioVolume(vol);
      });
    }

    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        this.toggleAudioMute();
      });
    }

    this.updateAudioState();
  }

  updateAudioState() {
    const textEl = document.getElementById('text-volume');
    const iconEl = document.getElementById('icon-volume');
    const slider = document.getElementById('vol-slider');
    const muteBtn = document.getElementById('vol-mute-btn');
    const devInfo = document.getElementById('vol-device-name');

    // 1. Prefer Tier-1 bropulse PipeWire/PulseAudio client
    if (typeof bro !== 'undefined' && bro.pulse && bro.pulse.available) {
      try {
        const sinks = bro.pulse.getSinks();
        if (Array.isArray(sinks) && sinks.length > 0) {
          const defaultSink = bro.pulse.getDefaultSink() || sinks.find((s) => s.isDefault) || sinks[0];
          if (defaultSink) {
            this.activeAudioDeviceId = defaultSink.id;
            this.isMuted = !!defaultSink.isMuted;
            const pct = Math.round((defaultSink.volume ?? 0.8) * 100);

            if (textEl) textEl.textContent = `${pct}%`;
            if (iconEl) iconEl.textContent = this.isMuted ? '🔇' : (pct === 0 ? '🔈' : (pct < 50 ? '🔉' : '🔊'));
            if (slider) slider.value = pct;
            if (muteBtn) muteBtn.textContent = this.isMuted ? 'Unmute' : 'Mute';
            if (devInfo) devInfo.textContent = defaultSink.description || defaultSink.name || 'Default Sink';
            return;
          }
        }
      } catch (_) {}
    }

    // 2. Fall back to bro.sys.audio
    if (typeof bro !== 'undefined' && bro.sys?.audio?.getState) {
      try {
        const state = bro.sys.audio.getState();
        if (state && Array.isArray(state.devices)) {
          const outDev = state.devices.find((d) => d.id === state.defaultOutput) || state.devices[0];
          if (outDev) {
            this.activeAudioDeviceId = outDev.id;
            this.isMuted = !!outDev.muted;
            const pct = Math.round((outDev.volume || 0.8) * 100);

            if (textEl) textEl.textContent = `${pct}%`;
            if (iconEl) iconEl.textContent = this.isMuted ? '🔇' : (pct === 0 ? '🔈' : (pct < 50 ? '🔉' : '🔊'));
            if (slider) slider.value = pct;
            if (muteBtn) muteBtn.textContent = this.isMuted ? 'Unmute' : 'Mute';
            if (devInfo) devInfo.textContent = outDev.description || outDev.deviceName || 'Default Output';
            return;
          }
        }
      } catch (_) {}
    }

    // Default fallback values
    if (textEl) textEl.textContent = '80%';
    if (iconEl) iconEl.textContent = '🔊';
  }

  setAudioVolume(vol) {
    const pct = Math.round(vol * 100);
    const textEl = document.getElementById('text-volume');
    const iconEl = document.getElementById('icon-volume');
    if (textEl) textEl.textContent = `${pct}%`;
    if (iconEl) iconEl.textContent = pct === 0 ? '🔈' : (pct < 50 ? '🔉' : '🔊');

    if (typeof bro !== 'undefined' && bro.pulse && bro.pulse.available && this.activeAudioDeviceId != null) {
      try {
        bro.pulse.setSinkVolume(this.activeAudioDeviceId, vol);
        return;
      } catch (_) {}
    }

    if (typeof bro !== 'undefined' && bro.sys?.audio?.setVolume && this.activeAudioDeviceId) {
      try {
        bro.sys.audio.setVolume(this.activeAudioDeviceId, vol);
      } catch (_) {}
    }
  }

  toggleAudioMute() {
    this.isMuted = !this.isMuted;
    const muteBtn = document.getElementById('vol-mute-btn');
    const iconEl = document.getElementById('icon-volume');
    if (muteBtn) muteBtn.textContent = this.isMuted ? 'Unmute' : 'Mute';
    if (iconEl) iconEl.textContent = this.isMuted ? '🔇' : '🔊';

    if (typeof bro !== 'undefined' && bro.pulse && bro.pulse.available && this.activeAudioDeviceId != null) {
      try {
        bro.pulse.setSinkMuted(this.activeAudioDeviceId, this.isMuted);
        return;
      } catch (_) {}
    }

    if (typeof bro !== 'undefined' && bro.sys?.audio?.setMuted && this.activeAudioDeviceId) {
      try {
        bro.sys.audio.setMuted(this.activeAudioDeviceId, this.isMuted);
      } catch (_) {}
    }
  }

  /* -------------------------------------------------------------------------
   * Network Subsystem Integration (bro.sys.network)
   * ---------------------------------------------------------------------- */
  setupNetwork() {
    this.updateNetworkState();
  }

  updateNetworkState() {
    const textEl = document.getElementById('text-net');
    const iconEl = document.getElementById('icon-net');
    const detailEl = document.getElementById('net-detail-text');
    const ipEl = document.getElementById('net-ip-text');

    if (typeof bro !== 'undefined' && bro.sys?.network?.getState) {
      try {
        const state = bro.sys.network.getState();
        if (state && Array.isArray(state.devices)) {
          const primary = state.devices.find((d) => d.isPrimary) || state.devices[0];
          if (primary) {
            const isWifi = primary.type === 'wifi';
            if (iconEl) iconEl.textContent = isWifi ? '📶' : '🌐';
            if (textEl) textEl.textContent = isWifi ? 'Wi-Fi' : 'Ethernet';
            if (detailEl) detailEl.textContent = `${primary.description || primary.interfaceName} (${primary.state})`;
            if (ipEl && primary.ipv4?.addresses?.length > 0) {
              ipEl.textContent = `IP: ${primary.ipv4.addresses[0]}`;
            }
            return;
          }
        }
      } catch (_) {}
    }

    if (textEl) textEl.textContent = 'Connected';
    if (iconEl) iconEl.textContent = '📶';
  }

  /* -------------------------------------------------------------------------
   * Power Subsystem Integration (bro.sys.power)
   * ---------------------------------------------------------------------- */
  setupPower() {
    const lockBtn = document.getElementById('power-btn-lock');
    const suspendBtn = document.getElementById('power-btn-suspend');
    const restartBtn = document.getElementById('power-btn-restart');
    const shutdownBtn = document.getElementById('power-btn-shutdown');

    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        this.closePopups();
        if (window.helm?.lock) window.helm.lock.lock();
      });
    }

    if (suspendBtn) {
      suspendBtn.addEventListener('click', () => {
        this.closePopups();
        this.requestPowerAction('suspend');
      });
    }

    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        this.closePopups();
        this.requestPowerAction('reboot');
      });
    }

    if (shutdownBtn) {
      shutdownBtn.addEventListener('click', () => {
        this.closePopups();
        this.requestPowerAction('powerOff');
      });
    }

    this.updatePowerState();
  }

  updatePowerState() {
    const textEl = document.getElementById('text-battery');
    const iconEl = document.getElementById('icon-battery');
    const statusEl = document.getElementById('power-battery-text');

    if (typeof bro !== 'undefined' && bro.sys?.power?.getState) {
      try {
        const state = bro.sys.power.getState();
        if (state) {
          const pct = state.percent != null ? Math.round(state.percent) : 100;
          const isAC = state.source === 'ac' || state.source === 'linePower';
          if (textEl) textEl.textContent = `${pct}%`;
          if (iconEl) iconEl.textContent = isAC ? '⚡' : (pct < 20 ? '🪫' : '🔋');
          if (statusEl) {
            statusEl.textContent = `Battery: ${pct}% (${isAC ? 'AC Connected' : 'On Battery'})`;
          }
          return;
        }
      } catch (_) {}
    }

    if (textEl) textEl.textContent = '100%';
    if (iconEl) iconEl.textContent = '🔋';
  }

  requestPowerAction(action) {
    if (typeof bro !== 'undefined' && bro.sys?.power?.request) {
      try {
        bro.sys.power.request(action);
      } catch (err) {
        console.warn(`Power request ${action} failed:`, err);
      }
    }
  }

  /* -------------------------------------------------------------------------
   * System Tray Integration (bro.sys.tray)
   * ---------------------------------------------------------------------- */
  setupTray() {
    if (typeof bro !== 'undefined' && bro.sys?.tray) {
      try {
        if (typeof bro.sys.tray.start === 'function') {
          bro.sys.tray.start();
        }
        this.renderTrayItems();
        if (typeof bro.sys.tray.on === 'function') {
          bro.sys.tray.on('itemAdded', () => this.renderTrayItems());
          bro.sys.tray.on('itemUpdated', () => this.renderTrayItems());
          bro.sys.tray.on('itemRemoved', () => this.renderTrayItems());
        }
      } catch (_) {}
    }
  }

  renderTrayItems() {
    const trayContainer = document.getElementById('system-tray');
    if (!trayContainer || typeof bro === 'undefined' || !bro.sys?.tray?.getItems) return;

    try {
      const items = bro.sys.tray.getItems() || [];
      trayContainer.innerHTML = '';
      for (const item of items) {
        if (item.hidden) continue;
        const itemEl = document.createElement('div');
        itemEl.className = 'tray-item';
        itemEl.title = item.tooltip?.title || item.title || item.id;
        itemEl.textContent = '📌';
        itemEl.addEventListener('click', (e) => {
          if (typeof bro.sys.tray.activate === 'function') {
            bro.sys.tray.activate(item.id, e.clientX, e.clientY);
          }
        });
        trayContainer.appendChild(itemEl);
      }
    } catch (_) {}
  }

  /* -------------------------------------------------------------------------
   * Reactive Subsystem Event Listeners
   * ---------------------------------------------------------------------- */
  setupSystemListeners() {
    if (typeof bro !== 'undefined' && bro.pulse && bro.pulse.available && typeof bro.pulse.on === 'function') {
      try {
        bro.pulse.on('sinkUpdated', () => this.updateAudioState());
        bro.pulse.on('sinkAdded', () => this.updateAudioState());
        bro.pulse.on('sinkRemoved', () => this.updateAudioState());
        bro.pulse.on('defaultSinkChanged', () => this.updateAudioState());
      } catch (_) {}
    }

    if (typeof bro === 'undefined' || !bro.sys?.on) return;

    try {
      bro.sys.on('audio:stateChanged', () => this.updateAudioState());
      bro.sys.on('network:stateChanged', () => this.updateNetworkState());
      bro.sys.on('power:stateChanged', () => this.updatePowerState());
    } catch (_) {}
  }

  destroy() {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
  }
}
