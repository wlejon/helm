/**
 * Appearance: wallpaper, accent colour, and desktop behaviour. Everything here
 * reads and writes the shell preferences (settings.js), so the bar, dock and
 * lock screen follow along without a reload.
 */

import { h, clear } from '../../dom.js';
import { createIcon } from '../settings_icons.js';
import { viewHeader, settingsRow, toggleSwitch } from '../components.js';
import { settings as prefs } from '../../settings.js';
import { WALLPAPERS } from '../../wallpaper.js';

const ACCENTS = [
  { hue: 255, label: 'Blue' },
  { hue: 285, label: 'Violet' },
  { hue: 330, label: 'Pink' },
  { hue: 25, label: 'Red' },
  { hue: 60, label: 'Orange' },
  { hue: 150, label: 'Green' },
  { hue: 195, label: 'Teal' },
];

export class AppearanceView {
  constructor(controller) {
    this.controller = controller;
    this.container = null;
  }

  hasSearchMatches(query) {
    const q = query.toLowerCase();
    const terms = ['appearance', 'wallpaper', 'background', 'accent', 'color', 'colour',
      'clock', '24-hour', 'seconds', 'dock', 'autohide', 'hide'];
    return terms.some((t) => t.includes(q));
  }

  rerender() {
    if (this.container) this.render(this.container, this.controller.searchQuery);
  }

  render(container) {
    this.container = container;
    clear(container);
    container.appendChild(viewHeader('Appearance', 'Wallpaper, accent colour and desktop behaviour.'));
    container.appendChild(this.renderWallpaperSection());
    container.appendChild(this.renderAccentSection());
    container.appendChild(this.renderDesktopSection());
  }

  cardHeader(icon, title, desc, actions = null) {
    return h('div.settings-card-header', null,
      h('span.card-header-icon', null, createIcon(icon, 18)),
      h('div.card-header-text', null,
        h('h3.card-title', null, title),
        h('span.card-description', null, desc)),
      actions ? h('div.card-header-actions', null, actions) : null);
  }

  renderWallpaperSection() {
    const current = prefs.get('wallpaper');
    const tiles = Object.entries(WALLPAPERS).map(([id, wp]) => {
      const selected = current === id;
      return h(`div.wallpaper-tile${selected ? '.selected' : ''}`, {
        dataset: { wallpaperId: id },
        onclick: () => {
          prefs.set('wallpaper', id);
          this.rerender();
        },
      },
      h('div.wallpaper-tile-preview', { style: { backgroundImage: wp.css.join(', ') } },
        selected ? h('div.wallpaper-check-badge', null, createIcon('check', 12)) : null),
      h('div.wallpaper-tile-info', null, h('span.wallpaper-tile-name', null, wp.label)));
    });

    if (typeof current === 'string' && current.startsWith('/')) {
      tiles.unshift(h('div.wallpaper-tile.selected', { dataset: { wallpaperId: 'custom' } },
        h('div.wallpaper-tile-preview', { style: { backgroundImage: `url("${current}")` } },
          h('div.wallpaper-check-badge', null, createIcon('check', 12))),
        h('div.wallpaper-tile-info', null, h('span.wallpaper-tile-name', null, 'Custom'))));
    }

    const canPick = typeof showOpenFileDialog === 'function';
    const pick = canPick
      ? h('button.btn.btn-secondary.btn-sm#btn-custom-wallpaper', { onclick: () => this.pickImage() },
        createIcon('image', 13), ' Choose Image…')
      : null;

    return h('section.settings-card.appearance-wallpaper-card', null,
      this.cardHeader('image', 'Wallpaper', 'A built-in background, or an image of your own.', pick),
      h('div.wallpaper-gallery-grid', null, ...tiles));
  }

  pickImage() {
    let paths = [];
    try {
      paths = showOpenFileDialog('Images|png;jpg;jpeg;webp', false) || [];
    } catch (err) {
      console.warn('Settings: image dialog failed:', err);
    }
    if (paths.length && paths[0].startsWith('/')) {
      prefs.set('wallpaper', paths[0]);
      this.rerender();
    }
  }

  renderAccentSection() {
    const current = Number(prefs.get('accentHue'));
    const swatches = ACCENTS.map((a) => {
      const selected = current === a.hue;
      return h(`button.accent-swatch${selected ? '.selected.active' : ''}`, {
        type: 'button',
        title: a.label,
        dataset: { hue: String(a.hue) },
        style: { backgroundColor: `oklch(0.72 0.15 ${a.hue})` },
        onclick: () => {
          prefs.set('accentHue', a.hue);
          this.rerender();
        },
      }, selected ? h('span.swatch-checkmark', null, createIcon('check', 12)) : null);
    });

    return h('section.settings-card.appearance-accent-card', null,
      this.cardHeader('appearance', 'Accent colour', 'Highlights, toggles, sliders and focus rings.'),
      h('div.accent-swatches-grid', null, ...swatches));
  }

  renderDesktopSection() {
    const row = (key, title, desc) => settingsRow({
      title,
      desc,
      accessory: toggleSwitch({
        checked: !!prefs.get(key),
        id: `pref-${key}`,
        onChange: (on) => prefs.set(key, on),
      }).element,
    });
    return h('section.settings-group.appearance-desktop-card', null,
      h('div.settings-group-header', null, 'Desktop'),
      h('div.settings-group-box', null,
        row('use24h', '24-hour clock', 'Show the time as 18:30 rather than 6:30 PM.'),
        row('showSeconds', 'Show seconds', 'Add seconds to the clock in the top bar.'),
        row('dockAutohide', 'Hide the dock', 'Tuck the dock away when a window overlaps it.')));
  }

  destroy() {
    this.container = null;
  }
}
