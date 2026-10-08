/**
 * Settings search: every word of the query has to land somewhere in a
 * setting's label, its page's title or its keywords. Labels that start with
 * the query rank first, then word starts, then anywhere.
 */

/** Lowercase, with hyphens dropped: "Wi-Fi" matches "wifi". */
const norm = (s) => String(s).toLowerCase().replace(/-/g, '');

function scoreText(q, text) {
  const t = norm(text);
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/[\s\-/,()]+/).some((w) => w.startsWith(q))) return 60;
  if (t.includes(q)) return 40;
  return 0;
}

function scoreEntry(words, q, label, pageTitle, keywords) {
  const whole = scoreText(q, label);
  const hay = norm(`${label} ${pageTitle} ${keywords}`);
  if (!words.every((w) => hay.includes(w))) return 0;
  return Math.max(whole, 10) + (scoreText(q, pageTitle) > 0 ? 5 : 0);
}

/** [{ page, item | null, score }] best first; item null means the page itself. */
export function search(pages, query, b = null, limit = 40) {
  const q = norm(query.trim());
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const out = [];
  for (const page of pages) {
    const pageScore = scoreEntry(words, q, page.title, '', `${page.blurb || ''} ${page.keywords || ''}`);
    if (pageScore) out.push({ page, item: null, score: pageScore + 15 });
    const keep = b && page.filterItems ? page.filterItems(b) : () => true;
    for (const item of (page.items || []).filter(keep)) {
      const s = scoreEntry(words, q, item.label, page.title, item.keywords || '');
      if (s) out.push({ page, item, score: s + (page.searchWeight || 0) });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
