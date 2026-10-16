// test_agents.js: agent traffic through bro's agent inbox shows in the shell:
// a notification when a request arrives, a live activity while it is open,
// a notification when it ends (ui/js/agents.js). The inbox is this engine's,
// in-process (no display serves in headless).

const settle = (n = 10) => { for (let i = 0; i < n; ++i) { advanceTime(16); flush(); } };
settle();
assert(typeof bro.inbox === 'object', 'bro.inbox is available');
const shell = window.helm;
const stack = document.getElementById('toast-stack');
const sysN = bro.sys && bro.sys.notifications;
if (sysN) { sysN.dismiss = () => true; sysN.setDoNotDisturb = () => true; }
shell.notify.setDnd(false);

let release = null;
let agent = null;
bro.inbox.serve('summarize', { about: 'test agent' }, async (req, ctx) => {
  await ctx.progress('reading');
  await new Promise((res) => { release = res; });
  return 'three lines';
}).then((a) => { agent = a; });
for (let i = 0; i < 200 && !agent; ++i) settle(1);
assert(agent, 'the test agent registered');

let answer = null;
bro.inbox.ask('summarize', 'the notes please', { from: 'claude-win', wait: 60 }).then((r) => { answer = r; });
for (let i = 0; i < 300 && !release; ++i) settle(1);
assert(release, 'the request reached the agent');
settle(30);

const toasts = () => [...stack.querySelectorAll('.notif')].map((n) => n.textContent);
assert(toasts().some((t) => t.indexOf('claude-win asks summarize') >= 0 && t.indexOf('the notes please') >= 0),
  'an arriving request rises as a notification: ' + JSON.stringify(toasts()));
let act = shell.activities.get('agents');
assert(act && act.kind === 'agent', 'an open request holds a live activity');
assert(act.title.indexOf('claude-win → summarize') === 0, 'naming who asks whom: ' + act.title);
assert(act.title.indexOf('reading') > 0, 'with its latest progress: ' + act.title);
const live = document.getElementById('live-activity');
assert(!live.classList.contains('hidden') && live.textContent.indexOf('summarize') >= 0,
  'the clock island shows it: ' + live.textContent);

release();
for (let i = 0; i < 300 && !answer; ++i) settle(1);
assert(answer && answer.text === 'three lines', 'the asker got the reply');
settle(30);
assert(!shell.activities.get('agents'), 'the activity ends with the request');
assert(toasts().some((t) => t.indexOf('summarize answered claude-win') >= 0),
  'and a notification says how it ended: ' + JSON.stringify(toasts()));

agent.close();
settle(30);
