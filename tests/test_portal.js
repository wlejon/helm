// test_portal.js: verifies ui/js/portal.js initialization, live
// helm.shell.appearance -> bro.portal synchronization (setColorScheme,
// setAccentColor, setContrast, setReducedMotion), and portal request handlers
// (onScreenshot, onPickColor, onFileChooser, onOpenUri, onInhibit,
// GlobalShortcuts).

const fs = require('fs');

const settle = (n = 5) => { for (let i = 0; i < n; ++i) { advanceTime(16); flush(); } };
settle();

const helm = window.helm;
assert(helm && helm.portal, 'helm.portal controller exists');
assert(helm.shell && helm.shell.appearance === helm.appearance, 'helm.shell.appearance is exposed');

// 1. Test against real bro.portal when available on Linux
if (typeof bro !== 'undefined' && bro.portal && bro.portal.available) {
  const P = bro.portal;
  const getCS = () => (typeof P.getColorScheme === 'function' ? P.getColorScheme() : P.getSetting('org.freedesktop.appearance', 'color-scheme'));
  const getAC = () => (typeof P.getAccentColor === 'function' ? P.getAccentColor() : P.getSetting('org.freedesktop.appearance', 'accent-color'));
  const getCT = () => (typeof P.getContrast === 'function' ? P.getContrast() : P.getSetting('org.freedesktop.appearance', 'contrast'));
  const getRM = () => (typeof P.getReducedMotion === 'function' ? P.getReducedMotion() : P.getSetting('org.freedesktop.appearance', 'reduced-motion'));

  assert(getCS() === 1, 'initial color-scheme is dark (1)');
  const initAc = getAC();
  assert(initAc && initAc.length === 3 && initAc.every((c) => c >= 0 && c <= 1),
    `initial accent-color is normalized [r, g, b]: ${JSON.stringify(initAc)}`);

  // Live theme sync via helm.shell.appearance
  helm.shell.appearance.theme = 'light';
  settle(2);
  assert(getCS() === 2, 'theme=light sets portal color-scheme to 2');
  assert(document.documentElement.dataset.theme === 'light', 'DOM dataset.theme updated to light');

  helm.shell.appearance.theme = 'dark';
  settle(2);
  assert(getCS() === 1, 'theme=dark sets portal color-scheme to 1');

  // Live hex accent sync (#38bdf8 -> [56/255, 189/255, 248/255])
  helm.shell.appearance.accent = '#38bdf8';
  settle(2);
  const ac = getAC();
  assert(ac && Math.abs(ac[0] - 56 / 255) < 1e-3 && Math.abs(ac[1] - 189 / 255) < 1e-3 && Math.abs(ac[2] - 248 / 255) < 1e-3,
    `hex accent #38bdf8 synced to normalized RGB: ${JSON.stringify(ac)}`);

  // Live highContrast & reducedMotion sync
  helm.shell.appearance.highContrast = true;
  helm.shell.appearance.reducedMotion = true;
  settle(2);
  assert(getCT() === 1, 'highContrast=true sets portal contrast to 1');
  assert(getRM() === 1, 'reducedMotion=true sets portal reduced-motion to 1');

  helm.shell.appearance.highContrast = false;
  helm.shell.appearance.reducedMotion = false;
  settle(2);
  assert(getCT() === 0, 'highContrast=false sets portal contrast to 0');
  assert(getRM() === 0, 'reducedMotion=false sets portal reduced-motion to 0');

  // Sync via bro.conf ('helm.shell.appearance.*')
  if (bro.conf && bro.conf.available !== false) {
    bro.conf.set('helm.shell.appearance.theme', 'light');
    bro.conf.set('helm.shell.appearance.accent', '#ff5500');
    bro.conf.set('helm.shell.appearance.highContrast', true);
    bro.conf.set('helm.shell.appearance.reducedMotion', true);
    settle(3);
    assert(getCS() === 2, 'bro.conf helm.shell.appearance.theme synced');
    const ac2 = getAC();
    assert(ac2 && Math.abs(ac2[0] - 1.0) < 1e-3 && Math.abs(ac2[1] - 85 / 255) < 1e-3 && Math.abs(ac2[2] - 0) < 1e-3,
      `bro.conf helm.shell.appearance.accent synced: ${JSON.stringify(ac2)}`);
    assert(getCT() === 1, 'bro.conf helm.shell.appearance.highContrast synced');
    assert(getRM() === 1, 'bro.conf helm.shell.appearance.reducedMotion synced');
  }
}

// 2. Test full portal contract and request callbacks with a mock portal
const realPortal = helm.portal.portal;
const calls = {
  started: 0,
  stopped: 0,
  colorScheme: [],
  accentColor: [],
  contrast: [],
  reducedMotion: [],
};
const handlers = {};
const mockPortal = {
  available: true,
  start() { calls.started++; return true; },
  stop() { calls.stopped++; return true; },
  isRunning() { return calls.started > calls.stopped; },
  setColorScheme(s) { calls.colorScheme.push(s); return true; },
  setAccentColor(rgb) { calls.accentColor.push(rgb); return true; },
  setContrast(c) { calls.contrast.push(c); return true; },
  setReducedMotion(m) { calls.reducedMotion.push(m); return true; },
  onScreenshot(fn) { handlers.screenshot = fn; return { dispose() { delete handlers.screenshot; } }; },
  onPickColor(fn) { handlers.pickColor = fn; return { dispose() { delete handlers.pickColor; } }; },
  onFileChooser(fn) { handlers.fileChooser = fn; return { dispose() { delete handlers.fileChooser; } }; },
  onOpenUri(fn) { handlers.openUri = fn; return { dispose() { delete handlers.openUri; } }; },
  onInhibit(fn) { handlers.inhibit = fn; return { dispose() { delete handlers.inhibit; } }; },
  onBindShortcuts(fn) { handlers.bindShortcuts = fn; return { dispose() { delete handlers.bindShortcuts; } }; },
  onListShortcuts(fn) { handlers.listShortcuts = fn; return { dispose() { delete handlers.listShortcuts; } }; },
  onConfigureShortcuts(fn) { handlers.configureShortcuts = fn; return { dispose() { delete handlers.configureShortcuts; } }; },
};

try {
  helm.shell.appearance.theme = 'dark';
  helm.shell.appearance.accent = '#38bdf8';
  helm.shell.appearance.highContrast = false;
  helm.shell.appearance.reducedMotion = false;
  settle(2);

  assert(helm.portal.attach(mockPortal) === true, 'portal attaches to mockPortal');
  assert(calls.started === 1, 'portal.start() called on init');
  assert(calls.colorScheme.at(-1) === 'dark', 'initial colorScheme synced');
  assert(Math.abs(calls.accentColor.at(-1)[0] - 56 / 255) < 1e-3, 'initial accentColor synced');
  assert(calls.contrast.at(-1) === 'normal', 'initial contrast synced');
  assert(calls.reducedMotion.at(-1) === 'normal', 'initial reducedMotion synced');

  // Verify live updates reach mockPortal
  helm.shell.appearance.theme = 'light';
  helm.shell.appearance.accent = '#10b981';
  helm.shell.appearance.highContrast = true;
  helm.shell.appearance.reducedMotion = true;
  settle(2);
  assert(calls.colorScheme.at(-1) === 'light', 'live theme -> setColorScheme(light)');
  assert(Math.abs(calls.accentColor.at(-1)[0] - 16 / 255) < 1e-3
    && Math.abs(calls.accentColor.at(-1)[1] - 185 / 255) < 1e-3
    && Math.abs(calls.accentColor.at(-1)[2] - 129 / 255) < 1e-3,
    `live hex accent #10b981 -> setAccentColor: ${JSON.stringify(calls.accentColor.at(-1))}`);
  assert(calls.contrast.at(-1) === 'high', 'live highContrast -> setContrast(high)');
  assert(calls.reducedMotion.at(-1) === 'reduced', 'live reducedMotion -> setReducedMotion(reduced)');

  // Changing accentHue updates accent RGB from OKLCH hue
  helm.prefs.set('accentHue', 255);
  settle(2);
  assert(calls.accentColor.at(-1).every((v) => v >= 0 && v <= 1), 'accentHue -> normalized [r, g, b]');

  // Test onScreenshot handler
  assert(typeof handlers.screenshot === 'function', 'onScreenshot handler registered');
  let ssResponse = null;
  await handlers.screenshot({
    handle: '/org/freedesktop/portal/desktop/request/ss_test',
    appId: 'org.example.Shot',
    options: { interactive: false, modal: false },
    respond(r) { ssResponse = r; },
    cancel() { ssResponse = { cancelled: true }; },
  });
  assert(ssResponse && typeof ssResponse.uri === 'string' && ssResponse.uri.startsWith('file:///'),
    `onScreenshot responds with file:// URI: ${JSON.stringify(ssResponse)}`);
  const shotPath = ssResponse.uri.slice(7);
  assert(fs.existsSync(shotPath) && fs.statSync(shotPath).size > 0, `screenshot file written at ${shotPath}`);

  // Test onPickColor handler
  assert(typeof handlers.pickColor === 'function', 'onPickColor handler registered');
  let pcResponse = null;
  await handlers.pickColor({
    handle: '/org/freedesktop/portal/desktop/request/pc_test',
    appId: 'org.example.Color',
    options: {},
    respond(r) { pcResponse = r; },
  });
  assert(pcResponse && pcResponse.color && typeof pcResponse.color.r === 'number', 'onPickColor responds with RGB color');

  // Test onFileChooser handler
  assert(typeof handlers.fileChooser === 'function', 'onFileChooser handler registered');
  let fcResponse = null;
  await handlers.fileChooser({
    handle: '/org/freedesktop/portal/desktop/request/fc_test',
    appId: 'org.example.Files',
    title: 'Open File',
    options: { currentFile: '/tmp/example.txt' },
    respond(r) { fcResponse = r; },
    cancel() { fcResponse = { cancelled: true }; },
  });
  assert(fcResponse && Array.isArray(fcResponse.uris) && fcResponse.uris[0] === 'file:///tmp/example.txt',
    `onFileChooser responds with file URI: ${JSON.stringify(fcResponse)}`);

  // Test onOpenUri handler
  assert(typeof handlers.openUri === 'function', 'onOpenUri handler registered');
  const openedTargets = [];
  const origApp = bro.app;
  bro.app = { ...(origApp || {}), open: async (u) => { openedTargets.push(u); return true; } };
  let uriResponse = null;
  try {
    await handlers.openUri({
      handle: '/org/freedesktop/portal/desktop/request/uri_test',
      appId: 'org.example.Browser',
      uri: 'https://bro.example.com/docs',
      fd: -1,
      options: {},
      respond(r) { uriResponse = r; },
      cancel() { uriResponse = { cancelled: true }; },
    });
  } finally {
    bro.app = origApp;
  }
  assert(uriResponse && uriResponse.success === true, 'onOpenUri responds with success: true');
  assert(openedTargets[0] === 'https://bro.example.com/docs', 'onOpenUri forwards URI to bro.app.open');

  // Test onInhibit handler -> bro.seat.inhibit / uninhibit
  assert(typeof handlers.inhibit === 'function', 'onInhibit handler registered');
  const seatInhibits = [];
  const seatUninhibits = [];
  const seat = bro.seat;
  const origInhibit = seat ? seat.inhibit : null;
  const origUninhibit = seat ? seat.uninhibit : null;
  if (seat) {
    seat.inhibit = (type, reason) => { seatInhibits.push({ type, reason }); return 42; };
    seat.uninhibit = (id) => { seatUninhibits.push(id); return true; };
  }
  try {
    handlers.inhibit({
      added: true,
      handle: '/org/freedesktop/portal/desktop/request/inh_1',
      appId: 'org.example.Player',
      flags: 12,
      suspend: true,
      idle: true,
      reason: 'Playing video',
    });
    assert(helm.portal.inhibitions.has('/org/freedesktop/portal/desktop/request/inh_1'), 'portal tracks active inhibition');
    if (seat) {
      assert(seatInhibits.length === 1 && seatInhibits[0].type === 'sleep:idle' && seatInhibits[0].reason === 'Playing video',
        `onInhibit forwarded to bro.seat.inhibit: ${JSON.stringify(seatInhibits)}`);
    }

    handlers.inhibit({
      added: false,
      handle: '/org/freedesktop/portal/desktop/request/inh_1',
      appId: 'org.example.Player',
    });
    assert(!helm.portal.inhibitions.has('/org/freedesktop/portal/desktop/request/inh_1'), 'inhibition removed when closed');
    if (seat) {
      assert(seatUninhibits.length === 1 && seatUninhibits[0] === 42, 'bro.seat.uninhibit called with lock id');
    }
  } finally {
    if (seat) {
      seat.inhibit = origInhibit;
      seat.uninhibit = origUninhibit;
    }
  }

  // Test GlobalShortcuts handlers
  assert(typeof handlers.bindShortcuts === 'function' && typeof handlers.listShortcuts === 'function',
    'GlobalShortcuts handlers registered');
  let bindResponse = null;
  handlers.bindShortcuts({
    handle: '/org/freedesktop/portal/desktop/request/gs_bind',
    sessionHandle: '/org/freedesktop/portal/desktop/session/gs_1',
    appId: 'org.example.Recorder',
    shortcuts: [
      { id: 'push_to_talk', description: 'Push to Talk', preferredTrigger: '<Control><Alt>k' },
      { id: 'collide', description: 'Collides with Quick Settings', preferredTrigger: 'Super+S' },
    ],
    respond(r) { bindResponse = r; },
  });
  assert(bindResponse && bindResponse.shortcuts.length === 2, 'onBindShortcuts responds with bound shortcuts');
  assert(bindResponse.shortcuts[0].triggerDescription === 'Ctrl+Alt+K', 'XDG trigger normalized to Ctrl+Alt+K');
  assert(bindResponse.shortcuts[1].triggerDescription === '', 'collision with shell hotkey Super+S cleared');

  let listResponse = null;
  handlers.listShortcuts({
    handle: '/org/freedesktop/portal/desktop/request/gs_list',
    sessionHandle: '/org/freedesktop/portal/desktop/session/gs_1',
    appId: 'org.example.Recorder',
    shortcuts: [],
    respond(r) { listResponse = r; },
  });
  assert(listResponse && listResponse.shortcuts.length === 2 && listResponse.shortcuts[0].id === 'push_to_talk',
    'onListShortcuts returns the session shortcuts');
} finally {
  helm.shell.appearance.theme = 'dark';
  helm.shell.appearance.highContrast = false;
  helm.shell.appearance.reducedMotion = false;
  helm.prefs.set('accentHue', 255);
  helm.portal.attach(realPortal);
  settle(2);
}

console.log('test_portal: all assertions passed');
