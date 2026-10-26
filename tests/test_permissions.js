// test_permissions.js: Settings > App Permissions and the bar's dev mode
// indicator over bro.permissions and a real grant store: this test's own
// BRO_APP_HOME (CMakeLists.txt), so <BRO_APP_HOME>/bro/grants.json, seeded
// with two fake app folders. The page is driven through its DOM; what it does
// is checked in the store (list() and the file), and changes made by other
// processes (an app picking files in bro-headless, bro --revoke-app,
// --dev-mode) must re-render the page and the bar without reopening anything.

(function () {
const settle = (n = 10) => { for (let i = 0; i < n; ++i) { advanceTime(16); flush(); } };
settle();

const P = typeof bro !== 'undefined' ? bro.permissions : null;
assert(P && P.available !== false, 'helm-headless grants its UI bro.permissions');
for (const fn of ['list', 'set', 'reset', 'removePicked', 'on', 'off', 'capabilities']) {
  assert(typeof P[fn] === 'function', `bro.permissions.${fn} exists (rebuild helm-headless against bro if not)`);
}

const fs = require('fs');
const cp = require('child_process');
const home = process.env.BRO_APP_HOME;
assert(home, 'the test runs with its own BRO_APP_HOME');
const storeFile = `${home}/bro/grants.json`;
const root = `${home}/fake-apps`;
// bro's own executables, from bro's build beside helm (CMakeLists.txt).
const cli = process.env.BRO_CLI || '';
const headlessCli = cli.replace(/bro(\.exe)?$/, 'bro-headless$1');
if (!cli || !fs.existsSync(cli) || !fs.existsSync(headlessCli)) {
  skipTest(`needs bro and bro-headless from bro's build (BRO_CLI=${cli || 'unset'})`);
  return;
}

function makeApp(folder, id, name, permissions) {
  const dir = `${root}/${folder}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/bro.json`, JSON.stringify({ id, name, version: '1.0.0', permissions }, null, 2));
  fs.writeFileSync(`${dir}/index.html`, `<!doctype html><title>${name}</title><p>${name}</p>`);
  return dir;
}
const recDir = makeApp('recorder', 'org.example.Recorder', 'Recorder', ['mic', 'net', 'files', 'compositor']);
const notesDir = makeApp('notes', 'org.example.Notes', 'Notes', ['files', 'spawn']);
const pickedDir = `${home}/picked/Documents`;
const pickedFile = `${home}/picked/todo.txt`;
fs.mkdirSync(pickedDir, { recursive: true });
fs.writeFileSync(pickedFile, 'milk\n');

let changes = 0;
const onChange = () => { ++changes; };
P.on('change', onChange);

// Decisions through the API, as a prompt answered would make them.
P.set(recDir, 'mic', 'allow');
P.set(recDir, 'net', 'deny');
P.set(notesDir, 'spawn', 'allow');
assert(changes >= 3, `a change made here fires 'change' at once (${changes})`);

const entry = (name) => P.list().find((a) => a.name === name);
const rec = entry('Recorder');
const notes = entry('Notes');
assert(rec && notes, `list() has both fake apps: ${JSON.stringify(P.list().map((a) => a.name))}`);
assert(rec.decisions.mic === 'allow' && rec.decisions.net === 'deny' && rec.decisions.files === 'undecided',
  `Recorder's decisions: ${JSON.stringify(rec.decisions)}`);
assert(rec.decisions.compositor === 'host', 'a shell capability it declares reports host');

// Picked paths come from file dialogs: run Notes itself in bro-headless (the
// same store, another process) and pick a folder and a file in it, as its
// user would. helm may not write the store (it is bro's own state).
const run = (exe, args) => {
  const r = cp.spawnSync(exe, args, { env: process.env, encoding: 'utf8' });
  assert(r.status === 0, `${exe} ${args.join(' ')} exits 0 (${r.status}, ${r.signal || ''} ${r.error || ''}): ${r.stderr || ''}${r.stdout || ''}`);
};
const pickScript = `${home}/pick.js`;
fs.writeFileSync(pickScript, [
  `setPickedFiles([${JSON.stringify(pickedDir)}]);`,
  'assert(showOpenFolderDialog("", false).length === 1, "the folder is picked");',
  `setPickedFiles([${JSON.stringify(pickedFile)}]);`,
  'assert(showOpenFileDialog("", false).length === 1, "the file is picked");',
].join('\n'));
run(headlessCli, [notesDir, pickScript]);

// Real time: the store is read again within a quarter second of wall time.
function waitFor(pred, what) {
  for (let i = 0; i < 100; ++i) {
    runFrames(4);
    settle(1);
    if (pred()) return;
  }
  throw new Error(`timed out waiting for ${what}`);
}

const helm = window.helm;
const S = helm.settingsUi;
helm.openSettings('permissions');
settle(30);
assert(S.isOpen && S.page && S.page.id === 'permissions', 'Settings opens on App Permissions');
assert(document.querySelector('#settings-app .st-nav-item[data-page="permissions"]'), 'the page is in the sidebar');

const appEl = (identity) => document.querySelector(`#settings-app .st-perm-app[data-identity="${identity}"]`);
const capEl = (identity, cap) => {
  const a = appEl(identity);
  return a ? a.querySelector(`[data-cap="${cap}"]`) : null;
};
const decisionShown = (identity, cap) => {
  const r = capEl(identity, cap);
  return r ? r.dataset.decision : null;
};
const onLabel = (identity, cap) => {
  const r = capEl(identity, cap);
  const on = r && r.querySelector('.st-seg-opt.on');
  return on ? on.textContent : null;
};

waitFor(() => appEl(notes.identity) && appEl(notes.identity).querySelectorAll('[data-picked]').length === 2,
  'the picked paths written by another process to show');

// -- What it shows ---------------------------------------------------------------

assert(appEl(rec.identity) && appEl(notes.identity), 'both apps have a section');
assert(/Recorder/.test(appEl(rec.identity).textContent) && appEl(rec.identity).textContent.includes(rec.identity),
  'the section names the app and its identity');
assert(decisionShown(rec.identity, 'mic') === 'allow' && onLabel(rec.identity, 'mic') === 'Allow', 'mic shows Allow');
assert(decisionShown(rec.identity, 'net') === 'deny' && onLabel(rec.identity, 'net') === 'Deny', 'net shows Deny');
assert(decisionShown(rec.identity, 'files') === 'undecided' && onLabel(rec.identity, 'files') === 'Ask',
  'an undecided capability shows Ask');
const host = capEl(rec.identity, 'compositor');
assert(host && !host.querySelector('.st-seg') && /Granted by the shell/.test(host.textContent),
  'a shell capability is shown as granted by the shell, with no switch');
const micSummary = P.capabilities().find((c) => c.name === 'mic').summary;
assert(capEl(rec.identity, 'mic').textContent.includes(micSummary), 'each capability carries its summary');
assert(/Never used/.test(capEl(rec.identity, 'mic').textContent), 'an unused capability says so');
const picked = Array.from(appEl(notes.identity).querySelectorAll('[data-picked]')).map((r) => r.dataset.picked);
assert(picked.includes(pickedDir) && picked.includes(pickedFile), `the picked paths are listed: ${picked}`);

// -- Switches land in the store ----------------------------------------------------

capEl(rec.identity, 'mic').querySelector('.st-seg-opt[data-value="deny"]').click();
settle(2);
assert(entry('Recorder').decisions.mic === 'deny', 'Deny on mic lands in the store');
assert(/"mic"\s*:\s*"deny"/.test(fs.readFileSync(storeFile, 'utf8')), 'and in grants.json');
assert(decisionShown(rec.identity, 'mic') === 'deny', 'the page re-renders with it');
capEl(rec.identity, 'files').querySelector('.st-seg-opt[data-value="allow"]').click();
settle(2);
assert(entry('Recorder').decisions.files === 'allow', 'Allow on files lands');
capEl(rec.identity, 'files').querySelector('.st-seg-opt[data-value="undecided"]').click();
settle(2);
assert(entry('Recorder').decisions.files === 'undecided', 'Ask forgets the decision');
assert(!/"files"/.test(JSON.stringify(JSON.parse(fs.readFileSync(storeFile, 'utf8')).apps[rec.identity].capabilities)),
  'an undecided capability is not kept in grants.json');

// -- Picked paths, reset and revoke ---------------------------------------------------

appEl(notes.identity).querySelector(`[data-picked="${pickedFile}"] .btn`).click();
settle(2);
assert(JSON.stringify(entry('Notes').picked) === JSON.stringify([pickedDir]), `Remove takes one picked path back: ${entry('Notes').picked}`);
assert(appEl(notes.identity).querySelectorAll('[data-picked]').length === 1, 'and its row goes');

const buttonIn = (el, label) => Array.from(el.querySelectorAll('.st-section-head .btn')).find((b) => b.textContent.startsWith(label));
const reset = buttonIn(appEl(notes.identity), 'Reset');
assert(reset, 'an app with decisions has a Reset');
reset.click();
assert(entry('Notes').decisions.spawn === 'allow', 'the first press on Reset only arms it');
reset.click();
settle(2);
const n2 = entry('Notes');
assert(n2.decisions.spawn === 'undecided' && n2.picked.length === 0, `Reset forgets every decision and picked path: ${JSON.stringify(n2)}`);
assert(decisionShown(notes.identity, 'spawn') === 'undecided' && !appEl(notes.identity).querySelector('[data-picked]'),
  'the page shows the reset app asking again');

const revoke = buttonIn(appEl(rec.identity), 'Revoke');
revoke.click();
revoke.click();
settle(2);
const r2 = entry('Recorder');
assert(r2.decisions.mic === 'deny' && r2.decisions.net === 'deny' && r2.decisions.files === 'deny' && r2.decisions.compositor === 'host',
  `Revoke all denies every ask capability: ${JSON.stringify(r2.decisions)}`);
assert(['mic', 'net', 'files'].every((c) => decisionShown(rec.identity, c) === 'deny'), 'and the page shows them denied');

// -- Dev mode --------------------------------------------------------------------------

const bar = document.getElementById('isl-devmode');
const barShown = () => !bar.classList.contains('hidden') && bar.getBoundingClientRect().width > 0;
assert(P.devMode === false && bar.classList.contains('hidden'), 'dev mode starts off, with no bar indicator');
const devRow = document.querySelector('#settings-app [data-anchor="dev-mode"]');
assert(devRow && devRow.querySelector('.switch'), 'dev mode is a switch on the page');
devRow.querySelector('.switch').click();
settle(4);
assert(P.devMode === true, 'the switch turns dev mode on in the store');
assert(barShown(), 'the bar shows dev mode while it is on');
assert(document.querySelector('#settings-app [data-anchor="dev-mode-on"]'), 'the page leads with a dev mode warning');
assert(/Granted by dev mode/.test(capEl(rec.identity, 'mic').textContent), 'a denied capability says dev mode grants it');
S.close();
settle(40);
bar.click();
settle(30);
assert(S.isOpen && S.page.id === 'permissions', 'the bar indicator opens App Permissions');
document.querySelector('#settings-app [data-anchor="dev-mode"] .switch').click();
settle(30);
assert(P.devMode === false && bar.classList.contains('hidden'), 'turning it off takes the indicator away');

// -- Changes from outside ------------------------------------------------------------

P.set(rec.identity, 'mic', 'allow');
settle(2);
assert(decisionShown(rec.identity, 'mic') === 'allow', 'mic allowed again');
const before = changes;
run(cli, ['--revoke-app', recDir, 'mic']);
waitFor(() => decisionShown(rec.identity, 'mic') === 'deny', 'bro --revoke-app to re-render the page');
run(cli, ['--dev-mode', 'on']);
waitFor(() => barShown(), 'bro --dev-mode on to show the bar indicator');
assert(document.querySelector('#settings-app [data-anchor="dev-mode-on"]'), 'and the page to show dev mode on');
run(cli, ['--dev-mode', 'off']);
waitFor(() => bar.classList.contains('hidden'), 'bro --dev-mode off to hide it');
assert(changes > before, 'outside changes arrive as change events');

// -- An install changed since its decisions --------------------------------------------

const b = S.backend;
const realList = b.permissionApps;
b.permissionApps = () => realList.call(b).map((a) => (a.name === 'Recorder' ? { ...a, installed: true, install: 'changed' } : a));
S.rerender();
assert(/will ask again|asks again/.test(appEl(rec.identity).querySelector('.st-perm-changed').textContent),
  'a changed install says its next launch asks again');
b.permissionApps = realList;
S.rerender();
assert(!appEl(rec.identity).querySelector('.st-perm-changed'), 'a folder app has no such note');

P.off('change', onChange);
S.close();
settle(40);
console.log(`test_permissions: ok (${changes} change events)`);
})();
