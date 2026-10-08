/**
 * Remote sessions: helm hosts its screen for broremote-view through
 * bro.remote when started with `--remote[=NAME]` (main.cpp passes NAME in
 * HELM_REMOTE) or while the remoteHost setting is on. The socket is NAME,
 * else "default", which is what `broremote-view --ssh HOST` reaches with no
 * other options. A viewer gets the whole screen and drives it with its
 * keyboard and mouse, exactly as the local devices do.
 */

import { api, attempt } from './util.js';
import { settings } from './settings.js';

class RemoteHost {
  constructor() {
    this.remote = null;
    this.forced = false;
    this.socket = 'default';
  }

  init() {
    this.remote = api('remote');
    if (!this.remote) return;
    const env = typeof process !== 'undefined' && process.env ? process.env.HELM_REMOTE : '';
    this.forced = !!env;
    if (env) this.socket = env;
    this.remote.on('attach', (e) => console.log(`helm: remote viewer attached (${e.clients} watching)`));
    this.remote.on('detach', (e) => console.log(`helm: remote viewer left (${e.clients} watching)`));
    settings.watch('remoteHost', () => this.apply());
    this.apply();
  }

  apply() {
    if (this.forced || settings.get('remoteHost') === true) {
      // Hardware video where the machine has it (VA-API); Raw, uncompressed,
      // only for a machine without (a development box on a fast link).
      const codecs = ['hevc', 'h264', 'raw'];
      const s = attempt('remote.host', () => this.remote.host({ socket: this.socket, codecs }));
      if (s) console.log(`helm: hosting the screen on ${s.socketPath}`);
    } else {
      attempt('remote.stop', () => this.remote.stop());
    }
  }
}

export const remoteHost = new RemoteHost();
