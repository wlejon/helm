// test_permission_prompt.js: helm's system prompt for app permissions
// (js/permission_prompt.js) over bro.permissions' 'request'. helm-headless
// serves the prompts of this test's BRO_APP_HOME (CMakeLists.txt), and fake
// apps run in bro-headless under the same BRO_APP_HOME ask it: an allow from
// the keyboard, a deny by click, two apps asking at once (queued), an app that
// quits mid-prompt (dismissed), and Escape (Not now: nothing kept).

(function () {
const settle = (n = 10) => { for (let i = 0; i < n; ++i) { advanceTime(16); flush(); } };
settle();

const P = typeof bro !== 'undefined' ? bro.permissions : null;
assert(P && P.available !== false, 'helm-headless grants its UI bro.permissions');

const fs = require('fs');
const cp = require('child_process');
const home = process.env.BRO_APP_HOME;
assert(home, 'the test runs with its own BRO_APP_HOME');
const storeFile = `${home}/bro/grants.json`;
const cli = process.env.BRO_CLI || '';
const headlessCli = cli.replace(/bro(\.exe)?$/, 'bro-headless$1');
if (!cli || !fs.existsSync(headlessCli)) {
  skipTest(`needs bro-headless from bro's build (BRO_CLI=${cli || 'unset'})`);
  return;
}
assert(P.serving === true, 'helm serves the session\'s permission prompts once it boots');

const helm = window.helm;
const prompts = helm.prompts;
const overlay = document.getElementById('permission-prompt');
const card = () => overlay.querySelector('.perm-prompt');
const shown = () => !overlay.classList.contains('hidden') && card() && card().getBoundingClientRect().width > 0;
const shownCap = () => (shown() ? card().dataset.capability : null);
const button = (answer) => overlay.querySelector(`[data-answer="${answer}"]`);
const key = (k, extra = {}) => (document.activeElement || document.body)
  .dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
const store = () => (fs.existsSync(storeFile) ? fs.readFileSync(storeFile, 'utf8') : '');

const appDir = `${home}/fake-apps/asker`;
fs.mkdirSync(appDir, { recursive: true });
fs.writeFileSync(`${appDir}/bro.json`, JSON.stringify({
  id: 'org.example.Asker', name: 'Asker', version: '1.0.0', permissions: ['spawn', 'net', 'env', 'mic'],
}));
fs.writeFileSync(`${appDir}/index.html`, '<!doctype html><title>Asker</title><p>Asker</p>');

// An app run that uses `cap`: spawn starts a program (so the prompt has a
// "what"), the rest ask through requestPermission. It prints what it got.
let n = 0;
function startAsk(cap) {
  const script = `${home}/ask${n++}.js`;
  const use = cap === 'spawn'
    ? 'try { require("child_process").spawnSync("true", []); got = true; } catch (e) { got = false; }\n'
    : `bro.app.requestPermission(${JSON.stringify(cap)}).then((v) => { got = v; });\n`;
  fs.writeFileSync(script, 'let got = "pending";\n' + use + 'advanceTime(16); advanceTime(16);\n' +
    'console.log("RESULT:" + JSON.stringify({ got, p: bro.app.permissions }));\n');
  const run = { out: '', exited: false };
  run.child = cp.spawn(headlessCli, [appDir, script], { env: process.env, stdio: 'pipe', encoding: 'utf8' });
  run.child.stdout.on('data', (d) => { run.out += d; });
  run.child.stderr.on('data', (d) => { run.out += d; });
  run.child.on('exit', () => { run.exited = true; });
  run.result = () => {
    const line = run.out.split(/\r?\n/).find((l) => l.indexOf('RESULT:') >= 0);
    return line ? JSON.parse(line.slice(line.indexOf('RESULT:') + 7)) : undefined;
  };
  return run;
}

function waitFor(pred, what) {
  for (let i = 0; i < 1500; ++i) {
    advanceTime(16);
    wallSleep(8);
    flush();
    if (pred()) return;
  }
  throw new Error(`timed out waiting for ${what}`);
}

const summaryOf = (cap) => P.capabilities().find((c) => c.name === cap).summary;
const runs = [];
try {
  // -- Allow, from the keyboard ---------------------------------------------------------
  const a = startAsk('spawn');
  runs.push(a);
  waitFor(() => shownCap() === 'spawn', 'the prompt for spawn');
  const text = card().textContent;
  assert(text.includes('Asker') && text.includes(summaryOf('spawn')),
    `the prompt names the app and what it wants: ${text}`);
  assert(/true/.test(card().querySelector('.perm-prompt-what').textContent), `and what it was trying: ${text}`);
  assert(overlay.hasAttribute('data-shell-keyboard') && helm.overlays.has('permission-prompt'),
    'the prompt is a shell overlay that takes the keyboard');
  assert(document.activeElement === button('deny'), 'focus starts on Deny');
  key('Tab');
  assert(document.activeElement === button('allow'), 'Tab moves to Allow');
  key('Tab', { shiftKey: true });
  assert(document.activeElement === button('deny'), 'Shift+Tab moves back');
  key('Tab');
  key('Enter');
  settle(2);
  assert(!shown() && !helm.overlays.has('permission-prompt'), 'answering closes the prompt');
  waitFor(() => a.exited, 'the allowed app to finish');
  assert(a.result() && a.result().got === true, `the app was allowed: ${a.out.slice(-1500)}`);
  assert(/"spawn"\s*:\s*"allow"/.test(store()), `the app kept the allow: ${store()}`);

  // -- Two apps at once: queued; a deny by click; an app quitting mid-prompt ---------------
  const b = startAsk('net');
  runs.push(b);
  waitFor(() => shownCap() === 'net', 'the prompt for net');
  const c = startAsk('env');
  runs.push(c);
  waitFor(() => prompts.pending().length === 2, 'the second request to queue');
  assert(shownCap() === 'net', 'the first request stays on screen');
  assert(/1 more request waiting/.test(card().textContent), `the prompt says one more waits: ${card().textContent}`);
  button('deny').click();
  settle(2);
  assert(shownCap() === 'env', 'the next request is shown once the first is answered');
  waitFor(() => b.exited, 'the denied app to finish');
  assert(b.result() && b.result().got === false, `the app was denied: ${b.out.slice(-1500)}`);
  assert(/"net"\s*:\s*"deny"/.test(store()), `the app kept the denial: ${store()}`);
  // The asker goes away (a crash): its prompt is dismissed.
  const pid = prompts.queue[0].app.pid;
  assert(pid > 0, 'the request carries the asker\'s pid');
  process.kill(pid, 'SIGKILL');
  waitFor(() => !shown(), 'the quitting app\'s prompt to be dismissed');
  assert(prompts.pending().length === 0 && !helm.overlays.has('permission-prompt'), 'nothing is left waiting');
  waitFor(() => c.exited, 'the killed app to be gone');
  assert(!/"env"/.test(store()), `nothing was kept for it: ${store()}`);

  // -- Escape: Not now, nothing kept ----------------------------------------------------------
  const d = startAsk('mic');
  runs.push(d);
  waitFor(() => shownCap() === 'mic', 'the prompt for mic');
  key('Escape');
  settle(2);
  assert(!shown(), 'Escape closes the prompt');
  waitFor(() => d.exited, 'the dismissed app to finish');
  assert(d.result() && d.result().got === false, `Not now refuses: ${d.out.slice(-1500)}`);
  assert(d.result().p.undecided.includes('mic') && !/"mic"/.test(store()), `and keeps nothing: ${store()}`);
} finally {
  for (const r of runs) if (!r.exited) attempt(() => r.child.kill());
}
console.log('test_permission_prompt: ok');

function attempt(fn) { try { fn(); } catch (e) { /* gone already */ } }
})();
