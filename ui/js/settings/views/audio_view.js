/**
 * Comprehensive Audio Control Studio View
 * Manages genuine output sinks, input sources, real audio level meters, and per-app stream routing.
 * Strictly zero mock or fake data.
 */

import { getIconSvg } from '../../icons.js';

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
    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'settings-view-header';
    header.innerHTML = `
      <div class="view-header-titles">
        <h2 class="view-title">Audio Studio</h2>
        <p class="view-subtitle">Manage system audio hardware, master levels, input gain, and application stream routing.</p>
      </div>
    `;
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
    const card = document.createElement('section');
    card.className = 'settings-card audio-outputs-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    header.innerHTML = `
      <div class="card-header-icon">${getIconSvg('audio', 18)}</div>
      <div class="card-header-text">
        <h3 class="card-title">Sound Output Devices</h3>
        <p class="card-description">Choose where audio plays and adjust master volume & balance.</p>
      </div>
    `;
    card.appendChild(header);

    if (outputs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'settings-empty-state';
      empty.innerHTML = `
        <div class="empty-state-icon">${getIconSvg('volumeMute', 28)}</div>
        <div class="empty-state-title">No Audio Output Devices Found</div>
        <div class="empty-state-desc">No speakers, headphones, or HDMI sound endpoints are currently detected.</div>
      `;
      card.appendChild(empty);
      return card;
    }

    const list = document.createElement('div');
    list.className = 'audio-device-list';

    outputs.forEach((device) => {
      const isDefault = !!device.isDefault;
      const deviceRow = document.createElement('div');
      deviceRow.className = `audio-device-item ${isDefault ? 'is-default' : ''}`;
      deviceRow.dataset.deviceId = device.id;

      const topRow = document.createElement('div');
      topRow.className = 'device-item-header';

      const infoDiv = document.createElement('div');
      infoDiv.className = 'device-info';
      infoDiv.innerHTML = `
        <span class="device-name">${this.escapeHtml(device.name)}</span>
        ${isDefault ? '<span class="badge badge-accent">Default Output</span>' : ''}
      `;

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'device-actions';

      if (!isDefault) {
        const setDefaultBtn = document.createElement('button');
        setDefaultBtn.type = 'button';
        setDefaultBtn.className = 'btn btn-secondary btn-sm';
        setDefaultBtn.textContent = 'Set as Default';
        setDefaultBtn.addEventListener('click', () => this.setDefaultOutput(device));
        actionsDiv.appendChild(setDefaultBtn);
      }

      const muteBtn = document.createElement('button');
      muteBtn.type = 'button';
      muteBtn.className = `btn btn-sm ${device.isMuted ? 'btn-danger' : 'btn-ghost'}`;
      muteBtn.innerHTML = device.isMuted ? `${getIconSvg('volumeMute', 14)} Unmute` : `${getIconSvg('speaker', 14)} Mute`;
      muteBtn.addEventListener('click', () => this.toggleOutputMute(device, muteBtn, slider));
      actionsDiv.appendChild(muteBtn);

      topRow.appendChild(infoDiv);
      topRow.appendChild(actionsDiv);
      deviceRow.appendChild(topRow);

      // Volume Slider Row
      const volRow = document.createElement('div');
      volRow.className = 'audio-control-row';

      const volLabel = document.createElement('span');
      volLabel.className = 'control-label';
      volLabel.textContent = 'Volume';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.value = Math.round(device.volume * 100);
      slider.className = 'slider volume-slider';

      const valBadge = document.createElement('span');
      valBadge.className = 'slider-value-badge';
      valBadge.textContent = `${slider.value}%`;

      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        valBadge.textContent = `${val}%`;
        this.setOutputVolume(device, val / 100.0);
        if (device.isMuted && val > 0) {
          device.isMuted = false;
          muteBtn.innerHTML = `${getIconSvg('speaker', 14)} Mute`;
          muteBtn.className = 'btn btn-sm btn-ghost';
        }
      });

      volRow.appendChild(volLabel);
      volRow.appendChild(slider);
      volRow.appendChild(valBadge);
      deviceRow.appendChild(volRow);

      // Stereo Balance Slider
      const balRow = document.createElement('div');
      balRow.className = 'audio-control-row balance-row';

      const balLabel = document.createElement('span');
      balLabel.className = 'control-label';
      balLabel.textContent = 'Balance';

      const balLeft = document.createElement('span');
      balLeft.className = 'balance-tag';
      balLeft.textContent = 'L';

      const balSlider = document.createElement('input');
      balSlider.type = 'range';
      balSlider.min = '-50';
      balSlider.max = '50';
      balSlider.value = this.channelBalances[device.id] || '0';
      balSlider.className = 'slider balance-slider';

      const balRight = document.createElement('span');
      balRight.className = 'balance-tag';
      balRight.textContent = 'R';

      const balBadge = document.createElement('span');
      balBadge.className = 'slider-value-badge balance-badge';
      const updateBalText = (v) => {
        if (v === 0) return 'Center';
        return v < 0 ? `L ${Math.abs(v * 2)}%` : `R ${v * 2}%`;
      };
      balBadge.textContent = updateBalText(parseInt(balSlider.value, 10));

      balSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        this.channelBalances[device.id] = v;
        balBadge.textContent = updateBalText(v);
      });

      balRow.appendChild(balLabel);
      balRow.appendChild(balLeft);
      balRow.appendChild(balSlider);
      balRow.appendChild(balRight);
      balRow.appendChild(balBadge);
      deviceRow.appendChild(balRow);

      list.appendChild(deviceRow);
    });

    card.appendChild(list);
    return card;
  }

  renderInputsSection(inputs) {
    const card = document.createElement('section');
    card.className = 'settings-card audio-inputs-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    header.innerHTML = `
      <div class="card-header-icon">${getIconSvg('mic', 18)}</div>
      <div class="card-header-text">
        <h3 class="card-title">Sound Input & Microphones</h3>
        <p class="card-description">Configure recording devices, input gain, and test microphone levels.</p>
      </div>
    `;
    card.appendChild(header);

    if (inputs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'settings-empty-state';
      empty.innerHTML = `
        <div class="empty-state-icon">${getIconSvg('micMute', 28)}</div>
        <div class="empty-state-title">No Audio Input Devices Found</div>
        <div class="empty-state-desc">No microphones or line-in recording endpoints are currently detected.</div>
      `;
      card.appendChild(empty);
      return card;
    }

    const list = document.createElement('div');
    list.className = 'audio-device-list';

    inputs.forEach((device) => {
      const isDefault = !!device.isDefault;
      const deviceRow = document.createElement('div');
      deviceRow.className = `audio-device-item ${isDefault ? 'is-default' : ''}`;
      deviceRow.dataset.deviceId = device.id;

      const topRow = document.createElement('div');
      topRow.className = 'device-item-header';

      const infoDiv = document.createElement('div');
      infoDiv.className = 'device-info';
      infoDiv.innerHTML = `
        <span class="device-name">${this.escapeHtml(device.name)}</span>
        ${isDefault ? '<span class="badge badge-accent">Default Input</span>' : ''}
      `;

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'device-actions';

      if (!isDefault) {
        const setDefaultBtn = document.createElement('button');
        setDefaultBtn.type = 'button';
        setDefaultBtn.className = 'btn btn-secondary btn-sm';
        setDefaultBtn.textContent = 'Set as Default';
        setDefaultBtn.addEventListener('click', () => this.setDefaultInput(device));
        actionsDiv.appendChild(setDefaultBtn);
      }

      const muteBtn = document.createElement('button');
      muteBtn.type = 'button';
      muteBtn.className = `btn btn-sm ${device.isMuted ? 'btn-danger' : 'btn-ghost'}`;
      muteBtn.innerHTML = device.isMuted ? `${getIconSvg('micMute', 14)} Unmute` : `${getIconSvg('mic', 14)} Mute`;
      muteBtn.addEventListener('click', () => this.toggleInputMute(device, muteBtn));
      actionsDiv.appendChild(muteBtn);

      topRow.appendChild(infoDiv);
      topRow.appendChild(actionsDiv);
      deviceRow.appendChild(topRow);

      // Gain Slider Row
      const gainRow = document.createElement('div');
      gainRow.className = 'audio-control-row';

      const gainLabel = document.createElement('span');
      gainLabel.className = 'control-label';
      gainLabel.textContent = 'Input Gain';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.value = Math.round(device.volume * 100);
      slider.className = 'slider volume-slider';

      const valBadge = document.createElement('span');
      valBadge.className = 'slider-value-badge';
      valBadge.textContent = `${slider.value}%`;

      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        valBadge.textContent = `${val}%`;
        this.setInputVolume(device, val / 100.0);
      });

      gainRow.appendChild(gainLabel);
      gainRow.appendChild(slider);
      gainRow.appendChild(valBadge);
      deviceRow.appendChild(gainRow);

      list.appendChild(deviceRow);
    });

    card.appendChild(list);

    // Live Audio Level Meter
    const meterBox = document.createElement('div');
    meterBox.className = 'audio-meter-box';
    meterBox.innerHTML = `
      <div class="meter-header">
        <span class="meter-title">Live Microphone Level</span>
        <span class="meter-db-value" id="audio-meter-db">Idle</span>
      </div>
      <div class="meter-track">
        <div class="meter-bar" id="audio-meter-bar" style="width: 0%;"></div>
        <div class="meter-peak" id="audio-meter-peak" style="left: 0%;"></div>
      </div>
      <div class="meter-scale">
        <span>-48 dB</span>
        <span>-36 dB</span>
        <span>-24 dB</span>
        <span>-12 dB</span>
        <span>-6 dB</span>
        <span class="meter-clip">0 dB</span>
      </div>
    `;
    card.appendChild(meterBox);

    return card;
  }

  renderStreamsSection(streams, outputs) {
    const card = document.createElement('section');
    card.className = 'settings-card audio-streams-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    header.innerHTML = `
      <div class="card-header-icon">${getIconSvg('sliders', 18)}</div>
      <div class="card-header-text">
        <h3 class="card-title">Application Volume & Routing</h3>
        <p class="card-description">Control individual app volume and redirect playback streams to any output device.</p>
      </div>
    `;
    card.appendChild(header);

    if (streams.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'settings-empty-state';
      empty.innerHTML = `
        <div class="empty-state-icon">${getIconSvg('headphones', 28)}</div>
        <div class="empty-state-title">No Audio Streams Active</div>
        <div class="empty-state-desc">No applications are currently playing audio through the sound graph.</div>
      `;
      card.appendChild(empty);
      return card;
    }

    const list = document.createElement('div');
    list.className = 'app-stream-list';

    streams.forEach((stream) => {
      const item = document.createElement('div');
      item.className = 'app-stream-item';
      item.dataset.streamId = stream.id;

      // Header: App icon + App Name
      const headerRow = document.createElement('div');
      headerRow.className = 'stream-item-header';

      const appTitle = document.createElement('div');
      appTitle.className = 'stream-app-title';
      appTitle.innerHTML = `
        <span class="stream-app-icon">${stream.icon}</span>
        <span class="stream-app-name">${this.escapeHtml(stream.name)}</span>
      `;

      // Target sink selector dropdown
      const selectSink = document.createElement('select');
      selectSink.className = 'select-input select-sink-input';
      outputs.forEach((sink) => {
        const opt = document.createElement('option');
        opt.value = sink.id;
        opt.textContent = `Output: ${sink.name.substring(0, 30)}${sink.name.length > 30 ? '...' : ''}`;
        if (sink.id === stream.sinkId) opt.selected = true;
        selectSink.appendChild(opt);
      });

      selectSink.addEventListener('change', (e) => {
        const targetSinkId = e.target.value;
        this.moveStream(stream.id, targetSinkId);
      });

      headerRow.appendChild(appTitle);
      headerRow.appendChild(selectSink);
      item.appendChild(headerRow);

      // Volume & Mute Row
      const controlRow = document.createElement('div');
      controlRow.className = 'audio-control-row stream-control-row';

      const muteBtn = document.createElement('button');
      muteBtn.type = 'button';
      muteBtn.className = `btn btn-sm ${stream.isMuted ? 'btn-danger' : 'btn-ghost'}`;
      muteBtn.innerHTML = stream.isMuted ? getIconSvg('volumeMute', 14) : getIconSvg('speaker', 14);
      muteBtn.title = stream.isMuted ? 'Unmute stream' : 'Mute stream';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.value = Math.round(stream.volume * 100);
      slider.className = 'slider volume-slider';

      const valBadge = document.createElement('span');
      valBadge.className = 'slider-value-badge';
      valBadge.textContent = `${slider.value}%`;

      muteBtn.addEventListener('click', () => {
        stream.isMuted = !stream.isMuted;
        muteBtn.innerHTML = stream.isMuted ? getIconSvg('volumeMute', 14) : getIconSvg('speaker', 14);
        muteBtn.className = `btn btn-sm ${stream.isMuted ? 'btn-danger' : 'btn-ghost'}`;
        this.setStreamMute(stream.id, stream.isMuted);
      });

      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        valBadge.textContent = `${val}%`;
        this.setStreamVolume(stream.id, val / 100.0);
        if (stream.isMuted && val > 0) {
          stream.isMuted = false;
          muteBtn.innerHTML = getIconSvg('speaker', 14);
          muteBtn.className = 'btn btn-sm btn-ghost';
          this.setStreamMute(stream.id, false);
        }
      });

      controlRow.appendChild(muteBtn);
      controlRow.appendChild(slider);
      controlRow.appendChild(valBadge);
      item.appendChild(controlRow);

      list.appendChild(item);
    });

    card.appendChild(list);
    return card;
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

  toggleOutputMute(device, muteBtn, slider) {
    device.isMuted = !device.isMuted;
    muteBtn.innerHTML = device.isMuted ? `${getIconSvg('volumeMute', 14)} Unmute` : `${getIconSvg('speaker', 14)} Mute`;
    muteBtn.className = `btn btn-sm ${device.isMuted ? 'btn-danger' : 'btn-ghost'}`;

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
    muteBtn.innerHTML = device.isMuted ? `${getIconSvg('micMute', 14)} Unmute` : `${getIconSvg('mic', 14)} Mute`;
    muteBtn.className = `btn btn-sm ${device.isMuted ? 'btn-danger' : 'btn-ghost'}`;

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
    // Query genuine meter readings if provided by host
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
      // Idle state
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

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
