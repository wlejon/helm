/**
 * Desktop wallpaper: a few generated gradient presets, or an image path.
 * The setting "wallpaper" holds a preset name or an absolute file path.
 */

import { settings } from './settings.js';

export const WALLPAPERS = {
  aurora: {
    label: 'Aurora',
    css: [
      'radial-gradient(65% 85% at 10% 12%, oklch(0.38 0.12 285 / 0.85) 0%, transparent 62%)',
      'radial-gradient(60% 80% at 92% 88%, oklch(0.42 0.09 205 / 0.75) 0%, transparent 64%)',
      'radial-gradient(40% 55% at 72% 18%, oklch(0.34 0.10 320 / 0.45) 0%, transparent 70%)',
      'linear-gradient(160deg, oklch(0.17 0.025 275), oklch(0.12 0.015 245))',
    ],
  },
  dusk: {
    label: 'Dusk',
    css: [
      'radial-gradient(80% 70% at 85% 100%, oklch(0.62 0.17 45 / 0.9) 0%, transparent 60%)',
      'radial-gradient(70% 80% at 10% 90%, oklch(0.48 0.18 350 / 0.85) 0%, transparent 62%)',
      'radial-gradient(60% 60% at 40% 10%, oklch(0.35 0.12 290 / 0.8) 0%, transparent 70%)',
      'linear-gradient(180deg, oklch(0.17 0.04 290), oklch(0.20 0.05 330))',
    ],
  },
  ocean: {
    label: 'Ocean',
    css: [
      'radial-gradient(75% 85% at 20% 85%, oklch(0.52 0.12 210 / 0.9) 0%, transparent 60%)',
      'radial-gradient(65% 75% at 85% 15%, oklch(0.45 0.13 250 / 0.85) 0%, transparent 65%)',
      'radial-gradient(40% 50% at 60% 60%, oklch(0.55 0.10 175 / 0.45) 0%, transparent 70%)',
      'linear-gradient(170deg, oklch(0.15 0.03 240), oklch(0.12 0.02 220))',
    ],
  },
  forest: {
    label: 'Forest',
    css: [
      'radial-gradient(70% 80% at 15% 20%, oklch(0.45 0.11 160 / 0.9) 0%, transparent 60%)',
      'radial-gradient(70% 80% at 90% 90%, oklch(0.50 0.12 120 / 0.7) 0%, transparent 62%)',
      'linear-gradient(165deg, oklch(0.16 0.03 170), oklch(0.12 0.02 140))',
    ],
  },
  graphite: {
    label: 'Graphite',
    css: [
      'radial-gradient(90% 90% at 50% 0%, oklch(0.32 0.01 265 / 0.9) 0%, transparent 70%)',
      'radial-gradient(60% 60% at 80% 100%, oklch(0.26 0.02 265 / 0.8) 0%, transparent 70%)',
      'linear-gradient(180deg, oklch(0.20 0.006 265), oklch(0.12 0.006 265))',
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
