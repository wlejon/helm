/**
 * Agent traffic: the requests agents send each other through the session's
 * agent inbox (bro's docs/agent-inbox.md: `bro-ctl ask`, `bro.inbox`), shown
 * to the person at the desk or watching through a remote viewer.
 *
 * A request that arrives rises as a notification ("claude-win asks
 * summarize") and holds a live activity in the clock island while it is
 * open (its latest progress line as the title); when it ends, a
 * notification says how. helm only shows: the inbox is bro's, and it runs
 * in this engine (the display's), so the feed is in-process.
 */

import { attempt } from './util.js';

const ENDED = {
  done: ['answered', 'check'],
  failed: ['failed', 'alert'],
  cancelled: ['cancelled', 'x'],
};

class AgentTraffic {
  constructor() {
    this.open = new Map();  // request id -> { from, to, text }
    this.watcher = null;
  }

  init(shell) {
    this.shell = shell;
    const inbox = typeof bro !== 'undefined' ? bro.inbox : null;
    if (!inbox || typeof inbox.watch !== 'function') return;
    this.watcher = inbox.watch((e) => attempt('agent event', () => this.onEvent(e)));
  }

  onEvent(e) {
    const notify = this.shell.notify;
    if (e.kind === 'asked') {
      this.open.set(e.id, { from: e.from, to: e.to, text: e.text });
      notify.post({ summary: `${e.from} asks ${e.to}`, body: e.text, appName: 'Agents', icon: 'sparkles' });
      this.render();
    } else if (e.kind === 'progress' && this.open.has(e.id)) {
      this.open.get(e.id).text = e.text;
      this.render();
    } else if (ENDED[e.kind]) {
      const r = this.open.get(e.id) || { from: e.from, to: e.to };
      this.open.delete(e.id);
      const [verb, glyph] = ENDED[e.kind];
      notify.post({ summary: `${r.to} ${verb} ${r.from}`, body: e.text, appName: 'Agents', icon: glyph });
      this.render();
    } else if (e.kind === 'registered' || e.kind === 'left') {
      console.log(`helm: agent ${e.to} ${e.kind}`);
    }
  }

  /** The clock island's live activity: the newest open request, or how many. */
  render() {
    const acts = this.shell.activities;
    if (this.open.size === 0) return acts.end('agents');
    const latest = [...this.open.values()].pop();
    const title = this.open.size > 1
      ? `${this.open.size} agent requests`
      : `${latest.from} → ${latest.to}${latest.text ? ': ' + latest.text : ''}`;
    acts.start({ id: 'agents', kind: 'agent', icon: 'sparkles', title });
  }
}

export const agentTraffic = new AgentTraffic();
