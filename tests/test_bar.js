// test_bar.js: the bar's window-facing islands, Spaces and the window
// switcher over stand-in windows (headless has no compositor, so window state
// is supplied by the test). There is no dock: the bar is the only panel.

const settle = (n = 10) => { for (let i = 0; i < n; ++i) { advanceTime(16); flush(); } };
settle();
const helm = window.helm;

const focused = [];
const W = [
  { id: 1, appId: 'firefox', title: 'Firefox', focused: false, workspaceId: 1, frame: { x: 100, y: 60, width: 800, height: 500 } },
  { id: 2, appId: 'helm.term', title: 'Terminal', focused: true, workspaceId: 1, frame: { x: 300, y: 200, width: 700, height: 400 } },
  { id: 3, appId: 'helm.term', title: 'Terminal 2', focused: false, workspaceId: 1, frame: { x: 320, y: 220, width: 700, height: 400 } },
];
helm.windows.windows = () => W;
helm.windows.workspaces = () => [{ id: 1, name: '1', active: true, windows: [1, 2, 3], focusOrder: [2, 1, 3], monitor: 1 }];
helm.windows.focus = (id) => {
  focused.push(id);
  for (const w of W) w.focused = w.id === id;
  helm.windows.changed('focus');
};
helm.windows.changed('windows');
settle(5);

// The left island follows focus and workspaces.
assert(document.getElementById('isl-focused').textContent.includes('Terminal'), 'left island names the focused app');
assert(document.querySelector('#workspaces .ws.active.occupied') !== null, 'active workspace is marked occupied');
helm.windows.focus(1);
settle(5);
assert(document.getElementById('isl-focused').textContent.includes('Firefox'), 'the focused app follows focus');

// The launcher mark in the bar opens the launcher out of itself.
const mark = document.getElementById('isl-launcher');
mark.click();
settle(2);
assert(helm.launcher.isOpen && helm.launcher.origin === mark, 'the bar\'s mark opens the launcher');
helm.launcher.close();
settle(30);

// Spaces lists the windows of the active space, growing up out of the bar.
helm.spaces.toggle();
settle(40);
assert(document.querySelectorAll('#spaces-panel .sp-row').length === 3, 'spaces lists this space\'s windows');
assert(document.querySelectorAll('#spaces-panel .sp-win').length === 3, 'the space card draws a miniature per window');
const sp = document.getElementById('spaces-panel').getBoundingClientRect();
const left = document.getElementById('island-left').getBoundingClientRect();
assert(Math.abs(sp.bottom - left.bottom) <= 1 && Math.abs(sp.left - left.left) <= 1,
  `spaces stands on the left island: ${JSON.stringify(sp)} vs ${JSON.stringify(left)}`);
helm.spaces.toggle();
settle(30);

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

// A toast rises out of the clock, above the bar.
const stack = document.getElementById('toast-stack').getBoundingClientRect();
const bar = document.getElementById('bar').getBoundingClientRect();
assert(stack.bottom <= bar.top, `toasts stack above the bar: ${JSON.stringify(stack)}`);

console.log('test_bar: all assertions passed');
