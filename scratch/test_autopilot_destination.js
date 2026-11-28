import assert from 'node:assert/strict';
import test from 'node:test';
import { permitsVenue } from '../js/engine/autoPilotTarget.js';

test('only the explicitly selected venues accept Auto-Pilot entries', () => {
  for (const [route, paper, delta] of [
    ['website', true, false], ['delta', false, true], ['both', true, true],
    [null, false, false], ['unknown', false, false]
  ]) {
    assert.equal(permitsVenue(route, 'website'), paper);
    assert.equal(permitsVenue(route, 'delta'), delta);
  }
});

test('cloud signal adoption respects the account route even with stale browser settings', async () => {
  globalThis.document = { addEventListener() {} };
  globalThis.window = { MONDAY_SUPABASE_CONFIG: { url: 'https://mock.invalid', anonKey: 'anon' }, dispatchEvent() {} };
  const store = new Map([['sunday_autopilot_target_v1', 'website']]);
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) };
  const { App } = await import('../js/app.js');
  const app = Object.create(App.prototype);
  app.authManager = { getUserId: () => 'user1', getAuthToken: async () => 'user-token' };
  app.autoPilotEnabled = true;
  let fills = 0, route = 'delta';
  globalThis.fetch = async (url, opts) => {
    if (opts.method === 'POST') route = JSON.parse(opts.body).strategy;
    return { ok: true, json: async () => [{ strategy: route }] };
  };
  app.paperTrader = { openPositions: [], executePaperTrade: () => { fills++; return null; } };
  app.pushSettingsToCloud = async () => {};
  const signal = { asset: 'SOL', direction: 'LONG', entryPrice: 100, filledAt: Date.now() };
  await app.handleAutoPilotSignalFill(signal);
  assert.equal(fills, 0);
  await app.selectAutoPilotTarget('website');
  await app.handleAutoPilotSignalFill(signal);
  assert.equal(fills, 1);
  await app.selectAutoPilotTarget('delta');
  await app.handleAutoPilotSignalFill(signal);
  assert.equal(fills, 1);
  globalThis.fetch = async () => ({ ok: false });
  await app.handleAutoPilotSignalFill(signal);
  assert.equal(fills, 1);
});
