// test_shell_role.js: helm's overlays reach the compositor's desktop-shell
// role (bro.compositor.setShellOverlay), which as the Windows shell raises
// helm over the applications' windows. Headless is not the session's shell,
// so the host answers false; what is checked is what helm tells it.

const settle = (n = 10) => { for (let i = 0; i < n; ++i) { advanceTime(16); flush(); } };
settle();

const c = bro.compositor;
assert(c && typeof c.setShellOverlay === 'function', 'bro.compositor.setShellOverlay exists');
assert(typeof c.isDesktopShell === 'function', 'bro.compositor.isDesktopShell exists');
assert(c.isDesktopShell() === false, 'headless helm is not the session shell');
assert(c.setShellOverlay(false) === false, 'headless host does nothing with an overlay');
assert(bro.setModalActive === undefined && bro.shellHook === undefined, 'no helm-private globals');
assert(bro.window.hotkeyRouting === 'none', 'headless routes no hotkeys: ' + bro.window.hotkeyRouting);

const calls = [];
const real = c.setShellOverlay;
c.setShellOverlay = (on) => { calls.push(on); return real.call(c, on); };

const helm = window.helm;
assert(helm && helm.booted, 'shell booted');
helm.launcher.open();
settle();
assert(helm.launcher.isOpen === true, 'launcher opened');
assert(calls.join() === 'true', 'an overlay going up raises the shell: ' + calls.join());

helm.quick.toggle();
settle();
assert(calls.join() === 'true', 'a second overlay changes nothing: ' + calls.join());

helm.closeTransient();
settle();
assert(helm.launcher.isOpen === false, 'launcher closed');
assert(helm.overlayActive === false, 'shell.overlayActive is false after closing transient overlays');
assert(calls[calls.length - 1] === false, 'the last overlay going lowers the shell: ' + calls.join());
assert(calls.filter((x) => x === false).length === 1, 'lowered once: ' + calls.join());

// Switcher open() / close() updates shell.overlayActive and bro.compositor.setShellOverlay
const origWindows = helm.windows.windows;
const origWorkspaces = helm.windows.workspaces;
helm.windows.windows = () => [
  { id: 1, appId: 'firefox', title: 'Firefox', focused: true, workspaceId: 1 },
  { id: 2, appId: 'helm.term', title: 'Terminal', focused: false, workspaceId: 1 },
];
helm.windows.workspaces = () => [{ id: 1, name: '1', active: true, windows: [1, 2], focusOrder: [1, 2], monitor: 1 }];
try {
  calls.length = 0;
  helm.switcher.open('Alt', 1);
  settle();
  assert(helm.switcher.isOpen === true, 'switcher opened');
  assert(helm.overlayActive === true, 'switcher.open() sets shell.overlayActive to true');
  assert(calls.join() === 'true', 'switcher.open() calls bro.compositor.setShellOverlay(true): ' + calls.join());

  helm.switcher.close();
  settle();
  assert(helm.switcher.isOpen === false, 'switcher closed');
  assert(helm.overlayActive === false, 'switcher.close() sets shell.overlayActive to false');
  assert(calls.join() === 'true,false', 'switcher.close() calls bro.compositor.setShellOverlay(false): ' + calls.join());
} finally {
  helm.windows.windows = origWindows;
  helm.windows.workspaces = origWorkspaces;
}

c.setShellOverlay = real;
console.log('test_shell_role: passed');
