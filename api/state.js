const UPSTREAM = 'https://skrclaims.th3ryks.dev/api/state';
const RPC = 'https://solana-rpc.publicnode.com';
const STAKE_PROGRAM = 'SKRskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ';
const stakeCache = globalThis.__seekerStakeCache || new Map();
globalThis.__seekerStakeCache = stakeCache;

function transactionStaked(tx) {
  const logs = tx?.meta?.logMessages || [];
  return logs.some(line => line.includes('Instruction: Stake')) &&
    logs.some(line => line.includes(STAKE_PROGRAM));
}

async function enrichStakeStatus(claims) {
  const missing = claims.filter(c => c.signature && !stakeCache.has(c.signature)).slice(0, 28);
  if (missing.length) {
    try {
      await Promise.allSettled(missing.map(async claim => {
        const response = await fetch(RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'getTransaction',
            params: [claim.signature, { encoding: 'base64', maxSupportedTransactionVersion: 0 }]
          }),
          signal: AbortSignal.timeout(7000)
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.result) stakeCache.set(claim.signature, transactionStaked(payload.result));
      }));
    } catch (error) {
      console.warn('Stake classification unavailable:', error.message);
    }
  }

  if (stakeCache.size > 800) {
    const oldest = [...stakeCache.keys()].slice(0, stakeCache.size - 600);
    oldest.forEach(key => stakeCache.delete(key));
  }
  return claims.map(c => ({ ...c, staked: stakeCache.has(c.signature) ? stakeCache.get(c.signature) : null }));
}

async function getState() {
  const response = await fetch(UPSTREAM, {
      headers: { Accept: 'application/json', 'User-Agent': 'SeekerSummerLive/2.0' },
      signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Upstream ${response.status}`);
  const data = await response.json();
  const rawClaims = Array.isArray(data.claims) ? data.claims.slice(0, 36).map(c => ({
      signature: String(c.signature || ''),
      claimer: String(c.claimer || ''),
      domain: c.domain ? String(c.domain) : null,
      amount: Number(c.amount || 0),
      blockTime: Number(c.blockTime || 0),
      solscan: /^https:\/\/solscan\.io\/tx\//.test(c.solscan || '')
        ? c.solscan
        : `https://solscan.io/tx/${encodeURIComponent(c.signature || '')}`
  })) : [];
  const claims = await enrichStakeStatus(rawClaims);
  return {
    vault: String(data.vault || ''), mint: String(data.mint || ''), total: Number(data.total || 0),
    remaining: Number(data.remaining || 0), claimed: Number(data.claimed || 0),
    claimCount: Number(data.claimCount || 0), percent: Number(data.percent || 0), claims
  };
}

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const safe = await getState();
    res.setHeader('Cache-Control', 's-maxage=2, stale-while-revalidate=6');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).json(safe);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Live claim source unavailable', detail: error.message });
  }
}

module.exports = handler;
module.exports.getState = getState;
