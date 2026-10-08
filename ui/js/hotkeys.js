/**
 * The shell's hotkeys, in one table. Shell.registerNativeHotkeys() hands it
 * to the host's global hotkeys, Shell.registerHotkeys() runs it from the
 * DOM keydown, and Settings > Keyboard renders it, so none of the three
 * can drift from the others.
 *
 * An entry is { id, group, label, chords, run(shell, chord) } plus:
 *   show    the chords to display, when the table holds a run of them
 *   dom     false when another surface reads these keys from the DOM itself
 *           (the switcher watches Tab and the modifier release)
 *   native  false to keep the chords off the host's global hotkeys
 *   local   chords the host never takes under DRM, so they still reach the
 *           focused window there (Ctrl+, is Preferences in most apps)
 *   grab    the host keeps the keyboard with the shell until the modifier
 *           is released (the switcher commits on that release)
 *
 * Chords are spelled the way bro's registerGlobalHotkey reads them:
 * modifiers in the order Ctrl, Alt, Shift, Super, then the key; 'Super'
 * alone is a tap of Super; hardware keys go by their names.
 */

import { windows } from './windows.js';

export const GROUPS = ['Shell', 'Windows and workspaces', 'Media and hardware'];

const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const HOTKEYS = [
  { id: 'launcher', group: 'Shell', label: 'Open the launcher', chords: ['Super', 'Ctrl+Space', 'Alt+Space'],
    run: (s) => s.launcher.toggle(s.launcherOrigin()) },
  { id: 'clipboard', group: 'Shell', label: 'Clipboard history', chords: ['Super+V', 'Ctrl+Alt+V'],
    run: (s) => s.launcher.openClipboard(s.launcherOrigin()) },
  { id: 'notifications', group: 'Shell', label: 'Calendar and notifications', chords: ['Super+N', 'Ctrl+Shift+N'],
    run: (s) => s.calendar.toggle() },
  { id: 'quick', group: 'Shell', label: 'Quick settings', chords: ['Super+S'], run: (s) => s.quick.toggle() },
  { id: 'settings', group: 'Shell', label: 'Settings', chords: ['Super+,', 'Ctrl+,'], local: ['Ctrl+,'],
    run: (s) => s.toggleSettings() },
  { id: 'lock', group: 'Shell', label: 'Lock the screen', chords: ['Super+L', 'Ctrl+Alt+L'], run: (s) => s.lock.lock() },

  { id: 'spaces', group: 'Windows and workspaces', label: 'Spaces overview', chords: ['Super+W'],
    run: (s) => s.spaces.toggle() },
  { id: 'workspace', group: 'Windows and workspaces', label: 'Go to workspace 1 to 9',
    chords: digits.map((i) => `Super+${i}`), show: ['Super+1…9'],
    run: (s, chord) => windows.switchToIndex(Number(chord.slice(-1)) - 1) },
  { id: 'switch', group: 'Windows and workspaces', label: 'Switch windows', chords: ['Alt+Tab', 'Super+Tab'],
    dom: false, grab: true, run: (s, chord) => s.switcher.step(chord.startsWith('Alt') ? 'Alt' : 'Meta', 1) },
  { id: 'switch-back', group: 'Windows and workspaces', label: 'Switch windows backwards',
    chords: ['Alt+Shift+Tab', 'Super+Shift+Tab'], dom: false, grab: true,
    run: (s, chord) => s.switcher.step(chord.startsWith('Alt') ? 'Alt' : 'Meta', -1) },
  { id: 'close', group: 'Windows and workspaces', label: 'Close the focused window', chords: ['Super+Q'],
    run: (s) => s.closeFocused() },

  { id: 'volume-up', group: 'Media and hardware', label: 'Volume up', chords: ['VolumeUp'], run: (s) => s.stepVolume(0.05) },
  { id: 'volume-down', group: 'Media and hardware', label: 'Volume down', chords: ['VolumeDown'],
    run: (s) => s.stepVolume(-0.05) },
  { id: 'mute', group: 'Media and hardware', label: 'Mute', chords: ['VolumeMute'], run: (s) => s.toggleMute() },
  { id: 'play', group: 'Media and hardware', label: 'Play or pause', chords: ['MediaPlayPause'],
    run: (s) => s.media.playPause() },
  { id: 'next', group: 'Media and hardware', label: 'Next track', chords: ['MediaNextTrack'], run: (s) => s.media.next() },
  { id: 'previous', group: 'Media and hardware', label: 'Previous track', chords: ['MediaPreviousTrack'],
    run: (s) => s.media.previous() },
  { id: 'brightness-up', group: 'Media and hardware', label: 'Brightness up', chords: ['BrightnessUp'], native: false,
    run: (s) => s.stepBrightness(0.05) },
  { id: 'brightness-down', group: 'Media and hardware', label: 'Brightness down', chords: ['BrightnessDown'],
    native: false, run: (s) => s.stepBrightness(-0.05) },
];

/** DOM key names for the hardware keys, mapped to the chord names above. */
const HARDWARE = {
  AudioVolumeUp: 'VolumeUp',
  AudioVolumeDown: 'VolumeDown',
  AudioVolumeMute: 'VolumeMute',
  MediaPlayPause: 'MediaPlayPause',
  MediaTrackNext: 'MediaNextTrack',
  MediaTrackPrevious: 'MediaPreviousTrack',
  BrightnessUp: 'BrightnessUp',
  MonBrightnessUp: 'BrightnessUp',
  BrightnessDown: 'BrightnessDown',
  MonBrightnessDown: 'BrightnessDown',
};

const MODIFIERS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock']);

/** The chord a keydown spells, in the table's spelling; null for a bare modifier. */
export function chordOf(e) {
  if (HARDWARE[e.key]) return HARDWARE[e.key];
  if (e.key === 'Meta') return e.ctrlKey || e.altKey || e.shiftKey ? null : 'Super';
  if (MODIFIERS.has(e.key) || !e.key) return null;
  const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
  return [...mods, key].join('+');
}

/** The entry a chord runs from the DOM keydown, or null. */
export function hotkeyFor(chord) {
  if (!chord) return null;
  return HOTKEYS.find((k) => k.dom !== false && k.chords.includes(chord)) || null;
}

/**
 * The chords to register with the host. Under DRM the host matches every
 * key against them first, so all of them go (bar each entry's `local`
 * ones). Windowed, only chords the desktop around us would not already
 * own: Ctrl or Alt combinations without Super or Tab.
 */
export function nativeChords(drm) {
  const out = [];
  for (const k of HOTKEYS) {
    if (k.native === false) continue;
    for (const chord of k.chords) {
      if (drm) {
        if ((k.local || []).includes(chord)) continue;
        out.push({ entry: k, chord, accel: chord });
      } else if (/^(Ctrl|Alt)\+/.test(chord) && !/Super|Tab/.test(chord)) {
        out.push({ entry: k, chord, accel: chord.replace(/^Ctrl\+/, 'CommandOrControl+') });
      }
    }
  }
  return out;
}

const KEY_NAMES = {
  Super: 'Super',
  Space: 'Space',
  VolumeUp: 'Volume Up',
  VolumeDown: 'Volume Down',
  VolumeMute: 'Mute',
  MediaPlayPause: 'Play/Pause',
  MediaNextTrack: 'Next',
  MediaPreviousTrack: 'Previous',
  BrightnessUp: 'Brightness Up',
  BrightnessDown: 'Brightness Down',
};

/** A chord as the keycaps to draw: 'Ctrl+Alt+V' -> ['Ctrl', 'Alt', 'V']. */
export function keycaps(chord) {
  return chord.split(/\+(?=.)/).map((k) => KEY_NAMES[k] || k);
}
