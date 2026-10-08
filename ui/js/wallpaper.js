/**
 * Desktop wallpaper: a few generated gradient presets, or an image path.
 * The setting "wallpaper" holds a preset name or an absolute file path.
 */

import { settings } from './settings.js';

/*
 * bro sizes every radial gradient to its farthest corner (an explicit size
 * is ignored), so each glow's extent is set by where its stops end.
 */
const glow = (x, y, color, reach, core = 0) =>
  `radial-gradient(ellipse at ${x}% ${y}%, ${color} ${core}%, transparent ${reach}%)`;

export const WALLPAPERS = {
  aurora: {
    label: 'Aurora',
    css: [
      glow(15, 16, 'oklch(0.50 0.22 292 / 0.95)', 46),
      glow(88, 86, 'oklch(0.54 0.14 190 / 0.85)', 44),
      glow(78, 8, 'oklch(0.48 0.21 345 / 0.60)', 30),
      glow(34, 104, 'oklch(0.40 0.17 255 / 0.75)', 34),
      'linear-gradient(160deg, oklch(0.12 0.045 282), oklch(0.075 0.025 250))',
    ],
  },
  dusk: {
    label: 'Dusk',
    css: [
      glow(82, 100, 'oklch(0.70 0.18 50 / 0.95)', 48),
      glow(10, 92, 'oklch(0.56 0.22 355 / 0.90)', 46),
      glow(46, 6, 'oklch(0.42 0.18 295 / 0.85)', 40),
      'linear-gradient(180deg, oklch(0.10 0.04 290), oklch(0.14 0.06 330))',
    ],
  },
  ocean: {
    label: 'Ocean',
    css: [
      glow(16, 86, 'oklch(0.60 0.14 205 / 0.95)', 48),
      glow(88, 12, 'oklch(0.50 0.18 258 / 0.90)', 44),
      glow(62, 60, 'oklch(0.60 0.12 175 / 0.45)', 26),
      'linear-gradient(170deg, oklch(0.10 0.04 245), oklch(0.07 0.03 220))',
    ],
  },
  forest: {
    label: 'Forest',
    css: [
      glow(14, 18, 'oklch(0.54 0.15 160 / 0.95)', 46),
      glow(90, 90, 'oklch(0.58 0.15 115 / 0.70)', 42),
      glow(70, 22, 'oklch(0.46 0.10 200 / 0.50)', 28),
      'linear-gradient(165deg, oklch(0.10 0.035 170), oklch(0.07 0.025 140))',
    ],
  },
  ember: {
    label: 'Ember',
    css: [
      glow(50, 110, 'oklch(0.68 0.21 38 / 0.95)', 50),
      glow(8, 28, 'oklch(0.46 0.19 10 / 0.70)', 36),
      glow(90, 18, 'oklch(0.42 0.17 300 / 0.65)', 34),
      'linear-gradient(180deg, oklch(0.09 0.03 300), oklch(0.13 0.06 20))',
    ],
  },
  graphite: {
    label: 'Graphite',
    css: [
      glow(50, -6, 'oklch(0.38 0.02 265 / 0.95)', 56),
      glow(86, 104, 'oklch(0.30 0.06 265 / 0.85)', 40),
      'linear-gradient(180deg, oklch(0.17 0.008 265), oklch(0.10 0.008 265))',
    ],
  },
};

export class Wallpaper {
  constructor(el) {
    this.el = el;
  }

  init() {
    this.apply(settings.get('wallpaper'));
    settings.watch('wallpaper', (v) => this.apply(v));
  }

  apply(value) {
    if (!this.el) return;
    const preset = WALLPAPERS[value];
    if (preset) {
      this.el.style.backgroundImage = preset.css.join(', ');
    } else if (typeof value === 'string' && value.startsWith('/')) {
      this.el.style.backgroundImage = `url("${value}")`;
    } else {
      this.el.style.backgroundImage = WALLPAPERS.aurora.css.join(', ');
    }
  }

  /** The current wallpaper as a CSS background-image value (lock screen). */
  css() {
    return this.el ? this.el.style.backgroundImage : '';
  }
}
