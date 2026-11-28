/**
 * Per-User Delta Exchange India Adapter
 * Stores each user's API credentials & settings in Supabase `user_settings` (RLS isolated),
 * and executes live Delta India requests via the Render daemon using the user's Supabase JWT.
 */

const DEFAULT_DAEMON_URL = 'https://sunday-3uwi.onrender.com';

export class DeltaIndiaAdapter {
  constructor() {
    this.daemonUrl = localStorage.getItem('sunday_delta_backend_url') || DEFAULT_DAEMON_URL;
  }

  getClient() {
    const auth = window.app?.auth;
    if (auth?.supabaseClient) return auth.supabaseClient;
    if (window.supabase && window.MONDAY_SUPABASE_CONFIG) {
      return window.supabase.createClient(
        window.MONDAY_SUPABASE_CONFIG.url,
        window.MONDAY_SUPABASE_CONFIG.anonKey
      );
    }
    return null;
  }

  async getSessionContext() {
    const client = this.getClient();
    if (!client) throw new Error('Supabase client not initialized.');
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session || !session.user) {
      throw new Error('Please sign in with Google first to manage per-user API settings.');
    }
    return {
      client,
      user: session.user,
      accessToken: session.access_token
    };
  }

  async loadSettings() {
    const { client, user } = await this.getSessionContext();
    const { data, error } = await client
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return { user, settings: data || null };
  }

  async saveSettings(payload) {
    const { client, user } = await this.getSessionContext();
    const row = {
      user_id: user.id,
      delta_api_key: (payload.delta_api_key || '').trim(),
      delta_api_secret: (payload.delta_api_secret || '').trim(),
      execution_mode: payload.execution_mode === 'delta_india' ? 'delta_india' : 'paper',
      risk_per_trade: Number(payload.risk_per_trade) || 2.0,
      default_leverage: Number(payload.default_leverage) || 5,
      default_order_size: Number(payload.default_order_size) || 1,
      autopilot_enabled: Boolean(payload.autopilot_enabled),
      news_shield_enabled: payload.news_shield_enabled !== false,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await client
      .from('user_settings')
      .upsert(row, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async callDaemon(endpoint, body = {}) {
    const { accessToken } = await this.getSessionContext();
    const res = await fetch(`${this.daemonUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(body)
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(json.error || `Request failed (${res.status})`);
    }
    return json;
  }

  async testConnection() {
    return this.callDaemon('/api/delta/test', {});
  }

  async getPositions() {
    return this.callDaemon('/api/delta/positions', {});
  }

  async placeOrder({ product_symbol, side, size, order_type = 'market_order', limit_price, stop_loss_price, take_profit_price }) {
    return this.callDaemon('/api/delta/order', {
      product_symbol,
      side,
      size: Number(size),
      order_type,
      limit_price,
      stop_loss_price,
      take_profit_price
    });
  }
}

window.deltaIndiaAdapter = new DeltaIndiaAdapter();
