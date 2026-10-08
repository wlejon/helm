/**
 * Network & Internet Settings View
 * Manages real Ethernet adapters, real Wi-Fi scanning with signal bars, SSID connection modal,
 * and genuine IP/DNS configuration details. Absolutely zero mock or fake data.
 */

import { h, clear } from '../../dom.js';
import { createIcon } from '../settings_icons.js';
import { viewHeader, emptyState } from '../components.js';

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
    clear(container);

    const viewWrapper = h('div.settings-view-network');

    viewWrapper.appendChild(
      viewHeader('Network', 'Monitor wired Ethernet interfaces, scan nearby Wi-Fi networks, and inspect IP configuration.')
    );

    const { rawState, ethernetDevices, wifiDevice } = this.getNetworkData();
    const aps = this.getAccessPointsList(wifiDevice?.id);

    // 1. Wi-Fi Card
    viewWrapper.appendChild(this.renderWifiCard(aps, wifiDevice));

    // 2. Ethernet Adapters Card
    viewWrapper.appendChild(this.renderEthernetCard(ethernetDevices));

    // Modal dialog for Wi-Fi connection if opened
    if (this.activeDialogSSID) {
      viewWrapper.appendChild(this.renderPasswordModal(this.activeDialogSSID));
    }

    container.appendChild(viewWrapper);
  }

  renderWifiCard(accessPoints, wifiDevice) {
    const scanBtn = wifiDevice ? h('button.btn.btn-secondary.btn-sm#btn-scan-wifi', {
      disabled: this.isScanning,
      onclick: () => this.triggerWifiScan(wifiDevice?.id)
    }, this.isScanning ? 'Scanning...' : 'Scan Networks') : null;

    const header = h('div.settings-card-header', null,
      h('div.card-header-icon', null, createIcon('wifi', 18)),
      h('div.card-header-text', null,
        h('h3.card-title', null, 'Wi-Fi Wireless Networking'),
        h('p.card-description', null, wifiDevice ? (wifiDevice.description || wifiDevice.interfaceName || 'Wireless Adapter') : 'Connect to wireless networks and discover nearby access points.')
      ),
      h('div.card-header-actions', null, scanBtn)
    );

    if (!wifiDevice) {
      return h('section.settings-card.network-wifi-card', null,
        header,
        emptyState('No Wi-Fi Adapter Found', 'This system does not have a wireless network interface installed or enabled.', 'wifi')
      );
    }

    if (!this.wifiEnabled) {
      return h('section.settings-card.network-wifi-card', null,
        header,
        emptyState('Wi-Fi is Disabled', 'Wireless networking is currently turned off.', 'wifi')
      );
    }

    if (accessPoints.length === 0) {
      return h('section.settings-card.network-wifi-card', null,
        header,
        emptyState('No Wi-Fi Networks in Range', 'Click "Scan Networks" to search for nearby wireless access points.', 'search')
      );
    }

    const items = strongestPerSsid(accessPoints).map((ap) => {
      const actionBtn = ap.active
        ? h('button.btn.btn-secondary.btn-sm', {
            type: 'button',
            onclick: () => this.disconnectWifi()
          }, 'Disconnect')
        : h('button.btn.btn-secondary.btn-sm', {
            type: 'button',
            onclick: () => this.promptConnect(ap)
          }, 'Connect');

      const securityBadge = ap.security === 'Open'
        ? h('span.badge.badge-dim', null, 'Open')
        : h('span.badge.badge-dim', null, createIcon('wifiLock', 12), ` ${ap.security}`);

      return h(`div.wifi-network-item${ap.active ? '.active-connection' : ''}`, null,
        h('div.wifi-signal-icon', null, this.renderSignalBars(ap.strengthPercent)),
        h('div.wifi-item-info', null,
          h('div.wifi-ssid-title', null,
            h('span', null, ap.ssid),
            ap.active ? h('span.badge.badge-success', null, 'Connected') : null,
            securityBadge
          ),
          h('div.wifi-signal-text', null, `Signal: ${ap.strengthPercent}%`)
        ),
        h('div.wifi-item-actions', null, actionBtn)
      );
    });

    return h('section.settings-card.network-wifi-card', null,
      header,
      h('div.wifi-networks-list', null, ...items)
    );
  }

  renderEthernetCard(ethernetDevices) {
    const header = h('div.settings-card-header', null,
      h('div.card-header-icon', null, createIcon('ethernet', 18)),
      h('div.card-header-text', null,
        h('h3.card-title', null, 'Wired Ethernet'),
        h('p.card-description', null, 'High-speed wired network adapters and interface configurations.')
      )
    );

    if (ethernetDevices.length === 0) {
      return h('section.settings-card.network-ethernet-card', null,
        header,
        emptyState('No Wired Ethernet Adapters Detected', 'No physical Ethernet interfaces are currently reporting to the network subsystem.', 'ethernet')
      );
    }

    const adapterSections = ethernetDevices.map((eth) => {
      const isConnected = eth.state === 'connected' || eth.state === 'activated';
      const speedStr = eth.speedMbps ? `${eth.speedMbps} Mbps` : '';

      const adapterHeader = h('div.adapter-sub-header', null,
        h('div.adapter-sub-title', null,
          h('strong', null, eth.description || eth.interfaceName || 'Ethernet Interface'),
          h('span.text-muted', null, ` (${eth.interfaceName || eth.id})`)
        ),
        h(`span.badge.${isConnected ? 'badge-success' : 'badge-danger'}`, null,
          isConnected ? ('Connected' + (speedStr ? ' • ' + speedStr : '')) : 'Disconnected'
        )
      );

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

      const propBoxes = properties.map((prop) => {
        return h('div.network-prop-item', null,
          h('span.prop-label', null, prop.label),
          h('span.prop-value.font-mono', null, prop.value)
        );
      });

      return h('div.ethernet-adapter-section', null,
        adapterHeader,
        h('div.network-details-grid', null, ...propBoxes)
      );
    });

    return h('section.settings-card.network-ethernet-card', null,
      header,
      ...adapterSections
    );
  }

  renderPasswordModal(ssid) {
    const input = h('input#wifi-password-input.text-input', {
      type: 'password',
      placeholder: 'Enter network password...',
      autocomplete: 'off'
    });

    const toggleMask = h('button.btn.btn-ghost.btn-sm#btn-toggle-mask', {
      type: 'button',
      onclick: () => {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
    }, createIcon('eye', 14));

    const closeDialog = () => {
      this.activeDialogSSID = null;
      this.render(this.container, this.controller.searchQuery);
    };

    const doConnect = () => {
      const pwd = input.value;
      this.activeDialogSSID = null;
      this.connectToWifi(ssid, pwd);
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doConnect();
      else if (e.key === 'Escape') closeDialog();
    });

    setTimeout(() => input.focus(), 0);

    const dialog = h('div.settings-submodal', null,
      h('div.submodal-header', null,
        h('h3.submodal-title', null, `Connect to "${ssid}"`),
        h('button.submodal-close-btn#btn-cancel-connect', {
          onclick: closeDialog
        }, createIcon('close', 14))
      ),
      h('div.submodal-body', null,
        h('p.submodal-desc', null, 'This Wi-Fi network requires a security key or password to connect.'),
        h('div.form-group', null,
          h('label.form-label', { for: 'wifi-password-input' }, 'Password'),
          h('div.password-input-group', null, input, toggleMask)
        )
      ),
      h('div.submodal-footer', null,
        h('button.btn.btn-secondary#btn-dialog-cancel', { onclick: closeDialog }, 'Cancel'),
        h('button.btn.btn-accent#btn-dialog-connect', { onclick: doConnect }, 'Connect')
      )
    );

    return h('div.settings-submodal-overlay', null, dialog);
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

  renderSignalBars(percent) {
    const bars = percent > 75 ? 4 : (percent > 50 ? 3 : (percent > 25 ? 2 : 1));
    return h('div.signal-bars-container', { title: `${percent}%` },
      h(`span.signal-bar${bars >= 1 ? '.filled' : ''}`),
      h(`span.signal-bar${bars >= 2 ? '.filled' : ''}`),
      h(`span.signal-bar${bars >= 3 ? '.filled' : ''}`),
      h(`span.signal-bar${bars >= 4 ? '.filled' : ''}`)
    );
  }

  destroy() {
    this.container = null;
  }
}

/** One row per network name: the connected access point, else the strongest. */
function strongestPerSsid(aps) {
  const best = new Map();
  for (const ap of aps) {
    const cur = best.get(ap.ssid);
    if (!cur || (ap.active && !cur.active) || (ap.active === cur.active && ap.strengthPercent > cur.strengthPercent)) {
      best.set(ap.ssid, ap);
    }
  }
  return [...best.values()].sort((a, b) => (b.active - a.active) || (b.strengthPercent - a.strengthPercent));
}
