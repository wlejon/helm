/**
 * About this computer, from the system's own records: os-release, the
 * kernel, DMI, /proc/cpuinfo and /proc/meminfo, the GPU's PCI ids looked up
 * in hwdata's pci.ids, the displays, uptime.
 */

import { h } from '../../util.js';
import { icon } from '../../icons.js';
import { section, row, chip } from '../widgets.js';

function field(text, key) {
  const m = new RegExp(`^${key}="?([^"\\n]*)"?`, 'm').exec(text || '');
  return m ? m[1].trim() : '';
}

function trimmed(b, path) {
  const t = b.readText(path);
  return t ? t.trim() : '';
}

/** Placeholder strings firmware ships when it has nothing to say. */
const BLANK = /^(to be filled|default string|system product name|system manufacturer|not specified|none|o\.e\.m\.?)/i;

function device(b) {
  const vendor = trimmed(b, '/sys/class/dmi/id/sys_vendor');
  const product = trimmed(b, '/sys/class/dmi/id/product_name');
  const parts = [vendor, product].filter((x) => x && !BLANK.test(x));
  return parts.join(' ');
}

function cpu(b) {
  const info = b.readText('/proc/cpuinfo') || '';
  const model = (/^model name\s*:\s*(.+)$/m.exec(info) || [])[1] || '';
  const threads = (info.match(/^processor\s*:/gm) || []).length;
  const cores = Number((/^cpu cores\s*:\s*(\d+)/m.exec(info) || [])[1]) || 0;
  if (!model) return '';
  const count = cores && threads && cores !== threads ? `${cores} cores, ${threads} threads` : threads ? `${threads} cores` : '';
  return [model.replace(/\s+/g, ' '), count].filter(Boolean).join(' · ');
}

function memory(b) {
  const kb = Number((/^MemTotal:\s*(\d+)/m.exec(b.readText('/proc/meminfo') || '') || [])[1]);
  if (!kb) return '';
  return `${(kb / 1024 / 1024).toFixed(kb > 8 * 1024 * 1024 ? 0 : 1)} GB`;
}

let pciIds = null;

/** Vendor and device names for a PCI id pair, from hwdata's pci.ids. */
function pciName(b, vendor, dev) {
  if (pciIds === null) pciIds = b.readText('/usr/share/hwdata/pci.ids') || b.readText('/usr/share/misc/pci.ids') || '';
  const v = pciIds.indexOf(`\n${vendor}  `);
  if (v < 0) return null;
  const vendorName = pciIds.slice(v + vendor.length + 3, pciIds.indexOf('\n', v + 1)).trim();
  const next = pciIds.slice(v + 1).search(/\n[0-9a-f]{4} {2}/);
  const block = pciIds.slice(v, next < 0 ? undefined : v + 1 + next);
  const m = new RegExp(`\\n\\t${dev}  ([^\\n]+)`).exec(block);
  return { vendor: vendorName, device: m ? m[1].trim() : '' };
}

const SHORT_VENDOR = { 'Advanced Micro Devices, Inc. [AMD/ATI]': 'AMD', 'NVIDIA Corporation': 'NVIDIA', 'Intel Corporation': 'Intel' };

/**
 * pci.ids lists every marketing name a chip ships under ("[Radeon Graphics /
 * Radeon 8050S Graphics / Radeon 8060S Graphics]"); keep the one the CPU's
 * own model names, else drop the list.
 */
function narrow(name, hint) {
  return name.replace(/\s*\[([^\]]*\/[^\]]*)\]/, (all, list) => {
    const pick = list.split('/').map((x) => x.trim()).find((o) => {
      const token = o.replace(/\b(Radeon|Graphics|GeForce|Intel|AMD)\b/g, '').trim();
      return token && hint.includes(token);
    });
    return pick ? ` [${pick}]` : '';
  });
}

function gpus(b) {
  const hint = (/^model name\s*:\s*(.+)$/m.exec(b.readText('/proc/cpuinfo') || '') || [])[1] || '';
  const out = [];
  for (const card of b.listDir('/sys/class/drm').filter((n) => /^card\d+$/.test(n)).sort()) {
    const uevent = b.readText(`/sys/class/drm/${card}/device/uevent`) || '';
    const id = (/^PCI_ID=([0-9A-Fa-f]{4}):([0-9A-Fa-f]{4})/m.exec(uevent) || []);
    const driver = (/^DRIVER=(.+)$/m.exec(uevent) || [])[1] || '';
    if (!id[1]) continue;
    const names = pciName(b, id[1].toLowerCase(), id[2].toLowerCase());
    const name = names && names.device ? `${SHORT_VENDOR[names.vendor] || names.vendor} ${narrow(names.device, hint)}` : `PCI ${id[1]}:${id[2]}`;
    out.push(driver ? `${name} · ${driver}` : name);
  }
  return Array.from(new Set(out));
}

function uptime(b) {
  const s = Number((b.readText('/proc/uptime') || '').split(' ')[0]);
  if (!s) return '';
  const d = Math.floor(s / 86400);
  const hr = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d ? `${d} day${d === 1 ? '' : 's'}` : null, hr ? `${hr} hour${hr === 1 ? '' : 's'}` : null, `${m} minute${m === 1 ? '' : 's'}`]
    .filter(Boolean).slice(0, 2).join(', ');
}

function displaysLine(b) {
  return b.displays().map((d) => {
    const m = d.currentMode || {};
    const name = (d.edid && d.edid.monitorName) || d.name;
    return `${name} · ${m.width} × ${m.height} at ${Math.round(m.refreshRate || 0)} Hz`;
  }).join('\n');
}

function info(label, value, glyph, anchor) {
  if (!value) return null;
  return row({ anchor, glyph, title: label, control: h('span.st-value', value), cls: 'st-row-info' });
}

export default {
  id: 'about',
  title: 'About',
  glyph: 'info',
  blurb: 'This computer and its software',
  keywords: 'system information specs version hardware',
  available: () => true,
  items: [
    { id: 'os', label: 'Operating system version', keywords: 'distribution linux release' },
    { id: 'kernel', label: 'Kernel version', keywords: 'linux' },
    { id: 'cpu', label: 'Processor', keywords: 'cpu cores threads' },
    { id: 'memory', label: 'Memory', keywords: 'ram' },
    { id: 'gpu', label: 'Graphics', keywords: 'gpu video card' },
    { id: 'hostname', label: 'Computer name', keywords: 'hostname device name' },
  ],
  render(ctx) {
    const b = ctx.b;
    const osr = b.readText('/etc/os-release') || '';
    const os = field(osr, 'PRETTY_NAME') || field(osr, 'NAME') || 'Linux';
    const build = field(osr, 'BUILD_ID');
    const version = field(osr, 'VERSION') || (build === 'rolling' ? 'rolling release' : build);
    const host = ctx.shell.hostname || trimmed(b, '/proc/sys/kernel/hostname');
    const dev = device(b);
    const mode = (typeof bro !== 'undefined' && bro.window && bro.window.displayMode) || '';
    const head = h('div.st-about',
      h('span.st-about-mark', icon('helm')),
      h('div.st-about-text',
        h('span.st-about-host', host || 'This computer'),
        h('span.st-about-os', [os, version && !os.includes(version) ? version : null].filter(Boolean).join(', ')),
        dev ? h('span.st-about-dev', dev) : null),
      mode ? chip(mode === 'drm' ? 'Running on DRM' : `Running ${mode}`, 'accent') : null);
    head.dataset.anchor = 'hostname';
    const hw = section('Hardware', [
      info('Processor', cpu(b), 'calculator', 'cpu'),
      info('Memory', memory(b), 'layers', 'memory'),
      ...gpus(b).map((g, i) => info(i ? 'Graphics' : 'Graphics', g, 'monitor', i ? null : 'gpu')),
      info('Displays', displaysLine(b), 'monitor', 'displays'),
    ]);
    const sw = section('Software', [
      info('Operating system', os, 'layers', 'os'),
      info('Kernel', trimmed(b, '/proc/sys/kernel/osrelease'), 'terminal', 'kernel'),
      info('Desktop', 'Helm on the bro runtime', 'helm', 'desktop'),
      info('Signed in as', ctx.shell.username, 'user', 'user'),
      info('Up for', uptime(b), 'calendar', 'uptime'),
    ]);
    return [head, hw, sw];
  },
};
