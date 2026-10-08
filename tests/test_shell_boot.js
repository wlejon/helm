// test_shell_boot.js: the shell boots, builds its islands and panels,
// answers its hotkeys, exposes the Settings hook, shows live activities, and
// the lock screen fails closed. Nothing here changes the machine's real state
// (volume, clipboard, network): those calls are stubbed or never made.

const settle = (n = 10) => { for (let i = 0; i < n; ++i) { advanceTime(16); flush(); } };
settle();

const helm = window.helm;
assert(typeof helm === 'object' && helm !== null, 'window.helm exists');
assert(helm.booted === true, 'shell booted');

// The bar: one slim strip along the bottom edge holding the three islands,
// and no dock.
const bar = document.getElementById('bar');
assert(bar !== null, 'the bar rendered');
const barRect = bar.getBoundingClientRect();
assert(barRect.bottom === window.innerHeight && barRect.left === 0 && barRect.width === window.innerWidth,
  `the bar spans the bottom edge: ${JSON.stringify(barRect)}`);
assert(barRect.height > 0 && barRect.height <= 44, `the bar is slim: ${barRect.height}`);
for (const id of ['island-left', 'island-center', 'island-right']) {
  assert(bar.querySelector(`#${id}`) !== null, `${id} lives inside #bar`);
  const r = document.getElementById(id).getBoundingClientRect();
  assert(r.top >= barRect.top && r.bottom <= barRect.bottom, `${id} sits within the bar`);
}
assert(document.getElementById('top-panel') === null, 'no top panel');
assert(document.getElementById('dock') === null && document.querySelector('.dock') === null, 'no dock');
assert(helm.dock === undefined, 'no dock controller');
const center = document.getElementById('island-center');
assert(/\d{1,2}:\d{2}/.test(center.textContent), 'clock island shows a time');
assert(document.querySelectorAll('#isl-status svg').length >= 2, 'status island shows icons');
assert(document.querySelectorAll('#workspaces .ws').length >= 1, 'workspace strip shows at least one space');
assert(document.querySelectorAll('i[data-icon]').length === 0, 'icon placeholders were hydrated');
assert(document.getElementById('settings-modal') === null, 'the old Settings app is gone');

// Every overlay that takes keys is marked for the engine's keyboard routing.
for (const id of ['quick-settings', 'center-panel', 'spaces-panel', 'launcher-modal', 'lock-screen', 'switcher']) {
  assert(document.getElementById(id).hasAttribute('data-shell-keyboard'), `#${id} carries data-shell-keyboard`);
}

// Quick settings grows out of the status island and closes on Escape.
const right = document.getElementById('island-right');
helm.quick.toggle();
settle(2);
assert(helm.quick.isOpen, 'quick settings opens');
assert(!document.getElementById('quick-settings').classList.contains('hidden'), 'quick settings visible');
assert(right.classList.contains('morphed'), 'the status island hands its glass to the panel');
settle(40);
{
  const qr = document.getElementById('quick-settings').getBoundingClientRect();
  const ir = right.getBoundingClientRect();
  assert(Math.abs(qr.bottom - ir.bottom) <= 1 && qr.top < ir.top - 100,
    `quick settings stands on its island and grows upward: ${JSON.stringify(qr)} over ${JSON.stringify(ir)}`);
  assert(Math.abs(qr.right - ir.right) <= 1, 'quick settings lines up with the right island');
}
assert(document.querySelectorAll('#quick-settings .tile').length >= 2, 'quick settings has toggle tiles');
assert(document.querySelectorAll('#quick-settings .qs-power-btn').length === 4, 'quick settings has the power row');
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
assert(!helm.quick.isOpen, 'Escape closes quick settings');
settle(30);
assert(document.getElementById('quick-settings').classList.contains('hidden'), 'quick settings folds away');
assert(!right.classList.contains('morphed'), 'the status island comes back');

// Restart asks once more before acting.
let requested = null;
const origRequest = helm.system.request;
helm.system.request = (a) => { requested = a; return true; };
try {
  helm.quick.toggle();
  settle(2);
  const restart = () => Array.from(document.querySelectorAll('#quick-settings .qs-power-btn'))
    .find((b) => b.title === 'Restart');
  restart().click();
  settle(2);
  assert(requested === null, 'the first press on Restart only arms it');
  assert(restart().classList.contains('confirm'), 'Restart shows its confirm state');
  restart().click();
  assert(requested === 'reboot', 'the second press restarts');
  assert(!helm.quick.isOpen, 'quick settings closes after a power action');
} finally {
  helm.system.request = origRequest;
}
settle(30);

// The clock island grows into the calendar and notification center.
helm.calendar.toggle();
settle(2);
assert(helm.calendar.isOpen, 'calendar opens');
assert(center.classList.contains('morphed'), 'the clock island hands its glass to the panel');
assert(document.querySelectorAll('#center-panel .cal-day').length === 42, 'calendar shows six weeks');
assert(document.querySelector('#center-panel .cal-day.today') !== null, 'calendar marks today');
helm.calendar.toggle();
settle(30);
assert(!helm.calendar.isOpen, 'calendar toggles closed');

// Spaces grows out of the left island.
helm.spaces.toggle();
settle(2);
assert(helm.spaces.isOpen, 'spaces opens');
assert(document.querySelectorAll('#spaces-panel .sp-card').length >= 2, 'spaces shows a card per space and a new-space card');
helm.spaces.toggle();
settle(30);
assert(!helm.spaces.isOpen, 'spaces closes');

// Only one panel at a time.
helm.quick.toggle();
helm.calendar.toggle();
assert(helm.calendar.isOpen && !helm.quick.isOpen, 'opening one panel closes the other');
helm.calendar.toggle();
settle(30);

// Launcher
assert(helm.apps.apps.length > 0, 'app catalog loaded');
helm.launcher.open(document.getElementById('isl-launcher'));
settle(2);
assert(helm.launcher.isOpen, 'launcher opens');
assert(document.querySelectorAll('#launcher-results .app-tile').length > 0, 'launcher shows the app grid');
const input = document.getElementById('launcher-input');
const ghost = document.querySelector('#launcher-modal .launcher-ghost');
assert(!ghost.classList.contains('hidden'), 'the launcher shows its own prompt while empty');
input.value = 'term';
input.dispatchEvent(new Event('input'));
assert(ghost.classList.contains('hidden'), 'the prompt hides once there is text');
assert(helm.launcher.mode === 'list', 'typing switches to the result list');
assert(helm.launcher.entries.length > 0, 'a query produces results');
input.value = '=(2+3)*4';
input.dispatchEvent(new Event('input'));
assert(helm.launcher.entries[0].kind === 'calc' && helm.launcher.entries[0].title === '20', 'calculator answers');
input.value = 'zzqqxxnothing';
input.dispatchEvent(new Event('input'));
assert(document.querySelector('#launcher-results .launcher-empty') !== null, 'no results shows the empty state');
input.value = 'settings';
input.dispatchEvent(new Event('input'));
assert(helm.launcher.entries.some((e) => e.kind === 'action' && e.title === 'Settings'), 'Settings is a launcher action');
helm.launcher.close();
assert(!helm.launcher.isOpen, 'launcher closes');
settle(30);
assert(document.getElementById('launcher-modal').classList.contains('hidden'), 'launcher folds away');

// Desktop substrates the shell builds on. Availability only: writing the
// clipboard or the volume here would change the real machine.
for (const ns of ['clip', 'pulse', 'mpris', 'ime', 'decor', 'compositor']) {
  assert(typeof bro[ns] === 'object' && bro[ns] !== null, `bro.${ns} namespace exists`);
}
assert(Array.isArray(bro.mpris.getPlayers()), 'bro.mpris.getPlayers() returns an array');
assert(bro.ime.feedKey('DeadAcute') && bro.ime.feedKey('e').text === 'é', 'bro.ime composes DeadAcute + e');
assert(bro.decor.getDefaultMetrics().captionHeight > 0, 'bro.decor returns frame metrics');

const key = (opts) => window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...opts }));

// Settings hook: the real app registers at boot; without one, a hint; with
// another registered, it opens that.
const realSettings = helm.settingsApp;
assert(realSettings && realSettings === helm.settingsUi, 'the Settings app registers itself at boot');
helm.registerSettingsApp(null);
const hint = document.getElementById('hint');
key({ key: ',', metaKey: true });
settle(2);
assert(!hint.classList.contains('hidden'), 'Super+, without a Settings app shows a hint');
const opened = [];
const app = { isOpen: false, open(p) { this.isOpen = true; opened.push(p); }, close() { this.isOpen = false; } };
helm.registerSettingsApp(app);
helm.openSettings('sound');
assert(opened[0] === 'sound', 'openSettings(page) reaches the registered app');
key({ key: ',', ctrlKey: true });
assert(!app.isOpen, 'Ctrl+, toggles the registered app closed');
key({ key: ',', metaKey: true });
assert(app.isOpen, 'Super+, opens it');
key({ key: 'Escape' });
assert(!app.isOpen, 'Escape closes it');
helm.registerSettingsApp(null);
settle(200);
assert(hint.classList.contains('hidden'), 'the hint goes away by itself');
helm.registerSettingsApp(realSettings);

// Hotkeys
key({ key: ' ', ctrlKey: true });
assert(helm.launcher.isOpen, 'Ctrl+Space opens the launcher');
key({ key: 'Escape' });
assert(!helm.launcher.isOpen, 'Escape closes the launcher');
key({ key: 'n', ctrlKey: true, shiftKey: true });
assert(helm.calendar.isOpen, 'Ctrl+Shift+N opens the notification center');
key({ key: 'Escape' });
assert(!helm.calendar.isOpen, 'Escape closes the notification center');
key({ key: 's', metaKey: true });
assert(helm.quick.isOpen, 'Super+S opens quick settings');
key({ key: 'w', metaKey: true });
assert(helm.spaces.isOpen && !helm.quick.isOpen, 'Super+W opens spaces');
key({ key: 'Escape' });
assert(!helm.spaces.isOpen, 'Escape closes spaces');
settle(30);

// Live activities: a recording and media in the clock island.
const live = document.getElementById('live-activity');
if (!helm.media.active) assert(live.classList.contains('hidden'), 'no live activity by default');
helm.activities.start({ id: 'media-test', kind: 'media', title: 'Song · Artist' });
settle(2);
assert(!live.classList.contains('hidden') && live.textContent.includes('Song'), 'media shows in the clock island');
helm.activities.start({ id: 'rec', kind: 'recording', title: 'Screen', since: Date.now() - 65000 });
settle(2);
assert(live.dataset.kind === 'recording', 'a recording outranks media');
assert(/01:0\d/.test(live.textContent), 'the recording shows its running time');
helm.activities.end('rec');
helm.activities.end('media-test');
settle(2);
if (!helm.media.active) assert(live.classList.contains('hidden'), 'ended activities leave the island');

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
