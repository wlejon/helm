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
      glow(18, 20, 'oklch(0.32 0.085 258 / 0.72)', 52),
      glow(84, 78, 'oklch(0.34 0.065 205 / 0.65)', 48),
      glow(64, 14, 'oklch(0.28 0.045 290 / 0.45)', 36),
      'linear-gradient(155deg, oklch(0.14 0.025 258), oklch(0.095 0.018 240))',
    ],
  },
  dusk: {
    label: 'Dusk',
    css: [
      glow(80, 96, 'oklch(0.46 0.115 44 / 0.72)', 50),
      glow(14, 86, 'oklch(0.36 0.095 16 / 0.62)', 46),
      glow(44, 12, 'oklch(0.27 0.055 295 / 0.60)', 42),
      'linear-gradient(175deg, oklch(0.11 0.022 285), oklch(0.14 0.032 330))',
    ],
  },
  ocean: {
    label: 'Ocean',
    css: [
      glow(20, 82, 'oklch(0.38 0.075 212 / 0.74)', 50),
      glow(86, 16, 'oklch(0.33 0.070 248 / 0.68)', 46),
      glow(58, 56, 'oklch(0.36 0.055 186 / 0.36)', 30),
      'linear-gradient(168deg, oklch(0.11 0.022 242), oklch(0.08 0.018 218))',
    ],
  },
  forest: {
    label: 'Forest',
    css: [
      glow(16, 20, 'oklch(0.35 0.068 164 / 0.72)', 48),
      glow(88, 86, 'oklch(0.37 0.062 128 / 0.56)', 44),
      glow(68, 24, 'oklch(0.31 0.045 196 / 0.42)', 32),
      'linear-gradient(165deg, oklch(0.11 0.020 172), oklch(0.08 0.015 144))',
    ],
  },
  ember: {
    label: 'Ember',
    css: [
      glow(52, 104, 'oklch(0.46 0.125 38 / 0.72)', 52),
      glow(12, 26, 'oklch(0.31 0.078 18 / 0.56)', 38),
      glow(88, 18, 'oklch(0.28 0.055 312 / 0.48)', 36),
      'linear-gradient(178deg, oklch(0.10 0.018 310), oklch(0.13 0.030 24))',
    ],
  },
  graphite: {
    label: 'Graphite',
    css: [
      glow(50, -4, 'oklch(0.32 0.014 260 / 0.78)', 56),
      glow(84, 102, 'oklch(0.26 0.025 258 / 0.60)', 44),
      'linear-gradient(180deg, oklch(0.165 0.008 260), oklch(0.105 0.008 258))',
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
