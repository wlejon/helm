// test_settings.js: the Settings app opens out of its entry points and folds
// away, navigates, searches, lands on a setting, hides pages whose system API
// is missing, and draws Keyboard from the shell's own hotkey table. Every
// write the pages can make is stubbed first: nothing here touches the real
// volume, network, Bluetooth, power state or MIME associations.

const settle = (n = 10) => { for (let i = 0; i < n; ++i) { advanceTime(16); flush(); } };
settle();

const helm = window.helm;
const S = helm.settingsUi;
assert(S && helm.settingsApp === S, 'Settings registered itself with the shell');
const log = S.stubWrites();
const b = S.backend;
const key = (el, k, extra = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
const type = (text) => {
  S.input.value = text;
  S.input.dispatchEvent(new Event('input', { bubbles: true }));
};
const overlay = document.getElementById('settings-app');
const navIds = () => Array.from(document.querySelectorAll('#settings-app .st-nav-item')).map((n) => n.dataset.page);
assert(overlay.hasAttribute('data-shell-keyboard'), '#settings-app carries data-shell-keyboard');
assert(overlay.classList.contains('hidden') && !S.isOpen, 'Settings starts closed');

// -- Open and close ------------------------------------------------------------

helm.openSettings('appearance', { origin: document.getElementById('island-right') });
settle(2);
assert(S.isOpen && !overlay.classList.contains('hidden'), 'openSettings opens it');
const z = Number(getComputedStyle(overlay).zIndex);
const lockZ = Number(getComputedStyle(document.getElementById('lock-screen')).zIndex);
assert(z >= 1000 && z < lockZ, `Settings sits over windows and under the lock screen (z ${z})`);
assert(S.page && S.page.id === 'appearance', 'it opens on the page asked for');
assert(document.querySelector('#settings-app .st-nav-item.on').dataset.page === 'appearance', 'the sidebar marks the page');
settle(40);
key(S.input, 'Escape');
assert(!S.isOpen, 'Escape closes Settings');
settle(40);
assert(overlay.classList.contains('hidden'), 'and it folds away');

key(window, ',', { metaKey: true });
assert(S.isOpen, 'Super+, opens Settings');
key(window, ',', { ctrlKey: true });
assert(!S.isOpen, 'Ctrl+, toggles it closed');
settle(40);

// The quick settings gear: the panel goes, Settings grows out of the gear.
helm.quick.toggle();
settle(30);
document.querySelector('#quick-settings .qs-head-actions button').click();
assert(S.isOpen && !helm.quick.isOpen, 'the quick settings gear hands over to Settings');
S.close();
settle(40);

// The launcher: its Settings action hands its glass over.
helm.launcher.open(document.getElementById('isl-launcher'));
settle(20);
const act = helm.launcher.actions.find((a) => a.name === 'Appearance');
helm.launcher.runEntry(act);
assert(S.isOpen && !helm.launcher.isOpen && S.page.id === 'appearance', 'the launcher Appearance action opens that page');
S.close();
settle(40);

// -- Navigation ------------------------------------------------------------------

helm.openSettings();
settle(20);
const pages = navIds();
for (const id of ['appearance', 'keyboard', 'about']) assert(pages.includes(id), `${id} is always in the sidebar`);
for (const id of pages) {
  S.go(id);
  settle(2);
  assert(S.page.id === id, `navigates to ${id}`);
  assert(S.content.children.length > 0, `${id} renders`);
  assert(!S.content.querySelector('.st-empty .empty-title') || !/could not load/.test(S.content.textContent), `${id} renders without error`);
}
S.go('appearance');
key(S.el, 'PageDown', { ctrlKey: true });
assert(S.page.id === pages[1], 'Ctrl+PageDown steps to the next page');
S.go('appearance');

// Appearance writes go through the stubbed setPref and re-render.
const before = log.length;
document.querySelector('#settings-app .st-swatch[data-hue="20"]').click();
assert(log.length === before + 1 && log[before][0] === 'setPref' && log[before][1] === 'accentHue', 'an accent swatch sets accentHue');
settle(4);
assert(document.querySelector('#settings-app .st-swatch.on').dataset.hue === '20', 'the picked swatch is marked');
document.querySelector('#settings-app .st-wall[data-wallpaper="ember"]').click();
assert(helm.prefs.get('wallpaper') === 'ember', 'a wallpaper tile sets the wallpaper');

// Keyboard comes from the hotkey table, every entry.
S.go('keyboard');
settle(2);
const rows = Array.from(document.querySelectorAll('#settings-app [data-hotkey]')).map((r) => r.dataset.hotkey);
assert(rows.includes('launcher') && rows.includes('settings') && rows.includes('lock'), 'Keyboard lists the shell hotkeys');
assert(rows.length >= 15, `Keyboard lists every hotkey (${rows.length})`);

// Power asks twice before restarting.
if (navIds().includes('power') && S.content) {
  S.go('power');
  settle(2);
  const restart = document.querySelector('#settings-app [data-anchor="reboot"] .btn');
  if (restart) {
    const n = log.length;
    restart.click();
    assert(log.length === n, 'the first press on Restart only arms it');
    assert(restart.classList.contains('confirming'), 'Restart shows its confirm state');
    restart.click();
    assert(log[n] && log[n][0] === 'powerAction' && log[n][1] === 'reboot', 'the second press restarts');
  }
}

// -- Search ----------------------------------------------------------------------

S.go('appearance');
type('wallpaper');
settle(2);
assert(S.results.length > 0 && S.results[0].page.id === 'appearance', 'search finds the wallpaper');
assert(document.querySelectorAll('#settings-app .st-result').length === S.results.length, 'results are listed');
type('wifi');
settle(2);
if (navIds().includes('network')) {
  assert(S.results.some((r) => r.page.id === 'network'), '"wifi" finds Wi-Fi (hyphens ignored)');
}
type('zzqxv');
settle(2);
assert(S.results.length === 0 && /No settings match/.test(S.content.textContent), 'no match shows the empty state');
type('24');
settle(2);
assert(S.results[0] && S.results[0].item && S.results[0].item.id === 'clock-24h', '"24" finds the 24-hour clock');
key(S.input, 'Enter');
settle(2);
assert(S.page.id === 'appearance' && !S.query, 'Enter opens the result');
const flashed = document.querySelector('#settings-app [data-anchor="clock-24h"]');
assert(flashed && flashed.classList.contains('st-flash'), 'and lights the setting it found');
type('vol');
settle(2);
key(S.input, 'Escape');
assert(S.isOpen && !S.query && S.input.value === '', 'Escape in search clears it before closing');
assert(helm.launcher.isOpen === false, 'nothing else opened');

// The launcher searches settings too.
S.close();
settle(40);
helm.launcher.open();
helm.launcher.input.value = 'night light';
helm.launcher.refresh();
const settingRows = helm.launcher.entries.filter((e) => e.kind === 'setting');
const nl = b.nightLight().supported;
assert(nl ? settingRows.length > 0 : !settingRows.some((e) => /Night light/.test(e.title)),
  'the launcher only offers settings this machine has');
helm.launcher.input.value = 'accent';
helm.launcher.refresh();
const accentRow = helm.launcher.entries.find((e) => e.kind === 'setting');
assert(accentRow && /Accent/.test(accentRow.title), 'the launcher finds the accent setting');
helm.launcher.runEntry(accentRow);
assert(S.isOpen && S.page.id === 'appearance' && !helm.launcher.isOpen, 'and opens Settings on it');
settle(20);

// -- Pages hide when their API is missing ------------------------------------

const saved = {};
for (const k of ['hasSound', 'hasNetwork', 'hasBluetooth', 'hasPower', 'hasMime', 'has', 'sys']) saved[k] = b[k];
b.hasSound = () => false;
b.hasNetwork = () => false;
b.hasBluetooth = () => false;
b.hasPower = () => false;
b.hasMime = () => false;
b.has = () => false;
b.sys = () => null;
S.go('appearance');
settle(2);
const left = navIds();
for (const id of ['sound', 'network', 'bluetooth', 'displays', 'power', 'notifications', 'apps']) {
  assert(!left.includes(id), `${id} hides without its API`);
}
assert(left.includes('appearance') && left.includes('keyboard') && left.includes('about'), 'the shell-side pages stay');
type('volume');
settle(2);
assert(!S.results.some((r) => r.page.id === 'sound'), 'search leaves hidden pages out');
S.go('sound');
assert(S.page.id === 'appearance', 'a hidden page cannot be opened');
Object.assign(b, saved);

// A page whose render throws shows an error state, not a blank pane.
S.go('about');
const about = S.page;
const render = about.render;
about.render = () => { throw new Error('boom'); };
S.rerender();
assert(/could not load/.test(S.content.textContent), 'a failing page shows its error state');
about.render = render;
S.rerender();

// Displays: modes are shown, never applied.
assert(!log.some((c) => /Config/.test(c[0])), 'nothing applied a display configuration');

S.close();
settle(40);
assert(!S.isOpen && overlay.classList.contains('hidden'), 'Settings closes');

// Nothing reached the machine: every write went to the stub log.
const allowed = new Set(['setPref', 'powerAction', 'scanWifi']);
for (const c of log) assert(allowed.has(c[0]), `only expected writes were attempted (${c[0]})`);
console.log(`test_settings: ok (${pages.length} pages: ${pages.join(', ')})`);
