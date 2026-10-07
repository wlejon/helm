/**
 * Helm Desktop Clipboard Manager Controller
 * Integrates with bro.clip for multi-MIME clipboard history and quick access.
 */

export class ClipboardController {
  constructor() {
    this.isAvailable = false;
    this.history = [];
  }

  init() {
    if (typeof bro !== 'undefined' && bro.clip && bro.clip.available) {
      this.isAvailable = true;
      this.refreshHistory();
      this.bindEvents();
    }
  }

  bindEvents() {
    if (!this.isAvailable || typeof bro.clip.on !== 'function') return;

    try {
      bro.clip.on('clip', () => {
        this.refreshHistory();
      });
      bro.clip.on('clear', () => {
        this.history = [];
      });
    } catch (err) {
      console.warn('Helm ClipboardController: failed to bind clip events:', err);
    }
  }

  refreshHistory() {
    if (!this.isAvailable) return;
    try {
      this.history = bro.clip.getHistory() || [];
    } catch (err) {
      console.warn('Helm ClipboardController: getHistory failed:', err);
      this.history = [];
    }
  }

  getEntries() {
    if (this.isAvailable) {
      this.refreshHistory();
      return this.history;
    }
    return [];
  }

  copyText(text) {
    if (!this.isAvailable) return;
    try {
      bro.clip.setText(text);
      this.refreshHistory();
    } catch (err) {
      console.warn('Helm Clipboard: setText failed:', err);
    }
  }

  pasteEntry(id) {
    if (!this.isAvailable) return;
    try {
      if (typeof bro.clip.paste === 'function') {
        bro.clip.paste(id);
      } else {
        const text = bro.clip.getText(id);
        if (text) bro.clip.setText(text);
      }
    } catch (err) {
      console.warn('Helm Clipboard: pasteEntry failed:', err);
    }
  }

  setPinned(id, pinned) {
    if (!this.isAvailable) return;
    try {
      bro.clip.setPinned(id, pinned);
      this.refreshHistory();
    } catch (err) {
      console.warn('Helm Clipboard: setPinned failed:', err);
    }
  }

  remove(id) {
    if (!this.isAvailable) return;
    try {
      bro.clip.remove(id);
      this.refreshHistory();
    } catch (err) {
      console.warn('Helm Clipboard: remove failed:', err);
    }
  }

  clear() {
    if (!this.isAvailable) return;
    try {
      bro.clip.clear();
      this.history = [];
    } catch (err) {
      console.warn('Helm Clipboard: clear failed:', err);
    }
  }
}
