// test_dock.js: the dock and window switcher over stand-in windows (headless
// has no compositor, so window state is supplied by the test).

const settle = (n = 10) => { for (let i = 0; i < n; ++i) { advanceTime(16); flush(); } };
settle();
const helm = window.helm;

const focused = [];
const W = [
  { id: 1, appId: 'firefox', title: 'Firefox', focused: false, workspaceId: 1, frame: { x: 100, y: 60, width: 800, height: 500 } },
  { id: 2, appId: 'broterm', title: 'Terminal', focused: true, workspaceId: 1, frame: { x: 300, y: 200, width: 700, height: 400 } },
  { id: 3, appId: 'broterm', title: 'Terminal 2', focused: false, workspaceId: 1, frame: { x: 320, y: 220, width: 700, height: 400 } },
];
helm.windows.windows = () => W;
helm.windows.workspaces = () => [{ id: 1, name: '1', active: true, windows: [1, 2, 3], focusOrder: [2, 1, 3], monitor: 1 }];
helm.windows.focus = (id) => {
  focused.push(id);
  for (const w of W) w.focused = w.id === id;
  helm.windows.changed('focus');
};
helm.prefs.set('pinnedApps', ['helm.terminal', 'firefox.desktop']);
helm.prefs.set('dockAutohide', false);
helm.windows.changed('windows');
settle(5);

const items = () => Array.from(document.querySelectorAll('#dock .dock-item:not(.dock-apps)'));
assert(items().length >= 2, 'pinned apps are in the dock');
const term = items()[0];
assert(term.classList.contains('running') && term.classList.contains('focused'), 'terminal shows running and focused');
assert(term.querySelectorAll('.dock-dot').length === 2, 'one dot per terminal window');

// Clicking the focused app cycles its windows; clicking another focuses it.
term.click();
settle(2);
assert(focused[focused.length - 1] === 3, 'clicking the focused app moves to its next window');
items()[1].click();
settle(2);
assert(focused[focused.length - 1] === 1, 'clicking a running app focuses it');

// Bar follows focus.
assert(document.getElementById('bar-focused').textContent.includes('Firefox'), 'bar names the focused app');

// Autohide tucks the dock when a window covers it.
W[0].frame = { x: 0, y: 34, width: 1920, height: 1046 };
helm.prefs.set('dockAutohide', true);
helm.windows.changed('windows');
settle(5);
assert(document.getElementById('dock').classList.contains('tucked'), 'dock tucks behind an overlapping window');
W[0].frame = { x: 100, y: 60, width: 800, height: 500 };
helm.windows.changed('windows');
settle(5);
assert(!document.getElementById('dock').classList.contains('tucked'), 'dock returns when nothing covers it');

// Alt+Tab: most recently focused order, release commits.
for (const w of W) w.focused = w.id === 2;
const key = (type, opts) => window.dispatchEvent(new KeyboardEvent(type, { bubbles: true, ...opts }));
key('keydown', { key: 'Tab', altKey: true });
settle(2);
assert(helm.switcher.isOpen, 'Alt+Tab opens the switcher');
assert(helm.switcher.list[0].id === 2, 'switcher starts at the focused window');
assert(helm.switcher.index === 1, 'switcher selects the previous window');
key('keydown', { key: 'Tab', altKey: true });
assert(helm.switcher.index === 2, 'Tab advances');
key('keyup', { key: 'Alt' });
assert(!helm.switcher.isOpen, 'releasing Alt closes the switcher');
assert(focused[focused.length - 1] === helm.switcher.list[2].id, 'releasing Alt focuses the selection');

// Pin and unpin.
helm.dock.setPinned('firefox.desktop', false);
settle(2);
assert(!helm.prefs.get('pinnedApps').includes('firefox.desktop'), 'unpin removes it');

console.log('test_dock: all assertions passed');
