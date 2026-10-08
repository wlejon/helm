// test_shell_broker.js: Test Windows Shell Broker substrate bindings and contracts

flush();
for (let i = 0; i < 5; ++i) {
  advanceTime(16);
  flush();
}

if (typeof bro.shellHook !== 'object' || bro.shellHook === null) {
  skipTest('bro.shellHook is the Windows shell broker; not built on this platform');
} else {
// 1. Verify bro.shellHook host bindings
assert(typeof bro === 'object' && bro !== null, 'bro root object exists');
assert(typeof bro.shellHook === 'object' && bro.shellHook !== null, 'bro.shellHook namespace exists');
assert(bro.shellHook.available === true, 'bro.shellHook is available');
assert(typeof bro.shellHook.isShellActive === 'function', 'bro.shellHook.isShellActive is a function');
assert(typeof bro.shellHook.on === 'function', 'bro.shellHook.on is a function');
assert(typeof bro.shellHook.addListener === 'function', 'bro.shellHook.addListener is a function');
assert(typeof bro.shellHook.off === 'function', 'bro.shellHook.off is a function');
assert(typeof bro.shellHook.removeListener === 'function', 'bro.shellHook.removeListener is a function');
assert(typeof bro.shellHook.getWindows === 'function', 'bro.shellHook.getWindows is a function');
assert(typeof bro.shellHook.focusWindow === 'function', 'bro.shellHook.focusWindow is a function');
assert(typeof bro.shellHook.closeWindow === 'function', 'bro.shellHook.closeWindow is a function');

// 2. Verify bro.setModalActive and bro.compositor.setModalActive
assert(typeof bro.setModalActive === 'function', 'bro.setModalActive is a function');
assert(typeof bro.compositor?.setModalActive === 'function', 'bro.compositor.setModalActive is a function');
assert(typeof bro.compositor?.shellHook === 'object', 'bro.compositor.shellHook alias exists');

// Test invoking setModalActive
bro.setModalActive(true);
bro.setModalActive(false);
bro.compositor.setModalActive(true);
bro.compositor.setModalActive(false);

// 3. Verify Shell Active status check
const isShell = bro.shellHook.isShellActive();
assert(typeof isShell === 'boolean', 'isShellActive() returns a boolean');

// 4. Verify getWindows() enumeration
const windows = bro.shellHook.getWindows();
assert(Array.isArray(windows), 'getWindows() returns an array');

// 5. Verify listener registration & deregistration
let testEventReceived = null;
const testListener = (ev) => {
  testEventReceived = ev;
};

bro.shellHook.on('windowCreated', testListener);
bro.shellHook.on(testListener);
bro.shellHook.off(testListener);

// 6. Verify Taskbar integration with shell hook events
assert(window.helm?.taskbar !== undefined, 'helm taskbar exists');
const taskbarContainer = document.getElementById('panel-taskbar');
assert(taskbarContainer !== null, 'panel-taskbar container rendered');

// Test synthetic shell hook window created
window.helm.taskbar.addWindow({
  id: 2001,
  title: 'Broker Shell Test App',
  appId: 'test_app',
  className: 'TestAppClass',
  focused: true,
  minimized: false
});
assert(taskbarContainer.children.length >= 1, 'taskbar added test app window');
assert(window.helm.taskbar.windows.has(2001), 'taskbar tracks test window 2001');

// Test focus switch
window.helm.taskbar.setFocus(2001);
assert(window.helm.taskbar.activeWindowId === 2001, 'window 2001 has active focus');

// Test window cleanup
window.helm.taskbar.removeWindow(2001);
assert(!window.helm.taskbar.windows.has(2001), 'window 2001 removed from taskbar');

console.log('test_shell_broker: all Windows Shell Broker assertions passed successfully!');
}
