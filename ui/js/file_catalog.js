/**
 * Spotlight FileCatalogIndex for the Helm launcher, powered by bro.table.
 * Supports mmap or loaded .brotable catalogs and query tokens (`ext:pdf`, `>1MB`).
 */

function tableApi() {
  return (typeof bro !== 'undefined' && bro && bro.table) ? bro.table : null;
}

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function parseSizeExpr(tok) {
  const m = /^([<>]=?)(\d+(?:\.\d+)?)(B|KB|MB|GB)?$/i.exec(tok);
  if (!m) return null;
  const mults = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
  const unit = (m[3] || 'B').toUpperCase();
  const val = Math.floor(Number(m[2]) * (mults[unit] || 1));
  if (!Number.isFinite(val)) return null;
  return { op: m[1], bytes: BigInt(Math.max(0, val)) };
}

export class FileCatalogIndex {
  constructor() {
    this.snapshot = null;
    this.table = null;
    this.catalogPath = '';
  }

  activeSource() {
    return this.snapshot || this.table || null;
  }

  rowCount() {
    const src = this.activeSource();
    return src ? src.rowCount : 0;
  }

  setTable(tblOrSnap) {
    this.close();
    if (!tblOrSnap) return;
    if (typeof tblOrSnap.toTable === 'function') this.snapshot = tblOrSnap;
    else this.table = tblOrSnap;
  }

  close() {
    if (this.snapshot && typeof this.snapshot.close === 'function') {
      try { this.snapshot.close(); } catch (_) { /* ignore */ }
    }
    this.snapshot = null;
    this.table = null;
    this.catalogPath = '';
  }

  load(filePath, { mmap = true } = {}) {
    const q = tableApi();
    if (!q || !filePath) return false;
    this.close();
    if (mmap) {
      try {
        this.snapshot = q.mmap(filePath);
        this.catalogPath = filePath;
        return true;
      } catch (_) {
        // Compressed .brotable v4 falls back to load().
      }
    }
    this.table = q.load(filePath);
    this.catalogPath = filePath;
    return !!this.table;
  }

  search(rawQuery, { limit = 6 } = {}) {
    const q = tableApi();
    const src = this.activeSource();
    if (!q || !src || src.rowCount === 0) return [];

    const tokens = String(rawQuery || '').trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    const schema = src.schema;
    const hasExt = schema.some((c) => c.name === 'ext');
    const hasSize = schema.some((c) => c.name === 'size');
    const hasNameLower = schema.some((c) => c.name === 'nameLower');
    const nameCol = hasNameLower ? 'nameLower' : 'name';

    let qb = src.query();
    let hasText = false;

    for (const tok of tokens) {
      const lower = tok.toLowerCase();
      if (lower.startsWith('ext:') && lower.length > 4 && hasExt) {
        qb = qb.where(q.eq('ext', lower.slice(4)));
        continue;
      }
      const sz = parseSizeExpr(tok);
      if (sz && hasSize) {
        if (sz.op === '>') qb = qb.where(q.gt('size', sz.bytes));
        else if (sz.op === '>=') qb = qb.where(q.ge('size', sz.bytes));
        else if (sz.op === '<') qb = qb.where(q.lt('size', sz.bytes));
        else if (sz.op === '<=') qb = qb.where(q.le('size', sz.bytes));
        continue;
      }
      hasText = true;
      qb = qb.where(q.contains(nameCol, hasNameLower ? lower : tok));
    }

    qb = qb.orderBy(hasText ? nameCol : (hasSize ? 'size' : nameCol), hasText ? 'asc' : 'desc');
    const rows = qb.limit(Math.max(1, Number(limit) || 6)).toArray();

    return rows.map((r) => {
      const size = Number(r.size || 0);
      return {
        path: r.path || '',
        name: r.name || '',
        dir: r.dir || '',
        ext: r.ext || '',
        kind: r.kind || 'file',
        size,
        sizeText: r.isDir ? 'Folder' : formatSize(size),
        mtime: Number(r.mtime || 0),
        isDir: !!r.isDir,
      };
    });
  }
}
