const venues = ['website', 'delta', 'both'];
export function permitsVenue(target, venue) {
  return ['website', 'delta'].includes(venue) && (target === venue || target === 'both');
}

export async function readTarget(url, headers, user) {
  const id = encodeURIComponent('AP_TARGET_' + user);
  const res = await fetch(url + '/rest/v1/paper_trades?id=eq.' + id +
    '&user_id=eq.' + encodeURIComponent(user) + '&select=strategy', { headers, cache: 'no-store' });
  if (!res.ok) throw new Error('Auto-Pilot destination could not be verified');
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('Invalid Auto-Pilot destination response');
  if (!rows.length) return null;
  if (!venues.includes(rows[0].strategy)) throw new Error('Invalid saved Auto-Pilot destination');
  return rows[0].strategy;
}

export async function writeTarget(url, headers, user, target, initialize = false) {
  if (!venues.includes(target)) throw new Error('Invalid Auto-Pilot destination');
  const res = await fetch(url + '/rest/v1/paper_trades', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json',
      Prefer: 'resolution=' + (initialize ? 'ignore' : 'merge') + '-duplicates' },
    body: JSON.stringify({ id: 'AP_TARGET_' + user, user_id: user, asset: 'SETTINGS',
      direction: 'CONFIG', status: 'CONFIG', strategy: target, entry_price: 0, stop_loss: 0, target_price: 0 })
  });
  if (!res.ok) throw new Error('Auto-Pilot destination could not be saved');
}
