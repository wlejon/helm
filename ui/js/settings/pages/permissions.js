/**
 * App permissions (bro.permissions, docs/permissions-api.js in bro): every
 * installed app and every app the grant store knows, each capability its
 * bro.json declares with the user's decision (allow, ask, deny), what it is
 * for and when it was last used, the files and folders picked for it, and
 * dev mode. Changes go to the store at once and reach running apps; a change
 * made anywhere else (`bro --revoke-app`, an app's prompt) re-renders the
 * page through the 'permissions' topic.
 */

import { h, fmtRelative } from '../../util.js';
import { icon } from '../../icons.js';
import { section, row, switchRow, button, confirmButton, empty, chip, segmented, hero } from '../widgets.js';

const CHOICES = [
  { value: 'allow', label: 'Allow' },
  { value: 'undecided', label: 'Ask' },
  { value: 'deny', label: 'Deny' },
];

const INSTALL = {
  current: ['Installed', 'ok'],
  changed: ['Changed', 'warn'],
  unrecorded: ['Installed', 'off'],
  linked: ['Linked', 'accent'],
  '': ['Folder', 'off'],
};

const baseName = (p) => String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

function appName(app) {
  return app.name || app.id || baseName(app.dir) || app.identity;
}

/** Run a write; its exception becomes the app's error line. */
function act(ctx, identity, fn) {
  const s = ctx.state;
  s.error = null;
  try {
    fn();
  } catch (e) {
    s.error = { identity, text: String((e && e.message) || e) };
  }
  ctx.rerender();
}

function used(t) {
  if (!t) return 'Never used';
  const r = fmtRelative(t);
  return r === 'now' ? 'Used just now' : `Used ${r}`;
}

function capRow(ctx, app, cap, info, dev) {
  const d = app.decisions[cap] || 'undecided';
  const declared = app.declared.includes(cap);
  const host = d === 'host' || (info && info.kind === 'shell');
  const desc = [
    info ? info.summary : 'Not a capability bro knows',
    declared ? null : 'No longer declared',
    host ? null : used(app.lastUsed[cap]),
    dev && declared && !host && d !== 'allow' ? 'Granted by dev mode' : null,
  ].filter(Boolean).join(' · ');
  const control = host
    ? chip('Granted by the shell', 'accent')
    : segmented(CHOICES, d, (v) => act(ctx, app.identity, () => ctx.b.setPermission(app.identity, cap, v)));
  if (!host) control.classList.add('st-perm-choice', `is-${d}`);
  return row({
    glyph: host ? 'lock' : 'shield',
    title: cap,
    desc,
    control,
    cls: 'st-perm-cap',
    tag: { dataset: { cap, decision: d } },
  });
}

function pickedRow(ctx, app, path) {
  return row({
    glyph: ctx.b.isDir(path) ? 'folder' : 'file',
    title: baseName(path),
    desc: path,
    control: button('Remove', () => act(ctx, app.identity, () => ctx.b.removePicked(app.identity, path)),
      { kind: 'ghost', glyph: 'x' }),
    cls: 'st-perm-picked',
    tag: { dataset: { picked: path } },
  });
}

function appSection(ctx, entry, catalog, dev) {
  const s = ctx.state;
  const app = { identity: '', dir: '', install: '', declared: [], decisions: {}, lastUsed: {}, picked: [], ...entry };
  const [label, tone] = INSTALL[app.install] || INSTALL[''];
  const where = app.dir ? app.dir : 'Its folder is no longer found';
  const rows = [row({
    glyph: 'apps',
    title: appName(app),
    desc: [app.identity, app.identity.endsWith(app.dir) ? null : where].filter(Boolean).join(' · '),
    control: chip(app.dir ? label : 'Missing', app.dir ? tone : 'off'),
    cls: 'st-perm-head',
  })];
  if (app.install === 'changed') {
    rows.push(h('div.st-row.st-perm-changed', h('span.st-row-glyph', icon('alert')),
      h('span.st-row-text',
        h('span.st-row-title', 'Changed since you decided'),
        h('span.st-row-desc', 'It was installed again or altered, so its next launch forgets these decisions and asks again'))));
  }
  const caps = [...app.declared, ...Object.keys(app.decisions).filter((c) => !app.declared.includes(c))];
  for (const cap of caps) rows.push(capRow(ctx, app, cap, catalog.get(cap), dev));
  if (caps.length === 0) {
    rows.push(row({ glyph: 'check', title: 'Asks for nothing', desc: 'Its bro.json declares no capabilities', cls: 'st-perm-none' }));
  }
  for (const p of app.picked) rows.push(pickedRow(ctx, app, p));
  if (s.error && s.error.identity === app.identity) rows.push(h('div.st-error.st-row-error', icon('alert'), s.error.text));

  const decided = Object.values(app.decisions).some((d) => d === 'allow' || d === 'deny') || app.picked.length > 0;
  const askable = Object.values(app.decisions).some((d) => d !== 'host' && d !== 'deny') || app.picked.length > 0;
  const aside = h('span.st-inline',
    decided ? confirmButton('Reset', () => act(ctx, app.identity, () => ctx.b.resetPermissions(app.identity)),
      { kind: 'ghost', glyph: 'restart' }) : null,
    askable ? confirmButton('Revoke all', () => act(ctx, app.identity, () => ctx.b.revokePermissions(app)),
      { kind: 'danger', glyph: 'x' }) : null);
  const el = section(appName(app), rows, { aside, cls: 'st-perm-app' });
  el.dataset.identity = app.identity;
  return el;
}

export default {
  id: 'permissions',
  title: 'App Permissions',
  glyph: 'shield',
  blurb: 'What each app may reach outside itself',
  keywords: 'permissions grants capabilities privacy allow deny revoke files network microphone',
  available: (b) => b.hasPermissions(),
  topics: ['permissions'],
  items: [
    { id: 'apps', label: 'App permissions', keywords: 'allow deny ask revoke reset files network mic spawn picked' },
    { id: 'dev-mode', label: 'Dev mode', keywords: 'developer grant everything declared' },
  ],
  render(ctx) {
    const b = ctx.b;
    const apps = b.permissionApps();
    const catalog = new Map(b.capabilityCatalog().map((c) => [c.name, c]));
    const dev = b.devMode();
    const parts = [];
    if (dev) {
      parts.push(hero({
        anchor: 'dev-mode-on',
        glyph: 'code',
        tone: 'warn',
        title: 'Dev mode is on',
        desc: 'Every app is granted every capability it declares, over what you decided below',
        aside: button('Turn off', () => act(ctx, null, () => b.setDevMode(false))),
      }));
    }
    const sections = apps.map((a) => appSection(ctx, a, catalog, dev));
    if (sections.length) {
      sections[0].dataset.anchor = 'apps';
      parts.push(...sections);
    } else {
      parts.push(h('div.st-empty-wrap', { dataset: { anchor: 'apps' } }, empty('shield', 'No apps yet',
        'Apps you install or run appear here with what they ask for')));
    }
    parts.push(section('Developer', switchRow({
      anchor: 'dev-mode',
      glyph: 'code',
      title: 'Dev mode',
      desc: 'Grant every app everything it declares, for developing apps. Shown in the bar while on',
    }, dev, (on) => act(ctx, null, () => b.setDevMode(on))), {
      note: 'Shell capabilities are only ever granted by helm itself. Decisions are kept in bro\'s grants.json; bro --permissions lists them in a terminal.',
    }));
    const err = ctx.state.error;
    if (err && err.identity === null) parts.push(h('div.st-error', icon('alert'), err.text));
    return parts;
  },
  leave(ctx) {
    ctx.state.error = null;
  },
};
