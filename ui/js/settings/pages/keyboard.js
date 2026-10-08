/**
 * Keyboard shortcuts, drawn from the shell's own hotkey table (js/hotkeys.js)
 * so this page always says what the keys really do.
 */

import { h } from '../../util.js';
import { GROUPS, HOTKEYS, keycaps } from '../../hotkeys.js';
import { section, row } from '../widgets.js';

function chords(entry) {
  return h('span.st-chords', (entry.show || entry.chords).map((c, i) => [
    i ? h('span.st-or', 'or') : null,
    h('span.st-keys', keycaps(c).map((k) => h('kbd', k))),
  ]));
}

export default {
  id: 'keyboard',
  title: 'Keyboard',
  glyph: 'keyboard',
  blurb: 'Shortcuts for the shell, windows and media keys',
  keywords: 'shortcuts hotkeys keys bindings',
  available: () => true,
  // A shortcut is rarely what a search for "volume" means; settings rank first.
  searchWeight: -30,
  items: HOTKEYS.map((k) => ({ id: `key-${k.id}`, label: k.label, keywords: `shortcut ${(k.show || k.chords).join(' ')}` })),
  render() {
    return GROUPS.map((g) => section(g, HOTKEYS.filter((k) => k.group === g).map((k) => row({
      anchor: `key-${k.id}`,
      title: k.label,
      control: chords(k),
      cls: 'st-row-key',
      tag: { dataset: { hotkey: k.id } },
    }))));
  },
};
