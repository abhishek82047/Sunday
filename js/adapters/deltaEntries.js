import { createHash } from 'node:crypto';

export class DeltaEntries {
  busy = new Set();
  reservations = new Map();

  async submit(user, input, request) {
    if (this.busy.has(user)) return { skipped: 'Another entry is settling' };
    this.busy.add(user);
    try {
      return await this.place(user, input, request);
    } finally {
      this.busy.delete(user);
    }
  }

  async place(user, input, request) {
    const { symbol, direction, leverage, maxTrades, margin, entry, stop, target } = input;
    if (!/^[A-Z0-9]+USD$/.test(symbol) || !['LONG', 'SHORT'].includes(direction) ||
        !Number.isInteger(maxTrades) || maxTrades < 1 || maxTrades > 100 ||
        !Number.isInteger(leverage) || leverage < 1 || leverage > 200 ||
        ![margin, entry, stop, target].every(v => Number.isFinite(v) && v > 0) || margin > 10000) {
      throw new Error('Invalid Delta Auto-Pilot settings or entry levels');
    }
    const long = direction === 'LONG';
    if (!(long ? stop < entry && entry < target : target < entry && entry < stop)) throw new Error('Invalid bracket');
    const [positions, orders, wallet] = await Promise.all([
      request('GET', '/v2/positions/margined'),
      request('GET', '/v2/orders?states=open,pending&page_size=100'),
      request('GET', '/v2/wallet/balances')
    ]);
    if (![positions, orders, wallet].every(r => Array.isArray(r?.result))) throw new Error('Incomplete Delta account snapshot');
    if (orders.meta?.after) return { skipped: 'Open order snapshot incomplete', capacity: true };
    const occupied = new Set(positions.result.filter(p => Number(p.size) !== 0).map(p => p.product_symbol));
    for (const order of orders.result) {
      if (!order.reduce_only && !order.bracket_order && !order.bracket_order_id) occupied.add(order.product_symbol);
    }
    let reserved = 0;
    for (const [key, hold] of this.reservations) {
      if (hold.until < Date.now()) { this.reservations.delete(key); continue; }
      if (hold.user !== user || occupied.has(hold.symbol)) continue;
      reserved += hold.margin;
      occupied.add(hold.symbol);
    }
    if (occupied.size >= maxTrades) return { skipped: 'Delta position limit reached', capacity: true };
    if (occupied.has(symbol)) return { skipped: 'Existing Delta exposure' };
    const available = Number(wallet.result.find(w => w.asset_symbol === 'USD')?.available_balance);
    if (!(available - reserved >= margin)) return { skipped: 'Insufficient available USD margin', capacity: true };

    const [metadata, quote] = await Promise.all([
      request('GET', '/v2/products/' + symbol), request('GET', '/v2/tickers/' + symbol)
    ]);
    const product = metadata.result;
    if (product?.settling_asset?.symbol !== 'USD' || product.notional_type !== 'vanilla' || product.state !== 'live') {
      return { skipped: 'Unsupported Delta contract' };
    }
    const price = Number(long ? quote.result?.quotes?.best_ask : quote.result?.quotes?.best_bid);
    const unit = Number(product.contract_value);
    const tick = Number(product.tick_size);
    const commission = Number(product.taker_commission_rate);
    if (!(price > 0 && unit > 0 && tick > 0 && commission >= 0)) return { skipped: 'Missing executable quote or contract specification' };
    const align = v => Number((Math.round(v / tick) * tick).toPrecision(12));
    const sl = align(stop), tp = align(target);
    if (!(long ? sl < price && price <= entry && price < tp : tp < price && price >= entry && price < sl)) {
      return { skipped: 'Delta quote outside entry zone' };
    }
    const size = Math.floor(margin / (price * unit * (1 / leverage + commission * 1.18)));
    if (!Number.isSafeInteger(size) || size < 1) return { skipped: 'Margin below one contract' };
    const id = 'ap' + createHash('sha256').update(JSON.stringify([user, symbol, direction, entry, sl, tp])).digest('hex').slice(0, 26);
    await request('POST', '/v2/products/' + product.id + '/orders/leverage', { leverage: String(leverage) });
    // A delayed response or a timeout can follow an accepted market order.
    this.reservations.set(user + ':' + symbol, { user, symbol, margin, until: Date.now() + 60000 });
    const placed = await request('POST', '/v2/orders', { client_order_id: id, product_id: product.id,
      side: long ? 'buy' : 'sell', size, order_type: 'market_order',
      bracket_stop_loss_price: String(sl), bracket_take_profit_price: String(tp) });
    if (!placed.result?.id) throw new Error('Delta order acknowledgement unavailable');
    return { order: placed.result, usedSlots: occupied.size + 1 };
  }
}
