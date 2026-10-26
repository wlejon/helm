/**
 * bro.permissions for the shell: one subscription to the grant store's
 * 'change' event, fanned out to whoever shows grants (the Settings page and
 * the bar's dev mode indicator). bro fires it for a change made here at once
 * and for one made elsewhere (`bro --revoke-app` in a terminal, an app's
 * prompt answered) within a quarter second.
 */

import { api, attempt } from './util.js';

const listeners = new Set();
let subscribed = false;

function ns() {
  const p = api('permissions');
  return p && typeof p.list === 'function' ? p : null;
}

function subscribe() {
  if (subscribed) return;
  const p = ns();
  if (!p || typeof p.on !== 'function') return;
  subscribed = true;
  attempt('permissions.on', () => p.on('change', () => {
    for (const fn of Array.from(listeners)) attempt('permissions change listener', fn);
  }));
}

export const permissions = {
  available() {
    return !!ns();
  },

  devMode() {
    const p = ns();
    return !!p && !!attempt('permissions.devMode', () => p.devMode, false);
  },

  /** fn() on every change to the store; returns an unsubscribe. */
  on(fn) {
    listeners.add(fn);
    subscribe();
    return () => listeners.delete(fn);
  },
};
