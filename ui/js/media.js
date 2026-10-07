/**
 * Helm Desktop MPRIS Media Player Controller
 * Integrates with bro.mpris to track active media players and control playback.
 */

export class MediaController {
  constructor() {
    this.activePlayerId = null;
    this.playbackStatus = 'Stopped';
    this.metadata = null;
    this.isAvailable = false;
  }

  init() {
    if (typeof bro !== 'undefined' && bro.mpris && bro.mpris.available) {
      this.isAvailable = true;
    }

    this.bindDom();
    if (this.isAvailable) {
      this.refreshPlayers();
      this.bindEvents();
    }
  }

  bindDom() {
    this.widgetEl = document.getElementById('panel-media-widget');
    this.titleEl = document.getElementById('media-title');
    this.playBtn = document.getElementById('media-play-btn');
    this.prevBtn = document.getElementById('media-prev-btn');
    this.nextBtn = document.getElementById('media-next-btn');

    if (this.playBtn) {
      this.playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.playPause();
      });
    }

    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.previous();
      });
    }

    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.next();
      });
    }
  }

  bindEvents() {
    if (!this.isAvailable || typeof bro.mpris.on !== 'function') return;

    try {
      bro.mpris.on('activePlayerChanged', (player) => {
        this.onActivePlayerChanged(player);
      });
      bro.mpris.on('playbackStatus', (data) => {
        if (!data) return;
        if (!this.activePlayerId || data.playerId === this.activePlayerId) {
          this.playbackStatus = data.status || 'Stopped';
          this.updateUi();
        }
      });
      bro.mpris.on('metadata', (data) => {
        if (!data) return;
        if (!this.activePlayerId || data.playerId === this.activePlayerId) {
          this.metadata = data.metadata || data;
          this.updateUi();
        }
      });
      bro.mpris.on('playerAdded', () => this.refreshPlayers());
      bro.mpris.on('playerRemoved', () => this.refreshPlayers());
    } catch (err) {
      console.warn('Helm MediaController: failed to bind MPRIS events:', err);
    }
  }

  refreshPlayers() {
    if (!this.isAvailable) return;
    try {
      const active = bro.mpris.getActivePlayer();
      if (active) {
        this.onActivePlayerChanged(active);
        return;
      }
      const players = bro.mpris.getPlayers();
      if (Array.isArray(players) && players.length > 0) {
        this.onActivePlayerChanged(players[0]);
      } else {
        this.activePlayerId = null;
        this.playbackStatus = 'Stopped';
        this.metadata = null;
        this.updateUi();
      }
    } catch (err) {
      console.warn('Helm MediaController: refreshPlayers failed:', err);
    }
  }

  onActivePlayerChanged(player) {
    if (!player) return;
    this.activePlayerId = player.id || player.identity;
    this.playbackStatus = player.playbackStatus || 'Stopped';
    try {
      this.metadata = bro.mpris.getMetadata(this.activePlayerId);
    } catch (_) {
      this.metadata = null;
    }
    this.updateUi();
  }

  updateUi() {
    if (!this.widgetEl) return;

    if (!this.activePlayerId) {
      this.widgetEl.classList.add('hidden');
      return;
    }

    this.widgetEl.classList.remove('hidden');

    if (this.playBtn) {
      this.playBtn.textContent = this.playbackStatus === 'Playing' ? '⏸' : '▶';
    }

    if (this.titleEl) {
      const title = this.metadata?.title || 'Unknown Track';
      const artist = this.metadata?.artist ? ` - ${this.metadata.artist}` : '';
      this.titleEl.textContent = `${title}${artist}`;
      this.titleEl.title = `${title}${artist}`;
    }
  }

  playPause() {
    if (!this.isAvailable || !this.activePlayerId) return;
    try {
      bro.mpris.playPause(this.activePlayerId);
      this.playbackStatus = this.playbackStatus === 'Playing' ? 'Paused' : 'Playing';
      this.updateUi();
    } catch (err) {
      console.warn('Helm Media: playPause failed:', err);
    }
  }

  previous() {
    if (!this.isAvailable || !this.activePlayerId) return;
    try {
      bro.mpris.previous(this.activePlayerId);
    } catch (err) {
      console.warn('Helm Media: previous failed:', err);
    }
  }

  next() {
    if (!this.isAvailable || !this.activePlayerId) return;
    try {
      bro.mpris.next(this.activePlayerId);
    } catch (err) {
      console.warn('Helm Media: next failed:', err);
    }
  }
}
