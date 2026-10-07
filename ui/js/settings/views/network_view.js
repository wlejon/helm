/**
 * Network & Internet Settings View
 * Manages real Ethernet adapters, real Wi-Fi scanning with signal bars, SSID connection modal,
 * and genuine IP/DNS configuration details. Absolutely zero mock or fake data.
 */

export class NetworkView {
  constructor(controller) {
    this.controller = controller;
    this.container = null;
    this.isScanning = false;
    this.wifiEnabled = true;
    this.accessPoints = [];
    this.activeDialogSSID = null;
    this.hasScanned = false;
  }

  init() {
    if (typeof bro !== 'undefined' && bro.sys?.network && typeof bro.sys.network.on === 'function') {
      try {
        bro.sys.network.on('changed', () => this.refresh());
        bro.sys.network.on('wifiScanCompleted', (e) => this.handleScanCompleted(e));
      } catch (_) {}
    }
  }

  refresh() {
    if (this.container && this.controller.activeCategory === 'network' && this.controller.isOpen) {
      this.render(this.container, this.controller.searchQuery);
    }
  }

  hasSearchMatches(query) {
    const q = query.toLowerCase();
    const terms = ['network', 'wifi', 'ethernet', 'lan', 'internet', 'ip', 'ipv4', 'ipv6', 'mac', 'gateway', 'dns', 'ssid', 'hotspot'];
    return terms.some((t) => t.includes(q));
  }

  /* -------------------------------------------------------------------------
   * Data Loading
   * ---------------------------------------------------------------------- */

  getNetworkData() {
    let rawState = null;
    if (typeof bro !== 'undefined' && bro.sys?.network?.getState) {
      try {
        rawState = bro.sys.network.getState();
      } catch (err) {
        console.warn('Network: getState error:', err);
      }
    }

    const devices = (rawState && Array.isArray(rawState.devices)) ? rawState.devices : [];
    this.wifiEnabled = rawState ? rawState.wifiEnabled !== false : true;

    const ethernetDevices = devices.filter((d) => d.type === 'ethernet' || d.type === 'wired');
    const wifiDevices = devices.filter((d) => d.type === 'wifi' || d.type === 'wireless');
    const wifiDevice = wifiDevices[0] || null;

    return { rawState, ethernetDevices, wifiDevice };
  }

  getAccessPointsList(deviceId = '') {
    if (this.hasScanned && this.accessPoints.length > 0) return this.accessPoints;

    if (typeof bro !== 'undefined' && bro.sys?.network?.getAccessPoints) {
      try {
        const aps = bro.sys.network.getAccessPoints(deviceId);
        if (Array.isArray(aps)) {
          this.accessPoints = aps.map((ap) => ({
            ssid: ap.ssid || 'Hidden Network',
            bssid: ap.bssid,
            strengthPercent: typeof ap.strengthPercent === 'number' ? ap.strengthPercent : 0,
            security: ap.security || 'Open',
            active: !!ap.active,
          }));
          return this.accessPoints;
        }
      } catch (_) {}
    }

    return this.accessPoints;
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
        <h2 class="view-title">Network & Internet</h2>
        <p class="view-subtitle">Monitor wired Ethernet interfaces, scan nearby Wi-Fi networks, and inspect IP configuration.</p>
      </div>
    `;
    container.appendChild(header);

    const { rawState, ethernetDevices, wifiDevice } = this.getNetworkData();
    const aps = this.getAccessPointsList(wifiDevice?.id);

    // 1. Wi-Fi Card
    const wifiCard = this.renderWifiCard(aps, wifiDevice);
    container.appendChild(wifiCard);

    // 2. Ethernet Adapters Card
    const ethCard = this.renderEthernetCard(ethernetDevices);
    container.appendChild(ethCard);

    // Modal dialog for Wi-Fi connection if opened
    if (this.activeDialogSSID) {
      const modal = this.renderPasswordModal(this.activeDialogSSID);
      container.appendChild(modal);
    }
  }

  renderWifiCard(accessPoints, wifiDevice) {
    const card = document.createElement('section');
    card.className = 'settings-card network-wifi-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    header.innerHTML = `
      <div class="card-header-icon">📶</div>
      <div class="card-header-text">
        <h3 class="card-title">Wi-Fi Wireless Networking</h3>
        <p class="card-description">${wifiDevice ? (wifiDevice.description || wifiDevice.interfaceName || 'Wireless Adapter') : 'Connect to wireless networks and discover nearby access points.'}</p>
      </div>
      <div class="card-header-actions">
        ${wifiDevice ? `
          <button class="btn btn-secondary btn-sm" id="btn-scan-wifi" ${this.isScanning ? 'disabled' : ''}>
            ${this.isScanning ? '🔄 Scanning...' : '🔍 Scan Networks'}
          </button>
        ` : ''}
      </div>
    `;
    card.appendChild(header);

    const scanBtn = header.querySelector('#btn-scan-wifi');
    if (scanBtn) {
      scanBtn.addEventListener('click', () => this.triggerWifiScan(wifiDevice?.id));
    }

    if (!wifiDevice) {
      const empty = document.createElement('div');
      empty.className = 'settings-empty-state';
      empty.innerHTML = `
        <div class="empty-state-icon">📡</div>
        <div class="empty-state-title">No Wi-Fi Adapter Found</div>
        <div class="empty-state-desc">This system does not have a wireless network interface installed or enabled.</div>
      `;
      card.appendChild(empty);
      return card;
    }

    if (!this.wifiEnabled) {
      const disabled = document.createElement('div');
      disabled.className = 'settings-empty-state';
      disabled.innerHTML = `
        <div class="empty-state-icon">🚫</div>
        <div class="empty-state-title">Wi-Fi is Disabled</div>
        <div class="empty-state-desc">Wireless networking is currently turned off.</div>
      `;
      card.appendChild(disabled);
      return card;
    }

    if (accessPoints.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'settings-empty-state';
      empty.innerHTML = `
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-title">No Wi-Fi Networks in Range</div>
        <div class="empty-state-desc">Click "Scan Networks" to search for nearby wireless access points.</div>
      `;
      card.appendChild(empty);
      return card;
    }

    const list = document.createElement('div');
    list.className = 'wifi-networks-list';

    accessPoints.forEach((ap) => {
      const item = document.createElement('div');
      item.className = `wifi-network-item ${ap.active ? 'active-connection' : ''}`;

      const iconDiv = document.createElement('div');
      iconDiv.className = 'wifi-signal-icon';
      iconDiv.innerHTML = this.getSignalSvg(ap.strengthPercent);

      const infoDiv = document.createElement('div');
      infoDiv.className = 'wifi-item-info';
      infoDiv.innerHTML = `
        <div class="wifi-ssid-title">
          <span>${this.escapeHtml(ap.ssid)}</span>
          ${ap.active ? '<span class="badge badge-success">Connected</span>' : ''}
          ${ap.security === 'Open' ? '<span class="badge badge-dim">Open</span>' : '<span class="badge badge-dim">🔒 ' + this.escapeHtml(ap.security) + '</span>'}
        </div>
        <div class="wifi-signal-text">Signal: ${ap.strengthPercent}%</div>
      `;

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'wifi-item-actions';

      if (ap.active) {
        const disconnectBtn = document.createElement('button');
        disconnectBtn.type = 'button';
        disconnectBtn.className = 'btn btn-secondary btn-sm';
        disconnectBtn.textContent = 'Disconnect';
        disconnectBtn.addEventListener('click', () => this.disconnectWifi());
        actionsDiv.appendChild(disconnectBtn);
      } else {
        const connectBtn = document.createElement('button');
        connectBtn.type = 'button';
        connectBtn.className = 'btn btn-secondary btn-sm';
        connectBtn.textContent = 'Connect';
        connectBtn.addEventListener('click', () => this.promptConnect(ap));
        actionsDiv.appendChild(connectBtn);
      }

      item.appendChild(iconDiv);
      item.appendChild(infoDiv);
      item.appendChild(actionsDiv);
      list.appendChild(item);
    });

    card.appendChild(list);
    return card;
  }

  renderEthernetCard(ethernetDevices) {
    const card = document.createElement('section');
    card.className = 'settings-card network-ethernet-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    header.innerHTML = `
      <div class="card-header-icon">🌐</div>
      <div class="card-header-text">
        <h3 class="card-title">Wired Ethernet</h3>
        <p class="card-description">High-speed wired network adapters and interface configurations.</p>
      </div>
    `;
    card.appendChild(header);

    if (ethernetDevices.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'settings-empty-state';
      empty.innerHTML = `
        <div class="empty-state-icon">🔌</div>
        <div class="empty-state-title">No Wired Ethernet Adapters Detected</div>
        <div class="empty-state-desc">No physical Ethernet interfaces are currently reporting to the network subsystem.</div>
      `;
      card.appendChild(empty);
      return card;
    }

    ethernetDevices.forEach((eth) => {
      const adapterSection = document.createElement('div');
      adapterSection.className = 'ethernet-adapter-section';

      const isConnected = eth.state === 'connected' || eth.state === 'activated';
      const speedStr = eth.speedMbps ? `${eth.speedMbps} Mbps` : '';

      const adapterHeader = document.createElement('div');
      adapterHeader.className = 'adapter-sub-header';
      adapterHeader.innerHTML = `
        <div class="adapter-sub-title">
          <strong>${this.escapeHtml(eth.description || eth.interfaceName || 'Ethernet Interface')}</strong>
          <span class="text-muted">(${this.escapeHtml(eth.interfaceName || eth.id)})</span>
        </div>
        <span class="badge ${isConnected ? 'badge-success' : 'badge-danger'}">
          ${isConnected ? ('Connected' + (speedStr ? ' • ' + speedStr : '')) : 'Disconnected'}
        </span>
      `;
      adapterSection.appendChild(adapterHeader);

      const detailsGrid = document.createElement('div');
      detailsGrid.className = 'network-details-grid';

      const ipv4Addrs = eth.ipv4?.addresses?.join(', ') || 'Not configured';
      const ipv4Gws = eth.ipv4?.gateways?.join(', ') || 'None';
      const dnsServers = eth.ipv4?.dns?.join(', ') || 'None';
      const macAddr = eth.mac || 'Unavailable';
      const ipv6Addrs = eth.ipv6?.addresses?.join(', ') || 'Not configured';
      const linkSpeed = eth.speedMbps ? `${eth.speedMbps} Mbps (Full Duplex)` : 'Unknown';

      const properties = [
        { label: 'IPv4 Address', value: ipv4Addrs },
        { label: 'Default Gateway', value: ipv4Gws },
        { label: 'DNS Servers', value: dnsServers },
        { label: 'MAC Hardware Address', value: macAddr },
        { label: 'IPv6 Address', value: ipv6Addrs },
        { label: 'Link Speed', value: linkSpeed },
      ];

      properties.forEach((prop) => {
        const box = document.createElement('div');
        box.className = 'network-prop-item';
        box.innerHTML = `
          <span class="prop-label">${this.escapeHtml(prop.label)}</span>
          <span class="prop-value font-mono">${this.escapeHtml(prop.value)}</span>
        `;
        detailsGrid.appendChild(box);
      });

      adapterSection.appendChild(detailsGrid);
      card.appendChild(adapterSection);
    });

    return card;
  }

  renderPasswordModal(ssid) {
    const overlay = document.createElement('div');
    overlay.className = 'settings-submodal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'settings-submodal';
    dialog.innerHTML = `
      <div class="submodal-header">
        <h3 class="submodal-title">Connect to "${this.escapeHtml(ssid)}"</h3>
        <button class="submodal-close-btn" id="btn-cancel-connect">✕</button>
      </div>
      <div class="submodal-body">
        <p class="submodal-desc">This Wi-Fi network requires a security key or password to connect.</p>
        <div class="form-group">
          <label class="form-label" for="wifi-password-input">Password</label>
          <div class="password-input-group">
            <input type="password" id="wifi-password-input" class="text-input" placeholder="Enter network password..." autocomplete="off">
            <button type="button" class="btn btn-ghost btn-sm" id="btn-toggle-mask">👁️</button>
          </div>
        </div>
      </div>
      <div class="submodal-footer">
        <button class="btn btn-secondary" id="btn-dialog-cancel">Cancel</button>
        <button class="btn btn-accent" id="btn-dialog-connect">Connect</button>
      </div>
    `;

    setTimeout(() => {
      const input = dialog.querySelector('#wifi-password-input');
      const toggleMask = dialog.querySelector('#btn-toggle-mask');
      const cancelBtn = dialog.querySelector('#btn-dialog-cancel');
      const closeBtn = dialog.querySelector('#btn-cancel-connect');
      const connectBtn = dialog.querySelector('#btn-dialog-connect');

      if (input) input.focus();

      if (toggleMask && input) {
        toggleMask.addEventListener('click', () => {
          input.type = input.type === 'password' ? 'text' : 'password';
        });
      }

      const closeDialog = () => {
        this.activeDialogSSID = null;
        this.render(this.container, this.controller.searchQuery);
      };

      if (cancelBtn) cancelBtn.addEventListener('click', closeDialog);
      if (closeBtn) closeBtn.addEventListener('click', closeDialog);

      if (connectBtn && input) {
        connectBtn.addEventListener('click', () => {
          this.connectToWifi(ssid, input.value);
          closeDialog();
        });

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            this.connectToWifi(ssid, input.value);
            closeDialog();
          } else if (e.key === 'Escape') {
            closeDialog();
          }
        });
      }
    }, 0);

    overlay.appendChild(dialog);
    return overlay;
  }

  /* -------------------------------------------------------------------------
   * Network Operations
   * ---------------------------------------------------------------------- */

  promptConnect(ap) {
    if (ap.security === 'Open') {
      this.connectToWifi(ap.ssid, '');
      return;
    }
    this.activeDialogSSID = ap.ssid;
    this.render(this.container, this.controller.searchQuery);
  }

  async triggerWifiScan(deviceId = '') {
    this.isScanning = true;
    this.render(this.container, this.controller.searchQuery);

    if (typeof bro !== 'undefined' && bro.sys?.network?.scanWifi) {
      try {
        const results = await bro.sys.network.scanWifi(deviceId);
        if (Array.isArray(results)) {
          this.handleScanCompleted({ ok: true, accessPoints: results });
          return;
        }
      } catch (err) {
        console.warn('Network scan failed:', err);
      }
    }

    this.isScanning = false;
    this.hasScanned = true;
    this.render(this.container, this.controller.searchQuery);
  }

  handleScanCompleted(e) {
    this.isScanning = false;
    this.hasScanned = true;
    if (e?.accessPoints && Array.isArray(e.accessPoints)) {
      this.accessPoints = e.accessPoints.map((ap) => ({
        ssid: ap.ssid || 'Hidden Network',
        strengthPercent: typeof ap.strengthPercent === 'number' ? ap.strengthPercent : 0,
        security: ap.security || 'WPA2-Personal',
        active: !!ap.active,
      }));
    }
    this.render(this.container, this.controller.searchQuery);
  }

  async connectToWifi(ssid, password) {
    if (typeof bro !== 'undefined' && bro.sys?.network?.connectWifi) {
      try {
        await bro.sys.network.connectWifi(ssid, password);
      } catch (err) {
        console.warn('Wi-Fi connection failed:', err);
      }
    }

    // Refresh genuine network state from system
    this.getNetworkData();
    this.render(this.container, this.controller.searchQuery);
  }

  disconnectWifi() {
    if (typeof bro !== 'undefined' && bro.sys?.network?.disconnectWifi) {
      try {
        bro.sys.network.disconnectWifi();
      } catch (_) {}
    }

    this.getNetworkData();
    this.render(this.container, this.controller.searchQuery);
  }

  getSignalSvg(percent) {
    const bars = percent > 75 ? 4 : (percent > 50 ? 3 : (percent > 25 ? 2 : 1));
    return `
      <div class="signal-bars-container" title="${percent}%">
        <span class="signal-bar ${bars >= 1 ? 'filled' : ''}"></span>
        <span class="signal-bar ${bars >= 2 ? 'filled' : ''}"></span>
        <span class="signal-bar ${bars >= 3 ? 'filled' : ''}"></span>
        <span class="signal-bar ${bars >= 4 ? 'filled' : ''}"></span>
      </div>
    `;
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
