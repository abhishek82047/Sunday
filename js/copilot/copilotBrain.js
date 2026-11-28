/**
 * Conversational AI Co-Pilot Brain (SUNDAY)
 * Natural, empathetic, context-aware reasoning engine in conversational Hinglish & English.
 * Talks like a real, smart female trading partner — not a rigid robotic menu.
 */
const ASSET_ALIASES = {
  'ava': 'AVAX',
  'avax': 'AVAX',
  'avalanche': 'AVAX',
  'eth': 'ETH',
  'ether': 'ETH',
  'ethereum': 'ETH',
  'sol': 'SOL',
  'solana': 'SOL',
  'doge': 'DOGE',
  'dogecoin': 'DOGE',
  'near': 'NEAR',
  'link': 'LINK',
  'chainlink': 'LINK',
  'sui': 'SUI',
  'xrp': 'XRP',
  'ripple': 'XRP',
  'ada': 'ADA',
  'cardano': 'ADA',
  'btc': 'BTC',
  'bitcoin': 'BTC',
};

export class CopilotBrain {
  constructor() {
    this.history = [];
    this.currentContext = null;
    this.watchlistRadar = [];
  }

  updateWatchlistRadar(radarList) {
    this.watchlistRadar = Array.isArray(radarList) ? radarList : [];
  }

  getAutoPilotConfig() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('monday_autopilot_settings');
        if (raw) {
          const s = JSON.parse(raw);
          return {
            marginUSD: Math.max(5, Math.min(500, parseFloat(s.marginUSD) || 20)),
            leverage: Math.max(1, Math.min(50, parseInt(s.leverage, 10) || 20)),
            minRR: Math.max(1.5, Math.min(5.0, parseFloat(s.minRR) || 2.0)),
            maxTrades: Math.max(1, Math.min(100, parseInt(s.maxTrades, 10) || 2))
          };
        }
      }
    } catch (e) {}
    return { marginUSD: 20, leverage: 20, minRR: 2.0, maxTrades: 2 };
  }

  formatPrice(p, currencySymbol = null) {
    const symbol = currencySymbol !== null ? currencySymbol : (this.currentContext?.market === 'India' ? '₹' : '$');
    if (p === undefined || p === null || isNaN(p)) return `${symbol}0.00`;
    const num = Number(p);
    const locale = this.currentContext?.market === 'India' ? 'en-IN' : 'en-US';
    if (num >= 1000) return `${symbol}${num.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (num >= 1) return `${symbol}${num.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: (this.currentContext?.market === 'India' ? 2 : 4) })}`;
    if (num >= 0.01) return `${symbol}${num.toFixed(6)}`;
    return `${symbol}${num.toFixed(8)}`;
  }

  updateContext({
    targetAsset,
    currentPrice,
    strategyState,
    historicalContext,
    eventRisk,
    riskParams,
    openPositions,
    analytics,
    market = 'Crypto'
  }) {
    this.currentContext = {
      targetAsset,
      currentPrice,
      strategyState,
      historicalContext,
      eventRisk,
      riskParams,
      openPositions,
      analytics,
      market,
      updatedAt: Date.now()
    };
  }

  /**
   * Generates a market briefing for state transitions
   */
  generateMarketBriefing() {
    if (!this.currentContext || !this.currentContext.strategyState) {
      return "Market data load ho raha hai. Thoda wait karein...";
    }

    const { targetAsset, currentPrice, strategyState, historicalContext, eventRisk, riskParams } = this.currentContext;
    const state = strategyState.state;
    const direction = strategyState.direction;
    const htf = strategyState.htfTrend?.direction || 'UNCLEAR';
    const fmtPrice = this.formatPrice(currentPrice);

    if (state === 'CONFIRMED') {
      const confScore = Math.round(strategyState.confluenceScore || 85);
      const confGrade = strategyState.confluenceGrade || 'GRADE A';
      const rsiStr = strategyState.rsi1H ? `1H RSI: ${strategyState.rsi1H}` : 'RSI Aligned';
      const volStr = strategyState.volumeFlow?.desc || 'Volume Absorption Confirmed';
      const apCfg = this.getAutoPilotConfig();
      const marginTxt = `$${apCfg.marginUSD.toFixed(2)}`;
      return `🟢 **${targetAsset} SETUP CONFIRMED (${direction})**\n\n` +
        `• **Edge:** ${confGrade} (${confScore}% Confluence)\n` +
        `• **Institutional Edge:** ${rsiStr} • ${volStr}\n` +
        `• **Execution Blueprint:** Entry: ${this.formatPrice(riskParams?.entry)} | SL: ${this.formatPrice(riskParams?.stopLoss)} | TP: ${this.formatPrice(riskParams?.target)}\n` +
        `• **Asymmetric Edge:** Strict 1:${riskParams?.rrRatio || apCfg.minRR.toFixed(1)} RR • Configured Margin: ${marginTxt}\n` +
        `Order Desk me levels load ho chuke hain ya direct blueprint se execute kar sakte ho!`;
    } else if (state === 'DEVELOPING') {
      const zLow = strategyState.ltfStructure?.zoneLow ? this.formatPrice(strategyState.ltfStructure.zoneLow) : '--';
      const zHigh = strategyState.ltfStructure?.zoneHigh ? this.formatPrice(strategyState.ltfStructure.zoneHigh) : '--';
      const confScore = Math.round(strategyState.confluenceScore || 50);
      return `🟠 **${targetAsset} Reaction Zone Me Enter Hua (Developing)**\n\n` +
        `• **Reaction Zone:** ${zLow} - ${zHigh}\n` +
        `• **Confluence Meter:** ${confScore}% (Awaiting 75%+ confirmation)\n` +
        `• Pinned radar card active ho gaya hai. Abhi confirmation candle close hone ka wait karein!`;
    } else if (state === 'WAIT') {
      return `🟡 **${targetAsset} WAIT State**\n\n` +
        `Live price ${fmtPrice} par hai. Trend ${htf} hai lekin required 5M pullback abhi pending hai. Patience ke saath wait karte hain.`;
    } else if (state === 'CANCELLED') {
      return `🔴 **${targetAsset} Setup Cancelled / Invalidated**\n\n` +
        `Key invalidation level break ho chuka hai. Pinned card unpin ho gaya hai. Fresh liquidity aur structure ka wait karenge.`;
    }
    return `⚪ **${targetAsset} Observing Mode**\nAbhi koi high-probability edge nahi hai.`;
  }

  /**
   * Cleans text for robust natural language matching
   */
  normalizeInput(str) {
    return str
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async processQuery(userInput, account = {}) {
    const text = this.normalizeInput(userInput);
    const ctx = this.currentContext || {};
    const radar = this.watchlistRadar || [];
    const positions = account.positions ?? ctx.openPositions;
    const symbols = new Set([ctx.targetAsset, ...radar.map(r => r.asset),
      ...(positions || []).map(p => p.asset), ...(account.symbols || [])].filter(Boolean));
    const words = text.split(' ');
    const named = words.map(w => Object.hasOwn(ASSET_ALIASES, w) ? ASSET_ALIASES[w] :
      (symbols.has(w.toUpperCase()) && (!['a','on','near','go','us','op','me'].includes(w) ||
        userInput.split(/[^A-Za-z0-9]+/).includes(w.toUpperCase()) || words.length === 1) ? w.toUpperCase() : null)).filter(Boolean);
    const followUp = /^(and |aur |uska |iska |what about |what is its |its )/.test(text);
    const asset = named[0] || (followUp && this.lastQueryAsset) || ctx.targetAsset;
    if (asset) this.lastQueryAsset = asset;
    const snapshot = radar.find(r => r.asset === asset);
    const selected = asset && asset === ctx.targetAsset;
    const strategy = selected ? ctx.strategyState : snapshot?.strategyResult;
    const levels = (selected && ctx.riskParams) || strategy?.levels || {};
    const price = account.priceFor?.(asset) || (selected ? ctx.currentPrice : snapshot?.currentPrice);
    const trend = strategy?.htfTrend?.direction || snapshot?.htfTrend;
    const metrics = strategy?.externalTelemetry || {};
    const money = value => Number(value).toLocaleString('en-US', {style:'currency', currency:'USD'});
    const quote = value => Number(value) > 0 ? this.formatPrice(value) : 'unavailable';
    const label = asset || 'Selected asset';
    const lines = [];
    const explain = /\b(what is|what does|meaning|matlab|kya hota|explain)\b/.test(text);
    const setupQuestion = /\b(setups?|entries|entry|buy|sell|trade lu|trade karein|kya karu|wait|confirmation|high probability)\b/.test(text);
    if (/\b(who are you|naam kya|full ?form|kaun ho|sunday kya hai)\b/.test(text)) {
      lines.push('SUNDAY stands for Strategic Unified Neural Decision Assistant for You. I explain crypto signals and your paper-trading account.');
    } else if (/\b(reversals?|reversal exits?)\b/.test(text)) {
      const recent = (account.trades || []).filter(t => t.exitReason === 'REVERSAL_EXIT' &&
        (!named.length || named.includes(t.asset))).sort((a,b) => b.closedAt - a.closedAt)[0];
      lines.push('Auto-Pilot checks for a closed 5-minute candle beyond the pre-entry support or resistance and confirms with a fresh price.');
      if (recent) lines.push('Latest reversal exit: ' + recent.asset + ' ' + recent.direction + ' at ' +
        quote(recent.exitPrice) + ' on ' + new Date(recent.closedAt).toLocaleString() + '. Net PnL ' + money(recent.pnlUSD) + '.');
      else lines.push('No matching reversal exit in the loaded ledger.');
    } else if (/\bsignals?\b/.test(text) && !explain) {
      const rows = (account.signals || []).filter(s => !named.length || named.includes(s.asset));
      const active = rows.filter(s => s.status === 'ACTIVE');
      const pending = rows.filter(s => s.status === 'PENDING');
      lines.push(active.length + ' active signals, ' + pending.length + ' pending.');
      for (const s of [...active, ...pending].slice(0, 5)) lines.push(s.asset + ' ' + s.direction +
        ' (' + s.status + ') at ' + quote(s.entryPrice) + ', SL ' + quote(s.stopLossPrice) + ', TP ' + quote(s.takeProfitPrice));
      if (account.maxTrades && positions) lines.push('Paper positions: ' + positions.length + ' / ' + account.maxTrades + '.');
    } else if (/\b(positions?|active trades?|trade limit|open trades?|open risk|liquidation distance)\b/.test(text) && !text.includes('position size')) {
      if (positions && account.maxTrades) lines.push('Paper position slots used: ' + positions.length + ' / ' + account.maxTrades + '.');
      const rows = positions?.filter(p => !named.length || named.includes(p.asset));
      if (!rows) lines.push('Your positions have not loaded yet.');
      else if (!rows.length) lines.push('No open paper positions' + (named.length ? ' for ' + named.join(', ') : '') + '.');
      else {
        lines.push('**Open paper positions (' + rows.length + ')**');
        for (const p of rows) {
          const mark = Number(p.currentPrice), liq = Number(p.liquidationPrice);
          const distance = mark > 0 && liq > 0 ? (100 * Math.abs(mark-liq)/mark).toFixed(2) + '%' : 'unavailable';
          lines.push(p.asset + ' ' + p.direction + ' • Entry ' + quote(p.entry) + ' • Mark ' + quote(mark) + ' • Liquidation distance ' + distance);
        }
      }
    } else if (/\b(pnl|p l|profit|loss|kamaya)\b/.test(text) && !/\b(stop|risk|target|kitna hoga)\b/.test(text)) {
      const today = /\b(today|aaj|aj)\b/.test(text);
      const rows = account.trades?.filter(t => t.status === 'CLOSED' && (!named.length || named.includes(t.asset)) &&
        (!today || new Date(t.closedAt).toDateString() === new Date().toDateString()));
      lines.push(rows ? (today ? 'Today' : 'All time') + (named.length ? ' • ' + named.join(', ') : '') +
        ': realized paper PnL **' + money(rows.reduce((n,t) => n + (Number(t.pnlUSD)||0),0)) + '** across ' + rows.length + ' closed trades.' : 'The closed-trade ledger is unavailable.');
    } else if (/\b(balance|wallet)\b/.test(text)) {
      lines.push(Number.isFinite(account.balance) ? 'Your settled paper balance is **' + money(account.balance) + '**. Open-position PnL is separate.' : 'Your paper balance has not loaded yet.');
    } else if (/\b(watchlist|all coins|market overview|high probability setups|saare coins)\b/.test(text) && !named.length) {
      const ready = radar.filter(r => r.state === 'CONFIRMED');
      lines.push(!radar.length ? 'The watchlist scan has not returned results yet.' :
        '**Latest scan:** ' + ready.length + ' confirmed out of ' + radar.length + ' scanned. ' +
        ready.map(r => r.asset + ' (' + (r.proposedDir || r.state) + ')').join(', '));
    } else if (/pichli baar|historical pattern|last similar setup/.test(text)) {
      const past = selected && ctx.historicalContext;
      lines.push(past ? label + ' • ' + past.patternName + ': ' + past.sampleSize + ' similar setups, ' + past.historicalWinRate + '% historical win rate. The scanner does not provide the last occurrence time.' : 'Historical pattern data is unavailable for this coin.');
    } else if (/reject ho|setup fails|invalidation/.test(text)) {
      lines.push(label + ': agar confirmation fail ho, setup ko dobara evaluate karo. Auto-Pilot confirmed 5-minute reversal par early exit bhi check karta hai. Current setup SL: ' + quote(levels.stopLoss) + '.');
    } else if (named.length > 1 && /compare|difference|versus|vs/.test(text)) {
      for (const sym of new Set(named)) {
        const row = radar.find(r => r.asset === sym);
        lines.push(sym + ' • Price ' + quote(account.priceFor?.(sym) || row?.currentPrice || (sym === ctx.targetAsset && ctx.currentPrice)) + ' • 1H bias: ' + ((sym === ctx.targetAsset && ctx.strategyState?.htfTrend?.direction) || row?.htfTrend || 'unavailable'));
      }
    } else if (/risk simple|explain risk|risk samjhao/.test(text)) {
      lines.push('Paper trade ka planned risk = entry aur stop loss ka price difference × position size. Fees aur actual exit price final PnL ko affect karte hain. ' + label + ' setup: entry ' + quote(levels.entry) + ', SL ' + quote(levels.stopLoss) + '.');
    } else if (/\b(what is r|r kya|r multiple|r ka matlab)\b/.test(text)) {
      lines.push('1R is the planned risk on a trade. If the planned loss is $20 and the trade earns $60, the result is +3R.');
    } else {
      if (/\b(price|rate|bhav|bhaav|quote)\b/.test(text) && !text.includes('funding')) {
        for (const sym of named.length ? new Set(named) : [asset]) {
          const value = account.priceFor?.(sym) || (sym === asset ? price : radar.find(r => r.asset === sym)?.currentPrice);
          lines.push((sym || label) + ' • Latest price: **' + quote(value) + '**.');
        }
      }
      if (/\b(trend|bias|direction|regime|market me kya ho raha hai|market kaisa|kya lagta)\b/.test(text) && !text.includes('funding')) lines.push(label + ' • 1H bias: **' + (trend || 'unavailable') + '**.');
      if (text.includes('rsi')) {
        if (explain) lines.push('RSI measures recent price momentum on a 0–100 scale.');
        lines.push(label + ' RSI • 1H: ' + (strategy?.rsi1H ?? 'unavailable') + ' • 5M: ' + (strategy?.rsi5M ?? 'unavailable'));
      }
      if (text.includes('funding')) {
        if (explain) lines.push('Funding is a periodic payment between long and short perpetual positions.');
        lines.push(label + ' • Latest funding: ' + (metrics.fundingData?.rateFormatted ?? 'unavailable') + '.' + (text.includes('trend') ? ' A single reading cannot establish a trend.' : ''));
      }
      if (/\b(volume|whale)\b/.test(text)) lines.push(label + ' • Volume: ' + (strategy?.volumeFlow?.desc || 'unavailable'));
      if (/\b(sentiment|fear|greed)\b/.test(text)) lines.push('Market sentiment: ' + (metrics.sentiment?.classification || 'unavailable'));
      if (/\b(news|macro|cpi|event|fomc)\b/.test(text)) lines.push(ctx.eventRisk?.summary || 'No macro report is loaded.');
      if (/\b(smt|divergence)\b/.test(text)) lines.push('SMT divergence means correlated assets disagree at a swing high or low. SUNDAY checks this alongside trend and entry confirmation.');
      if (setupQuestion || /\b(risk|sl|tp|target|stop loss|position size)\b/.test(text)) {
        lines.push(label + ' • Setup: **' + (strategy?.state || snapshot?.state || 'unavailable') + '**.');
        if (strategy?.missingConditions?.length) lines.push('Waiting for: ' + strategy.missingConditions.join(' '));
        lines.push('Setup levels • Entry ' + quote(levels.entry) + ' • SL ' + quote(levels.stopLoss) + ' • Target ' + quote(levels.target));
      }
      if (!lines.length && named.length) lines.push(label + ' • Price ' + quote(price) + ' • 1H bias ' + (trend || 'unavailable') + ' • Setup ' + (strategy?.state || 'unavailable'));
      if (!lines.length) lines.push(/^(hi|hey|hello|namaste|kaise ho)$/.test(text) ? 'Namaste! Which coin or paper trade would you like to check?' :
        'Could you clarify what you want to check? I can read coin prices, trend, RSI, setup levels, open positions and realized PnL from this terminal.');
    }
    const response = lines.join('\n');
    this.history.push({ sender: 'user', text: userInput, timestamp: Date.now() }, { sender: 'copilot', text: response, timestamp: Date.now() });
    return response;
  }
}
