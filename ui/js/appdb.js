/**
 * The app catalog (bro.apps) plus the lookups the shell needs on top of it:
 * matching a running window's app_id to its desktop entry, and launching.
 *
 * Every app comes from a desktop entry, the helm apps included: installing a
 * bro folder app (`bro --install <dir>`) writes `<id>.desktop` with
 * StartupWMClass set to the id, which is also the app_id its window reports.
 */

import { api, attempt } from './util.js';

class AppDb {
  constructor() {
    this.apps = [];
    this.byId = new Map();
    this.subs = new Set();
  }

  init() {
    this.reload();
    const apps = api('apps');
    if (apps && typeof apps.watch === 'function') {
      attempt('apps.watch', () => apps.watch(() => this.reload()));
    }
  }

  reload() {
    const apps = api('apps');
    const raw = apps ? attempt('apps.list', () => apps.list(), []) || [] : [];
    this.apps = raw
      .filter((a) => !a.nodisplay)
      .map((a) => ({
        id: a.id,
        name: a.name || a.id,
        generic: a.genericName || '',
        comment: a.comment || '',
        icon: a.icon || '',
        exec: a.exec || '',
        keywords: a.keywords || [],
        categories: a.categories || [],
        terminal: !!a.terminal,
      }))
      .sort((x, y) => x.name.localeCompare(y.name));
    this.byId = new Map(this.apps.map((a) => [a.id, a]));
    for (const fn of this.subs) attempt('appdb subscriber', () => fn());
  }

  onChange(fn) {
    this.subs.add(fn);
  }

  get(id) {
    if (!id) return null;
    return this.byId.get(id) || this.byId.get(`${id}.desktop`) || null;
  }

  /**
   * The desktop entry for a window's app_id: exact id, id.desktop, the last
   * reverse-DNS segment, or an exec basename match.
   */
  forWindow(appId, title) {
    if (!appId) return null;
    const direct = this.get(appId);
    if (direct) return direct;
    const lower = String(appId).toLowerCase();
    const tail = lower.split('.').pop();
    let hit = this.apps.find((a) => a.id.toLowerCase() === `${lower}.desktop`)
      || this.apps.find((a) => a.id.toLowerCase().replace(/\.desktop$/, '').split('.').pop() === tail)
      || this.apps.find((a) => (a.exec.split(/\s+/)[0] || '').split('/').pop().toLowerCase() === tail)
      || this.apps.find((a) => a.name.toLowerCase() === tail);
    if (!hit && title) hit = this.apps.find((a) => a.name.toLowerCase() === String(title).toLowerCase());
    return hit || null;
  }

  launch(id) {
    const apps = api('apps');
    if (!apps) return;
    attempt(`apps.launch ${id}`, () => {
      // An xdg-activation token, so the window it opens takes focus as one
      // the user asked for (the client spends it on its first window).
      const comp = api('compositor');
      const token = comp && typeof comp.activationToken === 'function' ? comp.activationToken(id) : null;
      const opts = token ? { env: { XDG_ACTIVATION_TOKEN: token, DESKTOP_STARTUP_ID: token } } : undefined;
      const p = opts ? apps.launch(id, opts) : apps.launch(id);
      if (p && typeof p.catch === 'function') p.catch((e) => console.warn(`helm: launch ${id}: ${e && e.message}`));
    });
    window.dispatchEvent(new CustomEvent('helm:launched', { detail: { id } }));
  }
}

export const appdb = new AppDb();
