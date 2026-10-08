/**
 * The active MPRIS player (bro.mpris): what is playing and the controls.
 * Subscribers are told whenever the player, its status or its track change.
 */

import { h, api, attempt, listen } from './util.js';
import { icon } from './icons.js';

export class MediaController {
  constructor() {
    this.player = null;
    this.status = 'Stopped';
    this.meta = null;
    this.subs = new Set();
  }

  init() {
    const m = api('mpris');
    if (!m) return;
    listen(m, 'activePlayerChanged', () => this.refresh());
    listen(m, 'playerAdded', () => this.refresh());
    listen(m, 'playerRemoved', () => this.refresh());
    listen(m, 'playbackStatus', (d) => {
      if (d && this.player && d.playerId === this.player.id) {
        this.status = d.playbackStatus || d.status || this.status;
        this.emit();
      } else {
        this.refresh();
      }
    });
    listen(m, 'metadata', (d) => {
      if (d && this.player && d.playerId === this.player.id) {
        this.meta = d.metadata || d;
        this.emit();
      }
    });
    this.refresh();
  }

  onChange(fn) {
    this.subs.add(fn);
  }

  emit() {
    for (const fn of this.subs) attempt('media subscriber', () => fn(this));
  }

  refresh() {
    const m = api('mpris');
    if (!m) return;
    const players = attempt('mpris.getPlayers', () => m.getPlayers(), []) || [];
    const active = attempt('mpris.getActivePlayer', () => m.getActivePlayer())
      || players.find((p) => p.playbackStatus === 'Playing')
      || players[0]
      || null;
    this.player = active && active.id ? active : null;
    this.status = this.player ? this.player.playbackStatus || 'Stopped' : 'Stopped';
    this.meta = this.player ? attempt('mpris.getMetadata', () => m.getMetadata(this.player.id)) : null;
    this.emit();
  }

  get active() {
    return !!this.player;
  }

  get playing() {
    return this.status === 'Playing';
  }

  get title() {
    return (this.meta && this.meta.title) || (this.player && this.player.identity) || 'Unknown';
  }

  get artist() {
    return (this.meta && this.meta.artist) || (this.player && this.player.identity) || '';
  }

  get artPath() {
    const url = this.meta && this.meta.albumArtUrl;
    if (!url) return null;
    if (url.startsWith('file://')) return decodeURIComponent(url.slice(7));
    return url.startsWith('/') ? url : null;
  }

  playPause() {
    const m = api('mpris');
    if (!m || !this.player) return;
    attempt('mpris.playPause', () => m.playPause(this.player.id));
    this.status = this.playing ? 'Paused' : 'Playing';
    this.emit();
  }

  next() {
    const m = api('mpris');
    if (m && this.player) attempt('mpris.next', () => m.next(this.player.id));
  }

  previous() {
    const m = api('mpris');
    if (m && this.player) attempt('mpris.previous', () => m.previous(this.player.id));
  }
}

/** The now-playing card quick settings and the clock panel share. */
export function mediaCard(m) {
  const art = m.artPath ? h('img', { src: m.artPath }) : icon('music');
  const card = h('div.media-card',
    h('div.media-glow'),
    h('div.media-art', art),
    h('div.media-meta',
      h('span.micro', m.playing ? 'Now playing' : 'Paused'),
      h('span.media-title', m.title),
      m.artist && m.artist !== m.title ? h('span.media-artist', m.artist) : null),
    h('div.media-controls',
      h('button.icon-btn', { title: 'Previous', onclick: () => m.previous() }, icon('skip-back')),
      h('button.icon-btn.media-play', { title: m.playing ? 'Pause' : 'Play', onclick: () => m.playPause() },
        icon(m.playing ? 'pause' : 'play')),
      h('button.icon-btn', { title: 'Next', onclick: () => m.next() }, icon('skip-forward'))));
  card.classList.toggle('playing', m.playing);
  return card;
}
