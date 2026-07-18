const { enrichClaims } = require('./claim-classifier');
const { getCamps } = require('./camp-stats');
const UPSTREAM = 'https://skrclaims.th3ryks.dev/api/state';

async function getLiveState() {
  let response;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(UPSTREAM, {
        headers: { accept: 'application/json', 'user-agent': 'SeekerSummerLive/2.0' },
        signal: AbortSignal.timeout(10000)
      });
      if (response.ok) break;
      lastError = new Error(`Upstream ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  if (!response?.ok) throw lastError || new Error('Live claim source unavailable');
  const data = await response.json();
  const claims = Array.isArray(data.claims) ? data.claims.slice(0, 80).map(c => ({
    signature: String(c.signature || ''),
    claimer: String(c.claimer || ''),
    domain: c.domain ? String(c.domain) : null,
    amount: Number(c.amount || 0),
    blockTime: Number(c.blockTime || 0),
    solscan: /^https:\/\/solscan\.io\/tx\//.test(c.solscan || '')
      ? c.solscan
      : `https://solscan.io/tx/${encodeURIComponent(c.signature || '')}`
  })) : [];

  return {
    vault: String(data.vault || ''), mint: String(data.mint || ''),
    total: Number(data.total || 0), remaining: Number(data.remaining || 0),
    claimed: Number(data.claimed || 0), claimCount: Number(data.claimCount || 0),
    percent: Number(data.percent || 0),
    claims: await enrichClaims(claims, 32, 5),
    camps: getCamps()
  };
}

module.exports = { getLiveState };
