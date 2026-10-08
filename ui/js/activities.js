/**
 * Live activities: things happening right now that the clock island shows
 * while they last. Media playback is fed in by the shell from MPRIS; any
 * other source (a screen recorder, a timer) calls
 *
 *   helm.activities.start({ id, kind: 'recording', title, since })
 *   helm.activities.update(id, { title })
 *   helm.activities.end(id)
 *
 * kind is 'media' or 'recording' (anything else renders like media with
 * its `icon`). The island shows the most important one: recordings beat
 * media, newer beats older.
 */

import { attempt } from './util.js';

const RANK = { recording: 2, media: 1 };

export class Activities {
  constructor() {
    this.items = new Map();
    this.subs = new Set();
    this.seq = 0;
  }

  onChange(fn) {
    this.subs.add(fn);
  }

  emit() {
    for (const fn of this.subs) attempt('activity subscriber', () => fn(this));
  }

  start(a) {
    if (!a || !a.id) return;
    const prev = this.items.get(a.id);
    this.items.set(a.id, { since: Date.now(), ...prev, ...a, order: prev ? prev.order : ++this.seq });
    this.emit();
  }

  update(id, patch) {
    const prev = this.items.get(id);
    if (!prev) return;
    this.items.set(id, { ...prev, ...patch });
    this.emit();
  }

  end(id) {
    if (this.items.delete(id)) this.emit();
  }

  get(id) {
    return this.items.get(id) || null;
  }

  /** The activity the island shows, or null. */
  primary() {
    let best = null;
    for (const a of this.items.values()) {
      const r = RANK[a.kind] || 0;
      const b = best ? RANK[best.kind] || 0 : -1;
      if (!best || r > b || (r === b && a.order > best.order)) best = a;
    }
    return best;
  }
}

export function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
}
