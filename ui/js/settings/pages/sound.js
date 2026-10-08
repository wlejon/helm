/**
 * Sound: the default output and input with their levels, every device to
 * choose between, and the level of each app playing sound. Devices come from
 * bro.sys.audio (PipeWire; bro.pulse when that is missing), apps from
 * bro.pulse.
 */

import { h, appIcon } from '../../util.js';
import { icon } from '../../icons.js';
import { section, row, slider, empty } from '../widgets.js';

function deviceGlyph(d, direction) {
  const n = `${d.name} ${d.formFactor}`.toLowerCase();
  if (direction === 'input') return /head/.test(n) ? 'headphones' : 'mic';
  if (/head|bluez/.test(n)) return 'headphones';
  if (/hdmi|displayport|monitor/.test(n)) return 'monitor';
  return 'speaker';
}

function volumeGlyph(v, muted) {
  if (muted || v <= 0.001) return 'volume-x';
  if (v < 0.34) return 'volume-0';
  if (v < 0.67) return 'volume-1';
  return 'volume-2';
}

/** The default device's level: mute button, slider, readout. */
function level(ctx, dev, direction) {
  const b = ctx.b;
  const mute = h('button.icon-btn.filled', { title: dev.muted ? 'Unmute' : 'Mute', disabled: !dev.hasVolume },
    icon(direction === 'input' ? (dev.muted ? 'mic-off' : 'mic') : volumeGlyph(dev.volume, dev.muted)));
  mute.classList.toggle('st-muted', dev.muted);
  mute.addEventListener('click', () => b.setDeviceMuted(dev.id, !dev.muted));
  const s = slider(ctx, {
    value: dev.volume,
    muted: dev.muted,
    disabled: !dev.hasVolume,
    onInput: (v) => b.setDeviceVolume(dev.id, v),
  });
  return h('div.st-level', mute, s.el);
}

function devicePage(ctx, direction) {
  const b = ctx.b;
  const list = b.devices(direction);
  const isOut = direction === 'output';
  const title = isOut ? 'Output' : 'Input';
  if (list.length === 0) {
    return section(title, h('div.st-row.st-row-empty', empty(isOut ? 'volume-x' : 'mic',
      isOut ? 'No output devices' : 'No microphones', isOut
        ? 'Plug in speakers or headphones; they appear here when PipeWire sees them'
        : 'Plug in a microphone or headset; it appears here when PipeWire sees it')),
    { anchor: isOut ? 'output' : 'input' });
  }
  const def = list.find((d) => d.isDefault) || list[0];
  const head = row({
    anchor: isOut ? 'output-volume' : 'input-volume',
    glyph: isOut ? volumeGlyph(def.volume, def.muted) : (def.muted ? 'mic-off' : 'mic'),
    title: isOut ? 'Output volume' : 'Input level',
    desc: def.muted ? `${def.name} · muted` : def.name,
    below: level(ctx, def, direction),
  });
  const rows = [head];
  if (list.length > 1) {
    for (const d of list) {
      rows.push(row({
        glyph: deviceGlyph(d, direction),
        title: d.name,
        desc: d.isDefault ? 'In use' : null,
        control: d.isDefault ? icon('check', 'st-check') : null,
        selected: d.isDefault,
        onClick: d.isDefault ? null : () => b.setDefaultDevice(d.id, direction),
        cls: 'st-row-choice',
      }));
    }
  }
  return section(title, rows, {
    anchor: isOut ? 'output' : 'input',
    aside: list.length > 1 ? h('span.st-section-meta', `${list.length} devices · choose one to use it`) : null,
  });
}

function apps(ctx) {
  const b = ctx.b;
  const streams = b.streams();
  if (streams === null) return null;
  const rows = streams.map((st) => {
    const mute = h('button.icon-btn', { title: st.muted ? 'Unmute' : 'Mute' }, icon(volumeGlyph(st.volume, st.muted)));
    mute.classList.toggle('st-muted', st.muted);
    mute.addEventListener('click', () => b.setStreamMuted(st.id, !st.muted));
    const s = slider(ctx, { value: st.volume, muted: st.muted, onInput: (v) => b.setStreamVolume(st.id, v) });
    const r = row({ glyph: appIcon(st.icon, st.name, 32, 'st-app-icon'), title: st.name, cls: 'st-row-app' });
    r.appendChild(h('div.st-level.compact', mute, s.el));
    return r;
  });
  return section('Applications', rows.length ? rows : h('div.st-row.st-row-empty',
    empty('music', 'Nothing is playing', 'Apps show up here with their own volume while they play sound')),
  { anchor: 'apps' });
}

export default {
  id: 'sound',
  title: 'Sound',
  glyph: 'volume-2',
  blurb: 'Speakers, microphones and how loud each app plays',
  keywords: 'audio',
  available: (b) => b.hasSound(),
  topics: ['audio', 'streams'],
  items: [
    { id: 'output-volume', label: 'Output volume', keywords: 'loudness speaker mute' },
    { id: 'output', label: 'Output device', keywords: 'speakers headphones hdmi default sink' },
    { id: 'input-volume', label: 'Input level', keywords: 'microphone mic gain mute' },
    { id: 'input', label: 'Input device', keywords: 'microphone mic default source' },
    { id: 'apps', label: 'App volume', keywords: 'application stream mixer per-app' },
  ],
  render(ctx) {
    return [devicePage(ctx, 'output'), devicePage(ctx, 'input'), apps(ctx)];
  },
};
