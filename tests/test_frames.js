// test_frames.js: helm's server-side window frames, the snap preview and the
// Super+arrow hotkeys, over real Wayland clients. BRO_HEADLESS_COMPOSITOR=1
// (set for this test in CMakeLists.txt) runs the DRM shell host's compositor,
// window manager and input router headless; hostPointer() drives the router
// the way libinput does, so presses on frames go through the same path as a
// DRM session.

if (typeof hostCompositorSocket !== 'function' || hostCompositorSocket() === ''
    || typeof bro === 'undefined' || !bro.compositor || !bro.compositor.available) {
  skipTest('needs BRO_HEADLESS_COMPOSITOR=1 and the Wayland server');
}

const cp = require('child_process');
const fs = require('fs');
const clientDir = process.env.BC_TEST_CLIENT_DIR || '../brocompositor/build-release/tests';
const clientBin = `${clientDir}/bc_wl_client`;
if (!fs.existsSync(clientBin)) skipTest(`bc_wl_client not found in ${clientDir} (BC_TEST_CLIENT_DIR)`);

const C = bro.compositor;
const settle = (n = 10) => { for (let i = 0; i < n; ++i) { advanceTime(16); flush(); } };
const realSleep = (ms) => cp.execSync(`sleep ${ms / 1000}`);
function waitFor(pred, what) {
  for (let i = 0; i < 200; ++i) {
    advanceTime(16);
    flush();
    if (pred()) return;
    realSleep(20);
  }
  throw new Error(`timed out waiting for ${what}`);
}

settle();
const helm = window.helm;
helm.prefs.set('dockAutohide', false);
settle(5);

const env = Object.assign({}, process.env, { WAYLAND_DISPLAY: hostCompositorSocket() });
const children = [];
function spawnClient(appId, title, extra) {
  // stdio 'pipe': the client exits when its stdin closes.
  children.push(cp.spawn(clientBin, ['--app-id', appId, '--title', title, '--size', '700x480',
    '--color', 'FF23262F', '--dmabuf'].concat(extra || []), { env, stdio: 'pipe' }));
  waitFor(() => C.getWindows().some((w) => w.appId === appId), `${appId} to map`);
  return C.getWindows().find((w) => w.appId === appId);
}
const win = (id) => C.getWindow(id);
const frame = (id) => document.querySelector(`[data-window-frame="${id}"]`);
const click = (x, y) => {
  const got = hostPointer('down', x, y);
  hostPointer('up', x, y);
  return got;
};
const center = (el) => {
  const r = el.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
};

let failed = false;
try {
  assert(helm.frames && helm.frames.enabled, 'frames are on with a compositor that draws them');
  const deco = C.getDecorations();
  assert(deco.insets.top === 38 && deco.insets.left === 6 && deco.maximizedInsets.left === 0,
    `decorations declared: ${JSON.stringify(deco)}`);

  const a = spawnClient('org.example.Notes', 'notes.txt');
  const b = spawnClient('org.example.Viewer', 'Viewer');
  const c = spawnClient('org.example.Csd', 'Own frame', ['--csd']);
  settle(5);

  // Frames for decorated windows only.
  assert(frame(a.id) && frame(b.id), 'a frame per decorated window');
  assert(!frame(c.id), 'no frame for a client-side-decorated window');
  assert(document.querySelectorAll('#window-frames [data-window-frame]').length === 2, 'two frames');
  assert(frame(a.id).querySelector('.wf-title').textContent === 'notes.txt', 'title shown');
  assert(frame(a.id).querySelector('.wf-icon'), 'app icon shown');
  assert(frame(a.id).querySelectorAll('.wf-btn').length === 3, 'minimize, maximize and close');

  C.moveWindow(a.id, { x: 200, y: 330, width: 700, height: 480 });
  C.moveWindow(b.id, { x: 1000, y: 200, width: 700, height: 480 });
  C.moveWindow(c.id, { x: 1300, y: 760, width: 400, height: 200 });
  waitFor(() => win(a.id).frame.x === 200 && win(b.id).frame.x === 1000, 'placement');
  settle(5);
  const ra = frame(a.id).getBoundingClientRect();
  assert(ra.left === 194 && ra.top === 292 && ra.width === 712 && ra.height === 524,
    `frame a on its outer rect: ${JSON.stringify(ra)}`);

  // Focus styling follows data-window-focused.
  C.focusWindow(a.id);
  waitFor(() => win(a.id).focused, 'a focused');
  settle(20);
  assert(frame(a.id).hasAttribute('data-window-focused') && !frame(b.id).hasAttribute('data-window-focused'),
    'focused frame marked');
  const seam = (id) => Number(getComputedStyle(frame(id).querySelector('.wf-seam')).opacity);
  assert(seam(a.id) > 0.5 && seam(b.id) === 0, `focus seam lit on the focused frame only (${seam(a.id)}, ${seam(b.id)})`);
  const titleColor = (id) => getComputedStyle(frame(id).querySelector('.wf-title')).color;
  assert(titleColor(a.id) !== titleColor(b.id), 'unfocused title dimmed');

  // A press on b's title bar raises and focuses b, and a drag moves it.
  const bo = win(b.id).outerFrame;
  const tx = bo.x + 250;
  const ty = bo.y + 18;
  assert(hostPointer('down', tx, ty) === true, 'a press on a title bar reaches the shell');
  waitFor(() => win(b.id).focused, 'b focused by its title bar');
  assert(C.getDrag() && C.getDrag().windowId === b.id, 'title press arms a move');
  hostPointer('move', tx - 40, ty + 30);
  hostPointer('move', tx - 100, ty + 60);
  hostPointer('up', tx - 100, ty + 60);
  waitFor(() => !C.getDrag(), 'drag over');
  settle(3);
  const bf = win(b.id).frame;
  assert(bf.x === 900 && bf.y === 260, `title drag moved the window: ${JSON.stringify(bf)}`);
  const rb = frame(b.id).getBoundingClientRect();
  assert(rb.left === bf.x - 6 && rb.top === bf.y - 38, `frame followed: ${JSON.stringify(rb)}`);

  // Double-click on the title maximizes; the button then restores.
  const bo2 = win(b.id).outerFrame;
  click(bo2.x + 200, bo2.y + 18);
  click(bo2.x + 200, bo2.y + 18);
  waitFor(() => win(b.id).maximized, 'double-click on the title maximizes');
  settle(5);
  assert(frame(b.id).getAttribute('data-window-state') === 'maximized', 'maximized state on the frame');
  assert(getComputedStyle(frame(b.id).querySelector('.wf-n')).display === 'none', 'no resize grips when maximized');
  assert(frame(b.id).querySelector('.wf-max').title === 'Restore', 'maximize button turns to restore');
  assert(click(...center(frame(b.id).querySelector('.wf-max'))) === true, 'button press reaches the shell');
  waitFor(() => !win(b.id).maximized, 'restore button restores');

  // Maximize button, then minimize, then close, all by pointer.
  settle(5);
  click(...center(frame(b.id).querySelector('.wf-max')));
  waitFor(() => win(b.id).maximized, 'maximize button maximizes');
  settle(5);
  click(...center(frame(b.id).querySelector('.wf-min')));
  waitFor(() => win(b.id).minimized, 'minimize button minimizes');
  settle(5);
  assert(frame(b.id).style.display === 'none', 'a minimized window shows no frame');
  helm.windows.focus(b.id);
  waitFor(() => !win(b.id).minimized, 'b back');
  settle(5);
  click(...center(frame(b.id).querySelector('.wf-close')));
  waitFor(() => !C.getWindows().some((w) => w.id === b.id), 'close button closes');
  settle(5);
  assert(!frame(b.id), 'a closed window loses its frame');

  // Dragging a toward the left edge arms the snap preview; release snaps.
  const previews = [];
  C.on('snapPreview', (e) => previews.push(e));
  const preview = document.getElementById('snap-preview');
  const ao = win(a.id).outerFrame;
  const sx = ao.x + 250;
  const sy = ao.y + 18;
  assert(hostPointer('down', sx, sy) === true, 'press on a\'s title');
  waitFor(() => win(a.id).focused, 'a focused');
  for (let x = sx - 40; x > 2; x -= 60) hostPointer('move', x, sy + 100);
  hostPointer('move', 1, sy + 110);
  waitFor(() => previews.some((e) => e.zone === 'left'), 'snap preview event');
  settle(30);
  const armed = previews.filter((e) => e.zone === 'left').pop();
  assert(!preview.classList.contains('hidden') && preview.classList.contains('shown'), 'snap preview shown');
  const pr = preview.getBoundingClientRect();
  assert(Math.abs(pr.left - armed.rect.x) < 1 && Math.abs(pr.width - armed.rect.width) < 1
    && Math.abs(pr.top - armed.rect.y) < 1 && Math.abs(pr.height - armed.rect.height) < 1,
  `preview on the landing rect: ${JSON.stringify(pr)} vs ${JSON.stringify(armed.rect)}`);
  hostPointer('up', 1, sy + 110);
  waitFor(() => win(a.id).snap === 'left', 'release snaps to the left half');
  settle(30);
  assert(preview.classList.contains('hidden'), 'preview hidden after the drop');
  assert(frame(a.id).getAttribute('data-window-snap') === 'left', 'snap zone on the frame');
  const outer = win(a.id).outerFrame;
  assert(outer.x === armed.rect.x && outer.width === armed.rect.width, 'window landed where the preview showed');
  assert(frame(a.id).querySelector('.wf-max').title === 'Maximize', 'a snapped half still offers maximize');

  // Right click on the title bar: the window menu.
  frame(a.id).querySelector('.wf-bar').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 80 }));
  settle(2);
  assert(helm.menus.isOpen && Array.from(document.querySelectorAll('.menu .menu-item')).some((m) => /Unsnap/.test(m.textContent)),
    'title bar menu offers to unsnap');
  helm.menus.close();
  settle(2);

  // Super+arrows: the DOM keydown path runs the hotkey table, which calls
  // snapWindowToward on the focused window.
  const calls = [];
  const realToward = C.snapWindowToward;
  C.snapWindowToward = function (id, dir) {
    calls.push([id, dir]);
    return realToward.call(C, id, dir);
  };
  const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, bubbles: true }));
  key('ArrowRight');
  waitFor(() => win(a.id).snap === 'none', 'Super+Right from the left half restores');
  assert(calls.length === 1 && calls[0][0] === a.id && calls[0][1] === 'right', `snapWindowToward called: ${JSON.stringify(calls)}`);
  key('ArrowLeft');
  waitFor(() => win(a.id).snap === 'left', 'Super+Left snaps left');
  key('ArrowUp');
  waitFor(() => win(a.id).maximized, 'Super+Up maximizes');
  key('ArrowDown');
  waitFor(() => !win(a.id).maximized && win(a.id).snap === 'none', 'Super+Down restores');
  C.snapWindowToward = realToward;
} catch (e) {
  console.error(String((e && e.stack) || e));
  failed = true;
} finally {
  for (const ch of children) ch.kill();
}
if (failed) throw new Error('test_frames failed');
