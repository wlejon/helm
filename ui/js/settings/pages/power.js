/**
 * Power: battery (UPower via bro.sys.power), the session actions logind
 * allows (each destructive one asks once more), automatic lock when bro.seat
 * has an idle API, and what is holding sleep off right now (logind
 * inhibitors).
 */

import { h } from '../../util.js';
import { section, row, button, confirmButton, segmented, chip, hero, empty } from '../widgets.js';
import { batteryIcon } from '../../islands.js';

const allowed = (v) => v === undefined || v === 'yes' || v === 'needs-auth' || v === 'challenge';

function duration(s) {
  if (!s || s <= 0) return '';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

function battery(p) {
  if (!p.hasBattery) {
    return hero({ anchor: 'battery', glyph: 'plug', title: 'Plugged in', desc: 'This computer runs on mains power; it has no battery', tone: 'off' });
  }
  const left = p.charging ? duration(p.timeToFullS) : duration(p.timeToEmptyS);
  const desc = p.charging
    ? (p.percent >= 99 ? 'Fully charged' : `Charging${left ? ` · full in ${left}` : ''}`)
    : `On battery${left ? ` · ${left} left` : ''}`;
  const bar = h('span.st-battery', h('span.st-battery-fill', { style: { width: `${p.percent}%` } }));
  return hero({
    anchor: 'battery',
    glyph: p.charging ? 'battery-charging' : batteryIcon(p.percent),
    title: `${p.percent}%`,
    desc,
    aside: bar,
    tone: p.percent <= 10 && !p.charging ? 'warn' : 'accent',
  });
}

function actions(ctx) {
  const b = ctx.b;
  const caps = b.powerCaps();
  const auth = (k) => (caps[k] === 'needs-auth' || caps[k] === 'challenge' ? ' · asks for authentication' : '');
  const rows = [
    row({ anchor: 'lock', glyph: 'lock', title: 'Lock screen', desc: 'Super+L',
      control: button('Lock', () => {
        ctx.app.close();
        b.lock();
      }) }),
  ];
  if (allowed(caps.suspend)) {
    rows.push(row({ anchor: 'suspend', glyph: 'moon', title: 'Sleep', desc: `Suspend to memory${auth('suspend')}`,
      control: button('Sleep', () => b.powerAction('suspend')) }));
  }
  if (allowed(caps.hibernate)) {
    rows.push(row({ anchor: 'hibernate', glyph: 'moon', title: 'Hibernate', desc: `Save the session to disk and power off${auth('hibernate')}`,
      control: confirmButton('Hibernate', () => b.powerAction('hibernate')) }));
  }
  if (allowed(caps.reboot)) {
    rows.push(row({ anchor: 'reboot', glyph: 'restart', title: 'Restart', desc: `Close every app and start again${auth('reboot')}`,
      control: confirmButton('Restart', () => b.powerAction('reboot')) }));
  }
  if (allowed(caps.powerOff)) {
    rows.push(row({ anchor: 'power-off', glyph: 'power', title: 'Shut down', desc: `Close every app and power off${auth('powerOff')}`,
      control: confirmButton('Shut Down', () => b.powerAction('powerOff'), { kind: 'danger' }) }));
  }
  return section('Session', rows, { note: 'Restart and Shut Down ask once more before acting.' });
}

const IDLE = [
  { value: 60000, label: '1 min' },
  { value: 300000, label: '5 min' },
  { value: 600000, label: '10 min' },
  { value: 1800000, label: '30 min' },
  { value: 0, label: 'Never' },
];

function autoLock(ctx) {
  const ms = ctx.b.idleTimeout();
  if (ms === null) return null;
  const near = IDLE.reduce((a, o) => (Math.abs(o.value - ms) < Math.abs(a.value - ms) ? o : a), IDLE[0]);
  return section('Automatic lock', row({
    anchor: 'auto-lock', glyph: 'lock', title: 'Lock after inactivity', desc: 'When nothing has been touched for',
    control: segmented(IDLE, ms === 0 ? 0 : near.value, (v) => ctx.b.setIdleTimeout(v)),
  }));
}

const KINDS = { sleep: 'Sleep', idle: 'Idle', shutdown: 'Shut down', 'handle-lid-switch': 'Lid', 'handle-power-key': 'Power key' };

function inhibitors(ctx) {
  const list = ctx.b.inhibitors();
  if (list === null) return null;
  const rows = list.map((it) => row({
    glyph: it.type === 'idle' ? 'sun' : 'moon',
    title: it.who || 'An application',
    desc: it.reason || '',
    control: h('span.st-inline', chip((it.type || '').split(':').map((t) => KINDS[t] || t).join(', '), 'off'),
      chip(it.mode === 'delay' ? 'Delays' : 'Blocks', it.mode === 'delay' ? 'off' : 'warn')),
  }));
  return section('Holding off sleep', rows.length ? rows : h('div.st-row.st-row-empty',
    empty('moon', 'Nothing is keeping the computer awake', null)), {
    anchor: 'inhibitors',
    note: rows.length ? 'Apps can delay sleep briefly to tidy up, or block it outright while they work.' : null,
  });
}

export default {
  id: 'power',
  title: 'Power',
  glyph: 'power',
  blurb: 'Battery, sleep, restart and shut down',
  keywords: 'energy',
  available: (b) => b.hasPower(),
  topics: ['power'],
  items: [
    { id: 'battery', label: 'Battery', keywords: 'charge charging percent' },
    { id: 'lock', label: 'Lock screen', keywords: 'lock session' },
    { id: 'suspend', label: 'Sleep', keywords: 'suspend' },
    { id: 'reboot', label: 'Restart', keywords: 'reboot' },
    { id: 'power-off', label: 'Shut down', keywords: 'power off turn off halt' },
    { id: 'auto-lock', label: 'Lock after inactivity', keywords: 'idle timeout screen saver automatic' },
    { id: 'inhibitors', label: 'Apps keeping the computer awake', keywords: 'inhibit inhibitors sleep' },
  ],
  filterItems(b) {
    const caps = b.powerCaps();
    return (it) => (it.id === 'suspend' ? allowed(caps.suspend)
      : it.id === 'reboot' ? allowed(caps.reboot)
        : it.id === 'power-off' ? allowed(caps.powerOff)
          : it.id === 'auto-lock' ? b.idleTimeout() !== null
            : it.id === 'inhibitors' ? b.inhibitors() !== null : true);
  },
  render(ctx) {
    return [battery(ctx.b.power()), actions(ctx), autoLock(ctx), inhibitors(ctx)];
  },
};
