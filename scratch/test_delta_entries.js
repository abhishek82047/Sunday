import assert from 'node:assert/strict';
import test from 'node:test';
import { DeltaEntries } from '../js/adapters/deltaEntries.js';

const entry = { symbol: 'BTCUSD', direction: 'LONG', leverage: 10, maxTrades: 5,
  margin: 100, entry: 100, stop: 90, target: 115 };

function exchange({ available = 400, positions = [], pending = [], contractValue = 0.1 } = {}) {
  const placed = [];
  const request = async (method, path, body) => {
    if (path.includes('/wallet/')) return { result: [{ asset_symbol: 'USD', available_balance: available }] };
    if (path.includes('/positions/')) return { result: positions };
    if (path.includes('/orders?')) return { result: pending };
    if (path.includes('/orders/leverage')) return { success: true };
    if (path.includes('/products/')) return { result: { settling_asset: { symbol: 'USD' },
      notional_type: 'vanilla', state: 'live', id: 1, contract_value: contractValue, tick_size: 0.1, taker_commission_rate: 0.0005 } };
    if (path.includes('/tickers/')) return { result: { quotes: { best_ask: 100, best_bid: 99 } } };
    assert.equal(method, 'POST');
    assert.equal(path, '/v2/orders');
    placed.push(body);
    return { result: { id: placed.length } };
  };
  return { placed, request };
}

test('four funded slots, including orders not yet reflected in wallet or positions', async () => {
  const service = new DeltaEntries();
  const ex = exchange();
  for (const symbol of ['BTCUSD','ETHUSD','SOLUSD','OPUSD','XRPUSD']) {
    const result = await service.submit('user', { ...entry, symbol }, ex.request);
    if (symbol === 'XRPUSD') assert.equal(result.capacity, true);
    else assert.ok(result.order.id);
  }
  assert.equal(ex.placed.length, 4);
  assert.equal(ex.placed[0].size, 99);
  assert.equal(ex.placed[0].bracket_stop_loss_price, '90');
});

test('existing positions, concurrent requests, pending exposure and minimum size', async () => {
  const service = new DeltaEntries();
  const same = exchange();
  await Promise.all([1,2].map(() => service.submit('u', entry, same.request)));
  assert.equal(same.placed.length, 1);
  for (const opts of [{ available: 99 }, { contractValue: 20 },
    { positions: [{ size: 1, product_symbol: 'BTCUSD' }] },
    { pending: [{ product_symbol: 'BTCUSD', reduce_only: false }] }]) {
    const ex = exchange(opts);
    assert.ok((await service.submit('other', entry, ex.request)).skipped);
    assert.equal(ex.placed.length, 0);
  }
  const ex = exchange({ positions: [{ size: -1, product_symbol: 'SOLUSD' }] });
  assert.ok((await service.submit('other', { ...entry, maxTrades: 1 }, ex.request)).capacity);
});