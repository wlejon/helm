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
const lockScreenEl = document.getElementById('lock-screen');
assert(lockScreenEl !== null && !lockScreenEl.classList.contains('hidden'), 'lock screen visible in DOM');

// The lock screen's decisions are tested against a stand-in for
// bro.cred.authenticate. The real one asks PAM (or LogonUser) about the
// account running the test, and a wrong password there is a real failed
// login: enough of them and pam_faillock locks the account.
const origAuthenticate = bro.cred.authenticate;
const errorMsgEl = document.getElementById('lock-error-msg');
try {
  // A rejected password keeps the session locked.
  bro.cred.authenticate = async () => false;
  let verifyRes = await window.helm.lock.verify('wrong_password_attempt');
  assert(verifyRes === false, 'wrong password rejected');
  assert(window.helm.lock.isLocked === true, 'session remains locked after wrong password');
  assert(errorMsgEl !== null && !errorMsgEl.classList.contains('hidden'), 'error message shown on failed auth');

  // An authentication service that fails keeps it locked too.
  bro.cred.authenticate = async () => { throw new Error('PAM conversation failed'); };
  verifyRes = await window.helm.lock.verify('any_password');
  assert(verifyRes === false, 'authentication error rejected');
  assert(window.helm.lock.isLocked === true, 'session remains locked after an authentication error');

  // So does a missing one: the lock screen fails closed.
  bro.cred.authenticate = undefined;
  verifyRes = await window.helm.lock.verify('any_password');
  assert(verifyRes === false, 'missing authentication service rejected');
  assert(window.helm.lock.isLocked === true, 'session remains locked without an authentication service');

  // An accepted password unlocks it.
  bro.cred.authenticate = async () => true;
  verifyRes = await window.helm.lock.verify('correct_password');
  assert(verifyRes === true, 'valid password accepted');
  assert(window.helm.lock.isLocked === false, 'session unlocked successfully on valid authentication');
  assert(lockScreenEl.classList.contains('hidden'), 'lock screen hidden after unlock');
} finally {
  bro.cred.authenticate = origAuthenticate;
}

// 5. Verify Notifications
assert(window.helm.notify !== undefined, 'notification controller initialized');
window.helm.notify.postNotification({
  summary: 'Welcome to Helm',
  body: 'Desktop environment initialized.',
});
assert(window.helm.notify.notifications.length > 0, 'notification recorded in history');
const toasts = document.querySelectorAll('.toast');
assert(toasts.length > 0, 'toast notification element rendered in DOM');

// 6. Verify Tier-1 Desktop Substrate APIs (clip, pulse, mpris, ime, decor)
// (a) bro.clip
assert(typeof bro !== 'undefined' && typeof bro.clip === 'object', 'bro.clip namespace exists');
assert(bro.clip.available === true, 'bro.clip is available');
bro.clip.setText('helm boot test clip content');
const clipHistory = bro.clip.getHistory();
assert(Array.isArray(clipHistory) && clipHistory.length > 0, 'bro.clip.getHistory() has entries');
assert(window.helm.clipboard !== undefined, 'helm clipboard controller exists');
const helmClips = window.helm.clipboard.getEntries();
assert(helmClips.length > 0, 'helm clipboard controller returned entries');

// Test launcher clipboard mode & Super+V / Ctrl+Alt+V hotkey
window.helm.launcher.openClipboard();
assert(window.helm.launcher.isOpen === true, 'launcher opened in clipboard mode');
assert(window.helm.launcher.filtered.some((f) => f.type === 'clip'), 'launcher results contain clipboard entries');
window.helm.launcher.close();
assert(window.helm.launcher.isOpen === false, 'launcher closed');

// (b) bro.pulse
assert(typeof bro.pulse === 'object', 'bro.pulse namespace exists');
assert(bro.pulse.available === true, 'bro.pulse is available');
const sinks = bro.pulse.getSinks();
assert(Array.isArray(sinks), 'bro.pulse.getSinks() returns array');
window.helm.panel.setAudioVolume(0.75);
const volTextEl = document.getElementById('text-volume');
assert(volTextEl !== null && volTextEl.textContent === '75%', 'panel volume updated to 75%');

// (c) bro.mpris
assert(typeof bro.mpris === 'object', 'bro.mpris namespace exists');
assert(bro.mpris.available === true, 'bro.mpris is available');
assert(window.helm.media !== undefined, 'helm media controller exists');
const players = bro.mpris.getPlayers();
assert(Array.isArray(players), 'bro.mpris.getPlayers() returns array');

// (d) bro.ime
assert(typeof bro.ime === 'object', 'bro.ime namespace exists');
assert(bro.ime.available === true, 'bro.ime is available');
const acuteRes = bro.ime.feedKey('DeadAcute');
assert(typeof acuteRes === 'object', 'bro.ime.feedKey returned object');
const acuteE = bro.ime.feedKey('e');
assert(acuteE.status === 'matched' && acuteE.text === 'é', 'bro.ime compose DeadAcute + e -> é');

// (e) bro.decor
assert(typeof bro.decor === 'object', 'bro.decor namespace exists');
assert(bro.decor.available === true, 'bro.decor is available');
const metrics = bro.decor.getDefaultMetrics();
assert(typeof metrics === 'object' && metrics.captionHeight > 0, 'bro.decor returned frame metrics');

// Final layout flush
advanceTime(16);
flush();

console.log('test_shell_boot: all assertions passed!');
