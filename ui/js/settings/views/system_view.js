/**
 * System & Hardware Information View
 * Displays detailed OS, processor, GPU hardware, memory, uptime counter,
 * and specs clipboard copy integration.
 */

import { h, clear } from '../../dom.js';
import { createIcon } from '../../icons.js';
import { viewHeader, settingsCard } from '../components.js';

export class SystemView {
  constructor(controller) {
    this.controller = controller;
    this.container = null;
    this.uptimeInterval = null;
    this.bootTimestamp = Date.now() - Math.floor(performance.now());
  }

  init() {
    // If bro.server?.uptime exists, read genuine system uptime
    if (typeof bro !== 'undefined' && bro.server?.uptime) {
      try {
        const up = bro.server.uptime;
        if (typeof up === 'number' && up > 0) {
          this.bootTimestamp = Date.now() - up * 1000;
        }
      } catch (_) {}
    }
  }

  hasSearchMatches(query) {
    const q = query.toLowerCase();
    const terms = ['system', 'about', 'hardware', 'cpu', 'gpu', 'ram', 'memory', 'os', 'kernel', 'uptime', 'specs', 'helm', 'version'];
    return terms.some((t) => t.includes(q));
  }

  /* -------------------------------------------------------------------------
   * Data Gathering
   * ---------------------------------------------------------------------- */

  getSystemInfo() {
    let osPlatform = 'Unknown Host OS';
    if (navigator.userAgent.includes('Windows')) {
      osPlatform = 'Microsoft Windows';
      if (navigator.userAgent.includes('Win64') || navigator.userAgent.includes('x64')) {
        osPlatform += ' (64-bit)';
      }
    } else if (navigator.userAgent.includes('Linux')) {
      osPlatform = 'Linux Desktop';
    } else if (navigator.platform) {
      osPlatform = navigator.platform;
    }

    const cpuCores = navigator.hardwareConcurrency;
    const cpuDesc = cpuCores ? `${cpuCores} Logical Compute Cores` : 'Multi-Core Processor';

    let gpuName = 'Standard Graphics Adapter';
    let gpuVram = null;
    let gpuBackend = null;

    // Probe bro.gpu if available
    if (typeof bro !== 'undefined' && bro.gpu) {
      try {
        if (bro.gpu.backend) gpuBackend = String(bro.gpu.backend).toUpperCase();
        if (typeof bro.gpu.deviceName === 'function') {
          const dev = bro.gpu.deviceName('vulkan') || bro.gpu.deviceName('cuda') || bro.gpu.deviceName();
          if (dev) gpuName = dev;
        }
        if (typeof bro.gpu.memoryInfo === 'function') {
          const mem = bro.gpu.memoryInfo();
          if (mem && mem.total) {
            gpuVram = `${Math.round(mem.total / (1024 * 1024 * 1024))} GB`;
          }
        }
      } catch (_) {}
    }

    // Try WebGL unmasked renderer if bro.gpu didn't yield a name
    if (gpuName === 'Standard Graphics Adapter') {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          const dbg = gl.getExtension('WEBGL_debug_renderer_info');
          if (dbg) {
            const rend = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
            if (rend) gpuName = rend;
          } else {
            const rend = gl.getParameter(gl.RENDERER);
            if (rend) gpuName = rend;
          }
        }
      } catch (_) {}
    }

    const gpuParts = [gpuName];
    if (gpuVram) gpuParts.push(gpuVram);
    if (gpuBackend) gpuParts.push(gpuBackend);
    const gpuDesc = gpuParts.join(' · ');

    let ramTotal = 'System Memory (Managed)';
    if (navigator.deviceMemory) {
      ramTotal = `${navigator.deviceMemory} GB System RAM`;
    }

    let kernelDesc = 'Helm Desktop Substrate';
    if (typeof bro !== 'undefined') {
      if (bro.version) {
        kernelDesc = `Bronze Engine v${bro.version}`;
      } else if (bro.runtime?.version) {
        kernelDesc = `Bronze Runtime v${bro.runtime.version}`;
      }
    }

    const helmVersion = 'Helm Desktop v0.1.0';
    const dpi = Math.round((window.devicePixelRatio || 1) * 100);

    return {
      os: osPlatform,
      kernel: kernelDesc,
      cpu: cpuDesc,
      gpu: gpuDesc,
      memory: ramTotal,
      version: helmVersion,
      resolution: `${window.screen.width} × ${window.screen.height} (${dpi}% DPI)`,
    };
  }

  /* -------------------------------------------------------------------------
   * Rendering
   * ---------------------------------------------------------------------- */

  render(container, searchQuery = '') {
    this.container = container;
    this.stopUptime();
    clear(container);

    const info = this.getSystemInfo();

    const copyBtn = h('button.btn.btn-secondary.btn-sm#btn-copy-specs', {
      onclick: () => this.copySpecsToClipboard(info, copyBtn)
    }, createIcon('copy', 13), ' Copy Specs');

    const header = h('div.settings-view-header', null,
      h('div.view-header-titles', null,
        h('h2.view-title', null, 'System & Hardware Information'),
        h('p.view-subtitle', null, 'Detailed machine specifications, operating environment, and uptime metrics.')
      ),
      h('div.view-header-actions', null, copyBtn)
    );
    container.appendChild(header);

    // 1. Branding & Overview Card
    const overviewCard = h('section.settings-card.system-overview-card', null,
      h('div.system-brand-banner', null,
        h('div.system-brand-logo', null, '⎈'),
        h('div.system-brand-info', null,
          h('h3.system-brand-title', null, 'Helm Desktop Environment'),
          h('p.system-brand-subtitle', null, info.version),
          h('span.badge.badge-accent', null, 'Production Grade')
        )
      )
    );
    container.appendChild(overviewCard);

    // 2. Hardware Specs Grid Card
    const specItems = [
      { label: 'Operating System', icon: 'window', val: info.os },
      { label: 'Substrate Runtime', icon: 'system', val: info.kernel },
      { label: 'Processor (CPU)', icon: 'cpu', val: info.cpu },
      { label: 'Graphics Accelerator (GPU)', icon: 'gpu', val: info.gpu },
      { label: 'System Memory (RAM)', icon: 'ram', val: info.memory },
      { label: 'Active Display Surface', icon: 'display', val: info.resolution },
      { label: 'System Uptime', icon: 'uptime', val: this.formatUptime(), isUptime: true },
    ];

    const gridBoxes = specItems.map((item) => {
      const valProps = {
        class: `spec-value ${item.isUptime ? 'spec-uptime-value font-mono' : ''}`.trim()
      };
      if (item.isUptime) valProps.id = 'system-uptime-text';

      return h('div.system-spec-box', null,
        h('div.spec-box-header', null,
          h('span.spec-icon', null, createIcon(item.icon, 14)),
          h('span.spec-label', null, item.label)
        ),
        h('div', valProps, item.val)
      );
    });

    const specsCard = settingsCard({
      title: 'Hardware Specifications',
      desc: 'Core compute and rendering hardware detected on this workstation.',
      icon: 'system',
      className: 'system-specs-card'
    }, h('div.system-specs-grid', null, ...gridBoxes));

    container.appendChild(specsCard);
    this.startUptime();
  }

  /* -------------------------------------------------------------------------
   * Live Uptime & Copy Specs
   * ---------------------------------------------------------------------- */

  startUptime() {
    this.stopUptime();
    this.uptimeInterval = setInterval(() => {
      const el = document.getElementById('system-uptime-text');
      if (el) {
        el.textContent = this.formatUptime();
      }
    }, 1000);
  }

  stopUptime() {
    if (this.uptimeInterval) {
      clearInterval(this.uptimeInterval);
      this.uptimeInterval = null;
    }
  }

  formatUptime() {
    const elapsedSec = Math.max(0, Math.floor((Date.now() - this.bootTimestamp) / 1000));
    const days = Math.floor(elapsedSec / 86400);
    const hours = Math.floor((elapsedSec % 86400) / 3600);
    const minutes = Math.floor((elapsedSec % 3600) / 60);
    const seconds = elapsedSec % 60;

    const pad = (n) => String(n).padStart(2, '0');
    if (days > 0) {
      return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
    }
    return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  }

  copySpecsToClipboard(info, btnEl) {
    const text = [
      `Helm Desktop Specifications`,
      `===========================`,
      `Version: ${info.version}`,
      `OS: ${info.os}`,
      `Substrate: ${info.kernel}`,
      `CPU: ${info.cpu}`,
      `GPU: ${info.gpu}`,
      `RAM: ${info.memory}`,
      `Display: ${info.resolution}`,
      `Uptime: ${this.formatUptime()}`,
    ].join('\n');

    // 1. Try bro.clip
    if (typeof bro !== 'undefined' && bro.clip?.setText) {
      try {
        bro.clip.setText(text);
      } catch (_) {}
    } else if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }

    if (btnEl) {
      clear(btnEl);
      btnEl.appendChild(createIcon('check', 14));
      btnEl.appendChild(document.createTextNode(' Copied!'));
      btnEl.classList.add('btn-success');
      setTimeout(() => {
        clear(btnEl);
        btnEl.appendChild(createIcon('copy', 13));
        btnEl.appendChild(document.createTextNode(' Copy Specs'));
        btnEl.classList.remove('btn-success');
      }, 2000);
    }

    if (window.helm?.notify?.postNotification) {
      window.helm.notify.postNotification({
        summary: 'System Specifications Copied',
        body: 'Machine details copied to your clipboard.',
      });
    }
  }

  destroy() {
    this.stopUptime();
    this.container = null;
  }
}
