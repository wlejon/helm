// test_remote.js: the remoteHost setting starts and stops hosting the screen
// through bro.remote (ui/js/remote.js). A private socket name, so the run
// never meets a real session's "default".

const settle = (n = 5) => { for (let i = 0; i < n; ++i) { advanceTime(16); flush(); } };
settle();
const helm = window.helm;

if (typeof bro.remote === 'undefined' || bro.remote.available === false) {
  skipTest('bro was built without bro.remote (no ../broremote)');
} else {
  assert(bro.remote.status().hosting === false, 'not hosting without --remote or the setting');

  helm.remote.socket = `helm-test-${Math.floor(Math.random() * 1e6)}`;
  helm.prefs.set('remoteHost', true);
  settle();
  const on = bro.remote.status();
  assert(on.hosting === true && on.socket === helm.remote.socket, `hosting on the socket: ${JSON.stringify(on)}`);
  assert(on.codecs.length >= 1 && on.codecs.every((c) => ['h264', 'hevc', 'raw'].includes(c)),
         `codecs from helm's list: ${on.codecs}`);

  helm.prefs.set('remoteHost', false);
  settle();
  assert(bro.remote.status().hosting === false, 'turning the setting off stops hosting');
}
