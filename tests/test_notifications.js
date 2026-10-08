// test_notifications.js: toasts, history, actions and Do Not Disturb, driven
// through the shell's own entry points (no D-Bus traffic).

const settle = (n = 10) => { for (let i = 0; i < n; ++i) { advanceTime(16); flush(); } };
settle();
const notify = window.helm.notify;
const stack = document.getElementById('toast-stack');

// Keep the test's notifications off the real notification server.
const sysN = bro.sys && bro.sys.notifications;
const invoked = [];
if (sysN) {
  sysN.invokeAction = (id, k) => { invoked.push([id, k]); return true; };
  sysN.dismiss = () => true;
  sysN.setDoNotDisturb = () => true;
}

notify.setDnd(false);
notify.post({ summary: 'Hello', body: 'First' });
settle(2);
assert(notify.items.length === 1, 'posted notification enters history');
assert(stack.querySelectorAll('.notif').length === 1, 'posted notification shows a toast');
assert(notify.unread === 1, 'unread count rises');

// A foreign notification with actions, then replaced in place.
notify.receive({ id: 501, appName: 'Mail', summary: 'New mail', body: '<b>Bob</b> &amp; co',
  actions: [{ key: 'default', label: 'Open' }, { key: 'reply', label: 'Reply' }], urgency: 'normal' }, false);
settle(2);
assert(notify.items[0].body === 'Bob & co', 'markup stripped and entities decoded');
assert(stack.querySelectorAll('.notif').length === 2, 'second toast stacked');
assert(stack.querySelectorAll('.notif-actions .btn').length === 1, 'default action is not a button');
notify.receive({ id: 501, appName: 'Mail', summary: 'New mail (2)', body: '', actions: [] }, true);
settle(2);
assert(notify.items.filter((x) => x.id === 501).length === 1, 'replacement keeps one history entry');
assert(notify.items[0].summary === 'New mail (2)', 'replacement updates the summary');

// Toasts expire; history stays.
advanceTime(6000);
settle(20);
assert(stack.querySelectorAll('.notif').length === 0, 'toasts expire');
assert(notify.items.length === 2, 'history keeps expired notifications');

// Critical notifications stay up.
notify.receive({ id: 502, appName: 'Power', summary: 'Battery low', urgency: 'critical', actions: [] }, false);
advanceTime(10000);
settle(5);
assert(stack.querySelectorAll('.notif.critical').length === 1, 'critical toast does not expire');
notify.remove(502);
settle(20);

// Actions
notify.receive({ id: 503, appName: 'Chat', summary: 'Ping', actions: [{ key: 'ack', label: 'Ack' }] }, false);
settle(2);
notify.activate(notify.items[0], 'ack');
if (sysN) assert(invoked.some(([id, k]) => id === 503 && k === 'ack'), 'action forwarded to the sender');
assert(!notify.items.some((x) => x.id === 503), 'activated notification leaves history');

// Do Not Disturb holds toasts back but keeps history.
notify.setDnd(true);
settle(20);
const before = notify.items.length;
notify.post({ summary: 'Quiet' });
settle(2);
assert(stack.querySelectorAll('.notif').length === 0, 'no toast under Do Not Disturb');
assert(notify.items.length === before + 1, 'history still records it');
assert(!document.querySelector('#bar-clock .dnd-glyph').classList.contains('hidden'), 'bar shows the DND glyph');
notify.setDnd(false);

// Notification center lists history; Clear all empties it.
window.helm.calendar.toggle(document.getElementById('bar-clock'));
settle(2);
assert(document.querySelectorAll('#calendar-popover .nc-list .notif').length === notify.items.length, 'center lists history');
assert(notify.unread === 0, 'opening the center marks everything read');
notify.clearAll();
settle(2);
assert(document.querySelector('#calendar-popover .nc-empty') !== null, 'center shows the empty state');

console.log('test_notifications: all assertions passed');
