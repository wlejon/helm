// test_shell_boot.js: Headless test verifying that Helm desktop boots,
// initializes top panel, registers hotkeys, and reads installed apps.

// Let the engine lay out and evaluate startup scripts
flush();
for (let i = 0; i < 10; ++i) {
  advanceTime(16);
  flush();
}

// 1. Verify desktop shell bootstrapped
assert(typeof window.helm === 'object' && window.helm !== null, 'window.helm exists');
assert(window.helm.booted === true, 'helm desktop shell booted successfully');

// 2. Verify Top Status Bar (Panel)
const panelEl = document.getElementById('top-panel');
assert(panelEl !== null, 'top panel DOM element rendered');
assert(window.helm.panel !== undefined, 'panel controller initialized');

const clockTimeEl = document.getElementById('panel-clock-time');
const clockDateEl = document.getElementById('panel-clock-date');
assert(clockTimeEl !== null && clockTimeEl.textContent.length > 0, 'panel clock time is displayed');
assert(clockDateEl !== null && clockDateEl.textContent.length > 0, 'panel clock date is displayed');

assert(document.getElementById('btn-quick-net') !== null, 'quick network button rendered');
assert(document.getElementById('btn-quick-volume') !== null, 'quick volume button rendered');
assert(document.getElementById('btn-quick-battery') !== null, 'quick battery button rendered');

// 3. Verify Spotlight Launcher and App Reading
assert(window.helm.launcher !== undefined, 'launcher controller initialized');
assert(Array.isArray(window.helm.launcher.apps), 'launcher loaded apps array');
assert(window.helm.launcher.apps.length > 0, 'launcher has available applications');

// Test opening launcher
window.helm.launcher.open();
assert(window.helm.launcher.isOpen === true, 'launcher opened via open()');
const modalEl = document.getElementById('launcher-modal');
assert(modalEl !== null && !modalEl.classList.contains('hidden'), 'launcher modal is visible');

// Test querying apps in launcher
window.helm.launcher.onInput('term');
assert(Array.isArray(window.helm.launcher.filtered), 'launcher filtered results array exists');
assert(window.helm.launcher.filtered.length > 0, 'launcher search produces matching results for "term"');

// Test closing launcher
window.helm.launcher.close();
assert(window.helm.launcher.isOpen === false, 'launcher closed via close()');
assert(modalEl.classList.contains('hidden'), 'launcher modal is hidden');

// 4. Verify Global Hotkeys
// (a) Ctrl+Space toggles launcher
window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', ctrlKey: true, bubbles: true }));
assert(window.helm.launcher.isOpen === true, 'Ctrl+Space hotkey opens launcher');

// (b) Escape closes launcher
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
assert(window.helm.launcher.isOpen === false, 'Escape hotkey closes launcher');

// (c) Ctrl+Shift+N toggles notification drawer
assert(window.helm.notify.isDrawerOpen === false, 'notification drawer initially closed');
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, shiftKey: true, bubbles: true }));
assert(window.helm.notify.isDrawerOpen === true, 'Ctrl+Shift+N hotkey opens notification drawer');

window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
assert(window.helm.notify.isDrawerOpen === false, 'Escape closes notification drawer');

// (d) Ctrl+Alt+L locks session
assert(window.helm.lock.isLocked === false, 'session initially unlocked');
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', ctrlKey: true, altKey: true, bubbles: true }));
assert(window.helm.lock.isLocked === true, 'Ctrl+Alt+L hotkey locks session');

// Unlock session
window.helm.lock.unlock();
assert(window.helm.lock.isLocked === false, 'session unlocked successfully');

// 5. Verify Notifications
assert(window.helm.notify !== undefined, 'notification controller initialized');
window.helm.notify.postNotification({
  summary: 'Welcome to Helm',
  body: 'Desktop environment initialized.',
});
assert(window.helm.notify.notifications.length > 0, 'notification recorded in history');
const toasts = document.querySelectorAll('.toast');
assert(toasts.length > 0, 'toast notification element rendered in DOM');

// Final layout flush
advanceTime(16);
flush();

console.log('test_shell_boot: all assertions passed!');
