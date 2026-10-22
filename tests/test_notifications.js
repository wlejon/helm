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
const count = document.querySelector('#island-center .nc-count');
assert(!count.classList.contains('hidden') && count.textContent === '1', 'the clock island shows the unread count');
assert(stack.querySelector('.notif').classList.contains('toast'), 'toasts carry the toast class');

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

// Dismissing a toast keeps the notification in history.
notify.post({ summary: 'Dismiss me' });
settle(2);
stack.querySelector('.notif .notif-close').click();
settle(20);
assert(stack.querySelectorAll('.notif').length === 0, 'dismissed toast leaves');
assert(notify.items.some((x) => x.summary === 'Dismiss me'), 'dismissed toast stays in history');
notify.remove(notify.items.find((x) => x.summary === 'Dismiss me').id);
settle(20);

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
assert(!document.querySelector('#island-center .dnd-glyph').classList.contains('hidden'), 'the clock island shows the DND glyph');
assert(document.querySelector('#island-center .nc-count').classList.contains('hidden'), 'the unread count hides under Do Not Disturb');
notify.setDnd(false);

// Notification center lists history; Clear all empties it.
window.helm.calendar.toggle();
settle(2);
assert(document.querySelectorAll('#center-panel .nc-list .notif').length === notify.items.length, 'center lists history');
assert(notify.unread === 0, 'opening the center marks everything read');
assert(stack.classList.contains('suppressed'), 'toasts give way while the center is open');
notify.post({ summary: 'While open' });
settle(2);
assert(document.querySelectorAll('#center-panel .nc-list .notif').length === notify.items.length, 'center updates live');
notify.clearAll();
settle(2);
assert(document.querySelector('#center-panel .nc-empty') !== null, 'center shows the empty state');
window.helm.calendar.toggle();
settle(30);
assert(!stack.classList.contains('suppressed'), 'toasts come back when the center closes');

// Unread counter accuracy: same-ID replacement, remove(), D-Bus closed, toast activate(), and MAX_HISTORY truncation.
notify.clearAll();
settle(2);
assert(notify.unread === 0 && notify.items.length === 0, 'clean baseline for unread counter tests');

// 1. Same-ID replacement does not double-increment unread
notify.receive({ id: 700, appName: 'Build', summary: 'Step 1', urgency: 'normal', actions: [] }, false);
assert(notify.unread === 1, 'unread is 1 after first receive');
notify.receive({ id: 700, appName: 'Build', summary: 'Step 2', urgency: 'normal', actions: [] }, false);
assert(notify.unread === 1, 'same-ID replacement with replaced=false does not double-increment unread');
notify.receive({ id: 700, appName: 'Build', summary: 'Step 3', urgency: 'normal', actions: [] }, true);
assert(notify.unread === 1, 'same-ID replacement with replaced=true preserves unread');

// 2. remove() and D-Bus closed signal decrement unread
notify.receive({ id: 701, appName: 'Build', summary: 'Extra', urgency: 'normal', actions: [] }, false);
assert(notify.unread === 2, 'unread is 2 with two unread notifications');
notify.remove(700);
assert(notify.unread === 1, 'remove() decrements unread');
notify.remove(701, false); // D-Bus closed signal path
assert(notify.unread === 0 && notify.items.length === 0, 'D-Bus closed remove(id, false) decrements unread to 0');
assert(count.classList.contains('hidden'), 'clock island hides unread count when all unread items removed');

// 3. Toast action activate() decrements unread
notify.receive({ id: 702, appName: 'Chat', summary: 'Reply to me', actions: [{ key: 'reply', label: 'Reply' }] }, false);
assert(notify.unread === 1, 'unread is 1 before toast action activate');
notify.activate(notify.items[0], 'reply');
assert(notify.unread === 0 && notify.items.length === 0, 'activate() removes non-resident item and decrements unread to 0');

// 4. MAX_HISTORY truncation caps unread at MAX_HISTORY (50)
for (let i = 0; i < 55; i++) {
  notify.receive({ id: 800 + i, appName: 'Bulk', summary: `Msg ${i}`, urgency: 'normal', actions: [] }, false);
}
assert(notify.items.length === 50, 'history truncated at MAX_HISTORY (50)');
assert(notify.unread === 50, 'unread count matches truncated history (50) rather than drifting to 55');
notify.clearAll();
settle(2);

console.log('test_notifications: all assertions passed');
