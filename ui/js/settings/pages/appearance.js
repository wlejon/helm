/**
 * Appearance: wallpaper (the gradient presets, or a picture found in the
 * usual wallpaper folders), the accent hue, the clock, the dock. All of it
 * is helm.shell in bro.conf (js/settings.js); the shell watches each key.
 */

import { h, fmtTime } from '../../util.js';
import { icon } from '../../icons.js';
import { WALLPAPERS } from '../../wallpaper.js';
import { section, row, switchRow } from '../widgets.js';

export const ACCENTS = [
  { hue: 255, name: 'Iris' },
  { hue: 285, name: 'Violet' },
  { hue: 320, name: 'Orchid' },
  { hue: 350, name: 'Rose' },
  { hue: 20, name: 'Coral' },
  { hue: 55, name: 'Amber' },
  { hue: 150, name: 'Mint' },
  { hue: 190, name: 'Teal' },
  { hue: 225, name: 'Sky' },
];

const IMAGE = /\.(png|jpe?g|webp)$/i;
const SIZED = /^(.*?)[_-]?(\d{3,5})x(\d{3,5})(_portrait)?\.(png|jpe?g|webp)$/i;

/**
 * Pictures that look like wallpapers: ~/Pictures/Wallpapers and the top of
 * ~/Pictures, KDE wallpaper packages (one image per package, the largest
 * landscape one) and /usr/share/backgrounds (one per size family).
 */
export function findWallpapers(b) {
  const home = (typeof process !== 'undefined' && process.env && process.env.HOME) || '';
  const out = [];
  const seen = new Set();
  const add = (path, label) => {
    if (seen.has(path) || out.length >= 18) return;
    seen.add(path);
    out.push({ path, label });
  };
  const pickLandscape = (dir, files) => {
    let best = null;
    for (const f of files) {
      const m = SIZED.exec(f);
      if (!m || m[4]) continue;
      const w = Number(m[2]);
      const ht = Number(m[3]);
      if (w < ht) continue;
      if (!best || Math.abs(w / ht - 16 / 9) < Math.abs(best.w / best.h - 16 / 9) - 0.01 || (w > best.w && Math.abs(w / ht - best.w / best.h) < 0.01)) {
        best = { file: f, w, h: ht, stem: m[1] };
      }
    }
    return best;
  };
  const pretty = (s) => s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

  if (home) {
    for (const dir of [`${home}/Pictures/Wallpapers`, `${home}/Pictures`]) {
      for (const f of b.listDir(dir).sort()) {
        if (IMAGE.test(f)) add(`${dir}/${f}`, pretty(f.replace(IMAGE, '')));
      }
    }
  }
  for (const root of ['/usr/share/wallpapers', '/usr/share/backgrounds']) {
    for (const name of b.listDir(root).sort()) {
      const dir = `${root}/${name}`;
      const images = `${dir}/contents/images`;
      if (b.isDir(images)) {
        const best = pickLandscape(images, b.listDir(images));
        if (best) add(`${images}/${best.file}`, pretty(name));
        continue;
      }
      if (!b.isDir(dir)) {
        if (IMAGE.test(name)) add(dir, pretty(name.replace(IMAGE, '')));
        continue;
      }
      const files = b.listDir(dir).filter((f) => IMAGE.test(f));
      const families = new Map();
      for (const f of files) {
        const m = SIZED.exec(f);
        const stem = m ? m[1] : f.replace(IMAGE, '');
        if (!families.has(stem)) families.set(stem, []);
        families.get(stem).push(f);
      }
      for (const [stem, list] of families) {
        const best = pickLandscape(dir, list) || { file: list[0] };
        add(`${dir}/${best.file}`, pretty(stem));
      }
    }
  }
  return out;
}

function presetCss(name) {
  return WALLPAPERS[name].css.join(', ');
}

function wallpaperTile(ctx, { key, label, css, thumbPath, current }) {
  const art = h('span.st-wall-art');
  if (css) art.style.backgroundImage = css;
  const tile = h('button.st-wall', { title: label, dataset: { wallpaper: key } }, art,
    h('span.st-wall-label', label),
    current ? h('span.st-wall-check', icon('check')) : null);
  tile.classList.toggle('on', !!current);
  if (thumbPath !== undefined) {
    if (thumbPath) art.appendChild(h('img', { src: thumbPath, alt: '' }));
    else art.appendChild(h('span.st-wall-wait', icon('image')));
  }
  tile.addEventListener('click', () => ctx.b.setPref('wallpaper', key));
  return tile;
}

/** Thumbnails come from bro.thumb; fill each tile in as its thumbnail lands. */
function pictureGrid(ctx, current) {
  const st = ctx.state;
  if (!st.pictures) st.pictures = findWallpapers(ctx.b);
  if (!st.thumbs) st.thumbs = {};
  const list = st.pictures.slice();
  if (current && current.startsWith('/') && !list.some((p) => p.path === current)) {
    list.unshift({ path: current, label: current.split('/').pop().replace(IMAGE, '') });
  }
  if (list.length === 0) return null;
  const tiles = list.map((p) => {
    const known = Object.prototype.hasOwnProperty.call(st.thumbs, p.path);
    const tile = wallpaperTile(ctx, { key: p.path, label: p.label, thumbPath: known ? st.thumbs[p.path] : null, current: current === p.path });
    if (!known && ctx.b.hasThumbnails()) {
      st.thumbs[p.path] = null;
      ctx.b.thumbnail(p.path).then((path) => {
        st.thumbs[p.path] = path;
        const art = tile.querySelector('.st-wall-art');
        if (path && art) art.replaceChildren(h('img', { src: path, alt: '' }));
        else if (art) art.replaceChildren(h('span.st-wall-wait', icon('image')));
      });
    }
    return tile;
  });
  return h('div.st-walls.pictures', tiles);
}

function preview(current) {
  const art = h('div.st-preview-art');
  if (WALLPAPERS[current]) art.style.backgroundImage = presetCss(current);
  else if (current && current.startsWith('/')) art.style.backgroundImage = `url("${current}")`;
  return h('div.st-preview',
    art,
    h('div.st-preview-islands', h('span.l'), h('span.c'), h('span.r')),
    h('div.st-preview-dock', h('span'), h('span'), h('span'), h('span')));
}

export default {
  id: 'appearance',
  title: 'Appearance',
  glyph: 'palette',
  blurb: 'Wallpaper, accent colour, clock and dock',
  keywords: 'look theme style personalise personalize',
  available: () => true,
  items: [
    { id: 'wallpaper', label: 'Wallpaper', keywords: 'background desktop gradient preset' },
    { id: 'pictures', label: 'Wallpaper from a picture', keywords: 'background image photo file' },
    { id: 'accent', label: 'Accent colour', keywords: 'color colour hue highlight tint' },
    { id: 'clock-24h', label: '24-hour clock', keywords: 'time format am pm' },
    { id: 'clock-seconds', label: 'Show seconds in the clock', keywords: 'time' },
    { id: 'dock-autohide', label: 'Hide the dock when a window covers it', keywords: 'dock autohide intellihide taskbar' },
  ],

  render(ctx) {
    const b = ctx.b;
    const current = b.pref('wallpaper');
    const presetTiles = Object.entries(WALLPAPERS).map(([key, p]) =>
      wallpaperTile(ctx, { key, label: p.label, css: presetCss(key), current: current === key }));
    const label = WALLPAPERS[current] ? WALLPAPERS[current].label : (current || '').split('/').pop();

    const wall = h('section.st-section', { dataset: { anchor: 'wallpaper' } },
      h('div.st-section-head', h('span.micro', 'Wallpaper'), h('span.grow'), h('span.st-section-meta', label)),
      h('div.st-wall-hero', preview(current), h('div.st-walls', presetTiles)));
    const pics = pictureGrid(ctx, current);
    const pictures = pics ? h('section.st-section', { dataset: { anchor: 'pictures' } },
      h('div.st-section-head', h('span.micro', 'Pictures'), h('span.grow'),
        h('span.st-section-meta', 'From your Pictures folder and the system wallpapers')),
      pics) : null;

    const hue = Number(b.pref('accentHue'));
    const swatches = h('div.st-swatches', ACCENTS.map((a) => {
      const s = h('button.st-swatch', { title: a.name, dataset: { hue: String(a.hue) } },
        h('span.st-swatch-dot', { style: { background: `linear-gradient(135deg, oklch(0.70 0.18 ${a.hue}), oklch(0.68 0.20 ${(a.hue + 48) % 360}))` } },
          a.hue === hue ? icon('check') : null),
        h('span.st-swatch-name', a.name));
      s.classList.toggle('on', a.hue === hue);
      s.addEventListener('click', () => b.setPref('accentHue', a.hue));
      return s;
    }));
    const name = (ACCENTS.find((a) => a.hue === hue) || { name: `Hue ${hue}` }).name;
    const accent = section('Accent colour', row({
      anchor: 'accent', glyph: 'sparkles', title: name,
      desc: 'Lights toggles, sliders, the current workspace and focus rings', below: swatches,
    }));

    const now = new Date(2026, 0, 1, 14, 5, 9);
    const use24 = !!b.pref('use24h');
    const secs = !!b.pref('showSeconds');
    const clock = section('Clock', [
      switchRow({ anchor: 'clock-24h', glyph: 'calendar', title: '24-hour time',
        desc: `Five past two in the afternoon reads ${fmtTime(now, use24, false)}` },
      use24, (on) => b.setPref('use24h', on)),
      switchRow({ anchor: 'clock-seconds', glyph: 'calendar', title: 'Show seconds',
        desc: `The clock island reads ${fmtTime(now, use24, secs)}` },
      secs, (on) => b.setPref('showSeconds', on)),
    ]);

    const dock = section('Dock', switchRow({
      anchor: 'dock-autohide', glyph: 'apps', title: 'Hide when a window covers it',
      desc: 'The dock tucks away under windows and comes back at the bottom edge',
    }, !!b.pref('dockAutohide'), (on) => b.setPref('dockAutohide', on)));

    return [wall, pictures, accent, clock, dock];
  },

  topics: ['prefs'],
};
