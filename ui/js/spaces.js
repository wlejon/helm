/**
 * Spaces: the left island's panel. A card per workspace with a miniature
 * of its windows laid out where they sit on screen, plus a card that makes
 * a new one; under it the windows of the current space, to focus or close.
 */

import { h, $, windowIcon } from './util.js';
import { icon } from './icons.js';
import { windows } from './windows.js';
import { appdb } from './appdb.js';
import { panels } from './morph.js';

const THUMB_W = 102;

export class Spaces {
  constructor(shell) {
    this.shell = shell;
  }

  init() {
    this.el = $('#spaces-panel');
    this.body = h('div.panel-body.sp');
    this.el.replaceChildren(this.body);
    this.panel = {
      el: this.el, body: this.body, island: $('#island-left'), align: 'left',
      onOpen: () => this.render(),
    };
    const rerender = () => this.isOpen && panels.resize(this.panel, () => this.render());
    windows.on('windows', rerender);
    windows.on('workspaces', rerender);
  }

  get isOpen() {
    return panels.isOpen(this.panel);
  }

  toggle() {
    panels.toggle(this.panel);
  }

  close() {
    if (this.isOpen) panels.close();
  }

  render() {
    let spaces = windows.workspaces();
    if (spaces.length === 0) spaces = [{ id: 0, name: '1', active: true, windows: [] }];
    const all = windows.windows();
    const vw = window.innerWidth || 1920;
    const vh = window.innerHeight || 1080;
    const scale = THUMB_W / vw;

    const cards = spaces.map((ws, i) => {
      const wins = all.filter((w) => (ws.windows || []).includes(w.id)
        || (w.workspaceId != null && w.workspaceId === ws.id));
      const thumb = h('div.sp-thumb', { style: { height: `${Math.round(vh * scale)}px` } },
        wins.filter((w) => !w.minimized && (w.frame || w).width).slice(0, 8).map((w) => {
          const f = w.frame || w;
          const app = appdb.forWindow(w.appId, w.title);
          const mini = h('div.sp-win', {
            style: {
              left: `${Math.round(f.x * scale)}px`, top: `${Math.round(f.y * scale)}px`,
              width: `${Math.max(14, Math.round(f.width * scale))}px`, height: `${Math.max(10, Math.round(f.height * scale))}px`,
            },
          }, windowIcon(w, app, app ? app.name : w.title, 32, 'sp-win-icon'));
          mini.classList.toggle('focused', !!w.focused);
          return mini;
        }));
      const card = h('button.sp-card', { title: `Switch to space ${i + 1}` },
        thumb,
        h('div.sp-label', h('span.num', String(i + 1)),
          h('span.sp-count', wins.length ? `${wins.length} window${wins.length > 1 ? 's' : ''}` : 'Empty')));
      card.classList.toggle('active', !!ws.active);
      card.addEventListener('click', () => {
        if (!ws.active) windows.switchWorkspace(ws.id);
        this.close();
      });
      return card;
    });
    if (spaces.length < 9) {
      const add = h('button.sp-card.sp-add', { title: 'New space' },
        h('div.sp-thumb', { style: { height: `${Math.round(vh * scale)}px` } }, icon('plus')),
        h('div.sp-label', h('span.sp-count', 'New space')));
      add.addEventListener('click', () => {
        windows.switchToIndex(spaces.length);
        this.close();
      });
      cards.push(add);
    }

    const active = spaces.find((s) => s.active) || spaces[0];
    const here = all.filter((w) => active && ((active.windows || []).includes(w.id) || w.workspaceId === active.id));
    const rows = here.map((w) => {
      const app = appdb.forWindow(w.appId, w.title);
      const name = app ? app.name : w.appId || 'Window';
      const close = h('button.icon-btn.sp-close', { title: 'Close window' }, icon('x'));
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        windows.close(w.id);
      });
      const row = h('div.list-row.sp-row', { tabindex: '0' },
        windowIcon(w, app, name, 32, 'sp-row-icon'),
        h('span.grow', h('span.sp-row-title', w.title || name), h('span.sp-row-app', name)),
        close);
      row.classList.toggle('selected', !!w.focused);
      row.addEventListener('click', () => {
        windows.focus(w.id);
        this.close();
      });
      return row;
    });

    this.body.replaceChildren(
      h('div.sp-head', h('span.micro', 'Spaces'), h('span.grow'), h('span.sp-hint', 'Super+1…9')),
      h('div.sp-cards', cards),
      h('div.sp-head', h('span.micro', 'On this space')),
      rows.length ? h('div.sp-list', rows)
        : h('div.empty.sp-empty', h('div.empty-title', 'Nothing open here'),
          h('div.empty-hint', 'Apps you open on this space show up here')));
  }
}
