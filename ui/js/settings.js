/**
 * Helm settings: one bro.conf schema (path "helm.shell"), with an in-memory
 * fallback when bro.conf is missing so the shell still runs anywhere.
 * settings.get(key), settings.set(key, value), settings.watch(key, fn).
 */

import { api, attempt } from './util.js';

const PATH = 'helm.shell';
const APPEARANCE_PATH = 'helm.shell.appearance';

const SCHEMA = {
  use24h: { type: 'bool', default: true },
  showSeconds: { type: 'bool', default: false },
  accentHue: { type: 'int', default: 255, min: 0, max: 360 },
  theme: { type: 'string', default: 'dark' },
  accent: { type: 'string', default: '' },
  reducedMotion: { type: 'bool', default: false },
  highContrast: { type: 'bool', default: false },
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

const APPEARANCE_KEYS = new Set(['theme', 'accent', 'accentHue', 'reducedMotion', 'highContrast']);

class Settings {
  constructor() {
    this.conf = null;
    this.mem = {};
    this.watchers = new Map();
    this.setting = false;
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
      const appKeys = {};
      for (const k of APPEARANCE_KEYS) {
        const def = SCHEMA[k];
        appKeys[k] = { type: def.type, default: def.default };
      }
      attempt('conf.registerSchema appearance', () => {
        conf.registerSchema({ id: APPEARANCE_PATH, path: APPEARANCE_PATH, keys: appKeys });
      });
      if (ok) this.conf = conf;
    }
    if (this.conf) {
      const onConfChange = (key, value) => {
        if (this.setting) return;
        this.mem[key] = value;
        if (key === 'accentHue') this.mem.accent = '';
        this.emit(key, value);
      };
      attempt('conf.watch', () => this.conf.watch(PATH, onConfChange));
      attempt('conf.watch appearance', () => this.conf.watch(APPEARANCE_PATH, onConfChange));
    }
  }

  get(key) {
    const def = SCHEMA[key] ? SCHEMA[key].default : undefined;
    if (key in this.mem && this.mem[key] !== undefined && this.mem[key] !== null) {
      return this.mem[key];
    }
    if (this.conf) {
      if (APPEARANCE_KEYS.has(key)) {
        const av = attempt(`conf.get ${APPEARANCE_PATH}.${key}`, () => this.conf.getOptional(`${APPEARANCE_PATH}.${key}`));
        if (av !== undefined && av !== null && av !== def) return av;
      }
      const v = attempt(`conf.get ${key}`, () => this.conf.getOptional(`${PATH}.${key}`));
      return v === undefined || v === null ? def : v;
    }
    return def;
  }

  set(key, value) {
    this.mem[key] = value;
    if (key === 'accentHue') this.mem.accent = '';
    if (this.conf) {
      this.setting = true;
      try {
        attempt(`conf.set ${key}`, () => {
          const p = this.conf.set(`${PATH}.${key}`, value);
          if (p && typeof p.catch === 'function') {
            p.catch((err) => console.warn(`helm: conf.set ${key}: ${err && err.message}`));
          }
        });
        if (APPEARANCE_KEYS.has(key)) {
          attempt(`conf.set appearance.${key}`, () => {
            const p = this.conf.set(`${APPEARANCE_PATH}.${key}`, value);
            if (p && typeof p.catch === 'function') {
              p.catch(() => {});
            }
          });
          if (key === 'accentHue') {
            attempt('conf.set appearance.accent', () => this.conf.set(`${APPEARANCE_PATH}.accent`, ''));
            attempt('conf.set accent', () => this.conf.set(`${PATH}.accent`, ''));
          }
        }
      } finally {
        this.setting = false;
      }
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
