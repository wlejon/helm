/**
 * XDG Desktop Portal backend integration (bro.portal): starts the portal
 * service on the session D-Bus, keeps org.freedesktop.appearance (colour
 * scheme, accent colour, contrast, reduced motion) in sync with Helm's
 * appearance settings, and answers Screenshot, FileChooser, OpenURI,
 * Inhibit, and GlobalShortcuts requests from Wayland, GTK, Qt, and Flatpak
 * applications.
 */

import { api, attempt, clamp } from './util.js';
import { settings } from './settings.js';
import { HOTKEYS } from './hotkeys.js';

const fs = () => attempt('require fs', () => (typeof require === 'function' ? require('fs') : null));
const pathMod = () => attempt('require path', () => (typeof require === 'function' ? require('path') : null));
const osMod = () => attempt('require os', () => (typeof require === 'function' ? require('os') : null));

/** Convert linear sRGB channel to gamma-encoded sRGB in [0, 1]. */
function linearToSrgb(c) {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055;
  return clamp(v, 0, 1);
}

/**
 * Convert Helm's OKLCH accent `oklch(L C h)` to normalized sRGB `[r, g, b]`
 * floats in `[0, 1]`.
 */
export function oklchToRgb(L, C, hDeg) {
  const rad = ((Number(hDeg) || 0) * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return [linearToSrgb(rLin), linearToSrgb(gLin), linearToSrgb(bLin)];
}

/** Convert a Helm accent hue (0..360) to normalized `[r, g, b]` in `0..1`. */
export function hueToRgb(hue) {
  return oklchToRgb(0.70, 0.15, Number.isFinite(Number(hue)) ? Number(hue) : 255);
}

/** Format normalized `[r, g, b]` floats in `0..1` as `#rrggbb`. */
export function rgbToHex(rgb) {
  const [r = 0, g = 0, b = 0] = Array.isArray(rgb) ? rgb : [rgb?.r || 0, rgb?.g || 0, rgb?.b || 0];
  const hex = (n) => Math.round(clamp(Number(n) || 0, 0, 1) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Parse a hex colour (`'#38bdf8'`, `'#3bf'`), `rgb(...)`, `[r, g, b]`, or
 * `{ r, g, b }` into normalized `[r, g, b]` floats in `0..1`. Falls back to
 * `hueToRgb(fallbackHue)` when `accent` is empty or unrecognised.
 */
export function parseAccentColor(accent, fallbackHue = 255) {
  if (Array.isArray(accent) && accent.length >= 3) {
    const [r, g, b] = accent.map((v) => Number(v) || 0);
    const scale = (r > 1 || g > 1 || b > 1) ? 255 : 1;
    return [clamp(r / scale, 0, 1), clamp(g / scale, 0, 1), clamp(b / scale, 0, 1)];
  }
  if (accent && typeof accent === 'object' && typeof accent.r === 'number') {
    const r = Number(accent.r) || 0;
    const g = Number(accent.g) || 0;
    const b = Number(accent.b) || 0;
    const scale = (r > 1 || g > 1 || b > 1) ? 255 : 1;
    return [clamp(r / scale, 0, 1), clamp(g / scale, 0, 1), clamp(b / scale, 0, 1)];
  }
  if (typeof accent === 'string') {
    const s = accent.trim();
    const m6 = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(s);
    if (m6) {
      return [
        parseInt(m6[1], 16) / 255,
        parseInt(m6[2], 16) / 255,
        parseInt(m6[3], 16) / 255,
      ];
    }
    const m3 = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
    if (m3) {
      return [
        parseInt(m3[1] + m3[1], 16) / 255,
        parseInt(m3[2] + m3[2], 16) / 255,
        parseInt(m3[3] + m3[3], 16) / 255,
      ];
    }
    const mRgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(s);
    if (mRgb) {
      const r = Number(mRgb[1]);
      const g = Number(mRgb[2]);
      const b = Number(mRgb[3]);
      const scale = (r > 1 || g > 1 || b > 1) ? 255 : 1;
      return [clamp(r / scale, 0, 1), clamp(g / scale, 0, 1), clamp(b / scale, 0, 1)];
    }
  }
  return hueToRgb(fallbackHue);
}

/** Normalize an XDG portal shortcut trigger (`<Control><Alt>k`) to Helm's chord format. */
export function normalizePortalTrigger(trigger) {
  if (!trigger || typeof trigger !== 'string') return '';
  let s = trigger.trim();
  const mods = [];
  s = s.replace(/<([^>]+)>/g, (_, mod) => {
    const m = mod.toLowerCase();
    if (m === 'control' || m === 'ctrl' || m === 'primary') mods.push('Ctrl');
    else if (m === 'alt') mods.push('Alt');
    else if (m === 'shift') mods.push('Shift');
    else if (m === 'super' || m === 'meta' || m === 'logo') mods.push('Super');
    return '';
  });
  if (mods.length > 0) {
    const key = s.length === 1 ? s.toUpperCase() : s;
    return [...mods, key].filter(Boolean).join('+');
  }
  return s;
}

function toFileUri(filePath) {
  if (!filePath) return '';
  if (filePath.startsWith('file://')) return filePath;
  const normalized = String(filePath).replace(/\\/g, '/');
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
}

function fromFileUri(uri) {
  if (!uri || !uri.startsWith('file://')) return uri || '';
  try {
    return decodeURIComponent(uri.slice(7));
  } catch (_) {
    return uri.slice(7);
  }
}

export class PortalController {
  constructor() {
    this.shell = null;
    this.portal = null;
    this.running = false;
    this.handles = [];
    this.unwatchers = [];
    this.inhibitions = new Map();
    this.shortcutSessions = new Map();
    this.screenshotHandler = null;
    this.fileChooserHandler = null;
    this.openUriHandler = null;
    this.pickColorHandler = null;
    this.lastScreenshotUri = null;
    this.lastOpenedUri = null;
  }

  init(shell, customPortal = null) {
    this.shell = shell || this.shell;
    this.disposeHandlers();
    this.portal = customPortal || api('portal');
    if (!this.portal) {
      this.running = false;
      return false;
    }

    this.running = !!attempt('portal.start', () => this.portal.start(), false);
    this.syncAppearance();

    for (const key of ['theme', 'accent', 'accentHue', 'reducedMotion', 'highContrast']) {
      this.unwatchers.push(settings.watch(key, () => this.syncAppearance()));
    }

    this.registerHandlers();
    return true;
  }

  /** Re-bind to a specific portal implementation (used by tests or late init). */
  attach(portalApi) {
    return this.init(this.shell, portalApi);
  }

  /** Current normalized appearance snapshot. */
  appearanceState() {
    const rawTheme = settings.get('theme');
    let theme = 'dark';
    if (rawTheme === 'light' || rawTheme === 'prefer-light' || rawTheme === 2 || rawTheme === '2') {
      theme = 'light';
    } else if (rawTheme === 'default' || rawTheme === 'none' || rawTheme === 'no-preference' || rawTheme === 0 || rawTheme === '0') {
      theme = 'default';
    }

    const accentHue = Number(settings.get('accentHue'));
    const rawAccent = settings.get('accent');
    const accentRgb = parseAccentColor(rawAccent, Number.isFinite(accentHue) ? accentHue : 255);
    const accent = (typeof rawAccent === 'string' && rawAccent.trim().startsWith('#'))
      ? rawAccent.trim()
      : rgbToHex(accentRgb);

    const rawContrast = settings.get('highContrast');
    const highContrast = rawContrast === true || rawContrast === 1 || rawContrast === '1'
      || rawContrast === 'high' || rawContrast === 'more' || rawContrast === 'high-contrast';

    const rawMotion = settings.get('reducedMotion');
    const reducedMotion = rawMotion === true || rawMotion === 1 || rawMotion === '1'
      || rawMotion === 'reduced' || rawMotion === 'reduce' || rawMotion === 'reduced-motion';

    return {
      theme,
      accent,
      accentHue: Number.isFinite(accentHue) ? accentHue : 255,
      accentRgb,
      highContrast,
      reducedMotion,
    };
  }

  /**
   * Push Helm's appearance settings into `bro.portal` (`org.freedesktop.appearance`)
   * and reflect them on the root DOM element.
   */
  syncAppearance() {
    const st = this.appearanceState();
    if (typeof document !== 'undefined' && document.documentElement) {
      const root = document.documentElement;
      root.dataset.theme = st.theme;
      root.classList.toggle('theme-light', st.theme === 'light');
      root.classList.toggle('high-contrast', st.highContrast);
      root.classList.toggle('reduced-motion', st.reducedMotion);
    }

    const p = this.portal || api('portal');
    if (!p) return st;

    if (typeof p.setColorScheme === 'function') {
      attempt('portal.setColorScheme', () => p.setColorScheme(st.theme));
    }
    if (typeof p.setAccentColor === 'function') {
      attempt('portal.setAccentColor', () => p.setAccentColor(st.accentRgb));
    }
    if (typeof p.setContrast === 'function') {
      attempt('portal.setContrast', () => p.setContrast(st.highContrast ? 'high' : 'normal'));
    }
    if (typeof p.setReducedMotion === 'function') {
      attempt('portal.setReducedMotion', () => p.setReducedMotion(st.reducedMotion ? 'reduced' : 'normal'));
    }
    return st;
  }

  registerHandlers() {
    const p = this.portal;
    if (!p) return;

    const reg = (method, fn) => {
      if (typeof p[method] !== 'function') return;
      const h = attempt(`portal.${method}`, () => p[method](fn));
      if (h) this.handles.push({ method, fn, handle: h });
    };

    reg('onScreenshot', (req) => this.handleScreenshot(req));
    reg('onPickColor', (req) => this.handlePickColor(req));
    reg('onFileChooser', (req) => this.handleFileChooser(req));
    reg('onOpenUri', (req) => this.handleOpenUri(req));
    reg('onOpenFile', (req) => this.handleOpenUri(req));
    reg('onInhibit', (ev) => this.handleInhibit(ev));
    reg('onBindShortcuts', (req) => this.handleBindShortcuts(req));
    reg('onListShortcuts', (req) => this.handleListShortcuts(req));
    reg('onConfigureShortcuts', (ev) => this.handleConfigureShortcuts(ev));
  }

  // -- Screenshot & PickColor ---------------------------------------------------

  screenshotOutputPath() {
    const p = pathMod();
    const o = osMod();
    const f = fs();
    const envDir = (typeof process !== 'undefined' && process.env && (process.env.HELM_CONFIG_DIR || process.env.XDG_RUNTIME_DIR)) || '';
    const baseDir = envDir || (o ? o.tmpdir() : '/tmp');
    if (f && baseDir) attempt('mkdir screenshot dir', () => f.mkdirSync(baseDir, { recursive: true }));
    const fileName = `helm-screenshot-${Date.now()}.png`;
    return p ? p.join(baseDir, fileName) : `${baseDir}/${fileName}`;
  }

  async handleScreenshot(req) {
    if (typeof this.screenshotHandler === 'function') {
      const custom = await this.screenshotHandler(req);
      return this.finishScreenshot(req, custom);
    }

    const outPath = this.screenshotOutputPath();
    let capturedUri = '';

    // 1. Display / compositor screenshot helper if present on bro.display / bro.displays
    const disp = api('display') || api('displays');
    if (disp && typeof disp.screenshot === 'function') {
      const r = await attempt('display.screenshot', () => disp.screenshot(outPath));
      if (typeof r === 'string' && r) capturedUri = toFileUri(r);
      else if (r && typeof r.uri === 'string') capturedUri = r.uri;
      else if (r === true) capturedUri = toFileUri(outPath);
    }

    // 2. Wayland screencopy + bro.image.encodePngFile
    if (!capturedUri) {
      const wl = api('wl');
      const img = api('image');
      const headless = typeof bro !== 'undefined' && bro.window && bro.window.displayMode === 'headless';
      if (!headless && wl && typeof wl.hasScreencopy === 'function' && wl.hasScreencopy() && img && typeof img.encodePngFile === 'function') {
        try {
          const frame = await wl.captureOutput(0);
          if (frame && frame.width > 0 && frame.height > 0 && frame.pixels) {
            const ok = img.encodePngFile(outPath, frame.pixels, frame.width, frame.height, 4);
            if (ok) capturedUri = toFileUri(outPath);
          }
        } catch (_) {}
      }
    }

    // 3. Headless engine screenshot() global
    if (!capturedUri && typeof screenshot === 'function') {
      const ok = attempt('headless screenshot', () => screenshot(outPath), false);
      if (ok) capturedUri = toFileUri(outPath);
    }

    // 4. Interactive fallback: launch helm.screenshot when requested
    if (!capturedUri && req && req.options && req.options.interactive) {
      const app = typeof bro !== 'undefined' && bro ? bro.app : null;
      if (app && typeof app.open === 'function') {
        attempt('app.open helm.screenshot', () => app.open('helm.screenshot'));
      } else if (this.shell && this.shell.apps) {
        this.shell.apps.launch('helm.screenshot');
      }
    }

    if (capturedUri) {
      this.lastScreenshotUri = capturedUri;
      return this.finishScreenshot(req, { uri: capturedUri });
    }
    return this.finishScreenshot(req, { cancelled: true });
  }

  finishScreenshot(req, result) {
    const res = result && typeof result === 'object' ? result : { cancelled: true };
    if (res.uri) this.lastScreenshotUri = res.uri;
    if (req) {
      if (res.cancelled && typeof req.cancel === 'function') req.cancel();
      else if (typeof req.respond === 'function') req.respond(res);
    }
    return res;
  }

  async handlePickColor(req) {
    if (typeof this.pickColorHandler === 'function') {
      const custom = await this.pickColorHandler(req);
      if (req && typeof req.respond === 'function' && custom) req.respond(custom);
      return custom;
    }
    const [r, g, b] = this.appearanceState().accentRgb;
    const res = { color: { r, g, b } };
    if (req && typeof req.respond === 'function') req.respond(res);
    return res;
  }

  // -- FileChooser --------------------------------------------------------------

  async handleFileChooser(req) {
    if (typeof this.fileChooserHandler === 'function') {
      const custom = await this.fileChooserHandler(req);
      if (req) {
        if (custom && custom.cancelled && typeof req.cancel === 'function') req.cancel();
        else if (custom && typeof req.respond === 'function') req.respond(custom);
      }
      return custom;
    }
    const opts = (req && req.options) || {};
    const file = opts.currentFile || opts.current_file || '';
    const folder = opts.currentFolder || opts.current_folder || '';
    if (file) {
      const res = { uris: [toFileUri(file)] };
      if (req && typeof req.respond === 'function') req.respond(res);
      return res;
    }
    if (opts.directory && folder) {
      const res = { uris: [toFileUri(folder)] };
      if (req && typeof req.respond === 'function') req.respond(res);
      return res;
    }
    const res = { cancelled: true };
    if (req && typeof req.cancel === 'function') req.cancel();
    else if (req && typeof req.respond === 'function') req.respond(res);
    return res;
  }

  // -- OpenURI / OpenFile -------------------------------------------------------

  resolveOpenTarget(req) {
    if (!req) return '';
    if (typeof req === 'string') return req;
    if (req.uri && typeof req.uri === 'string') return req.uri;
    if (req.path && typeof req.path === 'string') return req.path;
    if (req.file && typeof req.file === 'string') return req.file;
    if (typeof req.fd === 'number' && req.fd >= 0) {
      const f = fs();
      const fdPath = `/proc/self/fd/${req.fd}`;
      if (f && typeof f.readlinkSync === 'function') {
        const resolved = attempt('readlink fd', () => f.readlinkSync(fdPath), null);
        if (resolved) return resolved;
      }
      return fdPath;
    }
    return '';
  }

  async handleOpenUri(req) {
    const target = this.resolveOpenTarget(req);
    if (!target) {
      const res = { cancelled: true, success: false };
      if (req && typeof req.cancel === 'function') req.cancel();
      else if (req && typeof req.respond === 'function') req.respond(res);
      return res;
    }

    this.lastOpenedUri = target;
    if (typeof this.openUriHandler === 'function') {
      const custom = await this.openUriHandler(req, target);
      const res = typeof custom === 'object' && custom !== null ? custom : { success: !!custom };
      if (req) {
        if (res.cancelled && typeof req.cancel === 'function') req.cancel();
        else if (typeof req.respond === 'function') req.respond(res);
      }
      return res;
    }

    const ok = await this.openTarget(target, req);
    const res = { success: !!ok };
    if (req && typeof req.respond === 'function') req.respond(res);
    return res;
  }

  async openTarget(target) {
    if (!target) return false;
    const app = typeof bro !== 'undefined' && bro ? bro.app : null;
    if (app && typeof app.open === 'function') {
      const opened = await attempt('bro.app.open', () => app.open(target), false);
      if (opened) return true;
    }

    const apps = api('apps');
    if (apps) {
      const isFile = target.startsWith('/') || target.startsWith('file://');
      const filePath = isFile ? fromFileUri(target) : '';
      let mime = '';
      if (!isFile) {
        const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(target);
        if (schemeMatch) mime = `x-scheme-handler/${schemeMatch[1].toLowerCase()}`;
      } else {
        const vfs = api('vfs');
        const f = fs();
        const isDir = !!(f && attempt('statSync', () => f.statSync(filePath).isDirectory(), false));
        mime = isDir ? 'inode/directory' : (vfs && typeof vfs.getMime === 'function' ? attempt('vfs.getMime', () => vfs.getMime(filePath), '') : '');
      }
      if (mime && typeof apps.getDefaultApp === 'function') {
        const def = attempt(`apps.getDefaultApp ${mime}`, () => apps.getDefaultApp(mime), null);
        if (def && def.id && typeof apps.launch === 'function') {
          attempt(`apps.launch ${def.id}`, () => apps.launch(def.id, { files: [filePath || target] }));
          return true;
        }
      }
    }
    return false;
  }

  // -- Inhibit ------------------------------------------------------------------

  handleInhibit(ev) {
    if (!ev || typeof ev !== 'object') return;
    const handle = ev.handle || `${ev.appId || ev.app_id || 'app'}:${ev.flags || 0}`;
    const added = ev.added !== undefined ? !!ev.added : (ev.removed ? false : ev.active !== false);

    if (!added) {
      const prev = this.inhibitions.get(handle);
      this.inhibitions.delete(handle);
      if (prev && prev.seatId) {
        const seat = api('seat');
        if (seat && typeof seat.uninhibit === 'function') {
          attempt('seat.uninhibit', () => seat.uninhibit(prev.seatId));
        }
      }
      return;
    }

    const flags = Number(ev.flags) || 0;
    const types = [];
    if (ev.suspend || (flags & 4)) types.push('sleep');
    if (ev.idle || (flags & 8)) types.push('idle');
    if (ev.logout || (flags & 1)) types.push('shutdown');
    if (types.length === 0) types.push('idle');
    const type = types.join(':');
    const appId = ev.appId || ev.app_id || 'Application';
    const reason = ev.reason || `${appId} portal inhibition`;

    let seatId = 0;
    const seat = api('seat');
    if (seat && typeof seat.inhibit === 'function') {
      seatId = attempt('seat.inhibit', () => seat.inhibit(type, reason), 0) || 0;
    }

    this.inhibitions.set(handle, {
      handle,
      appId,
      window: ev.window || '',
      flags,
      type,
      reason,
      seatId,
    });
  }

  // -- GlobalShortcuts ----------------------------------------------------------

  handleBindShortcuts(req) {
    const session = (req && (req.sessionHandle || req.session_handle)) || 'default';
    const appId = (req && (req.appId || req.app_id)) || '';
    const shellChords = new Set();
    for (const h of HOTKEYS) {
      for (const c of h.chords || []) shellChords.add(c);
    }

    const requested = (req && Array.isArray(req.shortcuts)) ? req.shortcuts : [];
    const bound = requested.map((s) => {
      const id = s.id || s.shortcutId || s.shortcut_id || '';
      const description = s.description || '';
      const rawTrigger = s.triggerDescription || s.trigger_description || s.preferredTrigger || s.preferred_trigger || '';
      const normalized = normalizePortalTrigger(rawTrigger);
      const triggerDescription = shellChords.has(normalized) ? '' : (normalized || rawTrigger);
      return { id, description, triggerDescription };
    });

    this.shortcutSessions.set(session, { appId, shortcuts: bound });
    const res = { shortcuts: bound };
    if (req && typeof req.respond === 'function') req.respond(res);
    return res;
  }

  handleListShortcuts(req) {
    const session = (req && (req.sessionHandle || req.session_handle)) || 'default';
    const existing = this.shortcutSessions.get(session);
    const shortcuts = existing ? existing.shortcuts : ((req && req.shortcuts) || []);
    const res = { shortcuts };
    if (req && typeof req.respond === 'function') req.respond(res);
    return res;
  }

  handleConfigureShortcuts() {
    if (this.shell && typeof this.shell.openSettings === 'function') {
      this.shell.openSettings('keyboard');
    }
  }

  activateShortcut(sessionHandle, shortcutId, timestamp = Date.now()) {
    const p = this.portal || api('portal');
    if (!p || typeof p.triggerShortcutActivated !== 'function') return false;
    return attempt('portal.triggerShortcutActivated', () => p.triggerShortcutActivated(sessionHandle, shortcutId, timestamp), false);
  }

  deactivateShortcut(sessionHandle, shortcutId, timestamp = Date.now()) {
    const p = this.portal || api('portal');
    if (!p || typeof p.triggerShortcutDeactivated !== 'function') return false;
    return attempt('portal.triggerShortcutDeactivated', () => p.triggerShortcutDeactivated(sessionHandle, shortcutId, timestamp), false);
  }

  // -- Cleanup ------------------------------------------------------------------

  disposeHandlers() {
    for (const u of this.unwatchers) attempt('unwatch portal pref', u);
    this.unwatchers = [];
    for (const item of this.handles) {
      if (item.handle && typeof item.handle.dispose === 'function') {
        attempt(`dispose ${item.method}`, () => item.handle.dispose());
      }
    }
    this.handles = [];
  }

  destroy() {
    this.disposeHandlers();
    const seat = api('seat');
    if (seat && typeof seat.uninhibit === 'function') {
      for (const inh of this.inhibitions.values()) {
        if (inh.seatId) attempt('seat.uninhibit', () => seat.uninhibit(inh.seatId));
      }
    }
    this.inhibitions.clear();
    if (this.portal && typeof this.portal.stop === 'function' && this.running) {
      attempt('portal.stop', () => this.portal.stop());
    }
    this.running = false;
  }
}

export const portal = new PortalController();
