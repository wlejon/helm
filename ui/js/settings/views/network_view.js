/**
 * Network & Internet Settings View
 * Manages Ethernet adapters, Wi-Fi scanning with signal bars, SSID connection modal,
 * and IP/DNS configuration details.
 */

export class NetworkView {
  constructor(controller) {
    this.controller = controller;
    this.container = null;
    this.isScanning = false;
    this.wifiEnabled = true;
    this.accessPoints = [];
    this.activeDialogSSID = null;
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

    // Default structure with fallbacks
    const ethernet = {
      interfaceName: 'eth0',
      description: 'Intel Ethernet Connection I219-LM (Gigabit)',
      state: 'connected',
      speedMbps: 1000,
      mac: 'E8:9C:25:A4:7B:12',
      ipv4: {
        addresses: ['192.168.1.145/24'],
        gateways: ['192.168.1.1'],
        dns: ['1.1.1.1', '8.8.8.8'],
      },
      ipv6: {
        addresses: ['2600:1700:8450:4120::24/64', 'fe80::eabc:25ff:fea4:7b12/64'],
        gateways: ['fe80::1'],
        dns: ['2606:4700:4700::1111'],
      }
    };

    let wifiDevice = null;

    if (rawState && Array.isArray(rawState.devices)) {
      this.wifiEnabled = rawState.wifiEnabled !== false;

      const ethDev = rawState.devices.find((d) => d.type === 'ethernet' || d.type === 'wired');
      if (ethDev) {
        ethernet.interfaceName = ethDev.interfaceName || ethDev.id;
        ethernet.description = ethDev.description || ethDev.interfaceName;
        ethernet.state = ethDev.state || 'connected';
        ethernet.speedMbps = ethDev.speedMbps || 1000;
        ethernet.mac = ethDev.mac || ethernet.mac;
        if (ethDev.ipv4) ethernet.ipv4 = ethDev.ipv4;
        if (ethDev.ipv6) ethernet.ipv6 = ethDev.ipv6;
      }

      wifiDevice = rawState.devices.find((d) => d.type === 'wifi' || d.type === 'wireless');
    }

    return { ethernet, wifiDevice };
  }

  getAccessPointsList(deviceId = '') {
    if (this.accessPoints.length > 0) return this.accessPoints;

    if (typeof bro !== 'undefined' && bro.sys?.network?.getAccessPoints) {
      try {
        const aps = bro.sys.network.getAccessPoints(deviceId);
        if (Array.isArray(aps) && aps.length > 0) {
          this.accessPoints = aps.map((ap) => ({
            ssid: ap.ssid || 'Hidden Network',
            bssid: ap.bssid,
            strengthPercent: ap.strengthPercent || 80,
            security: ap.security || 'WPA2-Personal',
            active: !!ap.active,
          }));
          return this.accessPoints;
        }
      } catch (_) {}
    }

    // Default simulated Wi-Fi networks
    this.accessPoints = [
      { ssid: 'Helm_Office_5G', strengthPercent: 95, security: 'WPA3/WPA2', active: true },
      { ssid: 'Google_Guest', strengthPercent: 78, security: 'Open', active: false },
      { ssid: 'Studio_Lab_Mesh', strengthPercent: 82, security: 'WPA2-Enterprise', active: false },
      { ssid: 'Starlink_Orbit_2.4', strengthPercent: 64, security: 'WPA2-Personal', active: false },
      { ssid: 'CoffeeShop_Free_WiFi', strengthPercent: 42, security: 'Open', active: false },
    ];

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
        <p class="view-subtitle">Monitor wired Ethernet interfaces, scan nearby Wi-Fi networks, and manage IP configuration.</p>
      </div>
    `;
    container.appendChild(header);

    const { ethernet, wifiDevice } = this.getNetworkData();
    const aps = this.getAccessPointsList(wifiDevice?.id);

    // 1. Wi-Fi Scanner Card
    const wifiCard = this.renderWifiCard(aps, wifiDevice);
    container.appendChild(wifiCard);

    // 2. Ethernet Adapter Status Card
    const ethCard = this.renderEthernetCard(ethernet);
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
        <p class="card-description">Connect to wireless networks and discover nearby access points.</p>
      </div>
      <div class="card-header-actions">
        <button class="btn btn-secondary btn-sm" id="btn-scan-wifi" ${this.isScanning ? 'disabled' : ''}>
          ${this.isScanning ? '🔄 Scanning...' : '🔍 Scan Networks'}
        </button>
      </div>
    `;
    card.appendChild(header);

    const scanBtn = header.querySelector('#btn-scan-wifi');
    if (scanBtn) {
      scanBtn.addEventListener('click', () => this.triggerWifiScan(wifiDevice?.id));
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
          ${ap.security === 'Open' ? '<span class="badge badge-dim">Open</span>' : '<span class="badge badge-dim">🔒 ' + ap.security + '</span>'}
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

  renderEthernetCard(eth) {
    const card = document.createElement('section');
    card.className = 'settings-card network-ethernet-card';

    const header = document.createElement('div');
    header.className = 'settings-card-header';
    header.innerHTML = `
      <div class="card-header-icon">🌐</div>
      <div class="card-header-text">
        <h3 class="card-title">Ethernet Adapter (${this.escapeHtml(eth.interfaceName)})</h3>
        <p class="card-description">${this.escapeHtml(eth.description)}</p>
      </div>
      <span class="badge ${eth.state === 'connected' ? 'badge-success' : 'badge-danger'}">
        ${eth.state === 'connected' ? 'Connected • ' + eth.speedMbps + ' Mbps' : 'Disconnected'}
      </span>
    `;
    card.appendChild(header);

    const detailsGrid = document.createElement('div');
    detailsGrid.className = 'network-details-grid';

    const properties = [
      { label: 'IPv4 Address', value: eth.ipv4?.addresses?.[0] || '192.168.1.145/24' },
      { label: 'Default Gateway', value: eth.ipv4?.gateways?.[0] || '192.168.1.1' },
      { label: 'DNS Servers', value: eth.ipv4?.dns?.join(', ') || '1.1.1.1, 8.8.8.8' },
      { label: 'MAC Hardware Address', value: eth.mac || 'E8:9C:25:A4:7B:12' },
      { label: 'IPv6 Address', value: eth.ipv6?.addresses?.[0] || '2600:1700:8450:4120::24/64' },
      { label: 'Link Speed', value: `${eth.speedMbps} Mbps (Full Duplex)` },
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

    card.appendChild(detailsGrid);
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
        <p class="submodal-desc">This Wi-Fi network requires a WPA password or security key to connect.</p>
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

    // Simulated scan duration
    setTimeout(() => {
      this.isScanning = false;
      this.render(this.container, this.controller.searchQuery);
    }, 1200);
  }

  handleScanCompleted(e) {
    this.isScanning = false;
    if (e?.accessPoints && Array.isArray(e.accessPoints)) {
      this.accessPoints = e.accessPoints.map((ap) => ({
        ssid: ap.ssid || 'Hidden Network',
        strengthPercent: ap.strengthPercent || 70,
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

    // Update active state in local access points
    this.accessPoints.forEach((ap) => {
      ap.active = (ap.ssid === ssid);
    });

    this.render(this.container, this.controller.searchQuery);
  }

  disconnectWifi() {
    if (typeof bro !== 'undefined' && bro.sys?.network?.disconnectWifi) {
      try {
        bro.sys.network.disconnectWifi();
      } catch (_) {}
    }

    this.accessPoints.forEach((ap) => { ap.active = false; });
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
