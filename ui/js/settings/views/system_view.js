/**
 * System & Hardware Information View
 * Displays detailed OS, processor, GPU hardware, memory, uptime counter,
 * and specs clipboard copy integration.
 */

import { h, clear } from '../../dom.js';
import { createIcon } from '../settings_icons.js';
import { viewHeader, settingsCard } from '../components.js';

export class SystemView {
  constructor(controller) {
    this.controller = controller;
    this.container = null;
    this.uptimeInterval = null;
    this.bootTimestamp = 0;
  }

  init() {}

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
    let cpuDesc = cpuCores ? `${cpuCores} Logical Compute Cores` : 'Multi-Core Processor';

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

    // Node's os module (brokit) knows the real machine; the navigator guesses.
    const host = hostOs();
    if (host) {
      if (host.os) osPlatform = host.os;
      if (host.cpu) cpuDesc = host.cpu;
      if (host.memory) ramTotal = host.memory;
      if (host.kernel) kernelDesc = host.kernel;
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
        h('h2.view-title', null, 'About'),
        h('p.view-subtitle', null, 'This computer and the software running it.')
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
          h('p.system-brand-subtitle', null, info.version)
        )
      )
    );
    container.appendChild(overviewCard);

    // 2. Hardware Specs Grid Card
    const specItems = [
      { label: 'Operating System', icon: 'window', val: info.os },
      { label: 'Kernel', icon: 'system', val: info.kernel },
      { label: 'Processor', icon: 'cpu', val: info.cpu },
      { label: 'Graphics', icon: 'gpu', val: info.gpu },
      { label: 'Memory', icon: 'ram', val: info.memory },
      { label: 'Display', icon: 'display', val: info.resolution },
      { label: 'Uptime', icon: 'uptime', val: this.formatUptime(), isUptime: true },
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
    // Boot time from /proc/uptime, read on first use (require is not
    // available yet while the modules are still loading).
    if (!this.bootTimestamp) {
      const host = hostOs();
      this.bootTimestamp = host && host.uptime ? Date.now() - host.uptime * 1000 : Date.now() - Math.floor(performance.now());
    }
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

    if (window.helm?.notify?.post) {
      window.helm.notify.post({
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

/**
 * Host facts. brokit's os module covers type/platform only, so the rest comes
 * from /etc/os-release and /proc where they exist (Linux).
 */
function hostOs() {
  if (typeof require !== 'function') return null;
  let fs = null;
  let os = null;
  try { fs = require('fs'); } catch (_) {}
  try { os = require('os'); } catch (_) {}
  const read = (path) => {
    try { return fs ? String(fs.readFileSync(path, 'utf8')) : ''; } catch (_) { return ''; }
  };
  const out = {};
  const rel = /^PRETTY_NAME="?([^"\n]*)"?/m.exec(read('/etc/os-release'));
  const type = os && typeof os.type === 'function' ? os.type() : '';
  out.os = (rel && rel[1]) || type || '';
  const kernel = read('/proc/sys/kernel/osrelease').trim();
  if (kernel) out.kernel = `${type || 'Linux'} ${kernel}`;
  const cpuinfo = read('/proc/cpuinfo');
  const model = /^model name\s*:\s*(.+)$/m.exec(cpuinfo);
  const threads = (cpuinfo.match(/^processor\s*:/gm) || []).length;
  if (model) out.cpu = threads ? `${model[1].trim()} · ${threads} threads` : model[1].trim();
  const mem = /^MemTotal:\s*(\d+)\s*kB/m.exec(read('/proc/meminfo'));
  if (mem) out.memory = `${Math.round(Number(mem[1]) / (1024 * 1024))} GB`;
  const up = parseFloat(read('/proc/uptime'));
  if (up > 0) out.uptime = up;
  return out;
}
