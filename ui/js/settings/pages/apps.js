/**
 * Default apps: which app opens links, mail, folders, text, pictures, video,
 * music and PDFs. Reads and writes the freedesktop MIME associations
 * (mimeapps.list) through bro.apps; a category sets every type it covers.
 */

import { h, appIcon } from '../../util.js';
import { icon } from '../../icons.js';
import { section, row, empty } from '../widgets.js';

export const CATEGORIES = [
  { id: 'browser', label: 'Web browser', glyph: 'globe', mimes: ['x-scheme-handler/https', 'x-scheme-handler/http', 'text/html'] },
  { id: 'mail', label: 'Email', glyph: 'mail', mimes: ['x-scheme-handler/mailto'] },
  { id: 'files', label: 'Files', glyph: 'folder', mimes: ['inode/directory'] },
  { id: 'text', label: 'Text editor', glyph: 'file', mimes: ['text/plain'] },
  { id: 'images', label: 'Images', glyph: 'image', mimes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
  { id: 'video', label: 'Video', glyph: 'play', mimes: ['video/mp4', 'video/webm', 'video/x-matroska'] },
  { id: 'music', label: 'Music', glyph: 'music', mimes: ['audio/mpeg', 'audio/flac', 'audio/ogg'] },
  { id: 'pdf', label: 'PDF documents', glyph: 'file', mimes: ['application/pdf'] },
];

/** The apps that can open every type in the category, current default first. */
function candidates(b, cat) {
  const byId = new Map();
  for (const m of cat.mimes) {
    for (const a of b.appsFor(m)) if (!a.nodisplay && !byId.has(a.id)) byId.set(a.id, a);
  }
  return Array.from(byId.values()).sort((x, y) => x.name.localeCompare(y.name));
}

function choose(ctx, cat, list, anchor) {
  const r = anchor.getBoundingClientRect();
  ctx.shell.menus.show([
    { heading: cat.label },
    ...list.map((a) => ({
      label: a.name,
      icon: ctx.state.current && ctx.state.current[cat.id] === a.id ? 'check' : null,
      action: () => {
        ctx.b.setDefaultApp(cat.mimes, a.id);
        ctx.rerender();
      },
    })),
  ], r.left, r.bottom + 6);
}

export default {
  id: 'apps',
  title: 'Default Apps',
  glyph: 'apps',
  blurb: 'Which app opens links, files and media',
  keywords: 'mime associations open with handler',
  available: (b) => b.hasMime(),
  items: CATEGORIES.map((c) => ({ id: `mime-${c.id}`, label: `Default ${c.label.toLowerCase()}`, keywords: `${c.label} ${c.mimes.join(' ')}` })),
  render(ctx) {
    const b = ctx.b;
    ctx.state.current = {};
    const rows = [];
    for (const cat of CATEGORIES) {
      const list = candidates(b, cat);
      const def = b.defaultApp(cat.mimes[0]);
      if (list.length === 0 && !def) continue;
      if (def && !list.some((a) => a.id === def.id)) list.unshift(def);
      ctx.state.current[cat.id] = def ? def.id : null;
      const pick = h('button.st-picker', { dataset: { category: cat.id } },
        def ? appIcon(def.icon, def.name, 32, 'st-app-icon') : h('span.st-app-icon.none', icon('apps')),
        h('span.grow', def ? def.name : 'Choose…'),
        icon('chevron-down', 'st-dim'));
      pick.addEventListener('click', (e) => {
        e.stopPropagation();
        choose(ctx, cat, list, pick);
      });
      rows.push(row({
        anchor: `mime-${cat.id}`,
        glyph: cat.glyph,
        title: cat.label,
        desc: list.length === 1 ? 'One app can open these' : `${list.length} apps can open these`,
        control: pick,
      }));
    }
    if (rows.length === 0) {
      return h('div.st-empty-wrap', empty('apps', 'No apps registered for common files',
        'Installed apps list the types they open in their .desktop files'));
    }
    return section('Open with', rows, { note: 'Saved in your mimeapps.list, so other desktops and apps follow it too.' });
  },
};
