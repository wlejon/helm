// test_shell_boot.js: the shell boots, builds its surfaces, answers its
// hotkeys, and the lock screen fails closed. Nothing here changes the
// machine's real state (volume, clipboard, network): those calls are stubbed.

const settle = (n = 10) => { for (let i = 0; i < n; ++i) { advanceTime(16); flush(); } };
settle();

const helm = window.helm;
assert(typeof helm === 'object' && helm !== null, 'window.helm exists');
assert(helm.booted === true, 'shell booted');

// Bar
const bar = document.getElementById('top-panel');
assert(bar !== null, 'top bar rendered');
const clock = document.getElementById('bar-clock');
assert(/\d{1,2}:\d{2}/.test(clock.textContent), 'clock shows a time');
assert(document.querySelectorAll('#bar-status svg').length >= 2, 'status pill shows icons');
assert(document.querySelectorAll('i[data-icon]').length === 0, 'icon placeholders were hydrated');

// Quick settings and calendar popovers open from the bar and close on Escape.
helm.quick.toggle(document.getElementById('bar-status'));
settle(2);
assert(helm.quick.isOpen, 'quick settings opens');
assert(document.querySelectorAll('#quick-settings .tile').length >= 2, 'quick settings has toggle tiles');
assert(document.querySelectorAll('#quick-settings .qs-power-btn').length === 4, 'quick settings has the power row');
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
settle(2);
assert(!helm.quick.isOpen, 'Escape closes quick settings');

helm.calendar.toggle(clock);
settle(2);
assert(helm.calendar.isOpen, 'calendar opens');
assert(document.querySelectorAll('#calendar-popover .cal-day').length === 42, 'calendar shows six weeks');
assert(document.querySelector('#calendar-popover .cal-day.today') !== null, 'calendar marks today');
helm.calendar.toggle(clock);
settle(2);
assert(!helm.calendar.isOpen, 'calendar toggles closed');

// Launcher
assert(helm.apps.apps.length > 0, 'app catalog loaded');
helm.launcher.open();
settle(2);
assert(helm.launcher.isOpen, 'launcher opens');
assert(document.querySelectorAll('#launcher-results .app-tile').length > 0, 'launcher shows the app grid');
const input = document.getElementById('launcher-input');
input.value = 'term';
input.dispatchEvent(new Event('input'));
assert(helm.launcher.mode === 'list', 'typing switches to the result list');
assert(helm.launcher.entries.length > 0, 'a query produces results');
input.value = '=(2+3)*4';
input.dispatchEvent(new Event('input'));
assert(helm.launcher.entries[0].kind === 'calc' && helm.launcher.entries[0].title === '20', 'calculator answers');
helm.launcher.close();
assert(!helm.launcher.isOpen, 'launcher closes');

// Desktop substrates the shell builds on. Availability only: writing the
// clipboard or the volume here would change the real machine.
for (const ns of ['clip', 'pulse', 'mpris', 'ime', 'decor', 'compositor']) {
  assert(typeof bro[ns] === 'object' && bro[ns] !== null, `bro.${ns} namespace exists`);
}
assert(Array.isArray(bro.mpris.getPlayers()), 'bro.mpris.getPlayers() returns an array');
assert(bro.ime.feedKey('DeadAcute') && bro.ime.feedKey('e').text === 'é', 'bro.ime composes DeadAcute + e');
assert(bro.decor.getDefaultMetrics().captionHeight > 0, 'bro.decor returns frame metrics');

// Settings app
helm.openSettings('appearance');
settle(2);
assert(helm.settings.isOpen, 'settings opens');
assert(document.querySelectorAll('#settings-sidebar-list .settings-nav-item').length === 7, 'settings lists its categories');
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
assert(!helm.settings.isOpen, 'Escape closes settings');

// Hotkeys
const key = (opts) => window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...opts }));
key({ key: ' ', ctrlKey: true });
assert(helm.launcher.isOpen, 'Ctrl+Space opens the launcher');
key({ key: 'Escape' });
assert(!helm.launcher.isOpen, 'Escape closes the launcher');
key({ key: 'n', ctrlKey: true, shiftKey: true });
assert(helm.calendar.isOpen, 'Ctrl+Shift+N opens the notification center');
key({ key: 'Escape' });
assert(!helm.calendar.isOpen, 'Escape closes the notification center');
key({ key: ',', ctrlKey: true });
assert(helm.settings.isOpen, 'Ctrl+, opens settings');
key({ key: ',', ctrlKey: true });
assert(!helm.settings.isOpen, 'Ctrl+, closes settings');

// Lock screen. bro.cred.authenticate is replaced: the real one asks PAM about
// the account running the test, and a wrong password there is a real failed
// login (enough of them and pam_faillock locks the account).
key({ key: 'l', ctrlKey: true, altKey: true });
assert(helm.lock.isLocked, 'Ctrl+Alt+L locks');
const lockEl = document.getElementById('lock-screen');
const errEl = document.getElementById('lock-error-msg');
assert(!lockEl.classList.contains('hidden'), 'lock screen visible');
key({ key: ' ', ctrlKey: true });
assert(!helm.launcher.isOpen, 'hotkeys are ignored while locked');

const origAuth = bro.cred.authenticate;
try {
  bro.cred.authenticate = async () => false;
  assert((await helm.lock.verify('wrong')) === false, 'wrong password rejected');
  assert(helm.lock.isLocked, 'still locked after a wrong password');
  assert(!errEl.classList.contains('hidden'), 'error shown');

  bro.cred.authenticate = async () => { throw new Error('PAM conversation failed'); };
  assert((await helm.lock.verify('x')) === false, 'authentication error rejected');
  assert(helm.lock.isLocked, 'still locked after an authentication error');

  bro.cred.authenticate = undefined;
  assert((await helm.lock.verify('x')) === false, 'missing authentication service rejected');
  assert(helm.lock.isLocked, 'still locked without an authentication service');

  bro.cred.authenticate = async () => true;
  assert((await helm.lock.verify('right')) === true, 'valid password accepted');
  assert(!helm.lock.isLocked, 'unlocked');
} finally {
  bro.cred.authenticate = origAuth;
}
settle(30);
assert(lockEl.classList.contains('hidden'), 'lock screen hidden after unlock');

console.log('test_shell_boot: all assertions passed');
