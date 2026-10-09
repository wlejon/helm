/**
 * Helm settings: one bro.conf schema (path "helm.shell"), with an in-memory
 * fallback when bro.conf is missing so the shell still runs anywhere.
 * settings.get(key), settings.set(key, value), settings.watch(key, fn).
 */

import { api, attempt } from './util.js';

const PATH = 'helm.shell';

const SCHEMA = {
  use24h: { type: 'bool', default: true },
  showSeconds: { type: 'bool', default: false },
  accentHue: { type: 'int', default: 255, min: 0, max: 360 },
  wallpaper: { type: 'string', default: 'aurora' },
  dndEnabled: { type: 'bool', default: false },
  launchCounts: { type: 'string', default: '{}' },
  // Apps whose notifications skip the banner (they still reach the center),
  // and every app that has sent one, for Settings > Notifications.
  notifyQuiet: { type: 'string_list', default: [] },
  notifyApps: { type: 'string_list', default: [] },
  // Host the screen for remote viewers (remote.js); `helm --remote` hosts
  // regardless.
  remoteHost: { type: 'bool', default: false },
};

class Settings {
  constructor() {
    this.conf = null;
    this.mem = {};
    this.watchers = new Map();
  }

  init() {
    const conf = api('conf');
    if (conf) {
      const keys = {};
      for (const [k, def] of Object.entries(SCHEMA)) keys[k] = { type: def.type, default: def.default };
      const ok = attempt('conf.registerSchema', () => {
        conf.registerSchema({ id: PATH, path: PATH, keys });
        return true;
      }, false);
      if (ok) this.conf = conf;
    }
    if (this.conf) {
      attempt('conf.watch', () => this.conf.watch(PATH, (key, value) => this.emit(key, value)));
    }
  }

  get(key) {
    const def = SCHEMA[key] ? SCHEMA[key].default : undefined;
    if (this.conf) {
      const v = attempt(`conf.get ${key}`, () => this.conf.getOptional(`${PATH}.${key}`));
      return v === undefined || v === null ? def : v;
    }
    return key in this.mem ? this.mem[key] : def;
  }

  set(key, value) {
    if (this.conf) {
      attempt(`conf.set ${key}`, () => {
        const p = this.conf.set(`${PATH}.${key}`, value);
        if (p && typeof p.catch === 'function') {
          p.catch((err) => console.warn(`helm: conf.set ${key}: ${err && err.message}`));
        }
      });
    } else {
      this.mem[key] = value;
    }
    this.emit(key, value);
  }

  watch(key, fn) {
    if (!this.watchers.has(key)) this.watchers.set(key, new Set());
    this.watchers.get(key).add(fn);
    return () => this.watchers.get(key).delete(fn);
  }

  emit(key, value) {
    const fns = this.watchers.get(key);
    if (!fns) return;
    for (const fn of fns) attempt(`settings watcher ${key}`, () => fn(value));
  }

  /** JSON-valued keys stored as strings (string-list/dict schemas are flat). */
  getJson(key, fallback) {
    const raw = this.get(key);
    if (typeof raw !== 'string') return raw ?? fallback;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  setJson(key, value) {
    this.set(key, JSON.stringify(value));
  }
}

export const settings = new Settings();
