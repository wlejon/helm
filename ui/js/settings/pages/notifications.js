/**
 * Notifications: Do Not Disturb, which apps get banners (quiet apps still
 * land in the notification center), the history, and whether helm is the
 * session's notification server (bro.sys.notifications) or another daemon
 * already owns that name.
 */

import { h, appIconPath } from '../../util.js';
import { appdb } from '../../appdb.js';
import { section, row, switchRow, button, empty, chip, hero } from '../widgets.js';

function appGlyph(name) {
  const app = appdb.apps.find((a) => a.name === name || a.id === `${String(name).toLowerCase()}.desktop`);
  const path = app ? appIconPath(app.icon, 64) : null;
  return path ? h('span.st-app-icon.app-icon-img', h('img', { src: path, alt: '' })) : 'bell';
}

function server(ctx) {
  const st = ctx.b.notifyStatus();
  if (!st) return null;
  const ours = st.receivesForeign !== false;
  return row({
    anchor: 'server',
    glyph: ours ? 'bell-ring' : 'alert',
    title: ours ? 'Receiving notifications from apps' : 'Another notification service is running',
    desc: ours ? 'Helm is this session’s notification server'
      : 'Apps’ notifications go to it instead of Helm until it exits',
    control: chip(ours ? 'Active' : 'Waiting', ours ? 'ok' : 'warn'),
  });
}

export default {
  id: 'notifications',
  title: 'Notifications',
  glyph: 'bell',
  blurb: 'Do Not Disturb and which apps show banners',
  keywords: 'alerts toasts banners',
  available: (b) => !!b.sys('notifications'),
  topics: ['notify', 'prefs'],
  items: [
    { id: 'dnd', label: 'Do Not Disturb', keywords: 'focus silence quiet mute' },
    { id: 'apps', label: 'Notification banners per app', keywords: 'quiet mute app toast' },
    { id: 'history', label: 'Clear notification history', keywords: 'clear dismiss all' },
    { id: 'server', label: 'Notification server', keywords: 'daemon dbus' },
  ],
  render(ctx) {
    const b = ctx.b;
    const notify = ctx.shell.notify;
    const dnd = !!notify.dnd;
    const focus = section('Focus', [
      switchRow({ anchor: 'dnd', glyph: dnd ? 'bell-off' : 'bell', title: 'Do Not Disturb',
        desc: dnd ? 'Banners are held back; urgent ones still show' : 'Banners show as they arrive' },
      dnd, (on) => b.setDnd(on)),
      server(ctx),
    ]);

    const quiet = new Set(b.pref('notifyQuiet') || []);
    const names = Array.from(new Set([...notify.knownApps(), ...quiet])).sort((x, y) => x.localeCompare(y));
    const apps = section('Banners', names.length ? names.map((name) => switchRow({
      glyph: appGlyph(name),
      title: name,
      desc: quiet.has(name) ? 'Quiet: straight to the notification center' : 'Shows banners',
      tag: { dataset: { app: name } },
    }, !quiet.has(name), (on) => b.setAppQuiet(name, !on))) : h('div.st-row.st-row-empty',
      empty('bell', 'No apps yet', 'Apps appear here after they send a notification')), {
      anchor: 'apps',
      aside: names.length ? h('span.st-section-meta', 'Switch an app off to keep it out of the way') : null,
    });

    const count = notify.items.length;
    const history = section('History', row({
      anchor: 'history',
      glyph: 'layers',
      title: count ? `${count} notification${count === 1 ? '' : 's'} in the center` : 'The notification center is empty',
      desc: 'Super+N opens it',
      control: button('Clear All', () => b.clearNotifications(), { kind: 'ghost', disabled: count === 0 }),
    }));
    return [hero({
      glyph: dnd ? 'bell-off' : 'bell', title: dnd ? 'Do Not Disturb is on' : 'Notifications are on',
      desc: [quiet.size ? `${quiet.size} quiet app${quiet.size === 1 ? '' : 's'}` : null,
        count ? `${count} in the notification center` : 'The notification center is empty'].filter(Boolean).join(' · '),
      tone: dnd ? 'off' : 'accent',
    }), focus, apps, history];
  },
};

