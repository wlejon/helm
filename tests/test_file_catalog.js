// test_file_catalog.js: verifies Spotlight FileCatalogIndex integration in Helm Launcher.
// Builds a 10,000-row .brotable catalog with HashIndex(ext) and RangeIndex(size),
// maps it into window.helm.launcher.fileCatalog, searches plain & token queries (`ext:parquet >100KB`),
// verifies `.launcher-row.kind-file` results render cleanly, and closes with Escape.

const fs = require('fs');
const os = require('os');
const path = require('path');

const settle = (n = 10) => { for (let i = 0; i < n; ++i) { advanceTime(16); flush(); } };
settle();

const helm = window.helm;
assert(helm && helm.launcher && helm.launcher.fileCatalog, 'helm.launcher.fileCatalog exists');
assert(typeof bro !== 'undefined' && bro.table, 'bro.table mounted in helm-headless');

const catPath = path.join(os.tmpdir(), `helm_spotlight_cat_${Date.now()}.brotable`);
try {
  const q = bro.table;
  const tbl = q.create({
    path: 'string',
    dir: 'string',
    name: 'string',
    nameLower: 'string',
    ext: 'dict',
    kind: 'dict',
    isDir: 'bool',
    isHidden: 'bool',
    size: 'i64',
    mtime: 'f64',
  });

  const rows = [];
  for (let i = 0; i < 10000; i++) {
    const ext = i === 9950 ? 'parquet' : (i % 2 === 0 ? 'txt' : 'md');
    const name = i === 9950
      ? 'cosmic_telemetry_large.parquet'
      : `dataset_chunk_${i}.${ext}`;
    const size = i === 9950 ? 524288n : BigInt(1024 + (i % 500));
    rows.push({
      path: `/data/set_${i % 10}/${name}`,
      dir: `data/set_${i % 10}`,
      name,
      nameLower: name.toLowerCase(),
      ext,
      kind: ext === 'parquet' ? 'data' : 'text',
      isDir: false,
      isHidden: false,
      size,
      mtime: 1700000000000 + i * 1000,
    });
  }
  tbl.insertMany(rows);
  tbl.createIndex('ext');
  tbl.createRangeIndex('size');
  assert(tbl.save(catPath, { compress: false }) === true, 'saved 10k catalog .brotable');

  assert(helm.launcher.fileCatalog.load(catPath, { mmap: true }) === true, 'mmap-loaded catalog');
  assert(helm.launcher.fileCatalog.rowCount() === 10000, 'catalog rowCount === 10000');

  helm.launcher.open();
  settle(5);
  assert(helm.launcher.isOpen, 'launcher opened');

  // Plain substring search
  helm.launcher.input.value = 'cosmic_telemetry';
  helm.launcher.refresh();
  settle(2);
  let fileRows = Array.from(document.querySelectorAll('#launcher-results .launcher-row.kind-file'));
  assert(fileRows.length === 1 && fileRows[0].textContent.includes('cosmic_telemetry_large.parquet'),
    'plain query rendered matching .kind-file row');

  // Tokenized ext + size range query
  helm.launcher.input.value = 'ext:parquet >100KB';
  helm.launcher.refresh();
  settle(2);
  fileRows = Array.from(document.querySelectorAll('#launcher-results .launcher-row.kind-file'));
  assert(fileRows.length === 1 && fileRows[0].textContent.includes('cosmic_telemetry_large.parquet'),
    'ext:parquet >100KB matched 512 KB parquet file');

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  settle(30);
  assert(!helm.launcher.isOpen, 'Escape closed launcher');
} finally {
  helm.launcher.fileCatalog.close();
  try { fs.unlinkSync(catPath); } catch (_) {}
}

console.log('test_file_catalog PASSED');
