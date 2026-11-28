// Coinbase OHLC rows contain bucket start (seconds), low, high, open and close.
const barSeconds = 300;

export function reversalConfirmation(position, rows, now, entryRows = rows) {
  const end = Math.floor(now / 1000 / barSeconds) * barSeconds;
  const entryEnd = Math.floor(position.openedAt / 300000) * barSeconds;
  const bars = new Map(entryRows.map(row => [Number(row[0]), row]));
  const recent = [3, 2, 1].map(offset => bars.get(entryEnd - offset * barSeconds));
  recent.push(rows.find(row => Number(row[0]) === end - barSeconds));
  if (recent.some(bar => !bar || !bar.slice(1, 5).every(v => Number.isFinite(Number(v)) && v > 0))) return null;
  const last = recent.pop();
  if (!(last[0] * 1000 >= position.openedAt)) return null;
  const long = position.direction === 'LONG';
  const level = long ? Math.min(...recent.map(b => b[1])) : Math.max(...recent.map(b => b[2]));
  const broken = long ? last[4] < level && last[4] < last[3] : last[4] > level && last[4] > last[3];
  if (!broken) return null;
  // A protective order touched in the confirmation bar has priority.
  if (long ? last[1] <= position.stopLoss || last[2] >= position.target
           : last[2] >= position.stopLoss || last[1] <= position.target) return null;
  return { level, confirmedAt: end * 1000 };
}

async function readMarket(product, endpoint) {
  const response = await fetch('https://api.exchange.coinbase.com/products/' + product + '/' + endpoint,
    { signal: AbortSignal.timeout(5000), cache: 'no-store' });
  if (!response.ok) throw new Error('Market data HTTP ' + response.status);
  return response.json();
}

export class ReversalMonitor {
  checked = new Map();
  entryBars = new Map();
  running = false;

  async review(trader, enabled, onClose) {
    if (this.running || !enabled()) return;
    this.running = true;
    try {
      const positions = [...trader.openPositions];
      const ids = new Set(positions.map(p => p.id));
      for (const id of this.checked.keys()) if (!ids.has(id)) this.checked.delete(id);
      for (const id of this.entryBars.keys()) if (!ids.has(id)) this.entryBars.delete(id);
      for (const pos of positions) {
        if (!enabled()) break;
        const bucket = Math.floor(Date.now() / 300000);
        if (pos.market === 'India' || this.checked.get(pos.id) === bucket) continue;
        const product = encodeURIComponent(pos.asset + '-USD');
        let confirmation, price;
        try {
          const rows = await readMarket(product, 'candles?granularity=300');
          const entryEnd = Math.floor(pos.openedAt / 300000) * barSeconds;
          if (!this.entryBars.has(pos.id)) {
            let history = rows;
            if (!rows.some(row => row[0] === entryEnd - 3 * barSeconds)) {
              const start = new Date((entryEnd - 3 * barSeconds) * 1000).toISOString();
              const end = new Date(entryEnd * 1000).toISOString();
              history = await readMarket(product, 'candles?granularity=300&start=' + start + '&end=' + end);
            }
            this.entryBars.set(pos.id, history.filter(row => row[0] >= entryEnd - 900 && row[0] < entryEnd));
          }
          confirmation = reversalConfirmation(pos, rows, Date.now(), this.entryBars.get(pos.id));
          if (confirmation) {
            const ticker = await readMarket(product, 'ticker');
            const age = Date.now() - Date.parse(ticker.time);
            if (!(age >= -5000 && age <= 60000)) continue;
            price = Number(ticker.price);
          }
        } catch { continue; }
        this.checked.set(pos.id, bucket);
        if (!confirmation || !enabled() || !trader.openPositions.some(p => p.id === pos.id)) continue;
        if (Date.now() - confirmation.confirmedAt >= 300000) continue;
        const long = pos.direction === 'LONG';
        const inside = long ? price > pos.stopLoss && price < pos.target && price < confirmation.level
                            : price < pos.stopLoss && price > pos.target && price > confirmation.level;
        if (!inside) continue;
        const closed = trader.closePosition(pos.id, 'REVERSAL_EXIT', price, Date.now(), confirmation);
        if (closed) await onClose(closed);
      }
    } finally {
      this.running = false;
    }
  }
}
