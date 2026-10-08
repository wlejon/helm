/**
 * Network: what this computer is connected through (NetworkManager via
 * bro.sys.network), each wired and wireless link's addresses, and the Wi-Fi
 * networks in range with join and disconnect.
 */

import { h } from '../../util.js';
import { icon } from '../../icons.js';
import { section, row, button, empty, chip, facts, fact, hero } from '../widgets.js';

const strip = (a) => String(a || '').replace(/\/\d+$/, '');

const STATE = {
  connected: 'Connected',
  connecting: 'Connecting…',
  disconnected: 'Disconnected',
  unavailable: 'Cable unplugged',
  unmanaged: 'Not managed',
  failed: 'Failed',
};

function links(st) {
  return (st.devices || []).filter((d) => d.type === 'ethernet' || d.type === 'wifi');
}

function statusHero(st) {
  const list = links(st);
  const primary = list.find((d) => d.id === st.primaryDevice) || list.find((d) => d.isPrimary)
    || list.find((d) => d.state === 'connected');
  const on = primary && primary.state === 'connected';
  const limited = on && st.connectivity && st.connectivity !== 'full';
  const kind = on ? primary.type : null;
  const name = !on ? 'Offline' : kind === 'wifi' ? (primary.connection || 'Wi-Fi') : 'Wired connection';
  const ip = on && primary.ipv4 && primary.ipv4.addresses[0] ? strip(primary.ipv4.addresses[0]) : '';
  const desc = !on ? 'Not connected to a network'
    : [limited ? (st.connectivity === 'portal' ? 'Sign-in needed' : 'Limited connectivity') : 'Connected to the internet',
      ip].filter(Boolean).join(' · ');
  return hero({
    anchor: 'status',
    glyph: !on ? 'globe' : kind === 'wifi' ? 'wifi' : 'ethernet',
    title: name,
    desc,
    tone: !on ? 'off' : limited ? 'warn' : 'accent',
    aside: on && primary.speedMbps ? chip(`${primary.speedMbps >= 1000 ? `${primary.speedMbps / 1000} Gb/s` : `${primary.speedMbps} Mb/s`}`, 'accent') : null,
  });
}

function wired(ctx, st) {
  const devs = (st.devices || []).filter((d) => d.type === 'ethernet');
  if (devs.length === 0) return null;
  return section('Wired', devs.map((d) => {
    const on = d.state === 'connected';
    return row({
      anchor: 'wired',
      glyph: 'ethernet',
      title: d.interfaceName || 'Ethernet',
      desc: [STATE[d.state] || d.state, d.description && d.description !== 'unknown' ? d.description : ''].filter(Boolean).join(' · '),
      control: chip(on ? 'Connected' : (STATE[d.state] || d.state), on ? 'ok' : 'off'),
      below: on || d.mac ? details(d) : null,
    });
  }));
}

function details(d) {
  const v4 = d.ipv4 || {};
  const v6 = d.ipv6 || {};
  return facts([
    fact('IPv4 address', (v4.addresses || []).map(strip).join(', '), { mono: true }),
    fact('Gateway', (v4.gateways || []).join(', '), { mono: true }),
    fact('DNS', [...(v4.dns || []), ...(v6.dns || [])].join(', '), { mono: true }),
    fact('IPv6 address', (v6.addresses || []).map(strip).join(', '), { mono: true }),
    fact('Hardware address', d.mac ? d.mac.toUpperCase() : '', { mono: true }),
    fact('Link speed', d.speedMbps ? `${d.speedMbps} Mb/s` : ''),
  ]);
}

function bars(pct) {
  return pct >= 67 ? 'wifi' : pct >= 34 ? 'wifi-2' : 'wifi-1';
}

function wifi(ctx, st) {
  const b = ctx.b;
  const s = ctx.state;
  const dev = (st.devices || []).find((d) => d.type === 'wifi');
  if (!dev) return null;
  if (!st.wifiHardwareEnabled || !st.wifiEnabled) {
    return section('Wi-Fi', h('div.st-row.st-row-empty', empty('wifi-off', 'Wi-Fi is turned off',
      st.wifiHardwareEnabled ? 'Turn it on with nmcli radio wifi on' : 'The wireless switch or airplane mode has it off')),
    { anchor: 'wifi' });
  }
  if (!s.scanned) {
    s.scanned = true;
    s.scanning = true;
    Promise.resolve(b.scanWifi()).catch(() => {}).then(() => {
      s.scanning = false;
      ctx.rerender();
    });
  }
  const aps = b.accessPoints();
  const rows = [];
  for (const ap of aps) {
    const secure = ap.security && ap.security !== 'open';
    const enterprise = /enterprise|802/.test(ap.security || '');
    const band = ap.frequencyMhz >= 5900 ? '6 GHz' : ap.frequencyMhz >= 4900 ? '5 GHz' : '2.4 GHz';
    let control;
    if (ap.active) control = button('Disconnect', () => b.disconnectWifi(), { kind: 'ghost' });
    else if (enterprise) control = h('span.st-row-note', 'Needs enterprise sign-in');
    else control = button('Join', () => join(ctx, ap, secure));
    rows.push(row({
      glyph: bars(ap.strengthPercent),
      title: ap.ssid,
      desc: [ap.active ? 'Connected' : null, secure ? 'Secured' : 'Open', band, `${ap.strengthPercent}%`].filter(Boolean).join(' · '),
      control: h('span.st-inline', secure ? icon('lock', 'st-dim') : null, control),
      selected: ap.active,
      cls: 'st-row-choice',
      tag: { dataset: { ssid: ap.ssid } },
    }));
    if (s.prompt === ap.ssid) rows.push(passwordRow(ctx, ap));
  }
  const scan = button(s.scanning ? 'Scanning…' : 'Scan', () => {
    s.scanning = true;
    ctx.rerender();
    Promise.resolve(b.scanWifi()).catch(() => {}).then(() => {
      s.scanning = false;
      ctx.rerender();
    });
  }, { kind: 'ghost', glyph: 'restart', disabled: s.scanning });
  return section('Wi-Fi networks', rows.length ? rows : h('div.st-row.st-row-empty',
    empty('wifi', s.scanning ? 'Looking for networks…' : 'No networks in range', s.scanning ? null : 'Scan again, or move closer to an access point')),
  { anchor: 'wifi', aside: h('span.st-inline', h('span.st-section-meta', dev.interfaceName || ''), scan) });
}

function join(ctx, ap, secure) {
  const s = ctx.state;
  s.error = null;
  if (!secure) {
    connect(ctx, ap.ssid, '');
    return;
  }
  s.prompt = s.prompt === ap.ssid ? null : ap.ssid;
  ctx.rerender();
}

function connect(ctx, ssid, secret) {
  const s = ctx.state;
  s.joining = ssid;
  ctx.rerender();
  Promise.resolve(ctx.b.connectWifi(ssid, secret)).then(() => {
    s.joining = null;
    s.prompt = null;
    s.error = null;
    ctx.rerender();
  }, (e) => {
    s.joining = null;
    s.error = String((e && e.message) || e || 'Could not connect').replace(/^Wi-Fi connect failed: /, '');
    ctx.rerender();
  });
}

function passwordRow(ctx, ap) {
  const s = ctx.state;
  const input = h('input.field', { type: 'password', 'aria-label': `Password for ${ap.ssid}` });
  const ghost = h('span.st-field-ghost', 'Password');
  const sync = () => ghost.classList.toggle('hidden', input.value.length > 0);
  input.addEventListener('input', sync);
  const go = () => input.value && connect(ctx, ap.ssid, input.value);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go();
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      s.prompt = null;
      ctx.rerender();
    }
  });
  ctx.after(() => input.focus());
  const busy = s.joining === ap.ssid;
  return h('div.st-join', { dataset: { join: ap.ssid } },
    h('div.st-join-row',
      h('div.st-field', ghost, input),
      button(busy ? 'Joining…' : 'Join', go, { kind: 'primary', disabled: busy }),
      button('Cancel', () => {
        s.prompt = null;
        ctx.rerender();
      }, { kind: 'ghost' })),
    s.error ? h('div.st-error', icon('alert'), s.error) : null);
}

export default {
  id: 'network',
  title: 'Network',
  glyph: 'network',
  blurb: 'Wired and Wi-Fi connections',
  keywords: 'internet ethernet lan wlan',
  available: (b) => b.hasNetwork() && !!b.networkState(),
  topics: ['network'],
  items: [
    { id: 'status', label: 'Connection status', keywords: 'online offline internet connectivity' },
    { id: 'wired', label: 'Wired connection', keywords: 'ethernet cable ip address dns gateway mac' },
    { id: 'wifi', label: 'Wi-Fi networks', keywords: 'wireless wlan ssid join password scan' },
  ],
  render(ctx) {
    const st = ctx.b.networkState();
    if (!st) return null;
    if (links(st).length === 0) {
      return [statusHero(st), h('div.st-empty-wrap', empty('network', 'No network hardware',
        'NetworkManager reports no wired or wireless adapters'))];
    }
    return [statusHero(st), wired(ctx, st), wifi(ctx, st)];
  },
  leave(ctx) {
    ctx.state.prompt = null;
    ctx.state.error = null;
    ctx.state.scanned = false;
  },
};
