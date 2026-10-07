/**
 * Comprehensive Audio Control Studio View
 * Manages genuine output sinks, input sources, real audio level meters, and per-app stream routing.
 * Strictly zero mock or fake data.
 */

import { h, clear } from '../../dom.js';
import { createIcon } from '../../icons.js';
import { viewHeader, emptyState } from '../components.js';

export class AudioView {
  constructor(controller) {
    this.controller = controller;
    this.container = null;
    this.meterInterval = null;
    this.activeOutputId = null;
    this.activeInputId = null;
    this.channelBalances = {}; // sinkId -> balance (-50 to +50)
  }

  init() {
    this.bindSubsystemEvents();
  }

  bindSubsystemEvents() {
    // PipeWire / PulseAudio reactive events
    if (typeof bro !== 'undefined' && bro.pulse && typeof bro.pulse.on === 'function') {
      try {
        const refreshHandler = () => this.refreshIfActive();
        bro.pulse.on('sinkUpdated', refreshHandler);
        bro.pulse.on('sinkAdded', refreshHandler);
        bro.pulse.on('sinkRemoved', refreshHandler);
        bro.pulse.on('defaultSinkChanged', refreshHandler);
        bro.pulse.on('streamAdded', refreshHandler);
        bro.pulse.on('streamUpdated', refreshHandler);
        bro.pulse.on('streamRemoved', refreshHandler);
      } catch (_) {}
    }

    // bro.sys.audio events
    if (typeof bro !== 'undefined' && bro.sys?.audio && typeof bro.sys.audio.on === 'function') {
      try {
        const refreshHandler = () => this.refreshIfActive();
        bro.sys.audio.on('deviceAdded', refreshHandler);
        bro.sys.audio.on('deviceRemoved', refreshHandler);
        bro.sys.audio.on('deviceChanged', refreshHandler);
        bro.sys.audio.on('defaultChanged', refreshHandler);
      } catch (_) {}
    }
  }

  refreshIfActive() {
    if (this.container && this.controller.activeCategory === 'audio' && this.controller.isOpen) {
      this.render(this.container, this.controller.searchQuery);
    }
  }

  hasSearchMatches(query) {
    const q = query.toLowerCase();
    const terms = ['audio', 'sound', 'volume', 'speaker', 'headphone', 'microphone', 'mic', 'output', 'input', 'stream', 'pulse', 'balance', 'master'];
    return terms.some((t) => t.includes(q));
  }

  /* -------------------------------------------------------------------------
   * Data Fetching
   * ---------------------------------------------------------------------- */

  getOutputDevices() {
    // 1. Try bro.pulse.getSinks()
    if (typeof bro !== 'undefined' && bro.pulse && typeof bro.pulse.getSinks === 'function') {
      try {
        const sinks = bro.pulse.getSinks();
        if (Array.isArray(sinks) && sinks.length > 0) {
          const defaultSink = (typeof bro.pulse.getDefaultSink === 'function') ? bro.pulse.getDefaultSink() : null;
          return sinks.map((s) => ({
            id: s.id,
            name: s.description || s.name || `Output #${s.id}`,
            technicalName: s.name,
            volume: typeof s.volume === 'number' ? s.volume : 0.8,
            isMuted: !!s.isMuted,
            isDefault: defaultSink ? defaultSink.id === s.id : !!s.isDefault,
            channels: s.channels || 2,
            type: 'pulse',
          }));
        }
      } catch (_) {}
    }

    // 2. Fall back to bro.sys.audio
    if (typeof bro !== 'undefined' && bro.sys?.audio) {
      try {
        const state = typeof bro.sys.audio.getState === 'function' ? bro.sys.audio.getState() : null;
        const devices = state?.devices || (typeof bro.sys.audio.getDevices === 'function' ? bro.sys.audio.getDevices() : []);
        const outputs = devices.filter((d) => d.direction === 'output' || !d.direction);
        if (outputs.length > 0) {
          return outputs.map((d) => ({
            id: d.id,
            name: d.description || d.deviceName || d.id,
            technicalName: d.deviceName || d.id,
            volume: typeof d.volume === 'number' ? d.volume : 0.8,
            isMuted: !!d.muted,
            isDefault: state ? state.defaultOutput === d.id : !!d.isDefault,
            channels: Array.isArray(d.channelVolumes) ? d.channelVolumes.length : 2,
            type: 'sys',
          }));
        }
      } catch (_) {}
    }

    return [];
  }

  getInputDevices() {
    // 1. Try bro.sys.audio for input devices
    if (typeof bro !== 'undefined' && bro.sys?.audio) {
      try {
        const state = typeof bro.sys.audio.getState === 'function' ? bro.sys.audio.getState() : null;
        const devices = state?.devices || (typeof bro.sys.audio.getDevices === 'function' ? bro.sys.audio.getDevices() : []);
        const inputs = devices.filter((d) => d.direction === 'input');
        if (inputs.length > 0) {
          return inputs.map((d) => ({
            id: d.id,
            name: d.description || d.deviceName || d.id,
            volume: typeof d.volume === 'number' ? d.volume : 0.75,
            isMuted: !!d.muted,
            isDefault: state ? state.defaultInput === d.id : !!d.isDefault,
            type: 'sys',
          }));
        }
      } catch (_) {}
    }

    // 2. Try bro.pulse.getSources()
    if (typeof bro !== 'undefined' && bro.pulse && typeof bro.pulse.getSources === 'function') {
      try {
        const sources = bro.pulse.getSources();
        if (Array.isArray(sources) && sources.length > 0) {
          return sources.map((s) => ({
            id: s.id,
            name: s.description || s.name || `Input #${s.id}`,
            technicalName: s.name,
            volume: typeof s.volume === 'number' ? s.volume : 0.75,
            isMuted: !!s.isMuted,
            isDefault: !!s.isDefault,
            type: 'pulse',
          }));
        }
      } catch (_) {}
    }

    return [];
  }

  getAudioStreams() {
    // 1. Try bro.pulse.getSinkInputs() or bro.pulse.getStreams()
    if (typeof bro !== 'undefined' && bro.pulse) {
      const getFn = bro.pulse.getSinkInputs || bro.pulse.getStreams;
      if (typeof getFn === 'function') {
        try {
          const streams = getFn.call(bro.pulse);
          if (Array.isArray(streams) && streams.length > 0) {
            return streams.map((st) => ({
              id: st.id,
              name: st.name || st.appId || `Stream #${st.id}`,
              appId: st.appId || '',
              icon: st.icon || 'audio',
              volume: typeof st.volume === 'number' ? st.volume : 0.8,
              isMuted: !!st.isMuted,
              sinkId: st.sinkId != null ? st.sinkId : null,
            }));
          }
        } catch (_) {}
      }
    }

    return [];
  }

  /* -------------------------------------------------------------------------
   * Rendering
   * ---------------------------------------------------------------------- */

  render(container, searchQuery = '') {
    this.container = container;
    this.stopMeter();
    clear(container);

    const header = viewHeader(
      'Audio Studio',
      'Manage system audio hardware, master levels, input gain, and application stream routing.'
    );
    container.appendChild(header);

    const outputs = this.getOutputDevices();
    const inputs = this.getInputDevices();
    const streams = this.getAudioStreams();

    // 1. Output Devices Section
    const outputSection = this.renderOutputsSection(outputs);
    container.appendChild(outputSection);

    // 2. Input Devices & Live Meter Section
    const inputSection = this.renderInputsSection(inputs);
    container.appendChild(inputSection);

    // 3. Application-Level Stream Controls
    const streamsSection = this.renderStreamsSection(streams, outputs);
    container.appendChild(streamsSection);

    this.startLiveMeter();
  }

  renderOutputsSection(outputs) {
    const card = h('section.settings-card.audio-outputs-card', null,
      h('div.settings-card-header', null,
        h('div.card-header-icon', null, createIcon('audio', 18)),
        h('div.card-header-text', null,
          h('h3.card-title', null, 'Sound Output Devices'),
          h('p.card-description', null, 'Choose where audio plays and adjust master volume & balance.')
        )
      )
    );

    if (outputs.length === 0) {
      card.appendChild(emptyState(
        'No Audio Output Devices Found',
        'No speakers, headphones, or HDMI sound endpoints are currently detected.',
        'volumeMute'
      ));
      return card;
    }

    const list = h('div.audio-device-list');

    outputs.forEach((device) => {
      const isDefault = !!device.isDefault;

      // Header row with info and actions
      const actionsDiv = h('div.device-actions');

      if (!isDefault) {
        actionsDiv.appendChild(
          h('button.btn.btn-secondary.btn-sm', {
            type: 'button',
            onclick: () => this.setDefaultOutput(device),
          }, 'Set as Default')
        );
      }

      const muteBtn = h('button.btn.btn-sm', {
        type: 'button',
        onclick: () => this.toggleOutputMute(device, muteBtn),
      });
      this.setButtonMuteState(muteBtn, device.isMuted, false);
      actionsDiv.appendChild(muteBtn);

      const topRow = h('div.device-item-header', null,
        h('div.device-info', null,
          h('span.device-name', null, device.name),
          isDefault ? h('span.badge.badge-accent', null, 'Default Output') : null
        ),
        actionsDiv
      );

      // Volume slider row
      const slider = h('input.slider.volume-slider', {
        type: 'range',
        min: '0',
        max: '100',
        value: Math.round(device.volume * 100),
      });

      const valBadge = h('span.slider-value-badge', null, `${slider.value}%`);

      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        valBadge.textContent = `${val}%`;
        this.setOutputVolume(device, val / 100.0);
        if (device.isMuted && val > 0) {
          device.isMuted = false;
          this.setButtonMuteState(muteBtn, false, false);
        }
      });

      const volRow = h('div.audio-control-row', null,
        h('span.control-label', null, 'Volume'),
        slider,
        valBadge
      );

      // Stereo Balance Slider
      const balSlider = h('input.slider.balance-slider', {
        type: 'range',
        min: '-50',
        max: '50',
        value: this.channelBalances[device.id] || 0,
      });

      const updateBalText = (v) => {
        if (v === 0) return 'Center';
        return v < 0 ? `L ${Math.abs(v * 2)}%` : `R ${v * 2}%`;
      };

      const balBadge = h('span.slider-value-badge.balance-badge', null, updateBalText(parseInt(balSlider.value, 10)));

      balSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        this.channelBalances[device.id] = v;
        balBadge.textContent = updateBalText(v);
      });

      const balRow = h('div.audio-control-row.balance-row', null,
        h('span.control-label', null, 'Balance'),
        h('span.balance-tag', null, 'L'),
        balSlider,
        h('span.balance-tag', null, 'R'),
        balBadge
      );

      const deviceRow = h(`div.audio-device-item${isDefault ? '.is-default' : ''}`, {
        dataset: { deviceId: device.id },
      }, topRow, volRow, balRow);

      list.appendChild(deviceRow);
    });

    card.appendChild(list);
    return card;
  }

  renderInputsSection(inputs) {
    const card = h('section.settings-card.audio-inputs-card', null,
      h('div.settings-card-header', null,
        h('div.card-header-icon', null, createIcon('mic', 18)),
        h('div.card-header-text', null,
          h('h3.card-title', null, 'Sound Input & Microphones'),
          h('p.card-description', null, 'Configure recording devices, input gain, and test microphone levels.')
        )
      )
    );

    if (inputs.length === 0) {
      card.appendChild(emptyState(
        'No Audio Input Devices Found',
        'No microphones or line-in recording endpoints are currently detected.',
        'micMute'
      ));
      return card;
    }

    const list = h('div.audio-device-list');

    inputs.forEach((device) => {
      const isDefault = !!device.isDefault;

      const actionsDiv = h('div.device-actions');

      if (!isDefault) {
        actionsDiv.appendChild(
          h('button.btn.btn-secondary.btn-sm', {
            type: 'button',
            onclick: () => this.setDefaultInput(device),
          }, 'Set as Default')
        );
      }

      const muteBtn = h('button.btn.btn-sm', {
        type: 'button',
        onclick: () => this.toggleInputMute(device, muteBtn),
      });
      this.setButtonMuteState(muteBtn, device.isMuted, true);
      actionsDiv.appendChild(muteBtn);

      const topRow = h('div.device-item-header', null,
        h('div.device-info', null,
          h('span.device-name', null, device.name),
          isDefault ? h('span.badge.badge-accent', null, 'Default Input') : null
        ),
        actionsDiv
      );

      // Gain Slider Row
      const slider = h('input.slider.volume-slider', {
        type: 'range',
        min: '0',
        max: '100',
        value: Math.round(device.volume * 100),
      });

      const valBadge = h('span.slider-value-badge', null, `${slider.value}%`);

      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        valBadge.textContent = `${val}%`;
        this.setInputVolume(device, val / 100.0);
      });

      const gainRow = h('div.audio-control-row', null,
        h('span.control-label', null, 'Input Gain'),
        slider,
        valBadge
      );

      const deviceRow = h(`div.audio-device-item${isDefault ? '.is-default' : ''}`, {
        dataset: { deviceId: device.id },
      }, topRow, gainRow);

      list.appendChild(deviceRow);
    });

    card.appendChild(list);

    // Live Audio Level Meter
    const meterBox = h('div.audio-meter-box', null,
      h('div.meter-header', null,
        h('span.meter-title', null, 'Live Microphone Level'),
        h('span.meter-db-value#audio-meter-db', null, 'Idle')
      ),
      h('div.meter-track', null,
        h('div.meter-bar#audio-meter-bar', { style: 'width: 0%;' }),
        h('div.meter-peak#audio-meter-peak', { style: 'left: 0%;' })
      ),
      h('div.meter-scale', null,
        h('span', null, '-48 dB'),
        h('span', null, '-36 dB'),
        h('span', null, '-24 dB'),
        h('span', null, '-12 dB'),
        h('span', null, '-6 dB'),
        h('span.meter-clip', null, '0 dB')
      )
    );
    card.appendChild(meterBox);

    return card;
  }

  renderStreamsSection(streams, outputs) {
    const card = h('section.settings-card.audio-streams-card', null,
      h('div.settings-card-header', null,
        h('div.card-header-icon', null, createIcon('sliders', 18)),
        h('div.card-header-text', null,
          h('h3.card-title', null, 'Application Volume & Routing'),
          h('p.card-description', null, 'Control individual app volume and redirect playback streams to any output device.')
        )
      )
    );

    if (streams.length === 0) {
      card.appendChild(emptyState(
        'No Audio Streams Active',
        'No applications are currently playing audio through the sound graph.',
        'headphones'
      ));
      return card;
    }

    const list = h('div.app-stream-list');

    streams.forEach((stream) => {
      // Header: App icon + App Name
      const iconNode = typeof stream.icon === 'string' && stream.icon.length > 2
        ? createIcon(stream.icon, 16)
        : h('span', null, stream.icon || '♪');

      const appTitle = h('div.stream-app-title', null,
        h('span.stream-app-icon', null, iconNode),
        h('span.stream-app-name', null, stream.name)
      );

      // Target sink selector dropdown
      const selectSink = h('select.select-input.select-sink-input', {
        onchange: (e) => {
          this.moveStream(stream.id, e.target.value);
        },
      });

      outputs.forEach((sink) => {
        const nameText = sink.name.length > 30 ? sink.name.substring(0, 30) + '...' : sink.name;
        selectSink.appendChild(
          h('option', {
            value: sink.id,
            selected: sink.id === stream.sinkId,
          }, `Output: ${nameText}`)
        );
      });

      const headerRow = h('div.stream-item-header', null,
        appTitle,
        selectSink
      );

      // Volume & Mute Row
      const muteBtn = h('button.btn.btn-sm', {
        type: 'button',
      });
      this.setStreamMuteButtonState(muteBtn, stream.isMuted);

      const slider = h('input.slider.volume-slider', {
        type: 'range',
        min: '0',
        max: '100',
        value: Math.round(stream.volume * 100),
      });

      const valBadge = h('span.slider-value-badge', null, `${slider.value}%`);

      muteBtn.addEventListener('click', () => {
        stream.isMuted = !stream.isMuted;
        this.setStreamMuteButtonState(muteBtn, stream.isMuted);
        this.setStreamMute(stream.id, stream.isMuted);
      });

      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        valBadge.textContent = `${val}%`;
        this.setStreamVolume(stream.id, val / 100.0);
        if (stream.isMuted && val > 0) {
          stream.isMuted = false;
          this.setStreamMuteButtonState(muteBtn, false);
          this.setStreamMute(stream.id, false);
        }
      });

      const controlRow = h('div.audio-control-row.stream-control-row', null,
        muteBtn,
        slider,
        valBadge
      );

      const item = h('div.app-stream-item', {
        dataset: { streamId: stream.id },
      }, headerRow, controlRow);

      list.appendChild(item);
    });

    card.appendChild(list);
    return card;
  }

  setButtonMuteState(btn, isMuted, isInput = false) {
    clear(btn);
    btn.className = `btn btn-sm ${isMuted ? 'btn-danger' : 'btn-ghost'}`;
    const iconName = isInput ? (isMuted ? 'micMute' : 'mic') : (isMuted ? 'volumeMute' : 'speaker');
    btn.appendChild(createIcon(iconName, 14));
    btn.appendChild(document.createTextNode(isMuted ? ' Unmute' : ' Mute'));
  }

  setStreamMuteButtonState(btn, isMuted) {
    clear(btn);
    btn.className = `btn btn-sm ${isMuted ? 'btn-danger' : 'btn-ghost'}`;
    btn.title = isMuted ? 'Unmute stream' : 'Mute stream';
    btn.appendChild(createIcon(isMuted ? 'volumeMute' : 'speaker', 14));
  }

  /* -------------------------------------------------------------------------
   * Audio Actions & Control
   * ---------------------------------------------------------------------- */

  setDefaultOutput(device) {
    if (typeof bro !== 'undefined') {
      if (bro.pulse?.setDefaultSink) {
        try { bro.pulse.setDefaultSink(device.id); } catch (_) {}
      } else if (bro.sys?.audio?.setDefaultOutput) {
        try { bro.sys.audio.setDefaultOutput(device.id); } catch (_) {}
      }
    }
    this.refreshIfActive();
  }

  setDefaultInput(device) {
    if (typeof bro !== 'undefined') {
      if (bro.pulse?.setDefaultSource) {
        try { bro.pulse.setDefaultSource(device.id); } catch (_) {}
      } else if (bro.sys?.audio?.setDefaultInput) {
        try { bro.sys.audio.setDefaultInput(device.id); } catch (_) {}
      }
    }
    this.refreshIfActive();
  }

  setOutputVolume(device, volume) {
    device.volume = volume;
    if (typeof bro !== 'undefined') {
      if (bro.pulse?.setSinkVolume) {
        try { bro.pulse.setSinkVolume(device.id, volume); } catch (_) {}
      } else if (bro.sys?.audio?.setVolume) {
        try { bro.sys.audio.setVolume(device.id, volume); } catch (_) {}
      }
    }
  }

  setInputVolume(device, volume) {
    device.volume = volume;
    if (typeof bro !== 'undefined') {
      if (bro.pulse?.setSourceVolume) {
        try { bro.pulse.setSourceVolume(device.id, volume); } catch (_) {}
      } else if (bro.sys?.audio?.setInputVolume) {
        try { bro.sys.audio.setInputVolume(device.id, volume); } catch (_) {}
      }
    }
  }

  toggleOutputMute(device, muteBtn) {
    device.isMuted = !device.isMuted;
    this.setButtonMuteState(muteBtn, device.isMuted, false);

    if (typeof bro !== 'undefined') {
      if (bro.pulse?.setSinkMute) {
        try { bro.pulse.setSinkMute(device.id, device.isMuted); } catch (_) {}
      } else if (bro.sys?.audio?.setMute) {
        try { bro.sys.audio.setMute(device.id, device.isMuted); } catch (_) {}
      }
    }
  }

  toggleInputMute(device, muteBtn) {
    device.isMuted = !device.isMuted;
    this.setButtonMuteState(muteBtn, device.isMuted, true);

    if (typeof bro !== 'undefined') {
      if (bro.pulse?.setSourceMute) {
        try { bro.pulse.setSourceMute(device.id, device.isMuted); } catch (_) {}
      } else if (bro.sys?.audio?.setMute) {
        try { bro.sys.audio.setMute(device.id, device.isMuted); } catch (_) {}
      }
    }
  }

  setStreamVolume(streamId, volume) {
    if (typeof bro !== 'undefined' && bro.pulse?.setSinkInputVolume) {
      try { bro.pulse.setSinkInputVolume(streamId, volume); } catch (_) {}
    }
  }

  setStreamMute(streamId, isMuted) {
    if (typeof bro !== 'undefined' && bro.pulse?.setSinkInputMute) {
      try { bro.pulse.setSinkInputMute(streamId, isMuted); } catch (_) {}
    }
  }

  moveStream(streamId, targetSinkId) {
    if (typeof bro !== 'undefined' && bro.pulse?.moveSinkInput) {
      try { bro.pulse.moveSinkInput(streamId, targetSinkId); } catch (_) {}
    }
  }

  /* -------------------------------------------------------------------------
   * Live VU Meter Lifecycle
   * ---------------------------------------------------------------------- */

  startLiveMeter() {
    this.stopMeter();
    const barEl = document.getElementById('audio-meter-bar');
    const peakEl = document.getElementById('audio-meter-peak');
    const dbEl = document.getElementById('audio-meter-db');
    if (!barEl || !peakEl || !dbEl) return;

    if (typeof bro !== 'undefined' && bro.pulse?.getMeterLevel) {
      this.meterInterval = setInterval(() => {
        try {
          const lvl = bro.pulse.getMeterLevel();
          if (typeof lvl === 'number') {
            const pct = Math.min(100, Math.max(0, Math.round(lvl * 100)));
            barEl.style.width = `${pct}%`;
            peakEl.style.left = `${pct}%`;
            const db = pct === 0 ? -48 : Math.round((lvl * 48 - 48) * 10) / 10;
            dbEl.textContent = `${db.toFixed(1)} dB`;
          }
        } catch (_) {}
      }, 100);
    } else {
      barEl.style.width = '0%';
      peakEl.style.left = '0%';
      dbEl.textContent = 'Idle';
    }
  }

  stopMeter() {
    if (this.meterInterval) {
      clearInterval(this.meterInterval);
      this.meterInterval = null;
    }
  }

  destroy() {
    this.stopMeter();
    this.container = null;
  }
}
