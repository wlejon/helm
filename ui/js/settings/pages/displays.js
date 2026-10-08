/**
 * Displays (bro.displays): every connected output drawn where it sits, with
 * its mode, scale, size and EDID identity, plus night light and brightness
 * where the hardware has them. Modes are shown, not changed: bro.displays
 * can only apply a configuration through Wayland output management or X11,
 * and a DRM session reads its outputs from sysfs.
 */

import { h } from '../../util.js';
import { section, row, switchRow, slider, chip, facts, fact, segmented } from '../widgets.js';

const nameOf = (d) => (d.edid && d.edid.monitorName) || d.model || d.name || d.id;

function inches(d) {
  const wmm = d.physicalWidthMm || (d.edid && d.edid.widthCm ? d.edid.widthCm * 10 : 0);
  const hmm = d.physicalHeightMm || (d.edid && d.edid.heightCm ? d.edid.heightCm * 10 : 0);
  if (!wmm || !hmm) return '';
  return `${(Math.hypot(wmm, hmm) / 25.4).toFixed(1)}″`;
}

function hz(r) {
  return `${Math.round(r * 100) / 100} Hz`;
}

/** The outputs as boxes, scaled to fit, where they sit relative to each other. */
function arrangement(list) {
  const geo = list.map((d) => d.geometry || { x: 0, y: 0, width: d.currentMode.width, height: d.currentMode.height });
  const minX = Math.min(...geo.map((g) => g.x));
  const minY = Math.min(...geo.map((g) => g.y));
  const w = Math.max(...geo.map((g) => g.x + g.width)) - minX;
  const ht = Math.max(...geo.map((g) => g.y + g.height)) - minY;
  const scale = Math.min(520 / w, 150 / ht);
  const stage = h('div.st-arrange', { style: { height: `${Math.round(ht * scale) + 48}px` } });
  const inner = h('div.st-arrange-inner', { style: { width: `${Math.round(w * scale)}px`, height: `${Math.round(ht * scale)}px` } });
  list.forEach((d, i) => {
    const g = geo[i];
    const box = h('div.st-screen', {
      style: {
        left: `${Math.round((g.x - minX) * scale)}px`,
        top: `${Math.round((g.y - minY) * scale)}px`,
        width: `${Math.round(g.width * scale) - 6}px`,
        height: `${Math.round(g.height * scale) - 6}px`,
      },
    }, h('span.st-screen-name', nameOf(d)), h('span.st-screen-mode', `${g.width} × ${g.height}`));
    box.classList.toggle('primary', !!d.isPrimary);
    inner.appendChild(box);
  });
  stage.appendChild(inner);
  return stage;
}

function displayRow(d) {
  const m = d.currentMode || {};
  const modes = d.availableModes || d.modes || [];
  const best = modes.reduce((a, x) => (!a || x.width * x.height > a.width * a.height ? x : a), null);
  const scale = d.scaleFactor || (d.scale && d.scale.factor) || 1;
  const edid = d.edid || {};
  return row({
    glyph: 'monitor',
    title: nameOf(d),
    desc: [d.name !== nameOf(d) ? d.name : null, d.isInternal ? 'Built-in' : 'External', inches(d)].filter(Boolean).join(' · '),
    control: h('span.st-inline', d.isPrimary ? chip('Primary', 'accent') : null, d.isActive === false ? chip('Off', 'off') : null),
    tag: { dataset: { display: d.id } },
    below: facts([
    fact('Resolution', m.width ? `${m.width} × ${m.height}` : '', { mono: true }),
    fact('Refresh rate', m.refreshRate ? hz(m.refreshRate) : ''),
    fact('Scale', `${Math.round(scale * 100)}%`),
    fact('Position', d.geometry ? `${d.geometry.x}, ${d.geometry.y}` : '', { mono: true }),
    fact('Rotation', d.rotation ? `${d.rotation}°` : 'None'),
    fact('Modes', best ? `${modes.length}, up to ${best.width} × ${best.height}` : ''),
    fact('Manufacturer', edid.manufacturerId || d.manufacturer || ''),
    fact('HDR', d.hdr && d.hdr.supported ? (d.hdr.enabled ? 'On' : 'Supported') : ''),
  ]),
  });
}

const TEMPS = [
  { value: 5000, label: 'Mild' },
  { value: 4000, label: 'Warm' },
  { value: 3200, label: 'Warmer' },
];

function nightLight(ctx) {
  const b = ctx.b;
  const nl = b.nightLight();
  if (!nl.supported) return null;
  const temp = nl.temperature || 4000;
  const near = TEMPS.reduce((a, t) => (Math.abs(t.value - temp) < Math.abs(a.value - temp) ? t : a), TEMPS[0]);
  const warmth = row({ anchor: 'night-temp', glyph: 'sun', title: 'Warmth', desc: `${temp} K`,
    control: segmented(TEMPS, near.value, (v) => b.setNightLight({ enabled: nl.enabled, temperature: v })) });
  return section('Night light', [
    switchRow({ anchor: 'night-light', glyph: 'moon', title: 'Night light', desc: 'Warms the screen to go easier on your eyes at night' },
      nl.enabled, (on) => b.setNightLight({ enabled: on, temperature: temp })),
    nl.enabled ? warmth : null,
  ]);
}

function brightness(ctx) {
  const br = ctx.b.brightness();
  if (!br.available) return null;
  const s = slider(ctx, { glyph: 'sun', value: br.percent / 100, onInput: (v) => ctx.b.setBrightness(v) });
  return section('Brightness', row({ anchor: 'brightness', glyph: 'sun', title: 'Brightness',
    desc: 'The built-in screen’s backlight', below: h('div.st-level', s.el) }));
}

export default {
  id: 'displays',
  title: 'Displays',
  glyph: 'monitor',
  blurb: 'Screens, their resolution and scale',
  keywords: 'monitor screen',
  available: (b) => b.has('displays') && b.displays().length > 0,
  topics: ['display'],
  items: [
    { id: 'arrangement', label: 'Display arrangement', keywords: 'position layout monitors' },
    { id: 'resolution', label: 'Resolution and refresh rate', keywords: 'mode hz scale size' },
    { id: 'night-light', label: 'Night light', keywords: 'blue light warm temperature' },
    { id: 'brightness', label: 'Brightness', keywords: 'backlight dim' },
  ],
  /** Night light and brightness entries only exist where the hardware has them. */
  filterItems(b) {
    return (it) => (it.id === 'night-light' ? b.nightLight().supported : it.id === 'brightness' ? b.brightness().available : true);
  },
  render(ctx) {
    const list = ctx.b.displays();
    const n = list.length;
    const arr = section('Arrangement', h('div.st-row.st-row-art', arrangement(list)), {
      anchor: 'arrangement',
      aside: h('span.st-section-meta', n === 1 ? 'One display' : `${n} displays`),
    });
    const each = section(n === 1 ? 'Display' : 'Displays', list.map(displayRow), {
      anchor: 'resolution',
      note: 'Read from the display connectors. Changing resolution, scale or arrangement is not available here yet.',
    });
    return [arr, each, nightLight(ctx), brightness(ctx)];
  },
};
