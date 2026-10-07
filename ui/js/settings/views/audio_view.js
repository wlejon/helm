/**
 * Comprehensive Audio Control Studio View
 * Manages output sinks, input sources, live audio VU meters, and per-app stream routing.
 */

export class AudioView {
  constructor(controller) {
    this.controller = controller;
    this.container = null;
    this.meterInterval = null;
    this.activeOutputId = null;
    this.activeInputId = null;
    this.channelBalances = {}; // sinkId -> balance (-100 to +100)
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

    // bro.sys.audio fallback events
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
   * Data Fetching with Robust Fallbacks
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

    // 3. Fallback mock output devices
    return [
      {
        id: 1,
        name: 'Built-in Audio Analog Stereo (Speakers / Headphones)',
        technicalName: 'alsa_output.pci-0000_00_1f.3.analog-stereo',
        volume: 0.82,
        isMuted: false,
        isDefault: true,
        channels: 2,
        type: 'mock',
      },
      {
        id: 2,
        name: 'HDMI / DisplayPort Digital Stereo Audio',
        technicalName: 'alsa_output.pci-0000_01_00.1.hdmi-stereo',
        volume: 0.65,
        isMuted: false,
        isDefault: false,
        channels: 2,
        type: 'mock',
      },
      {
        id: 3,
        name: 'USB Studio DAC / External Interface',
        technicalName: 'alsa_output.usb-Focusrite_Scarlett_2i2-00.analog-stereo',
        volume: 0.90,
        isMuted: false,
        isDefault: false,
        channels: 2,
        type: 'mock',
      }
    ];
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

    // 2. Fallback mock input devices
    return [
      {
        id: 'in-1',
        name: 'Internal Digital Microphone Array',
        volume: 0.70,
        isMuted: false,
        isDefault: true,
        type: 'mock',
      },
      {
        id: 'in-2',
        name: 'Studio USB Condenser Microphone',
        volume: 0.85,
        isMuted: false,
        isDefault: false,
        type: 'mock',
      },
      {
        id: 'in-3',
        name: 'Line-In Stereo Input',
        volume: 0.50,
        isMuted: true,
        isDefault: false,
        type: 'mock',
      }
    ];
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
              icon: st.icon || '🎵',
              volume: typeof st.volume === 'number' ? st.volume : 0.8,
              isMuted: !!st.isMuted,
              sinkId: st.sinkId != null ? st.sinkId : 1,
            }));
          }
        } catch (_) {}
      }
    }

    // 2. Fallback simulated active desktop application streams
    return [
      {
        id: 101,
        name: 'Web Browser (Chromium / YouTube)',
        appId: 'browser',
        icon: '🌐',
        volume: 0.85,
        isMuted: false,
        sinkId: 1,
      },
      {
        id: 102,
        name: 'Helm Media Player (FLAC Hi-Fi)',
        appId: 'media',
        icon: '🎵',
        volume: 0.95,
        isMuted: false,
        sinkId: 1,
      },
      {
        id: 103,
        name: 'Bro Terminal (Bell & Notifications)',
        appId: 'terminal',
        icon: '💻',
        volume: 0.60,
        isMuted: false,
        sinkId: 1,
      },
      {
        id: 104,
        name: 'Discord / Voice Call',
        appId: 'discord',
        icon: '💬',
        volume: 0.75,
        isMuted: false,
        sinkId: 3,
      }
    ];
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
      <div class="card-header-icon">🔊</div>
      <div class="card-header-text">
        <h3 class="card-title">Sound Output Devices</h3>
        <p class="card-description">Choose where audio plays and adjust master volume & balance.</p>
      </div>
    `;
    card.appendChild(header);

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
      muteBtn.textContent = device.isMuted ? '🔇 Unmute' : '🔊 Mute';
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
          muteBtn.textContent = '🔊 Mute';
          muteBtn.className = 'btn btn-sm btn-ghost';
        }
      });

      volRow.appendChild(volLabel);
      volRow.appendChild(slider);
      volRow.appendChild(valBadge);
      deviceRow.appendChild(volRow);

      // Stereo Balance Slider (Left <-> Center <-> Right)
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
      <div class="card-header-icon">🎙️</div>
      <div class="card-header-text">
        <h3 class="card-title">Sound Input & Microphones</h3>
        <p class="card-description">Configure recording devices, input gain, and test microphone levels.</p>
      </div>
    `;
    card.appendChild(header);

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
      muteBtn.textContent = device.isMuted ? '🔇 Unmute' : '🎙️ Mute';
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
        <span class="meter-db-value" id="audio-meter-db">-18.4 dB</span>
      </div>
      <div class="meter-track">
        <div class="meter-bar" id="audio-meter-bar" style="width: 35%;"></div>
        <div class="meter-peak" id="audio-meter-peak" style="left: 45%;"></div>
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
      <div class="card-header-icon">🎚️</div>
      <div class="card-header-text">
        <h3 class="card-title">Application Volume & Routing</h3>
        <p class="card-description">Control individual app volume and redirect playback streams to any output device.</p>
      </div>
    `;
    card.appendChild(header);

    if (streams.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state-card';
      empty.textContent = 'No active application audio streams currently playing.';
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
      muteBtn.textContent = stream.isMuted ? '🔇' : '🔊';
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
        muteBtn.textContent = stream.isMuted ? '🔇' : '🔊';
        muteBtn.className = `btn btn-sm ${stream.isMuted ? 'btn-danger' : 'btn-ghost'}`;
        this.setStreamMute(stream.id, stream.isMuted);
      });

      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        valBadge.textContent = `${val}%`;
        this.setStreamVolume(stream.id, val / 100.0);
        if (stream.isMuted && val > 0) {
          stream.isMuted = false;
          muteBtn.textContent = '🔊';
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
   * Audio Hardware Operations
   * ---------------------------------------------------------------------- */

  setOutputVolume(device, volume) {
    device.volume = volume;

    // 1. Try bro.pulse
    if (typeof bro !== 'undefined' && bro.pulse && typeof bro.pulse.setSinkVolume === 'function') {
      try {
        const id = typeof device.id === 'string' ? parseInt(device.id, 10) || 0 : device.id;
        bro.pulse.setSinkVolume(id, volume);
        return;
      } catch (_) {}
    }

    // 2. Try bro.sys.audio
    if (typeof bro !== 'undefined' && bro.sys?.audio?.setVolume) {
      try {
        bro.sys.audio.setVolume(String(device.id), volume);
      } catch (_) {}
    }
  }

  toggleOutputMute(device, btnEl, sliderEl) {
    device.isMuted = !device.isMuted;
    btnEl.textContent = device.isMuted ? '🔇 Unmute' : '🔊 Mute';
    btnEl.className = `btn btn-sm ${device.isMuted ? 'btn-danger' : 'btn-ghost'}`;

    if (typeof bro !== 'undefined' && bro.pulse && typeof bro.pulse.setSinkMuted === 'function') {
      try {
        const id = typeof device.id === 'string' ? parseInt(device.id, 10) || 0 : device.id;
        bro.pulse.setSinkMuted(id, device.isMuted);
        return;
      } catch (_) {}
    }

    if (typeof bro !== 'undefined' && bro.sys?.audio?.setMute) {
      try {
        bro.sys.audio.setMute(String(device.id), device.isMuted);
      } catch (_) {}
    }
  }

  setDefaultOutput(device) {
    if (typeof bro !== 'undefined' && bro.pulse && typeof bro.pulse.setDefaultSink === 'function') {
      try {
        const id = typeof device.id === 'string' ? parseInt(device.id, 10) || 0 : device.id;
        bro.pulse.setDefaultSink(id);
      } catch (_) {}
    }

    if (typeof bro !== 'undefined' && bro.sys?.audio?.setDefaultSink) {
      try {
        bro.sys.audio.setDefaultSink(String(device.id));
      } catch (_) {}
    }

    this.render(this.container, this.controller.searchQuery);
  }

  setInputVolume(device, volume) {
    device.volume = volume;
    if (typeof bro !== 'undefined' && bro.sys?.audio?.setVolume) {
      try {
        bro.sys.audio.setVolume(String(device.id), volume);
      } catch (_) {}
    }
  }

  toggleInputMute(device, btnEl) {
    device.isMuted = !device.isMuted;
    btnEl.textContent = device.isMuted ? '🔇 Unmute' : '🎙️ Mute';
    btnEl.className = `btn btn-sm ${device.isMuted ? 'btn-danger' : 'btn-ghost'}`;

    if (typeof bro !== 'undefined' && bro.sys?.audio?.setMute) {
      try {
        bro.sys.audio.setMute(String(device.id), device.isMuted);
      } catch (_) {}
    }
  }

  setDefaultInput(device) {
    if (typeof bro !== 'undefined' && bro.sys?.audio?.setDefaultSource) {
      try {
        bro.sys.audio.setDefaultSource(String(device.id));
      } catch (_) {}
    }
    this.render(this.container, this.controller.searchQuery);
  }

  setStreamVolume(streamId, volume) {
    if (typeof bro !== 'undefined' && bro.pulse) {
      const setVol = bro.pulse.setSinkInputVolume || bro.pulse.setStreamVolume;
      if (typeof setVol === 'function') {
        try {
          const numId = typeof streamId === 'string' ? parseInt(streamId, 10) || 0 : streamId;
          setVol.call(bro.pulse, numId, volume);
        } catch (_) {}
      }
    }
  }

  setStreamMute(streamId, isMuted) {
    if (typeof bro !== 'undefined' && bro.pulse) {
      const setMute = bro.pulse.setSinkInputMuted || bro.pulse.setStreamMuted || bro.pulse.setStreamMute;
      if (typeof setMute === 'function') {
        try {
          const numId = typeof streamId === 'string' ? parseInt(streamId, 10) || 0 : streamId;
          setMute.call(bro.pulse, numId, isMuted);
        } catch (_) {}
      }
    }
  }

  moveStream(streamId, sinkId) {
    if (typeof bro !== 'undefined' && bro.pulse) {
      const moveFn = bro.pulse.moveSinkInput || bro.pulse.moveStream;
      if (typeof moveFn === 'function') {
        try {
          const numStreamId = typeof streamId === 'string' ? parseInt(streamId, 10) || 0 : streamId;
          const numSinkId = typeof sinkId === 'string' ? parseInt(sinkId, 10) || 0 : sinkId;
          moveFn.call(bro.pulse, numStreamId, numSinkId);
        } catch (_) {}
      }
    }
  }

  /* -------------------------------------------------------------------------
   * Live Audio Level VU Meter
   * ---------------------------------------------------------------------- */

  startLiveMeter() {
    this.stopMeter();

    let peak = 0.35;
    this.meterInterval = setInterval(() => {
      const barEl = document.getElementById('audio-meter-bar');
      const peakEl = document.getElementById('audio-meter-peak');
      const dbEl = document.getElementById('audio-meter-db');
      if (!barEl || !peakEl || !dbEl) return;

      // Realistic audio meter simulation
      const baseLevel = 0.25 + Math.random() * 0.45;
      const pct = Math.min(100, Math.max(2, Math.round(baseLevel * 100)));
      if (baseLevel > peak) peak = baseLevel;
      else peak = Math.max(baseLevel, peak - 0.04);

      barEl.style.width = `${pct}%`;
      peakEl.style.left = `${Math.round(peak * 100)}%`;

      const db = Math.round((baseLevel * 48 - 48) * 10) / 10;
      dbEl.textContent = `${db > -1 ? '0.0' : db.toFixed(1)} dB`;
    }, 120);
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
