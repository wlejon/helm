/**
 * Bluetooth (BlueZ via bro.sys.bluetooth): the adapter's power, paired
 * devices with connect, disconnect and forget, and a search that lists new
 * devices to pair. Discovery stops when the page or Settings closes.
 */

import { h } from '../../util.js';
import { icon } from '../../icons.js';
import { section, row, switchRow, button, confirmButton, empty, chip } from '../widgets.js';

function glyphFor(d) {
  const i = (d.icon || '').toLowerCase();
  if (/audio|headset|headphone/.test(i)) return 'headphones';
  if (/keyboard/.test(i)) return 'keyboard';
  if (/phone/.test(i)) return 'smartphone';
  if (/computer/.test(i)) return 'monitor';
  return 'bluetooth';
}

const nameOf = (d) => d.alias || d.name || d.mac;

/** Run a BlueZ call, turning its exception into the row's error line. */
function act(ctx, mac, verb, fn) {
  const s = ctx.state;
  s.busy = mac;
  s.error = null;
  ctx.rerender();
  setTimeout(() => {
    try {
      fn();
    } catch (e) {
      s.error = { mac, text: `Could not ${verb}: ${String((e && e.message) || e).replace(/^.*?failed: /, '')}` };
    }
    s.busy = null;
    ctx.rerender();
  }, 0);
}

function deviceRow(ctx, d) {
  const b = ctx.b;
  const s = ctx.state;
  const busy = s.busy === d.mac;
  let control;
  if (busy) control = chip('Working…', 'accent');
  else if (d.connected) {
    control = h('span.st-inline',
      button('Disconnect', () => act(ctx, d.mac, 'disconnect', () => b.disconnectDevice(d.mac)), { kind: 'ghost' }));
  } else {
    control = h('span.st-inline',
      confirmButton('Forget', () => act(ctx, d.mac, 'forget the device', () => b.forgetDevice(d.mac)), { kind: 'ghost' }),
      button('Connect', () => act(ctx, d.mac, 'connect', () => b.connectDevice(d.mac))));
  }
  const r = row({
    glyph: glyphFor(d),
    title: nameOf(d),
    desc: [d.connected ? 'Connected' : 'Paired', d.trusted ? 'Trusted' : null].filter(Boolean).join(' · '),
    control,
    selected: d.connected,
    cls: 'st-row-choice',
    tag: { dataset: { mac: d.mac } },
  });
  return [r, s.error && s.error.mac === d.mac ? h('div.st-error.st-row-error', icon('alert'), s.error.text) : null];
}

function foundRow(ctx, d) {
  const s = ctx.state;
  const busy = s.busy === d.mac;
  return [row({
    glyph: glyphFor(d),
    title: nameOf(d),
    desc: d.rssi != null ? `Signal ${d.rssi} dBm` : d.mac,
    control: busy ? chip('Pairing…', 'accent') : button('Pair', () => act(ctx, d.mac, 'pair', () => ctx.b.pairDevice(d.mac))),
    cls: 'st-row-choice',
    tag: { dataset: { mac: d.mac } },
  }), s.error && s.error.mac === d.mac ? h('div.st-error.st-row-error', icon('alert'), s.error.text) : null];
}

export default {
  id: 'bluetooth',
  title: 'Bluetooth',
  glyph: 'bluetooth',
  blurb: 'Headphones, keyboards and other wireless devices',
  keywords: 'wireless pair',
  available: (b) => b.hasBluetooth(),
  topics: ['bluetooth'],
  items: [
    { id: 'power', label: 'Bluetooth on or off', keywords: 'power enable disable adapter' },
    { id: 'devices', label: 'Paired devices', keywords: 'connect disconnect forget remove headphones' },
    { id: 'discover', label: 'Pair a new device', keywords: 'search scan discover add' },
  ],
  render(ctx) {
    const b = ctx.b;
    const s = ctx.state;
    const { adapter, devices } = b.bluetooth();
    if (!adapter) return null;
    const power = section('Adapter', switchRow({
      anchor: 'power',
      glyph: adapter.powered ? 'bluetooth' : 'bluetooth-off',
      title: 'Bluetooth',
      desc: adapter.powered ? `On · this adapter is ${adapter.alias || adapter.name} (${adapter.address})` : 'Off',
    }, adapter.powered, (on) => b.setBluetoothPowered(on)));

    if (!adapter.powered) {
      return [power, h('div.st-empty-wrap', empty('bluetooth-off', 'Bluetooth is off', 'Turn it on to connect your devices'))];
    }

    const paired = devices.filter((d) => d.paired);
    const found = devices.filter((d) => !d.paired && (d.name || d.alias));
    const pairedSec = section('My devices', paired.length ? paired.flatMap((d) => deviceRow(ctx, d)) : h('div.st-row.st-row-empty',
      empty('bluetooth', 'No paired devices', 'Search below to pair headphones, a keyboard or a mouse')), { anchor: 'devices' });

    const searching = !!adapter.discovering;
    const toggleSearch = button(searching ? 'Stop' : 'Search', () => {
      if (searching) b.stopDiscovery();
      else {
        s.discovering = true;
        b.startDiscovery();
      }
    }, { kind: searching ? 'ghost' : 'primary', glyph: searching ? 'x' : 'search' });
    const foundRows = found.flatMap((d) => foundRow(ctx, d));
    const discover = section('Other devices', foundRows.length ? foundRows : h('div.st-row.st-row-empty',
      empty(searching ? 'bluetooth' : 'search', searching ? 'Looking for devices…' : 'Find a device to pair',
        searching ? 'Put the device in pairing mode; it appears here' : 'Search, then put the device in pairing mode')),
    { anchor: 'discover', aside: toggleSearch });
    return [power, pairedSec, discover];
  },
  leave(ctx) {
    if (ctx.state.discovering) {
      ctx.state.discovering = false;
      const { adapter } = ctx.b.bluetooth();
      if (adapter && adapter.discovering) ctx.b.stopDiscovery();
    }
    ctx.state.error = null;
  },
};
